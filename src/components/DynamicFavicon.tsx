import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBranding } from "@/hooks/use-branding";

/**
 * Keeps the browser tab favicon and document title in sync with the
 * organization's "General" branding icon and name. Updates instantly when
 * the super admin uploads a new icon (no reinstall required for the tab).
 *
 * When the user is inside the parent area (`/child*`, `/parent-*`) or has
 * launched the parent PWA, the parent app icon/name is shown instead so the
 * tab and iOS standalone splash match the installed app icon (no flicker).
 */
export default function DynamicFavicon() {
  const {
    generalIcon,
    generalName,
    parentIcon,
    parentName,
    teacherIcon,
    teacherName,
  } = useBranding() as any;
  const location = useLocation();

  const isParentArea =
    location.pathname.startsWith("/child") ||
    location.pathname.startsWith("/parent-") ||
    location.pathname === "/install/parents";
  const isTeacherArea =
    location.pathname.startsWith("/dashboard") ||
    location.pathname === "/install/teachers";

  const effectiveIcon = isParentArea
    ? parentIcon ?? generalIcon
    : isTeacherArea
    ? teacherIcon ?? generalIcon
    : generalIcon;
  const effectiveName = isParentArea
    ? parentName ?? generalName
    : isTeacherArea
    ? teacherName ?? generalName
    : generalName;

  useEffect(() => {
    if (!effectiveIcon) return;
    // Update existing favicon link(s) or create one if missing.
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = effectiveIcon;
      document.head.appendChild(link);
    } else {
      links.forEach((l) => {
        l.href = effectiveIcon;
      });
    }
    // Apple touch icon for iOS Safari tabs / pinned shortcuts.
    let apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (!apple) {
      apple = document.createElement("link");
      apple.rel = "apple-touch-icon";
      document.head.appendChild(apple);
    }
    apple.href = effectiveIcon;
  }, [effectiveIcon]);

  useEffect(() => {
    if (effectiveName) document.title = effectiveName;
    // Keep iOS standalone splash / home-screen title in sync with the
    // section the user is in (parent vs teacher app).
    if (effectiveName) {
      let appleTitle = document.querySelector<HTMLMetaElement>(
        "meta[name='apple-mobile-web-app-title']"
      );
      if (!appleTitle) {
        appleTitle = document.createElement("meta");
        appleTitle.name = "apple-mobile-web-app-title";
        document.head.appendChild(appleTitle);
      }
      appleTitle.content = effectiveName;
    }
  }, [effectiveName]);

  return null;
}