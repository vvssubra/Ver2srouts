import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Auto-tag a Daily Update from a caption + photo URLs.
// Returns parent_summary, learning_story, suggested_domain_id, suggested_indicator_label,
// proficiency_level, and suggested_album_title.

interface ReqBody {
  caption?: string;
  teacher_note?: string;
  photo_urls?: string[];
  child_age_months?: number | null;
  class_name?: string | null;
}

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ReqBody;
    const caption = (body.caption ?? "").trim();
    const teacherNote = (body.teacher_note ?? "").trim();
    const photos = (body.photo_urls ?? []).slice(0, 4); // cap to keep prompt small

    // Load development domains so we can suggest one by id.
    const { data: domains } = await supabase
      .from("development_domains")
      .select("id, code, name")
      .order("sort_order", { ascending: true });

    const domainList = (domains ?? [])
      .map((d: any) => `- ${d.code}: ${d.name} (id=${d.id})`)
      .join("\n");

    const userParts: any[] = [
      {
        type: "text",
        text: `Teacher caption: ${caption || "(none)"}\nTeacher note: ${teacherNote || "(none)"}\nChild age (months): ${body.child_age_months ?? "unknown"}\nClass: ${body.class_name ?? "unknown"}\n\nAvailable developmental domains:\n${domainList}\n\nReturn a structured tag.`,
      },
    ];
    for (const url of photos) {
      userParts.push({ type: "image_url", image_url: { url } });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "tag_daily_update",
          description: "Produce parent-friendly summary, learning story, and developmental tags for a teacher's daily update.",
          parameters: {
            type: "object",
            properties: {
              parent_summary: {
                type: "string",
                description: "1–2 short, warm sentences a parent will read in their app. Plain English, no jargon.",
              },
              learning_story: {
                type: "string",
                description: "3–5 sentence narrative for the PTM report. Describe what the child did, what skills were practised, and one next step.",
              },
              domain_id: {
                type: "string",
                description: "UUID of the best matching developmental domain from the provided list. Empty string if unsure.",
              },
              suggested_indicator_label: {
                type: "string",
                description: "Short human-readable indicator label (e.g. 'Mixes primary colours'). Empty if none.",
              },
              proficiency_level: {
                type: "string",
                enum: ["emerging", "developing", "consistent", "unknown"],
                description: "Observed level. Use 'unknown' if unsure.",
              },
              suggested_album_title: {
                type: "string",
                description: "Short album/theme title to group this update under (e.g. 'Week 12 — Colours'). Empty if none.",
              },
              milestone_flag: {
                type: "boolean",
                description: "True only if this update shows a clear developmental milestone worth flagging.",
              },
            },
            required: [
              "parent_summary",
              "learning_story",
              "domain_id",
              "suggested_indicator_label",
              "proficiency_level",
              "suggested_album_title",
              "milestone_flag",
            ],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an early-childhood pedagogy assistant for Sprouts Preschool. Look at the photos and the teacher's short note, then produce a warm parent-facing summary, a longer learning story for PTM, and pick the best developmental domain id from the supplied list. Be specific to what is visible. Never invent details that are not in the caption or photos.",
          },
          { role: "user", content: userParts },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "tag_daily_update" } },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "ai_credits_exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const text = await aiRes.text();
      console.error("AI gateway error", aiRes.status, text);
      return new Response(JSON.stringify({ error: "ai_error", detail: text.slice(0, 400) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const message = aiJson?.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    let rawArgs: string | undefined = toolCall?.function?.arguments;
    // Fallback: some providers return the JSON in message.content instead of a tool_call.
    if (!rawArgs && typeof message?.content === "string" && message.content.trim()) {
      const m = message.content.match(/\{[\s\S]*\}/);
      if (m) rawArgs = m[0];
    }
    if (!rawArgs) {
      console.error("No tag returned. AI response:", JSON.stringify(aiJson).slice(0, 800));
      return new Response(JSON.stringify({ error: "no_tag_returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawArgs);
    } catch (e) {
      console.error("Parse error", e, rawArgs);
      return new Response(JSON.stringify({ error: "bad_tag_json" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        parent_summary: parsed.parent_summary ?? "",
        learning_story: parsed.learning_story ?? "",
        domain_id: parsed.domain_id || null,
        suggested_indicator_label: parsed.suggested_indicator_label ?? "",
        proficiency_level:
          parsed.proficiency_level && parsed.proficiency_level !== "unknown"
            ? parsed.proficiency_level
            : null,
        suggested_album_title: parsed.suggested_album_title ?? "",
        milestone_flag: !!parsed.milestone_flag,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("auto-tag-update error", e);
    return new Response(JSON.stringify({ error: "internal", message: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});