import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { notes, studentName } = await req.json();
    if (!notes || notes.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Notes must be at least 5 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an empathetic early childhood educator at a Malaysian preschool following the KP2026 (KSPK) curriculum. 

Given rough observation notes about a child, you must:
1. Identify the most relevant KP2026 Learning Area (Tunjang) from these options:
   - KMK: Komunikasi (Communication)
   - STI: Sains, Teknologi dan Inovasi (Science, Technology & Innovation)  
   - KTR: Ketrampilan (Physical Development)
   - PSE: Perkembangan Sosioemosi (Socio-Emotional Development)
   - KSN: Kerohanian, Sikap dan Nilai (Spirituality, Attitudes & Values)
   - KMT: Kemanusiaan (Humanities)
2. Transform the rough notes into a warm, professionally written "Learning Story" addressed to the parents.

The Learning Story should:
- Be written in English with a warm, celebratory tone
- Start with "Dear Parents," or "Dear Family,"
- Highlight the child's specific achievements and growth
- Connect the activity to developmental milestones
- Be 3-5 sentences long
- Use the child's name if provided`;

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
          {
            role: "user",
            content: `Child's name: ${studentName || "the student"}\n\nTeacher's rough notes: ${notes}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_learning_story",
              description: "Generate a structured learning story from observation notes",
              parameters: {
                type: "object",
                properties: {
                  learningArea: {
                    type: "string",
                    description: "Full name of the KP2026 Learning Area, e.g. 'Perkembangan Sosioemosi (Socio-Emotional Development)'",
                  },
                  learningAreaCode: {
                    type: "string",
                    enum: ["KMK", "STI", "KTR", "PSE", "KSN", "KMT"],
                    description: "Code of the KP2026 Learning Area",
                  },
                  learningStory: {
                    type: "string",
                    description: "The warm, parent-facing Learning Story narrative",
                  },
                  suggestedTags: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 keyword tags summarising the observation",
                  },
                },
                required: ["learningArea", "learningAreaCode", "learningStory", "suggestedTags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_learning_story" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your workspace credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-learning-story error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
