import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Activity, CheckCircle, XCircle, RotateCcw, Clock } from "lucide-react";
import { format } from "date-fns";
import { getGatewayEvents, PROCESSING_STATUSES } from "@/lib/finance/gateway-service";
import { useGlobalBranch } from "@/hooks/use-branch-context";

export default function GatewayEventsLog({ embedded = false }: { embedded?: boolean }) {
  const { selectedBranchId: selectedBranch, activeBranchIds, branches } = useGlobalBranch();
  const branchIds = activeBranchIds;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: events, isLoading } = useQuery({
    queryKey: ["gateway-events", branchIds, statusFilter, typeFilter],
    queryFn: () => getGatewayEvents(branchIds, { status: statusFilter, eventType: typeFilter }),
    enabled: branchIds.length > 0,
  });

  const filtered = useMemo(() => {
    if (!events) return [];
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(e =>
      (e.bill_id || "").toLowerCase().includes(q) ||
      (e.event_id || "").toLowerCase().includes(q) ||
      (e.processing_error || "").toLowerCase().includes(q)
    );
  }, [events, search]);

  const statusCounts = useMemo(() => {
    if (!events) return {};
    return events.reduce((acc, e) => {
      acc[e.processing_status] = (acc[e.processing_status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [events]);

  const getStatusConfig = (status: string) =>
    PROCESSING_STATUSES.find(s => s.value === status) || { label: status, color: "bg-muted text-muted-foreground border-border" };

  const statusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "skipped": return <RotateCcw className="h-3.5 w-3.5 text-warning" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const content = (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gateway Events Log</h1>
          <p className="text-sm text-muted-foreground">Webhook events from BillPlz — idempotent processing audit trail</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {PROCESSING_STATUSES.map(s => (
            <Card key={s.value} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="text-xl font-bold mt-1">{statusCounts[s.value] || 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by bill ID, event ID, error..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {PROCESSING_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Event Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bill.paid">bill.paid</SelectItem>
                <SelectItem value="bill.updated">bill.updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Events Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold w-[140px]">Timestamp</TableHead>
                <TableHead className="font-semibold w-[100px]">Status</TableHead>
                <TableHead className="font-semibold w-[100px]">Type</TableHead>
                <TableHead className="font-semibold w-[120px]">Bill ID</TableHead>
                <TableHead className="font-semibold">Details</TableHead>
                <TableHead className="font-semibold w-[60px]">Retries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12">
                  <Activity className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground">No gateway events found</p>
                </TableCell></TableRow>
              ) : filtered.map(e => {
                const cfg = getStatusConfig(e.processing_status);
                return (
                  <TableRow key={e.id} className="text-sm">
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(e.created_at), "dd MMM yy HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {statusIcon(e.processing_status)}
                        <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono">{e.event_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{e.bill_id || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[250px] truncate">
                      {e.processing_error ? (
                        <span className="text-destructive">{e.processing_error}</span>
                      ) : e.payment_id ? (
                        <span className="text-success">Payment: {e.payment_id.slice(0, 8)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {e.retry_count > 0 ? (
                        <Badge variant="outline" className="text-[10px] bg-warning/5 text-warning">{e.retry_count}</Badge>
                      ) : "0"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
