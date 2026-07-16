import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Apple, Share, Plus, Smartphone, CheckCircle2, Download, ArrowRight, Bell, HelpCircle } from "lucide-react";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";

type Variant = "parents" | "teachers";

interface InstallProps {
  variant: Variant;
}

const COPY: Record<Variant, {
  appName: string;
  tagline: string;
  manifest: string;
  themeColor: string;
  iconSrc: string;
  continueTo: string;
  continueLabel: string;
  bullets: string[];
  gradient: string;
}> = {
  parents: {
    appName: "Sprouts for Parents",
    tagline: "Stay close to your child's learning journey.",
    manifest: "/manifest-parents.webmanifest",
    themeColor: "#ee5a70",
    iconSrc: "/icon-parents-512.png",
    continueTo: "/child",
    continueLabel: "Open Sprouts Parents",
    bullets: [
      "Daily learning stories & photos",
      "Messages from your child's teacher",
      "Fees, invoices and receipts",
      "PTM reports and milestones",
    ],
    gradient: "from-[#ee5a70] to-[#ff8a6b]",
  },
  teachers: {
    appName: "Sprouts for Teachers",
    tagline: "Plan, observe and run your classroom from your pocket.",
    manifest: "/manifest-teachers.webmanifest",
    themeColor: "#4f46e5",
    iconSrc: "/icon-teachers-512.png",
    continueTo: "/dashboard",
    continueLabel: "Open Sprouts Teachers",
    bullets: [
      "Daily attendance & observations",
      "Lesson plans and weekly focus",
      "Parent chat & broadcast",
      "Class readiness at a glance",
    ],
    gradient: "from-[#4f46e5] to-[#7c3aed]",
  },
};

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS
  // @ts-ignore - non-standard but real
  if (window.navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

export default function Install({ variant }: InstallProps) {
  const cfg = COPY[variant];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [liveIcon, setLiveIcon] = useState<string | null>(null);
  const [liveName, setLiveName] = useState<string | null>(null);
  const [liveTheme, setLiveTheme] = useState<string | null>(null);
  const [liveVersion, setLiveVersion] = useState<string>("0");

  // Load live branding so the install screen + iOS Add-to-Home-Screen
  // sheet match the latest Settings, not the static /public defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organization_branding")
        .select(
          "parent_app_name, parent_icon_url, parent_theme_color, parent_branding_version, teacher_app_name, teacher_icon_url, teacher_theme_color, teacher_branding_version"
        )
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      if (variant === "parents") {
        setLiveIcon(data.parent_icon_url ?? null);
        setLiveName(data.parent_app_name ?? null);
        setLiveTheme(data.parent_theme_color ?? null);
        setLiveVersion(
          data.parent_branding_version
            ? new Date(data.parent_branding_version).getTime().toString()
            : "0"
        );
      } else {
        setLiveIcon(data.teacher_icon_url ?? null);
        setLiveName(data.teacher_app_name ?? null);
        setLiveTheme(data.teacher_theme_color ?? null);
        setLiveVersion(
          data.teacher_branding_version
            ? new Date(data.teacher_branding_version).getTime().toString()
            : "0"
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const effectiveIcon = liveIcon ?? cfg.iconSrc;
  const effectiveName = liveName ?? cfg.appName;
  const effectiveTheme = liveTheme ?? cfg.themeColor;
  // Cache-bust the manifest URL so Android Chrome re-fetches it on each
  // branding change (otherwise the WebAPK may install with a stale icon).
  const manifestSeparator = cfg.manifest.includes("?") ? "&" : "?";
  const effectiveManifest = `${cfg.manifest}${manifestSeparator}v=${liveVersion}`;

  // Swap <link rel="manifest"> and theme-color so the right app gets installed
  useEffect(() => {
    const head = document.head;

    let manifestLink = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      head.appendChild(manifestLink);
    }
    const prevManifest = manifestLink.getAttribute("href");
    manifestLink.href = effectiveManifest;

    let themeMeta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      head.appendChild(themeMeta);
    }
    const prevTheme = themeMeta.getAttribute("content");
    themeMeta.content = effectiveTheme;

    let appleTouch = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!appleTouch) {
      appleTouch = document.createElement("link");
      appleTouch.rel = "apple-touch-icon";
      head.appendChild(appleTouch);
    }
    const prevApple = appleTouch.getAttribute("href");
    appleTouch.href = effectiveIcon;

    let appleTitle = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitle) {
      appleTitle = document.createElement("meta");
      appleTitle.name = "apple-mobile-web-app-title";
      head.appendChild(appleTitle);
    }
    const prevAppleTitle = appleTitle.getAttribute("content");
    appleTitle.content = effectiveName;

    let appleCapable = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-capable"]');
    if (!appleCapable) {
      appleCapable = document.createElement("meta");
      appleCapable.name = "apple-mobile-web-app-capable";
      appleCapable.content = "yes";
      head.appendChild(appleCapable);
    }

    // Newer cross-browser spec name. Safari still reads the
    // apple-prefixed tag above, but iOS 17+ also honors this.
    let mobileCapable = head.querySelector<HTMLMetaElement>('meta[name="mobile-web-app-capable"]');
    if (!mobileCapable) {
      mobileCapable = document.createElement("meta");
      mobileCapable.name = "mobile-web-app-capable";
      mobileCapable.content = "yes";
      head.appendChild(mobileCapable);
    }

    let appleStatusBar = head.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!appleStatusBar) {
      appleStatusBar = document.createElement("meta");
      appleStatusBar.name = "apple-mobile-web-app-status-bar-style";
      appleStatusBar.content = "default";
      head.appendChild(appleStatusBar);
    }

    return () => {
      if (prevManifest) manifestLink!.href = prevManifest;
      if (prevTheme) themeMeta!.content = prevTheme;
      if (prevApple) appleTouch!.href = prevApple;
      if (prevAppleTitle) appleTitle!.content = prevAppleTitle;
    };
  }, [effectiveManifest, effectiveTheme, effectiveIcon, effectiveName]);

  useEffect(() => {
    setPlatform(detectPlatform());
    const standalone = isStandalone();
    setInstalled(standalone);

    // Page-view event (fires once on mount per variant)
    track("install_page_viewed", {
      variant,
      already_installed: standalone,
    });

    // If the user has already installed the app and is opening it from the
    // home screen (standalone) OR the launch URL was stamped with
    // `source=pwa` (our manifest start_url), skip the install marketing page
    // entirely and go straight to their app home. This avoids the confusing
    // "you're already running" / continue / skip-to-teacher prompt that was
    // appearing every time parents tapped their home-screen icon.
    const cameFromPwaLaunch = searchParams.get("source") === "pwa";
    if (standalone || cameFromPwaLaunch) {
      navigate(cfg.continueTo, { replace: true });
      return;
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      track("install_prompt_available", { variant });
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const onInstalled = () => {
      setInstalled(true);
      track("install_completed", { variant });
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [variant]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    track("install_prompt_shown", { variant });
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      setInstalled(true);
      track("install_prompt_accepted", { variant });
    } else if (choice?.outcome === "dismissed") {
      track("install_prompt_dismissed", { variant });
    }
    setDeferredPrompt(null);
  };

  const otherVariant: Variant = variant === "parents" ? "teachers" : "parents";

  return (
    <div className="min-h-screen-safe bg-gradient-to-b from-background to-muted/30 flex flex-col pt-safe">
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-8 sm:py-12 pb-safe-plus-4">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`rounded-3xl shadow-lg overflow-hidden bg-gradient-to-br ${cfg.gradient}`}>
            <img
              src={effectiveIcon}
              alt={`${effectiveName} icon`}
              width={120}
              height={120}
              className="w-28 h-28 sm:w-32 sm:h-32"
              loading="eager"
            />
          </div>
          <Badge variant="secondary" className="rounded-full">
            <Smartphone className="h-3 w-3 mr-1" /> Mobile App
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{effectiveName}</h1>
          <p className="text-muted-foreground max-w-md">{cfg.tagline}</p>
        </div>

        {/* Install state */}
        {installed ? (
          <Card className="mt-8 border-accent/40">
            <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-accent" />
              <p className="font-medium">You're already running the installed app.</p>
              <Button onClick={() => navigate(cfg.continueTo)} className="w-full sm:w-auto">
                {cfg.continueLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">How to install</CardTitle>
              <CardDescription>
                Add {cfg.appName} to your home screen so it opens like a real app — full screen, with its own icon.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {platform === "ios" && (
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
                    <span className="flex-1 flex items-center flex-wrap gap-1">
                      Tap the <Share className="inline h-4 w-4 mx-1" /> <strong>Share</strong> button in Safari's bottom toolbar.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                    <span className="flex-1 flex items-center flex-wrap gap-1">
                      Scroll down and choose <Plus className="inline h-4 w-4 mx-1" /> <strong>Add to Home Screen</strong>.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">3</span>
                    <span className="flex-1">Tap <strong>Add</strong>. Open <strong>{cfg.appName}</strong> from your home screen.</span>
                  </li>
                </ol>
              )}

              {platform === "android" && (
                <>
                  {deferredPrompt ? (
                    <Button onClick={handleInstallClick} className="w-full" size="lg">
                      <Download className="mr-2 h-4 w-4" />
                      Install {cfg.appName}
                    </Button>
                  ) : (
                    <ol className="space-y-3 text-sm">
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">1</span>
                        <span className="flex-1">Open Chrome's menu (the three dots in the top-right).</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">2</span>
                        <span className="flex-1">Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">3</span>
                        <span className="flex-1">Open <strong>{cfg.appName}</strong> from your home screen.</span>
                      </li>
                    </ol>
                  )}
                </>
              )}

              {platform === "desktop" && (
                <div className="space-y-3 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Smartphone className="h-4 w-4" />
                    Open this page on your phone to install the app.
                  </p>
                  {deferredPrompt && (
                    <Button onClick={handleInstallClick} className="w-full" size="lg">
                      <Download className="mr-2 h-4 w-4" />
                      Install on this device
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Tip: in Chrome or Edge you can also click the <strong>Install</strong> icon in the address bar.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <Apple className="h-3.5 w-3.5" />
                Works on iPhone (Safari) and Android (Chrome). No app store needed.
              </div>
            </CardContent>
          </Card>
        )}

        {/* What's inside */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">What's inside</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {cfg.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* iPhone push-notification caveat */}
        {variant === "parents" && (platform === "ios" || platform === "desktop") && (
          <Card className="mt-6 border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Notifications on iPhone
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              On iPhone, push notifications only work after you{" "}
              <strong>Add Sprouts to your Home Screen</strong> and open it
              from there (iOS 16.4 or newer). Inside Safari they won't
              appear — install first, then allow notifications on first
              launch.
            </CardContent>
          </Card>
        )}

        {/* Troubleshooting */}
        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              Troubleshooting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>On iPhone, use <strong>Safari</strong> to install — Chrome/Firefox on iOS can't add to the home screen.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>On Android, use <strong>Chrome</strong> for the smoothest install experience.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Seeing an old icon after we updated branding? Remove the home-screen shortcut and reinstall.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>If the app opens with Safari bars, <strong>delete the old Home Screen icon</strong>, open this page in Safari, tap Share, choose <strong>Add to Home Screen</strong> — not Add Bookmark — and reinstall.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary">•</span>
                <span>Blank screen after opening? Pull down to refresh, or close and reopen the app.</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate(cfg.continueTo)}>
            Skip for now
          </Button>
        </div>
      </main>
    </div>
  );
}