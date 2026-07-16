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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: overdueInvoices, error } = await adminClient
      .from("invoices")
      .select("id, invoice_number, student_id, total_amount, amount_paid, due_date, branch_id")
      .lt("due_date", today)
      .in("status", ["issued", "partial", "draft"]);

    if (error) throw error;

    let updated = 0;
    if (overdueInvoices && overdueInvoices.length > 0) {
      const ids = overdueInvoices.map((inv) => inv.id);
      const { error: updateError } = await adminClient
        .from("invoices")
        .update({ status: "overdue" })
        .in("id", ids);

      if (updateError) throw updateError;
      updated = ids.length;

      // Notify parents about overdue invoices
      const studentIds = [...new Set(overdueInvoices.map((inv) => inv.student_id))];
      const { data: parentLinks } = await adminClient
        .from("parent_students")
        .select("parent_id, student_id")
        .in("student_id", studentIds)
        .eq("status", "approved");

      if (parentLinks && parentLinks.length > 0) {
        // Get parent emails
        const parentIds = [...new Set(parentLinks.map((pl) => pl.parent_id))];
        const { data: parentProfiles } = await adminClient
          .from("profiles")
          .select("id, email")
          .in("id", parentIds);

        const parentEmailMap = new Map(
          (parentProfiles ?? []).map((p: any) => [p.id, p.email])
        );

        // Get student names
        const { data: students } = await adminClient
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds);

        const studentNameMap = new Map(
          (students ?? []).map((s: any) => [s.id, `${s.first_name} ${s.last_name}`])
        );

        // Send notifications + emails
        const notifications = [];
        for (const inv of overdueInvoices) {
          const parents = parentLinks.filter((pl) => pl.student_id === inv.student_id);
          const amountDue = inv.total_amount - inv.amount_paid;
          for (const pl of parents) {
            notifications.push({
              user_id: pl.parent_id,
              title: "Invoice Overdue",
              message: `Invoice ${inv.invoice_number} (RM ${amountDue.toFixed(2)}) is past due date ${inv.due_date}. Please make payment.`,
              type: "billing",
              reference_id: inv.id,
              action_url: "/parent-fees",
              group_key: `invoice:${inv.id}`,
              priority: "high",
            });

            // Send email
            const email = parentEmailMap.get(pl.parent_id);
            if (email) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({
                    templateName: "payment-reminder",
                    recipientEmail: email,
                    branchId: inv.branch_id,
                    idempotencyKey: `overdue-${inv.id}-${new Date().toISOString().split('T')[0]}`,
                    templateData: {
                      invoiceNumber: inv.invoice_number,
                      amount: amountDue.toFixed(2),
                      currency: "RM",
                      dueDate: inv.due_date,
                      childName: studentNameMap.get(inv.student_id) || "",
                      stage: "overdue_3",
                    },
                  }),
                });
              } catch (emailErr) {
                console.error(`Failed to send reminder email to ${email}:`, emailErr);
              }
            }
          }
        }
        if (notifications.length > 0) {
          await adminClient.from("notifications").insert(notifications);
        }
      }
    }

    console.log(`Overdue detection: ${updated} invoices marked as overdue`);

    return new Response(
      JSON.stringify({ success: true, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Overdue detection error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
