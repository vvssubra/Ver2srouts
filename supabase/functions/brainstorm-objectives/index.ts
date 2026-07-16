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
    const { age_group_id, domain_id, yearly_outcome_id } = await req.json();
    if (!age_group_id || !domain_id) throw new Error("age_group_id and domain_id are required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [ageRes, domainRes, existingRes, learningRes] = await Promise.all([
      supabase.from("age_groups").select("*").eq("id", age_group_id).single(),
      supabase.from("development_domains").select("*").eq("id", domain_id).single(),
      supabase.from("lesson_objectives").select("code, title").eq("age_group_id", age_group_id).eq("domain_id", domain_id).eq("is_active", true),
      supabase.from("learning_areas").select("code, name_en, name_ms").order("sort_order"),
    ]);

    const ageGroup = ageRes.data;
    const domain = domainRes.data;
    const existing = existingRes.data || [];
    const learningAreas = learningRes.data || [];

    let yearlyOutcomeCtx = "";
    if (yearly_outcome_id) {
      const { data: yo } = await supabase.from("yearly_outcomes").select("*").eq("id", yearly_outcome_id).single();
      if (yo) yearlyOutcomeCtx = `\n\nLINKED YEARLY OUTCOME:\n- [${yo.outcome_code}] ${yo.outcome_title}\n- ${yo.outcome_description || ""}\n- Mastery: ${yo.mastery_expectation || "Not specified"}`;
    }

    // Fetch teaching guides from resource library
    let guideContext = "";
    try {
      const { data: guides } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: null,
        p_resource_types: ["teaching_guide", "lesson_plan"],
        p_age_groups: [ageGroup?.code || "AGE5"],
        p_search_tags: [domain?.name?.toLowerCase() || ""],
        p_match_count: 5,
      });
      if (guides && guides.length > 0) {
        guideContext = `\n\nSCHOOL TEACHING GUIDES (reference these):\n${guides.map((g: any) => `- ${g.title}: ${g.content_text?.substring(0, 150) || g.subject}`).join("\n")}`;
      }
    } catch (e) {
      console.error("Guide search error:", e);
    }

    const existingList = existing.length > 0
      ? `\n\nEXISTING OBJECTIVES (do NOT duplicate):\n${existing.map((o: any) => `- [${o.code}] ${o.title}`).join("\n")}`
      : "";

    const kspkContext = learningAreas.length > 0
      ? `\n\nKSPK/KP2026 LEARNING AREAS:\n${learningAreas.map((la: any) => `- ${la.code}: ${la.name_en || la.name_ms}`).join("\n")}`
      : "";

    const systemPrompt = `You are an early childhood curriculum specialist. Generate 4-6 NEW lesson objectives for:
- Age group: ${ageGroup?.label} (${ageGroup?.min_age_months}-${ageGroup?.max_age_months} months)
- Domain: ${domain?.name} — ${domain?.description || ""}
 ${yearlyOutcomeCtx}
 ${existingList}
 ${kspkContext}
 ${guideContext}

Each objective must:
- Be specific, measurable, and classroom-actionable
- Include 2-3 observable indicators per objective
- Specify difficulty (easy/moderate/advanced), type (core/support/stretch), and Bloom's level
- Use codes like: OBJ-${ageGroup?.code}-${domain?.code?.substring(0, 2) || "XX"}-NN

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
          { role: "user", content: `Suggest lesson objectives for ${ageGroup?.label} in ${domain?.name}.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_objectives",
            description: "Return suggested lesson objectives with indicators",
            parameters: {
              type: "object",
              properties: {
                objectives: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      difficulty_level: { type: "string", enum: ["easy", "moderate", "advanced"] },
                      objective_type: { type: "string", enum: ["core", "support", "stretch"] },
                      bloom_level: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"] },
                      learning_area: { type: "string" },
                      indicators: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            indicator_text: { type: "string" },
                            evidence_type: { type: "string", enum: ["observation", "work_sample", "verbal", "photo", "checklist"] },
                          },
                          required: ["indicator_text", "evidence_type"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["code", "title", "description", "difficulty_level", "objective_type", "bloom_level", "indicators"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["objectives"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_objectives" } },
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
    console.error("brainstorm-objectives error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
