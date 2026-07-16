import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { buildAssessmentContext } from "../_shared/assessment-context.ts";

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { student_id } = await req.json();
    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [
      { data: student },
      { data: assessments },
      { data: progressRollup },
      { data: skillProgress },
      { data: goals },
      assessmentCtx,
    ] = await Promise.all([
      supabase.from("students").select("first_name, last_name, date_of_birth").eq("id", student_id).single(),
      supabase.from("baseline_assessments").select("*").eq("student_id", student_id).order("date_evaluated", { ascending: true }),
      (supabase as any).from("v_child_progress_domain_rollup").select("*").eq("student_id", student_id),
      (supabase as any)
        .from("child_skill_progress")
        .select("domain_id, indicator_label, current_status, evidence_count, last_observed_at, confidence_score")
        .eq("student_id", student_id)
        .order("last_observed_at", { ascending: false })
        .limit(60),
      supabase.from("child_goals").select("*").eq("student_id", student_id).eq("status", "active"),
      buildAssessmentContext(supabase, [student_id]).catch(() => null),
    ]);

    const childName = `${student?.first_name ?? "the child"} ${student?.last_name ?? ""}`.trim();
    const first = (assessments ?? [])[0];
    const latest = (assessments ?? [])[(assessments ?? []).length - 1];

    // Batch 6B-4 — compact Objective Catalogue context for this child's age.
    // Includes recently observed catalogue objectives (top growing) and a
    // small "not yet observed" sample for the AI to suggest as next focus.
    let catalogue_context: any = null;
    try {
      if (student?.date_of_birth) {
        const dob = new Date(student.date_of_birth as string);
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const m = now.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
        if (age >= 2 && age <= 6) {
          const { data: ap } = await supabase
            .from("age_profiles").select("id").eq("age_group", age).maybeSingle();
          if (ap?.id) {
            const { data: catObjs } = await supabase
              .from("curriculum_objectives")
              .select("id, parent_title, teacher_title, development_domains(code)")
              .eq("age_profile_id", ap.id).eq("is_active", true).order("sort_order");
            const objs = (catObjs ?? []) as any[];
            const { data: linked } = await (supabase as any)
              .from("child_skill_progress")
              .select("curriculum_objective_id, current_status, evidence_count")
              .eq("student_id", student_id)
              .not("curriculum_objective_id", "is", null);
            const linkedById = new Map<string, any>();
            (linked ?? []).forEach((r: any) => linkedById.set(r.curriculum_objective_id, r));
            const observed = objs
              .filter((o) => linkedById.has(o.id))
              .slice(0, 12)
              .map((o) => ({
                domain: (o.development_domains as any)?.code,
                parent_title: o.parent_title,
                teacher_title: o.teacher_title,
                status: linkedById.get(o.id)?.current_status,
                evidence_count: linkedById.get(o.id)?.evidence_count,
              }));
            const notYet = objs
              .filter((o) => !linkedById.has(o.id))
              .slice(0, 8)
              .map((o) => ({
                domain: (o.development_domains as any)?.code,
                parent_title: o.parent_title,
                teacher_title: o.teacher_title,
              }));
            catalogue_context = { age, observed_official_objectives: observed, not_yet_observed_sample: notYet };
          }
        }
      }
    } catch (_e) { /* non-fatal */ }

    const context = {
      child: childName,
      assessment_count: assessments?.length ?? 0,
      initial: first ? {
        date: first.date_evaluated,
        motor: first.motor_skills_score,
        language: first.language_score,
        socio_emotional: first.socio_emotional_score,
        cognitive: first.cognitive_score,
      } : null,
      latest: latest ? {
        date: latest.date_evaluated,
        motor: latest.motor_skills_score,
        language: latest.language_score,
        socio_emotional: latest.socio_emotional_score,
        cognitive: latest.cognitive_score,
        notes: latest.teacher_notes,
      } : null,
      // Batch 6E — new progress engine rollup (replaces legacy v_student_domain_rollup).
      progress_engine_rollup: (progressRollup ?? []).map((r: any) => ({
        domain: r.domain_name, code: r.domain_code,
        observed_skills: r.observed_skill_count,
        evidence_count: r.evidence_count,
        secure: r.secure_count, developing: r.developing_count, emerging: r.emerging_count,
        not_yet: r.not_yet_count,
        last_observed_at: r.last_observed_at,
        avg_status_score: r.average_status_score,
      })),
      recent_skill_evidence: (skillProgress ?? []).slice(0, 20).map((s: any) => ({
        skill: s.indicator_label, status: s.current_status,
        evidence_count: s.evidence_count, last_observed: s.last_observed_at,
        confidence: s.confidence_score,
      })),
      assessment_trend: assessmentCtx?.domain_trends ?? [],
      active_goals: (goals ?? []).map((g: any) => ({
        scope: g.scope, title: g.title, description: g.description, target_date: g.target_date,
      })),
    };
    if (catalogue_context) {
      (context as any).catalogue_context = catalogue_context;
    }

    const systemPrompt = `You are an experienced early childhood educator analyzing a child's developmental growth. Output STRICT JSON only, no prose, matching this schema:
{
  "strengths": string[],          // 2-3 short bullets (max 12 words each) describing where the child shines
  "emerging": string[],           // 2-3 short bullets describing areas still developing
  "suggested_focus": string[],    // 2-3 specific, play-based next-step focus areas the teacher should plan for
  "parent_goal_status": { "goal": string, "status": "on_track" | "needs_support" | "achieved", "note": string }[],
  "next_focus_suggestion": {
    "focus_title": string,        // <= 80 chars, single concrete focus for next 1-2 weeks
    "focus_description": string,  // 1-2 sentences, warm, parent-friendly
    "vocabulary": string[],       // up to 5 simple English words
    "home_support": string[],     // 1-3 parent-friendly home actions
    "observation_cues": string[]  // 1-3 teacher-facing cues
  }
}
Anchor every observation in the provided data. Tone: warm, professional, KSPK/early-years aware. Reply with JSON ONLY.`;

    const userPrompt = `Child growth data:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\nReturn the JSON summary now.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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
      console.error("AI gateway error:", resp.status, text);
      throw new Error(`AI gateway error: ${resp.status}`);
    }

    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    let parsed: any = {};
    try { parsed = JSON.parse(cleaned); } catch { parsed = { strengths: [], emerging: [], suggested_focus: [raw], parent_goal_status: [] }; }

    // Batch 6F-C — upsert AI suggested Next Focus.
    // Only insert when no current-week focus exists, or existing focus is still
    // `suggested` AND not reviewed. Never overwrite reviewed / approved / manual focus.
    try {
      const ns = parsed?.next_focus_suggestion;
      if (ns && typeof ns.focus_title === "string" && ns.focus_title.trim().length > 0 && student) {
        const week = (() => {
          const x = new Date();
          x.setUTCHours(0, 0, 0, 0);
          const day = x.getUTCDay() || 7;
          x.setUTCDate(x.getUTCDate() - (day - 1));
          return x.toISOString().slice(0, 10);
        })();
        // Fetch student metadata (branch, class).
        const { data: stu } = await supabase
          .from("students")
          .select("branch_id, class_id")
          .eq("id", student_id)
          .single();
        // Check existing current-week focus.
        const { data: existing } = await (supabase as any)
          .from("child_next_focus")
          .select("id, status, reviewed_at, source")
          .eq("student_id", student_id)
          .eq("week_starting", week)
          .maybeSingle();
        const canWrite =
          !existing ||
          (existing.status === "suggested" &&
            !existing.reviewed_at &&
            existing.source === "ai_growth_summary");
        if (stu?.branch_id && canWrite) {
          const payload = {
            branch_id: stu.branch_id,
            class_id: stu.class_id,
            student_id,
            source: "ai_growth_summary",
            focus_title: String(ns.focus_title).slice(0, 200),
            focus_description: ns.focus_description ? String(ns.focus_description).slice(0, 600) : null,
            vocabulary_json: Array.isArray(ns.vocabulary) ? ns.vocabulary.slice(0, 5) : [],
            home_support_json: Array.isArray(ns.home_support) ? ns.home_support.slice(0, 3) : [],
            observation_cues_json: Array.isArray(ns.observation_cues) ? ns.observation_cues.slice(0, 3) : [],
            skill_labels_json: [],
            domain_ids_json: [],
            status: "suggested",
            visible_to_parent: false,
            week_starting: week,
          };
          if (existing) {
            await (supabase as any)
              .from("child_next_focus")
              .update(payload)
              .eq("id", existing.id);
          } else {
            await (supabase as any).from("child_next_focus").insert(payload);
          }
        }
      }
    } catch (focusErr) {
      console.warn("summarize-child-growth: focus upsert failed", focusErr);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-child-growth error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});