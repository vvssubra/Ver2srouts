import { forwardRef } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface PayslipData {
  staffName: string;
  staffEmail: string;
  staffIc?: string;
  staffId?: string;
  designation?: string;
  employmentType?: string;
  epfNumber?: string;
  socsoNumber?: string;
  branchName: string;
  logoUrl?: string;
  schoolName?: string;
  companyRegNo?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  month: number;
  year: number;
  basicSalary: number;
  allowances: number;
  otherAllowances: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimeAmount: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  pcbAmount: number;
  lateDeduction: number;
  unpaidLeaveDeduction?: number;
  absentDeduction?: number;
  absentDays?: number;
  unpaidLeaveDays?: number;
  advanceDeduction: number;
  otherDeductions: number;
  claimsAmount: number;
  earlyPaidClaimsAmount?: number;
  earlyPaidClaimsDate?: string;
  netSalary: number;
  status: string;
  paidAt?: string;
  ytdGross?: number;
  ytdEpfEmployee?: number;
  ytdSocsoEmployee?: number;
  ytdEisEmployee?: number;
  ytdPcb?: number;
  ytdNet?: number;
  // Dynamic line items so the PDF reflects EVERYTHING shown in the generator
  // (salary components like "Performance Allowance" and custom items like "Advance").
  extraEarnings?: { label: string; amount: number }[];
  extraDeductions?: { label: string; amount: number }[];
}

const rm = (v: number) => `RM ${v.toFixed(2)}`;

