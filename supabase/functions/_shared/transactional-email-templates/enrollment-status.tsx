/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

type Stage = 'contacted' | 'tour_scheduled' | 'trial_scheduled' | 'waitlisted' | 'enrolled'

interface Props {
  parentName?: string
  childName?: string
  branchName?: string
  stage?: Stage
  scheduledAt?: string   // formatted date/time when relevant
  noteFromSchool?: string
  ctaUrl?: string
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const stageMeta: Record<Stage, { eyebrow: string; heading: string; tone: string; bg: string; defaultCta: string }> = {
  contacted:        { eyebrow: 'WE\'VE BEEN IN TOUCH',  heading: '👋 Thanks for reaching out',          tone: brand.primary, bg: '#f5f3ff', defaultCta: 'View enrolment details' },
  tour_scheduled:   { eyebrow: 'TOUR CONFIRMED',         heading: '🏫 Your school tour is booked',       tone: brand.primary, bg: '#eef2ff', defaultCta: 'View tour details' },
  trial_scheduled:  { eyebrow: 'TRIAL CONFIRMED',        heading: '🌟 Trial class confirmed',            tone: brand.primary, bg: '#ecfdf5', defaultCta: 'View trial details' },
  waitlisted:       { eyebrow: 'YOU\'RE ON THE LIST',    heading: '📋 You\'re on the waitlist',          tone: brand.warning, bg: '#fffbeb', defaultCta: 'View status' },
  enrolled:         { eyebrow: 'ENROLLED',               heading: '🎉 Welcome to the family!',           tone: brand.success || brand.primary, bg: '#ecfdf5', defaultCta: 'Get started' },
}

const Email = ({
  parentName, childName, branchName,
  stage = 'contacted', scheduledAt, noteFromSchool,
  ctaUrl = brand.appUrl, companyName = 'Sprouts',
  intro, ctaLabel, signoff,
}: Props) => {
  const m = stageMeta[stage]
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{m.heading}{childName ? ` — ${childName}` : ''}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Text style={s.brandMark}>{brand.brandLabel}</Text>
          <Section style={{ ...s.heroBox, backgroundColor: m.bg }}>
            <Text style={{ ...s.amountLabel, color: m.tone }}>{m.eyebrow}</Text>
            <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>{m.heading}</Heading>
            {childName && <Text style={s.smallText}>for {childName}{branchName ? ` · ${branchName}` : ''}</Text>}
          </Section>
          <Text style={s.text}>
            {intro || `Hi${parentName ? ` ${parentName}` : ''}, here's an update on ${childName ? `${childName}'s` : 'your'} enrolment with ${companyName}.`}
          </Text>
          {(scheduledAt || noteFromSchool) && (
            <Section style={s.card}>
              {scheduledAt && (
                <Section style={s.row}>
                  <Text style={s.rowLabel}>When</Text>
                  <Text style={s.rowValue}>{scheduledAt}</Text>
                </Section>
              )}
              {noteFromSchool && (
                <Section style={{ ...s.row, borderBottom: 'none' }}>
                  <Text style={s.rowLabel}>Note from school</Text>
                  <Text style={s.rowValue}>{noteFromSchool}</Text>
                </Section>
              )}
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '20px 0' }}>
            <Button style={{ ...s.button, backgroundColor: m.tone }} href={ctaUrl}>{ctaLabel || m.defaultCta}</Button>
          </Section>
          <Hr style={s.hr} />
          <Text style={s.signoff}>{signoff || `— The ${branchName || companyName} team`}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: ({ stage, childName, branchName }: Props) => {
    const who = childName ? ` for ${childName}` : ''
    switch (stage) {
      case 'tour_scheduled':  return `Your tour is confirmed${who}`
      case 'trial_scheduled': return `Trial class confirmed${who}`
      case 'waitlisted':      return `You're on the waitlist${who}`
      case 'enrolled':        return `Welcome to ${branchName || 'Sprouts'}${who} 🎉`
      default:                return `Enrolment update${who}`
    }
  },
  displayName: 'Enrolment status update',
  previewData: {
    parentName: 'Sara',
    childName: 'Maya',
    branchName: 'KL Central',
    stage: 'tour_scheduled',
    scheduledAt: 'Sat, 7 Jun 2026 · 10:30 AM',
    noteFromSchool: 'Please arrive 5 minutes early. Free parking at the rear gate.',
  } as Props,
} satisfies TemplateEntry