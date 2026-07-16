import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;

  try {
    const { year, country } = await req.json();
    const targetYear = year || new Date().getFullYear();
    const targetCountry = country || "Malaysia";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an authoritative holiday calendar data generator with expert knowledge of official government gazette dates. Return ONLY a valid JSON array. No markdown, no explanation. Each entry: {"name": "Holiday Name", "date": "YYYY-MM-DD", "is_regional": false}. 

CRITICAL ACCURACY RULES:
- For Islamic holidays (Hari Raya Aidilfitri, Hari Raya Haji, Nuzul Al-Quran, Mawlid, Israk & Mikraj, Awal Muharram), use the CORRECT dates based on the Hijri calendar conversion for the given year. Do NOT guess — calculate based on known Hijri-Gregorian mappings.
- For ${targetYear}, cross-reference with official Malaysian government gazette dates if available.
- For tentative Islamic dates, add "(tentative)" to the name.
- Include replacement holidays where applicable (e.g., when a holiday falls on a weekend).
- Be precise: Nuzul Al-Quran 2026 falls on approximately 7 March 2026 (17 Ramadan 1447H), NOT 15 March.`,
          },
          {
            role: "user",
            content: `Generate the complete and accurate list of public holidays and regional holidays for ${targetCountry} in ${targetYear}. Include all national holidays, state-level holidays (like Federal Territory Day, Thaipusam observed, etc.), and replacement holidays. Use accurate Hijri-to-Gregorian date conversions for Islamic holidays. Return as a JSON array.`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "[]";

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const holidays = JSON.parse(content);

    return new Response(JSON.stringify({ holidays, year: targetYear, country: targetCountry }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
