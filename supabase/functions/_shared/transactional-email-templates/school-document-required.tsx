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
  documentTitle?: string
  documentCategory?: string
  documentVersion?: string
  branchName?: string
  reviewUrl?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  parentName, childName, documentTitle = 'a school document',
  documentCategory, documentVersion, branchName = 'Sprouts',
  reviewUrl = brand.appUrl + '/school-documents',
  intro, ctaLabel = 'Review Document', signoff,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Please review and acknowledge: {documentTitle}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={s.heroBox}>
          <Text style={{ ...s.amountLabel, color: brand.primary }}>ACTION REQUIRED</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>Please review and acknowledge a school document</Heading>
          {documentCategory && <Text style={s.smallText}>{documentCategory}</Text>}
        </Section>
        <Text style={s.text}>
          {intro || `Hi${parentName ? ` ${parentName}` : ''}, your child's school has shared a document that requires your acknowledgement. ${childName ? `Please review the document for ${childName}.` : 'Please review the latest school document in Sprouts.'}`}
        </Text>
        <Section style={s.card}>
          <Section style={s.row}>
            <Text style={s.rowLabel}>Document</Text>
            <Text style={s.rowValue}>{documentTitle}</Text>
          </Section>
          {documentVersion && (
            <Section style={s.row}>
              <Text style={s.rowLabel}>Version</Text>
              <Text style={s.rowValue}>{documentVersion}</Text>
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
          <Button style={s.button} href={reviewUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ documentTitle }: Props) =>
    `School document requires your acknowledgement${documentTitle ? ` — ${documentTitle}` : ''}`,
  displayName: 'School Document — Acknowledgement Required',
  previewData: {
    parentName: 'Aisha',
    documentTitle: 'Parent Handbook 2026',
    documentCategory: 'HANDBOOK',
    documentVersion: '2.0',
    branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry