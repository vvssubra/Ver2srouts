import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireAuth } from "../_shared/auth.ts";
import { buildAssessmentContext, renderAssessmentContextBlock } from "../_shared/assessment-context.ts";

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
    const { month_number, month_name, age_group, theme_name, big_idea, weekly_focuses, theme_vocabulary, theme_concepts, branch_id, class_id } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch development domains
    const { data: domains = [] } = await supabase
      .from("development_domains")
      .select("id, name, description")
      .order("sort_order");

    const domainNames = (domains || []).map((d: any) => d.name).join(", ");

    // Fetch yearly outcomes for this age group (uses new schema)
    let outcomesContext = "";
    const ageCode = `AGE${age_group?.toString().charAt(0) || "5"}`;
    const { data: yearlyOutcomes } = await supabase
      .from("yearly_outcomes")
      .select("id, outcome_title, outcome_description, age_group_id, development_domain_id, age_groups(code, label), development_domains(name)")
      .eq("age_groups.code", ageCode)
      .limit(80);

    // Filter in JS since nested eq may not filter correctly
    const filtered = (yearlyOutcomes || []).filter((o: any) => (o.age_groups as any)?.code === ageCode);
    if (filtered.length > 0) {
      outcomesContext = filtered.map((o: any) =>
        `- ${o.outcome_title} (${(o.development_domains as any)?.name || "General"})`
      ).join("\n");
    }

    // Batch 6B-4 — compact Objective Catalogue context for the month plan.
    let catalogueContext = "";
    try {
      const ageNum = parseInt(String(age_group).match(/\d+/)?.[0] || "0", 10);
      if (ageNum >= 2 && ageNum <= 6) {
        const { data: ap } = await supabase
          .from("age_profiles").select("id").eq("age_group", ageNum).maybeSingle();
        if (ap?.id) {
          const { data: catObjs } = await supabase
            .from("curriculum_objectives")
            .select("teacher_title, development_domains(code)")
            .eq("age_profile_id", ap.id).eq("is_active", true).order("sort_order").limit(40);
          if (catObjs && catObjs.length > 0) {
            catalogueContext = "\n\nOBJECTIVE CATALOGUE (age-appropriate objectives to align with):\n" +
              catObjs.map((o: any) => `- [${(o.development_domains as any)?.code || "GEN"}] ${o.teacher_title}`).join("\n");
          }
        }
      }
    } catch (_e) { /* non-fatal */ }

    // Fetch KSPK/curriculum standards for context
    let kspkContext = "";
    const { data: learningAreas } = await supabase
      .from("learning_areas")
      .select("code, name_ms, name_en")
      .order("sort_order");

    if (learningAreas && learningAreas.length > 0) {
      kspkContext = `\n\nKSPK/KP2026 LEARNING AREAS:\n${learningAreas.map((la: any) => `- ${la.code}: ${la.name_en || la.name_ms}`).join("\n")}`;
    }

    // Fetch school resources (books, songs) for theme context
    let resourceContext = "";
    try {
      const searchTags = (theme_name || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const { data: resources } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: branch_id || null,
        p_resource_types: ["book", "song", "activity"],
        p_age_groups: [ageCode],
        p_search_tags: searchTags,
        p_match_count: 12,
      });

      if (resources && resources.length > 0) {
        const byType: Record<string, any[]> = {};
        for (const r of resources) {
          if (!byType[r.resource_type]) byType[r.resource_type] = [];
          byType[r.resource_type].push(r);
        }
        const sections: string[] = [];
        if (byType.book?.length) sections.push(`Books: ${byType.book.map((b: any) => `"${b.title}"${b.author ? ` by ${b.author}` : ""}`).join(", ")}`);
        if (byType.song?.length) sections.push(`Songs: ${byType.song.map((s: any) => `"${s.title}"`).join(", ")}`);
        if (byType.activity?.length) sections.push(`Activities: ${byType.activity.map((a: any) => a.title).join(", ")}`);
        if (sections.length > 0) resourceContext = `\n\nSCHOOL RESOURCE LIBRARY (prefer these when relevant):\n${sections.join("\n")}`;
      }
    } catch (e) {
      console.error("Resource search error:", e);
    }

    const weeklyDesc = (weekly_focuses || [])
      .map((w: any) => `Week ${w.week_number}: ${w.focus_title}`)
      .join("\n");

    // Pull the class-wide skill-gap rollup over the last 60 days so the AI
    // can target areas where most children are still "emerging". This makes
    // the monthly plan personalised to the actual cohort instead of a
    // generic theme rollout.
    let cohortGapContext = "";
    if (branch_id) {
      try {
        const since = new Date();
        since.setDate(since.getDate() - 60);
        const { data: gapRows } = await supabase
          .from("child_update_skills")
          .select(
            "indicator_label, proficiency_level, development_domains(name), child_updates!inner(branch_id, activity_date)",
          )
          .eq("child_updates.branch_id", branch_id)
          .gte("child_updates.activity_date", since.toISOString().slice(0, 10))
          .limit(800);
        if (gapRows && gapRows.length > 0) {
          const byDomain: Record<string, { emerging: number; total: number }> = {};
          const emergingIndicators = new Map<string, number>();
          for (const r of gapRows as any[]) {
            const dn = r.development_domains?.name || "General";
            if (!byDomain[dn]) byDomain[dn] = { emerging: 0, total: 0 };
            byDomain[dn].total += 1;
            if (r.proficiency_level === "emerging") {
              byDomain[dn].emerging += 1;
              if (r.indicator_label) {
                emergingIndicators.set(
                  r.indicator_label,
                  (emergingIndicators.get(r.indicator_label) || 0) + 1,
                );
              }
            }
          }
          const domainLines = Object.entries(byDomain)
            .map(([n, v]) => `- ${n}: ${v.emerging}/${v.total} observations still emerging`)
            .join("\n");
          const topGaps = [...emergingIndicators.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, c]) => `- ${label} (${c} children)`)
            .join("\n");
          cohortGapContext = `\n\nCLASS SKILL GAPS (last 60 days — prioritise activities that address these):\n${domainLines}${topGaps ? `\n\nTop emerging indicators:\n${topGaps}` : ""}`;
        }
      } catch (e) {
        console.error("cohort gap query error:", e);
      }
    }

    const vocabContext = (theme_vocabulary || []).length > 0
      ? `\n- Key Vocabulary: ${theme_vocabulary.join(", ")}`
      : "";
    const conceptContext = (theme_concepts || []).length > 0
      ? `\n- Key Concepts: ${theme_concepts.join(", ")}`
      : "";

    // Cohort assessment + progress context (baseline vs latest assessment, child_skill_progress rollup).
    let assessmentBlock = "";
    try {
      let roster = supabase.from("students").select("id").eq("is_active", true);
      if (class_id) roster = roster.eq("class_id", class_id);
      else if (branch_id) roster = roster.eq("branch_id", branch_id);
      const { data: roster_rows } = await roster.limit(60);
      const ids = (roster_rows ?? []).map((r: any) => r.id);
      if (ids.length) {
        const ctx = await buildAssessmentContext(supabase, ids);
        assessmentBlock = renderAssessmentContextBlock(ctx);
      }
    } catch (e) {
      console.error("assessment context error (monthly):", e);
    }

    const systemPrompt = `You are an early childhood curriculum specialist with deep knowledge of KSPK/KP2026 framework. Generate a comprehensive monthly curriculum plan for ${month_name} (Month ${month_number}).

IMPORTANT: Generate ALL content in ENGLISH language.

Context:
- Age group: ${age_group} years old
- Monthly theme: ${theme_name}
- Big idea: ${big_idea}${vocabContext}${conceptContext}
- Weekly focuses:
${weeklyDesc}

DEVELOPMENT DOMAINS (ensure balanced coverage):
${domainNames}

AGE-SPECIFIC YEARLY OUTCOMES:
${outcomesContext || "Use general early childhood outcomes."}
${catalogueContext}
${kspkContext}
${resourceContext}
${cohortGapContext}
${assessmentBlock}

Generate developmentally appropriate content. Be generous with items — add as many as needed for thorough coverage:
1. A refined "big_idea" sentence that captures the essence of the theme
2. 8-15 key vocabulary words (nouns, verbs, adjectives) appropriate for the age group and relevant to the theme
3. 4-8 key concepts as short sentences describing what children should understand by end of month (e.g. "Plants need water and sunlight to grow", "Different animals live in different habitats")
4. 6-12 monthly learning objectives (measurable, child-centered) — add more if the theme demands broader coverage
5. 5-10 assessment focus areas (what teachers should observe) — be thorough based on the theme scope
6. 2-5 family connections, each with a parent tip and a home activity — cover different aspects of the theme
7. 3-6 suggested books related to the monthly theme (prefer books from School Resource Library if available)
8. 3-6 suggested songs or rhymes related to the monthly theme (prefer songs from School Resource Library if available)
9. Domain coverage — which development domains this month's plan targets and with which outcomes

Be specific and practical. All content must be in English. Make objectives observable and measurable.

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
          { role: "user", content: `Generate the monthly plan for ${month_name} with theme "${theme_name}".` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_monthly_plan",
              description: "Return the structured monthly curriculum plan",
              parameters: {
                type: "object",
                properties: {
                  big_idea: { type: "string", description: "The central big idea for the month" },
                  key_vocabulary: {
                    type: "array",
                    items: { type: "string" },
                    description: "8-15 theme-related vocabulary words appropriate for the age group (nouns, verbs, adjectives)",
                  },
                  key_concepts: {
                    type: "array",
                    items: { type: "string" },
                    description: "4-8 key concepts as short sentences children should understand by end of month",
                  },
                  objectives: {
                    type: "array",
                    items: { type: "string" },
                    description: "6-12+ monthly learning objectives",
                  },
                  assessment_focus: {
                    type: "array",
                    items: { type: "string" },
                    description: "5-10+ assessment focus areas",
                  },
                  family_connections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tip: { type: "string", description: "A parent tip related to the theme" },
                        activity: { type: "string", description: "A home activity suggestion" },
                      },
                      required: ["tip", "activity"],
                      additionalProperties: false,
                    },
                    description: "2-5 family connections with parent tips and activities",
                  },
                  suggested_books: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-6 suggested books for the month",
                  },
                  suggested_songs: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-6 suggested songs or rhymes",
                  },
                  domain_coverage: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        domain: { type: "string", description: "Development domain name" },
                        targeted_outcomes: {
                          type: "array",
                          items: { type: "string" },
                          description: "Outcome codes targeted this month",
                        },
                      },
                      required: ["domain", "targeted_outcomes"],
                      additionalProperties: false,
                    },
                    description: "Which development domains and outcomes are targeted",
                  },
                },
                required: ["big_idea", "key_vocabulary", "key_concepts", "objectives", "assessment_focus", "family_connections", "suggested_books", "suggested_songs", "domain_coverage"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_monthly_plan" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + response.status);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const plan = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-monthly-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
