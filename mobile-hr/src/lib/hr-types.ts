import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];
type Insert<T extends keyof Tables> = Tables[T]["Insert"];
type Update<T extends keyof Tables> = Tables[T]["Update"];

export type Profile = Row<"profiles">;
export type StaffProfile = Row<"staff_profiles">;
export type StaffDesignation = Row<"staff_designations">;
export type BranchMembership = Row<"branch_memberships">;
export type UserRole = Row<"user_roles">;

export type StaffAttendance = Row<"staff_attendance">;
export type StaffAttendanceInsert = Insert<"staff_attendance">;
export type StaffAttendanceUpdate = Update<"staff_attendance">;
export type GeofenceLocation = Row<"geofence_locations">;
export type StaffGeofenceAssignment = Row<"staff_geofence_assignments">;

export type LeaveRequest = Row<"leave_requests">;
export type LeaveRequestInsert = Insert<"leave_requests">;
export type LeaveBalance = Row<"leave_balances">;
export type CustomLeaveType = Row<"custom_leave_types">;
export type CustomLeaveBalance = Row<"custom_leave_balances">;
export type LeaveType =
  | "annual"
  | "medical"
  | "hospitalisation"
  | "maternity"
  | "paternity"
  | "unpaid"
  | "emergency"
  | "compassionate"
  | "replacement";

export type StaffClaim = Row<"staff_claims">;
export type StaffClaimInsert = Insert<"staff_claims">;
export type ClaimType = "transport" | "meal" | "medical" | "training" | "equipment" | "other";

export type OvertimeRequest = Row<"overtime_requests">;
export type OvertimeRequestInsert = Insert<"overtime_requests">;

export type PayrollRecord = Row<"payroll_records">;
export type PayrollCustomItem = Row<"payroll_custom_items">;

export type StaffDocument = Row<"staff_documents">;
export type StaffDocumentInsert = Insert<"staff_documents">;

export type HrPolicy = Row<"hr_policies">;
export type NotificationRow = Row<"notifications">;
export type Announcement = Row<"announcements">;
export type Newsletter = Row<"newsletters">;

export type AppRole = "super_admin" | "franchisee" | "admin" | "teacher" | "staff" | "parent";
