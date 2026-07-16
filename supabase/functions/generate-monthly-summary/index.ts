import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;


  try {
    const { student_id, month, year, branch_id } = await req.json();
    if (!student_id || !month || !year || !branch_id) {
      return new Response(JSON.stringify({ error: "student_id, month, year, branch_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch journey entries for the month
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const { data: entries } = await supabase
      .from("daily_learning_journey_entries")
      .select("*, development_domains(name)")
      .eq("student_id", student_id)
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .order("created_at", { ascending: true });

    // Fetch student name
    const { data: student } = await supabase
      .from("students")
      .select("first_name, last_name")
      .eq("id", student_id)
      .single();

    const studentName = student ? `${student.first_name} ${student.last_name}` : "the child";
    const entryList = entries || [];
    const milestoneCount = entryList.filter((e: any) => e.milestone_flag).length;
    const domains = [...new Set(entryList.map((e: any) => e.development_domains?.name).filter(Boolean))];

    // Build prompt
    const entryDescriptions = entryList.slice(0, 30).map((e: any) =>
      `- ${e.title}${e.development_domains?.name ? ` (${e.development_domains.name})` : ""}${e.teacher_note ? `: ${e.teacher_note}` : ""}${e.milestone_flag ? " ⭐ MILESTONE" : ""}`
    ).join("\n");

    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    const prompt = `You are a warm, professional early childhood educator writing a monthly progress summary for parents.

Child: ${studentName}
Month: ${monthNames[month - 1]} ${year}
Total learning entries: ${entryList.length}
Milestone moments: ${milestoneCount}
Domains explored: ${domains.join(", ") || "Various"}

Learning entries this month:
${entryDescriptions || "No entries recorded this month."}

Write a warm, encouraging monthly summary for parents. Include:
1. A 3-4 sentence narrative summary of what the child explored and learned
2. 2-3 key strengths observed (as a JSON array of short strings)
3. 2-3 suggested home extension activities (as a JSON array of short strings)

Respond ONLY with valid JSON:
{
  "summary_text": "...",
  "strengths": ["...", "..."],
  "home_extensions": ["...", "..."]
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a warm early childhood education specialist. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResp.json();
    let content = aiData.choices?.[0]?.message?.content || "{}";
    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(content);

    // Upsert into student_monthly_summaries
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    // Decode user from token for generated_by
    const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser();

    const { error: upsertError } = await supabase
      .from("student_monthly_summaries")
      .upsert({
        student_id,
        branch_id,
        month,
        year,
        summary_text: parsed.summary_text || "",
        strengths_json: parsed.strengths || [],
        home_extensions_json: parsed.home_extensions || [],
        domains_explored: domains,
        milestone_count: milestoneCount,
        entry_count: entryList.length,
        generated_by: user?.id || null,
        status: "draft",
        updated_at: new Date().toISOString(),
      }, { onConflict: "student_id,month,year" });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({
      summary_text: parsed.summary_text,
      strengths: parsed.strengths,
      home_extensions: parsed.home_extensions,
      domains_explored: domains,
      milestone_count: milestoneCount,
      entry_count: entryList.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-monthly-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
