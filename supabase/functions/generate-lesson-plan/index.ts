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

    const { ageGroup, theme, duration, learningAreaIds, standardIds, methodology: _ignoredMethodology, teacherNotes, resourceLinks, planMode, classId, branchId, monthPlanId, weekPlanId } = await req.json();

    const isEnrichment = planMode === "enrichment";

    // 1. Fetch relevant curriculum standards for RAG context
    let standardsQuery = supabase
      .from("curriculum_standards")
      .select("code, title_ms, notes, level, learning_area_id, parent_id")
      .order("sort_order");

    let curriculumContext: any[] = [];

    if (standardIds && standardIds.length > 0) {
      const { data: selectedStandards } = await supabase
        .from("curriculum_standards")
        .select("id, code, title_ms, notes, level")
        .in("id", standardIds);

      const { data: childStandards } = await supabase
        .from("curriculum_standards")
        .select("id, code, title_ms, notes, level, parent_id")
        .in("parent_id", standardIds);

      curriculumContext = [...(selectedStandards || []), ...(childStandards || [])];
    } else if (learningAreaIds && learningAreaIds.length > 0) {
      const { data } = await standardsQuery.in("learning_area_id", learningAreaIds);
      curriculumContext = data || [];
    } else {
      const { data } = await standardsQuery.limit(100);
      curriculumContext = data || [];
    }

    // 2. Fetch learning area names
    const { data: learningAreas } = await supabase
      .from("learning_areas")
      .select("id, code, name_ms, name_en");

    // 3. Fetch methodology from branch_methodologies (auto-detect, not manual)
    let selectedMethodology = "Default KP2026";
    let methodologyPrinciples = "";
    let allMethodologyNames: string[] = [];
    if (branchId) {
      const { data: branchMethods } = await supabase
        .from("branch_methodologies")
        .select("is_primary, methodology_frameworks(name, core_principles)")
        .eq("branch_id", branchId);

      if (branchMethods && branchMethods.length > 0) {
        allMethodologyNames = branchMethods.map((bm: any) => (bm.methodology_frameworks as any)?.name).filter(Boolean);
        const primary = branchMethods.find((bm: any) => bm.is_primary) || branchMethods[0];
        selectedMethodology = (primary.methodology_frameworks as any)?.name || "Default KP2026";
        methodologyPrinciples = branchMethods.map((bm: any) => {
          const fw = bm.methodology_frameworks as any;
          return fw ? `${fw.name}: ${fw.core_principles}` : "";
        }).filter(Boolean).join("\n\n");
      } else {
        // Fallback to school_philosophy_settings
        const { data: phil } = await supabase
          .from("school_philosophy_settings")
          .select("philosophy_type, custom_notes")
          .eq("branch_id", branchId)
          .single();
        if (phil) {
          selectedMethodology = phil.philosophy_type || "Default KP2026";
        }
        const { data: frameworkData } = await supabase
          .from("methodology_frameworks")
          .select("name, core_principles")
          .eq("name", selectedMethodology)
          .single();
        if (frameworkData) {
          methodologyPrinciples = frameworkData.core_principles;
        }
      }
    }

    // 3b. Fetch recent coverage logs (last 4 weeks) for AI context
    let coverageContext = "";
    if (branchId && classId) {
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      const { data: coverageLogs } = await supabase
        .from("class_coverage_logs")
        .select("standard_code, subject_name, week_starting")
        .eq("branch_id", branchId)
        .eq("class_id", classId)
        .gte("week_starting", fourWeeksAgo.toISOString().split("T")[0])
        .order("week_starting", { ascending: false });

      if (coverageLogs && coverageLogs.length > 0) {
        const coveredCodes = [...new Set(coverageLogs.map((c: any) => c.standard_code))];
        coverageContext = `\n\nRECENTLY COVERED STANDARDS (last 4 weeks — avoid repeating these):\n${coveredCodes.join(", ")}`;
      }
    }

    // 3c. Fetch gap analysis for the class
    let gapContext = "";
    if (classId) {
      const { data: gaps } = await supabase
        .from("student_gap_analysis")
        .select("gap_standard_code, gap_description, students(first_name)")
        .eq("class_id", classId)
        .in("remediation_status", ["pending", "in-progress"])
        .limit(10);

      if (gaps && gaps.length > 0) {
        gapContext = `\n\nSTUDENT LEARNING GAPS (prioritise addressing these):\n${gaps.map((g: any) => `- ${g.gap_standard_code}: ${g.gap_description} (Student: ${(g.students as any)?.first_name || "N/A"})`).join("\n")}`;
      }
    }

    // 3d. Fetch recent observations summary (last 30 days)
    let observationContext = "";
    if (classId) {
      // First get student IDs for the class
      const { data: classStudents } = await supabase
        .from("students")
        .select("id")
        .eq("class_id", classId)
        .eq("is_active", true);

      const studentIds = (classStudents || []).map((s: any) => s.id);

      if (studentIds.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: observations } = await supabase
          .from("student_observations")
          .select("proficiency_level, curriculum_standards(code, title_ms)")
          .in("student_id", studentIds)
          .gte("observed_at", thirtyDaysAgo.toISOString().split("T")[0])
          .limit(50);

        if (observations && observations.length > 0) {
          const profSummary: Record<string, string[]> = { TP1: [], TP2: [], TP3: [] };
          for (const obs of observations) {
            const code = (obs as any).curriculum_standards?.code;
            if (code && profSummary[obs.proficiency_level]) {
              if (!profSummary[obs.proficiency_level].includes(code)) {
                profSummary[obs.proficiency_level].push(code);
              }
            }
          }
          const summaryLines = [];
          if (profSummary.TP1.length > 0) summaryLines.push(`Needs Support (TP1): ${profSummary.TP1.join(", ")}`);
          if (profSummary.TP2.length > 0) summaryLines.push(`Developing (TP2): ${profSummary.TP2.join(", ")}`);
          if (profSummary.TP3.length > 0) summaryLines.push(`Mastered (TP3): ${profSummary.TP3.join(", ")}`);
          if (summaryLines.length > 0) {
            observationContext = `\n\nCLASS OBSERVATION SUMMARY (last 30 days — adapt lesson difficulty based on this):\n${summaryLines.join("\n")}`;
          }
        }
      }
    }

    // Fetch term objectives from monthly plan if available
    let termObjectivesContext = "";
    if (monthPlanId) {
      try {
        const { data: mp } = await supabase
          .from("curriculum_month_plans")
          .select("focus_outcomes")
          .eq("id", monthPlanId)
          .single();
        if (mp) {
          const focusOutcomes = (mp as any).focus_outcomes;
          if (Array.isArray(focusOutcomes) && focusOutcomes.length > 0) {
            const { data: objectives } = await supabase
              .from("lesson_objectives")
              .select("code, title, development_domains(name)")
              .eq("is_active", true)
              .in("yearly_outcome_id", focusOutcomes)
              .order("code");
            if (objectives && objectives.length > 0) {
              termObjectivesContext = `\n\nTERM OBJECTIVES (linked to monthly learning goals — activities MUST align with these):\n${objectives.map((o: any) =>
                `- ${o.code}: ${o.title} [${(o.development_domains as any)?.name || "General"}]`
              ).join("\n")}`;
            }
          }
        }
      } catch (e) {
        console.error("Term objectives fetch error:", e);
      }
    }

    // Fetch weekly focus objectives if weekPlanId provided
    let weeklyObjectivesContext = "";
    if (weekPlanId) {
      try {
        const { data: wfo } = await supabase
          .from("weekly_focus_objectives")
          .select("priority, lesson_objectives(code, title, development_domains(name))")
          .eq("week_plan_id", weekPlanId);
        if (wfo && wfo.length > 0) {
          weeklyObjectivesContext = `\n\nWEEKLY TERM OBJECTIVES (these are the teacher's chosen focus for this week — prioritize these):\n${(wfo as any[]).map((o: any) =>
            `- [${o.priority?.toUpperCase()}] ${o.lesson_objectives?.code}: ${o.lesson_objectives?.title} [${o.lesson_objectives?.development_domains?.name || "General"}]`
          ).join("\n")}`;
        }
      } catch (e) {
        console.error("Weekly objectives fetch error:", e);
      }
    }

    // Fetch weekly plan context (title, description, key questions)
    let weeklyPlanContext = "";
    if (weekPlanId) {
      try {
        const { data: wp } = await supabase
          .from("curriculum_week_plans")
          .select("title, focus_area, description, key_questions")
          .eq("id", weekPlanId)
          .single();
        if (wp) {
          weeklyPlanContext = "\n\nWEEKLY FOCUS CONTEXT:";
          if ((wp as any).title) weeklyPlanContext += `\n- Weekly Title: ${(wp as any).title}`;
          if ((wp as any).focus_area) weeklyPlanContext += `\n- Focus Area: ${(wp as any).focus_area}`;
          if ((wp as any).description) weeklyPlanContext += `\n- Description: ${(wp as any).description}`;
          const kq = (wp as any).key_questions;
          if (Array.isArray(kq) && kq.length > 0) weeklyPlanContext += `\n- Key Questions: ${kq.join("; ")}`;
        }
      } catch (e) {
        console.error("Weekly plan context fetch error:", e);
      }
    }

    // 4a. Search for school resources BEFORE building prompt
    let resourceContext = "";
    let recommendedWorksheets: any[] = [];
    try {
      const searchTags: string[] = [];
      const themeWords = theme.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      searchTags.push(...themeWords);
      if (learningAreas && learningAreaIds) {
        const selectedAreas = (learningAreas as any[]).filter((la: any) => learningAreaIds.includes(la.id));
        searchTags.push(...selectedAreas.map((la: any) => la.code.toLowerCase()));
        searchTags.push(...selectedAreas.map((la: any) => la.name_en?.toLowerCase()).filter(Boolean));
      }
      if (selectedMethodology) searchTags.push(selectedMethodology.toLowerCase());
      searchTags.push(ageGroup);
      const ageCode = `AGE${ageGroup?.toString().charAt(0) || "5"}`;
      const resourceTypes = ["book", "song", "activity", "lesson_plan", "worksheet"];
      const { data: resources } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: branchId || null, p_resource_types: resourceTypes,
        p_age_groups: [ageCode], p_search_tags: searchTags, p_match_count: 20,
      });
      if (resources && resources.length > 0) {
        const byType: Record<string, any[]> = {};
        for (const r of resources) { if (!byType[r.resource_type]) byType[r.resource_type] = []; byType[r.resource_type].push(r); }
        const sections: string[] = [];
        if (byType.book?.length) sections.push(`Books in your school library:\n${byType.book.map((b: any) => `- "${b.title}"${b.author ? ` by ${b.author}` : ""}${b.content_text ? ` — ${b.content_text.substring(0, 100)}` : ""}`).join("\n")}`);
        if (byType.song?.length) sections.push(`Songs your school uses:\n${byType.song.map((s: any) => `- "${s.title}"${s.author ? ` (${s.author})` : ""}${s.content_text ? ` — Lyrics: ${s.content_text.substring(0, 80)}` : ""}`).join("\n")}`);
        if (byType.activity?.length) sections.push(`Approved activity templates:\n${byType.activity.map((a: any) => `- ${a.title}: ${a.content_text?.substring(0, 120) || a.subject}`).join("\n")}`);
        if (byType.lesson_plan?.length) sections.push(`Reference lesson plans:\n${byType.lesson_plan.map((lp: any) => `- ${lp.title}: ${lp.content_text?.substring(0, 120) || lp.subject}`).join("\n")}`);
        if (sections.length > 0) resourceContext = `\n\nSCHOOL RESOURCE LIBRARY (prefer these over generic suggestions when relevant):\n${sections.join("\n\n")}`;
        recommendedWorksheets = (byType.worksheet || []).slice(0, 3);
      } else if (searchTags.length > 0) {
        const { data: ws } = await supabase.rpc("search_worksheets_by_tags", { search_tags: searchTags, match_count: 3 });
        recommendedWorksheets = ws || [];
      }
    } catch (e) { console.error("Resource search error:", e); }

    // 4b. Build the prompt
    const standardsText = curriculumContext
      .map((s: any) => `- [${s.code}] ${s.title_ms}${s.notes ? ` (${s.notes})` : ""}`)
      .join("\n");

    const learningAreasText = (learningAreas || [])
      .map((la: any) => `${la.code}: ${la.name_ms}${la.name_en ? ` / ${la.name_en}` : ""}`)
      .join(", ");

    const methodologyInstruction = allMethodologyNames.length > 0
      ? `\n\nSchool's Adopted Teaching Methodologies: ${allMethodologyNames.join(", ")}\nPrinciples:\n${methodologyPrinciples}\n\nYou MUST suggest which methodology is most appropriate for EACH activity based on the activity type and learning goals. Include a "suggested_methodology" field and "methodology_rationale" for each activity explaining why that methodology fits best.`
      : selectedMethodology !== "Default KP2026"
        ? `\n\nTeaching Methodology: ${selectedMethodology}\nAdapt ALL activities to follow these pedagogical principles: ${methodologyPrinciples}\nEnsure every activity reflects this methodology in its approach, materials, and facilitation style.`
        : methodologyPrinciples
          ? `\n\nTeaching Methodology: Default KP2026\nPrinciples: ${methodologyPrinciples}`
          : "";

    const enrichmentContext = isEnrichment ? `
ENRICHMENT CONTEXT: This is an enrichment/extended care lesson plan. Focus on creative, exploratory, and life-skills activities such as:
- Arts & Craft, Science Explorer, Public Speaking & Leadership, Practical Life Skills
- Cooking & Nutrition, Outdoor Adventure, Music & Movement, Drama & Storytelling, STEM Robotics, Gardening
Activities should be fun, hands-on, and less formally academic. Lighter curriculum mapping is acceptable.
` : "";

    const systemPrompt = `You are a world-class Early Childhood Curriculum Expert aligned with KSPK, KP2026, NAEYC Developmentally Appropriate Practice (DAP), and Reggio Emilia principles.
${enrichmentContext}
Available learning areas: ${learningAreasText}

Relevant curriculum standards:
${standardsText}
${termObjectivesContext}
Guidelines:
- Create age-appropriate activities for ${ageGroup} year old children
- Activities must be play-based, hands-on, and developmentally appropriate
- Each activity should clearly map to specific curriculum standard codes
- Include materials needed, teacher instructions, and expected outcomes
- Use both Bahasa Melayu and English where appropriate
- Consider cross-curricular integration across learning areas${methodologyInstruction}${coverageContext}${gapContext}${observationContext}${resourceContext}${weeklyObjectivesContext}${weeklyPlanContext}${
      teacherNotes ? `\n\nTEACHER'S EXPECTATIONS (HIGH PRIORITY — incorporate these into the plan):\n${teacherNotes}` : ""
    }${
      resourceLinks && resourceLinks.length > 0 ? `\n\nTEACHER-PROVIDED RESOURCES (reference these in activities where appropriate):\n${resourceLinks.map((r: any) => `- ${r.label || r.url}: ${r.url}`).join("\n")}` : ""
    }

