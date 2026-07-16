import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const now = new Date();
    const billingMonth = now.getMonth() + 1;
    const billingYear = now.getFullYear();
    const billingDate = now.toISOString().split("T")[0];

    // ─── Gate: only branches that opted into auto-generation ────────────────
    const { data: enabledCfg } = await adminClient
      .from("billing_config")
      .select("branch_id")
      .eq("auto_generate_monthly_invoices", true);
    const enabledBranchIds = new Set<string>((enabledCfg ?? []).map((c: any) => c.branch_id));

    if (enabledBranchIds.size === 0) {
      console.log("Recurring invoices: no branch has auto-generation enabled — nothing to do.");
      return new Response(
        JSON.stringify({ success: true, created: 0, skipped: 0, message: "Auto-generation disabled for all branches" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ─── Phase 1: Billing Profile Items (new system) ─────────────────────────
    const { data: profileItems, error: piError } = await adminClient
      .from("billing_profile_items")
      .select(`
        id, profile_id, fee_package_id, fee_version_id, discount_amount, discount_type, effective_from, effective_until, is_active,
        student_billing_profiles:profile_id(id, student_id, branch_id, billing_cycle),
        fee_packages:fee_package_id(id, name, amount, branch_id, fee_type)
      `)
      .eq("is_active", true)
      .lte("effective_from", billingDate)
      .or(`effective_until.is.null,effective_until.gte.${billingDate}`);

    if (piError) throw piError;

    const monthlyProfileItems = (profileItems ?? []).filter(
      (pi: any) => {
        if (pi.fee_packages?.fee_type !== "monthly") return false;
        const bId = pi.student_billing_profiles?.branch_id ?? pi.fee_packages?.branch_id;
        return bId && enabledBranchIds.has(bId);
      }
    );

    let created = 0;
    let skipped = 0;
    const processedStudents = new Set<string>();

    for (const pi of monthlyProfileItems) {
      const profile = pi.student_billing_profiles as any;
      const pkg = pi.fee_packages as any;
      if (!profile || !pkg) continue;

      const studentId = profile.student_id;
      const branchId = profile.branch_id ?? pkg.branch_id;

      // Check for existing invoice
      const { data: existing } = await adminClient
        .from("invoices")
        .select("id")
        .eq("student_id", studentId)
        .eq("billing_month", billingMonth)
        .eq("billing_year", billingYear)
        .neq("status", "cancelled")
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        processedStudents.add(studentId);
        continue;
      }

      if (processedStudents.has(studentId)) continue;

      // Resolve versioned amount
      let unitPrice = pkg.amount;
      if (pi.fee_version_id) {
        const { data: ver } = await adminClient
          .from("fee_package_versions")
          .select("amount")
          .eq("id", pi.fee_version_id)
          .single();
        if (ver) unitPrice = ver.amount;
      } else {
        // Use latest effective version
        const { data: latestVer } = await adminClient
          .from("fee_package_versions")
          .select("amount")
          .eq("fee_package_id", pi.fee_package_id)
          .lte("effective_from", billingDate)
          .or(`effective_until.is.null,effective_until.gte.${billingDate}`)
          .order("version_number", { ascending: false })
          .limit(1);
        if (latestVer && latestVer.length > 0) unitPrice = latestVer[0].amount;
      }

      // Calculate discount
      let discount = 0;
      if (pi.discount_type === "percentage") {
        discount = unitPrice * ((pi.discount_amount ?? 0) / 100);
      } else {
        discount = pi.discount_amount ?? 0;
      }

      // Resolve payer_account_id
      let payerAccountId: string | null = null;
      const { data: parentLink } = await adminClient
        .from("parent_students")
        .select("parent_id")
        .eq("student_id", studentId)
        .limit(1);
      if (parentLink && parentLink.length > 0) {
        const { data: payer } = await adminClient
          .from("payer_accounts")
          .select("id")
          .eq("primary_parent_id", parentLink[0].parent_id)
          .eq("branch_id", branchId)
          .limit(1);
        if (payer && payer.length > 0) payerAccountId = payer[0].id;
      }

      // Get student name
      const { data: student } = await adminClient
        .from("students")
        .select("first_name, last_name, is_active")
        .eq("id", studentId)
        .single();

      if (!student?.is_active) {
        skipped++;
        processedStudents.add(studentId);
        continue;
      }

      // Gather ALL active profile items for this student
      const studentProfileItems = monthlyProfileItems.filter(
        (item: any) => item.student_billing_profiles?.student_id === studentId
      );

      // Generate invoice
      const { data: invNum } = await adminClient.rpc("generate_invoice_number");
      let subtotal = 0;
      let discountTotal = 0;
      const lineItems: any[] = [];

      for (const spi of studentProfileItems) {
        const sPkg = spi.fee_packages as any;
        let sUnitPrice = sPkg.amount;
        // Resolve version
        if (spi.fee_version_id) {
          const { data: sVer } = await adminClient
            .from("fee_package_versions").select("amount").eq("id", spi.fee_version_id).single();
          if (sVer) sUnitPrice = sVer.amount;
        } else {
          const { data: sLatest } = await adminClient
            .from("fee_package_versions")
            .select("amount")
            .eq("fee_package_id", spi.fee_package_id)
            .lte("effective_from", billingDate)
            .or(`effective_until.is.null,effective_until.gte.${billingDate}`)
            .order("version_number", { ascending: false })
            .limit(1);
          if (sLatest && sLatest.length > 0) sUnitPrice = sLatest[0].amount;
        }

        let sDiscount = 0;
        if (spi.discount_type === "percentage") {
          sDiscount = sUnitPrice * ((spi.discount_amount ?? 0) / 100);
        } else {
          sDiscount = spi.discount_amount ?? 0;
        }

        subtotal += sUnitPrice;
        discountTotal += sDiscount;
        lineItems.push({
          description: `${sPkg.name} - ${student.first_name} ${student.last_name}`,
          quantity: 1,
          unit_price: sUnitPrice,
          discount: sDiscount,
          amount: sUnitPrice - sDiscount,
          fee_package_id: sPkg.id,
          fee_version_id: spi.fee_version_id ?? null,
        });
      }

      const totalAmount = subtotal - discountTotal;
      const dueDate = new Date(billingYear, billingMonth - 1, 15);

      const { data: newInvoice, error: invError } = await adminClient
        .from("invoices")
        .insert({
          invoice_number: invNum,
          student_id: studentId,
          branch_id: branchId,
          payer_account_id: payerAccountId,
          billing_month: billingMonth,
          billing_year: billingYear,
          subtotal,
          discount_total: discountTotal,
          total_amount: totalAmount,
          due_date: dueDate.toISOString().split("T")[0],
          status: "draft",
          issued_at: null,
          created_by: "00000000-0000-0000-0000-000000000000",
        })
        .select("id")
        .single();

      if (invError) {
        console.error(`Failed to create invoice for student ${studentId}:`, invError);
        processedStudents.add(studentId);
        continue;
      }

      // Insert line items
      for (const li of lineItems) {
        await adminClient.from("invoice_items").insert({
          invoice_id: newInvoice.id,
          ...li,
        });
      }

      processedStudents.add(studentId);
      created++;
    }

    // ─── Phase 2: Legacy student_fees fallback ───────────────────────────────
    const { data: studentFees, error: sfError } = await adminClient
      .from("student_fees")
      .select(`
        id, student_id, fee_package_id, discount_amount,
        fee_packages(id, name, amount, branch_id, fee_type),
        students(id, first_name, last_name, branch_id, is_active)
      `)
      .eq("is_active", true);

    if (sfError) throw sfError;

    const monthlyFees = (studentFees ?? []).filter(
      (sf: any) =>
        sf.fee_packages?.fee_type === "monthly" &&
        sf.students?.is_active &&
        !processedStudents.has(sf.student_id) &&
        enabledBranchIds.has(sf.fee_packages?.branch_id)
    );

    for (const sf of monthlyFees) {
      const pkg = sf.fee_packages as any;
      const student = sf.students as any;
      const branchId = pkg.branch_id;

      const { data: existing } = await adminClient
        .from("invoices")
        .select("id")
        .eq("student_id", sf.student_id)
        .eq("billing_month", billingMonth)
        .eq("billing_year", billingYear)
        .neq("status", "cancelled")
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Resolve payer_account_id
      let payerAccountId: string | null = null;
      const { data: parentLink } = await adminClient
        .from("parent_students")
        .select("parent_id")
        .eq("student_id", sf.student_id)
        .limit(1);
      if (parentLink && parentLink.length > 0) {
        const { data: payer } = await adminClient
          .from("payer_accounts")
          .select("id")
          .eq("primary_parent_id", parentLink[0].parent_id)
          .eq("branch_id", branchId)
          .limit(1);
        if (payer && payer.length > 0) payerAccountId = payer[0].id;
      }

      // Use versioned amount if available
      let unitPrice = pkg.amount;
      const { data: latestVer } = await adminClient
        .from("fee_package_versions")
        .select("amount")
        .eq("fee_package_id", pkg.id)
        .lte("effective_from", billingDate)
        .or(`effective_until.is.null,effective_until.gte.${billingDate}`)
        .order("version_number", { ascending: false })
        .limit(1);
      if (latestVer && latestVer.length > 0) unitPrice = latestVer[0].amount;

      const { data: invNum } = await adminClient.rpc("generate_invoice_number");
      const discount = sf.discount_amount ?? 0;
      const totalAmount = unitPrice - discount;
      const dueDate = new Date(billingYear, billingMonth - 1, 15);

      const { data: newInvoice, error: invError } = await adminClient
        .from("invoices")
        .insert({
          invoice_number: invNum,
          student_id: sf.student_id,
          branch_id: branchId,
          payer_account_id: payerAccountId,
          billing_month: billingMonth,
          billing_year: billingYear,
          subtotal: unitPrice,
          discount_total: discount,
          total_amount: totalAmount,
          due_date: dueDate.toISOString().split("T")[0],
          status: "draft",
          issued_at: null,
          created_by: "00000000-0000-0000-0000-000000000000",
        })
        .select("id")
        .single();

      if (invError) {
        console.error(`Failed to create invoice for student ${sf.student_id}:`, invError);
        continue;
      }

      await adminClient.from("invoice_items").insert({
        invoice_id: newInvoice.id,
        description: `${pkg.name} - ${student.first_name} ${student.last_name}`,
        quantity: 1,
        unit_price: unitPrice,
        discount,
        amount: totalAmount,
        fee_package_id: pkg.id,
      });

      created++;
    }

    console.log(`Recurring invoices: ${created} created, ${skipped} skipped (already exist)`);

    return new Response(
      JSON.stringify({ success: true, created, skipped, month: billingMonth, year: billingYear }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Recurring invoice error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
