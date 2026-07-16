import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails";

interface EmailRequest {
  type:
    | "parent_invite"
    | "payment_reminder"
    | "payment_paid"
    | "announcement"
    | "newsletter"
    | "newsletter_composed"
    | "gap_intervention"
    | "welcome_credentials";
  to: string | string[];
  data: Record<string, any>;
  branchId?: string;
}

interface BrandConfig {
  brandName: string;
  brandColor: string;
  fromAddress: string;
  replyTo: string | null;
  footerText: string | null;
  branchAddress: string | null;
  logoUrl: string | null;
}

interface CustomTemplate {
  subject: string;
  heading: string;
  body_html: string;
  cta_text: string | null;
  cta_url: string | null;
  is_active: boolean;
}

function replaceVariables(text: string, data: Record<string, any>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value ?? ""));
  }
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, varName, content) => {
    return data[varName] ? content : "";
  });
  return result;
}

function buildLogoHtml(logoUrl: string | null, brandColor: string): string {
  if (!logoUrl) return "";
  return `<img src="${logoUrl}" alt="Logo" style="display:block;margin:0 auto 8px;max-height:40px;max-width:160px;" />`;
}

function buildEmailHtml(
  heading: string,
  bodyHtml: string,
  brand: BrandConfig,
  ctaText?: string | null,
  ctaUrl?: string | null
): string {
  const { brandName, brandColor, footerText, branchAddress, logoUrl } = brand;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${brandColor};padding:24px 32px;text-align:center;">
          ${buildLogoHtml(logoUrl, brandColor)}
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${brandName}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#18181b;font-size:18px;font-weight:600;">${heading}</h2>
          ${bodyHtml}
          ${ctaText && ctaUrl ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr><td align="center">
              <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${ctaText}</a>
            </td></tr>
          </table>` : ""}
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
          <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center;">
            © ${new Date().getFullYear()} ${brandName}. All rights reserved.
            ${branchAddress ? `<br>${branchAddress}` : ""}
            ${footerText ? `<br>${footerText}` : ""}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderContentBlocks(blocks: any[], brandColor: string): string {
  return blocks.map((block: any) => {
    switch (block.type) {
      case "heading":
        return `<h2 style="margin:16px 0 8px;color:#18181b;font-size:20px;font-weight:700;">${block.content || ""}</h2>`;
      case "text":
        return `<p style="color:#3f3f46;font-size:14px;line-height:1.7;white-space:pre-wrap;margin:8px 0;">${block.content || ""}</p>`;
      case "image":
        return `<div style="margin:16px 0;text-align:center;">
          ${block.url ? `<img src="${block.url}" alt="${block.caption || ""}" style="max-width:100%;border-radius:8px;" />` : ""}
          ${block.caption ? `<p style="color:#a1a1aa;font-size:12px;margin:6px 0 0;font-style:italic;">${block.caption}</p>` : ""}
        </div>`;
      case "button":
        return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          <tr><td align="center">
            <a href="${block.url || "#"}" style="display:inline-block;padding:12px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${block.text || "Click here"}</a>
          </td></tr>
        </table>`;
      case "divider":
        return `<hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />`;
      default:
        return "";
    }
  }).join("\n");
}

