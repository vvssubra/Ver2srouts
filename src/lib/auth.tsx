import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BrandedSplash } from "@/components/shared/BrandedSplash";

type AppRole = "super_admin" | "franchisee" | "admin" | "staff" | "teacher" | "parent";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  roles: AppRole[];
  allowedRoutes: string[];
  managedRoutes: string[];
  loading: boolean;
  roleChecked: boolean;
  routesLoaded: boolean;
  signOut: () => Promise<void>;
  canManage: (path: string) => boolean;
  setActiveRole: (role: AppRole) => void;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  roles: [],
  allowedRoutes: [],
  managedRoutes: [],
  loading: true,
  roleChecked: false,
  routesLoaded: false,
  signOut: async () => {},
  canManage: () => false,
  setActiveRole: () => {},
  refreshPermissions: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Priority used when auto-picking an initial active role for a multi-role
// user — staff-side roles win unless the user is parent-only.
const ROLE_PRIORITY: AppRole[] = [
  "super_admin",
  "franchisee",
  "admin",
  "teacher",
  "staff",
  "parent",
];

// Admin-tier roles always take precedence over operational roles. A user
// who holds any of these should never silently fall back into a lower-tier
// permission set (e.g. a stale "staff" choice carried over from a previous
// session). This guarantees admins always get admin permissions on login.
const ADMIN_TIER: AppRole[] = ["super_admin", "franchisee", "admin"];

const activeRoleStorageKey = (userId: string) => `active-role:${userId}`;

function pickDefaultRole(roles: AppRole[]): AppRole | null {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return roles[0] ?? null;
}

