/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

interface Props {
  parentName?: string
  resetUrl?: string
  expiresInMinutes?: number
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  parentName,
  resetUrl = brand.appUrl + '/reset-password',
  expiresInMinutes = 60,
  companyName = 'Sprouts',
  intro,
  ctaLabel = 'Reset password',
  signoff,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {companyName} password</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={{ ...s.heroBox, backgroundColor: brand.surfaceMuted }}>
          <Text style={{ ...s.amountLabel, color: brand.primary }}>PASSWORD RESET</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>
            Reset your password
          </Heading>
        </Section>
        <Text style={s.text}>
          {intro ||
            `Hi${parentName ? ` ${parentName}` : ''}, we received a request to reset your ${companyName} password. Tap the button below to set a new one.`}
        </Text>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button style={s.button} href={resetUrl}>{ctaLabel}</Button>
        </Section>
        <Text style={s.smallText}>
          This link expires in {expiresInMinutes} minutes. If you didn't request this, you can safely ignore this email — your password won't change.
        </Text>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— ${companyName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ companyName }: Props) =>
    `Reset your ${companyName || 'Sprouts'} password`,
  displayName: 'Parent Password Reset',
  previewData: {
    parentName: 'Aisha',
    resetUrl: 'https://sprouts.littlegreenhearts.com/reset-password?token=demo',
    expiresInMinutes: 60,
    companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry