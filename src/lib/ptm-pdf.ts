import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

type AnyReport = {
  id: string;
  term_name?: string | null;
  report_type?: string | null;
  created_at: string;
  generated_content?: any;
  students?: { first_name?: string | null; last_name?: string | null } | null;
};

const sanitize = (s: string) => s.replace(/[^\w\d-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

function addSection(doc: jsPDF, title: string, body: string | string[] | undefined, y: number): number {
  if (!body || (Array.isArray(body) && body.length === 0)) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;

  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(title, margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  const items = Array.isArray(body) ? body : [body];
  for (const raw of items) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    const prefix = Array.isArray(body) ? "•  " : "";
    const lines = doc.splitTextToSize(prefix + text, maxWidth);
    for (const line of lines) {
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 5;
    }
    if (Array.isArray(body)) y += 1;
  }
  return y + 4;
}

export function generatePtmReportPdf(report: AnyReport, opts?: { branchName?: string }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  const studentName = `${report.students?.first_name ?? ""} ${report.students?.last_name ?? ""}`.trim() || "Student";
  // Prefer the Academic Year + Term captured in the booklet's structured
  // content (recorded at generation time from the teacher's selection) so the
  // cover always reflects the selected Academic Year, even if a legacy
  // AI-generated `term_name` string contains a different year.
  const summary = report.generated_content?.assessmentSummary;
  const composedTerm =
    summary?.academicYear && summary?.termLabel
      ? `${summary.academicYear} · ${summary.termLabel}`
      : null;
  const termName = composedTerm || report.term_name || "Term Report";
  const reportType = report.report_type || "summary";
  const createdDate = format(new Date(report.created_at), "d MMM yyyy");

  // Header band
  doc.setFillColor(34, 122, 95); // sprouts green
  doc.rect(0, 0, pageWidth, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PTM Report", margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(opts?.branchName || "Parent–Teacher Meeting Summary", margin, 19);

  // Meta box
  let y = 36;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(studentName, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`${termName}  ·  ${reportType.toUpperCase()}  ·  Issued ${createdDate}`, margin, y);
  y += 8;

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  const c = report.generated_content || {};

  // Narrative
  y = addSection(doc, "Overall Summary", c.overallNarrative || c.summary || c.overview || c.narrative, y);

  // Strengths
  const strengths = c.strengthsCelebrations || c.strengths || c.highlights;
  y = addSection(doc, "Strengths & Celebrations", strengths, y);

  // Areas for support — may be array of objects {area, description, suggestion}
  if (Array.isArray(c.areasForSupport) && c.areasForSupport.length > 0) {
    const lines = c.areasForSupport.map((a: any) =>
      `${a.area ? a.area + ": " : ""}${a.description ?? ""}${a.suggestion ? "  →  " + a.suggestion : ""}`
    );
    y = addSection(doc, "Areas for Support", lines, y);
  } else {
    y = addSection(doc, "Areas to Develop", c.areas_to_develop || c.improvements || c.next_steps, y);
  }

  // At-home activities
  if (Array.isArray(c.atHomeActivities) && c.atHomeActivities.length > 0) {
    const lines = c.atHomeActivities.map((a: any) =>
      `${a.title ? a.title + ": " : ""}${a.description ?? ""}${a.materials ? "  (Materials: " + a.materials + ")" : ""}`
    );
    y = addSection(doc, "Try At Home", lines, y);
  }

  y = addSection(doc, "Action Items", c.action_items || c.actions || c.recommendations, y);
  y = addSection(doc, "Teacher Comments", c.teacher_comments || c.comments || c.notes, y);

  // Domain breakdown table if present
  if (c.domains && typeof c.domains === "object") {
    const rows = Object.entries(c.domains).map(([k, v]: any) => [
      String(k),
      typeof v === "string" ? v : (v?.summary ?? v?.note ?? JSON.stringify(v)),
    ]);
    if (rows.length) {
      autoTable(doc, {
        startY: y,
        head: [["Domain", "Notes"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [34, 122, 95], textColor: 255 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated ${format(new Date(), "d MMM yyyy, HH:mm")}  ·  Page ${i} of ${pageCount}`,
      margin,
      ph - 8,
    );
  }

  doc.save(`PTM_${sanitize(studentName)}_${sanitize(termName)}.pdf`);
}