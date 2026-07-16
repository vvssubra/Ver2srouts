import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized branding resolver.
 *
 * Returns icon URLs for the three app surfaces (general/admin, parent, teacher)
 * with sensible static fallbacks. Use `iconForRole(role)` so any screen renders
 * the icon that matches the user's app context.
 *
 * - parent role  -> parent_icon_url
 * - teacher role -> teacher_icon_url
 * - everything else (admin, super_admin, franchisee, null) -> general_icon_url
 */
export function useBranding() {
  const { data, isLoading } = useQuery({
    queryKey: ["organization-branding-public"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("organization_branding")
        .select(
          "general_icon_url, general_app_name, parent_icon_url, parent_app_name, teacher_icon_url, teacher_app_name, parent_branding_version, teacher_branding_version, general_branding_version"
        )
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const generalIcon = data?.general_icon_url || "/logo.png";
  const parentIcon = data?.parent_icon_url || generalIcon;
  const teacherIcon = data?.teacher_icon_url || generalIcon;

  const generalName = data?.general_app_name || "Sprouts";
  const parentName = data?.parent_app_name || generalName;
  const teacherName = data?.teacher_app_name || generalName;

  const iconForRole = (role?: string | null): string => {
    if (role === "parent") return parentIcon;
    if (role === "teacher") return teacherIcon;
    return generalIcon;
  };

  const nameForRole = (role?: string | null): string => {
    if (role === "parent") return parentName;
    if (role === "teacher") return teacherName;
    return generalName;
  };

  return {
    isLoading,
    generalIcon,
    parentIcon,
    teacherIcon,
    generalName,
    parentName,
    teacherName,
    iconForRole,
    nameForRole,
    raw: data,
  };
}