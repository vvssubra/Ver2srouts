import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Save, Loader2, CalendarDays, Clock, Gift, Info, ArrowRightLeft, FileText, Upload, Building2, MapPin, Trash2, Plus, Timer, Users } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GeofenceMapPicker from "@/components/attendance/GeofenceMapPicker";
import CustomLeaveTypesCard from "@/components/hr/CustomLeaveTypesCard";

const DEFAULT_LEAVE = {
  annual_total: 8,
  medical_total: 14,
  hospitalisation_total: 60,
  maternity_total: 60,
  paternity_total: 7,
  emergency_total: 2,
  compassionate_total: 3,
  replacement_total: 0,
  unpaid_total: 0,
  carry_forward_enabled: false,
  carry_forward_max_days: 5,
  carry_forward_types: ["annual"],
};

const DEFAULT_OT = {
  normal_multiplier: 1.5,
  rest_day_multiplier: 2.0,
  public_holiday_multiplier: 3.0,
};

const DEFAULT_PAYROLL_CUTOFF = {
  claim_cutoff_day: 5, // Claims submitted by 5th of the month get included in previous month payslip
  ot_cutoff_day: 5,    // OT submitted by 5th of the month get included in previous month payslip
  enabled: false,
};

const DEFAULT_ATTENDANCE = {
  late_threshold_minutes: 5,
  enforce_geofence: false,
};

const LEAVE_LABELS: Record<string, string> = {
  annual_total: "Annual Leave",
  medical_total: "Medical Leave",
  hospitalisation_total: "Hospitalisation Leave",
  maternity_total: "Maternity Leave",
  paternity_total: "Paternity Leave",
  emergency_total: "Emergency Leave",
  compassionate_total: "Compassionate Leave",
  replacement_total: "Replacement Leave",
  unpaid_total: "Unpaid Leave",
};

const OT_LABELS: Record<string, string> = {
  normal_multiplier: "Normal Day (×)",
  rest_day_multiplier: "Rest Day (×)",
  public_holiday_multiplier: "Public Holiday (×)",
};

