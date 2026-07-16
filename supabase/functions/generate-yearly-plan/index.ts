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
    const { academic_year_id, age_group, branch_id } = await req.json();
    if (!academic_year_id || !age_group || !branch_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch academic year
    const { data: academicYear, error: ayErr } = await supabase
      .from("academic_years")
      .select("*")
      .eq("id", academic_year_id)
      .single();
    if (ayErr || !academicYear) {
      return new Response(JSON.stringify({ error: "Academic year not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch holidays
    const { data: holidays = [] } = await supabase
      .from("school_holidays")
      .select("*")
      .eq("academic_year_id", academic_year_id)
      .order("event_date");

    // Fetch development domains for domain awareness
    const { data: domains = [] } = await supabase
      .from("development_domains")
      .select("id, name, description")
      .order("sort_order");

    const domainNames = (domains || []).map((d: any) => d.name).join(", ");

    // Dynamically compute weeks based on actual academic year dates
    const startDate = new Date(academicYear.start_date);
    const endDate = new Date(academicYear.end_date);
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.min(Math.ceil(totalDays / 7), 52);
    
    const weeks: { week_number: number; start_date: string; end_date: string; holidays: string[] }[] = [];
    for (let i = 0; i < totalWeeks; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + i * 7);
      if (weekStart > endDate) break;
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 4);

      const weekHolidays = (holidays || [])
        .filter((h: any) => {
          const hd = new Date(h.event_date);
          return hd >= weekStart && hd <= weekEnd;
        })
        .map((h: any) => h.event_name);

      weeks.push({
        week_number: i + 1,
        start_date: weekStart.toISOString().split("T")[0],
        end_date: weekEnd.toISOString().split("T")[0],
        holidays: weekHolidays,
      });
    }

    // Fetch theme_bank entries to use as reference
    const { data: themeBankEntries = [] } = await supabase
      .from("theme_bank")
      .select("id, month_number, theme_name, big_idea")
      .order("month_number");

    const themeBankContext = (themeBankEntries || []).length > 0
      ? `\n\nTHEME BANK (Master Reference — use these as the monthly themes):\n${(themeBankEntries || []).map((t: any) => `Month ${t.month_number}: "${t.theme_name}" — ${t.big_idea || ""}`).join("\n")}\n\nIMPORTANT: Map each calendar month to the corresponding Theme Bank theme. The weekly sub_themes should be specific explorations within that month's master theme.`
      : "";

    const numWeeks = weeks.length;
    const holidayList = (holidays || []).map((h: any) => `${h.event_date}: ${h.event_name}`).join("\n");

    const weeksPerTerm = Math.ceil(numWeeks / 4);
    const term1End = weeksPerTerm;
    const term2End = weeksPerTerm * 2;
    const term3End = weeksPerTerm * 3;

    const systemPrompt = `You are a world-class Early Childhood Academic Director specializing in the Malaysian KP2026 (KSPK 2026) curriculum framework.

IMPORTANT: Generate ALL content in ENGLISH language.

Generate a ${numWeeks}-week thematic curriculum for children aged ${age_group} years old.

DEVELOPMENT DOMAINS (ensure balanced coverage across the year):
${domainNames}

The year is divided into 4 TERMS:
- Term 1: Weeks 1-${term1End} (Foundation — Self, Family, Body, School, Senses)
- Term 2: Weeks ${term1End + 1}-${term2End} (Expanding — Community, Neighbourhood, Food, Health, Animals)
- Term 3: Weeks ${term2End + 1}-${term3End} (Exploring — Environment, Nature, Transport, Weather, Science)
- Term 4: Weeks ${term3End + 1}-${numWeeks} (Consolidating — World Cultures, Space, Technology, Reflection, Graduation)
${themeBankContext}

CRITICAL RULES:
1. Progress LOGICALLY from concrete concepts in Term 1 to abstract concepts in Term 4.
2. Each week must have a distinct main_theme and a more specific sub_theme.
3. Review the holiday calendar below. If a major cultural event occurs during a specific week, you MUST adapt that week's theme to focus on cultural appreciation, community values, or the relevant KP2026 tunjang values.
4. Include a brief rationale (1-2 sentences) for each week explaining WHY this theme appears at this point in the progression.
5. Cover all 6 KP2026 Tunjang across the year: Komunikasi, Kerohanian/Sikap & Nilai, Kemanusiaan, Keterampilan Diri, Perkembangan Fizikal & Estetika, Sains & Teknologi.
6. For each week, identify 1-3 primary development domains that the theme naturally addresses (from: ${domainNames}).

ACADEMIC YEAR: ${academicYear.start_date} to ${academicYear.end_date}
HOLIDAYS:
${holidayList || "No holidays defined yet."}

WEEK SCHEDULE:
${weeks.map((w) => `Week ${w.week_number}: ${w.start_date} to ${w.end_date}${w.holidays.length > 0 ? ` [HOLIDAYS: ${w.holidays.join(", ")}]` : ""}`).join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate the ${numWeeks}-week thematic curriculum plan now.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_yearly_plan",
              description: `Save the generated ${numWeeks}-week curriculum plan`,
              parameters: {
                type: "object",
                properties: {
                  weeks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week_number: { type: "integer" },
                        main_theme: { type: "string" },
                        sub_theme: { type: "string" },
                        rationale: { type: "string" },
                        domain_focus: {
                          type: "array",
                          items: { type: "string" },
                          description: "1-3 primary development domains this week's theme addresses",
                        },
                      },
                      required: ["week_number", "main_theme", "sub_theme", "rationale", "domain_focus"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["weeks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_yearly_plan" } },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const generated = JSON.parse(toolCall.function.arguments);
    const generatedWeeks = generated.weeks;

    // Delete existing themes for this academic year
    await supabase
      .from("yearly_themes")
      .delete()
      .eq("academic_year_id", academic_year_id);

    // Insert new themes (store domain_focus in rationale JSON or as metadata)
    const rows = generatedWeeks.map((w: any, idx: number) => {
      const weekInfo = weeks.find((wk) => wk.week_number === w.week_number) || weeks[idx];
      return {
        academic_year_id,
        week_number: w.week_number,
        start_date: weekInfo?.start_date || weeks[idx]?.start_date,
        end_date: weekInfo?.end_date || weeks[idx]?.end_date,
        main_theme: w.main_theme,
        sub_theme: w.sub_theme || null,
        rationale: w.rationale || null,
        domain_focus: w.domain_focus || [],
        sort_order: idx,
      };
    });

    const { error: insertErr } = await supabase.from("yearly_themes").insert(rows);
    if (insertErr) {
      console.error("Insert error:", insertErr);
      // If domain_focus column doesn't exist yet, try without it
      const rowsWithout = rows.map(({ domain_focus, ...rest }: any) => rest);
      const { error: retryErr } = await supabase.from("yearly_themes").insert(rowsWithout);
      if (retryErr) {
        return new Response(JSON.stringify({ error: "Failed to save themes" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, weeks: rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-yearly-plan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
