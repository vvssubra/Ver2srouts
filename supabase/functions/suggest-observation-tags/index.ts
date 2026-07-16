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

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { notes, studentAge } = await req.json();
    if (!notes || typeof notes !== "string" || notes.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Please provide observation notes (min 5 characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all curriculum standards for context
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: standards, error: dbError } = await supabase
      .from("curriculum_standards")
      .select("code, title_ms, notes, level, learning_area_id, learning_areas(code, name_ms)")
      .order("code");

    if (dbError) throw dbError;

    // Build compact curriculum context
    const curriculumContext = (standards || [])
      .filter((s: any) => s.level === "sub_standard" || s.level === "standard")
      .map((s: any) => {
        const area = s.learning_areas?.code || "";
        const parts = [`${s.code}: ${s.title_ms}`];
        if (s.notes) parts.push(`(${s.notes})`);
        return parts.join(" ");
      })
      .join("\n");

    const systemPrompt = `You are a Malaysian preschool education expert specializing in the KP2026 (KSPK Semakan) curriculum framework.

Your task: Given a teacher's observation notes about a student, identify the most relevant curriculum standards and suggest appropriate proficiency levels.

CURRICULUM STANDARDS REFERENCE:
${curriculumContext}

PROFICIENCY LEVELS:
- TP1 (Belum Menguasai / Not Yet): Student has not yet demonstrated the skill
- TP2 (Menguasai / Achieved): Student demonstrates the skill adequately  
- TP3 (Melebihi / Exceeding): Student exceeds expectations for this skill

RULES:
- Suggest 1-3 best matching standards based on the observation
- Each suggestion must include the standard code, proficiency level, and a brief reason in Malay
- Only suggest standards that genuinely match the observation content
- Consider the student's age if provided${studentAge ? `\nStudent age: ${studentAge}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Observation notes: "${notes}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_observation_tags",
              description:
                "Return curriculum standard suggestions that match the teacher observation notes.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        standard_code: {
                          type: "string",
                          description: "The curriculum standard code e.g. SE 1.1.2",
                        },
                        confidence: {
                          type: "number",
                          description: "Confidence score 0-1",
                        },
                        proficiency: {
                          type: "string",
                          enum: ["TP1", "TP2", "TP3"],
                          description: "Suggested proficiency level",
                        },
                        reason: {
                          type: "string",
                          description: "Brief reason in Malay for this suggestion",
                        },
                      },
                      required: ["standard_code", "confidence", "proficiency", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "suggest_observation_tags" },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Enrich suggestions with standard IDs from database
    const enriched = (parsed.suggestions || []).map((s: any) => {
      const match = (standards || []).find(
        (std: any) => std.code.replace(/\s+/g, "") === s.standard_code.replace(/\s+/g, "")
      );
      return {
        ...s,
        standard_id: match?.code ? (standards || []).find((st: any) => st.code === match.code) : null,
      };
    });

    // Re-query to get IDs for matched codes
    const matchedCodes = enriched.map((e: any) => e.standard_code.replace(/\s+/g, ""));
    const { data: matchedStandards } = await supabase
      .from("curriculum_standards")
      .select("id, code, title_ms, title_en, learning_area_id, learning_areas(code, name_ms)")
      .in(
        "code",
        // Try both with and without spaces
        [...new Set([
          ...enriched.map((e: any) => e.standard_code),
          ...enriched.map((e: any) => e.standard_code.replace(/\s+/g, " ")),
        ])]
      );

    const finalSuggestions = (parsed.suggestions || []).map((s: any) => {
      const dbMatch = (matchedStandards || []).find(
        (ms: any) => ms.code.replace(/\s+/g, "") === s.standard_code.replace(/\s+/g, "")
      );
      return {
        standard_code: s.standard_code,
        standard_id: dbMatch?.id || null,
        standard_title: dbMatch?.title_ms || null,
        standard_title_en: dbMatch?.title_en || null,
        learning_area: dbMatch?.learning_areas?.name_ms || null,
        learning_area_code: dbMatch?.learning_areas?.code || null,
        confidence: s.confidence,
        proficiency: s.proficiency,
        reason: s.reason,
      };
    });

    return new Response(JSON.stringify({ suggestions: finalSuggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-observation-tags error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
