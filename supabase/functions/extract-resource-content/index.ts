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
    const { pdf_url, title } = await req.json();
    if (!pdf_url) throw new Error("pdf_url is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Use AI to summarize the document from its URL
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a preschool curriculum document analyzer. Extract and summarize the key educational content from this document titled "${title || "Teaching Resource"}". Focus on:
- Learning objectives and outcomes
- Key activities and their descriptions
- Materials needed
- Age appropriateness notes
- Subject areas covered
- Teaching strategies mentioned
Keep the summary concise (under 2000 characters) but comprehensive enough for an AI to reference when generating lesson plans.`,
          },
          {
            role: "user",
            content: `Please analyze and summarize the educational content from this teaching resource document. The document is available at: ${pdf_url}\n\nExtract the key pedagogical content that would be useful for lesson planning.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI error: " + response.status);
    }

    const result = await response.json();
    const contentText = result.choices?.[0]?.message?.content || "";

    if (contentText) {
      // Update the worksheet record with extracted content
      const { error } = await supabase
        .from("worksheets")
        .update({ content_text: contentText.substring(0, 5000) } as any)
        .eq("pdf_url", pdf_url);

      if (error) console.error("Update error:", error);
    }

    return new Response(JSON.stringify({ content_text: contentText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-resource-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
