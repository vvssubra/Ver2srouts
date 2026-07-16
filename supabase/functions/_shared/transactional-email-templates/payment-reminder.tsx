/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

type Stage = 'upcoming' | 'due_today' | 'overdue_3' | 'overdue_7' | 'overdue_14'

interface Props {
  parentName?: string; childName?: string; invoiceNumber?: string
  amount?: string; currency?: string; dueDate?: string
  daysOverdue?: number; stage?: Stage; payUrl?: string; branchName?: string
  intro?: string; ctaLabel?: string; signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const stageMeta: Record<Stage, { tone: string; bg: string; eyebrow: string; heading: string }> = {
  upcoming: { tone: brand.primary, bg: '#f5f3ff', eyebrow: 'UPCOMING', heading: 'Friendly reminder' },
  due_today: { tone: brand.warning, bg: '#fffbeb', eyebrow: 'DUE TODAY', heading: 'Payment due today' },
  overdue_3: { tone: brand.warning, bg: '#fff7ed', eyebrow: '3 DAYS OVERDUE', heading: 'Your invoice is overdue' },
  overdue_7: { tone: brand.danger, bg: '#fef2f2', eyebrow: '7 DAYS OVERDUE', heading: 'Outstanding payment needed' },
  overdue_14: { tone: brand.danger, bg: '#fef2f2', eyebrow: '14 DAYS OVERDUE', heading: 'Urgent — payment overdue' },
}

const Email = ({
  parentName, childName, invoiceNumber, amount = '0.00', currency = 'RM',
  dueDate, stage = 'upcoming', payUrl = brand.appUrl + '/fees',
  branchName = 'Sprouts', intro, ctaLabel = 'Pay now', signoff,  attachedDocuments,
}: Props) => {
  const m = stageMeta[stage]
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{m.heading} — {currency} {amount}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Text style={s.brandMark}>{brand.brandLabel}</Text>
          <Section style={{ ...s.heroBox, backgroundColor: m.bg }}>
            <Text style={{ ...s.amountLabel, color: m.tone }}>{m.eyebrow}</Text>
            <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>{m.heading}</Heading>
            <Text style={s.amount}>{currency} {amount}</Text>
            {dueDate && <Text style={s.smallText}>Due {dueDate}</Text>}
          </Section>
          <Text style={s.text}>
            {intro ||
              `Hi${parentName ? ` ${parentName}` : ''}, this is a reminder for invoice ${invoiceNumber || ''}${childName ? ` for ${childName}` : ''}. You can settle it quickly through the app.`}
          </Text>
          <Section style={{ textAlign: 'center', margin: '16px 0' }}>
            <Button style={{ ...s.button, backgroundColor: m.tone }} href={payUrl}>{ctaLabel}</Button>
          </Section>
          <Hr style={s.hr} />
          <Text style={s.footer}>
            Already paid? Please ignore this message — receipts can take a few minutes to reflect.
          </Text>
          <Text style={s.footer}>
            Need help? <Link href={`mailto:${brand.supportEmail}`} style={s.link}>{brand.supportEmail}</Link>
          </Text>
          <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
                <AttachedDocsSection docs={attachedDocuments} />
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: ({ stage, invoiceNumber, currency, amount }: Props) => {
    const tag = stage === 'upcoming' ? 'Upcoming' : stage === 'due_today' ? 'Due today' : `${stage?.replace('overdue_', '')}d overdue`
    return `${tag}: ${currency || 'RM'} ${amount || ''} — ${invoiceNumber || 'invoice'}`
  },
  displayName: 'Payment Reminder',
  previewData: {
    parentName: 'Aisha', childName: 'Ahmad', invoiceNumber: 'INV-2026-00123',
    amount: '450.00', currency: 'RM', dueDate: '15 Jun 2026', stage: 'overdue_3',
    branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry