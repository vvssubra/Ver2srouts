import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { messages, planContext } = await req.json();

    // Fetch curriculum context if plan has standard codes
    let curriculumInfo = "";
    if (planContext?.standard_codes?.length > 0) {
      const codes = planContext.standard_codes;
      const { data: standards } = await supabase
        .from("curriculum_standards")
        .select("code, title_ms, notes, level")
        .in("code", codes);
      if (standards?.length) {
        curriculumInfo = "\n\nRelevant curriculum standards:\n" +
          standards.map((s: any) => `- [${s.code}] ${s.title_ms}${s.notes ? ` (${s.notes})` : ""}`).join("\n");
      }
    }

    const systemPrompt = `You are an expert Malaysian preschool curriculum assistant helping teachers refine lesson plans aligned with KSPK and KP2026 standards.

You are helping refine a lesson plan with these details:
- Title: ${planContext?.title || "Untitled"}
- Theme: ${planContext?.theme || "General"}
- Age Group: ${planContext?.ageGroup || "5+"}
- Duration: ${planContext?.duration || "1 week"}
${curriculumInfo}

Current plan summary:
${planContext?.planSummary || "No plan loaded yet."}

Guidelines:
- Help teachers adjust activities, swap materials, or modify specific days
- Keep all suggestions aligned with Malaysian preschool curriculum standards
- Suggest culturally relevant, play-based activities
- Use both Bahasa Melayu and English naturally
- When suggesting changes, reference specific standard codes (e.g., BM 1.1.1, SE 2.1)
- Be encouraging and supportive of the teacher's ideas
- Keep responses concise and actionable`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("refine-lesson-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
