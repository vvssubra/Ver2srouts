import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { documentText, category } = await req.json();

    if (!documentText || documentText.trim().length === 0) {
      throw new Error("No document text provided");
    }

    const systemPrompt = `You are an expert curriculum standards parser. Given a curriculum document text, extract and structure learning areas and their hierarchical standards.

Output format as JSON:
{
  "learning_areas": [
    {
      "code": "SE",
      "name_ms": "Sahsiah dan Emosi",
      "name_en": "Personality and Emotions",
      "description_ms": "Brief description",
      "standards": [
        {
          "code": "SE K1",
          "level": "skill",
          "title_ms": "Kemahiran 1",
          "title_en": "Skill 1",
          "description_ms": "Description",
          "children": [
            {
              "code": "SE K1 S1",
              "level": "standard",
              "title_ms": "Standard 1",
              "title_en": "Standard 1",
              "children": [
                {
                  "code": "SE K1 S1 SS1",
                  "level": "sub_standard",
                  "title_ms": "Sub-standard 1"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Extract ALL learning areas found in the document
- Preserve the original language (Bahasa Melayu) and add English translations where possible
- Maintain the hierarchy: learning_area > skill > standard > sub_standard
- Use meaningful codes based on the document's existing coding system
- If the document uses a different naming convention, adapt it to the schema above`;

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
          { role: "user", content: `Parse this curriculum document and extract the learning areas and standards hierarchy. Category: ${category || "Custom"}\n\nDocument content:\n${documentText.substring(0, 30000)}` },
        ],
        temperature: 0.3,
      }),
    });

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
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { learning_areas: [], error: "Failed to parse AI response" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-curriculum-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
