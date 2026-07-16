/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

interface Props {
  teacherName?: string
  parentName?: string
  childName?: string
  branchName?: string
  meetingDate?: string
  meetingTime?: string
  location?: string
  parentNotes?: string
  isReschedule?: boolean
  manageUrl?: string
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  teacherName, parentName, childName, branchName,
  meetingDate, meetingTime, location, parentNotes,
  isReschedule = false,
  manageUrl = brand.appUrl + '/curriculum/ptm?tab=bookings',
  companyName = 'Sprouts',
  intro, ctaLabel, signoff,
}: Props) => {
  const eyebrow = isReschedule ? 'PTM RESCHEDULE REQUEST' : 'NEW PTM REQUEST'
  const heading = isReschedule
    ? 'A parent rescheduled a meeting'
    : 'A parent requested a meeting'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading}{childName ? ` — ${childName}` : ''}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Text style={s.brandMark}>{brand.brandLabel}</Text>
          <Section style={{ ...s.heroBox, backgroundColor: brand.surfaceMuted }}>
            <Text style={{ ...s.amountLabel, color: brand.primary }}>{eyebrow}</Text>
            <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>{heading}</Heading>
            {childName && <Text style={s.smallText}>for {childName}</Text>}
          </Section>
          <Text style={s.text}>
            {intro || `Hi${teacherName ? ` ${teacherName}` : ''}, ${parentName || 'a parent'} has ${isReschedule ? 'rescheduled' : 'requested'} a parent–teacher meeting${childName ? ` for ${childName}` : ''}. Please confirm or decline below.`}
          </Text>
          <Section style={s.card}>
            {meetingDate && (
              <Section style={s.row}>
                <Text style={s.rowLabel}>Date</Text>
                <Text style={s.rowValue}>{meetingDate}</Text>
              </Section>
            )}
            {meetingTime && (
              <Section style={s.row}>
                <Text style={s.rowLabel}>Time</Text>
                <Text style={s.rowValue}>{meetingTime}</Text>
              </Section>
            )}
            {location && (
              <Section style={s.row}>
                <Text style={s.rowLabel}>Location</Text>
                <Text style={s.rowValue}>{location}</Text>
              </Section>
            )}
            {parentName && (
              <Section style={s.row}>
                <Text style={s.rowLabel}>Parent</Text>
                <Text style={s.rowValue}>{parentName}</Text>
              </Section>
            )}
            {branchName && (
              <Section style={{ ...s.row, borderBottom: 'none' }}>
                <Text style={s.rowLabel}>Branch</Text>
                <Text style={s.rowValue}>{branchName}</Text>
              </Section>
            )}
          </Section>
          {parentNotes && (
            <Section style={s.card}>
              <Text style={s.rowLabel}>Parent note</Text>
              <Text style={s.rowValue}>{parentNotes}</Text>
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button style={s.button} href={manageUrl}>{ctaLabel || 'Review request'}</Button>
          </Section>
          <Hr style={s.hr} />
          <Text style={s.signoff}>{signoff || `— ${companyName} team`}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: ({ childName, isReschedule }: Props) => {
    const c = childName ? ` — ${childName}` : ''
    return isReschedule
      ? `PTM reschedule request${c}`
      : `New PTM booking request${c}`
  },
  displayName: 'PTM Booking Request (Teacher)',
  previewData: {
    teacherName: 'Pooja',
    parentName: 'Aisha Rahman',
    childName: 'Yusuf',
    branchName: 'LGH Bangsar',
    meetingDate: 'Mon, 10 Jun 2026',
    meetingTime: '3:30 PM',
    location: 'Bangsar campus, Room 2',
    parentNotes: 'I would like to discuss reading progress.',
    companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry