import { useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileText, Printer, DollarSign, TrendingDown, Banknote, Receipt } from "lucide-react";
import PayslipPrintView, { type PayslipData } from "@/components/PayslipPrintView";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const rm = (v: number) => `RM ${v.toFixed(2)}`;

const statusBadge = (status: string) => {
  switch (status) {
    case "confirmed": return <Badge variant="secondary">Confirmed</Badge>;
    case "paid": return <Badge className="bg-primary/10 text-primary border-primary/20">Paid</Badge>;
    default: return <Badge variant="outline">Draft</Badge>;
  }
};

export default function MyPayslips() {
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [payslipData, setPayslipData] = useState<PayslipData | null>(null);
  const payslipRef = useRef<HTMLDivElement>(null);

  const { data: payslips, isLoading } = useQuery({
    queryKey: ["my-payslips", user?.id, year],
    queryFn: async () => {
      const { data } = await supabase
        .from("payroll_records")
        .select("*")
        .eq("user_id", user!.id)
        .eq("year", year)
        .in("status", ["confirmed", "paid"])
        .order("month", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch branch names for display
  const { data: branches } = useQuery({
    queryKey: ["my-branches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id, branches(id, name)")
        .eq("user_id", user!.id);
      return data?.map((m: any) => m.branches).filter(Boolean) ?? [];
    },
    enabled: !!user,
  });

  // Fetch branch settings for logo + company info
  const firstBranchId = branches?.[0]?.id;
  const { data: branchSettings } = useQuery({
    queryKey: ["my-branch-settings", firstBranchId],
    queryFn: async () => {
      const { data } = await supabase.from("branch_settings").select("logo_url, school_display_name, business_registration_no, address_line, phone, email").eq("branch_id", firstBranchId!).maybeSingle();
      return data;
    },
    enabled: !!firstBranchId,
  });

  // Fetch staff profile for IC/EPF/SOCSO
  const { data: staffProfile } = useQuery({
    queryKey: ["my-staff-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_profiles").select("ic_number, epf_number, socso_number").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch staff designation
  const { data: staffDesignation } = useQuery({
    queryKey: ["my-staff-designation", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("staff_designations").select("designation, custom_designation").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const handlePrint = useCallback(async (r: any) => {
    const branch = branches?.find((b: any) => b.id === r.branch_id);
    // Fetch YTD
    const { data: ytd } = await supabase.from("payroll_records")
      .select("gross_salary, epf_employee, socso_employee, eis_employee, pcb_amount, net_salary")
      .eq("user_id", user!.id).eq("year", r.year).lte("month", r.month).neq("status", "reversed");
    const ytdArr = ytd ?? [];
    // Fetch early-paid claims for reference
    const mStart = `${r.year}-${String(r.month).padStart(2, "0")}-01`;
    const mEndDate = new Date(r.year, r.month, 0);
    const mEnd = `${r.year}-${String(r.month).padStart(2, "0")}-${String(mEndDate.getDate()).padStart(2, "0")}`;
    const { data: earlyClaims } = await supabase.from("staff_claims").select("amount, paid_at").eq("user_id", user!.id).eq("paid_via", "early_payment").eq("level2_status", "approved").or(`and(payroll_month.eq.${r.month},payroll_year.eq.${r.year}),and(payroll_month.is.null,claim_date.gte.${mStart},claim_date.lte.${mEnd})`);
    const earlyTotal = (earlyClaims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
    const earlyDate = earlyClaims?.[0]?.paid_at ? new Date(earlyClaims[0].paid_at).toLocaleDateString("en-GB") : undefined;
    const data: PayslipData = {
      staffName: `${user?.user_metadata?.first_name || ""} ${user?.user_metadata?.last_name || ""}`.trim() || user?.email || "",
      staffEmail: user?.email || "",
      staffIc: staffProfile?.ic_number || "",
      staffId: ((staffDesignation as any)?.custom_designation || (staffDesignation as any)?.designation || "").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      designation: ((staffDesignation as any)?.custom_designation || (staffDesignation as any)?.designation || "").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      epfNumber: staffProfile?.epf_number || "",
      socsoNumber: staffProfile?.socso_number || "",
      companyRegNo: branchSettings?.business_registration_no || "",
      companyAddress: branchSettings?.address_line || "",
      companyPhone: branchSettings?.phone || "",
      companyEmail: branchSettings?.email || "",
      branchName: branch?.name || "",
      month: r.month,
      year: r.year,
      basicSalary: r.basic_salary,
      allowances: r.allowances,
      otherAllowances: r.other_allowances || 0,
      overtimeHours: r.overtime_hours || 0,
      overtimeRate: r.overtime_rate || 0,
      overtimeAmount: r.overtime_amount || 0,
      grossSalary: r.gross_salary,
      epfEmployee: r.epf_employee,
      epfEmployer: r.epf_employer,
      socsoEmployee: r.socso_employee,
      socsoEmployer: r.socso_employer,
      eisEmployee: r.eis_employee,
      eisEmployer: r.eis_employer,
      pcbAmount: r.pcb_amount,
      lateDeduction: r.late_deduction || 0,
      unpaidLeaveDeduction: r.unpaid_leave_deduction || 0,
      absentDeduction: r.absent_deduction || 0,
      advanceDeduction: r.advance_deduction || 0,
      otherDeductions: r.other_deductions || 0,
      claimsAmount: r.claims_amount || 0,
      earlyPaidClaimsAmount: earlyTotal > 0 ? earlyTotal : undefined,
      earlyPaidClaimsDate: earlyDate,
      netSalary: r.net_salary,
      status: r.status || "draft",
      paidAt: r.paid_at,
      logoUrl: branchSettings?.logo_url || "",
      schoolName: branchSettings?.school_display_name || "",
      ytdGross: ytdArr.reduce((s: number, x: any) => s + Number(x.gross_salary), 0),
      ytdEpfEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.epf_employee), 0),
      ytdSocsoEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.socso_employee), 0),
      ytdEisEmployee: ytdArr.reduce((s: number, x: any) => s + Number(x.eis_employee), 0),
      ytdPcb: ytdArr.reduce((s: number, x: any) => s + Number(x.pcb_amount), 0),
      ytdNet: ytdArr.reduce((s: number, x: any) => s + Number(x.net_salary), 0),
    };
    setPayslipData(data);
    setTimeout(() => window.print(), 200);
  }, [user, branches, branchSettings, staffProfile, staffDesignation]);

  // Summary stats
  const totalEarned = payslips?.reduce((s: number, r: any) => s + Number(r.net_salary), 0) ?? 0;
  const totalDeductions = payslips?.reduce((s: number, r: any) =>
    s + Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount), 0) ?? 0;
  const totalClaims = payslips?.reduce((s: number, r: any) => s + Number(r.claims_amount || 0), 0) ?? 0;
  const paidCount = payslips?.filter((r: any) => r.status === "paid").length ?? 0;

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {(location.state as any)?.from === "/staff-attendance" && (
            <Button variant="ghost" size="sm" onClick={() => nav("/staff-attendance")}>← Back</Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Payslips</h1>
            <p className="text-muted-foreground">View and download your monthly payslip history</p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Net Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rm(totalEarned)}</div>
              <p className="text-xs text-muted-foreground">{payslips?.length || 0} records in {year}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Deductions</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rm(totalDeductions)}</div>
              <p className="text-xs text-muted-foreground">EPF + SOCSO + EIS + PCB</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Claims Reimbursed</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rm(totalClaims)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid Months</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{paidCount} / {payslips?.length || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Payslip List & Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Payslip Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : !payslips?.length ? (
                <p className="text-center py-8 text-muted-foreground">No payslip records found for {year}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslips.map((r: any) => {
                        const ded = Number(r.epf_employee) + Number(r.socso_employee) + Number(r.eis_employee) + Number(r.pcb_amount) +
                          Number(r.late_deduction || 0) + Number(r.unpaid_leave_deduction || 0) + Number(r.advance_deduction || 0) + Number(r.other_deductions || 0);
                        return (
                          <TableRow
                            key={r.id}
                            className={`cursor-pointer ${selectedRecord?.id === r.id ? "bg-muted" : ""}`}
                            onClick={() => setSelectedRecord(r)}
                          >
                            <TableCell className="font-medium">{MONTHS[r.month - 1]}</TableCell>
                            <TableCell className="text-right">{rm(r.gross_salary)}</TableCell>
                            <TableCell className="text-right text-destructive">{rm(ded)}</TableCell>
                            <TableCell className="text-right font-semibold">{rm(r.net_salary)}</TableCell>
                            <TableCell>{statusBadge(r.status || "draft")}</TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" title="Print payslip" onClick={(e) => { e.stopPropagation(); handlePrint(r); }}>
                                <Printer className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedRecord ? `${MONTHS[selectedRecord.month - 1]} ${selectedRecord.year}` : "Payslip Detail"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedRecord ? (
                <p className="text-sm text-muted-foreground text-center py-8">Select a payslip to view details</p>
              ) : (
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Earnings</p>
                    <DetailRow label="Basic Salary" value={rm(selectedRecord.basic_salary)} />
                    {selectedRecord.allowances > 0 && <DetailRow label="Allowances" value={rm(selectedRecord.allowances)} />}
                    {(selectedRecord.other_allowances || 0) > 0 && <DetailRow label="Other Allowances" value={rm(selectedRecord.other_allowances)} />}
                    {(selectedRecord.overtime_amount || 0) > 0 && <DetailRow label={`OT (${selectedRecord.overtime_hours}hrs)`} value={rm(selectedRecord.overtime_amount)} />}
                    <Separator className="my-2" />
                    <DetailRow label="Gross Salary" value={rm(selectedRecord.gross_salary)} bold />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Deductions</p>
                    <DetailRow label="EPF" value={rm(selectedRecord.epf_employee)} />
                    <DetailRow label="SOCSO" value={rm(selectedRecord.socso_employee)} />
                    <DetailRow label="EIS" value={rm(selectedRecord.eis_employee)} />
                    <DetailRow label="PCB (Tax)" value={rm(selectedRecord.pcb_amount)} />
                    {(selectedRecord.unpaid_leave_deduction || 0) > 0 && <DetailRow label="Unpaid Leave" value={rm(selectedRecord.unpaid_leave_deduction)} />}
                    {(selectedRecord.late_deduction || 0) > 0 && <DetailRow label="Late" value={rm(selectedRecord.late_deduction)} />}
                    {(selectedRecord.advance_deduction || 0) > 0 && <DetailRow label="Advance" value={rm(selectedRecord.advance_deduction)} />}
                    {(selectedRecord.other_deductions || 0) > 0 && <DetailRow label="Other" value={rm(selectedRecord.other_deductions)} />}
                  </div>

                  {(selectedRecord.claims_amount || 0) > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Reimbursements</p>
                      <DetailRow label="Claims" value={`+ ${rm(selectedRecord.claims_amount)}`} />
                    </div>
                  )}

                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Net Salary</span>
                    <span className="text-primary">{rm(selectedRecord.net_salary)}</span>
                  </div>

                  {selectedRecord.paid_at && (
                    <p className="text-xs text-muted-foreground">Paid on {new Date(selectedRecord.paid_at).toLocaleDateString()}</p>
                  )}

                  <Button variant="outline" className="w-full gap-2 mt-2" onClick={() => handlePrint(selectedRecord)}>
                    <Printer className="h-4 w-4" /> Print / Download
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {payslipData && <PayslipPrintView ref={payslipRef} data={payslipData} />}
    </DashboardLayout>
  );
}

function DetailRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
