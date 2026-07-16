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
  className?: string
  branchName?: string
  dateRange?: string  // e.g. "10 Jun – 14 Jun 2026"
  bookingUrl?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  parentName, childName, className, branchName = 'Sprouts',
  dateRange,
  bookingUrl = brand.appUrl + '/parent-ptm',
  intro, ctaLabel = 'Book PTM Slot', signoff,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Parent–Teacher Meeting booking is now open{childName ? ` for ${childName}` : ''}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={s.heroBox}>
          <Text style={{ ...s.amountLabel, color: brand.primary }}>PTM BOOKING OPEN</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>PTM booking is now open</Heading>
          {childName && <Text style={s.smallText}>for {childName}</Text>}
        </Section>
        <Text style={s.text}>
          {intro || `Hi${parentName ? ` ${parentName}` : ''}, Parent–Teacher Meeting slots are now open for booking.${childName ? ` Please choose a suitable PTM slot for ${childName}.` : ' Please choose a suitable time in Sprouts.'}`}
        </Text>
        <Section style={s.card}>
          {className && (
            <Section style={s.row}>
              <Text style={s.rowLabel}>Class</Text>
              <Text style={s.rowValue}>{className}</Text>
            </Section>
          )}
          {dateRange && (
            <Section style={s.row}>
              <Text style={s.rowLabel}>Dates</Text>
              <Text style={s.rowValue}>{dateRange}</Text>
            </Section>
          )}
          {branchName && (
            <Section style={{ ...s.row, borderBottom: 'none' }}>
              <Text style={s.rowLabel}>Branch</Text>
              <Text style={s.rowValue}>{branchName}</Text>
            </Section>
          )}
        </Section>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button style={s.button} href={bookingUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ childName }: Props) =>
    `Parent–Teacher Meeting booking is now open${childName ? ` for ${childName}` : ''}`,
  displayName: 'PTM Slots Open',
  previewData: {
    parentName: 'Aisha',
    childName: 'Yusuf',
    className: 'Sunflower (K2)',
    branchName: 'Little Green Hearts',
    dateRange: '10 Jun – 14 Jun 2026',
  } as Props,
} satisfies TemplateEntry