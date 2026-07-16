import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        const invoiceId = session.metadata?.invoice_id;
        const branchId = session.metadata?.branch_id;
        if (!invoiceId) {
          console.error("No invoice_id in session metadata");
          return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
        }

        const amountPaid = (session.amount_total ?? 0) / 100;

        const { data: invoice } = await adminClient
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single();

        if (!invoice) {
          console.error("Invoice not found:", invoiceId);
          return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
        }

        const newAmountPaid = invoice.amount_paid + amountPaid;
        const newStatus = newAmountPaid >= invoice.total_amount ? "paid" : "partial";

        await adminClient
          .from("invoices")
          .update({ amount_paid: newAmountPaid, status: newStatus })
          .eq("id", invoiceId);

        await adminClient.from("payments").insert({
          invoice_id: invoiceId,
          amount: amountPaid,
          payment_method: "stripe",
          payment_reference: session.payment_intent as string,
          received_by: invoice.created_by,
          notes: `Stripe payment - Session ${session.id}`,
        });

        // Accounting sync
        if (branchId) {
          const { data: revenueAccount } = await adminClient
            .from("accounts")
            .select("id")
            .eq("branch_id", branchId)
            .eq("type", "income")
            .ilike("name", "%tuition%")
            .limit(1)
            .single();

          if (revenueAccount) {
            await adminClient.from("transactions").insert({
              branch_id: branchId,
              account_id: revenueAccount.id,
              type: "income",
              amount: amountPaid,
              description: `Stripe payment for invoice ${invoice.invoice_number}`,
              reference_type: "invoice_payment",
              reference_id: invoiceId,
              created_by: invoice.created_by,
              transaction_date: new Date().toISOString().split("T")[0],
            });
          }
        }

        // Send payment confirmation email to parent(s)
        try {
          const { data: student } = await adminClient
            .from("students")
            .select("id, first_name, last_name")
            .eq("id", invoice.student_id)
            .single();

          const { data: parentLinks } = await adminClient
            .from("parent_students")
            .select("parent_id")
            .eq("student_id", invoice.student_id)
            .eq("status", "approved");

          if (parentLinks && parentLinks.length > 0) {
            const parentIds = parentLinks.map((pl: any) => pl.parent_id);
            const { data: parents } = await adminClient
              .from("profiles")
              .select("email")
              .in("id", parentIds);

            const parentEmails = parents?.map((p: any) => p.email).filter(Boolean) ?? [];
            for (const recipient of parentEmails) {
              await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  templateName: "invoice-receipt",
                  recipientEmail: recipient,
                  branchId: branchId || invoice.branch_id,
                  idempotencyKey: `stripe-paid-${invoiceId}-${amountPaid}`,
                  templateData: {
                    invoiceNumber: invoice.invoice_number,
                    amountPaid: Number(amountPaid).toFixed(2),
                    currency: "RM",
                    paymentDate: new Date().toLocaleDateString(),
                    status: newStatus,
                    childName: student ? `${student.first_name} ${student.last_name}` : "",
                  },
                }),
              });
            }
          }
        } catch (emailErr) {
          console.error("Failed to send payment email:", emailErr);
        }

        console.log(`Payment processed: invoice ${invoiceId}, amount ${amountPaid}, status ${newStatus}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
