import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import {
  loadTemplateOverride,
  loadGlobalEmailSettings,
  mergeOverrides,
  loadAttachedDocuments,
} from '../_shared/transactional-email-templates/_overrides.ts'

// Emails are sent directly via Resend. The "from" address comes from
// email_global_settings.from_email (set by admins in the Email Hub).
// Default fallback uses Resend's universally-verified sandbox sender so the
// system still delivers if no custom domain has been verified in Resend yet.
const DEFAULT_SITE_NAME = "Sprouts"
// Verified Resend domain — required to send to recipients other than the
// account owner. Admins can override via email_global_settings.from_email.
const DEFAULT_FROM_EMAIL = "noreply@sprouts.littlegreenhearts.com"
const RESEND_API_URL = "https://connector-gateway.lovable.dev/resend/emails"

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: this function uses verify_jwt = true in config.toml, so Supabase's
// gateway validates the caller's JWT (anon or service_role) before the request
// reaches this code. No in-function auth check is needed.

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey =
    Deno.env.get('RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY_1')
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!resendApiKey || !lovableApiKey) {
    console.error('Resend connector not configured (missing RESEND_API_KEY or LOVABLE_API_KEY)')
    return new Response(
      JSON.stringify({ error: 'Email provider is not configured (missing Resend API key).' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    idempotencyKey = body.idempotencyKey || body.idempotency_key || crypto.randomUUID()
    // Keep the provider request body stable for idempotent retries. Previously
    // messageId was random even when idempotencyKey was stable, which changed
    // the X-Entity-Ref-ID header inside the provider payload and caused 409
    // invalid_idempotent_request errors on retry.
    messageId = body.messageId || body.message_id || idempotencyKey
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Load admin overrides + global settings before resolving recipient/subject/data.
  const [overrideRow, globalSettings] = await Promise.all([
    loadTemplateOverride(templateName),
    loadGlobalEmailSettings(),
  ])

  if (!overrideRow.enabled) {
    console.log('Template disabled by admin', { templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'disabled_by_admin' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Master kill-switch: when admin has paused all outgoing emails project-wide.
  if ((globalSettings as any).emails_enabled === false) {
    console.log('All emails paused by admin master switch', { templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'emails_disabled_globally' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Merge admin content overrides into templateData. Admin values win when set.
  templateData = mergeOverrides(templateData, overrideRow.content_overrides)

  const SITE_NAME = globalSettings.from_name || DEFAULT_SITE_NAME
  const FROM_EMAIL =
    (globalSettings as any).from_email?.trim() || DEFAULT_FROM_EMAIL
  const REPLY_TO = globalSettings.reply_to_email?.trim() || undefined

  // Inject documents from the PDF Repository that the admin has attached to
  // this template. They become `attachedDocuments` on templateData and any
  // template can render them via a shared section.
  const attachedDocuments = await loadAttachedDocuments(overrideRow.attached_document_ids)
  if (attachedDocuments.length > 0 && !templateData.attachedDocuments) {
    templateData.attachedDocuments = attachedDocuments
  }

  // Backwards compatibility for parent-welcome-kit: if no explicit
  // welcomeKitUrl is provided, fall back to the first attached document,
  // then the legacy singleton `welcome_kit_url`.
  if (templateName === 'parent-welcome-kit' && !templateData.welcomeKitUrl) {
    if (attachedDocuments[0]?.url) {
      templateData.welcomeKitUrl = attachedDocuments[0].url
    } else {
      const legacyUrl = (globalSettings as any).welcome_kit_url
      if (legacyUrl && typeof legacyUrl === 'string' && legacyUrl.trim().length > 0) {
        templateData.welcomeKitUrl = legacyUrl.trim()
      }
    }
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1b. Idempotency pre-check — if a previous request with the same
  // message_id already produced a pending/sent row, skip this attempt
  // entirely. Prevents duplicate emails when callers (e.g. bulk-save +
  // per-student save in Attendance) fire the same trigger twice.
  try {
    const { data: existing } = await supabase
      .from('email_send_log')
      .select('id, status')
      .eq('message_id', messageId)
      .in('status', ['pending', 'sent'])
      .limit(1)
      .maybeSingle()
    if (existing) {
      console.log('Duplicate email skipped (idempotency)', {
        messageId,
        templateName,
        existingStatus: (existing as any).status,
      })
      return new Response(
        JSON.stringify({ success: true, reason: 'duplicate_skipped' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (e) {
    // best-effort — proceed to send if precheck fails
    console.warn('Idempotency precheck failed (continuing)', e)
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  let unsubscribeToken: string

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      return new Response(
        JSON.stringify({ error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn('Unsubscribe token already used but email not suppressed', {
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message:
        'Unsubscribe token used but email missing from suppressed list',
    })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    overrideRow.subject && overrideRow.subject.trim().length > 0
      ? overrideRow.subject
      : typeof template.subject === 'function'
        ? template.subject(templateData)
        : template.subject

  // 5. Send directly via Resend.
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const fromHeader = `${SITE_NAME} <${FROM_EMAIL}>`
  const resendPayload: Record<string, unknown> = {
    from: fromHeader,
    to: [effectiveRecipient],
    subject: resolvedSubject,
    html,
    text: plainText,
    headers: {
      'X-Entity-Ref-ID': messageId,
      'X-Idempotency-Key': idempotencyKey,
    },
  }
  if (REPLY_TO) resendPayload.reply_to = REPLY_TO

  let resendResponse: Response
  try {
    resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': resendApiKey,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(resendPayload),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Resend request failed', { error: message, templateName })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: `Network error: ${message}`,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to reach email provider', details: message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const resendBody = await resendResponse.text()
  if (!resendResponse.ok) {
    console.error('Resend returned error', {
      status: resendResponse.status,
      body: resendBody,
      templateName,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: `Resend ${resendResponse.status}: ${resendBody.slice(0, 500)}`,
    })
    return new Response(
      JSON.stringify({
        error: 'Email provider rejected the send',
        status: resendResponse.status,
        details: resendBody,
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let providerId: string | null = null
  try {
    const parsed = JSON.parse(resendBody)
    providerId = parsed?.id ?? null
  } catch {
    // ignore parse errors
  }

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'sent',
    error_message: providerId ? `resend_id=${providerId}` : null,
  })

  console.log('Transactional email sent via Resend', {
    templateName,
    effectiveRecipient,
    providerId,
  })

  return new Response(
    JSON.stringify({ success: true, sent: true, provider: 'resend', providerId }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
