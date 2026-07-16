import { forwardRef } from "react";

export interface PtmBookletData {
  studentName: string;
  studentPhotoUrl?: string | null;
  className?: string | null;
  teacherName?: string | null;
  meetingDate?: string | null;
  termName: string;
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  registrationNo?: string;
  logoUrl?: string;
  content: any; // generated_content from ptm_reports
}

const TP_LABEL: Record<string, string> = {
  TP1: "Belum Menguasai",
  TP2: "Menguasai",
  TP3: "Melebihi",
};

function tpDot(level?: string) {
  const filled = level === "TP3" ? 3 : level === "TP2" ? 2 : level === "TP1" ? 1 : 0;
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: n <= filled ? "#16a34a" : "#e5e7eb",
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

function Page({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        width: 794,
        minHeight: 1123,
        padding: "56px 56px 64px 56px",
        boxSizing: "border-box",
        background: "white",
        position: "relative",
        pageBreakAfter: last ? "auto" : "always",
        breakAfter: last ? "auto" : "page",
      }}
    >
      {children}
    </div>
  );
}

const PtmBookletPrintView = forwardRef<HTMLDivElement, { data: PtmBookletData }>(({ data }, ref) => {
  const c = data.content || {};
  const display = data.schoolName || "School";
  const accent = "#227a5f"; // sprouts green
  const meetingDateLbl = data.meetingDate
    ? new Date(data.meetingDate).toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });

  const strengths: string[] = c.strengthsCelebrations || [];
  const supports: any[] = c.areasForSupport || [];
  const activities: any[] = c.atHomeActivities || [];
  const actions: any[] = c.actionPlan || [];
  const highlights: any[] = c.highlightMoments || [];
  const areaSummaries: any[] = c.areaSummaries || [];
  const assessmentSummary: any = c.assessmentSummary || null;
  const learningJourney: any = c.learningJourney || null;
  const journeyItems: any[] = learningJourney?.items || [];

  return (
    <div
      ref={ref}
      className="bg-white text-black mx-auto"
      style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: "#111827" }}
    >
      {/* ============ COVER PAGE ============ */}
      <Page>
        <div style={{ height: 6, background: accent, marginLeft: -56, marginRight: -56, marginBottom: 40 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {data.logoUrl && (
              <img src={data.logoUrl} alt="logo" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{display}</div>
              {data.registrationNo && <div style={{ fontSize: 10, color: "#6b7280" }}>Reg. No: {data.registrationNo}</div>}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280" }}>
            {data.schoolAddress && <div style={{ maxWidth: 280 }}>{data.schoolAddress}</div>}
            {data.schoolPhone && <div>Tel: {data.schoolPhone}</div>}
            {data.schoolEmail && <div>{data.schoolEmail}</div>}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 100 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 }}>
            Parent–Teacher Meeting Booklet
          </div>
          <div style={{ fontSize: 14, color: accent, marginTop: 6, fontWeight: 600 }}>{data.termName}</div>

          {data.studentPhotoUrl && (
            <div style={{ marginTop: 40 }}>
              <img
                src={data.studentPhotoUrl}
                alt={data.studentName}
                style={{ width: 180, height: 180, borderRadius: "50%", objectFit: "cover", border: `4px solid ${accent}` }}
              />
            </div>
          )}

          <h1 style={{ fontSize: 38, fontWeight: 800, margin: "32px 0 4px", letterSpacing: -0.5 }}>
            {data.studentName}
          </h1>
          {data.className && <div style={{ fontSize: 14, color: "#6b7280" }}>Class · {data.className}</div>}
        </div>

        <div style={{ position: "absolute", bottom: 64, left: 56, right: 56, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#9ca3af" }}>Teacher</div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{data.teacherName || "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#9ca3af" }}>Meeting Date</div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{meetingDateLbl}</div>
          </div>
        </div>
      </Page>

      {/* ============ AT A GLANCE ============ */}
      <Page>
        <SectionHeader accent={accent} eyebrow="Section 1" title="At a glance" />

        {c.overallNarrative && (
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#374151", marginTop: 0, marginBottom: 28, whiteSpace: "pre-wrap" }}>
            {c.overallNarrative}
          </p>
        )}

        {assessmentSummary && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#111827" }}>
              Assessment Summary — {assessmentSummary.academicYear ? `${assessmentSummary.academicYear} · ` : ""}{assessmentSummary.termLabel}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 10 }}>
              Baseline: {assessmentSummary.baseline?.date_evaluated || "—"} · Current: {assessmentSummary.current?.date_evaluated || "—"}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", color: "#6b7280" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Domain</th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Baseline</th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Current</th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Δ</th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {(assessmentSummary.rows || []).map((r: any, i: number) => {
                  const badge =
                    r.status === "improved"      ? { bg: "#dcfce7", fg: "#166534", label: "Improved" } :
                    r.status === "needs_support" ? { bg: "#fef3c7", fg: "#92400e", label: "Needs Support" } :
                    r.status === "maintained"    ? { bg: "#e0f2fe", fg: "#075985", label: "Maintained" } :
                                                   { bg: "#f3f4f6", fg: "#6b7280", label: "No Data" };
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, color: accent }}>{r.code}</div>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>{r.name}</div>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>{r.baseline ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontWeight: 600 }}>{r.current ?? "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", color: r.delta === null ? "#9ca3af" : r.delta > 0 ? "#16a34a" : r.delta < 0 ? "#b45309" : "#374151" }}>
                        {r.delta === null ? "—" : (r.delta > 0 ? `+${r.delta}` : r.delta)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {areaSummaries.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: "#111827" }}>Learning Area Snapshot</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f9fafb", color: "#6b7280" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Code</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Area</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Assessed</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Level</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {areaSummaries.map((a: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: accent }}>{a.areaCode}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 500 }}>{a.areaNameEn}</div>
                      <div style={{ fontSize: 10, color: "#6b7280" }}>{a.areaNameMs}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "#374151" }}>{a.assessed}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>{a.avgTP}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{tpDot(a.avgTP)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16, fontSize: 10, color: "#6b7280" }}>
              <span>● TP1 Belum Menguasai</span>
              <span>● TP2 Menguasai</span>
              <span>● TP3 Melebihi</span>
            </div>
          </div>
        )}
      </Page>

      {/* ============ STRENGTHS & SUPPORT ============ */}
      <Page>
        <SectionHeader accent={accent} eyebrow="Section 2" title="Strengths to celebrate" />
        {strengths.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 12 }}>No strengths recorded yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {strengths.map((s, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  padding: "14px 0",
                  borderBottom: i === strengths.length - 1 ? "none" : "1px solid #f3f4f6",
                }}
              >
                <div
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: "#dcfce7",
                    color: "#166534", display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                  }}
                >
                  ★
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "#1f2937", paddingTop: 4 }}>{s}</div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 40 }}>
          <SectionHeader accent={accent} eyebrow="Section 3" title="Areas we are supporting" small />
          {supports.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 12 }}>No support areas recorded.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {supports.map((a, i) => (
                <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{a.area}</div>
                  <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>{a.description}</div>
                  {a.suggestion && (
                    <div style={{ marginTop: 8, fontSize: 12, color: accent, lineHeight: 1.6 }}>
                      <strong>Try:</strong> {a.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Page>

      {/* ============ PHOTO HIGHLIGHTS ============ */}
      {highlights.length > 0 && (
        <Page>
          <SectionHeader accent={accent} eyebrow="Section 4" title="Highlights from this term" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {highlights.map((h, i) => (
              <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fafafa" }}>
                <div style={{ width: "100%", height: 140, background: "#f3f4f6", overflow: "hidden", position: "relative" }}>
                  {h.photo_url && (
                    <img
                      src={h.photo_url}
                      alt={h.caption || "moment"}
                      crossOrigin="anonymous"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                  {h.milestone && (
                    <span style={{
                      position: "absolute", top: 6, left: 6, background: "#fde68a", color: "#92400e",
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.4,
                    }}>Milestone</span>
                  )}
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 9, color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    {h.domain}
                  </div>
                  <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, minHeight: 32 }}>
                    {h.caption?.length > 110 ? h.caption.slice(0, 107) + "…" : h.caption}
                  </div>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 6 }}>
                    {new Date(h.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Page>
      )}

      {/* ============ LEARNING JOURNEY TIMELINE ============ */}
      <Page>
        <SectionHeader
          accent={accent}
          eyebrow="Learning Journey"
          title={`Journey${learningJourney?.termLabel ? " · " + learningJourney.termLabel : ""}`}
        />
        {journeyItems.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 12 }}>
            No Learning Journey records are available for the selected PTM period.
          </p>
        ) : (
          <div style={{ position: "relative", paddingLeft: 18 }}>
            <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: "#e5e7eb" }} />
            {journeyItems.map((it: any, i: number) => {
              const tpBadge = it.tpLevel
                ? { bg: it.tpLevel === "TP3" ? "#dcfce7" : it.tpLevel === "TP2" ? "#e0f2fe" : "#fef3c7",
                    fg: it.tpLevel === "TP3" ? "#166534" : it.tpLevel === "TP2" ? "#075985" : "#92400e" }
                : null;
              return (
                <div key={it.key || i} style={{ position: "relative", marginBottom: 14, pageBreakInside: "avoid" }}>
                  <span style={{
                    position: "absolute", left: -18, top: 4, width: 12, height: 12, borderRadius: "50%",
                    background: accent, border: "2px solid white", boxShadow: "0 0 0 2px #e5e7eb",
                  }} />
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, fontSize: 10, color: "#6b7280", marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>
                      {it.date ? new Date(it.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : ""}
                    </span>
                    {it.domain && <span>· {it.domain}</span>}
                    {tpBadge && (
                      <span style={{
                        padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 700,
                        background: tpBadge.bg, color: tpBadge.fg, textTransform: "uppercase", letterSpacing: 0.4,
                      }}>{it.tpLevel}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{it.title}</div>
                  {it.teacherNote && (
                    <div style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.5, marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {it.teacherNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 20, fontSize: 9, color: "#9ca3af" }}>
          Read directly from the Learning Journey module. TP1/TP2/TP3 come from teachers' original assessments.
        </div>
      </Page>

      {/* ============ AT-HOME + ACTION PLAN + SIGNATURES ============ */}
      <Page last>
        {activities.length > 0 && (
          <>
            <SectionHeader accent={accent} eyebrow="Section 5" title="Try at home" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 36 }}>
              {activities.map((act, i) => (
                <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, background: "#fafafa" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{act.title}</div>
                  {act.learningArea && (
                    <div style={{ fontSize: 9, color: accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                      {act.learningArea}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#4b5563", lineHeight: 1.6, marginTop: 8 }}>{act.description}</div>
                  {act.materials && (
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>
                      <strong>Materials:</strong> {act.materials}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {actions.length > 0 && (
          <>
            <SectionHeader accent={accent} eyebrow="Section 6" title="Action plan" small />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 36 }}>
              <thead>
                <tr style={{ background: "#f9fafb", color: "#6b7280" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Action</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, width: 100 }}>Owner</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, width: 120 }}>Timeline</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", color: "#1f2937" }}>{a.action}</td>
                    <td style={{ padding: "10px 12px", color: "#4b5563", textTransform: "capitalize" }}>{a.owner}</td>
                    <td style={{ padding: "10px 12px", color: "#4b5563" }}>{a.timeline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Signatures */}
        <div style={{ marginTop: 60 }}>
          <SectionHeader accent={accent} eyebrow="Acknowledgement" title="Signatures" small />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 20 }}>
            <div>
              <div style={{ borderBottom: "1px solid #111827", height: 50 }} />
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>Teacher signature</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{data.teacherName || ""}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{meetingDateLbl}</div>
            </div>
            <div>
              <div style={{ borderBottom: "1px solid #111827", height: 50 }} />
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>Parent signature</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 24 }}>{meetingDateLbl}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 28, left: 56, right: 56, fontSize: 9, color: "#9ca3af", textAlign: "center", borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          {display} · PTM Booklet · {data.studentName} · {data.termName}
        </div>
      </Page>
    </div>
  );
});

PtmBookletPrintView.displayName = "PtmBookletPrintView";
export default PtmBookletPrintView;

function SectionHeader({ accent, eyebrow, title, small }: { accent: string; eyebrow: string; title: string; small?: boolean }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: accent, textTransform: "uppercase", fontWeight: 700 }}>{eyebrow}</div>
      <h2 style={{ fontSize: small ? 20 : 26, fontWeight: 800, margin: "4px 0 0", color: "#111827", letterSpacing: -0.3 }}>{title}</h2>
    </div>
  );
}