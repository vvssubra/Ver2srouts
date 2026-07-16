/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Moment {
  studentName?: string
  caption?: string
  imageUrl?: string
  domain?: string
  date?: string
}

interface Props {
  parentName?: string
  branchName?: string
  digestDate?: string
  momentCount?: number
  moments?: Moment[]
  journeyUrl?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  parentName, branchName = 'Sprouts', digestDate, momentCount = 0,
  moments = [], journeyUrl = brand.appUrl + '/journey',
  intro, ctaLabel = 'Open the journey', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{momentCount} new moment{momentCount === 1 ? '' : 's'} from today 📸</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>
          {momentCount} new moment{momentCount === 1 ? '' : 's'} today 📸
        </Heading>
        <Text style={s.lead}>
          {intro ||
            `Hi${parentName ? ` ${parentName}` : ''}, here's a peek at what your little one got up to${digestDate ? ` on ${digestDate}` : ''}.`}
        </Text>

        {moments.slice(0, 6).map((m, i) => (
          <Section key={i} style={s.card}>
            {m.imageUrl && (
              <Img src={m.imageUrl} alt={m.caption || 'moment'}
                width="552" height="auto"
                style={{ borderRadius: '10px', marginBottom: '12px', maxWidth: '100%' }} />
            )}
            <Text style={{ ...s.rowLabel, color: brand.primary }}>
              {m.studentName || 'Your child'}{m.domain ? ` · ${m.domain}` : ''}
            </Text>
            {m.caption && <Text style={{ ...s.text, margin: '4px 0 0' }}>{m.caption}</Text>}
          </Section>
        ))}

        {momentCount > moments.length && (
          <Text style={s.smallText}>+ {momentCount - moments.length} more in the app</Text>
        )}

        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={journeyUrl}>{ctaLabel}</Button>
        </Section>

        <Hr style={s.hr} />
        <Text style={s.footer}>You'll receive at most one digest per day. Toggle this in app settings.</Text>
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ momentCount, digestDate }: Props) =>
    `${momentCount || 'New'} moment${momentCount === 1 ? '' : 's'}${digestDate ? ` from ${digestDate}` : ''} 📸`,
  displayName: 'Daily Moments Digest',
  previewData: {
    parentName: 'Aisha', branchName: 'Little Green Hearts',
    digestDate: 'today', momentCount: 4,
    moments: [
      { studentName: 'Ahmad', caption: 'Built a tower with friends!', domain: 'Cognitive' },
      { studentName: 'Ahmad', caption: 'Painted a rainbow', domain: 'Creative Arts' },
    ],
  } as Props,
} satisfies TemplateEntry