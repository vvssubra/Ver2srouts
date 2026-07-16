import { forwardRef } from "react";

interface LeaveReportRow {
  no: number;
  name: string;
  status: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  applyDate: string;
  approvalDate: string;
}

interface LeaveReportPrintData {
  title: string;
  branchName: string;
  logoUrl?: string;
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  filterSummary: string;
  generatedAt: string;
  rows: LeaveReportRow[];
}

const LeaveReportPrintView = forwardRef<HTMLDivElement, { data: LeaveReportPrintData }>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="hidden print:block" style={{ fontFamily: "'Segoe UI', Tahoma, sans-serif", color: "#1a1a1a", fontSize: "11px", padding: "20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "3px solid #2563eb", paddingBottom: "16px", marginBottom: "16px" }}>
          {data.logoUrl && (
            <img src={data.logoUrl} alt="Logo" style={{ width: "64px", height: "64px", objectFit: "contain", marginRight: "16px", borderRadius: "8px" }} />
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#1e40af" }}>
              {data.schoolName || data.branchName}
            </h1>
            {data.schoolAddress && <p style={{ margin: "2px 0", fontSize: "10px", color: "#6b7280" }}>{data.schoolAddress}</p>}
            <div style={{ display: "flex", gap: "16px", fontSize: "10px", color: "#6b7280" }}>
              {data.schoolPhone && <span>Tel: {data.schoolPhone}</span>}
              {data.schoolEmail && <span>Email: {data.schoolEmail}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#1e40af" }}>{data.title}</h2>
            <p style={{ fontSize: "10px", color: "#6b7280", margin: "4px 0 0" }}>Generated: {data.generatedAt}</p>
          </div>
        </div>

        {/* Filter summary */}
        {data.filterSummary && (
          <div style={{ background: "#f3f4f6", padding: "8px 12px", borderRadius: "6px", marginBottom: "12px", fontSize: "10px", color: "#374151" }}>
            <strong>Filters:</strong> {data.filterSummary}
          </div>
        )}

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <thead>
            <tr style={{ background: "#2563eb", color: "#ffffff" }}>
              {["No.", "Name", "Status", "Leave Type", "Start Date", "End Date", "Days", "Apply Date", "Approval Date"].map((h) => (
                <th key={h} style={{ padding: "8px 6px", textAlign: "left", fontWeight: 600, fontSize: "10px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb", background: idx % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                <td style={{ padding: "6px" }}>{row.no}</td>
                <td style={{ padding: "6px", fontWeight: 500 }}>{row.name}</td>
                <td style={{ padding: "6px" }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: "12px", fontSize: "9px", fontWeight: 600,
                    background: row.status === "Approved" ? "#dcfce7" : row.status === "Rejected" ? "#fee2e2" : row.status === "Cancelled" ? "#f3f4f6" : "#fef9c3",
                    color: row.status === "Approved" ? "#166534" : row.status === "Rejected" ? "#991b1b" : row.status === "Cancelled" ? "#6b7280" : "#854d0e",
                  }}>
                    {row.status}
                  </span>
                </td>
                <td style={{ padding: "6px" }}>{row.leaveType}</td>
                <td style={{ padding: "6px" }}>{row.startDate}</td>
                <td style={{ padding: "6px" }}>{row.endDate}</td>
                <td style={{ padding: "6px", textAlign: "center" }}>{row.days}</td>
                <td style={{ padding: "6px" }}>{row.applyDate}</td>
                <td style={{ padding: "6px" }}>{row.approvalDate}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#9ca3af" }}>
          <span>Total Records: {data.rows.length}</span>
          <span>{data.schoolName || data.branchName} — Confidential</span>
        </div>
      </div>
    );
  }
);

LeaveReportPrintView.displayName = "LeaveReportPrintView";
export default LeaveReportPrintView;
