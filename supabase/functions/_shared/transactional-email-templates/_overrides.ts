// Helper to resolve admin-set per-template content overrides.
// Used by send-transactional-email to merge admin custom copy into templateData,
// and to check enabled flags + subject overrides.
import { createClient } from 'npm:@supabase/supabase-js@2'

export interface TemplateOverride {
  enabled: boolean
  subject: string | null
  content_overrides: Record<string, string>
  attached_document_ids: string[]
}

export interface GlobalEmailSettings {
  from_name: string
  reply_to_email: string | null
  support_email: string | null
}

let cachedSupabase: ReturnType<typeof createClient> | null = null
function getClient() {
  if (cachedSupabase) return cachedSupabase
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  cachedSupabase = createClient(url, key)
  return cachedSupabase
}

export async function loadTemplateOverride(
  templateName: string
): Promise<TemplateOverride> {
  const supabase = getClient()
  const { data } = await supabase
    .from('email_template_overrides')
    .select('enabled, subject, content_overrides, attached_document_ids')
    .eq('template_name', templateName)
    .maybeSingle()
  return {
    enabled: data?.enabled ?? true,
    subject: data?.subject ?? null,
    content_overrides: (data?.content_overrides as Record<string, string>) ?? {},
    attached_document_ids: ((data as any)?.attached_document_ids as string[]) ?? [],
  }
}

export interface AttachedDocument {
  id: string
  title: string
  description: string | null
  url: string
}

export async function loadAttachedDocuments(
  ids: string[]
): Promise<AttachedDocument[]> {
  if (!ids || ids.length === 0) return []
  const supabase = getClient()
  const { data, error } = await supabase
    .from('email_documents')
    .select('id, title, description, file_url')
    .in('id', ids)
  if (error || !data) return []
  // Preserve admin-defined order
  const byId = new Map(
    (data as any[]).map((d) => [d.id as string, d])
  )
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      url: d.file_url,
    }))
}

export async function loadGlobalEmailSettings(): Promise<GlobalEmailSettings> {
  const supabase = getClient()
  const { data } = await supabase
    .from('email_global_settings')
    .select('from_name, reply_to_email, support_email')
    .eq('singleton', true)
    .maybeSingle()
  return {
    from_name: data?.from_name ?? 'Sprouts',
    reply_to_email: data?.reply_to_email ?? null,
    support_email: data?.support_email ?? 'hello@littlegreenhearts.com',
  }
}

// Merge admin overrides into templateData. Admin values win when set
// (non-empty string). Template components should read from props with
// sensible defaults so unset keys keep their built-in copy.
export function mergeOverrides(
  templateData: Record<string, any>,
  overrides: Record<string, string>
): Record<string, any> {
  const merged = { ...templateData }
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (typeof v === 'string' && v.trim().length > 0) {
      merged[k] = v
    }
  }
  return merged
}