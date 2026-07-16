/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  parentName?: string; childName?: string; storyTitle?: string
  monthLabel?: string; previewText?: string; storyUrl?: string
  branchName?: string; intro?: string; ctaLabel?: string; signoff?: string
  hasMedia?: boolean
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  parentName, childName, storyTitle, monthLabel, previewText,
  storyUrl = brand.appUrl + '/journey', branchName = 'Sprouts',
  intro, ctaLabel = 'Open Learning Journey', signoff, hasMedia, attachedDocuments,
}: Props) => {
  const isMonthly = !!monthLabel
  const eyebrow = isMonthly ? monthLabel : 'NEW LEARNING UPDATE'
  const headline = isMonthly
    ? (storyTitle || 'A new chapter of growth')
    : `${childName || 'Your child'} has a new learning update`
  const defaultIntro = isMonthly
    ? `Hi${parentName ? ` ${parentName}` : ''}, the teachers have put together a learning story that captures highlights from this month — milestones, photos, and reflections.`
    : `Hi${parentName ? ` ${parentName}` : ''}, a new learning moment has been shared for ${childName || 'your child'}. Open Sprouts to view the teacher's note${hasMedia ? ', photos' : ''} and today's learning progress.`
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{isMonthly
      ? `${childName ? `${childName}'s` : 'A new'} learning story is ready 🌱`
      : `New learning journey update${childName ? ` for ${childName}` : ''} 🌱`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={s.heroBox}>
          <Text style={{ ...s.amountLabel, color: brand.primary }}>{eyebrow}</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>{headline}</Heading>
          {childName && isMonthly && <Text style={s.smallText}>For {childName}</Text>}
        </Section>
        <Text style={s.text}>{intro || defaultIntro}</Text>
        {!isMonthly && storyTitle && (
          <Text style={s.text}><strong>Update:</strong> {storyTitle}</Text>
        )}
        {previewText && (
          <Section style={{ ...s.card, fontStyle: 'italic' }}>
            <Text style={s.text}>"{previewText}"</Text>
          </Section>
        )}
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={storyUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)
}

export const template = {
  component: Email,
  subject: ({ childName, monthLabel }: Props) =>
    monthLabel
      ? `${childName ? `${childName}'s` : 'New'} learning story — ${monthLabel} 🌱`
      : `New learning journey update${childName ? ` for ${childName}` : ''} 🌱`,
  displayName: 'Learning Story Ready',
  previewData: {
    parentName: 'Aisha', childName: 'Ahmad',
    storyTitle: 'Sandpit science explorers',
    hasMedia: true,
    branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry