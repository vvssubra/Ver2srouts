import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { buildAssessmentContext, renderAssessmentContextBlock } from "../_shared/assessment-context.ts";

/**
 * generate-class-differentiation
 *
 * Given a class_id, pulls a compact snapshot of every active student
 * (baseline domain scores, latest assessment, 60-day observation rollup,
 * active goals) and asks the AI to produce per-child interventions for the
 * lesson plan teachers are about to run. The result is the personalisation
 * layer that turns ONE class lesson plan into something tweaked for every
 * child.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { class_id, lesson_plan_id } = await req.json();
    if (!class_id) {
      return new Response(JSON.stringify({ error: "class_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Roster: active students in this class.
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name, date_of_birth")
      .eq("class_id", class_id)
      .eq("is_active", true)
      .order("first_name")
      .limit(30);

    const studentIds = (students ?? []).map((s: any) => s.id);
    if (studentIds.length === 0) {
      return new Response(JSON.stringify({ per_student_interventions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Per-child context — keep it compact (token budget).
    const [
      { data: assessments },
      { data: rollups },
      { data: goals },
      { data: plan },
    ] = await Promise.all([
      supabase
        .from("baseline_assessments")
        .select("student_id, date_evaluated, assessment_type, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score, teacher_notes")
        .in("student_id", studentIds)
        .order("date_evaluated", { ascending: true }),
      supabase
        .from("v_child_progress_domain_rollup" as any)
        .select("student_id, domain_code, domain_name, observed_skill_count, secure_count, developing_count, emerging_count, average_status_score, last_observed_at")
        .in("student_id", studentIds),
      supabase
        .from("child_goals" as any)
        .select("student_id, scope, title, description")
        .in("student_id", studentIds)
        .eq("status", "active"),
      lesson_plan_id
        ? supabase
            .from("lesson_plans")
            .select("title, theme, age_group, generated_plan")
            .eq("id", lesson_plan_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Index for quick lookups.
    const firstByStudent = new Map<string, any>();
    const latestByStudent = new Map<string, any>();
    (assessments ?? []).forEach((a: any) => {
      if (!firstByStudent.has(a.student_id)) firstByStudent.set(a.student_id, a);
      latestByStudent.set(a.student_id, a);
    });
    const rollupsByStudent = new Map<string, any[]>();
    (rollups ?? []).forEach((r: any) => {
      const arr = rollupsByStudent.get(r.student_id) ?? [];
      arr.push(r);
      rollupsByStudent.set(r.student_id, arr);
    });
    const goalsByStudent = new Map<string, any[]>();
    (goals ?? []).forEach((g: any) => {
      const arr = goalsByStudent.get(g.student_id) ?? [];
      arr.push(g);
      goalsByStudent.set(g.student_id, arr);
    });

    const students_context = (students ?? []).map((s: any) => {
      const first = firstByStudent.get(s.id);
      const latest = latestByStudent.get(s.id);
      const roll = (rollupsByStudent.get(s.id) ?? []).map((r: any) => ({
        domain: r.domain_code,
        observed_skills: r.observed_skill_count,
        secure: r.secure_count,
        developing: r.developing_count,
        emerging: r.emerging_count,
        avg_status_score: r.average_status_score,
      }));
      const g = (goalsByStudent.get(s.id) ?? []).slice(0, 3).map((x: any) => ({
        scope: x.scope,
        title: x.title,
      }));
      return {
        student_id: s.id,
        name: `${s.first_name} ${s.last_name ?? ""}`.trim(),
        age_years: s.date_of_birth
          ? Math.floor((Date.now() - new Date(s.date_of_birth).getTime()) / 31557600000)
          : null,
        baseline_domain_scores: first?.domain_scores ?? {
          motor: first?.motor_skills_score,
          language: first?.language_score,
          socio: first?.socio_emotional_score,
          cognitive: first?.cognitive_score,
        },
        latest_domain_scores: latest?.domain_scores ?? null,
        latest_notes: latest?.teacher_notes?.slice(0, 240) ?? null,
        progress_rollup: roll,
        active_goals: g,
      };
    });

    // Cohort-level assessment + progress context (baseline vs latest delta, strongest/growing/regression).
    const cohortAssessment = await buildAssessmentContext(supabase, studentIds);
    const cohortBlock = renderAssessmentContextBlock(cohortAssessment);

    const lessonContext = plan
      ? {
          title: (plan as any).title,
          theme: (plan as any).theme,
          age_group: (plan as any).age_group,
          overview: (plan as any).generated_plan?.overview?.slice(0, 600) ?? null,
        }
      : null;

    const systemPrompt = `You are a world-class early childhood pedagogical expert. Given a class lesson plan and a roster of children (each with KSPK domain baseline, latest scores, 90-day observation rollup, and active parent/school goals), produce concise, actionable PER-CHILD differentiation.

Anchor every recommendation in the data provided. For each child, identify:
- 1–3 STRENGTHS (where they shine, used to peer-model)
- 1–3 GAP focus areas (lowest domains, regressions, or unmet goals)
- a DIFFERENTIATION tweak the teacher can do INSIDE the planned activities (NOT a new lesson) to make them accessible
- an EXTENSION challenge for children performing above the group
- specific OBSERVATION CUES the teacher should watch for during the activities

Tone: warm, professional, KSPK-aware. Use English. Avoid generic advice. Reply with STRICT JSON only, matching:
{
  "per_student_interventions": [
    {
      "student_id": "<uuid>",
      "name": "<as given>",
      "strengths": [string],
      "gap_focus": [string],
      "differentiation": string,
      "extension": string,
      "observation_cues": string
    }
  ]
}`;

    const userPrompt = `Lesson plan context:\n\`\`\`json\n${JSON.stringify(lessonContext, null, 2)}\n\`\`\`\n\nClass roster context:\n\`\`\`json\n${JSON.stringify(students_context, null, 2)}\n\`\`\`${cohortBlock}\n\nReturn the JSON now.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await resp.text();
      console.error("AI gateway error", resp.status, text);
      throw new Error(`AI gateway error: ${resp.status}`);
    }

    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = { per_student_interventions: [] }; }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-class-differentiation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});