function PayrollSettingsTab({ branchId }: { branchId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["branch-settings-payroll", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_settings")
        .select("logo_url, school_display_name, address_line, phone, email, business_registration_no")
        .eq("branch_id", branchId)
        .maybeSingle();
      return data;
    },
    enabled: !!branchId,
  });

  const [form, setForm] = useState({
    school_display_name: "",
    address_line: "",
    phone: "",
    email: "",
    business_registration_no: "",
  });
  const [formInit, setFormInit] = useState(false);

  useEffect(() => {
    if (settings && !formInit) {
      setForm({
        school_display_name: settings.school_display_name || "",
        address_line: settings.address_line || "",
        phone: settings.phone || "",
        email: settings.email || "",
        business_registration_no: settings.business_registration_no || "",
      });
      setFormInit(true);
    }
  }, [settings, formInit]);

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${branchId}/payroll-logo-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error } = await supabase
        .from("branch_settings")
        .upsert({ branch_id: branchId, logo_url: urlData.publicUrl }, { onConflict: "branch_id" });
      if (error) throw error;

      toast({ title: "Logo uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: ["branch-settings-payroll", branchId] });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("branch_settings")
        .upsert({ branch_id: branchId, ...form }, { onConflict: "branch_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payroll settings saved" });
      queryClient.invalidateQueries({ queryKey: ["branch-settings-payroll", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branch-settings-inline"] });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  return (
    <TabsContent value="payroll" className="mt-4 space-y-4">
      {/* Logo Upload */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Company Logo & Details</CardTitle>
              <CardDescription>This information appears on payslips and other HR documents.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/30">
              {settings?.logo_url ? (
                <AvatarImage src={settings.logo_url} alt="Company Logo" className="object-contain p-1" />
              ) : (
                <AvatarFallback className="rounded-lg bg-muted text-muted-foreground">
                  <Upload className="h-6 w-6" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Company Logo</Label>
              <p className="text-xs text-muted-foreground">Upload your school/company logo. It will appear on payslips.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
              />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                {uploading ? "Uploading..." : settings?.logo_url ? "Change Logo" : "Upload Logo"}
              </Button>
            </div>
          </div>

          {/* Company Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Company / School Name</Label>
              <Input
                placeholder="e.g. Bloom & Grow Preschool"
                value={form.school_display_name}
                onChange={(e) => setForm((f) => ({ ...f, school_display_name: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">Appears as the header on payslips</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Address</Label>
              <Textarea
                placeholder="Full company address"
                value={form.address_line}
                onChange={(e) => setForm((f) => ({ ...f, address_line: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                placeholder="+60 12-345 6789"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="hr@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Business Registration No.</Label>
              <Input
                placeholder="e.g. 202401012345 (SSM)"
                value={form.business_registration_no}
                onChange={(e) => setForm((f) => ({ ...f, business_registration_no: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              These details are used across payslips, invoices, and official documents generated by the system.
            </p>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-1">Save Payroll Settings</span>
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export default function HRSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: membership } = useQuery({
    queryKey: ["my-branch-membership"],
    queryFn: async () => {
      const { data } = await supabase
        .from("branch_memberships")
        .select("branch_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const branchId = membership?.branch_id;

  const { data: policies, isLoading } = useQuery({
    queryKey: ["hr-policies", branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_policies")
        .select("*")
        .eq("branch_id", branchId!);
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const leavePolicy = policies?.find((p: any) => p.policy_type === "leave_defaults");
  const otPolicy = policies?.find((p: any) => p.policy_type === "overtime_defaults");

  const [leaveForm, setLeaveForm] = useState(DEFAULT_LEAVE);
  const [otForm, setOtForm] = useState(DEFAULT_OT);
  const [leaveInit, setLeaveInit] = useState(false);
  const [otInit, setOtInit] = useState(false);
  const [cutoffForm, setCutoffForm] = useState(DEFAULT_PAYROLL_CUTOFF);
  const [cutoffInit, setCutoffInit] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState(DEFAULT_ATTENDANCE);
  const [attendanceInit, setAttendanceInit] = useState(false);

  const cutoffPolicy = policies?.find((p: any) => p.policy_type === "payroll_cutoff");
  const attendancePolicy = policies?.find((p: any) => p.policy_type === "attendance_settings");

  // Geofence state
  const [geofenceLocations, setGeofenceLocations] = useState<any[]>([]);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", latitude: "", longitude: "", radius_meters: 200 });
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [mapRadius, setMapRadius] = useState(200);

   // Employee geofence overrides
  const [showEmployeeOverride, setShowEmployeeOverride] = useState(false);
  const [empOverrideStaffId, setEmpOverrideStaffId] = useState("");
  const [empOverrideSelectedLocations, setEmpOverrideSelectedLocations] = useState<string[]>([]);

  const { data: geofenceData = [], refetch: refetchGeofence } = useQuery({
    queryKey: ["geofence-locations", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("geofence_locations").select("*").eq("branch_id", branchId!).order("created_at");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: employeeOverrides = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["employee-geofence-overrides", branchId],
    queryFn: async () => {
      const { data } = await supabase.from("staff_geofence_assignments").select("*, geofence_locations(id, name, latitude, longitude, radius_meters)").eq("branch_id", branchId!).order("created_at");
      return data ?? [];
    },
    enabled: !!branchId,
  });

  const { data: branchStaffForGeo = [] } = useQuery({
    queryKey: ["branch-staff-for-geo", branchId],
    queryFn: async () => {
      const { data: members } = await supabase.from("branch_memberships").select("user_id").eq("branch_id", branchId!);
      if (!members?.length) return [];
      const userIds = members.map(m => m.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, email").in("id", userIds);
      return profiles ?? [];
    },
    enabled: !!branchId,
  });

  useEffect(() => { setGeofenceLocations(geofenceData); }, [geofenceData]);

  useEffect(() => {
    if (leavePolicy && !leaveInit) {
      setLeaveForm({ ...DEFAULT_LEAVE, ...(leavePolicy as any).policy_data });
      setLeaveInit(true);
    }
  }, [leavePolicy, leaveInit]);

  useEffect(() => {
    if (otPolicy && !otInit) {
      setOtForm({ ...DEFAULT_OT, ...(otPolicy as any).policy_data });
      setOtInit(true);
    }
  }, [otPolicy, otInit]);

  useEffect(() => {
    if (cutoffPolicy && !cutoffInit) {
      setCutoffForm({ ...DEFAULT_PAYROLL_CUTOFF, ...(cutoffPolicy as any).policy_data });
      setCutoffInit(true);
    }
  }, [cutoffPolicy, cutoffInit]);

  useEffect(() => {
    if (attendancePolicy && !attendanceInit) {
      setAttendanceForm({ ...DEFAULT_ATTENDANCE, ...(attendancePolicy as any).policy_data });
      setAttendanceInit(true);
    }
  }, [attendancePolicy, attendanceInit]);

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("hr_policies")
        .upsert({ branch_id: branchId!, policy_type: "attendance_settings", policy_data: attendanceForm as any, updated_at: new Date().toISOString() }, { onConflict: "branch_id,policy_type" });
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Attendance settings saved" }); queryClient.invalidateQueries({ queryKey: ["hr-policies", branchId] }); },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const saveLeaveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("hr_policies")
        .upsert(
          {
            branch_id: branchId!,
            policy_type: "leave_defaults",
            policy_data: leaveForm as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "branch_id,policy_type" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Leave policy saved" });
      queryClient.invalidateQueries({ queryKey: ["hr-policies", branchId] });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const saveOtMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("hr_policies")
        .upsert(
          {
            branch_id: branchId!,
            policy_type: "overtime_defaults",
            policy_data: otForm as any,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "branch_id,policy_type" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Overtime policy saved" });
      queryClient.invalidateQueries({ queryKey: ["hr-policies", branchId] });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">HR Settings</h1>
          <p className="text-muted-foreground">
            Master policies that apply to all staff. Individual overrides can be set in each employee's profile.
          </p>
        </div>

        {!branchId ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No branch membership found. Please ensure you are assigned to a branch.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="payroll">
            <TabsList className="flex-wrap">
              <TabsTrigger value="payroll" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Payroll Settings</TabsTrigger>
              <TabsTrigger value="attendance" className="gap-1.5"><Timer className="h-3.5 w-3.5" /> Attendance</TabsTrigger>
              <TabsTrigger value="geofence" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> Geofence</TabsTrigger>
              <TabsTrigger value="leave" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Leave Policy</TabsTrigger>
              <TabsTrigger value="overtime" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Overtime Policy</TabsTrigger>
              <TabsTrigger value="cutoff" className="gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Cutoff Dates</TabsTrigger>
              <TabsTrigger value="benefits" className="gap-1.5"><Gift className="h-3.5 w-3.5" /> Benefits</TabsTrigger>
            </TabsList>

            {/* ─── PAYROLL SETTINGS ─── */}
            <PayrollSettingsTab branchId={branchId!} />

            {/* ─── ATTENDANCE SETTINGS ─── */}
            <TabsContent value="attendance" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Timer className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">Attendance Settings</CardTitle>
                      <CardDescription>Configure late threshold and attendance rules for this branch.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1 max-w-xs">
                    <Label className="text-xs">Late Grace Period (minutes after shift start)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={attendanceForm.late_threshold_minutes}
                      onChange={(e) => setAttendanceForm(f => ({ ...f, late_threshold_minutes: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      e.g. "5" means staff clocking in after 08:05 (for an 08:00 shift) will be marked as "Late".
                      Set to 0 for no grace period.
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enforce Geofence Check-in</Label>
                      <p className="text-xs text-muted-foreground">
                        Require staff to be within allowed locations when clocking in/out
                      </p>
                    </div>
                    <Switch
                      checked={attendanceForm.enforce_geofence}
                      onCheckedChange={(checked) => setAttendanceForm(f => ({ ...f, enforce_geofence: checked }))}
                    />
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      The late threshold is calculated from each staff member's shift start time (from their work schedule).
                      If no shift is configured, it defaults to 08:00 + grace minutes.
                    </p>
                  </div>

                  <Button onClick={() => saveAttendanceMutation.mutate()} disabled={saveAttendanceMutation.isPending}>
                    {saveAttendanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-1">Save Attendance Settings</span>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── GEOFENCE ─── */}
            <TabsContent value="geofence" className="mt-4 space-y-4">
              {/* Branch Geofence Locations */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">Branch Geofence Locations</CardTitle>
                        <CardDescription>
                          Define allowed check-in locations. Staff must be within the radius to clock in/out.
                        </CardDescription>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => { setNewLocation({ name: "", latitude: "", longitude: "", radius_meters: 200 }); setMapLat(null); setMapLng(null); setMapRadius(200); setShowAddLocation(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Add Location
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {geofenceLocations.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                      <p>No geofence locations configured</p>
                      <p className="text-xs mt-1">Add a location to enable geolocation-based check-in</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Latitude</TableHead>
                          <TableHead>Longitude</TableHead>
                          <TableHead>Radius (m)</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {geofenceLocations.map((loc: any) => (
                          <TableRow key={loc.id}>
                            <TableCell className="font-medium">{loc.name}</TableCell>
                            <TableCell className="text-sm">{loc.latitude.toFixed(6)}</TableCell>
                            <TableCell className="text-sm">{loc.longitude.toFixed(6)}</TableCell>
                            <TableCell className="text-sm">{loc.radius_meters}m</TableCell>
                            <TableCell>
                              <Badge className={loc.is_active ? "bg-success/100/10 text-success" : "bg-muted text-muted-foreground"}>
                                {loc.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={async () => {
                                await supabase.from("geofence_locations").delete().eq("id", loc.id);
                                refetchGeofence();
                                toast({ title: "Location removed" });
                              }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <div className="flex items-start gap-2 p-3 mt-4 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>How geofencing works:</strong></p>
                      <p>When a staff member clocks in/out, the system checks their GPS location against all active geofence locations.</p>
                      <p>If they are outside the radius, they will be prompted to take a selfie and can still clock in with an out-of-zone flag. HR/admin will be notified.</p>
                      <p>Employee-specific overrides below take priority over branch locations for assigned staff.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Employee Geofence Assignments */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg">Employee Location Assignments</CardTitle>
                        <CardDescription>
                          Assign staff to specific geofence locations. If assigned, only those locations are checked during clock-in. Otherwise all branch locations apply.
                        </CardDescription>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => { setEmpOverrideStaffId(""); setEmpOverrideSelectedLocations([]); setShowEmployeeOverride(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Assign Staff
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Group overrides by user
                    const grouped = employeeOverrides.reduce((acc: Record<string, any[]>, eo: any) => {
                      if (!acc[eo.user_id]) acc[eo.user_id] = [];
                      acc[eo.user_id].push(eo);
                      return acc;
                    }, {});
                    const userIds = Object.keys(grouped);

                    if (userIds.length === 0) return (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p>No employee-specific locations configured</p>
                        <p className="text-xs mt-1">All staff will use the branch geofence locations above</p>
                      </div>
                    );

                    return (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead>Assigned Locations</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userIds.map((uid) => {
                            const assignments = grouped[uid];
                            const staff = branchStaffForGeo.find((s: any) => s.id === uid);
                            return (
                              <TableRow key={uid}>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{staff ? `${staff.first_name} ${staff.last_name}` : "Unknown"}</p>
                                    <p className="text-xs text-muted-foreground">{staff?.email}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {assignments.map((a: any) => (
                                      <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                                        <MapPin className="h-3 w-3" />
                                        {a.geofence_locations?.name ?? "Unknown"}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button size="icon" variant="ghost" onClick={async () => {
                                    for (const a of assignments) {
                                      await supabase.from("staff_geofence_assignments").delete().eq("id", a.id);
                                    }
                                    refetchOverrides();
                                    toast({ title: "Assignments removed" });
                                  }}>
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Add Branch Location Dialog */}
              <Dialog open={showAddLocation} onOpenChange={setShowAddLocation}>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Add Geofence Location</DialogTitle>
                    <DialogDescription>Click on the map or search an address to set the location. Drag the marker to adjust.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Location Name</Label>
                      <Input placeholder="e.g. Main Campus" value={newLocation.name} onChange={(e) => setNewLocation(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <GeofenceMapPicker
                      latitude={mapLat}
                      longitude={mapLng}
                      radius={mapRadius}
                      onLocationChange={(lat, lng) => { setMapLat(lat); setMapLng(lng); setNewLocation(f => ({ ...f, latitude: lat.toString(), longitude: lng.toString() })); }}
                      onRadiusChange={(r) => { setMapRadius(r); setNewLocation(f => ({ ...f, radius_meters: r })); }}
                      height="280px"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAddLocation(false)}>Cancel</Button>
                    <Button
                      disabled={!newLocation.name || !mapLat || !mapLng}
                      onClick={async () => {
                        const { error } = await supabase.from("geofence_locations").insert({
                          branch_id: branchId!,
                          name: newLocation.name,
                          latitude: mapLat!,
                          longitude: mapLng!,
                          radius_meters: mapRadius,
                        });
                        if (error) { toast({ title: "Failed to add", description: error.message, variant: "destructive" }); return; }
                        refetchGeofence();
                        setShowAddLocation(false);
                        toast({ title: "Location added" });
                      }}
                    >
                      Add Location
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Assign Employee to Locations Dialog */}
              <Dialog open={showEmployeeOverride} onOpenChange={setShowEmployeeOverride}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Assign Staff to Locations</DialogTitle>
                    <DialogDescription>Select a staff member and choose which geofence locations they should clock in from.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Staff Member</Label>
                      <Select value={empOverrideStaffId} onValueChange={setEmpOverrideStaffId}>
                        <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                        <SelectContent>
                          {branchStaffForGeo.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Geofence Locations</Label>
                      {geofenceData.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No branch locations configured. Add locations above first.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {geofenceData.map((loc: any) => (
                            <label key={loc.id} className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors">
                              <Checkbox
                                checked={empOverrideSelectedLocations.includes(loc.id)}
                                onCheckedChange={(checked) => {
                                  setEmpOverrideSelectedLocations(prev =>
                                    checked ? [...prev, loc.id] : prev.filter(id => id !== loc.id)
                                  );
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{loc.name}</p>
                                <p className="text-xs text-muted-foreground">{loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} · {loc.radius_meters}m</p>
                              </div>
                              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowEmployeeOverride(false)}>Cancel</Button>
                    <Button
                      disabled={!empOverrideStaffId || empOverrideSelectedLocations.length === 0}
                      onClick={async () => {
                        // Remove existing assignments for this user in this branch
                        await supabase.from("staff_geofence_assignments").delete().eq("user_id", empOverrideStaffId).eq("branch_id", branchId!);
                        // Insert new assignments
                        const rows = empOverrideSelectedLocations.map(locId => ({
                          user_id: empOverrideStaffId,
                          branch_id: branchId!,
                          geofence_location_id: locId,
                        }));
                        const { error } = await supabase.from("staff_geofence_assignments").insert(rows);
                        if (error) { toast({ title: "Failed to assign", description: error.message, variant: "destructive" }); return; }
                        refetchOverrides();
                        setShowEmployeeOverride(false);
                        toast({ title: "Staff assigned to locations" });
                      }}
                    >
                      Save Assignments
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* ─── LEAVE POLICY ─── */}
            <TabsContent value="leave" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Default Leave Entitlements</CardTitle>
                  <CardDescription>
                    These values will apply to all staff who don't have individual overrides. Per the Malaysian Employment Act 1955.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Object.entries(LEAVE_LABELS).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number" step="0.5"
                          min={0}
                          value={(leaveForm as any)[key] ?? 0}
                          onChange={(e) =>
                            setLeaveForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">days / year</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      These are the <strong>default entitlements</strong> for all staff in this branch. 
                      You can override these for specific employees under Staff Management → Leave tab.
                    </p>
                  </div>

                  <Button onClick={() => saveLeaveMutation.mutate()} disabled={saveLeaveMutation.isPending || isLoading}>
                    {saveLeaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-1">Save Leave Policy</span>
                  </Button>
                </CardContent>
              </Card>

              {/* Carry Forward Policy */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg">Leave Carry Forward Policy</CardTitle>
                      <CardDescription>
                        Allow employees to carry forward unused leave days from the previous year.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Carry Forward</Label>
                      <p className="text-xs text-muted-foreground">Allow HR to carry forward unused leave balances to the next year</p>
                    </div>
                    <Switch
                      checked={leaveForm.carry_forward_enabled ?? false}
                      onCheckedChange={(checked) => setLeaveForm((f: any) => ({ ...f, carry_forward_enabled: checked }))}
                    />
                  </div>

                  {leaveForm.carry_forward_enabled && (
                    <>
                      <div className="space-y-1 max-w-xs">
                        <Label className="text-xs">Maximum Carry Forward Days (per leave type)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={leaveForm.carry_forward_max_days ?? 5}
                          onChange={(e) => setLeaveForm((f: any) => ({ ...f, carry_forward_max_days: parseInt(e.target.value) || 0 }))}
                        />
                        <p className="text-[10px] text-muted-foreground">Max days that can be carried forward per eligible leave type</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Eligible Leave Types</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(LEAVE_LABELS).map(([key, label]) => {
                            const typeKey = key.replace("_total", "");
                            const cfTypes: string[] = leaveForm.carry_forward_types ?? ["annual"];
                            const isChecked = cfTypes.includes(typeKey);
                            return (
                              <label key={key} className="flex items-center gap-2 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={(checked) => {
                                    setLeaveForm((f: any) => ({
                                      ...f,
                                      carry_forward_types: checked
                                        ? [...(f.carry_forward_types ?? ["annual"]), typeKey]
                                        : (f.carry_forward_types ?? ["annual"]).filter((t: string) => t !== typeKey),
                                    }));
                                  }}
                                />
                                <span className="text-xs">{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          HR can initiate carry forward from each employee's <strong>Staff Management → Leave tab</strong>.
                          The carry forward amount will be capped at the maximum days configured above, or the employee's remaining balance — whichever is lower.
                        </p>
                      </div>
                    </>
                  )}

                  <Button onClick={() => saveLeaveMutation.mutate()} disabled={saveLeaveMutation.isPending || isLoading}>
                    {saveLeaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-1">Save Carry Forward Settings</span>
                  </Button>
                </CardContent>
              </Card>

              {branchId && <CustomLeaveTypesCard branchId={branchId} />}
            </TabsContent>

            {/* ─── OVERTIME POLICY ─── */}
            <TabsContent value="overtime" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Default Overtime Multipliers</CardTitle>
                  <CardDescription>
                    Standard OT multipliers per the Employment Act 1955. Override per-employee in Staff Management → Payroll tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.entries(OT_LABELS).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          value={(otForm as any)[key] ?? 0}
                          onChange={(e) =>
                            setOtForm((f) => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Formula: Basic Salary ÷ 26 ÷ 8 × multiplier. Custom RM/hr overrides per employee take priority.
                    </p>
                  </div>

                  <Button onClick={() => saveOtMutation.mutate()} disabled={saveOtMutation.isPending || isLoading}>
                    {saveOtMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="ml-1">Save Overtime Policy</span>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── PAYROLL CUTOFF ─── */}
            <TabsContent value="cutoff" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Claim & OT Submission Cutoff</CardTitle>
                  <CardDescription>
                    Set the deadline for claims and OT submissions to be included in the previous month's payslip.
                    Submissions after this date will roll over to the next month.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Cutoff Dates</Label>
                      <p className="text-xs text-muted-foreground">
                        When enabled, claims/OT submitted after the cutoff date will be included in the next month's payroll instead.
                      </p>
                    </div>
                    <Switch
                      checked={cutoffForm.enabled}
                      onCheckedChange={(checked) => setCutoffForm((f) => ({ ...f, enabled: checked }))}
                    />
                  </div>

                  {cutoffForm.enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Claim Cutoff Day</Label>
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          value={cutoffForm.claim_cutoff_day}
                          onChange={(e) => setCutoffForm((f) => ({ ...f, claim_cutoff_day: parseInt(e.target.value) || 5 }))}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          e.g. "5" means claims submitted by the 5th of April will be included in March payslip.
                          Claims submitted after the 5th will go to April payslip.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">OT Cutoff Day</Label>
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          value={cutoffForm.ot_cutoff_day}
                          onChange={(e) => setCutoffForm((f) => ({ ...f, ot_cutoff_day: parseInt(e.target.value) || 5 }))}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          e.g. "5" means OT approved by the 5th of April will be included in March payslip.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>How it works:</strong></p>
                      <p>When generating March payroll, the system will also include claims/OT submitted between 1st–{cutoffForm.claim_cutoff_day}th of April (the following month).</p>
                      <p>This allows staff to submit late claims that can still be processed in the current payroll cycle.</p>
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      const { error } = await supabase
                        .from("hr_policies")
                        .upsert(
                          {
                            branch_id: branchId!,
                            policy_type: "payroll_cutoff",
                            policy_data: cutoffForm as any,
                            updated_at: new Date().toISOString(),
                          },
                          { onConflict: "branch_id,policy_type" }
                        );
                      if (error) toast({ title: "Failed to save", description: error.message, variant: "destructive" });
                      else {
                        toast({ title: "Cutoff settings saved" });
                        queryClient.invalidateQueries({ queryKey: ["hr-policies", branchId] });
                      }
                    }}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save Cutoff Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── BENEFITS (placeholder) ─── */}
            <TabsContent value="benefits" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Benefits & Allowances</CardTitle>
                  <CardDescription>Configure default benefits for all staff. Coming soon.</CardDescription>
                </CardHeader>
                <CardContent className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Benefits configuration will be available in a future update. Use Salary Components in each employee's Payroll tab for now.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