const PayslipPrintView = forwardRef<HTMLDivElement, { data: PayslipData }>(
  ({ data }, ref) => {
    const earlyPaidAmount = data.earlyPaidClaimsAmount || 0;
    const extraEarnings = (data.extraEarnings || []).filter(e => e && e.amount > 0);
    const extraDeductions = (data.extraDeductions || []).filter(e => e && e.amount > 0);
    const isIntern = data.employmentType === "intern";

    // Intern per-day divisor = actual Mon–Fri days in the payroll month
    // (matches Payroll.tsx). Shown next to Absent/Unpaid Leave lines so
    // the daily rate is transparent on the payslip.
    const internWorkDaysInMonth = (() => {
      if (!isIntern) return 0;
      const daysInMonth = new Date(data.year, data.month, 0).getDate();
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(data.year, data.month - 1, d).getDay();
        if (dow !== 0 && dow !== 6) count++;
      }
      return count || 22;
    })();
    const internBasisNote = isIntern ? ` · basis ${internWorkDaysInMonth} days` : "";

    // --- Earnings (salary only, no reimbursements) ---
    // grossSalary from Payroll.tsx = basicSalary + allowances + otherAllowances + OT + salary components
    // claims are added separately to net, not part of gross
    const salaryGross = data.grossSalary;

    // --- Reimbursements paid via this payroll run ---
    const payrollReimbursements = data.claimsAmount;

    // --- Statutory & other deductions (excluding early-paid recovery) ---
    const statutoryDeductions = isIntern
      ? 0
      : data.epfEmployee + data.socsoEmployee + data.eisEmployee + data.pcbAmount;
    const otherDeductions =
      data.lateDeduction + (data.unpaidLeaveDeduction || 0) +
      (data.absentDeduction || 0) +
      data.advanceDeduction + data.otherDeductions;
    const extraDedTotal = extraDeductions.reduce((s, d) => s + d.amount, 0);
    const totalDeductionsBeforeRecovery = statutoryDeductions + otherDeductions + extraDedTotal;
    const totalDeductions = totalDeductionsBeforeRecovery + earlyPaidAmount;

    // --- Net Payable = Gross - All Deductions + Reimbursements ---
    // This matches: data.netSalary = gross - deductions + claimsAmount (from Payroll.tsx)
    // But we present it as: Gross - Deductions + Reimbursements
    const netPayable = data.netSalary;

    const designation = data.designation || data.staffId || "";

    return (
      <div ref={ref} className="hidden print:block">
        <style>{`
          @media print {
            @page { 
              margin: 0; 
              size: A4;
            }
            body * { visibility: hidden !important; }
            .payslip-print, .payslip-print * { visibility: visible !important; }
            .payslip-print { 
              position: absolute; left: 0; top: 0; width: 100%; 
              padding: 10mm 16mm; 
              box-sizing: border-box;
              font-family: 'Segoe UI', Arial, sans-serif; 
              font-size: 11px; 
              color: #1a1a1a; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        `}</style>
        <div className="payslip-print">
          {/* ═══ Company Header ═══ */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 14, borderBottom: "3px solid #2563eb" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {data.logoUrl && (
                <img src={data.logoUrl} alt="Logo" style={{ height: 56, width: 56, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb" }} />
              )}
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5, color: "#111" }}>
                  {data.schoolName || data.branchName || "PAYSLIP"}
                </h1>
                {data.companyRegNo && (
                  <p style={{ margin: "1px 0 0", color: "#6b7280", fontSize: 10 }}>Reg No: {data.companyRegNo}</p>
                )}
                <p style={{ margin: "1px 0 0", color: "#6b7280", fontSize: 10 }}>{data.branchName}</p>
                {data.companyAddress && (
                  <p style={{ margin: "1px 0 0", color: "#6b7280", fontSize: 10 }}>{data.companyAddress}</p>
                )}
                {(data.companyPhone || data.companyEmail) && (
                  <p style={{ margin: "1px 0 0", color: "#6b7280", fontSize: 10 }}>
                    {data.companyPhone}{data.companyPhone && data.companyEmail ? " | " : ""}{data.companyEmail}
                  </p>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 120 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280" }}>Payslip</p>
              <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: 15, color: "#111" }}>{MONTHS[data.month - 1]} {data.year}</p>
              <p style={{
                margin: "4px 0 0",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                padding: "2px 8px",
                borderRadius: 3,
                display: "inline-block",
                background: data.status === "paid" ? "#dcfce7" : data.status === "confirmed" ? "#dbeafe" : "#fef3c7",
                color: data.status === "paid" ? "#166534" : data.status === "confirmed" ? "#1e40af" : "#92400e",
              }}>{data.status === "paid" ? "PAID" : data.status === "confirmed" ? "CONFIRMED" : "DRAFT"}</p>
            </div>
          </div>

          {/* ═══ Employee Info ═══ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 14, padding: "10px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <InfoField label="Employee Name" value={data.staffName} bold />
            {data.staffIc && <InfoField label="IC Number" value={data.staffIc} />}
            {designation && <InfoField label="Position" value={designation.replace(/\b\w/g, c => c.toUpperCase())} />}
            {data.epfNumber && <InfoField label="EPF No." value={data.epfNumber} />}
            <InfoField label="Email" value={data.staffEmail} />
          </div>

          {/* ═══ Main Body: Earnings & Deductions ═══ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 16 }}>
            {/* ─── LEFT: Earnings + Reimbursements + Audit Trail ─── */}
            <div>
              {/* Section A: Salary Earnings */}
              <SectionHeader title="A. Salary Earnings" color="#2563eb" />
              <Row label={isIntern ? "Monthly Allowance" : "Basic Salary"} value={rm(data.basicSalary)} />
              {data.allowances > 0 && <Row label="Fixed Allowances" value={rm(data.allowances)} />}
              {data.otherAllowances > 0 && <Row label="Other Allowances" value={rm(data.otherAllowances)} />}
              {data.overtimeAmount > 0 && <Row label={`Overtime (${data.overtimeHours}hrs × ${rm(data.overtimeRate)})`} value={rm(data.overtimeAmount)} />}
              {extraEarnings.map((e, i) => (
                <Row key={`earn-${i}`} label={e.label || "Allowance"} value={rm(e.amount)} />
              ))}
              <Row label="Gross Salary" value={rm(salaryGross)} bold />

              {/* Section B: Reimbursements */}
              {payrollReimbursements > 0 && (
                <div style={{ marginTop: 12 }}>
                  <SectionHeader title="B. Reimbursements" color="#2563eb" />
                  <Row label="Claims Reimbursement" value={rm(payrollReimbursements)} highlight />
                  <div style={{ fontSize: 9, color: "#6b7280", fontStyle: "italic", marginTop: 2 }}>
                    Non-taxable reimbursement paid via this payroll run.
                  </div>
                </div>
              )}

              {/* Section C: Earlier Payments / Audit Trail */}
              {earlyPaidAmount > 0 && (
                <div style={{ marginTop: 12 }}>
                  <SectionHeader title="C. Earlier Payments (Audit Trail)" color="#9333ea" />
                  <Row
                    label={`Claim Paid Earlier${data.earlyPaidClaimsDate ? ` (${data.earlyPaidClaimsDate})` : ""}`}
                    value={rm(earlyPaidAmount)}
                    color="#9333ea"
                  />
                  <div style={{
                    marginTop: 4,
                    padding: "6px 10px",
                    background: "#faf5ff",
                    border: "1px solid #e9d5ff",
                    borderRadius: 4,
                    fontSize: 9,
                    color: "#6b21a8",
                    lineHeight: 1.4,
                  }}>
                    These items were already paid earlier and are shown for audit trail only. They are not additional month-end payments. A corresponding recovery deduction is applied under Deductions.
                  </div>
                </div>
              )}
            </div>

            {/* ─── RIGHT: Deductions ─── */}
            <div>
              <SectionHeader title="D. Deductions" color="#dc2626" />
              {!isIntern && <Row label="EPF (Employee)" value={rm(data.epfEmployee)} />}
              {!isIntern && <Row label="SOCSO + Perlindungan 24 Jam (1.25%)" value={rm(data.socsoEmployee)} />}
              {!isIntern && <Row label="EIS (Employee)" value={rm(data.eisEmployee)} />}
              {!isIntern && <Row label="PCB (Tax)" value={rm(data.pcbAmount)} />}
              {(data.unpaidLeaveDeduction || 0) > 0 && <Row label={`Unpaid Leave${data.unpaidLeaveDays ? ` (${data.unpaidLeaveDays}d${internBasisNote})` : internBasisNote ? ` (${internBasisNote.replace(" · ", "")})` : ""}`} value={rm(data.unpaidLeaveDeduction!)} />}
              {(data.absentDeduction || 0) > 0 && <Row label={`Absent${data.absentDays ? ` (${data.absentDays}d${internBasisNote})` : internBasisNote ? ` (${internBasisNote.replace(" · ", "")})` : ""}`} value={rm(data.absentDeduction!)} />}
              {data.lateDeduction > 0 && <Row label="Late Deduction" value={rm(data.lateDeduction)} />}
              {data.advanceDeduction > 0 && <Row label="Advance Deduction" value={rm(data.advanceDeduction)} />}
              {data.otherDeductions > 0 && <Row label="Other Deductions" value={rm(data.otherDeductions)} />}
              {extraDeductions.map((d, i) => (
                <Row key={`ded-${i}`} label={d.label || "Deduction"} value={rm(d.amount)} />
              ))}
              {earlyPaidAmount > 0 && (
                <Row label="Recovery of Earlier Claim Payment" value={rm(earlyPaidAmount)} />
              )}
              <Row label="Total Deductions" value={rm(totalDeductions)} bold />
            </div>
          </div>

          {/* ═══ Employer Contributions ═══ */}
          {!isIntern && (
          <div style={{ marginTop: 16 }}>
            <SectionHeader title="E. Employer Contributions (For Reference)" color="#6b7280" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
              <Row label="EPF (Employer)" value={rm(data.epfEmployer)} />
              <Row label="SOCSO (Employer)" value={rm(data.socsoEmployer)} />
              <Row label="EIS (Employer)" value={rm(data.eisEmployer)} />
            </div>
          </div>
          )}

          {/* ═══ Summary Box ═══ */}
          <div style={{
            marginTop: 16,
            padding: "14px 16px",
            background: "#f8fafc",
            borderRadius: 6,
            border: "1px solid #e2e8f0",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", margin: "0 0 8px", letterSpacing: 0.5 }}>
              F. Payslip Summary
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0" }}>
              <span>Gross Salary</span>
              <span style={{ fontWeight: 600 }}>{rm(salaryGross)}</span>
            </div>
            {payrollReimbursements > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "#2563eb" }}>
                <span>+ Payroll-Paid Reimbursements</span>
                <span style={{ fontWeight: 600 }}>{rm(payrollReimbursements)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "#dc2626" }}>
              <span>− Total Deductions</span>
              <span style={{ fontWeight: 600 }}>{rm(totalDeductions)}</span>
            </div>
            {earlyPaidAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0", color: "#9333ea", fontStyle: "italic" }}>
                <span>&nbsp;&nbsp;(includes Recovery of Earlier Claim: {rm(earlyPaidAmount)})</span>
                <span></span>
              </div>
            )}
          </div>

          {/* ═══ Net Payable ═══ */}
          <div style={{
            marginTop: 10,
            padding: "12px 16px",
            background: "#1e3a5f",
            borderRadius: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>NET PAYABLE THIS MONTH</span>
              <span style={{ fontSize: 9, color: "#94a3b8", marginLeft: 8 }}>
                (Gross{payrollReimbursements > 0 ? " + Reimbursements" : ""} − Deductions)
              </span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{rm(netPayable)}</span>
          </div>

          {/* ═══ YTD Summary ═══ */}
          {data.ytdGross != null && data.ytdGross > 0 && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: "#f8fafc", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", margin: "0 0 8px", letterSpacing: 0.5 }}>
                Year-to-Date Summary ({data.year})
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <YtdItem label="YTD Gross" value={rm(data.ytdGross)} />
                <YtdItem label="YTD Net" value={rm(data.ytdNet || 0)} />
                <YtdItem label="YTD EPF" value={rm(data.ytdEpfEmployee || 0)} />
                <YtdItem label="YTD SOCSO" value={rm(data.ytdSocsoEmployee || 0)} />
                <YtdItem label="YTD EIS" value={rm(data.ytdEisEmployee || 0)} />
                <YtdItem label="YTD PCB" value={rm(data.ytdPcb || 0)} />
              </div>
            </div>
          )}

          {/* Footer */}
          <p style={{ marginTop: 24, textAlign: "center", fontSize: 8, color: "#9ca3af", fontStyle: "italic" }}>
            This is a system-generated payslip. No signature is required.
          </p>
        </div>
      </div>
    );
  }
);

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <p style={{
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase",
      color,
      margin: "0 0 6px",
      paddingBottom: 4,
      borderBottom: `2px solid ${color}20`,
      letterSpacing: 0.5,
    }}>{title}</p>
  );
}

function InfoField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ padding: "2px 0" }}>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</p>
      <p style={{ margin: "1px 0 0", fontWeight: bold ? 700 : 500, fontSize: 11 }}>{value}</p>
    </div>
  );
}

function YtdItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 9, textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "1px 0 0", fontWeight: 600, fontSize: 11 }}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold, highlight, color }: { label: string; value: string; bold?: boolean; highlight?: boolean; color?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      padding: "3px 0",
      fontWeight: bold ? 700 : 400,
      borderTop: bold ? "1px solid #d1d5db" : undefined,
      marginTop: bold ? 4 : 0,
      paddingTop: bold ? 6 : 3,
      color: color || (highlight ? "#2563eb" : undefined),
      fontSize: 11,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

PayslipPrintView.displayName = "PayslipPrintView";

export default PayslipPrintView;
export type { PayslipData };