CRITICAL REQUIREMENTS — For EVERY activity you generate, you MUST provide:
1) "learning_objective": A clear statement of what the child will learn or be able to do.
2) "procedure": An object with three keys: "introduction" (5 min warm-up/provocation), "activity" (20 min main learning), "conclusion" (5 min reflection/wrap-up).
3) "differentiation_strategies": An object with "support_needed" and "advanced_challenge".
4) "provocation_questions": An array of exactly 2 open-ended questions.
5) "observation_cues": A specific sentence for the teacher about what to watch for.
6) At the plan level, include "parent_connection_snippet".

Output format as JSON:
{
  "title": "Plan title",
  "overview": "Brief overview",
  "parent_connection_snippet": "Dear families...",
  "days": [
    {
      "day": 1,
      "theme_focus": "Sub-theme for the day",
      "activities": [
        {
          "name": "Activity name",
          "name_ms": "Nama aktiviti",
          "duration_minutes": 30,
          "learning_area": "Code",
          "standards_addressed": ["BM 1.1.1"],
          "learning_objective": "Children will be able to...",
          "description": "What children will do",
          "procedure": {
            "introduction": "Warm-up activity...",
            "activity": "Main learning steps...",
            "conclusion": "Reflection and closing..."
          },
          "materials": ["item1", "item2"],
          "teacher_notes": "How to facilitate",
          "expected_outcomes": "What children should demonstrate",
          "book_page": "",
          "differentiation_strategies": {
            "support_needed": "How to scaffold",
            "advanced_challenge": "Extension activity"
          },
          "provocation_questions": ["Question 1?", "Question 2?"],
          "observation_cues": "Specific behavior to watch for"
        }
      ]
    }
  ],
  "assessment_checklist": [
    {
      "standard_code": "BM 1.1.1",
      "indicator": "Observable behavior",
      "rating_scale": ["Belum Menguasai", "Sedang Menguasai", "Menguasai"]
    }
  ]
}`;

    const userPrompt = `Create a ${duration} lesson plan for ${ageGroup} year old preschoolers with the theme "${theme}".

