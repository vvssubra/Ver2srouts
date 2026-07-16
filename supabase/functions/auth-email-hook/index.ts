import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { Resend } from 'npm:resend'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = "bloomngrow"
const ROOT_DOMAIN = "sprouts.littlegreenhearts.com"
const FROM_DOMAIN = "sprouts.littlegreenhearts.com"
const FROM_EMAIL = `noreply@${FROM_DOMAIN}`
const FROM_HEADER = `${SITE_NAME} <${FROM_EMAIL}>`

// Sample data for preview mode ONLY (not used in actual email sending).
const SAMPLE_PROJECT_URL = "https://bloomngrow.lovable.app"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  // Preview is dev-only; no secrets required. Do not send email here.

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]

  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// Best-effort logger. Swallows errors so email sending is never blocked by schema drift.
async function logSend(
  supabase: ReturnType<typeof createClient> | null,
  row: {
    message_id: string
    template_name: string
    recipient_email: string
    status: 'pending' | 'sent' | 'failed'
    error_message?: string | null
  },
) {
  if (!supabase) return
  try {
    const { error } = await supabase.from('email_send_log').insert(row as any)
    if (error) console.warn('email_send_log insert failed (non-fatal)', { error: error.message })
  } catch (err) {
    console.warn('email_send_log insert threw (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function buildVerifyUrl(email_data: any): string {
  const site = String(email_data.site_url || '').replace(/\/$/, '')
  const redirect = email_data.redirect_to || email_data.site_url || ''
  return `${site}/auth/v1/verify?token_hash=${encodeURIComponent(
    email_data.token_hash,
  )}&type=${encodeURIComponent(email_data.email_action_type)}&redirect_to=${encodeURIComponent(
    redirect,
  )}`
}

function buildVerifyUrlWith(
  email_data: any,
  tokenHash: string,
  redirectOverride?: string,
): string {
  const site = String(email_data.site_url || '').replace(/\/$/, '')
  const redirect = redirectOverride ?? email_data.redirect_to ?? email_data.site_url ?? ''
  return `${site}/auth/v1/verify?token_hash=${encodeURIComponent(
    tokenHash,
  )}&type=${encodeURIComponent(email_data.email_action_type)}&redirect_to=${encodeURIComponent(
    redirect,
  )}`
}

async function renderAndSend(params: {
  resend: Resend
  supabase: ReturnType<typeof createClient> | null
  emailType: string
  recipient: string
  props: Record<string, unknown>
}): Promise<{ ok: true; id: string | null } | { ok: false; status: number; error: string }> {
  const { resend, supabase, emailType, recipient, props } = params
  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    return { ok: false, status: 400, error: `Unknown email type: ${emailType}` }
  }
  const subject = EMAIL_SUBJECTS[emailType] || 'Notification'
  const messageId = crypto.randomUUID()

  const html = await renderAsync(React.createElement(EmailTemplate, props))
  const text = await renderAsync(React.createElement(EmailTemplate, props), { plainText: true })

  await logSend(supabase, {
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipient,
    status: 'pending',
  })

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_HEADER,
      to: [recipient],
      subject,
      html,
      text,
      headers: { 'X-Entity-Ref-ID': messageId },
    })
    if (error) {
      const msg = typeof error === 'string' ? error : (error as any).message || JSON.stringify(error)
      await logSend(supabase, {
        message_id: messageId,
        template_name: emailType,
        recipient_email: recipient,
        status: 'failed',
        error_message: `resend_error: ${msg}`.slice(0, 500),
      })
      console.error('Resend rejected message', { emailType, error: msg })
      return { ok: false, status: 502, error: 'Email provider rejected the message' }
    }
    const providerId = data?.id ?? null
    await logSend(supabase, {
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipient,
      status: 'sent',
      error_message: providerId ? `resend_id=${providerId}` : null,
    })
    console.log('Auth email sent via Resend', { emailType, recipient, providerId })
    return { ok: true, id: providerId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logSend(supabase, {
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipient,
      status: 'failed',
      error_message: `network_error: ${message}`.slice(0, 500),
    })
    console.error('Resend request threw', { emailType, error: message })
    return { ok: false, status: 502, error: 'Failed to reach email provider' }
  }
}

