/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

type PtmStatus = 'scheduled' | 'rescheduled' | 'reminder' | 'cancelled' | 'completed'

interface Props {
  parentName?: string
  childName?: string
  teacherName?: string
  branchName?: string
  status?: PtmStatus
  meetingDate?: string  // e.g. "Mon, 10 Jun 2026"
  meetingTime?: string  // e.g. "3:30 PM"
  location?: string
  meetingUrl?: string
  notes?: string
  manageUrl?: string
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const statusMeta: Record<PtmStatus, { tone: string; bg: string; eyebrow: string; heading: string }> = {
  scheduled:   { tone: brand.primary, bg: brand.surfaceMuted, eyebrow: 'PTM SCHEDULED',   heading: 'Your parent–teacher meeting is set' },
  rescheduled: { tone: brand.warning, bg: '#fffbeb',            eyebrow: 'PTM RESCHEDULED', heading: 'Your meeting has been rescheduled' },
  reminder:    { tone: brand.primary, bg: brand.surfaceMuted,   eyebrow: 'PTM REMINDER',    heading: 'Your meeting is coming up' },
  cancelled:   { tone: brand.danger,  bg: '#fef2f2',            eyebrow: 'PTM CANCELLED',   heading: 'Your meeting has been cancelled' },
  completed:   { tone: brand.success, bg: '#ecfdf5',            eyebrow: 'PTM COMPLETED',   heading: 'Thanks for joining the meeting' },
}

const Email = ({
  parentName, childName, teacherName, branchName,
  status = 'scheduled', meetingDate, meetingTime, location, meetingUrl, notes,
  manageUrl = brand.appUrl + '/parent-ptm',
  companyName = 'Sprouts',
  intro, ctaLabel, signoff,
}: Props) => {
  const meta = statusMeta[status]
  const defaultCta =
    status === 'completed' ? 'View meeting notes'
    : status === 'cancelled' ? 'Reschedule'
    : meetingUrl ? 'Join meeting'
    : 'View details'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{meta.heading}{childName ? ` — ${childName}` : ''}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Text style={s.brandMark}>{brand.brandLabel}</Text>
          <Section style={{ ...s.heroBox, backgroundColor: meta.bg }}>
            <Text style={{ ...s.amountLabel, color: meta.tone }}>{meta.eyebrow}</Text>
            <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>{meta.heading}</Heading>
            {childName && <Text style={s.smallText}>for {childName}</Text>}
          </Section>
          <Text style={s.text}>
            {intro || `Hi${parentName ? ` ${parentName}` : ''}, here are the details for your parent–teacher meeting${teacherName ? ` with ${teacherName}` : ''}.`}
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
            {teacherName && (
              <Section style={s.row}>
                <Text style={s.rowLabel}>Teacher</Text>
                <Text style={s.rowValue}>{teacherName}</Text>
              </Section>
            )}
            {branchName && (
              <Section style={{ ...s.row, borderBottom: 'none' }}>
                <Text style={s.rowLabel}>Branch</Text>
                <Text style={s.rowValue}>{branchName}</Text>
              </Section>
            )}
          </Section>
          {notes && (
            <Section style={s.card}>
              <Text style={s.rowLabel}>Notes</Text>
              <Text style={s.rowValue}>{notes}</Text>
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button style={s.button} href={meetingUrl || manageUrl}>{ctaLabel || defaultCta}</Button>
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
  subject: ({ status, childName }: Props) => {
    const c = childName ? ` — ${childName}` : ''
    switch (status) {
      case 'rescheduled': return `Your PTM has been rescheduled${c}`
      case 'reminder':    return `Reminder: parent–teacher meeting${c}`
      case 'cancelled':   return `Your PTM has been cancelled${c}`
      case 'completed':   return `Thanks for joining the PTM${c}`
      default:            return `Your parent–teacher meeting is scheduled${c}`
    }
  },
  displayName: 'Parent–Teacher Meeting Status',
  previewData: {
    parentName: 'Aisha', childName: 'Yusuf', teacherName: 'Ms. Pooja',
    branchName: 'LGH Bangsar', status: 'scheduled',
    meetingDate: 'Mon, 10 Jun 2026', meetingTime: '3:30 PM',
    location: 'Bangsar campus, Room 2',
    companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry