/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  approverName?: string; requesterName?: string
  requestType?: string  // 'Overtime' | 'Claim' | 'Leave' | 'Invoice cancellation' etc.
  summary?: string      // short one-line description
  details?: Array<{ label: string; value: string }>
  inboxUrl?: string; companyName?: string
  intro?: string; ctaLabel?: string; signoff?: string
}

const Email = ({
  approverName, requesterName = 'A team member', requestType = 'Request',
  summary, details = [], inboxUrl = brand.appUrl + '/approval-inbox',
  companyName = 'Sprouts', intro, ctaLabel = 'Review request', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{requestType} pending your approval — {requesterName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={{ ...s.heroBox, backgroundColor: '#fffbeb' }}>
          <Text style={{ ...s.amountLabel, color: brand.warning }}>ACTION NEEDED</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>
            ⏳ {requestType} awaiting approval
          </Heading>
          <Text style={s.smallText}>from {requesterName}</Text>
        </Section>
        <Text style={s.text}>
          {intro || `Hi${approverName ? ` ${approverName}` : ''}, a new ${requestType.toLowerCase()} request needs your review.`}
        </Text>
        {summary && (
          <Section style={s.card}>
            <Text style={s.rowLabel}>Summary</Text>
            <Text style={s.rowValue}>{summary}</Text>
          </Section>
        )}
        {details.length > 0 && (
          <Section style={s.card}>
            {details.map((d, i) => (
              <Section key={i} style={i < details.length - 1 ? s.row : { ...s.row, borderBottom: 'none' }}>
                <Text style={s.rowLabel}>{d.label}</Text>
                <Text style={s.rowValue}>{d.value}</Text>
              </Section>
            ))}
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={inboxUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— ${companyName} HR`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ requestType, requesterName }: Props) =>
    `${requestType || 'Request'} awaiting your approval — ${requesterName || ''}`,
  displayName: 'Approval Pending (Approver)',
  previewData: {
    approverName: 'Pooja', requesterName: 'Nadia', requestType: 'Overtime',
    summary: '2.5h OT on 02 Jun 2026', companyName: 'Little Green Hearts',
    details: [
      { label: 'Date', value: '02 Jun 2026' },
      { label: 'Hours', value: '2.5 h' },
      { label: 'Reason', value: 'Late pickup coverage' },
    ],
  } as Props,
} satisfies TemplateEntry