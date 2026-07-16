/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { brand, styles as s } from './_brand.ts'

export type RequestStatus = 'approved' | 'rejected' | 'pending'

const statusMeta: Record<RequestStatus, { color: string; bg: string; label: string; emoji: string }> = {
  approved: { color: brand.success, bg: '#ecfdf5', label: 'APPROVED', emoji: '✅' },
  rejected: { color: brand.danger, bg: '#fef2f2', label: 'REJECTED', emoji: '❌' },
  pending: { color: brand.warning, bg: '#fffbeb', label: 'PENDING', emoji: '⏳' },
}

export interface StatusRow { label: string; value: string }

export interface StatusEmailProps {
  recipientName?: string
  category: string
  status: RequestStatus
  headline: string
  intro?: string
  rows: StatusRow[]
  approverNote?: string
  actionUrl?: string
  ctaLabel?: string
  signoff?: string
  companyName?: string
}

export function StatusEmail({
  recipientName, category, status, headline, intro, rows, approverNote,
  actionUrl = brand.appUrl, ctaLabel = 'Open in app', signoff,
  companyName = 'Sprouts',
}: StatusEmailProps) {
  const m = statusMeta[status]
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{category} {m.label.toLowerCase()} {m.emoji}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Text style={s.brandMark}>{brand.brandLabel}</Text>
          <Section style={{ ...s.heroBox, backgroundColor: m.bg }}>
            <Text style={{ ...s.amountLabel, color: m.color }}>{category} · {m.label}</Text>
            <Heading style={{ ...s.h1, margin: '8px 0 0' }}>{m.emoji} {headline}</Heading>
          </Section>
          <Text style={s.text}>
            {intro || `Hi${recipientName ? ` ${recipientName}` : ''}, here are the details of your ${category.toLowerCase()} request.`}
          </Text>
          <Section style={s.card}>
            {rows.map((r, i) => (
              <Section key={i} style={i < rows.length - 1 ? s.row : { ...s.row, borderBottom: 'none' }}>
                <Text style={s.rowLabel}>{r.label}</Text>
                <Text style={s.rowValue}>{r.value}</Text>
              </Section>
            ))}
          </Section>
          {approverNote && (
            <Section style={s.card}>
              <Text style={s.rowLabel}>Note from approver</Text>
              <Text style={{ ...s.text, margin: '4px 0 0', fontStyle: 'italic' }}>"{approverNote}"</Text>
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '20px 0' }}>
            <Button style={{ ...s.button, backgroundColor: m.color }} href={actionUrl}>{ctaLabel}</Button>
          </Section>
          <Hr style={s.hr} />
          <Text style={s.signoff}>{signoff || `— ${companyName} HR`}</Text>
        </Container>
      </Body>
    </Html>
  )
}