import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CENTER_TYPES = [
  { value: "literacy_corner", label: "Literacy Corner" },
  { value: "numeracy_manipulative", label: "Numeracy & Manipulative" },
  { value: "dramatic_play", label: "Dramatic Play" },
  { value: "sensory", label: "Sensory" },
  { value: "construction", label: "Construction" },
  { value: "art", label: "Art & Creativity" },
  { value: "discovery", label: "Discovery & Science" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;


  try {
    const { weeklyTheme, weeklyFocus, weeklyObjectives, materials, ageGroup, className } = await req.json();

    if (!weeklyTheme) {
      return new Response(JSON.stringify({ error: "weeklyTheme is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert early childhood education learning center designer. 
You design 7 distinct learning centers for preschool/kindergarten classrooms that align with the weekly theme and focus.

Each center must be pedagogically sound, age-appropriate, and directly connected to the weekly theme.

IMPORTANT: Return a JSON array with exactly 7 objects, one for each center type. Each object must have:
- center_type: one of ${CENTER_TYPES.map(c => c.value).join(", ")}
- setup_description: 2-3 sentences describing how to physically set up this center
- materials: array of 4-6 specific materials needed
- learning_objectives: array of 2-3 observable learning objectives
- observation_prompts: array of 2-3 specific things teachers should watch for
- linked_domains: array of 1-2 development domains this center targets (from: cognitive, language, motor, social-emotional, creative, science, numeracy)`;

    const userPrompt = `Design 7 learning centers for this week:
- Weekly Theme: ${weeklyTheme}
- Weekly Focus: ${weeklyFocus || "Not specified"}
- Weekly Objectives: ${Array.isArray(weeklyObjectives) ? weeklyObjectives.join("; ") : "Not specified"}
- Available Materials Context: ${Array.isArray(materials) ? materials.join(", ") : "Not specified"}
- Age Group: ${ageGroup || "4-5 years"}
- Class: ${className || "Not specified"}

Generate all 7 centers connected to the theme "${weeklyTheme}". Make each center engaging and hands-on.`;

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
              name: "generate_centers",
              description: "Return 7 learning center plans for the week",
              parameters: {
                type: "object",
                properties: {
                  centers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        center_type: { type: "string", enum: CENTER_TYPES.map(c => c.value) },
                        setup_description: { type: "string" },
                        materials: { type: "array", items: { type: "string" } },
                        learning_objectives: { type: "array", items: { type: "string" } },
                        observation_prompts: { type: "array", items: { type: "string" } },
                        linked_domains: { type: "array", items: { type: "string" } },
                      },
                      required: ["center_type", "setup_description", "materials", "learning_objectives", "observation_prompts"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["centers"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_centers" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
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
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI generation failed");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    const centers = parsed.centers || [];

    // Attach labels
    const centersWithLabels = centers.map((c: any) => ({
      ...c,
      center_label: CENTER_TYPES.find(ct => ct.value === c.center_type)?.label || c.center_type,
    }));

    return new Response(JSON.stringify({ centers: centersWithLabels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-learning-centers error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
