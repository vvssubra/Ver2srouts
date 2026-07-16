import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * Create BillPlz Bill
 *
 * Creates a BillPlz bill for a parent to pay an outstanding invoice.
 * Returns the bill URL for redirect.
 *
 * Architecture alignment:
 * - Pre-registers gateway_transaction with payer_account_id for reconciliation
 * - Carries full traceability metadata (invoice, student, payer_account)
 * - Audit entry tracks bill creation for forensic timeline
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BILLPLZ_API = "https://www.billplz-sandbox.com/api/v3"; // Change to https://www.billplz.com/api/v3 for production

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const billplzKey = Deno.env.get("BILLPLZ_SECRET_KEY");
  const billplzCollectionId = Deno.env.get("BILLPLZ_COLLECTION_ID");

  if (!billplzKey) {
    return new Response(JSON.stringify({ error: "BillPlz API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!billplzCollectionId) {
    return new Response(JSON.stringify({ error: "BillPlz Collection ID not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Authenticate Parent ───────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // ── Fetch Profile ─────────────────────────────────────────────────────
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", userId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch Invoice ─────────────────────────────────────────────────────
    const { data: invoice, error: invError } = await adminClient
      .from("invoices")
      .select("*, students(first_name, last_name)")
      .eq("id", invoice_id)
      .single();

    if (invError || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify Parent Ownership ───────────────────────────────────────────
    const { data: parentLink } = await adminClient
      .from("parent_students")
      .select("id")
      .eq("parent_id", userId)
      .eq("student_id", invoice.student_id)
      .single();

    if (!parentLink) {
      return new Response(JSON.stringify({ error: "Unauthorized: not your child's invoice" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Validate Invoice State ────────────────────────────────────────────
    const amountDue = invoice.total_amount - invoice.amount_paid;
    if (amountDue <= 0) {
      return new Response(JSON.stringify({ error: "Invoice is already fully paid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["issued", "partial", "overdue"].includes(invoice.status)) {
      return new Response(JSON.stringify({ error: "Invoice is not payable in current status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const studentName = `${invoice.students?.first_name ?? ""} ${invoice.students?.last_name ?? ""}`.trim();
    const parentName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email;

    // BillPlz amount is in cents (Malaysian sen)
    const amountInCents = Math.round(amountDue * 100);

    const origin =
      req.headers.get("origin") ||
      Deno.env.get("APP_PUBLIC_URL") ||
      Deno.env.get("APP_BASE_URL") ||
      "https://sprouts.littlegreenhearts.com";

    // ── Create BillPlz Bill ───────────────────────────────────────────────
    const billPayload = new URLSearchParams({
      collection_id: billplzCollectionId,
      description: `${invoice.invoice_number} — Tuition for ${studentName}`,
      email: profile.email,
      name: parentName,
      amount: String(amountInCents),
      callback_url: `${supabaseUrl}/functions/v1/billplz-webhook`,
      redirect_url: `${origin}/child?payment=success`,
      reference_1_label: "Invoice ID",
      reference_1: invoice.id,
    });

    const billplzAuth = btoa(`${billplzKey}:`);

    const billResponse = await fetch(`${BILLPLZ_API}/bills`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${billplzAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: billPayload.toString(),
    });

    const billData = await billResponse.json();

    if (!billResponse.ok) {
      console.error("BillPlz API error:", billData);
      return new Response(JSON.stringify({ error: "Failed to create BillPlz bill", details: billData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Pre-register Gateway Transaction (with payer_account_id) ─────────
    await adminClient.from("gateway_transactions").insert({
      gateway: "billplz",
      bill_id: billData.id,
      collection_id: billplzCollectionId,
      gateway_status: "pending",
      gateway_amount: amountDue,
      branch_id: invoice.branch_id,
      invoice_id: invoice.id,
      reconciliation_status: "unmatched",
      metadata: {
        created_by: userId,
        student_name: studentName,
        invoice_number: invoice.invoice_number,
        payer_account_id: invoice.payer_account_id,
        amount_due_at_creation: amountDue,
        invoice_total: invoice.total_amount,
      },
    } as any);

    // ── Audit Log ─────────────────────────────────────────────────────────
    await adminClient.from("billing_audit_logs").insert({
      branch_id: invoice.branch_id,
      entity_type: "invoice",
      entity_id: invoice.id,
      action: "billplz_bill_created",
      actor_id: userId,
      actor_name: parentName,
      new_values: {
        bill_id: billData.id,
        amount: amountDue,
        bill_url: billData.url,
        payer_account_id: invoice.payer_account_id,
        collection_id: billplzCollectionId,
      },
    });

    return new Response(JSON.stringify({ url: billData.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("BillPlz bill creation error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
