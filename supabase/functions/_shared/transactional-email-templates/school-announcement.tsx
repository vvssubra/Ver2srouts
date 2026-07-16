/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  recipientName?: string; announcementTitle?: string; announcementBody?: string
  attachmentUrl?: string; attachmentLabel?: string
  appUrl?: string; branchName?: string
  category?: string; intro?: string; ctaLabel?: string; signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  recipientName, announcementTitle = 'School update', announcementBody = '',
  attachmentUrl, attachmentLabel = 'View attachment',
  appUrl = brand.appUrl + '/announcements', branchName = 'Sprouts',
  category, intro, ctaLabel = 'Open in app', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{announcementTitle}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        {category && <Text style={{ ...s.amountLabel, color: brand.primary }}>{category}</Text>}
        <Heading style={s.h1}>{announcementTitle}</Heading>
        {intro && <Text style={s.lead}>{intro}</Text>}
        <Section style={s.card}>
          {announcementBody.split('\n').filter(Boolean).map((p, i) => (
            <Text key={i} style={s.text}>{p}</Text>
          ))}
        </Section>
        {attachmentUrl && (
          <Section style={{ textAlign: 'center', margin: '12px 0' }}>
            <Button style={s.buttonGhost} href={attachmentUrl}>{attachmentLabel}</Button>
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={appUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ announcementTitle, branchName }: Props) =>
    `${branchName || 'Sprouts'}: ${announcementTitle || 'School update'}`,
  displayName: 'School Announcement',
  previewData: {
    announcementTitle: 'Public holiday — 18 June',
    announcementBody: 'The school will be closed on Wednesday, 18 June for Hari Raya Haji.\nClasses resume on Thursday, 19 June.',
    category: 'HOLIDAY NOTICE',
    branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry