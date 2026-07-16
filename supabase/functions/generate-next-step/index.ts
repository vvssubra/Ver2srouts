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
    const { evidence_notes, indicator_text, domain_name, status, age_group, child_name } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an early childhood education specialist. Given observation evidence about a child, suggest practical next teaching steps.

Rules:
- Suggest 2-3 actionable next steps
- Each step should be specific and classroom-ready
- Consider the child's current status (not_yet, emerging, consistent)
- Match suggestions to the age group
- Focus on scaffolding and progression
- Include both individual and small-group activity ideas`;

    const userPrompt = `Child: ${child_name || "Student"}
Age group: ${age_group || "4"}
Domain: ${domain_name || "General"}
Indicator: ${indicator_text || ""}
Current status: ${status || "emerging"}
Evidence: ${evidence_notes || "No detailed notes"}

Suggest next teaching steps.`;

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
            name: "suggest_next_steps",
            description: "Suggest next teaching steps",
            parameters: {
              type: "object",
              properties: {
                next_steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "string" },
                      activity_type: { type: "string", enum: ["individual", "small_group", "whole_class"] },
                      materials: { type: "string" },
                    },
                    required: ["step", "activity_type"],
                    additionalProperties: false,
                  },
                },
                summary: { type: "string" },
              },
              required: ["next_steps", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_next_steps" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall ? JSON.parse(toolCall.function.arguments) : { next_steps: [], summary: "" };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-next-step error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
