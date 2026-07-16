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
    const { age_group_id, domain_id } = await req.json();
    if (!age_group_id || !domain_id) throw new Error("age_group_id and domain_id are required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Fetch context: age group, domain, existing outcomes, learning areas
    const [ageRes, domainRes, existingRes, learningRes] = await Promise.all([
      supabase.from("age_groups").select("*").eq("id", age_group_id).single(),
      supabase.from("development_domains").select("*").eq("id", domain_id).single(),
      supabase.from("yearly_outcomes").select("outcome_code, outcome_title").eq("age_group_id", age_group_id).eq("domain_id", domain_id),
      supabase.from("learning_areas").select("code, name_en, name_ms").order("sort_order"),
    ]);

    const ageGroup = ageRes.data;
    const domain = domainRes.data;
    const existing = existingRes.data || [];
    const learningAreas = learningRes.data || [];

    const existingList = existing.length > 0
      ? `\n\nALREADY DEFINED OUTCOMES (do NOT duplicate these):\n${existing.map((o: any) => `- [${o.outcome_code}] ${o.outcome_title}`).join("\n")}`
      : "";

    const kspkContext = learningAreas.length > 0
      ? `\n\nKSPK/KP2026 LEARNING AREAS:\n${learningAreas.map((la: any) => `- ${la.code}: ${la.name_en || la.name_ms}`).join("\n")}`
      : "";

    const systemPrompt = `You are an early childhood curriculum architect with deep knowledge of KSPK/KP2026 Malaysian preschool standards and international early childhood frameworks (EYFS, HighScope, Reggio Emilia).

Generate 5-8 NEW yearly learning outcomes for:
- Age group: ${ageGroup?.label} (${ageGroup?.min_age_months}-${ageGroup?.max_age_months} months)
- Development domain: ${domain?.name} — ${domain?.description || ""}
${existingList}
${kspkContext}

Each outcome must be:
- Developmentally appropriate for this specific age
- Observable and measurable over a school year
- Aligned with the domain focus
- Unique (not duplicating existing outcomes)

Use outcome codes like: YO-${ageGroup?.code}-${domain?.code?.substring(0, 2) || "XX"}-NN

Generate ALL content in ENGLISH.`;

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
          { role: "user", content: `Suggest yearly outcomes for ${ageGroup?.label} in ${domain?.name}.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_outcomes",
            description: "Return suggested yearly outcomes",
            parameters: {
              type: "object",
              properties: {
                outcomes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      outcome_code: { type: "string" },
                      outcome_title: { type: "string" },
                      outcome_description: { type: "string" },
                      mastery_expectation: { type: "string" },
                    },
                    required: ["outcome_code", "outcome_title", "outcome_description", "mastery_expectation"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["outcomes"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_outcomes" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error: " + response.status);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const suggestions = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(suggestions), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("brainstorm-outcomes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
