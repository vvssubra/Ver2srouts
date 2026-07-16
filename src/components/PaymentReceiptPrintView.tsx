import { forwardRef } from "react";

interface PaymentReceiptData {
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  billingMonth: number;
  billingYear: number;
  invoiceTotal: number;
  invoicePaidToDate: number; // including this payment
  invoiceBalanceAfter: number;
  payment: {
    date: string;
    method: string;
    amount: number;
    reference?: string;
  };
  branchName?: string;
  organizationName?: string;
  logoUrl?: string;
  schoolName?: string;
  registrationNo?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  receiptFooter?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PaymentReceiptPrintView = forwardRef<HTMLDivElement, { data: PaymentReceiptData }>(
  ({ data }, ref) => {
    const rm = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;
    const fullyPaid = data.invoiceBalanceAfter <= 0.005;
    const accent = "#16a34a"; // green — payment received
    const displayName = data.schoolName || data.organizationName || data.branchName || "";
    const paymentDateLabel = new Date(data.payment.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });

    return (
      <div
        ref={ref}
        className="bg-white text-black mx-auto"
        style={{
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          maxWidth: 794,
          minHeight: 1123,
          padding: "0 48px 48px 48px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* RECEIVED stamp */}
        <div style={{
          position: "absolute", top: 170, right: 60, width: 130, height: 130,
          border: "4px solid #16a34a", borderRadius: "50%",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          transform: "rotate(-15deg)", opacity: 0.9, zIndex: 2, pointerEvents: "none",
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#16a34a", lineHeight: 1, letterSpacing: 2 }}>RECEIVED</span>
          <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 600, marginTop: 4 }}>{paymentDateLabel}</span>
          <span style={{ fontSize: 8, color: "#16a34a", marginTop: 2 }}>VERIFIED</span>
        </div>

        {/* Accent bar */}
        <div style={{ height: 5, background: accent, marginLeft: -48, marginRight: -48, marginBottom: 32 }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 24, borderBottom: "1px solid #e5e7eb", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            {data.logoUrl && (
              <img src={data.logoUrl} alt="Logo" style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 6, border: "1px solid #e5e7eb" }} />
            )}
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#111827", lineHeight: 1.3 }}>{displayName}</h1>
              {data.registrationNo && <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>Reg. No: {data.registrationNo}</p>}
              {data.schoolAddress && <p style={{ fontSize: 11, color: "#6b7280", margin: "4px 0 0", maxWidth: 280, lineHeight: 1.4 }}>{data.schoolAddress}</p>}
              <div style={{ display: "flex", gap: 16, marginTop: 3 }}>
                {data.schoolPhone && <span style={{ fontSize: 11, color: "#6b7280" }}>Tel: {data.schoolPhone}</span>}
                {data.schoolEmail && <span style={{ fontSize: 11, color: "#6b7280" }}>{data.schoolEmail}</span>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: accent, margin: 0, letterSpacing: 1 }}>PAYMENT RECEIPT</h2>
            <p style={{ fontFamily: "monospace", fontSize: 13, margin: "6px 0 0", color: "#374151" }}>{data.receiptNumber}</p>
          </div>
        </div>

        {/* Received from + amount hero */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 6 }}>Received From</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: 0 }}>{data.studentName}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 4 }}>Amount Received</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: accent, margin: 0 }}>{rm(data.payment.amount)}</p>
            <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>on {paymentDateLabel}</p>
          </div>
        </div>

        {/* Payment Details */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: 8 }}>Payment Details</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 8px", color: "#6b7280", width: 180 }}>Payment Method</td>
                <td style={{ padding: "8px 8px", textTransform: "capitalize", color: "#111827" }}>{data.payment.method.replace(/_/g, " ")}</td>
              </tr>
              {data.payment.reference && (
                <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 8px", color: "#6b7280" }}>Reference</td>
                  <td style={{ padding: "8px 8px", fontFamily: "monospace", fontSize: 12, color: "#111827" }}>{data.payment.reference}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: "8px 8px", color: "#6b7280" }}>Payment Date</td>
                <td style={{ padding: "8px 8px", color: "#111827" }}>{paymentDateLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Applied To Invoice */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: 8 }}>Applied To Invoice</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 8px", color: "#6b7280", width: 180 }}>Invoice Number</td>
                <td style={{ padding: "8px 8px", fontFamily: "monospace", color: "#111827" }}>{data.invoiceNumber}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 8px", color: "#6b7280" }}>Billing Period</td>
                <td style={{ padding: "8px 8px", color: "#111827" }}>{MONTHS[data.billingMonth - 1]} {data.billingYear}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Account Status */}
        <div style={{ marginBottom: 28, padding: 16, borderRadius: 6, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}>
          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: 10 }}>Invoice Status After This Payment</p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#6b7280" }}>
            <span>Invoice Total</span><span style={{ color: "#111827" }}>{rm(data.invoiceTotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#16a34a" }}>
            <span>Paid To Date</span><span>({rm(data.invoicePaidToDate)})</span>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700,
            padding: "10px 12px", marginTop: 8, borderRadius: 6,
            backgroundColor: fullyPaid ? "#dcfce7" : "#fef3c7",
            color: fullyPaid ? "#16a34a" : "#b45309",
          }}>
            <span>{fullyPaid ? "PAID IN FULL" : "REMAINING BALANCE"}</span>
            <span>{fullyPaid ? "RM 0.00" : rm(data.invoiceBalanceAfter)}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20, textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 40 }}>
          {data.receiptFooter ? (
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{data.receiptFooter}</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>This is a computer-generated payment receipt.</p>
              <p style={{ margin: "4px 0 0" }}>Thank you for your payment.</p>
            </>
          )}
        </div>
      </div>
    );
  }
);

PaymentReceiptPrintView.displayName = "PaymentReceiptPrintView";

export default PaymentReceiptPrintView;
export type { PaymentReceiptData };