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

    const { assessment_id } = await req.json();
    if (!assessment_id) throw new Error("Missing assessment_id");

    // Fetch the assessment
    const { data: assessment, error: assessErr } = await supabase
      .from("baseline_assessments")
      .select("*, students(first_name, last_name, date_of_birth, gender, branch_id)")
      .eq("id", assessment_id)
      .single();

    if (assessErr || !assessment) throw new Error("Assessment not found");

    // Fetch branch programs
    const { data: branchSettings } = await supabase
      .from("branch_settings")
      .select("programs_offered")
      .eq("branch_id", assessment.students?.branch_id || assessment.branch_id)
      .single();

    const programsOffered = branchSettings?.programs_offered;
    const programsStr = Array.isArray(programsOffered) && programsOffered.length > 0
      ? programsOffered.map((p: any) => `- ${p.name}: ${p.description || "No description"} (${p.schedule_type || "N/A"})`).join("\n")
      : "No specific programs configured. Use general categories: Half-Day Kindergarten, Full-Day Program, Extended Care & Homework Support.";

    // Fetch recent observations for context
    const { data: observations } = await supabase
      .from("student_observations")
      .select("notes, proficiency_level, curriculum_standards(title_en, title_ms)")
      .eq("student_id", assessment.student_id)
      .order("observed_at", { ascending: false })
      .limit(10);

    const observationContext = observations?.length
      ? observations.map((o: any) => `- ${o.curriculum_standards?.title_en || o.curriculum_standards?.title_ms}: ${o.proficiency_level}${o.notes ? ` (${o.notes})` : ""}`).join("\n")
      : "No prior observations available.";

    const checklistStr = Array.isArray(assessment.checklist_responses)
      ? assessment.checklist_responses.map((c: any) => `${c.item}: ${c.passed ? "✓" : "✗"}`).join(", ")
      : "No checklist data";

    const studentName = `${assessment.students?.first_name} ${assessment.students?.last_name}`;

    const systemPrompt = `You are an expert Early Childhood Pedagogical Director with deep knowledge of Montessori, Reggio Emilia, Waldorf, and Malaysia's KP2026 (KSPK) curriculum frameworks.

Analyze the child's baseline assessment data and recommend the most suitable teaching methodology. Consider their strengths, gaps, and learning tendencies.

Also recommend the most suitable enrollment program based on the child's developmental profile and the branch's available programs.`;

    const userPrompt = `Child: ${studentName}
Age/DOB: ${assessment.students?.date_of_birth || "Unknown"}
Gender: ${assessment.students?.gender || "Unknown"}

Baseline Assessment Scores (1-5 scale):
- Motor Skills: ${assessment.motor_skills_score}/5
- Language: ${assessment.language_score}/5
- Socio-Emotional: ${assessment.socio_emotional_score}/5
- Cognitive: ${assessment.cognitive_score}/5

Checklist Results: ${checklistStr}

Teacher Notes: ${assessment.teacher_notes || "None provided"}

Recent Observations:
${observationContext}

Available Programs at this branch:
${programsStr}

Based on this data:
1. Recommend the best teaching methodology for this child.
2. Recommend the most suitable program enrollment (e.g., half-day for strong independent learners, full-day for children needing more enrichment, extended care for those needing homework support).`;

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
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_methodology",
              description: "Recommend a teaching methodology and enrollment program for the child based on their assessment data.",
              parameters: {
                type: "object",
                properties: {
                  suggested_methodology: {
                    type: "string",
                    enum: ["Montessori", "Reggio Emilia", "Waldorf", "KP2026"],
                    description: "The recommended teaching methodology",
                  },
                  ai_reasoning: {
                    type: "string",
                    description: "A 2-3 sentence rationale explaining why this methodology is recommended for this child.",
                  },
                  detected_learning_style: {
                    type: "string",
                    enum: ["visual", "auditory", "kinesthetic", "reading-writing", "mixed"],
                    description: "The child's detected primary learning style based on the assessment data.",
                  },
                  suggested_program: {
                    type: "string",
                    description: "The recommended enrollment program (e.g., 'Half-Day Kindergarten', 'Full-Day Program', 'Extended Care & Homework Support').",
                  },
                  program_reasoning: {
                    type: "string",
                    description: "A 2-3 sentence rationale explaining why this program is recommended based on the child's developmental needs.",
                  },
                },
                required: ["suggested_methodology", "ai_reasoning", "detected_learning_style", "suggested_program", "program_reasoning"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_methodology" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const recommendation = JSON.parse(toolCall.function.arguments);

    // Update assessment with detected learning style
    await supabase
      .from("baseline_assessments")
      .update({ ai_detected_learning_style: recommendation.detected_learning_style })
      .eq("id", assessment_id);

    // Insert methodology recommendation
    const { data: rec, error: recErr } = await supabase
      .from("methodology_recommendations")
      .insert({
        student_id: assessment.student_id,
        baseline_assessment_id: assessment_id,
        suggested_methodology: recommendation.suggested_methodology,
        ai_reasoning: recommendation.ai_reasoning,
        suggested_program: recommendation.suggested_program || null,
        program_reasoning: recommendation.program_reasoning || null,
        status: "pending",
      })
      .select()
      .single();

    if (recErr) throw recErr;

    return new Response(JSON.stringify({ success: true, recommendation: rec }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("assess-methodology error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
