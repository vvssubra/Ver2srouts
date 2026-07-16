import { forwardRef } from "react";

interface InvoiceData {
  invoiceNumber: string;
  studentName: string;
  branchName: string;
  organizationName?: string;
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  issuedAt?: string;
  status: string;
  /**
   * Render mode. "receipt" forces the OFFICIAL RECEIPT title even for
   * partially-paid invoices so cashiers can print a valid receipt for the
   * payment that was just taken, while still showing the true outstanding
   * balance below. Defaults to "invoice".
   */
  documentMode?: "invoice" | "receipt";
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    amount: number;
  }>;
  payments: Array<{
    date: string;
    method: string;
    amount: number;
    reference?: string;
  }>;
  logoUrl?: string;
  schoolName?: string;
  registrationNo?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  invoiceTerms?: string;
  receiptFooter?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const InvoicePrintView = forwardRef<HTMLDivElement, { data: InvoiceData }>(
  ({ data }, ref) => {
    const rm = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;
    const isReceipt = data.documentMode === "receipt";
    const isPaid = data.status === "paid";
    const isCancelled = data.status === "cancelled";
    const amountDue = isCancelled ? 0 : Math.max(0, data.totalAmount - data.amountPaid);
    const isPartial = !isPaid && !isCancelled && data.amountPaid > 0 && amountDue > 0;
    const displayName = data.schoolName || data.organizationName || data.branchName;
    const docTitle = isCancelled
      ? "CANCELLED INVOICE"
      : isReceipt || isPaid
        ? "OFFICIAL RECEIPT"
        : "INVOICE";
    const accentColor = isCancelled
      ? "#6b7280"
      : isPaid
        ? "#16a34a"
        : isReceipt || isPartial
          ? "#d97706"
          : "#2563eb";
    const statusTone = isCancelled
      ? { bg: "#f3f4f6", fg: "#4b5563" }
      : isPaid
        ? { bg: "#dcfce7", fg: "#16a34a" }
        : isPartial
          ? { bg: "#fef3c7", fg: "#b45309" }
          : { bg: "#fee2e2", fg: "#dc2626" };
    const displayItems = data.items.length > 0 ? data.items : [{
      description: `School fees — ${MONTHS[data.billingMonth - 1]} ${data.billingYear}`,
      quantity: 1,
      unitPrice: data.subtotal || data.totalAmount,
      discount: data.discountTotal || 0,
      amount: data.totalAmount,
    }];

    const lastPaymentDate = (isPaid || isReceipt) && data.payments.length > 0
      ? new Date(data.payments[data.payments.length - 1].date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })
      : null;

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
        {/* CANCELLED watermark */}
        {isCancelled && (
          <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%) rotate(-35deg)", fontSize: 110, fontWeight: 900, color: "#dc2626", opacity: 0.12, letterSpacing: 16, pointerEvents: "none", zIndex: 1, userSelect: "none", whiteSpace: "nowrap" }}>
            CANCELLED
          </div>
        )}

        {/* PARTIALLY PAID watermark */}
        {isPartial && (
          <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%) rotate(-35deg)", fontSize: 90, fontWeight: 900, color: "#d97706", opacity: 0.10, letterSpacing: 12, pointerEvents: "none", zIndex: 1, userSelect: "none", whiteSpace: "nowrap" }}>
            PARTIALLY PAID
          </div>
        )}

        {/* UNPAID watermark */}
        {!isPaid && !isCancelled && !isPartial && (
          <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -50%) rotate(-35deg)", fontSize: 130, fontWeight: 900, color: "#dc2626", opacity: 0.07, letterSpacing: 20, pointerEvents: "none", zIndex: 1, userSelect: "none", whiteSpace: "nowrap" }}>
            UNPAID
          </div>
        )}

        {/* PAID stamp */}
        {isPaid && (
          <div style={{
            position: "absolute", top: 160, right: 60, width: 120, height: 120,
            border: "4px solid #16a34a", borderRadius: "50%",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            transform: "rotate(-15deg)", opacity: 0.85, zIndex: 2, pointerEvents: "none",
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#16a34a", lineHeight: 1, letterSpacing: 3 }}>PAID</span>
            {lastPaymentDate && (
              <span style={{ fontSize: 9, color: "#16a34a", fontWeight: 600, marginTop: 2 }}>{lastPaymentDate}</span>
            )}
            <span style={{ fontSize: 8, color: "#16a34a", marginTop: 1 }}>VERIFIED</span>
          </div>
        )}

        {/* Accent bar */}
        <div style={{ height: 5, background: accentColor, marginLeft: -48, marginRight: -48, marginBottom: 32 }} />

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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: accentColor, margin: 0, letterSpacing: 1 }}>{docTitle}</h2>
            <p style={{ fontFamily: "monospace", fontSize: 15, margin: "6px 0 0", color: "#374151" }}>{data.invoiceNumber}</p>
          </div>
        </div>

        {/* Bill To & Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 28 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 6 }}>Bill To</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: 0 }}>{data.studentName}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <table style={{ marginLeft: "auto", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ color: "#9ca3af", paddingRight: 12, paddingBottom: 4, textAlign: "right" }}>Period:</td>
                  <td style={{ fontWeight: 500, paddingBottom: 4, textAlign: "right" }}>{MONTHS[data.billingMonth - 1]} {data.billingYear}</td>
                </tr>
                {data.issuedAt && (
                  <tr>
                    <td style={{ color: "#9ca3af", paddingRight: 12, paddingBottom: 4, textAlign: "right" }}>Issued:</td>
                    <td style={{ paddingBottom: 4, textAlign: "right" }}>{new Date(data.issuedAt).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: "#9ca3af", paddingRight: 12, paddingBottom: 4, textAlign: "right" }}>{isPaid ? "Paid:" : "Due:"}</td>
                  <td style={{ fontWeight: 500, paddingBottom: 4, textAlign: "right" }}>
                    {lastPaymentDate || new Date(data.dueDate).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "#9ca3af", paddingRight: 12, textAlign: "right" }}>Status:</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 4,
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      backgroundColor: statusTone.bg,
                      color: statusTone.fg,
                    }}>{data.status}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Line Items */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ backgroundColor: "#f9fafb" }}>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "left", padding: "10px 8px", borderBottom: "2px solid #e5e7eb", width: 30 }}>#</th>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "left", padding: "10px 8px", borderBottom: "2px solid #e5e7eb" }}>Description</th>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "center", padding: "10px 8px", borderBottom: "2px solid #e5e7eb", width: 50 }}>Qty</th>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "right", padding: "10px 8px", borderBottom: "2px solid #e5e7eb", width: 90 }}>Unit Price</th>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "right", padding: "10px 8px", borderBottom: "2px solid #e5e7eb", width: 80 }}>Discount</th>
              <th style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", textAlign: "right", padding: "10px 8px", borderBottom: "2px solid #e5e7eb", width: 100 }}>Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, i) => (
              <tr key={i}>
                <td style={{ fontSize: 12, color: "#9ca3af", padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>{i + 1}</td>
                <td style={{ fontSize: 13, padding: "10px 8px", borderBottom: "1px solid #f3f4f6", color: "#111827" }}>{item.description}</td>
                <td style={{ fontSize: 13, padding: "10px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "center", color: "#374151" }}>{item.quantity}</td>
                <td style={{ fontSize: 13, padding: "10px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right", color: "#374151" }}>{rm(item.unitPrice)}</td>
                <td style={{ fontSize: 13, padding: "10px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right", color: item.discount > 0 ? "#dc2626" : "#d1d5db" }}>{item.discount > 0 ? `(${rm(item.discount)})` : "—"}</td>
                <td style={{ fontSize: 13, padding: "10px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "right", fontWeight: 500, color: "#111827" }}>{rm(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <div style={{ width: 280 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#6b7280" }}>
              <span>Subtotal</span><span style={{ color: "#111827" }}>{rm(data.subtotal)}</span>
            </div>
            {data.discountTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#6b7280" }}>
                <span>Discount</span><span style={{ color: "#dc2626" }}>({rm(data.discountTotal)})</span>
              </div>
            )}
            {data.taxAmount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#6b7280" }}>
                <span>Tax (SST)</span><span style={{ color: "#111827" }}>{rm(data.taxAmount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, padding: "10px 0 4px", borderTop: "2px solid #111827", marginTop: 4 }}>
              <span>Total</span><span>{rm(data.totalAmount)}</span>
            </div>
            {data.amountPaid > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", color: "#16a34a" }}>
                <span>Amount Paid</span><span>({rm(data.amountPaid)})</span>
              </div>
            )}
            <div style={{
              display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800,
              padding: "10px 12px", marginTop: 6, borderRadius: 6,
              backgroundColor: isCancelled ? "#f3f4f6" : isPaid ? "#dcfce7" : isPartial ? "#fef3c7" : "#fef2f2",
              color: isCancelled ? "#4b5563" : isPaid ? "#16a34a" : isPartial ? "#b45309" : "#dc2626",
            }}>
              <span>{isCancelled ? "CANCELLED — NO PAYMENT REQUIRED" : isPaid ? "PAID IN FULL" : isPartial ? "BALANCE DUE" : "AMOUNT DUE"}</span>
              {!isPaid && !isCancelled && <span>{rm(amountDue)}</span>}
            </div>
          </div>
        </div>

        {isCancelled && (
          <div style={{ marginBottom: 24, padding: 14, borderRadius: 6, backgroundColor: "#f9fafb", border: "1px dashed #9ca3af", color: "#374151" }}>
            <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invoice Cancelled</p>
            <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>This invoice has been cancelled by the school. No payment is required for this document.</p>
          </div>
        )}

        {/* Payment History — receipts (paid OR partial receipt) */}
        {(isPaid || isReceipt) && data.payments.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", marginBottom: 8 }}>Payment{data.payments.length > 1 ? "s" : ""} Received</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ fontWeight: 500, color: "#6b7280", textAlign: "left", padding: "6px 8px" }}>Date</th>
                  <th style={{ fontWeight: 500, color: "#6b7280", textAlign: "left", padding: "6px 8px" }}>Method</th>
                  <th style={{ fontWeight: 500, color: "#6b7280", textAlign: "left", padding: "6px 8px" }}>Reference</th>
                  <th style={{ fontWeight: 500, color: "#6b7280", textAlign: "right", padding: "6px 8px" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 8px" }}>{new Date(p.date).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{p.method.replace("_", " ")}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>{p.reference || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 500 }}>{rm(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes */}
        {data.notes && (
          <div style={{ marginBottom: 20, padding: 12, borderRadius: 6, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>Notes</p>
            <p style={{ fontSize: 12, margin: 0, color: "#374151" }}>{data.notes}</p>
          </div>
        )}

        {/* Terms — only on active invoices */}
        {!isPaid && !isReceipt && !isCancelled && data.invoiceTerms && (
          <div style={{ marginBottom: 20, padding: 12, borderRadius: 6, backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>Terms & Conditions</p>
            <p style={{ fontSize: 11, margin: 0, color: "#4b5563", whiteSpace: "pre-line" }}>{data.invoiceTerms}</p>
          </div>
        )}

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 20, textAlign: "center", fontSize: 11, color: "#9ca3af", marginTop: 40 }}>
          {data.receiptFooter ? (
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>{data.receiptFooter}</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>This is a computer-generated document.</p>
              <p style={{ margin: "4px 0 0" }}>
                {isCancelled
                  ? "No payment is required."
                  : isPaid
                    ? "Thank you for your payment."
                    : isReceipt && isPartial
                      ? `Thank you for your payment. Outstanding balance ${rm(amountDue)} — please settle before the due date.`
                      : isReceipt
                        ? "Thank you for your payment."
                        : isPartial
                          ? "A partial payment has been received. Please settle the remaining balance before the due date."
                          : "Please make payment before the due date."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }
);

InvoicePrintView.displayName = "InvoicePrintView";

export default InvoicePrintView;
export type { InvoiceData };