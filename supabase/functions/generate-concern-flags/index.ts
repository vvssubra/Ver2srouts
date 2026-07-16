import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;


  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { student_id } = await req.json();
    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id is required" }), { status: 400, headers: corsHeaders });
    }

    // Fetch student
    const { data: student } = await supabase
      .from("students")
      .select("first_name, last_name, date_of_birth, gender")
      .eq("id", student_id)
      .single();

    // Fetch observation evidence
    const { data: evidence } = await supabase
      .from("student_observation_evidence")
      .select("*, development_domains(name_en, code)")
      .eq("student_id", student_id)
      .order("observed_on", { ascending: false })
      .limit(100);

    // Fetch student_observations
    const { data: observations } = await supabase
      .from("student_observations")
      .select("*, curriculum_standards(code, title_ms, title_en, learning_area_id)")
      .eq("student_id", student_id)
      .order("observed_at", { ascending: false })
      .limit(100);

    const studentName = student ? `${student.first_name} ${student.last_name}` : "Student";

    const prompt = `You are a child development specialist analyzing observation patterns for a preschool student.

Student: ${studentName}
DOB: ${student?.date_of_birth || "Unknown"}

Recent observations (${observations?.length || 0} total):
${(observations || []).slice(0, 30).map((o: any) => 
  `- ${o.observed_at}: ${o.curriculum_standards?.title_en || "General"} = ${o.proficiency_level}${o.notes ? ` (${o.notes})` : ""}`
).join("\n")}

Evidence records (${evidence?.length || 0} total):
${(evidence || []).slice(0, 30).map((e: any) =>
  `- ${e.observed_on}: Domain=${e.development_domains?.name_en || "?"}, Status=${e.status}${e.evidence_note ? ` (${e.evidence_note})` : ""}`
).join("\n")}

Analyze for repeated patterns of concern. Look for:
1. Repeated speech/language difficulty
2. Repeated fine motor difficulty
3. Repeated transition distress
4. Repeated self-regulation difficulty
5. Consistently low proficiency in specific domains
6. Any other developmental concerns

Be specific and evidence-based. Only flag genuine concerns, not minor variations.
These flags are for TEACHER review only — not sent to parents.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a child development specialist. Analyze observation patterns and flag concerns." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_concern_flags",
              description: "Generate concern flags from observation patterns",
              parameters: {
                type: "object",
                properties: {
                  flags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", description: "e.g. Speech & Language, Fine Motor, Self-Regulation, Transition, Social-Emotional" },
                        severity: { type: "string", enum: ["low", "medium", "high"] },
                        description: { type: "string", description: "Brief evidence-based description" },
                        evidenceCount: { type: "number", description: "Number of observations supporting this flag" },
                        suggestedAction: { type: "string", description: "Recommended next step for teacher" },
                      },
                      required: ["category", "severity", "description", "evidenceCount", "suggestedAction"],
                    },
                  },
                  overallRiskLevel: { type: "string", enum: ["none", "low", "moderate", "elevated"] },
                  summary: { type: "string", description: "Brief overall summary" },
                },
                required: ["flags", "overallRiskLevel", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_concern_flags" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), { status: 500, headers: corsHeaders });
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Concern flags error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
