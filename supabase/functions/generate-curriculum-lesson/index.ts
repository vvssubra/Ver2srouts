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

    const body = await req.json();
    const {
      ageGroup, monthTheme, weeklyFocus, bigIdea,
      monthlyPlanId, weeklyPlanId, themeBankId,
      classId, branchId, methodology: _ignoredMethodology,
      teacherNotes, schoolPhilosophy
    } = body;

    // 1. Fetch yearly outcomes for the age group (uses new schema)
    let outcomesContext = "";
    const ageCode = `AGE${ageGroup?.toString().charAt(0) || "5"}`;
    const { data: yearlyOutcomes } = await supabase
      .from("yearly_outcomes")
      .select("id, outcome_title, outcome_description, age_group_id, development_domain_id, age_groups(code, label), development_domains(name)")
      .eq("age_groups.code", ageCode)
      .limit(100);

    const filteredOutcomes = (yearlyOutcomes || []).filter((o: any) => (o.age_groups as any)?.code === ageCode);
    if (filteredOutcomes.length > 0) {
      outcomesContext = filteredOutcomes.map((o: any) =>
        `- ${o.outcome_title} (${(o.development_domains as any)?.name || "General"})`
      ).join("\n");
    }

    // Batch 6B-3 — additive: include compact Objective Catalogue context
    // (parent-friendly titles, teacher wording) for this age so the AI
    // aligns lesson objectives to the canonical catalogue when available.
    let catalogueContext = "";
    try {
      const ageNum = parseInt(String(ageGroup).match(/\d+/)?.[0] || "0", 10);
      if (ageNum >= 2 && ageNum <= 6) {
        const { data: ageProfile } = await supabase
          .from("age_profiles")
          .select("id")
          .eq("age_group", ageNum)
          .maybeSingle();
        if (ageProfile?.id) {
          const { data: catObjs } = await supabase
            .from("curriculum_objectives")
            .select("teacher_title, parent_title, development_domains(name, code)")
            .eq("age_profile_id", ageProfile.id)
            .eq("is_active", true)
            .order("sort_order")
            .limit(40);
          if (catObjs && catObjs.length > 0) {
            catalogueContext = "\n\nOBJECTIVE CATALOGUE (align to these where possible):\n" +
              catObjs.map((o: any) =>
                `- [${(o.development_domains as any)?.code || "GEN"}] ${o.teacher_title}` +
                (o.parent_title ? ` (parent-friendly: ${o.parent_title})` : "")
              ).join("\n");
          }
        }
      }
    } catch (e) {
      console.error("Catalogue context fetch failed:", e);
    }

    // 2. Fetch theme details
    let themeContext = "";
    if (themeBankId) {
      const { data: theme } = await supabase
        .from("theme_bank")
        .select("theme_name, big_idea, key_vocabulary_json, key_concepts_json, suggested_books_json, suggested_songs_json, center_suggestions_json, parent_connection_json")
        .eq("id", themeBankId)
        .single();

      if (theme) {
        themeContext = `
THEME DETAILS:
Name: ${theme.theme_name}
Big Idea: ${theme.big_idea || bigIdea || ""}
Key Vocabulary: ${JSON.stringify(theme.key_vocabulary_json || [])}
Key Concepts: ${JSON.stringify(theme.key_concepts_json || [])}
Suggested Books: ${JSON.stringify(theme.suggested_books_json || [])}
Suggested Songs: ${JSON.stringify(theme.suggested_songs_json || [])}
Center Suggestions: ${JSON.stringify(theme.center_suggestions_json || [])}
Parent Connection Ideas: ${JSON.stringify(theme.parent_connection_json || [])}`;
      }
    }

    // 3. Weekly focus details
    let weeklyFocusContext = "";
    if (weeklyPlanId) {
      const { data: wp } = await supabase
        .from("weekly_curriculum_plans")
        .select("focus_title, focus_questions_json, weekly_objectives_json, provocations_json, materials_json, observation_focus_json, center_setup_json")
        .eq("id", weeklyPlanId)
        .single();

      if (wp) {
        weeklyFocusContext = `
WEEKLY FOCUS PLAN:
Focus: ${wp.focus_title}
Key Questions: ${JSON.stringify(wp.focus_questions_json || [])}
Weekly Objectives: ${JSON.stringify(wp.weekly_objectives_json || [])}
Provocations: ${JSON.stringify(wp.provocations_json || [])}
Materials: ${JSON.stringify(wp.materials_json || [])}
Observation Focus: ${JSON.stringify(wp.observation_focus_json || [])}
Center Setup: ${JSON.stringify(wp.center_setup_json || [])}`;
      }
    }

    // 4. Coverage logs to avoid repetition
    let coverageContext = "";
    if (branchId && classId) {
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      const { data: logs } = await supabase
        .from("class_coverage_logs")
        .select("standard_code, subject_name, domain_id, development_domains(name)")
        .eq("branch_id", branchId)
        .eq("class_id", classId)
        .gte("week_starting", fourWeeksAgo.toISOString().split("T")[0])
        .order("week_starting", { ascending: false })
        .limit(50);

      if (logs && logs.length > 0) {
        const covered = [...new Set(logs.map((c: any) => c.standard_code))];
        coverageContext = `\nRECENTLY COVERED (avoid repeating): ${covered.join(", ")}`;
      }
    }

    // 5. Auto-detect methodology from branch_methodologies
    let methodologyName = "Play-based";
    let philosophyContext = "";
    if (branchId) {
      const { data: branchMethods } = await supabase
        .from("branch_methodologies")
        .select("is_primary, methodology_frameworks(name, core_principles)")
        .eq("branch_id", branchId);

      if (branchMethods && branchMethods.length > 0) {
        const allNames = branchMethods.map((bm: any) => (bm.methodology_frameworks as any)?.name).filter(Boolean);
        const primary = branchMethods.find((bm: any) => bm.is_primary) || branchMethods[0];
        methodologyName = (primary.methodology_frameworks as any)?.name || "Play-based";
        const principles = branchMethods.map((bm: any) => {
          const fw = bm.methodology_frameworks as any;
          return fw ? `${fw.name}: ${fw.core_principles}` : "";
        }).filter(Boolean).join("\n");
        philosophyContext = `\nSCHOOL ADOPTED METHODOLOGIES: ${allNames.join(", ")}\nPrinciples:\n${principles}\n\nIMPORTANT: For EACH activity, suggest which methodology is most appropriate and provide a brief rationale.`;
      } else {
        const { data: phil } = await supabase
          .from("school_philosophy_settings")
          .select("philosophy_type, custom_notes")
          .eq("branch_id", branchId)
          .single();

        if (phil) {
          methodologyName = phil.philosophy_type || "Play-based";
          philosophyContext = `\nSCHOOL PHILOSOPHY: ${phil.philosophy_type}${phil.custom_notes ? ` — ${phil.custom_notes}` : ""}`;
        }
      }
    }

    // 6. Recent observations
    let observationContext = "";
    if (classId) {
      const { data: students } = await supabase
        .from("students").select("id").eq("class_id", classId).eq("is_active", true);
      const sIds = (students || []).map((s: any) => s.id);
      if (sIds.length > 0) {
        const ago = new Date(); ago.setDate(ago.getDate() - 30);
        const { data: obs } = await supabase
          .from("student_observations")
          .select("proficiency_level, tags")
          .in("student_id", sIds)
          .gte("observed_at", ago.toISOString().split("T")[0])
          .limit(30);
        if (obs && obs.length > 0) {
          const levels: Record<string, number> = {};
          obs.forEach((o: any) => { levels[o.proficiency_level] = (levels[o.proficiency_level] || 0) + 1; });
          observationContext = `\nCLASS OBSERVATION PROFILE: ${Object.entries(levels).map(([k, v]) => `${k}: ${v}`).join(", ")}`;
        }
      }
    }

    // 6b. Fetch school resources (books, songs, activities) for AI context
    let resourceContext = "";
    try {
      const ageCode = `AGE${ageGroup?.toString().charAt(0) || "5"}`;
      const searchTags = (monthTheme || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      if (weeklyFocus) searchTags.push(...weeklyFocus.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));

      const { data: resources } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: branchId || null,
        p_resource_types: ["book", "song", "activity", "lesson_plan"],
        p_age_groups: [ageCode],
        p_search_tags: searchTags,
        p_match_count: 15,
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
        if (sections.length > 0) resourceContext = `\n\nSCHOOL RESOURCES (prefer these):\n${sections.join("\n")}`;
      }
    } catch (e) {
      console.error("Resource search error:", e);
    }

    const ageRulesMap: Record<string, string> = {
      "3": "Focus on sensory play, routines, movement, language exposure, pretend play. Short activities (10-15 min). High adult scaffolding.",
      "4": "Balanced play + guided concept development. Circle time 15-20 min. Introduce letter/number recognition through play.",
      "5": "Stronger readiness work. Structured concept blocks. Writing attempts. Counting with understanding. Group collaboration.",
      "6": "Beginner reading/writing. Add/subtract within 20. Project-based inquiry. Leadership roles. Independence expected.",
    };

    const ageRules = ageRulesMap[ageGroup] || ageRulesMap["4"];

    const systemPrompt = `You are a world-class Early Childhood Curriculum Designer specializing in preschool education for ages 3-6.

CONTEXT:
Age Group: ${ageGroup} years old
Month Theme: ${monthTheme}
Weekly Focus: ${weeklyFocus || "General"}
Big Idea: ${bigIdea || ""}
Methodology: ${methodologyName}
${philosophyContext}
${themeContext}
${weeklyFocusContext}
${coverageContext}
${observationContext}
${teacherNotes ? `\nTEACHER NOTES: ${teacherNotes}` : ""}
${resourceContext}

AGE-SPECIFIC RULES: ${ageRules}

DEVELOPMENT OUTCOMES AVAILABLE:
${outcomesContext || "Use general early childhood development outcomes."}
${catalogueContext}

CRITICAL REQUIREMENTS:
1. Every weekly plan must cover at least 4 of the 7 development domains
2. Must include literacy, numeracy, motor, AND social-emotional activities
3. Every objective must map to a development outcome code
4. Every activity must include observable evidence/indicators
5. Include support/core/extension differentiation for EVERY activity
6. Include parent story prompt for family connection
7. Include PTM evidence tags for assessment tracking
8. Minimize worksheet dependency — favor hands-on, play-based learning
9. Include provocations (open-ended questions/setups that invite exploration)
10. Plan learning centers that are thematically connected

Generate a complete structured lesson plan as JSON with this EXACT shape:
{
  "title": "descriptive title",
  "age_group": "${ageGroup}",
  "month_theme": "${monthTheme}",
  "weekly_focus": "${weeklyFocus || ""}",
  "big_idea": "the overarching concept",
  "essential_question": "an open-ended question for the week",
  "domain_objectives": [
    {"domain": "domain name", "domain_code": "COM", "outcome_code": "COM-4-01", "objective": "what children will learn"}
  ],
  "daily_flow": {
    "arrival": {"duration": "15 min", "description": "welcoming routine", "activities": ["free play", "greet friends"]},
    "circle_time": {"duration": "20 min", "description": "group gathering", "focus": "theme introduction"},
    "focused_activity": {"duration": "30 min", "description": "main learning block"},
    "center_time": {"duration": "40 min", "description": "learning center rotation"},
    "outdoor_play": {"duration": "30 min", "description": "gross motor and nature"},
    "story": {"duration": "15 min", "description": "read-aloud and discussion"},
    "reflection": {"duration": "10 min", "description": "what did we learn today"}
  },
  "activities": [
    {
      "title": "activity name",
      "type": "circle_time|focused|center|outdoor|story",
      "domain": "domain name",
      "duration": "20 min",
      "learning_objective": "clear measurable objective",
      "outcome_codes": ["COM-4-01"],
      "materials": ["item1", "item2"],
      "procedure": {
        "introduction": "5 min warm-up",
        "activity": "15 min main learning",
        "conclusion": "5 min reflection"
      },
      "differentiation": {
        "support": "scaffolding for struggling learners",
        "core": "standard activity",
        "extension": "challenge for advanced learners"
      },
      "observation_cues": "what to watch for",
      "provocation_questions": ["open question 1", "open question 2"]
    }
  ],
  "center_setups": [
    {"center": "literacy_corner", "setup": "description", "materials": [], "learning_focus": ""},
    {"center": "numeracy_manipulative", "setup": "", "materials": [], "learning_focus": ""},
    {"center": "dramatic_play", "setup": "", "materials": [], "learning_focus": ""},
    {"center": "sensory", "setup": "", "materials": [], "learning_focus": ""},
    {"center": "construction", "setup": "", "materials": [], "learning_focus": ""},
    {"center": "art", "setup": "", "materials": [], "learning_focus": ""},
    {"center": "discovery", "setup": "", "materials": [], "learning_focus": ""}
  ],
  "provocations": [
    {"type": "question|display|challenge", "description": "provocation description", "linked_domain": "domain"}
  ],
  "materials": ["comprehensive list of all materials needed"],
  "observation_targets": [
    {"domain": "domain name", "indicator": "what to observe", "evidence_example": "what success looks like"}
  ],
  "observation_prompts": ["prompt for teacher to use during observation"],
  "parent_story_prompt": "A warm narrative snippet for parents about what their child explored this week",
  "ptm_evidence_tags": ["tag1", "tag2"],
  "differentiation": {
    "support": ["strategy for children needing more help"],
    "core": ["standard expectations"],
    "extension": ["challenges for advanced learners"]
  },
  "family_connection": {
    "parent_snippet": "message to parents about this week's learning",
    "home_extension": "activity families can do at home"
  },
  "assessment": {
    "indicators": ["observable indicator 1"],
    "evidence_examples": ["what mastery looks like"],
    "next_step_rules": ["if child shows X, then move to Y"]
  }
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a complete lesson plan for ${ageGroup}-year-olds on the theme "${monthTheme}" with weekly focus "${weeklyFocus || monthTheme}". Return ONLY valid JSON.` },
        ],
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    let content = aiResult.choices?.[0]?.message?.content || "";

    // Strip markdown code fences
    content = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let plan;
    try {
      plan = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