// Native Supabase Send Email Hook — verified with standardwebhooks, sent via Resend SDK.
async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rawSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!rawSecret || !resendApiKey) {
    console.error('Auth email hook missing required secrets', {
      has_send_email_hook_secret: !!rawSecret,
      has_resend_api_key: !!resendApiKey,
    })
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Supabase issues the hook secret as "v1,whsec_XXXX". standardwebhooks expects just the base64 body.
  const hookSecret = rawSecret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')

  const body = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))

  let payload: any
  try {
    const wh = new Webhook(hookSecret)
    payload = wh.verify(body, headers)
  } catch (err) {
    console.error('Webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const user = payload?.user ?? {}
  const email_data = payload?.email_data ?? {}
  const emailType: string = email_data.email_action_type
  const currentEmail: string = user.email
  const newEmail: string | undefined = user.new_email

  if (!emailType || !currentEmail) {
    console.error('Missing required payload fields', { emailType, hasEmail: !!currentEmail })
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const resend = new Resend(resendApiKey)
  const supabase = (() => {
    try {
      const url = Deno.env.get('SUPABASE_URL')
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      return url && key ? createClient(url, key) : null
    } catch {
      return null
    }
  })()

  const baseProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
  }

  // Handle email_change specially: potentially two recipients with distinct tokens.
  if (emailType === 'email_change') {
    const hasBoth =
      email_data.token && email_data.token_hash && email_data.token_new && email_data.token_hash_new

    const sends: Array<Promise<any>> = []

    if (hasBoth) {
      // Secure email change: send to BOTH current and new email.
      // Per Supabase spec: current email verifies with token_hash_new; new email verifies with token_hash.
      sends.push(
        renderAndSend({
          resend,
          supabase,
          emailType,
          recipient: currentEmail,
          props: {
            ...baseProps,
            recipient: currentEmail,
            email: currentEmail,
            oldEmail: currentEmail,
            newEmail: newEmail || currentEmail,
            confirmationUrl: buildVerifyUrlWith(email_data, email_data.token_hash_new),
            token: email_data.token,
          },
        }),
      )
      if (newEmail) {
        sends.push(
          renderAndSend({
            resend,
            supabase,
            emailType,
            recipient: newEmail,
            props: {
              ...baseProps,
              recipient: newEmail,
              email: newEmail,
              oldEmail: currentEmail,
              newEmail,
              confirmationUrl: buildVerifyUrlWith(email_data, email_data.token_hash),
              token: email_data.token_new,
            },
          }),
        )
      }
    } else {
      // Non-secure email change: single email to the new address.
      const recipient = newEmail || currentEmail
      sends.push(
        renderAndSend({
          resend,
          supabase,
          emailType,
          recipient,
          props: {
            ...baseProps,
            recipient,
            email: recipient,
            oldEmail: currentEmail,
            newEmail: newEmail || currentEmail,
            confirmationUrl: buildVerifyUrl(email_data),
            token: email_data.token,
          },
        }),
      )
    }

    const results = await Promise.all(sends)
    const failure = results.find((r) => r.ok === false) as
      | { ok: false; status: number; error: string }
      | undefined
    if (failure) {
      return new Response(JSON.stringify({ error: failure.error }), {
        status: failure.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // All other flows: single email to user.email.
  let props: Record<string, unknown>
  if (emailType === 'reauthentication') {
    props = {
      ...baseProps,
      recipient: currentEmail,
      email: currentEmail,
      token: email_data.token,
    }
  } else {
    props = {
      ...baseProps,
      recipient: currentEmail,
      email: currentEmail,
      confirmationUrl: buildVerifyUrl(email_data),
      token: email_data.token,
    }
  }

  const result = await renderAndSend({
    resend,
    supabase,
    emailType,
    recipient: currentEmail,
    props,
  })

  if (result.ok === false) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Handle CORS preflight for main endpoint
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  // Main webhook handler
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