/**
 * Race a promise against a hard timeout. Used so that a hanging Supabase
 * call can never wedge the auth boot on BrandedSplash.
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms = 8000, label = "request"): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

const PARENT_PWA_PATHS = ["/child", "/journey", "/progress", "/parent-chat", "/parent-fees", "/parent-messages", "/parent-ptm", "/school-documents", "/parent-onboarding"];
function isParentPwaPath() {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  return PARENT_PWA_PATHS.some((r) => p.startsWith(r));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [managedRoutes, setManagedRoutes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleChecked, setRoleChecked] = useState(false);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const loadedUserIdRef = useRef<string | null>(null);

  const fetchRoles = async (userId: string) => {
    // Retry transiently — backend cold starts can return PGRST002 / 503 briefly.
    // We must NOT treat a transient failure as "no role" because ProtectedRoute
    // signs the user out in that case.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      let data: any = null;
      let error: any = null;
      try {
        const res = await withTimeout(
          supabase.from("user_roles").select("role").eq("user_id", userId),
          8000,
          "fetchRoles",
        );
        data = (res as any).data;
        error = (res as any).error;
      } catch (e) {
        error = e;
      }
      if (!error) {
        const list = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
        // Dedupe + stable order by priority
        const uniq = Array.from(new Set(list));
        uniq.sort(
          (a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)
        );
        return uniq;
      }
      lastErr = error;
      const transient =
        error?.code === "PGRST002" ||
        (error?.message ?? "").toLowerCase().includes("fetch") ||
        (error?.message ?? "").toLowerCase().includes("schema cache") ||
        (error?.message ?? "").toLowerCase().includes("timed out");
      if (!transient) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    console.error("fetchRoles error:", lastErr);
    // Return undefined (not null) to signal "unknown — do not log out"
    return undefined as unknown as AppRole[];
  };

  const fetchAllowedRoutes = async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("get_user_allowed_routes", { _user_id: userId }),
        8000,
        "fetchAllowedRoutes",
      );
      if (error) {
        console.error("fetchAllowedRoutes error:", error);
        return null;
      }
      return (data as string[]) ?? [];
    } catch (error) {
      console.error("fetchAllowedRoutes error:", error);
      return null;
    }
  };

  const fetchManagedRoutes = async (userId: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("get_user_managed_routes", { _user_id: userId }),
        8000,
        "fetchManagedRoutes",
      );
      if (error) {
        console.error("fetchManagedRoutes error:", error);
        return null;
      }
      return (data as string[]) ?? [];
    } catch (error) {
      console.error("fetchManagedRoutes error:", error);
      return null;
    }
  };

  const loadUserData = async (userId: string) => {
    const userRoles = await fetchRoles(userId);
    // Only set role + mark this user as loaded if we got a definitive answer.
    let definitive = false;
    if (userRoles !== undefined) {
      setRoles(userRoles);
      // Restore previously-chosen active role if still valid; otherwise pick
      // by priority (or null when the user has no roles assigned yet).
      let active: AppRole | null = null;
      try {
        const saved = localStorage.getItem(activeRoleStorageKey(userId));
        if (saved && (userRoles as AppRole[]).includes(saved as AppRole)) {
          active = saved as AppRole;
        }
      } catch {}
      // Promote admins: if the user holds any admin-tier role, ignore a
      // saved lower-tier active role (e.g. "staff" / "teacher" / "parent")
      // and default back to the highest admin role. Operational staff and
      // teacher-only users keep exactly the role they were assigned, so
      // their permissions stay scoped to their access group.
      const hasAdminTier = (userRoles as AppRole[]).some((r) => ADMIN_TIER.includes(r));
      if (hasAdminTier && (!active || !ADMIN_TIER.includes(active))) {
        active =
          ADMIN_TIER.find((r) => (userRoles as AppRole[]).includes(r)) ?? active;
        if (active) {
          try { localStorage.setItem(activeRoleStorageKey(userId), active); } catch {}
        }
      }
      if (!active) active = pickDefaultRole(userRoles);
      setRole(active);
      loadedUserIdRef.current = userId;
      definitive = true;
    }

    // Background fetch — never blocks login / dashboard render.
    Promise.all([fetchAllowedRoutes(userId), fetchManagedRoutes(userId)])
      .then(([routes, managed]) => {
        if (routes !== null) setAllowedRoutes(routes);
        if (managed !== null) setManagedRoutes(managed);
        // Mark routes as loaded only when the allowed-routes RPC returned a
        // definitive answer (even an empty array). This lets the sidebar
        // distinguish "still loading" from "loaded but empty" so it never
        // briefly shows the full admin nav to a restricted staff user.
        if (routes !== null) setRoutesLoaded(true);
      })
      .catch((err) => console.error("background route fetch error:", err));

    return definitive;
  };

  useEffect(() => {
    let bootTimedOut = false;
    // Hard failsafe: never leave the user on BrandedSplash forever.
    const bootTimer = window.setTimeout(() => {
      bootTimedOut = true;
      console.warn("[auth] boot timeout");
      setLoading(false);
      setRoleChecked(true);
      if (isParentPwaPath()) {
        try { window.location.replace("/auth?app=parents&error=session_timeout"); } catch {}
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // CRITICAL: a new session has arrived but the role hasn't been
          // looked up yet. We must clear `roleChecked` synchronously,
          // otherwise ProtectedRoute will see `session && !role && roleChecked`
          // for one render (carrying over from the initial unauthenticated
          // load that already set roleChecked=true) and sign the user out
          // with "no_access" — which is exactly what was happening on every
          // first login.
          if (loadedUserIdRef.current !== session.user.id) {
            setRoleChecked(false);
          }
          // Fire and forget — don't block auth event processing
          setTimeout(async () => {
            let definitive = true;
            if (loadedUserIdRef.current !== session.user.id) {
              definitive = await loadUserData(session.user.id);
            }
            // Only mark role as "checked" once we actually have a definitive
            // answer from the backend. Otherwise a transient PGRST/network
            // error during cold start would cause ProtectedRoute to sign the
            // user out for "no role assigned".
            if (definitive) {
              setRoleChecked(true);
            } else if (bootTimedOut) {
              // Boot already gave up — sign out the stale session so the
              // user is sent to a clean login instead of looping.
              try { await supabase.auth.signOut(); } catch {}
              const target = isParentPwaPath()
                ? "/auth?app=parents&error=session_timeout"
                : "/auth?error=session_timeout";
              try { window.location.replace(target); } catch {}
            }
            setLoading(false);
          }, 0);
        } else {
          loadedUserIdRef.current = null;
          setRole(null);
          setAllowedRoutes([]);
          setManagedRoutes([]);
          setRoleChecked(true);
          setLoading(false);
        }
      }
    );

    (async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          "getSession",
        );
        if (bootTimedOut) return;
        setSession(session);
        setUser(session?.user ?? null);
        let definitive = true;
        if (session?.user) {
          if (loadedUserIdRef.current !== session.user.id) {
            definitive = await loadUserData(session.user.id);
          }
        }
        if (definitive) {
          setRoleChecked(true);
        } else if (session?.user) {
          // Session exists but roles never resolved — recover instead of looping.
          console.error("[auth] roles did not resolve, signing out stale session");
          try { await supabase.auth.signOut(); } catch {}
          const target = isParentPwaPath()
            ? "/auth?app=parents&error=session_timeout"
            : "/auth?error=session_timeout";
          try { window.location.replace(target); } catch {}
        }
        setLoading(false);
      } catch (err) {
        console.error("[auth] boot failed:", err);
        if (bootTimedOut) return;
        setLoading(false);
        setRoleChecked(true);
        if (isParentPwaPath()) {
          try { window.location.replace("/auth?app=parents&error=session_timeout"); } catch {}
        }
      } finally {
        window.clearTimeout(bootTimer);
      }
    })();

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(bootTimer);
    };
  }, []);

  const signOut = async () => {
    const uid = loadedUserIdRef.current;
    if (uid) {
      try { localStorage.removeItem(activeRoleStorageKey(uid)); } catch {}
    }
    loadedUserIdRef.current = null;
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setRoles([]);
    setAllowedRoutes([]);
    setManagedRoutes([]);
    setRoleChecked(false);
    setRoutesLoaded(false);
  };

  const setActiveRole = (next: AppRole) => {
    if (!roles.includes(next)) return;
    const uid = loadedUserIdRef.current ?? user?.id ?? null;
    if (uid) {
      try { localStorage.setItem(activeRoleStorageKey(uid), next); } catch {}
    }
    setRole(next);
    // Refresh route lists for the (potentially) new role context.
    if (uid) {
      setRoutesLoaded(false);
      Promise.all([fetchAllowedRoutes(uid), fetchManagedRoutes(uid)])
        .then(([routes, managed]) => {
          if (routes !== null) setAllowedRoutes(routes);
          if (managed !== null) setManagedRoutes(managed);
          if (routes !== null) setRoutesLoaded(true);
        })
        .catch((err) => console.error("setActiveRole refresh error:", err));
    }
  };

  /**
   * Re-pull allowed/managed routes for the current user. Used by the Role
   * Matrix UI (and any future permission edit surface) so changes apply
   * to currently-online sessions without forcing a logout. Also fires on
   * a `sprouts:permissions_version` storage event so other tabs sync.
   */
  const refreshPermissions = async () => {
    const uid = loadedUserIdRef.current ?? user?.id ?? null;
    if (!uid) return;
    const [routes, managed] = await Promise.all([
      fetchAllowedRoutes(uid),
      fetchManagedRoutes(uid),
    ]);
    if (routes !== null) setAllowedRoutes(routes);
    if (managed !== null) setManagedRoutes(managed);
    if (routes !== null) setRoutesLoaded(true);
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sprouts:permissions_version") {
        refreshPermissions().catch(() => {});
      }
    };
    const onCustom = () => {
      refreshPermissions().catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("sprouts:permissions-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sprouts:permissions-changed", onCustom as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        roles,
        allowedRoutes,
        managedRoutes,
        loading,
        roleChecked,
        routesLoaded,
        signOut,
        canManage: (path: string) => {
          if (role === "super_admin" || role === "franchisee") return true;
          return managedRoutes.some((r) => path === r || path.startsWith(r + "/"));
        },
        refreshPermissions,
        setActiveRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children, allowedRoles }: { children: ReactNode; allowedRoles?: AppRole[] }) {
  const { session, role, roles, allowedRoutes, loading, roleChecked } = useAuth();
  const navigate = useNavigate();
  const parentGateCheckRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !session) {
      navigate("/auth");
    }
    // Force password change on first login
    if (!loading && session?.user) {
      const path = window.location.pathname;
      if (path !== "/change-password") {
        supabase
          .from("profiles")
          .select("must_change_password")
          .eq("id", session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if ((data as any)?.must_change_password) {
              navigate("/change-password?forced=1", { replace: true });
            }
          });
      }
    }
    if (!loading && roleChecked && session && !role) {
      // If there's a pending parent access code, don't redirect to /pending — 
      // let the auto-linking logic in Auth.tsx / Pending.tsx complete first
      const hasPendingCode = typeof window !== "undefined" && sessionStorage.getItem("pending_parent_access_code");
      if (!hasPendingCode) {
        // Invite-only app: users without an assigned role are signed out.
        // Admin/HR must create the profile and assign a role first.
        supabase.auth.signOut().finally(() => {
          navigate("/auth?error=no_access");
        });
        return;
      }
      // Otherwise stay on loading spinner while auto-link completes
    }
    if (!loading && session && role && allowedRoles && !allowedRoles.includes(role)) {
      // Admin inherits franchisee route access
      const hasAccess = role === "admin" && allowedRoles.includes("franchisee");
      if (!hasAccess) {
        // If the user holds another role that DOES grant access, send them to
        // the role picker so they can switch instead of bouncing to a wrong
        // dashboard (e.g. parent landing on /accounting/budget).
        const adminInherit = roles.includes("admin") && allowedRoles.includes("franchisee");
        const otherRoleAllowed =
          roles.some((r) => r !== role && allowedRoles.includes(r)) || adminInherit;
        if (otherRoleAllowed && roles.length > 1) {
          const ret = encodeURIComponent(window.location.pathname + window.location.search);
          navigate(`/select-role?return=${ret}`);
          return;
        }
        navigate("/dashboard");
      }
    }
    // Parent first-run gate: force incomplete parents through /parent-onboarding.
    // Never redirect on a transient read failure — doing so can create a
    // /child ↔ /parent-onboarding loop and leave mobile users on a blank page.
    if (!loading && session?.user && role === "parent") {
      const path = window.location.pathname;
      const allowList = [
        "/parent-onboarding",
        "/change-password",
        "/auth",
        "/reset-password",
        "/account",
      ];
      if (!allowList.includes(path)) {
        const checkKey = `${session.user.id}:${path}`;
        if (parentGateCheckRef.current !== checkKey) {
          parentGateCheckRef.current = checkKey;
          Promise.all([
            supabase
              .from("profiles")
              .select("onboarding_completed_at")
              .eq("id", session.user.id)
              .maybeSingle(),
            supabase
              .from("parent_onboarding_state")
              .select("completed_at")
              .eq("parent_id", session.user.id),
          ]).then(([profileRes, stateRes]) => {
            if (profileRes.error || stateRes.error) {
              console.error("parent onboarding gate read failed", profileRes.error || stateRes.error);
              return;
            }

            const profileComplete = !!(profileRes.data as any)?.onboarding_completed_at;
            const stateComplete = ((stateRes.data ?? []) as any[]).some((row) => !!row.completed_at);
            if (!profileComplete && !stateComplete && window.location.pathname === path) {
              navigate("/parent-onboarding", { replace: true });
            }
          });
        }
      }
    }
    // Access group enforcement: if user has allowed routes and current path isn't in them.
    // Parents are NOT gated by access groups — they use the dedicated parent app
    // routes (/child, /journey, /parent/*). Skipping for parent prevents a redirect
    // loop when a multi-role user (e.g. admin + parent) switches into Parent mode:
    // the admin's allowedRoutes don't list /child, which would otherwise bounce them
    // back to an admin route, which in turn bounces them to /select-role.
    if (!loading && session && role && role !== "super_admin" && role !== "franchisee" && role !== "parent" && allowedRoutes.length > 0) {
      const currentPath = window.location.pathname;
      // /settings is universal; /dashboard is gated by access group
      const alwaysAllowed = [
        "/settings",
        "/auth",
        "/change-password",
        "/notifications",
        "/select-role",
        // Communication Hub is org-wide read surface for all staff.
        "/announcements",
        "/newsletters",
      ];
      const inAllowed = allowedRoutes.some((r) => {
        const base = r.split("?")[0];
        return currentPath.startsWith(base);
      });
      if (!alwaysAllowed.includes(currentPath) && !inAllowed) {
        // Redirect to first allowed route, or /settings as a safe fallback
        const fallback = allowedRoutes[0] ?? "/settings";
        navigate(fallback);
      }
    }
  }, [loading, roleChecked, session, role, navigate, allowedRoles, allowedRoutes]);

  if (loading) {
    return <BrandedSplash />;
  }

  if (!session) return null;

  return <>{children}</>;
}

