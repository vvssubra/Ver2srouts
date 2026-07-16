import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import {
  loadTemplateOverride,
  loadGlobalEmailSettings,
  mergeOverrides,
} from '../_shared/transactional-email-templates/_overrides.ts'

// Renders a single template with admin overrides + previewData applied.
// Returns the same HTML that Resend would send, plus the resolved subject.
// Auth: verify_jwt = true (callers must be signed-in admins; gated by the UI).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  let templateName: string
  let extraData: Record<string, unknown> = {}
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    if (body.templateData && typeof body.templateData === 'object') {
      extraData = body.templateData
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    return new Response(
      JSON.stringify({ error: `Template '${templateName}' not found` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const [overrideRow, globalSettings] = await Promise.all([
    loadTemplateOverride(templateName),
    loadGlobalEmailSettings(),
  ])

  const data = mergeOverrides(
    { ...(template.previewData ?? {}), ...extraData },
    overrideRow.content_overrides
  )

  const html = await renderAsync(React.createElement(template.component, data))

  const subject =
    overrideRow.subject && overrideRow.subject.trim().length > 0
      ? overrideRow.subject
      : typeof template.subject === 'function'
        ? template.subject(data)
        : template.subject

  return new Response(
    JSON.stringify({
      templateName,
      displayName: template.displayName ?? templateName,
      subject,
      html,
      enabled: overrideRow.enabled,
      fromName: globalSettings.from_name,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})