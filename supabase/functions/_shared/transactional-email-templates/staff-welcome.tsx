/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

interface Props {
  staffName?: string
  email?: string
  temporaryPassword?: string
  role?: string
  branchName?: string
  loginUrl?: string
  companyName?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  staffName, email, temporaryPassword, role = 'team member',
  branchName, loginUrl = brand.appUrl + '/auth',
  companyName = 'Sprouts', intro, ctaLabel = 'Sign in', signoff,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {companyName} — your account is ready</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Section style={{ ...s.heroBox, backgroundColor: '#f5f3ff' }}>
          <Text style={{ ...s.amountLabel, color: brand.primary }}>WELCOME</Text>
          <Heading style={{ ...s.h1, margin: '8px 0 4px' }}>
            🌱 You're all set, {staffName || 'there'}!
          </Heading>
          <Text style={s.smallText}>
            Your {role} account{branchName ? ` at ${branchName}` : ''} is ready.
          </Text>
        </Section>
        <Text style={s.text}>
          {intro || `An administrator has created an account for you on ${companyName}. Use the credentials below to sign in for the first time — you'll be asked to set a new password right away.`}
        </Text>
        <Section style={s.card}>
          <Section style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue}>{email}</Text>
          </Section>
          {temporaryPassword && (
            <Section style={{ ...s.row, borderBottom: 'none' }}>
              <Text style={s.rowLabel}>Temporary password</Text>
              <Text style={{ ...s.rowValue, fontFamily: 'monospace' }}>{temporaryPassword}</Text>
            </Section>
          )}
        </Section>
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={loginUrl}>{ctaLabel}</Button>
        </Section>
        <Text style={s.smallText}>
          For security, please change your password immediately after signing in.
        </Text>
        <Hr style={s.hr} />
        <Text style={s.signoff}>{signoff || `— The ${companyName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ companyName }: Props) => `Welcome to ${companyName || 'Sprouts'} 🌱`,
  displayName: 'Staff welcome',
  previewData: {
    staffName: 'Aisha',
    email: 'aisha@example.com',
    temporaryPassword: 'Temp123!Abc',
    role: 'Teacher',
    branchName: 'KL Central',
  } as Props,
} satisfies TemplateEntry