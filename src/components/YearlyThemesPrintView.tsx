import { forwardRef } from "react";
import { format } from "date-fns";

interface Theme {
  week_number: number;
  main_theme: string;
  sub_theme?: string;
  rationale?: string;
  start_date: string;
  end_date: string;
}

interface Holiday {
  event_date: string;
  end_date?: string;
  event_name: string;
  is_public_holiday?: boolean;
}

interface YearlyThemesPrintViewProps {
  yearName: string;
  schoolName?: string;
  themes: Theme[];
  holidays: Holiday[];
  totalWeeks: number;
}

const TERM_COLORS = {
  1: "#7c3aed",
  2: "#0891b2",
  3: "#059669",
  4: "#d97706",
};

const YearlyThemesPrintView = forwardRef<HTMLDivElement, YearlyThemesPrintViewProps>(
  ({ yearName, schoolName, themes, holidays, totalWeeks }, ref) => {
    const weeksPerTerm = Math.ceil(totalWeeks / 4);
    const t1End = weeksPerTerm;
    const t2End = weeksPerTerm * 2;
    const t3End = weeksPerTerm * 3;

    const getTermNum = (weekNum: number) => {
      if (weekNum <= t1End) return 1;
      if (weekNum <= t2End) return 2;
      if (weekNum <= t3End) return 3;
      return 4;
    };

    const getWeekHolidays = (weekStart: string, weekEnd: string) => {
      return holidays.filter((h) => {
        const hStart = h.event_date;
        const hEnd = h.end_date || h.event_date;
        return hEnd >= weekStart && hStart <= weekEnd;
      });
    };

    const termGroups = [
      { term: 1, label: "Term 1", themes: themes.filter(t => getTermNum(t.week_number) === 1), color: TERM_COLORS[1] },
      { term: 2, label: "Term 2", themes: themes.filter(t => getTermNum(t.week_number) === 2), color: TERM_COLORS[2] },
      { term: 3, label: "Term 3", themes: themes.filter(t => getTermNum(t.week_number) === 3), color: TERM_COLORS[3] },
      { term: 4, label: "Term 4", themes: themes.filter(t => getTermNum(t.week_number) === 4), color: TERM_COLORS[4] },
    ].filter(g => g.themes.length > 0);

    return (
      <div ref={ref} className="bg-white text-black" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <style>{`
          @media print {
            @page { size: A4 landscape; margin: 12mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-page-break { page-break-before: always; }
          }
        `}</style>

        {/* Cover / Header */}
        <div style={{ textAlign: "center", padding: "40px 20px 24px", borderBottom: "3px solid #7c3aed" }}>
          <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "3px", color: "#6b7280", marginBottom: "8px" }}>
            {schoolName || "Preschool"}
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#1e1b4b", margin: "0 0 4px" }}>
            Yearly Curriculum Themes
          </h1>
          <div style={{ fontSize: "16px", color: "#4b5563" }}>
            Academic Year {yearName}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "16px" }}>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>📅 {themes.length} Weeks</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>📚 4 Terms</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>🎉 {holidays.length} Holidays</span>
          </div>
        </div>

        {/* Term Sections */}
        {termGroups.map((group, gi) => (
          <div key={group.term} className={gi > 0 ? "print-page-break" : ""} style={{ padding: "20px 0" }}>
            {/* Term Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "10px 16px", marginBottom: "12px",
              background: `${group.color}10`, borderLeft: `4px solid ${group.color}`, borderRadius: "0 8px 8px 0",
            }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: group.color }}>{group.label}</span>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>
                Weeks {group.themes[0]?.week_number}–{group.themes[group.themes.length - 1]?.week_number}
                {" · "}
                {group.themes[0]?.start_date && format(new Date(group.themes[0].start_date), "d MMM")}
                {" → "}
                {group.themes[group.themes.length - 1]?.end_date && format(new Date(group.themes[group.themes.length - 1].end_date), "d MMM yyyy")}
              </span>
            </div>

            {/* Theme Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ ...thStyle, width: "60px" }}>Week</th>
                  <th style={{ ...thStyle, width: "130px" }}>Dates</th>
                  <th style={{ ...thStyle, minWidth: "180px" }}>Main Theme</th>
                  <th style={thStyle}>Sub-Theme / Focus</th>
                  <th style={thStyle}>Rationale</th>
                  <th style={{ ...thStyle, width: "140px" }}>Holidays</th>
                </tr>
              </thead>
              <tbody>
                {group.themes.map((theme) => {
                  const weekHolidays = getWeekHolidays(theme.start_date, theme.end_date);
                  return (
                    <tr key={theme.week_number} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: group.color }}>
                        {theme.week_number}
                      </td>
                      <td style={{ ...tdStyle, fontSize: "11px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {format(new Date(theme.start_date), "d MMM")} – {format(new Date(theme.end_date), "d MMM")}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{theme.main_theme}</td>
                      <td style={{ ...tdStyle, color: "#4b5563" }}>{theme.sub_theme || "—"}</td>
                      <td style={{ ...tdStyle, color: "#6b7280", fontSize: "11px" }}>{theme.rationale || "—"}</td>
                      <td style={tdStyle}>
                        {weekHolidays.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {weekHolidays.map((h, i) => (
                              <span key={i} style={{
                                display: "inline-block", fontSize: "10px", padding: "1px 6px",
                                background: "#fef3c7", color: "#92400e", borderRadius: "4px",
                              }}>
                                🎉 {h.event_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Footer */}
        <div style={{ borderTop: "2px solid #e5e7eb", padding: "12px 16px", marginTop: "16px", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#9ca3af" }}>
          <span>Generated on {format(new Date(), "d MMMM yyyy, h:mm a")}</span>
          <span>{schoolName || "Preschool"} — Yearly Curriculum Themes {yearName}</span>
        </div>
      </div>
    );
  }
);

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  fontSize: "11px",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
};

YearlyThemesPrintView.displayName = "YearlyThemesPrintView";

export default YearlyThemesPrintView;
