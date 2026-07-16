import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Trash2, CheckCheck, Search, Filter } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { SwipeableNotification } from "@/components/SwipeableNotification";

const TYPE_ICONS: Record<string, string> = {
  announcement: "📢", chat: "💬", billing: "💰", invoice: "💰",
  leave: "🏖️", leave_request: "🏖️", leave_approved: "✅", leave_rejected: "❌",
  payroll: "💵", performance: "⭐", performance_review: "⭐",
  claim: "🧾", claim_request: "🧾", claim_approved: "✅", claim_rejected: "❌",
  user_registration: "👤",
  attendance: "📋", enrollment: "🎓", learning_journey: "📖", overtime: "⏰",
  lesson_plan: "📝", transaction: "💳", student: "🎒", newsletter: "📰",
  payment: "💵", timetable_change: "📅", probation_reminder: "⏳", escalation: "🚨",
  general: "🔔",
};

const TYPE_LABELS: Record<string, string> = {
  announcement: "Announcement", chat: "Chat", billing: "Billing", invoice: "Invoice",
  leave: "Leave", leave_request: "Leave", leave_approved: "Leave", leave_rejected: "Leave",
  payroll: "Payroll", performance: "Performance", performance_review: "Performance",
  claim: "Claim", claim_request: "Claim", claim_approved: "Claim", claim_rejected: "Claim",
  user_registration: "User",
  attendance: "Attendance", enrollment: "Enrollment", learning_journey: "Learning", overtime: "Overtime",
  lesson_plan: "Lesson Plan", transaction: "Transaction", student: "Student", newsletter: "Newsletter",
  payment: "Payment", timetable_change: "Timetable", probation_reminder: "Probation", escalation: "Escalation",
  general: "General",
};

export default function Notifications() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["all-notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = notifications.filter((n: any) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (readFilter === "unread" && n.is_read) return false;
    if (readFilter === "read" && !n.is_read) return false;
    if (search && !n.title?.toLowerCase().includes(search.toLowerCase()) && !n.message?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setSelected(new Set());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("notifications").update({ archived_at: new Date().toISOString() }).in("id", ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setSelected(new Set());
    },
  });

  const clearAllReadMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ archived_at: new Date().toISOString() }).eq("user_id", user!.id).eq("is_read", true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleClick = (n: any) => {
    if (!n.is_read) {
      supabase.from("notifications").update({ is_read: true }).eq("id", n.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      });
    }
    if (n.action_url) {
      navigate(n.action_url);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((n: any) => n.id)));
    }
  };

  const uniqueTypes = [...new Set(notifications.map((n: any) => n.type))];
  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up!"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => clearAllReadMutation.mutate()} disabled={clearAllReadMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear read
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search notifications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={readFilter} onValueChange={setReadFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => markReadMutation.mutate([...selected])}>
              <CheckCheck className="h-4 w-4 mr-1" /> Mark read
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate([...selected])}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>
        )}

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {filtered.length > 0 && (
              <div className="flex items-center gap-3 border-b px-4 py-2">
                <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={selectAll} />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
            )}
            <ScrollArea className="max-h-[600px]">
              {isLoading ? (
                <div className="p-12 text-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notifications found</p>
                </div>
              ) : (
                filtered.map((n: any) => (
                  <SwipeableNotification
                    key={n.id}
                    isRead={!!n.is_read}
                    onMarkRead={() => markReadMutation.mutate([n.id])}
                    onDelete={() => deleteMutation.mutate([n.id])}
                    onClick={() => handleClick(n)}
                    className="border-b"
                  >
                    <div className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 ${!n.is_read ? "bg-primary/5" : ""}`}>
                      <Checkbox
                        checked={selected.has(n.id)}
                        onCheckedChange={() => toggleSelect(n.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{TYPE_ICONS[n.type] || "🔔"}</span>
                          <p className={`text-sm ${!n.is_read ? "font-semibold" : "font-medium"}`}>{n.title}</p>
                          <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                            {TYPE_LABELS[n.type] || n.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 ml-7">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 ml-7">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
                    </div>
                  </SwipeableNotification>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
