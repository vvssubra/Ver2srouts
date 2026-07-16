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

    const { class_id, subject_name, theme, week_starting, user_id, tunjang_override, teacher_notes, domain_focus, weekly_focus_title, weekly_objectives, monthly_theme, provocations, month_plan_id, week_plan_id } = await req.json();

    if (!class_id || !subject_name || !theme || !week_starting || !user_id) {
      throw new Error("Missing required fields: class_id, subject_name, theme, week_starting, user_id");
    }

    // Skip non-teaching subjects
    const NON_TEACHING = ["Assembly", "Break"];
    if (NON_TEACHING.includes(subject_name)) {
      return new Response(JSON.stringify({ skipped: true, reason: `${subject_name} is a non-teaching slot` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get class info
    const { data: classData } = await supabase
      .from("classes")
      .select("*, branches(id)")
      .eq("id", class_id)
      .single();

    if (!classData) throw new Error("Class not found");

    const branchId = classData.branch_id;
    const ageGroup = classData.age_group || "5+";
    const className = classData.class_name;

    // 2. Get timetable slots — prefer published daily slots for the week, fallback to template
    const weekEnd = new Date(week_starting);
    weekEnd.setDate(weekEnd.getDate() + 4);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    let slots: any[] | null = null;

    // Try published daily timetable first
    const { data: dailySlots } = await supabase
      .from("daily_timetable_slots")
      .select("id, class_id, slot_date, start_time, end_time, subject_name")
      .eq("class_id", class_id)
      .eq("subject_name", subject_name)
      .gte("slot_date", week_starting)
      .lte("slot_date", weekEndStr)
      .order("slot_date")
      .order("start_time");

    if (dailySlots && dailySlots.length > 0) {
      // Map daily slots to have day_of_week derived from slot_date
      slots = dailySlots.map((s: any) => {
        const d = new Date(s.slot_date);
        const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon...7=Sun
        return { ...s, day_of_week: dow };
      });
    } else {
      // Fallback to template slots
      const { data: templateSlots } = await supabase
        .from("timetable_slots")
        .select("*")
        .eq("class_id", class_id)
        .eq("subject_name", subject_name)
        .order("day_of_week")
        .order("start_time");
      slots = templateSlots;
    }

    if (!slots || slots.length === 0) {
      return new Response(JSON.stringify({ error: `No timetable found for ${subject_name} in this class for the week of ${week_starting}. Please ensure the timetable is published.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Merge consecutive slots per day
    type MergedSlot = { day_of_week: number; start_time: string; end_time: string; duration_minutes: number; slot_ids: string[] };
    const mergedByDay: Record<number, MergedSlot[]> = {};

    for (const slot of slots) {
      const day = slot.day_of_week;
      if (!mergedByDay[day]) mergedByDay[day] = [];
      const existing = mergedByDay[day];
      const last = existing[existing.length - 1];

      if (last && last.end_time === slot.start_time) {
        // Consecutive — merge
        last.end_time = slot.end_time;
        last.duration_minutes += 30;
        last.slot_ids.push(slot.id);
      } else {
        existing.push({
          day_of_week: day,
          start_time: slot.start_time,
          end_time: slot.end_time,
          duration_minutes: 30,
          slot_ids: [slot.id],
        });
      }
    }

    // 4. Subject-to-standard mapping — resolve sub-subjects
    let subSubjectFocus = "";
    const SUB_SUBJECT_FOCUS: Record<string, string> = {
      "English - Spelling": "This is a SPELLING-focused session. Focus ALL activities on spelling, word building, letter patterns, dictation, phonics-to-spelling links, and spelling games. Do NOT plan a general English session.",
      "English - Reading": "This is a READING-focused session. Focus ALL activities on reading comprehension, phonics blending, shared reading, guided reading, sight words, and reading fluency. Do NOT plan a general English session.",
      "Bahasa Melayu - Ejaan": "Ini sesi EJAAN. Fokuskan SEMUA aktiviti pada ejaan, pembinaan perkataan, corak suku kata, dan permainan ejaan Bahasa Melayu. Jangan rancang sesi Bahasa Melayu umum.",
      "Bahasa Melayu - Bacaan": "Ini sesi BACAAN. Fokuskan SEMUA aktiviti pada pemahaman bacaan, bacaan berpandu, pengecaman perkataan, dan kelancaran membaca Bahasa Melayu. Jangan rancang sesi Bahasa Melayu umum.",
    };
    if (SUB_SUBJECT_FOCUS[subject_name]) {
      subSubjectFocus = `\n\nSUB-SUBJECT FOCUS:\n${SUB_SUBJECT_FOCUS[subject_name]}`;
    }

    const { data: mapping } = await supabase
      .from("subject_standard_map")
      .select("*")
      .eq("subject_name", subject_name)
      .single();

    // If sub-subject, also get parent mapping for broader standards
    let parentMapping = null;
    if (mapping?.parent_subject) {
      const { data: pm } = await supabase.from("subject_standard_map").select("*").eq("subject_name", mapping.parent_subject).single();
      parentMapping = pm;
    }

    // Resolve domain focus: support "domain:Name" prefix for school domains vs KSPK learning areas
    let resolvedDomainFocus = "";
    if (domain_focus) {
      resolvedDomainFocus = domain_focus.startsWith("domain:") ? domain_focus.replace("domain:", "") : domain_focus;
    }
    const learningArea = resolvedDomainFocus || tunjang_override || (parentMapping || mapping)?.kp2026_learning_area || "General Learning";

    // 5. Fetch curriculum standards
    const { data: learningAreas } = await supabase
      .from("learning_areas")
      .select("id, code, name_ms, name_en");

    // Normalize names: strip "&" / "and" / extra whitespace for robust matching
    // (e.g. "Language and Literacy" should match "Language & Literacy")
    const normalize = (s: string | null | undefined) =>
      (s || "")
        .toLowerCase()
        .replace(/\s*&\s*/g, " ")
        .replace(/\s+and\s+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const targetNorm = normalize(learningArea);
    const matchedArea = (learningAreas || []).find(
      (la: any) => normalize(la.name_en) === targetNorm || normalize(la.name_ms) === targetNorm
    ) || (learningAreas || []).find(
      (la: any) =>
        normalize(la.name_en).includes(targetNorm) ||
        targetNorm.includes(normalize(la.name_en) || "###")
    );

    let standardsContext = "";
    if (matchedArea) {
      const { data: standards } = await supabase
        .from("curriculum_standards")
        .select("code, title_ms, notes, level")
        .eq("learning_area_id", matchedArea.id)
        .order("sort_order")
        .limit(30);

      standardsContext = (standards || [])
        .map((s: any) => `- [${s.code}] ${s.title_ms}${s.notes ? ` (${s.notes})` : ""}`)
        .join("\n");
    }

    // 6. STATEFUL: Memory retrieval — last 30 days coverage
    const thirtyDaysAgo = new Date(week_starting);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: coverageLogs } = await supabase
      .from("class_coverage_logs")
      .select("standard_code, week_starting")
      .eq("class_id", class_id)
      .eq("subject_name", subject_name)
      .gte("week_starting", thirtyDaysAgo.toISOString().split("T")[0])
      .order("week_starting", { ascending: false });

    const coveredStandards = [...new Set((coverageLogs || []).map((l: any) => l.standard_code))];
    const coverageContext = coveredStandards.length > 0
      ? `\n\nPREVIOUSLY COVERED STANDARDS (last 4 weeks):\n${coveredStandards.map(c => `- ${c}`).join("\n")}\nDo NOT repeat these. Generate the NEXT logical progression.`
      : "\n\nNo previous coverage data found. Start from foundational concepts.";

    // 7. STATEFUL: Gap retrieval + CLUSTERING into intervention groups
    const { data: gaps } = await supabase
      .from("student_gap_analysis")
      .select("*, students(first_name, last_name)")
      .eq("class_id", class_id)
      .in("remediation_status", ["pending", "in-progress"]);

    const subjectGaps = (gaps || []).filter((g: any) =>
      !g.gap_subject || g.gap_subject.toLowerCase() === subject_name.toLowerCase()
    );

    // Cluster students with identical missing_standard_codes into intervention groups
    type InterventionGroup = { group_name: string; students: string[]; shared_gaps: string[]; shared_standard_codes: string[]; suggested_group_activity: string };
    const interventionGroups: InterventionGroup[] = [];
    const clusterMap = new Map<string, any[]>();

    for (const g of subjectGaps) {
      const key = JSON.stringify((g.missing_standard_codes || []).slice().sort());
      if (!clusterMap.has(key)) clusterMap.set(key, []);
      clusterMap.get(key)!.push(g);
    }

    let groupIdx = 0;
    const groupLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const [key, members] of clusterMap.entries()) {
      const name = members.length > 1
        ? `Group ${groupLetters[groupIdx] || groupIdx + 1}`
        : `Individual — ${members[0].students?.first_name || "Student"}`;
      interventionGroups.push({
        group_name: name,
        students: members.map((m: any) => m.students ? `${m.students.first_name} ${m.students.last_name}` : "Unknown"),
        shared_gaps: [...new Set(members.map((m: any) => m.gap_description || "General gap"))],
        shared_standard_codes: JSON.parse(key),
        suggested_group_activity: "", // AI will fill this
      });
      groupIdx++;
    }

    let gapContext = "";
    if (interventionGroups.length > 0) {
      gapContext = `\n\nSTUDENT INTERVENTION GROUPS (clustered by shared missing standards):\n${interventionGroups.map((g) => {
        return `- ${g.group_name} (${g.students.join(", ")}): Gaps: ${g.shared_gaps.join("; ")} | Standards: ${g.shared_standard_codes.join(", ")}`;
      }).join("\n")}\nFor EACH day, include "gap_interventions" for individual students AND return a top-level "intervention_groups" array with {group_name, students, shared_gaps, shared_standard_codes, suggested_group_activity} for clustered small-group work.`;
    }

    // Teacher notes context is now in the user prompt for stronger enforcement

    // Fetch term objectives from monthly plan's focus_outcomes
    let termObjectivesContext = "";
    if (month_plan_id) {
      try {
        const { data: mp } = await supabase
          .from("curriculum_month_plans")
          .select("focus_outcomes")
          .eq("id", month_plan_id)
          .single();
        if (mp) {
          const focusOutcomes = (mp as any).focus_outcomes;
          let outcomeIds: string[] = [];
          if (Array.isArray(focusOutcomes) && focusOutcomes.length > 0) {
            outcomeIds = focusOutcomes;
          }
          if (outcomeIds.length > 0) {
            const { data: objectives } = await supabase
              .from("lesson_objectives")
              .select("code, title, development_domains(name)")
              .eq("is_active", true)
              .in("yearly_outcome_id", outcomeIds)
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

    // Weekly planner context
    let weeklyPlannerContext = "";
    if (monthly_theme || weekly_focus_title) {
      weeklyPlannerContext = "\n\nWEEKLY PLANNER CONTEXT:";
      if (monthly_theme) weeklyPlannerContext += `\n- Monthly Theme: ${monthly_theme}`;
      if (weekly_focus_title) weeklyPlannerContext += `\n- Week Focus: ${weekly_focus_title}`;
      if (weekly_objectives && weekly_objectives.length > 0) weeklyPlannerContext += `\n- Weekly Objectives: ${weekly_objectives.join("; ")}`;
      if (provocations && provocations.length > 0) weeklyPlannerContext += `\n- Provocations/Inquiry Questions: ${provocations.join("; ")}`;
      weeklyPlannerContext += "\nAlign ALL activities with the weekly focus and provocations above.";
    }

    // Fetch weekly focus objectives if week_plan_id provided
    let weeklyFocusObjectivesContext = "";
    if (week_plan_id) {
      try {
        const { data: wfo } = await supabase
          .from("weekly_focus_objectives")
          .select("priority, lesson_objectives(code, title, development_domains(name))")
          .eq("week_plan_id", week_plan_id);
        if (wfo && wfo.length > 0) {
          weeklyFocusObjectivesContext = `\n\nWEEKLY TERM OBJECTIVES (teacher's chosen focus — prioritize these in activities):\n${(wfo as any[]).map((o: any) =>
            `- [${o.priority?.toUpperCase()}] ${o.lesson_objectives?.code}: ${o.lesson_objectives?.title} [${o.lesson_objectives?.development_domains?.name || "General"}]`
          ).join("\n")}`;
        }
      } catch (e) {
        console.error("Weekly focus objectives fetch error:", e);
      }
    }

    // School domain focus context
    let domainContext = "";
    if (resolvedDomainFocus && resolvedDomainFocus !== learningArea) {
      domainContext = `\n\nSCHOOL DOMAIN FOCUS: ${resolvedDomainFocus}\nEnsure activities also address this school-specific development domain alongside KSPK standards.`;
    }

    // 8b. Fetch school resources for subject-specific AI context
    let resourceContext = "";
    try {
      const ageCode = `AGE${ageGroup?.toString().charAt(0) || "5"}`;
      const searchTags = theme.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      searchTags.push(subject_name.toLowerCase());

      const { data: resources } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: branchId || null,
        p_resource_types: ["book", "song", "activity", "worksheet"],
        p_age_groups: [ageCode],
        p_search_tags: searchTags,
        p_match_count: 10,
      });

      if (resources && resources.length > 0) {
        const items = resources.map((r: any) => `- [${r.resource_type}] "${r.title}"${r.content_text ? `: ${r.content_text.substring(0, 80)}` : ""}`);
        resourceContext = `\n\nSCHOOL RESOURCES for ${subject_name} (prefer these):\n${items.join("\n")}`;
      }
    } catch (e) {
      console.error("Resource search error:", e);
    }

    // 8. Build day descriptions for the prompt
    const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const dayDescriptions = Object.entries(mergedByDay)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([day, merged]) => {
        return merged.map(m =>
          `${dayNames[Number(day)]}: ${m.start_time.slice(0, 5)}-${m.end_time.slice(0, 5)} (${m.duration_minutes} minutes)`
        ).join("\n");
      }).join("\n");

    // 9. Build AI prompt
    const systemPrompt = `You are a world-class Early Childhood Curriculum Expert aligned with Malaysia KP2026 framework.

Subject: ${subject_name}
KP2026 Learning Area: ${learningArea}
Class: ${className}
Age Group: ${ageGroup} years old
Theme: ${theme}

Relevant KP2026 Standards:
${standardsContext || "Use general standards for this learning area."}
${coverageContext}
${gapContext}
${weeklyPlannerContext}
${domainContext}
${resourceContext}${subSubjectFocus}
${termObjectivesContext}
${weeklyFocusObjectivesContext}

SCHEDULE FOR THIS WEEK:
${dayDescriptions}

STRICT RULES:
1. Generate ONE activity per scheduled time slot above. Match the duration exactly.
2. Each activity MUST include ALL of these fields:
   - name, name_ms, duration_minutes, learning_area, subject, standards_addressed
   - description: What children will do
   - materials: Array of items needed
   - teacher_notes: How to facilitate
   - expected_outcomes: What children should demonstrate
   - learning_objective: A clear, measurable learning objective for this activity
   - procedure: An object with "introduction" (~5 min opener), "activity" (main hands-on task), and "conclusion" (~5 min wrap-up/reflection)
   - book_page: Reference page or "N/A"
   - differentiation_strategies: { support_needed, advanced_challenge }
   - provocation_questions: Array of 2 open-ended questions
   - observation_cues: Specific behavior to watch for
${subjectGaps.length > 0 ? '3. Each day MUST include "gap_interventions": array of {student_name, gap, suggested_activity} for students with known gaps.' : ""}

Output as JSON:
{
  "days": [
    {
      "day_of_week": 1,
      "day_name": "Monday",
      "activities": [
        {
          "name": "Activity name",
          "name_ms": "Nama aktiviti",
          "duration_minutes": 30,
          "learning_area": "${learningArea}",
          "subject": "${subject_name}",
          "standards_addressed": ["CODE"],
          "description": "What children will do",
          "learning_objective": "Children will be able to...",
          "procedure": {
            "introduction": "Teacher gathers children...",
            "activity": "Children work on...",
            "conclusion": "Children share their..."
          },
          "book_page": "N/A",
          "materials": ["item1"],
          "teacher_notes": "How to facilitate",
          "expected_outcomes": "What children should demonstrate",
          "differentiation_strategies": { "support_needed": "...", "advanced_challenge": "..." },
          "provocation_questions": ["Q1?", "Q2?"],
          "observation_cues": "Specific behavior to watch"
        }
      ],
      "gap_interventions": []
    }
  ],
  "intervention_groups": [
    {
      "group_name": "Group A",
      "students": ["Student1", "Student2"],
      "shared_gaps": ["Description of shared gap"],
      "shared_standard_codes": ["CODE1"],
      "suggested_group_activity": "A specific small-group activity"
    }
  ]
}`;

    // Build user prompt — teacher notes FIRST for maximum AI attention
    let userPrompt: string;
    if (teacher_notes && teacher_notes.trim()) {
      userPrompt = `⚠️ CRITICAL TEACHER INSTRUCTIONS — YOU MUST FOLLOW THESE:\n\nThe teacher has provided specific expectations and needs:\n"${teacher_notes.trim()}"\n\nYou MUST design EVERY activity to directly address these teacher expectations. The teacher's guidance takes ABSOLUTE precedence over generic suggestions.\n\nNow create ${subject_name} activities for ${ageGroup} year old preschoolers for this week with the theme "${theme}". Activities must be play-based, hands-on, and culturally relevant to Malaysia. Follow the exact schedule provided. Every activity MUST include a learning_objective, a 3-phase procedure (introduction, activity, conclusion), and book_page reference.`;
    } else {
      userPrompt = `Create ${subject_name} activities for ${ageGroup} year old preschoolers for this week with the theme "${theme}". Activities must be play-based, hands-on, and culturally relevant to Malaysia. Follow the exact schedule provided. Every activity MUST include a learning_objective, a 3-phase procedure (introduction, activity, conclusion), and book_page reference.`;
    }

    // 10. Call AI
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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content ?? "";

    let weekPlan;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      weekPlan = JSON.parse(jsonStr);
    } catch {
      weekPlan = { days: [] };
    }

    // 11. Save each day's activities to slot_lesson_plans + log coverage
    const savedLessons: any[] = [];
    const coverageInserts: any[] = [];

    for (const dayPlan of (weekPlan.days || [])) {
      const dayNum = dayPlan.day_of_week;
      const mergedSlots = mergedByDay[dayNum] || [];

      for (let i = 0; i < (dayPlan.activities || []).length && i < mergedSlots.length; i++) {
        const activity = dayPlan.activities[i];
        const merged = mergedSlots[i];
        const primarySlotId = merged.slot_ids[0];

        // Save to slot_lesson_plans (use first slot ID as reference)
        const { data: saved, error: saveErr } = await supabase
          .from("slot_lesson_plans")
          .insert({
            timetable_slot_id: primarySlotId,
            class_id,
            lesson_date: getDateForDayOfWeek(week_starting, dayNum),
            theme,
            generated_activity: { ...activity, gap_interventions: dayPlan.gap_interventions || [] },
            mapped_learning_area: learningArea,
            mapped_standards: activity.standards_addressed || [],
            created_by: user_id,
          })
          .select()
          .single();

        if (saved) savedLessons.push(saved);
        if (saveErr) console.error("Save error:", saveErr);

        // Log covered standards
        for (const code of (activity.standards_addressed || [])) {
          coverageInserts.push({
            branch_id: branchId,
            class_id,
            subject_name,
            standard_code: code,
            week_starting,
          });
        }
      }
    }

    // Batch insert coverage logs
    if (coverageInserts.length > 0) {
      await supabase.from("class_coverage_logs").insert(coverageInserts);
    }

    return new Response(JSON.stringify({ weekPlan, savedLessons, mergedSlots: mergedByDay, interventionGroups: weekPlan.intervention_groups || interventionGroups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-weekly-subject-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getDateForDayOfWeek(weekStarting: string, dayOfWeek: number): string {
  const start = new Date(weekStarting);
  const startDay = start.getDay() || 7; // Convert Sunday=0 to 7
  const diff = dayOfWeek - startDay;
  const target = new Date(start);
  target.setDate(target.getDate() + diff);
  return target.toISOString().split("T")[0];
}
