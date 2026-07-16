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
    const { month_name, week_number, age_group, theme_name, big_idea, monthly_objectives, weekly_focus_title, weekly_focus_questions, branch_id, month_plan_id, class_id } = await req.json();

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

    const filtered = (yearlyOutcomes || []).filter((o: any) => (o.age_groups as any)?.code === ageCode);
    if (filtered.length > 0) {
      outcomesContext = filtered.map((o: any) =>
        `- ${o.outcome_title} (${(o.development_domains as any)?.name || "General"})`
      ).join("\n");
    }

    // Batch 6B-4 — inject compact Objective Catalogue context for this age
    // so the weekly planner can choose from the canonical objective bank.
    let catalogueContext = "";
    try {
      const ageNum = parseInt(String(age_group).match(/\d+/)?.[0] || "0", 10);
      if (ageNum >= 2 && ageNum <= 6) {
        const { data: ap } = await supabase
          .from("age_profiles").select("id").eq("age_group", ageNum).maybeSingle();
        if (ap?.id) {
          const { data: catObjs } = await supabase
            .from("curriculum_objectives")
            .select("teacher_title, parent_title, development_domains(name, code)")
            .eq("age_profile_id", ap.id).eq("is_active", true).order("sort_order").limit(40);
          if (catObjs && catObjs.length > 0) {
            catalogueContext = "\n\nOBJECTIVE CATALOGUE (align weekly plan to these where possible):\n" +
              catObjs.map((o: any) => `- [${(o.development_domains as any)?.code || "GEN"}] ${o.teacher_title}`).join("\n");
          }
        }
      }
    } catch (_e) { /* non-fatal */ }

    // Fetch term objectives linked to monthly plan's SELECTED learning goals (focus_outcomes)
    let termObjectivesContext = "";
    let termObjectivesList: any[] = [];
    let learningGoalsContext = "";
    let themeVocabContext = "";
    if (month_plan_id) {
      try {
        const { data: mp } = await supabase
          .from("curriculum_month_plans")
          .select("year_plan_id, focus_outcomes, theme_bank_id")
          .eq("id", month_plan_id)
          .single();
        if (mp) {
          // Use focus_outcomes (specific selected learning goals) instead of ALL age group outcomes
          const focusOutcomes = (mp as any).focus_outcomes;
          let outcomeIds: string[] = [];
          if (Array.isArray(focusOutcomes) && focusOutcomes.length > 0) {
            outcomeIds = focusOutcomes;
          } else {
            // Fallback: get all outcomes for the age group if no focus_outcomes selected
            const { data: yp } = await supabase.from("curriculum_year_plans").select("age_group_id").eq("id", (mp as any).year_plan_id).single();
            if (yp) {
              const { data: outcomes } = await supabase.from("yearly_outcomes").select("id").eq("age_group_id", (yp as any).age_group_id);
              outcomeIds = (outcomes ?? []).map((o: any) => o.id);
            }
          }

          // Fetch learning goal titles for context
          if (outcomeIds.length > 0) {
            const { data: goalRows } = await supabase
              .from("yearly_outcomes")
              .select("outcome_title, development_domains(name)")
              .in("id", outcomeIds);
            if (goalRows && goalRows.length > 0) {
              learningGoalsContext = `\n\nMONTHLY LEARNING GOALS (selected for this month):\n${goalRows.map((g: any) =>
                `- ${g.outcome_title} [${(g.development_domains as any)?.name || "General"}]`
              ).join("\n")}`;
            }

            // Fetch term objectives linked to these specific outcomes
            const { data: objectives } = await supabase
              .from("lesson_objectives")
              .select("id, code, title, objective_type, difficulty_level, learning_area, development_domains(name)")
              .eq("is_active", true)
              .in("yearly_outcome_id", outcomeIds)
              .order("code");
            termObjectivesList = objectives ?? [];
            if (termObjectivesList.length > 0) {
              termObjectivesContext = `\n\nAVAILABLE TERM OBJECTIVES (select the most relevant ones for this week's focus):\n${termObjectivesList.map((o: any) =>
                `- ${o.code}: ${o.title} [${(o.development_domains as any)?.name || "General"}] (${o.difficulty_level || "standard"})`
              ).join("\n")}`;
            }
          }

          // Fetch theme bank vocabulary and concepts
          if ((mp as any).theme_bank_id) {
            const { data: tb } = await supabase
              .from("theme_bank")
              .select("key_vocabulary_json, key_concepts_json, suggested_books_json, suggested_songs_json")
              .eq("id", (mp as any).theme_bank_id)
              .single();
            if (tb) {
              const parts: string[] = [];
              const vocab = (tb as any).key_vocabulary_json;
              if (Array.isArray(vocab) && vocab.length > 0) {
                parts.push(`Key Vocabulary: ${vocab.map((v: any) => typeof v === "string" ? v : v.word || v.label || JSON.stringify(v)).join(", ")}`);
              }
              const concepts = (tb as any).key_concepts_json;
              if (Array.isArray(concepts) && concepts.length > 0) {
                parts.push(`Key Concepts: ${concepts.map((c: any) => typeof c === "string" ? c : c.concept || c.label || JSON.stringify(c)).join(", ")}`);
              }
              const books = (tb as any).suggested_books_json;
              if (Array.isArray(books) && books.length > 0) {
                parts.push(`Suggested Books: ${books.map((b: any) => typeof b === "string" ? b : b.title || JSON.stringify(b)).join(", ")}`);
              }
              const songs = (tb as any).suggested_songs_json;
              if (Array.isArray(songs) && songs.length > 0) {
                parts.push(`Suggested Songs: ${songs.map((s: any) => typeof s === "string" ? s : s.title || JSON.stringify(s)).join(", ")}`);
              }
              if (parts.length > 0) {
                themeVocabContext = `\n\nTHEME BANK CONTEXT:\n${parts.join("\n")}`;
              }
            }
          }
        }
      } catch (e) {
        console.error("Term objectives fetch error:", e);
      }
    }

    // Fetch KSPK standards
    let kspkContext = "";
    const { data: learningAreas } = await supabase
      .from("learning_areas")
      .select("code, name_ms, name_en")
      .order("sort_order");

    if (learningAreas && learningAreas.length > 0) {
      kspkContext = `\n\nKSPK/KP2026 LEARNING AREAS:\n${learningAreas.map((la: any) => `- ${la.code}: ${la.name_en || la.name_ms}`).join("\n")}`;
    }

    // Fetch school resources (books, songs, activities) for weekly context
    let resourceContext = "";
    try {
      const searchTags = (theme_name || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      if (weekly_focus_title) searchTags.push(...weekly_focus_title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
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

    const objectivesDesc = (monthly_objectives || []).map((o: string, i: number) => `${i + 1}. ${o}`).join("\n");

    // Recent Moments context — what teachers actually observed in the last 14 days.
    // Aggregated per domain + proficiency level so the AI can target areas where
    // children are still emerging and avoid re-teaching consistent skills.
    let momentsContext = "";
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      let q = supabase
        .from("child_updates")
        .select("proficiency_level, milestone_flag, parent_summary, caption, development_domains(name)")
        .gte("activity_date", since)
        .limit(200);
      if (branch_id) q = q.eq("branch_id", branch_id);
      if (class_id) q = q.eq("class_id", class_id);
      const { data: moments } = await q;
      if (moments && moments.length > 0) {
        const byDomain: Record<string, { emerging: number; developing: number; consistent: number; total: number; milestones: number; samples: string[] }> = {};
        for (const m of moments as any[]) {
          const dom = m.development_domains?.name || "General";
          if (!byDomain[dom]) byDomain[dom] = { emerging: 0, developing: 0, consistent: 0, total: 0, milestones: 0, samples: [] };
          byDomain[dom].total++;
          if (m.proficiency_level === "emerging") byDomain[dom].emerging++;
          else if (m.proficiency_level === "developing") byDomain[dom].developing++;
          else if (m.proficiency_level === "consistent") byDomain[dom].consistent++;
          if (m.milestone_flag) byDomain[dom].milestones++;
          const note = (m.parent_summary || m.caption || "").trim();
          if (note && byDomain[dom].samples.length < 2) byDomain[dom].samples.push(note.slice(0, 120));
        }
        const lines = Object.entries(byDomain).map(([dom, s]) =>
          `- ${dom}: ${s.total} moments (${s.emerging} emerging, ${s.developing} developing, ${s.consistent} consistent${s.milestones ? `, ${s.milestones} milestones` : ""})${s.samples.length ? `\n    e.g. "${s.samples.join('"; "')}"` : ""}`
        );
        momentsContext = `\n\nRECENT CLASS MOMENTS (last 14 days, what teachers actually observed):\n${lines.join("\n")}\n\nUse this signal to: (a) prioritise activities in domains where most children are still "emerging", (b) extend/challenge in domains already "consistent", (c) reflect children's actual interests visible in the sample notes.`;
      }
    } catch (e) {
      console.error("Moments context fetch error:", e);
    }

    // Per-indicator skill gaps — the AI now sees WHICH specific skills are
    // emerging across the class, not just domain-level counts. This is what
    // enables real differentiation in the generated weekly plan.
    let skillGapContext = "";
    try {
      const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      let sq = supabase
        .from("child_update_skills")
        .select(`
          indicator_label, proficiency_level, domain_id,
          development_domains(name),
          child_updates!inner(branch_id, class_id, activity_date)
        `)
        .gte("child_updates.activity_date", since)
        .limit(500);
      if (branch_id) sq = sq.eq("child_updates.branch_id", branch_id);
      if (class_id) sq = sq.eq("child_updates.class_id", class_id);
      const { data: skills } = await sq;
      if (skills && skills.length > 0) {
        // Aggregate by (domain, indicator_label) → count per proficiency level.
        const map = new Map<string, { dom: string; label: string; emerging: number; developing: number; consistent: number }>();
        for (const s of skills as any[]) {
          const dom = s.development_domains?.name || "General";
          const label = (s.indicator_label || "").trim();
          if (!label) continue;
          const key = `${dom}::${label.toLowerCase()}`;
          if (!map.has(key)) map.set(key, { dom, label, emerging: 0, developing: 0, consistent: 0 });
          const row = map.get(key)!;
          if (s.proficiency_level === "emerging") row.emerging++;
          else if (s.proficiency_level === "developing") row.developing++;
          else if (s.proficiency_level === "consistent") row.consistent++;
        }
        // Surface top-emerging skills (most children still building this skill).
        const ranked = Array.from(map.values())
          .filter((r) => r.emerging > 0)
          .sort((a, b) => b.emerging - a.emerging)
          .slice(0, 15);
        if (ranked.length) {
          const lines = ranked.map((r) => `- [${r.dom}] "${r.label}" — ${r.emerging} emerging, ${r.developing} developing, ${r.consistent} consistent`);
          skillGapContext = `\n\nCLASS SKILL GAPS (last 28 days, specific skills with the most children still building):\n${lines.join("\n")}\n\nDesign activities that explicitly practise these emerging skills.`;
        }
      }
    } catch (e) {
      console.error("Skill gap context fetch error:", e);
    }

    const weeklyContext = weekly_focus_title
      ? `\n- Weekly Focus (from Theme Bank): "${weekly_focus_title}"\n- Weekly Key Questions: ${(weekly_focus_questions || []).join("; ")}`
      : "";

    // Cohort assessment + progress engine context (baseline vs latest, child_skill_progress).
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
      console.error("assessment context error (weekly):", e);
    }

    const objectiveSelectionInstruction = termObjectivesList.length > 0
      ? `\n\nIMPORTANT: From the AVAILABLE TERM OBJECTIVES list, select only the ones that are most relevant to this week's generated focus and activities. Mark each selected objective as "primary" (directly taught/assessed this week) or "secondary" (supports learning but not the main focus). Select 3-8 objectives total. Use the exact objective codes from the list.`
      : "";

    const systemPrompt = `You are an early childhood curriculum specialist with deep knowledge of KSPK/KP2026 framework. Generate a detailed weekly curriculum plan for Week ${week_number} of ${month_name}.

IMPORTANT: Generate ALL content in ENGLISH language.

Context:
- Age group: ${age_group} years old
- Monthly theme: ${theme_name}
- Big idea: ${big_idea}${weeklyContext}
- Monthly objectives:
${objectivesDesc}${skillGapContext}

DEVELOPMENT DOMAINS:
${domainNames}

AGE-SPECIFIC YEARLY OUTCOMES:
${outcomesContext || "Use general early childhood outcomes."}
${catalogueContext}
${kspkContext}
${resourceContext}
${learningGoalsContext}
${themeVocabContext}
${termObjectivesContext}
${momentsContext}
${assessmentBlock}

Generate developmentally appropriate weekly content:
1. A focus title for this week (short, thematic)
2. 3-5 focus questions (inquiry-based questions to guide exploration)
3. 4-6 weekly objectives (specific to this week, aligned to monthly objectives)
4. 3-5 provocations (engaging activities or setups to spark curiosity)
5. 4-8 materials needed
6. 3-5 observation focus areas (what teachers should look for this week)
7. 3-5 center/station setup ideas (linked to learning center zones: Literacy, Numeracy, Dramatic Play, Sensory, Construction, Art, Discovery)
8. 3-5 suggested books for this week (prefer books from School Resource Library if available)
9. 3-5 suggested songs or rhymes (prefer songs from School Resource Library if available)
10. Targeted development outcomes for this week
${objectiveSelectionInstruction}

Be practical, specific, and age-appropriate. All content must be in English.

Use the provided tool to return structured output.`;

    // Build tool properties
    const toolProperties: any = {
      focus_title: { type: "string", description: "Short thematic title for this week" },
      focus_questions: {
        type: "array",
        items: { type: "string" },
        description: "3-5 inquiry-based focus questions",
      },
      weekly_objectives: {
        type: "array",
        items: { type: "string" },
        description: "4-6 weekly learning objectives",
      },
      provocations: {
        type: "array",
        items: { type: "string" },
        description: "3-5 provocations or engaging activities",
      },
      materials: {
        type: "array",
        items: { type: "string" },
        description: "4-8 materials needed",
      },
      observation_focus: {
        type: "array",
        items: { type: "string" },
        description: "3-5 observation focus areas",
      },
      center_setup: {
        type: "array",
        items: { type: "string" },
        description: "3-5 center/station setup ideas",
      },
      suggested_books: {
        type: "array",
        items: { type: "string" },
        description: "3-5 suggested books for this week",
      },
      suggested_songs: {
        type: "array",
        items: { type: "string" },
        description: "3-5 suggested songs or rhymes",
      },
      targeted_outcomes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            outcome_code: { type: "string" },
            domain: { type: "string" },
            description: { type: "string" },
          },
          required: ["outcome_code", "domain", "description"],
          additionalProperties: false,
        },
        description: "Development outcomes targeted this week",
      },
    };

    const requiredFields = ["focus_title", "focus_questions", "weekly_objectives", "provocations", "materials", "observation_focus", "center_setup", "suggested_books", "suggested_songs", "targeted_outcomes"];

    // Add selected_objectives to tool schema if term objectives are available
    if (termObjectivesList.length > 0) {
      toolProperties.selected_objectives = {
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string", description: "The objective code from the AVAILABLE TERM OBJECTIVES list" },
            priority: { type: "string", enum: ["primary", "secondary"], description: "primary = directly taught this week, secondary = supports learning" },
          },
          required: ["code", "priority"],
          additionalProperties: false,
        },
        description: "Selected term objectives from the available list, with priority assignment",
      };
      requiredFields.push("selected_objectives");
    }

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
          { role: "user", content: `Generate the weekly plan for Week ${week_number} of ${month_name} with theme "${theme_name}".` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_weekly_plan",
              description: "Return the structured weekly curriculum plan",
              parameters: {
                type: "object",
                properties: toolProperties,
                required: requiredFields,
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_weekly_plan" } },
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
    console.error("generate-weekly-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
