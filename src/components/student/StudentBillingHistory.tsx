import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History, Loader2, ExternalLink, FileText } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { backFromStudent } from "@/hooks/use-back-to-student";

const rm = (n: number) => `RM ${Number(n || 0).toFixed(2)}`;

/** Statuses that do NOT contribute to billed / paid / outstanding math. */
const NON_FINANCIAL = new Set(["cancelled", "void", "voided", "draft"]);
const isFinancial = (inv: any) => !NON_FINANCIAL.has((inv?.status || "").toLowerCase());

const statusTone: Record<string, string> = {
  paid: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  issued: "bg-primary/15 text-primary border-primary/30",
  partial: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  overdue: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground/80 border-border",
  draft: "bg-muted text-muted-foreground border-border",
  void: "bg-muted text-muted-foreground/80 border-border",
  voided: "bg-muted text-muted-foreground/80 border-border",
};

export default function StudentBillingHistory({ studentId }: { studentId: string }) {
  const navigate = useNavigate();
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["student-invoice-history", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, billing_month, billing_year, total_amount, amount_paid, status, due_date, issued_date, issued_at, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Group: year -> month -> invoices
  const byYear = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    invoices.forEach((inv: any) => {
      const ref = inv.issued_at || inv.issued_date || inv.created_at;
      const dt = ref ? new Date(ref) : null;
      const year = String(inv.billing_year || (dt ? dt.getFullYear() : "—"));
      const monthIdx = inv.billing_month
        ? inv.billing_month - 1
        : dt ? dt.getMonth() : 0;
      const monthLabel = format(new Date(2020, monthIdx, 1), "MMMM");
      const monthKey = `${monthIdx}|${monthLabel}`;
      map[year] ??= {};
      map[year][monthKey] ??= [];
      map[year][monthKey].push(inv);
    });
    return Object.entries(map)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, months]) => ({
        year,
        months: Object.entries(months)
          .sort(([a], [b]) => Number(b.split("|")[0]) - Number(a.split("|")[0]))
          .map(([k, list]) => ({ key: k, label: k.split("|")[1], invoices: list })),
      }));
  }, [invoices]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, outstanding = 0;
    invoices.filter(isFinancial).forEach((i: any) => {
      billed += Number(i.total_amount) || 0;
      paid += Number(i.amount_paid) || 0;
    });
    outstanding = billed - paid;
    return { billed, paid, outstanding };
  }, [invoices]);

  const currentYear = String(new Date().getFullYear());
  const currentMonthKey = `${new Date().getMonth()}|${format(new Date(), "MMMM")}`;
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({ [currentYear]: true });
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({ [`${currentYear}:${currentMonthKey}`]: true });
  const toggleYear = (y: string) => setOpenYears(p => ({ ...p, [y]: !p[y] }));
  const toggleMonth = (id: string) => setOpenMonths(p => ({ ...p, [id]: !p[id] }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Billing History
          </CardTitle>
          <Badge variant="secondary" className="text-[10px] tabular-nums">{invoices.length} invoices</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Billed" value={rm(totals.billed)} tone="text-foreground" />
          <Stat label="Paid" value={rm(totals.paid)} tone="text-green-600" />
          <Stat label="Outstanding" value={rm(totals.outstanding)} tone={totals.outstanding > 0 ? "text-red-600" : "text-muted-foreground"} />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
        ) : byYear.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
            <FileText className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No invoices yet for this student.
          </p>
        ) : (
          <div className="space-y-2">
            {byYear.map(({ year, months }) => {
              const yearAll = months.flatMap(m => m.invoices);
              const yearFin = yearAll.filter(isFinancial);
              const yearBilled = yearFin.reduce((s, i: any) => s + Number(i.total_amount || 0), 0);
              const yearPaid = yearFin.reduce((s, i: any) => s + Number(i.amount_paid || 0), 0);
              const open = !!openYears[year];
              return (
                <section key={year} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggleYear(year)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition text-left"
                  >
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold flex-1">{year}</span>
                    <span className="text-xs text-muted-foreground">
                      {yearFin.length} inv{yearAll.length !== yearFin.length ? ` · ${yearAll.length - yearFin.length} void` : ""}
                    </span>
                    <span className="text-xs tabular-nums">
                      <span className="text-foreground font-medium">{rm(yearPaid)}</span>
                      <span className="text-muted-foreground"> / {rm(yearBilled)}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="border-t bg-muted/10 divide-y">
                      {months.map(m => {
                        const mFin = m.invoices.filter(isFinancial);
                        const mBilled = mFin.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
                        const mPaid = mFin.reduce((s: number, i: any) => s + Number(i.amount_paid || 0), 0);
                        const monthId = `${year}:${m.key}`;
                        const mOpen = !!openMonths[monthId];
                        return (
                          <div key={m.key} className="px-1">
                            <button
                              onClick={() => toggleMonth(monthId)}
                              className="w-full flex items-center gap-2 px-2 py-2 hover:bg-muted/40 transition text-left rounded-md"
                            >
                              {mOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">{m.label}</p>
                              <span className="text-[10px] text-muted-foreground">
                                {mFin.length} inv{m.invoices.length !== mFin.length ? ` · ${m.invoices.length - mFin.length} void` : ""}
                              </span>
                              <p className="text-[11px] tabular-nums text-muted-foreground">
                                {rm(mPaid)} <span className="opacity-60">/ {rm(mBilled)}</span>
                              </p>
                            </button>
                            {mOpen && (
                            <div className="space-y-1.5 px-2 pb-2">
                              {m.invoices.map((inv: any) => {
                                const financial = isFinancial(inv);
                                const outstanding = financial
                                  ? Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)
                                  : 0;
                                return (
                                  <button
                                    key={inv.id}
                                    onClick={() => navigate(`/finance/invoices/${inv.id}?${backFromStudent(studentId, "billing")}`)}
                                    className={`w-full flex items-center gap-3 rounded-md border bg-card px-2.5 py-2 text-left hover:border-primary/40 hover:shadow-sm transition ${
                                      financial ? "" : "opacity-70 bg-muted/30"
                                    }`}
                                  >
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-xs font-medium truncate ${financial ? "" : "line-through text-muted-foreground"}`}>
                                        {inv.invoice_number || "Draft invoice"}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {inv.due_date ? `Due ${format(new Date(inv.due_date), "dd MMM yyyy")}` : "—"}
                                        {!financial && <span className="ml-1 italic">· excluded from totals</span>}
                                      </p>
                                    </div>
                                    <Badge variant="outline" className={`text-[10px] capitalize ${statusTone[inv.status] ?? ""}`}>
                                      {inv.status}
                                    </Badge>
                                    <div className="text-right">
                                      <p className={`text-xs font-semibold tabular-nums ${financial ? "" : "line-through text-muted-foreground"}`}>
                                        {rm(inv.total_amount)}
                                      </p>
                                      {financial && outstanding > 0 && (
                                        <p className="text-[10px] text-red-600 tabular-nums">Owe {rm(outstanding)}</p>
                                      )}
                                    </div>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                );
                              })}
                            </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}