export function getRoleDashboardPath(role: AppRole | null): string {
  switch (role) {
    case "super_admin":
    case "franchisee":
    case "admin":
      return "/dashboard";
    case "teacher":
      return "/dashboard";
    case "staff":
      return "/dashboard";
    case "parent":
      return "/child";
    default:
      return "/dashboard";
  }
}

export function getRoleColor(role: AppRole | null): string {
  switch (role) {
    case "super_admin": return "hsl(var(--role-super-admin))";
    case "franchisee": return "hsl(var(--role-franchisee))";
    case "admin": return "hsl(var(--role-admin))";
    case "staff": return "hsl(var(--role-admin))";
    case "teacher": return "hsl(var(--role-teacher))";
    case "parent": return "hsl(var(--role-parent))";
    default: return "hsl(var(--primary))";
  }
}

export function getRoleLabel(role: AppRole | null): string {
  switch (role) {
    case "super_admin": return "Super Admin";
    case "franchisee": return "Branch Manager";
    case "admin": return "Admin";
    case "staff": return "Staff";
    case "teacher": return "Teacher";
    case "parent": return "Parent";
    default: return "Unknown";
  }
}

/**
 * Human-readable description of a system role. Used in role selection,
 * staff onboarding, and admin user-management screens so labels stay
 * consistent. The internal enum key for "Branch Manager" is still
 * `franchisee` for backwards-compat with existing RLS policies and data.
 */
export function getRoleDescription(role: AppRole | null): string {
  switch (role) {
    case "super_admin":
      return "Full system access across all organizations, branches, users and settings.";
    case "franchisee":
      return "Manages selected branch operations based on assigned permissions.";
    case "admin":
      return "School administrative role with access based on assigned responsibilities.";
    case "staff":
      return "Operational staff role with access based on assigned job function.";
    case "teacher":
      return "Classroom and learning management role.";
    case "parent":
      return "Parent portal access for linked child information.";
    default:
      return "";
  }
}

/**
 * Coarse grouping used by the login screen to decide which role bucket a
 * user belongs to (Parent / Teacher / Admin). Branch Manager and Super
 * Admin both sign in via the Admin bucket.
 */
export function getRoleGroup(role: AppRole | null): "parent" | "teacher" | "admin" | null {
  switch (role) {
    case "parent":
      return "parent";
    case "teacher":
    case "staff":
      return "teacher";
    case "admin":
    case "franchisee":
    case "super_admin":
      return "admin";
    default:
      return null;
  }
}
