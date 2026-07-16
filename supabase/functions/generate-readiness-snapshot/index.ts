import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;


  try {
    const { class_name, term, evidence_summary, student_count } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an early childhood curriculum specialist generating class readiness summaries for preschool leaders.

Analyze the evidence data and produce summaries for each domain: language, literacy, numeracy, motor, social, self-help.

Each domain summary should include:
- overall_status: one of "building", "growing", "confident"
- strength: what the class does well
- gap: where the class needs support
- recommendation: specific next focus area

Also provide a next_focus list of 3 priority areas.`;

    const userPrompt = `Class: ${class_name || "Class"}
Term: ${term || "Term 1"}
Students: ${student_count || 0}
Evidence Summary: ${JSON.stringify(evidence_summary || {})}

Generate readiness snapshot.`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_readiness_snapshot",
            description: "Create class readiness snapshot",
            parameters: {
              type: "object",
              properties: {
                language: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                literacy: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                numeracy: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                motor: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                social: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                self_help: { type: "object", properties: { overall_status: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, recommendation: { type: "string" } }, required: ["overall_status", "strength", "gap", "recommendation"] },
                next_focus: { type: "array", items: { type: "string" } },
              },
              required: ["language", "literacy", "numeracy", "motor", "social", "self_help", "next_focus"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_readiness_snapshot" } },
      }),
    });

    if (!response.ok) {
      const s = response.status;
      if (s === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (s === 402) return new Response(JSON.stringify({ error: "Credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${s}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall ? JSON.parse(toolCall.function.arguments) : {};

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-readiness-snapshot error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
