/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Button,
  Heading,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

export interface AttachedDoc {
  id?: string
  title: string
  description?: string | null
  url: string
}

/**
 * Renders documents the admin attached to a template from the PDF
 * Repository. Renders nothing when there are no documents so older
 * templates keep their existing layout.
 */
export const AttachedDocsSection = ({
  docs,
  heading = 'Attached documents',
  intro,
}: {
  docs?: AttachedDoc[]
  heading?: string
  intro?: string
}) => {
  if (!docs || docs.length === 0) return null
  return (
    <Section style={wrap}>
      <Text style={eyebrow}>DOCUMENTS</Text>
      <Heading as="h3" style={h3}>{heading}</Heading>
      {intro ? <Text style={introStyle}>{intro}</Text> : null}
      {docs.map((d, i) => (
        <Section key={d.id || d.url || i} style={item}>
          <Text style={itemTitle}>{d.title}</Text>
          {d.description ? <Text style={itemDesc}>{d.description}</Text> : null}
          <Button style={btn} href={d.url}>Download PDF</Button>
        </Section>
      ))}
    </Section>
  )
}

const wrap = { padding: '24px', backgroundColor: '#ffffff', border: '1px solid #ede9fe', borderRadius: '16px', marginTop: '24px' }
const eyebrow = { fontSize: '11px', fontWeight: '700' as const, color: '#7c3aed', letterSpacing: '0.2em', margin: '0 0 8px' }
const h3 = { fontSize: '18px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 12px' }
const introStyle = { fontSize: '14px', color: '#4a4458', lineHeight: '1.6', margin: '0 0 16px' }
const item = { padding: '14px 0', borderTop: '1px solid #f1edff' }
const itemTitle = { fontSize: '15px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 4px' }
const itemDesc = { fontSize: '13px', color: '#6b6478', lineHeight: '1.5', margin: '0 0 10px' }
const btn = { backgroundColor: '#7c3aed', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '10px', padding: '10px 20px', textDecoration: 'none', display: 'inline-block' }