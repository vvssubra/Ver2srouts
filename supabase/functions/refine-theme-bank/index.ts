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
    const { theme_name, big_idea, key_vocabulary, key_concepts, weekly_focuses } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch development domains for alignment suggestions
    const { data: domains = [] } = await supabase
      .from("development_domains")
      .select("id, name, description")
      .order("sort_order");

    const domainList = (domains || []).map((d: any) => `- ${d.name}: ${d.description || ""}`).join("\n");

    const existingVocab = (key_vocabulary || []).join(", ");
    const existingConcepts = (key_concepts || []).join(", ");
    const existingFocuses = (weekly_focuses || [])
      .map((wf: any) => `W${wf.week_number}: ${wf.focus_title} — Questions: ${(wf.key_questions || []).join("; ")}`)
      .join("\n");

    const systemPrompt = `You are an early childhood curriculum expert. Refine and enhance a Theme Bank entry for a preschool monthly theme.

IMPORTANT: Generate ALL content in ENGLISH language.

Current theme:
- Name: ${theme_name}
- Big Idea: ${big_idea || "Not set"}
- Vocabulary: ${existingVocab || "Not set"}
- Concepts: ${existingConcepts || "Not set"}
- Weekly Focuses:
${existingFocuses || "Not set"}

DEVELOPMENT DOMAINS AVAILABLE:
${domainList}

Your task:
1. Refine the big_idea to be more compelling and child-centered
2. Expand key_vocabulary to 10-15 age-appropriate words
3. Expand key_concepts to 5-8 core concepts
4. For each of the 4 weekly focuses, provide an enhanced focus_title and 3-4 key_questions that spark inquiry
5. Suggest which development domains this theme naturally aligns with (1-4 domains)

Keep everything practical, developmental, and aligned with early childhood best practices.

Use the provided tool to return structured output.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Refine and enhance the theme "${theme_name}".` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_refined_theme",
              description: "Return the refined theme bank entry",
              parameters: {
                type: "object",
                properties: {
                  big_idea: { type: "string" },
                  key_vocabulary: { type: "array", items: { type: "string" } },
                  key_concepts: { type: "array", items: { type: "string" } },
                  weekly_focuses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week_number: { type: "integer" },
                        focus_title: { type: "string" },
                        key_questions: { type: "array", items: { type: "string" } },
                      },
                      required: ["week_number", "focus_title", "key_questions"],
                      additionalProperties: false,
                    },
                  },
                  suggested_domain_alignments: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-4 development domain names this theme naturally aligns with",
                  },
                },
                required: ["big_idea", "key_vocabulary", "key_concepts", "weekly_focuses", "suggested_domain_alignments"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_refined_theme" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + response.status);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const refined = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(refined), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refine-theme-bank error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
