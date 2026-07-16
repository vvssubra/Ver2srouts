/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  recipientName?: string; senderName?: string; messagePreview?: string
  messageCount?: number; chatUrl?: string; branchName?: string
  intro?: string; ctaLabel?: string; signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  recipientName, senderName = 'Someone', messagePreview = '',
  messageCount = 1, chatUrl = brand.appUrl + '/chat', branchName = 'Sprouts',
  intro, ctaLabel = 'Open chat', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{senderName} sent you {messageCount === 1 ? 'a message' : `${messageCount} messages`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>
          💬 {senderName} sent you {messageCount === 1 ? 'a message' : `${messageCount} messages`}
        </Heading>
        <Text style={s.lead}>
          {intro || `Hi${recipientName ? ` ${recipientName}` : ''}, you have unread chat messages waiting in the app.`}
        </Text>
        {messagePreview && (
          <Section style={s.card}>
            <Text style={s.rowLabel}>{senderName}</Text>
            <Text style={{ ...s.text, margin: '4px 0 0', fontStyle: 'italic' }}>"{messagePreview}"</Text>
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={chatUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.footer}>You're receiving this because you have unread messages older than 30 minutes.</Text>
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ senderName, messageCount }: Props) =>
    `${senderName || 'Someone'} sent you ${messageCount === 1 ? 'a message' : `${messageCount || ''} messages`} 💬`,
  displayName: 'Missed Chat Message',
  previewData: {
    recipientName: 'Aisha', senderName: 'Teacher Sarah',
    messagePreview: 'Hi Aisha, just wanted to share that Ahmad had a wonderful day today!',
    messageCount: 2, branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry