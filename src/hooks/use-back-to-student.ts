import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TAB_LABELS: Record<string, string> = {
  journal: "Journal",
  profile: "Profile",
  family: "Family",
  academic: "Progress",
  growth: "Progress",
  assessment: "Progress",
  assessments: "Progress",
  progress: "Progress",
  attendance: "Attendance",
  billing: "Billing",
  lifecycle: "Lifecycle",
  story: "Journal",
};

/**
 * Reads a `?from=student:<id>` query param and exposes a back handler
 * + the student's display name so every detail page can show a
 * consistent "← Back to {Child}" affordance.
 *
 * Also recognises `?from=student:<id>:<tab>` to route back to a
 * specific tab on the student profile.
 */
export function useBackToStudent() {
  const location = useLocation();
  const navigate = useNavigate();
  const sp = new URLSearchParams(location.search);
  const from = sp.get("from") ?? "";
  const match = /^student:([0-9a-f-]{36})(?::([a-z]+))?$/i.exec(from);
  const studentId = match?.[1] ?? null;
  // Default back-target = the unified Progress hub. Legacy tabs are remapped
  // by StudentDetail; here we just pass them through and let it decide.
  const tab = match?.[2] ?? "progress";

  const { data: student } = useQuery({
    queryKey: ["back-to-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, photo_url, class_name")
        .eq("id", studentId!)
        .maybeSingle();
      return data;
    },
  });

  if (!studentId) {
    return {
      active: false as const,
      goBack: () => navigate(-1),
      label: "Back",
      studentName: null,
      avatarUrl: null,
      subtitle: null,
      contextKind: null,
    };
  }

  const studentName = student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() : "child profile";
  const tabLabel = TAB_LABELS[tab] ?? null;
  return {
    active: true as const,
    studentId,
    studentName,
    avatarUrl: (student as any)?.photo_url ?? null,
    subtitle: tabLabel ? `${tabLabel} tab${(student as any)?.class_name ? ` · ${(student as any).class_name}` : ""}`
      : ((student as any)?.class_name ?? null),
    contextKind: "student" as const,
    label: `Back to ${studentName || "profile"}`,
    goBack: () => navigate(`/students/${studentId}?tab=${tab}`),
  };
}

/** Helper for callers: build the `?from=` value to thread through links. */
export function backFromStudent(studentId: string, tab = "billing") {
  return `from=student:${studentId}:${tab}`;
}