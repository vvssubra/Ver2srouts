import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const variant = (url.searchParams.get("variant") ?? "parents").toLowerCase();
    const isParent = variant === "parents";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Take the first organization's branding row (single-tenant assumption
    // for the brand domain; extend later if multi-org install is needed).
    const { data: branding } = await supabase
      .from("organization_branding")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const fallbackIcon = isParent
      ? "/icon-parents-512.png"
      : "/icon-teachers-512.png";
    const fallbackIcon192 = isParent
      ? "/icon-parents-192.png"
      : "/icon-teachers-192.png";

    const name = isParent
      ? branding?.parent_app_name ?? "Sprouts for Parents"
      : branding?.teacher_app_name ?? "Sprouts for Teachers";
    const shortName = isParent
      ? branding?.parent_app_short_name ?? "Sprouts Parents"
      : branding?.teacher_app_short_name ?? "Sprouts Staff";
    // Fallback theme color is Sprouts green per brand spec. Live branding
    // overrides this when an org has set its own colour.
    const themeColor = isParent
      ? branding?.parent_theme_color ?? "#43A047"
      : branding?.teacher_theme_color ?? "#43A047";
    const iconUrl = isParent
      ? branding?.parent_icon_url ?? fallbackIcon
      : branding?.teacher_icon_url ?? fallbackIcon;

    // Branding version drives icon cache-busting and reinstall prompts.
    const versionRaw = isParent
      ? branding?.parent_branding_version
      : branding?.teacher_branding_version;
    const version = versionRaw
      ? new Date(versionRaw).getTime().toString()
      : "0";
    const bust = (u: string) =>
      u.includes("?") ? `${u}&v=${version}` : `${u}?v=${version}`;
    const bustedIcon = bust(iconUrl);
    // Static 192 from /public (org branding only ships a single icon URL,
    // so we keep that for both sizes when it's overridden).
    const bustedIcon192 =
      iconUrl === fallbackIcon ? bust(fallbackIcon192) : bustedIcon;

    const manifest = {
      name,
      short_name: shortName,
      // `id` MUST stay stable — changing it causes the OS to treat the PWA
      // as a brand-new app on next install. Keep it pinned.
      id: isParent ? "/install/parents" : "/install/teachers",
      // start_url carries the version so opening the installed app pings
      // the latest build and helps Android WebAPK refresh checks.
      start_url: isParent
        ? `/child?source=pwa&bv=${version}`
        : `/dashboard?source=pwa&bv=${version}`,
      scope: "/",
      lang: "en",
      dir: "ltr",
      prefer_related_applications: false,
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: themeColor,
      description: isParent
        ? "Stay close to your child's learning journey."
        : "Sprouts staff app for teachers and admins.",
      categories: ["education", "parenting", "lifestyle"],
      shortcuts: isParent
        ? [
            {
              name: "Learning Journey",
              short_name: "Journey",
              url: "/journey?source=pwa-shortcut",
              icons: [
                { src: bustedIcon192, sizes: "192x192", type: "image/png" },
              ],
            },
            {
              name: "Chat",
              short_name: "Chat",
              url: "/parent-chat?source=pwa-shortcut",
              icons: [
                { src: bustedIcon192, sizes: "192x192", type: "image/png" },
              ],
            },
            {
              name: "Fees",
              short_name: "Fees",
              url: "/parent-fees?source=pwa-shortcut",
              icons: [
                { src: bustedIcon192, sizes: "192x192", type: "image/png" },
              ],
            },
          ]
        : undefined,
      icons: [
        { src: bustedIcon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: bustedIcon192, sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: bustedIcon, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: bustedIcon, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };

    return new Response(JSON.stringify(manifest), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/manifest+json",
        // Short cache so version bumps reach Android Chrome quickly.
        "Cache-Control": "public, max-age=60",
        "X-Branding-Version": version,
      },
    });
  } catch (err) {
    console.error("get-manifest error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});