Include daily activities that integrate multiple learning areas and align with the curriculum standards provided. Make activities engaging, play-based, and culturally relevant to Malaysia.${selectedMethodology !== "Default KP2026" ? ` Apply ${selectedMethodology} methodology throughout all activities.` : ""}

Remember: Every activity MUST include differentiation_strategies, provocation_questions, and observation_cues. Also include a parent_connection_snippet at the plan level.${
      teacherNotes ? `

IMPORTANT — TEACHER'S SPECIFIC EXPECTATIONS (you MUST address these):
${teacherNotes}

Incorporate the teacher's expectations above into the lesson plan activities as the TOP PRIORITY. Every expectation mentioned must be reflected in at least one activity. Do not ignore any of the teacher's input.` : ""
    }${
      resourceLinks && resourceLinks.length > 0 ? `

The teacher has provided these resources — reference them in relevant activities:
${resourceLinks.map((r: any) => `- ${r.label || r.url}: ${r.url}`).join("\n")}` : ""
    }`;

    // 5. Call Lovable AI Gateway
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content ?? "";

    // 6. Try to parse JSON from response
    let plan;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      plan = JSON.parse(jsonStr);
    } catch {
      plan = { title: theme, overview: content, days: [], assessment_checklist: [], parent_connection_snippet: "" };
    }

    // (Resource search already done above before prompt building)

    return new Response(JSON.stringify({ plan, recommendedWorksheets }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-lesson-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