function getDefaultTemplate(type: string, data: Record<string, any>, brand: BrandConfig): { subject: string; html: string } {
  const { brandName } = brand;

  switch (type) {
    case "parent_invite":
      return {
        subject: `You're invited to join ${brandName} — ${data.studentName}'s class`,
        html: buildEmailHtml(
          "You're Invited! 🎉",
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            You've been invited to connect with <strong>${data.studentName}</strong>'s class at <strong>${data.branchName || brandName}</strong>.
          </p>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Join the platform to stay updated on your child's progress, receive announcements, and manage fees.
          </p>
          ${data.accessCode ? `
          <div style="margin:16px 0;padding:16px;background-color:#f5f3ff;border-radius:8px;text-align:center;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">Your Access Code</p>
            <p style="margin:0;color:${brand.brandColor};font-size:28px;font-weight:700;letter-spacing:4px;">${data.accessCode}</p>
          </div>` : ""}`,
          brand,
          "Accept Invitation",
          data.inviteUrl || "#"
        ),
      };

    case "payment_reminder":
      return {
        subject: `Payment Reminder — Invoice ${data.invoiceNumber} is overdue`,
        html: buildEmailHtml(
          "Payment Reminder ⏰",
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            This is a friendly reminder that the following invoice is past its due date:
          </p>
          <table width="100%" style="margin:16px 0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#fafafa;">
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Invoice</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#18181b;">${data.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Amount Due</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#dc2626;border-top:1px solid #e4e4e7;">RM ${Number(data.amountDue).toFixed(2)}</td>
            </tr>
            <tr style="background-color:#fafafa;">
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Due Date</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#18181b;border-top:1px solid #e4e4e7;">${data.dueDate}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Student</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#18181b;border-top:1px solid #e4e4e7;">${data.studentName || "—"}</td>
            </tr>
          </table>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Please make your payment at your earliest convenience to avoid any disruption.
          </p>`,
          brand,
          "Make Payment",
          data.paymentUrl || "#"
        ),
      };

    case "payment_paid":
      return {
        subject: `Payment Received — Invoice ${data.invoiceNumber}`,
        html: buildEmailHtml(
          "Payment Confirmed ✅",
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Thank you! We've received your payment for the following invoice:
          </p>
          <table width="100%" style="margin:16px 0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
            <tr style="background-color:#fafafa;">
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Invoice</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#18181b;">${data.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Amount Paid</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#16a34a;border-top:1px solid #e4e4e7;">RM ${Number(data.amountPaid).toFixed(2)}</td>
            </tr>
            <tr style="background-color:#fafafa;">
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Date</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#18181b;border-top:1px solid #e4e4e7;">${data.paymentDate || new Date().toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">Status</td>
              <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#16a34a;border-top:1px solid #e4e4e7;">${data.status === "paid" ? "Fully Paid" : "Partial Payment"}</td>
            </tr>
          </table>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            A receipt has been recorded in the system. Thank you for your prompt payment.
          </p>`,
          brand
        ),
      };

    case "announcement":
      return {
        subject: `📢 ${data.title}`,
        html: buildEmailHtml(
          data.title,
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;white-space:pre-wrap;">${data.body}</p>
          <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
            — ${data.authorName || "School Admin"}, ${data.branchName || brandName}
          </p>`,
          brand
        ),
      };

    case "newsletter":
      return {
        subject: `📰 ${data.title}`,
        html: buildEmailHtml(
          data.title,
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;white-space:pre-wrap;">${data.body}</p>
          <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
            — ${data.branchName || brandName} Newsletter
          </p>`,
          brand
        ),
      };

    case "gap_intervention": {
      const atHomeActivity = data.aiHomeActivity || `Practice ${data.gapSubject || "this skill"} with your child using everyday activities at home. For example, use play-based learning with household items to reinforce the concepts.`;
      return {
        subject: `🌱 ${data.studentName}'s Learning Journey — How You Can Help at Home`,
        html: buildEmailHtml(
          "Your Child's Learning Journey 🌱",
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Assalamualaikum / Dear Parent,
          </p>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            We've been closely observing <strong>${data.studentName}</strong>'s progress and have identified an area where a little extra support would be beneficial:
          </p>
          <div style="margin:16px 0;padding:16px;background-color:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
            <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:600;">AREA OF FOCUS</p>
            <p style="margin:0;color:#78350f;font-size:14px;font-weight:500;">${data.gapSubject || "General Learning"}: ${data.gapDescription}</p>
          </div>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            This is perfectly normal — every child develops at their own pace! Here's a simple activity you can try at home:
          </p>
          <div style="margin:16px 0;padding:16px;background-color:#ecfdf5;border-radius:8px;border-left:4px solid #10b981;">
            <p style="margin:0 0 4px;color:#065f46;font-size:12px;font-weight:600;">🏠 AT-HOME ACTIVITY</p>
            <p style="margin:0;color:#064e3b;font-size:14px;line-height:1.6;">${atHomeActivity}</p>
          </div>
          <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Our teachers are already incorporating targeted activities in the classroom. Together, we can support <strong>${data.studentName}</strong>'s growth beautifully. 💛
          </p>
          <p style="color:#a1a1aa;font-size:12px;margin-top:16px;">
            — With care, The ${data.schoolName || brand.brandName} Teaching Team
          </p>`,
          brand
        ),
      };
    }

    case "welcome_credentials": {
      const loginUrl = data.loginUrl || `https://sprouts.littlegreenhearts.com/auth`;
      return {
        subject: `Welcome to ${brand.brandName} — your login details`,
        html: buildEmailHtml(
          `Welcome${data.userName ? `, ${data.userName}` : ""}! 🌱`,
          `<p style="color:#3f3f46;font-size:14px;line-height:1.6;">
            Your account at <strong>${brand.brandName}</strong> has been created. You can now sign in to view your child's daily learning journey, photos, fees, school updates and chat with the teachers.
          </p>
          <div style="margin:18px 0;padding:18px;background-color:#f9fafb;border:1px solid #e4e4e7;border-radius:10px;">
            <p style="margin:0 0 6px;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Email</p>
            <p style="margin:0 0 14px;color:#18181b;font-size:14px;font-family:monospace;">${data.email}</p>
            <p style="margin:0 0 6px;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Temporary Password</p>
            <p style="margin:0;color:${brand.brandColor};font-size:18px;font-weight:700;font-family:monospace;letter-spacing:1px;">${data.temporaryPassword}</p>
          </div>
          <div style="margin:16px 0;padding:12px 14px;background-color:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;">
            <p style="margin:0;color:#78350f;font-size:13px;line-height:1.5;">
              <strong>For your security:</strong> you'll be asked to set your own password the first time you sign in.
            </p>
          </div>
          <p style="color:#3f3f46;font-size:13px;line-height:1.6;margin-top:18px;">
            If you didn't expect this email, you can safely ignore it or contact the school.
          </p>`,
          brand,
          "Sign in & set your password",
          loginUrl
        ),
      };
    }

    default:
      return {
        subject: "Notification",
        html: buildEmailHtml("Notification", `<p style="color:#3f3f46;font-size:14px;">${JSON.stringify(data)}</p>`, brand),
      };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;

  const resendApiKey =
    Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API_KEY_1");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!resendApiKey || !lovableApiKey) {
    console.error("Resend connector not configured (missing RESEND_API_KEY or LOVABLE_API_KEY)");
    return new Response(
      JSON.stringify({ success: false, error: "Email service not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { type, to, data, branchId } = (await req.json()) as EmailRequest;

    if (!type || !to) {
      throw new Error("Missing required fields: type, to");
    }

    // ─────────────────────────────────────────────────────────────────────
    // Forwarding shim: map legacy `type`s onto the React-Email registry
    // and forward through send-transactional-email so all parent-facing
    // mail goes through one branded pipeline (queue, overrides, suppression,
    // unsubscribe footer). Unmapped types fall through to the legacy raw-
    // HTML path below for backward compatibility.
    // LEGACY: remove the fallback once all callers are migrated.
    // ─────────────────────────────────────────────────────────────────────
    const mapToTemplate = (
      t: string,
      d: Record<string, any>
    ): { templateName: string; templateData: Record<string, any> } | null => {
      switch (t) {
        case "announcement":
          return {
            templateName: "school-announcement",
            templateData: {
              announcementTitle: d.title,
              announcementBody: d.body,
              category: d.category || "ANNOUNCEMENT",
              branchName: d.branchName || d.schoolName,
              attachmentUrl: d.attachmentUrl,
              attachmentLabel: d.attachmentLabel,
            },
          };
        case "newsletter":
          return {
            templateName: "school-announcement",
            templateData: {
              announcementTitle: d.title,
              announcementBody: d.body,
              category: "NEWSLETTER",
              branchName: d.branchName || d.schoolName,
            },
          };
        case "payment_reminder":
          return {
            templateName: "payment-reminder",
            templateData: {
              parentName: d.parentName,
              childName: d.studentName,
              invoiceNumber: d.invoiceNumber,
              amount: d.amountDue != null ? Number(d.amountDue).toFixed(2) : undefined,
              currency: d.currency || "RM",
              dueDate: d.dueDate,
              daysOverdue: d.daysOverdue,
              stage: d.stage || "overdue_3",
              payUrl: d.paymentUrl,
              branchName: d.branchName || d.schoolName,
            },
          };
        case "payment_paid":
          return {
            templateName: "invoice-receipt",
            templateData: {
              parentName: d.parentName,
              childName: d.studentName,
              invoiceNumber: d.invoiceNumber,
              amountPaid: d.amountPaid != null ? Number(d.amountPaid).toFixed(2) : undefined,
              currency: d.currency || "RM",
              balance: d.balance != null ? Number(d.balance).toFixed(2) : undefined,
              paymentMethod: d.paymentMethod,
              paymentDate: d.paymentDate,
              receiptUrl: d.receiptUrl,
              branchName: d.branchName || d.schoolName,
            },
          };
        case "welcome_credentials":
        case "parent_invite":
          return {
            templateName: "parent-welcome-kit",
            templateData: {
              parentName: d.userName || d.parentName,
              childName: d.studentName || d.childName,
              branchName: d.branchName || d.schoolName,
              loginEmail: d.email,
              tempPassword: d.temporaryPassword,
              loginUrl: d.loginUrl || d.inviteUrl,
              welcomeKitUrl: d.welcomeKitUrl,
            },
          };
        default:
          return null; // newsletter_composed, gap_intervention → legacy path
      }
    };

    const mapped = mapToTemplate(type, data || {});
    if (mapped) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const recipients = Array.isArray(to) ? to : [to];
      const results: any[] = [];
      for (const recipient of recipients) {
        try {
          const r = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              templateName: mapped.templateName,
              recipientEmail: recipient,
              idempotencyKey: data?.idempotencyKey,
              templateData: { ...mapped.templateData, branchId: branchId || data?.branchId },
            }),
          });
          const body = await r.json().catch(() => ({}));
          results.push({
            recipient,
            status: r.ok ? "sent" : "failed",
            id: body?.id || body?.messageId,
            via: "send-transactional-email",
            error: r.ok ? undefined : body,
          });
        } catch (e) {
          results.push({ recipient, status: "failed", error: String(e) });
        }
      }
      console.log(`📧 [shim] forwarded ${results.length} ${type} → ${mapped.templateName}`);
      return new Response(
        JSON.stringify({ success: results.every((x) => x.status === "sent"), results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brand: BrandConfig = {
      brandName: data.schoolName || "Sprouts",
      brandColor: "#7c3aed",
      fromAddress: "Sprouts <notify@sprouts.littlegreenhearts.com>",
      replyTo: "admin@sprouts.littlegreenhearts.com",
      footerText: null,
      branchAddress: null,
      logoUrl: null,
    };

    let customTemplate: CustomTemplate | null = null;

    if (branchId) {
      const [branchRes, settingsRes, templateRes] = await Promise.all([
        adminClient
          .from("branches")
          .select("name, address, organizations(name)")
          .eq("id", branchId)
          .single(),
        adminClient
          .from("branch_settings")
          .select("school_display_name, email_sender_name, email_brand_color, email_from_address, email_reply_to, email_footer_text, logo_url")
          .eq("branch_id", branchId)
          .maybeSingle(),
        adminClient
          .from("email_templates")
          .select("subject, heading, body_html, cta_text, cta_url, is_active")
          .eq("branch_id", branchId)
          .eq("template_type", type)
          .maybeSingle(),
      ]);

      const branchData = branchRes.data;
      const settings = settingsRes.data;

      if (branchData) {
        data.branchName = branchData.name;
        data.branchAddress = branchData.address;
        const orgName = (branchData as any).organizations?.name;

        brand.brandName = settings?.email_sender_name
          || settings?.school_display_name
          || orgName
          || branchData.name;
        brand.branchAddress = branchData.address;
        data.schoolName = brand.brandName;
      }

      if (settings) {
        if (settings.email_brand_color) brand.brandColor = settings.email_brand_color;
        if (settings.email_from_address) brand.fromAddress = `${brand.brandName} <${settings.email_from_address}>`;
        if (settings.email_reply_to) brand.replyTo = settings.email_reply_to;
        if (settings.email_footer_text) brand.footerText = settings.email_footer_text;
        if (settings.logo_url) brand.logoUrl = settings.logo_url;
      }

      if (templateRes.data && templateRes.data.is_active) {
        customTemplate = templateRes.data;
      }
    }

    data.brandName = brand.brandName;

    // For gap_intervention, generate AI-powered at-home activity
    if (type === "gap_intervention" && !data.aiHomeActivity) {
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY) {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: "You are a warm, encouraging early childhood educator in Malaysia. Suggest ONE simple, fun at-home activity a parent can do with their preschool child. Keep it under 3 sentences. Use everyday household items. Be culturally relevant." },
                { role: "user", content: `The child needs help with: ${data.gapSubject || "General"} — ${data.gapDescription || "foundational skills"}. Suggest a play-based home activity.` },
              ],
              temperature: 0.8,
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            data.aiHomeActivity = aiData.choices?.[0]?.message?.content || undefined;
          }
        }
      } catch (e) {
        console.log("AI home activity generation failed, using fallback:", e);
      }
    }

    let subject: string;
    let html: string;

    if (type === "newsletter_composed") {
      // Render content blocks into email HTML
      const blocks = data.content_blocks || [];
      const bodyHtml = renderContentBlocks(blocks, brand.brandColor);
      subject = data.subject || `📰 Newsletter from ${brand.brandName}`;
      html = buildEmailHtml("", bodyHtml, brand);
    } else if (customTemplate) {
      subject = replaceVariables(customTemplate.subject, data);
      const heading = replaceVariables(customTemplate.heading, data);
      const bodyHtml = replaceVariables(customTemplate.body_html, data);
      const ctaText = customTemplate.cta_text ? replaceVariables(customTemplate.cta_text, data) : null;
      const ctaUrl = customTemplate.cta_url ? replaceVariables(customTemplate.cta_url, data) : null;
      html = buildEmailHtml(heading, bodyHtml, brand, ctaText, ctaUrl);
    } else {
      const defaultResult = getDefaultTemplate(type, data, brand);
      subject = defaultResult.subject;
      html = defaultResult.html;
    }

    const recipients = Array.isArray(to) ? to : [to];

    const results = [];
    for (const recipient of recipients) {
      const emailPayload: Record<string, any> = {
        from: brand.fromAddress,
        to: [recipient],
        subject,
        html,
      };
      if (brand.replyTo) {
        emailPayload.reply_to = brand.replyTo;
      }

      const resendRes = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": resendApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      const resendData = await resendRes.json();
      const status = resendRes.ok ? "sent" : "failed";

      await adminClient.from("email_logs").insert({
        recipient,
        email_type: type,
        subject,
        status,
        error_message: resendRes.ok ? null : JSON.stringify(resendData),
        metadata: { ...data, resend_id: resendData.id },
        branch_id: branchId || null,
      });

      results.push({ recipient, status, id: resendData.id });
    }

    console.log(`📧 Sent ${results.length} ${type} email(s)`);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send email error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
