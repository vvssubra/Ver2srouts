import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useBranches } from "./use-branches";
import { useAuth } from "@/lib/auth";

interface BranchContextType {
  branches: { id: string; name: string }[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  activeBranchIds: string[];
  isLoading: boolean;
}

const BranchContext = createContext<BranchContextType | null>(null);

const STORAGE_KEY = "app-selected-branch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { branches, isLoading } = useBranches();
  const location = useLocation();
  const [selectedBranchId, setSelectedBranchIdRaw] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const setSelectedBranchId = (id: string) => {
    setSelectedBranchIdRaw(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  // Auto-selection logic once branches load
  useEffect(() => {
    if (isLoading || branches.length === 0) return;

    // If current selection is still valid, keep it
    if (selectedBranchId === "all" && (role === "super_admin" || role === "franchisee")) return;
    if (branches.some((b) => b.id === selectedBranchId)) return;

    // Auto-select
    if (branches.length === 1) {
      setSelectedBranchId(branches[0].id);
    } else if (role === "super_admin" || role === "franchisee") {
      setSelectedBranchId("all");
    } else {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, isLoading, role]);

  // Honor `?branch=<id>` deep-link param (notifications, emails) so the
  // approver lands on the correct branch context regardless of their last
  // selection. Only switches when the requested branch is in their accessible
  // branches list.
  useEffect(() => {
    if (isLoading || branches.length === 0) return;
    try {
      const params = new URLSearchParams(location.search);
      const requested = params.get("branch");
      if (!requested) return;
      if (requested === selectedBranchId) return;
      if (!branches.some((b) => b.id === requested)) return;
      setSelectedBranchId(requested);
    } catch {}
  }, [branches, isLoading, location.search, location.pathname]);

  const activeBranchIds = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== "all") return [selectedBranchId];
    return branches.map((b) => b.id);
  }, [selectedBranchId, branches]);

  return (
    <BranchContext.Provider value={{ branches, selectedBranchId, setSelectedBranchId, activeBranchIds, isLoading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useGlobalBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useGlobalBranch must be used within BranchProvider");
  return ctx;
}
