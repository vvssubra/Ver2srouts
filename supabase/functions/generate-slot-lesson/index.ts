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

    const { subject_name, theme, age_group, class_name, timetable_slot_id, class_id, lesson_date, user_id } = await req.json();

    if (!subject_name || !theme || !timetable_slot_id || !class_id || !lesson_date || !user_id) {
      throw new Error("Missing required fields: subject_name, theme, timetable_slot_id, class_id, lesson_date, user_id");
    }

    // Skip non-teaching subjects
    const NON_TEACHING = ["Assembly", "Break"];
    if (NON_TEACHING.includes(subject_name)) {
      return new Response(JSON.stringify({ skipped: true, reason: `${subject_name} is a non-teaching slot` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get branch_id from class
    const { data: classData } = await supabase.from("classes").select("branch_id").eq("id", class_id).single();
    const branchId = classData?.branch_id;

    // Fetch school's adopted methodologies
    let methodologyContext = "";
    if (branchId) {
      const { data: branchMethods } = await supabase
        .from("branch_methodologies")
        .select("is_primary, methodology_frameworks(name, core_principles)")
        .eq("branch_id", branchId);

      if (branchMethods && branchMethods.length > 0) {
        const allNames = branchMethods.map((bm: any) => (bm.methodology_frameworks as any)?.name).filter(Boolean);
        const principles = branchMethods.map((bm: any) => {
          const fw = bm.methodology_frameworks as any;
          return fw ? `${fw.name}: ${fw.core_principles}` : "";
        }).filter(Boolean).join("\n");
        methodologyContext = `\n\nSCHOOL'S ADOPTED METHODOLOGIES: ${allNames.join(", ")}\n${principles}\nSelect the most appropriate methodology for this activity and explain why in "methodology_rationale".`;
      }
    }

    // 1. Subject-to-standard mapping — resolve parent for sub-subjects
    let effectiveSubject = subject_name;
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

    // Look up mapping — try exact match first, then parent
    const { data: mapping } = await supabase
      .from("subject_standard_map")
      .select("*")
      .eq("subject_name", subject_name)
      .single();

    // If sub-subject has a parent, also fetch parent mapping for broader standards
    let parentMapping = null;
    if (mapping?.parent_subject) {
      effectiveSubject = mapping.parent_subject;
      const { data: pm } = await supabase.from("subject_standard_map").select("*").eq("subject_name", mapping.parent_subject).single();
      parentMapping = pm;
    }

    const learningArea = (parentMapping || mapping)?.kp2026_learning_area || "General Learning";

    // 2. Fetch relevant curriculum standards
    const { data: learningAreas } = await supabase
      .from("learning_areas")
      .select("id, code, name_ms, name_en");

    const matchedArea = (learningAreas || []).find(
      (la: any) => la.name_en?.toLowerCase() === learningArea.toLowerCase() ||
        la.name_ms?.toLowerCase() === learningArea.toLowerCase()
    ) || (learningAreas || []).find(
      (la: any) => la.name_en?.toLowerCase().includes(learningArea.toLowerCase()) ||
        learningArea.toLowerCase().includes(la.name_en?.toLowerCase() || "###")
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

    // 3. STATEFUL: Memory retrieval — last 30 days coverage
    const lessonDateObj = new Date(lesson_date);
    const thirtyDaysAgo = new Date(lessonDateObj);
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

    // 4. STATEFUL: Gap retrieval
    const { data: gaps } = await supabase
      .from("student_gap_analysis")
      .select("*, students(first_name, last_name)")
      .eq("class_id", class_id)
      .in("remediation_status", ["pending", "in-progress"]);

    const subjectGaps = (gaps || []).filter((g: any) =>
      !g.gap_subject || g.gap_subject.toLowerCase() === subject_name.toLowerCase()
    );

    let gapContext = "";
    let gapJsonInstruction = "";
    if (subjectGaps.length > 0) {
      gapContext = `\n\nSTUDENT LEARNING GAPS (require targeted intervention):\n${subjectGaps.map((g: any) => {
        const name = g.students ? `${g.students.first_name} ${g.students.last_name}` : "Unknown Student";
        return `- ${name}: ${g.gap_description || "General gap"} (Standards: ${JSON.stringify(g.missing_standard_codes)})`;
      }).join("\n")}\nProvide specific scaffolding instructions for these students.`;
      gapJsonInstruction = `,
  "gap_interventions": [
    { "student_name": "Name", "gap": "Description", "suggested_activity": "Quick 5-min activity" }
  ]`;
    }

    // 5b. Fetch school resources for AI context
    let resourceContext = "";
    try {
      const searchTags = (theme || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      if (subject_name) searchTags.push(subject_name.toLowerCase());
      const slotAgeCode = `AGE${age_group?.toString().charAt(0) || "5"}`;
      const { data: resources } = await supabase.rpc("search_resources_for_ai", {
        p_branch_id: branchId || null,
        p_resource_types: ["book", "song", "activity", "worksheet"],
        p_age_groups: [slotAgeCode],
        p_search_tags: searchTags,
        p_match_count: 10,
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
        if (byType.worksheet?.length) sections.push(`Worksheets: ${byType.worksheet.map((w: any) => w.title).join(", ")}`);
        if (sections.length > 0) resourceContext = `\n\nSCHOOL RESOURCES (prefer these):\n${sections.join("\n")}`;
      }
    } catch (e) {
      console.error("Resource search error:", e);
    }

    // 5. Build the AI prompt
    const systemPrompt = `You are a world-class Early Childhood Curriculum Expert. You must map the traditional school subject to the official Malaysia KP2026 framework.

Subject: ${subject_name}
Mapped KP2026 Learning Area: ${learningArea}
Class: ${class_name || "Unknown"}
Age Group: ${age_group || "5+"} years old
${coverageContext}
${gapContext}${subSubjectFocus}

Relevant KP2026 Standards:
${standardsContext || "Use general standards for this learning area."}

STRICT RULE: Generate exactly ONE 30-minute activity for the subject "${subject_name}" that fulfills the holistic KP2026 learning area "${learningArea}".${methodologyContext}${resourceContext}

The activity MUST include:
1) "differentiation_strategies": An object with "support_needed" and "advanced_challenge"
2) "provocation_questions": An array of exactly 2 open-ended questions to spark child-led inquiry
3) "observation_cues": A specific sentence about what milestone/behavior to watch for
4) All standard activity fields: name, name_ms, description, materials, teacher_notes, expected_outcomes, standards_addressed

Output as JSON:
{
  "name": "Activity name",
  "name_ms": "Nama aktiviti",
  "duration_minutes": 30,
  "learning_area": "${learningArea}",
  "subject": "${subject_name}",
  "standards_addressed": ["CODE 1.1.1"],
  "description": "What children will do",
  "materials": ["item1", "item2"],
  "teacher_notes": "How to facilitate",
  "expected_outcomes": "What children should demonstrate",
  "differentiation_strategies": {
    "support_needed": "How to scaffold",
    "advanced_challenge": "Extension activity"
  },
  "provocation_questions": [
    "Open-ended question 1?",
    "Open-ended question 2?"
  ],
  "observation_cues": "Specific behavior to watch for"${gapJsonInstruction}
}`;

    const userPrompt = `Create a 30-minute ${subject_name} activity for ${age_group || "5+"} year old preschoolers with the weekly theme "${theme}". The activity must be play-based, hands-on, and culturally relevant to Malaysia.`;

    // 6. Call Lovable AI Gateway
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
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content ?? "";

    // 7. Parse JSON
    let activity;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      activity = JSON.parse(jsonStr);
    } catch {
      activity = { name: theme, description: content, duration_minutes: 30 };
    }

    // 8. Save to slot_lesson_plans
    const { data: saved, error: saveError } = await supabase
      .from("slot_lesson_plans")
      .insert({
        timetable_slot_id,
        class_id,
        lesson_date,
        theme,
        generated_activity: activity,
        mapped_learning_area: learningArea,
        mapped_standards: activity.standards_addressed || [],
        created_by: user_id,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      throw new Error(`Failed to save lesson: ${saveError.message}`);
    }

    // 9. Auto-log coverage
    if (branchId && activity.standards_addressed?.length > 0) {
      const weekStart = getWeekStart(lesson_date);
      const coverageInserts = activity.standards_addressed.map((code: string) => ({
        branch_id: branchId,
        class_id,
        subject_name,
        standard_code: code,
        week_starting: weekStart,
      }));
      await supabase.from("class_coverage_logs").insert(coverageInserts);
    }

    return new Response(JSON.stringify({ activity, saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-slot-lesson error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1); // Monday
  return d.toISOString().split("T")[0];
}
