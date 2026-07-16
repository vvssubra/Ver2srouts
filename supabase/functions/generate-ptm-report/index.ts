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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const {
      student_id,
      report_type = "summary",
      academic_year_id,
      academic_year_name,
      term_label,
      term_start,
      term_end,
      learning_journey_selection,
      highlight_selection,
    } = body;
    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id is required" }), { status: 400, headers: corsHeaders });
    }
    if (!academic_year_id || !term_label || !term_start || !term_end) {
      return new Response(
        JSON.stringify({ error: "academic_year_id, term_label, term_start and term_end are required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Fetch student
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("*")
      .eq("id", student_id)
      .single();
    if (studentErr || !student) {
      return new Response(JSON.stringify({ error: "Student not found" }), { status: 404, headers: corsHeaders });
    }

    // ------- Assessment Summary (Phase 1) -------
    // Read directly from the existing Assessment Module — no duplication, no mutation.
    const KSPK_DOMAINS = [
      { code: "CL", name: "Communication & Language",     legacy: "language_score" },
      { code: "EL", name: "Early Literacy" },
      { code: "NT", name: "Numeracy & Thinking",          legacy: "cognitive_score" },
      { code: "PM", name: "Physical & Motor Development", legacy: "motor_skills_score" },
      { code: "SE", name: "Social-Emotional & Self-Help", legacy: "socio_emotional_score" },
      { code: "CD", name: "Creativity & Discovery" },
      { code: "VC", name: "Values, Community & Belonging" },
    ] as const;
    const readScore = (row: any, d: (typeof KSPK_DOMAINS)[number]): number | null => {
      if (!row) return null;
      const ds = row.domain_scores ?? {};
      if (typeof ds?.[d.code] === "number") return ds[d.code];
      if ("legacy" in d && d.legacy && typeof row[d.legacy] === "number") return row[d.legacy];
      return null;
    };

    const { data: termAssessments, error: assessErr } = await supabase
      .from("baseline_assessments")
      .select("id, date_evaluated, assessment_type, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score, teacher_notes")
      .eq("student_id", student_id)
      .gte("date_evaluated", term_start)
      .lte("date_evaluated", term_end)
      .order("date_evaluated", { ascending: true });
    if (assessErr) {
      return new Response(JSON.stringify({ error: "Failed to load assessments" }), { status: 500, headers: corsHeaders });
    }

    const baselineRow = (termAssessments ?? [])[0] ?? null;
    const currentRow  = (termAssessments ?? [])[(termAssessments ?? []).length - 1] ?? null;

    if (!baselineRow) {
      return new Response(
        JSON.stringify({ error: "No Baseline Assessment recorded for the selected term. Complete an assessment in the Assessment Module first." }),
        { status: 422, headers: corsHeaders },
      );
    }
    if (!currentRow || currentRow.id === baselineRow.id) {
      return new Response(
        JSON.stringify({ error: "A second (current) Assessment is required in the selected term so progress can be compared." }),
        { status: 422, headers: corsHeaders },
      );
    }

    const comparisonRows = KSPK_DOMAINS.map((d) => {
      const b = readScore(baselineRow, d);
      const c = readScore(currentRow,  d);
      const delta = b !== null && c !== null ? Number((c - b).toFixed(2)) : null;
      const status =
        delta === null ? "no_data"
        : delta >= 0.3 ? "improved"
        : delta <= -0.3 ? "needs_support"
        : "maintained";
      return { code: d.code, name: d.name, baseline: b, current: c, delta, status };
    });

    const assessmentSummary = {
      academicYear: academic_year_name || null,
      termLabel: term_label,
      termStart: term_start,
      termEnd: term_end,
      baseline: { id: baselineRow.id, date_evaluated: baselineRow.date_evaluated, assessment_type: baselineRow.assessment_type ?? null },
      current:  { id: currentRow.id,  date_evaluated: currentRow.date_evaluated,  assessment_type: currentRow.assessment_type ?? null },
      rows: comparisonRows,
    };

    const finalTermName = `${academic_year_name ? academic_year_name + " · " : ""}${term_label}`;

    // Fetch observations with standards and learning areas
    const { data: observations } = await supabase
      .from("student_observations")
      .select("*, curriculum_standards(code, title_ms, title_en, learning_area_id, level)")
      .eq("student_id", student_id)
      .order("observed_at", { ascending: false });

    // Fetch learning areas
    const { data: areas } = await supabase
      .from("learning_areas")
      .select("*")
      .order("sort_order");

    // Fetch evidence from Phase 3 tables
    const { data: evidence } = await supabase
      .from("student_observation_evidence")
      .select("*, development_domains(name_en, code)")
      .eq("student_id", student_id)
      .order("observed_on", { ascending: false })
      .limit(50);

    // Fetch journey entries
    const { data: journeyEntries } = await supabase
      .from("daily_learning_journey_entries")
      .select("*")
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch new consolidated child_updates tagged for this student
    const { data: updateTags } = await supabase
      .from("child_update_students")
      .select("update_id")
      .eq("student_id", student_id);
    const updateIds = (updateTags || []).map((r: any) => r.update_id);
    let childUpdates: any[] = [];
    let highlightMoments: any[] = [];
    if (updateIds.length) {
      const { data } = await supabase
        .from("child_updates")
        .select("id, created_at, activity_date, caption, parent_summary, ai_learning_story, proficiency_level, milestone_flag, portfolio_candidate, subject_name, development_domains(name), child_update_media(url, kind, sort_order)")
        .in("id", updateIds)
        .eq("status", "shared")
        .order("created_at", { ascending: false })
        .limit(40);
      childUpdates = data ?? [];

      // Build highlight moments — prefer milestone or portfolio_candidate, with at least one photo
      highlightMoments = (childUpdates || [])
        .map((u: any) => {
          const media = (u.child_update_media || [])
            .filter((m: any) => m.kind === "photo" || m.kind === "image" || !m.kind)
            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const photo_url = media[0]?.url || null;
          return {
            update_id: u.id,
            date: u.activity_date || u.created_at,
            caption: u.caption || u.parent_summary || u.ai_learning_story || "",
            domain: u.development_domains?.name || u.subject_name || "General",
            milestone: !!u.milestone_flag,
            photo_url,
          };
        })
        .filter((h: any) => h.photo_url) // only with photos
        .sort((a: any, b: any) => {
          // milestones first, then by date desc
          if (a.milestone !== b.milestone) return a.milestone ? -1 : 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        })
        .slice(0, 9);
    }

    // Fetch recent lesson plans for the student's class
    const lessonPlanContext: string[] = [];
    if (student.class_id) {
      const { data: classPlans } = await supabase
        .from("lesson_plans")
        .select("title, theme, week_start, status")
        .eq("class_id", student.class_id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (classPlans?.length) {
        classPlans.forEach((lp: any) => {
          lessonPlanContext.push(`${lp.title} (Theme: ${lp.theme || "N/A"}, Week: ${lp.week_start || "N/A"}, Status: ${lp.status})`);
        });
      }
    }

    // Compute per-area summaries
    const proficiencyValue: Record<string, number> = { TP1: 1, TP2: 2, TP3: 3 };
    const areaSummaries = (areas || []).map((area: any) => {
      const areaObs = (observations || []).filter(
        (o: any) => o.curriculum_standards?.learning_area_id === area.id
      );
      const latestByStandard = new Map();
      areaObs.forEach((o: any) => {
        const existing = latestByStandard.get(o.standard_id);
        if (!existing || o.observed_at > existing.observed_at) {
          latestByStandard.set(o.standard_id, o);
        }
      });
      const assessed = latestByStandard.size;
      const values = Array.from(latestByStandard.values());
      const avgScore = assessed > 0
        ? values.reduce((s: number, o: any) => s + (proficiencyValue[o.proficiency_level] || 0), 0) / assessed
        : 0;
      const avgTP = avgScore >= 2.5 ? "TP3" : avgScore >= 1.5 ? "TP2" : avgScore > 0 ? "TP1" : "Not assessed";

      return {
        areaCode: area.code,
        areaNameMs: area.name_ms,
        areaNameEn: area.name_en || area.name_ms,
        assessed,
        avgScore: Math.round(avgScore * 100) / 100,
        avgTP,
        standards: values.map((o: any) => ({
          code: o.curriculum_standards?.code,
          titleMs: o.curriculum_standards?.title_ms,
          tp: o.proficiency_level,
          notes: o.notes,
        })),
      };
    });

    // Build prompt based on report_type
    const studentName = `${student.first_name} ${student.last_name}`;
    const typeInstruction = report_type === "detailed"
      ? "Generate a DETAILED PTM report with comprehensive domain-by-domain analysis, specific evidence references, and actionable strategies."
      : report_type === "talking_guide"
      ? "Generate a TEACHER TALKING GUIDE — bullet-point format organized by topic for the teacher to use during the PTM meeting. Include conversation starters, key points to discuss, and sensitive topics to handle carefully."
      : "Generate a concise PTM SUMMARY report that's warm, parent-friendly, and highlights key progress areas.";

    const prompt = `You are an empathetic early childhood educator writing a Parent-Teacher Meeting (PTM) report for a preschool student in Malaysia following the KP2026 curriculum.

${typeInstruction}

Student: ${studentName}
Date of Birth: ${student.date_of_birth || "Not recorded"}
Gender: ${student.gender || "Not recorded"}

Progress across Learning Areas:
${areaSummaries.map((a: any) => `${a.areaCode} - ${a.areaNameMs} (${a.areaNameEn}): Average Level = ${a.avgTP} (${a.avgScore}/3.0), ${a.assessed} standards assessed
  Standards: ${a.standards.map((s: any) => `${s.code}: ${s.titleMs} = ${s.tp}${s.notes ? ` (Note: ${s.notes})` : ""}`).join("; ")}`).join("\n\n")}

Recent evidence notes: ${(evidence || []).slice(0, 10).map((e: any) => `${e.development_domains?.name_en}: ${e.status} - ${e.evidence_note || "no note"}`).join("; ")}

Recent journey entries: ${(journeyEntries || []).slice(0, 5).map((j: any) => j.title).join("; ")}

Recent daily updates: ${(childUpdates || []).slice(0, 8).map((u: any) => `${(u as any).development_domains?.name || "General"}: ${u.ai_learning_story || u.parent_summary || u.caption || ""}`).join(" | ")}

${lessonPlanContext.length > 0 ? `Recent Class Lesson Plans:\n${lessonPlanContext.join("\n")}` : ""}

INSTRUCTIONS:
1. Use warm, parent-friendly language
2. Be encouraging — celebrate progress, even small wins
3. Be honest about areas needing support
4. Include specific, actionable suggestions
5. Use bilingual style (English with some Malay terms)
6. Reference recent lesson plans/themes when discussing the child's learning context`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), { status: 500, headers: corsHeaders });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an empathetic early childhood educator. Generate structured PTM reports." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_ptm_report",
              description: "Generate a structured PTM report",
              parameters: {
                type: "object",
                properties: {
                  overallNarrative: { type: "string", description: "Warm summary of overall progress (2-3 paragraphs)" },
                  strengthsCelebrations: { type: "array", items: { type: "string" }, description: "3-5 strengths" },
                  areasForSupport: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        area: { type: "string" },
                        description: { type: "string" },
                        suggestion: { type: "string" },
                      },
                      required: ["area", "description", "suggestion"],
                    },
                  },
                  atHomeActivities: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        materials: { type: "string" },
                        learningArea: { type: "string" },
                      },
                      required: ["title", "description", "materials", "learningArea"],
                    },
                  },
                  termName: { type: "string" },
                  teacherTalkingPoints: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key talking points for teacher during PTM",
                  },
                  evidenceHighlights: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific evidence-based highlights",
                  },
                  actionPlan: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string" },
                        owner: { type: "string", enum: ["teacher", "parent", "both"] },
                        timeline: { type: "string" },
                      },
                      required: ["action", "owner", "timeline"],
                    },
                  },
                },
                required: ["overallNarrative", "strengthsCelebrations", "areasForSupport", "atHomeActivities", "termName"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_ptm_report" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: corsHeaders });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), { status: 500, headers: corsHeaders });
    }

    const reportContent = JSON.parse(toolCall.function.arguments);
    // Attach highlight moments (photos) for the booklet view.
    // Phase 3: honor the teacher-approved selection when provided; otherwise
    // fall back to the server-computed set so older callers keep working.
    if (Array.isArray(highlight_selection) && highlight_selection.length > 0) {
      (reportContent as any).highlightMoments = (highlight_selection as any[])
        .filter((h: any) => h && h.photo_url)
        .map((h: any) => ({
          update_id: h.update_id,
          date: h.date,
          caption: h.caption ?? "",
          domain: h.domain ?? "General",
          milestone: !!h.milestone,
          photo_url: h.photo_url,
        }));
    } else {
      (reportContent as any).highlightMoments = highlightMoments;
    }
    (reportContent as any).areaSummaries = areaSummaries;
    (reportContent as any).assessmentSummary = assessmentSummary;

    // ------- Learning Journey timeline (Phase 2) -------
    // Re-read directly from the Learning Journey / Observation tables inside the
    // selected term so nothing is fabricated server-side. If the client sent a
    // teacher-approved selection, we intersect against it and preserve that order.
    const journeyStartTs = `${term_start}T00:00:00`;
    const journeyEndTs   = `${term_end}T23:59:59`;
    const [{ data: termJourney }, { data: termObs }] = await Promise.all([
      supabase
        .from("daily_learning_journey_entries")
        .select("id, created_at, title, teacher_note, entry_type, development_domains(name)")
        .eq("student_id", student_id)
        .gte("created_at", journeyStartTs)
        .lte("created_at", journeyEndTs),
      supabase
        .from("student_observations")
        .select("id, observed_at, proficiency_level, notes, curriculum_standards(code, title_ms, title_en)")
        .eq("student_id", student_id)
        .gte("observed_at", term_start)
        .lte("observed_at", term_end),
    ]);

    const allJourney: any[] = [];
    for (const j of (termJourney ?? []) as any[]) {
      allJourney.push({
        key: `journey:${j.id}`,
        source: "journey",
        id: j.id,
        date: (j.created_at || "").slice(0, 10),
        title: j.title || "Learning Journey entry",
        domain: j.development_domains?.name ?? null,
        tpLevel: null,
        teacherNote: j.teacher_note ?? null,
        entryType: j.entry_type ?? null,
      });
    }
    for (const o of (termObs ?? []) as any[]) {
      const std = o.curriculum_standards;
      const title = std?.title_en || std?.title_ms || std?.code || "Curriculum observation";
      const tp = ["TP1", "TP2", "TP3"].includes(o.proficiency_level) ? o.proficiency_level : null;
      allJourney.push({
        key: `observation:${o.id}`,
        source: "observation",
        id: o.id,
        date: o.observed_at,
        title,
        domain: std?.code ? `Standard ${std.code}` : null,
        tpLevel: tp,
        teacherNote: o.notes ?? null,
        entryType: "observation",
      });
    }

    const byKey = new Map(allJourney.map((i: any) => [i.key, i]));
    let orderedJourney: any[];
    if (Array.isArray(learning_journey_selection) && learning_journey_selection.length > 0) {
      orderedJourney = (learning_journey_selection as any[])
        .map((s: any) => byKey.get(s?.key))
        .filter(Boolean);
    } else {
      orderedJourney = allJourney.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    }

    (reportContent as any).learningJourney = {
      termLabel: term_label,
      academicYear: academic_year_name || null,
      totalAvailable: allJourney.length,
      items: orderedJourney,
    };

    // Force the human-readable term label to reflect the selected Academic Year + Term.
    (reportContent as any).termName = finalTermName;

    // Save to ptm_reports with structured columns
    const { data: saved, error: saveErr } = await supabase
      .from("ptm_reports")
      .insert({
        student_id,
        branch_id: student.branch_id,
        class_id: student.class_id || null,
        term_name: finalTermName,
        academic_term: finalTermName,
        report_type,
        generated_content: reportContent,
        strengths_json: reportContent.strengthsCelebrations,
        support_areas_json: reportContent.areasForSupport,
        evidence_summary_json: reportContent.evidenceHighlights || [],
        parent_support_json: reportContent.atHomeActivities,
        action_plan_json: reportContent.actionPlan || [],
        status: "draft",
        generated_by: userId,
      } as any)
      .select()
      .single();

    if (saveErr) {
      console.error("Save error:", saveErr);
      return new Response(JSON.stringify({ error: "Failed to save report", report: reportContent }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ report: saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("PTM report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
