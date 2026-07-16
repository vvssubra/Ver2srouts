import DashboardLayout from "@/components/DashboardLayout";
import UserAccountsPanel from "@/components/role-matrix/UserAccountsPanel";
import { KeyRound } from "lucide-react";

export default function TempPasswordAdmin() {
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Temporary Password
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Superadmins can generate a temporary password for any user who has forgotten
            theirs. The user will be required to create a new password on their next login,
            and every generation is recorded in the audit log.
          </p>
        </div>
        <UserAccountsPanel />
      </div>
    </DashboardLayout>
  );
}