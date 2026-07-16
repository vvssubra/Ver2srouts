import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Validate the caller's JWT. Returns the user's claims on success,
 * or a Response (401) on failure.
 *
 * Edge functions deploy with verify_jwt = false (Supabase signing-keys),
 * so functions that should be authenticated MUST validate in code.
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ userId: string; email?: string | null; role?: string | null } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    const role = (data?.claims?.role as string | undefined) ?? null;
    // Allow service-role JWTs (used by DB triggers / server-to-server callers)
    if (!error && role === "service_role") {
      return { userId: "service_role", email: null, role };
    }
    if (error || !data?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return {
      userId: data.claims.sub as string,
      email: (data.claims.email as string | undefined) ?? null,
      role,
    };
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}