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
    const { teacher_note, domain_name, indicator_text, child_name, activity_title } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a warm, encouraging early childhood educator writing updates for parents. 
Your job is to rewrite internal teacher observation notes into parent-friendly summaries.

Rules:
- Use warm, positive, simple language
- Focus on what the child explored, discovered, or enjoyed
- Mention the skill area naturally (don't use technical jargon)
- Keep it 2-3 sentences max
- Never include concerns, deficits, or negative language
- Use the child's name if provided
- Include a simple home extension idea as a final sentence starting with "At home, you could..."`;

    const userPrompt = `Rewrite this teacher observation into a parent-friendly summary:

Child: ${child_name || "the child"}
Activity: ${activity_title || "today's activity"}
Domain: ${domain_name || "general development"}
Indicator: ${indicator_text || ""}
Teacher Note: ${teacher_note}

Return a JSON object with "parent_summary" and "home_extension" fields.`;

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
            name: "format_parent_summary",
            description: "Format the parent-friendly summary",
            parameters: {
              type: "object",
              properties: {
                parent_summary: { type: "string", description: "Warm parent-friendly summary of the observation" },
                home_extension: { type: "string", description: "Simple home activity suggestion" },
              },
              required: ["parent_summary", "home_extension"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "format_parent_summary" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall ? JSON.parse(toolCall.function.arguments) : { parent_summary: "", home_extension: "" };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-parent-summary error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
