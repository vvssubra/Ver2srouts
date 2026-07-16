/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

interface Props {
  parentName?: string
  childName?: string
  date?: string           // "Thu, 4 Jun 2026"
  branchName?: string
  reason?: string         // "absent" | "sick" | etc.
  contactUrl?: string
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  parentName, childName = 'your child', date, branchName,
  reason, contactUrl = brand.appUrl + '/messages',
  companyName = 'Sprouts', intro, ctaLabel = 'Message the school', signoff,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{childName} was marked absent{date ? ` on ${date}` : ''}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={{ ...s.heroBox, backgroundColor: '#fffbeb' }}>
          <Text style={{ ...s.amountLabel, color: brand.warning }}>ATTENDANCE</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>
            🌥️ {childName} was marked absent
          </Heading>
          {date && <Text style={s.smallText}>{date}{branchName ? ` · ${branchName}` : ''}</Text>}
        </Section>
        <Text style={s.text}>
          {intro || `Hi${parentName ? ` ${parentName}` : ''}, we noticed ${childName} was not in class today. If this is unexpected, please let us know so we can make sure everything is okay.`}
        </Text>
        {reason && (
          <Section style={s.card}>
            <Section style={{ ...s.row, borderBottom: 'none' }}>
              <Text style={s.rowLabel}>Recorded reason</Text>
              <Text style={s.rowValue}>{reason}</Text>
            </Section>
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={contactUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${branchName || companyName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ childName, date }: Props) =>
    `${childName || 'Your child'} marked absent${date ? ` (${date})` : ''}`,
  displayName: 'Child absent alert',
  previewData: {
    parentName: 'Sara',
    childName: 'Maya',
    date: 'Thu, 4 Jun 2026',
    branchName: 'KL Central',
    reason: 'absent',
  } as Props,
} satisfies TemplateEntry