/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'

interface Props {
  parentName?: string
  childName?: string
  branchName?: string
  welcomeKitUrl?: string
  appUrl?: string
  supportEmail?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
  attachedDocuments?: AttachedDoc[]
  tempPassword?: string
  loginEmail?: string
  loginUrl?: string
}

const Email = ({
  parentName,
  childName,
  branchName = 'Sprouts',
  welcomeKitUrl,
  appUrl = 'https://sprouts.littlegreenhearts.com',
  supportEmail = 'hello@littlegreenhearts.com',
  intro,
  ctaLabel,
  signoff,
  attachedDocuments,
  tempPassword,
  loginEmail,
  loginUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {branchName} — your parent welcome kit is inside 💚</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={hero}>
          <Text style={brandMark}>SPROUTS</Text>
          <Heading style={h1}>
            Welcome{parentName ? `, ${parentName}` : ''} 💚
          </Heading>
          <Text style={lead}>
            {intro ||
              `We're so glad ${childName ? childName : 'your little one'} is joining ${branchName}. To make your first week smooth, we've put together a short Parent Welcome Kit.`}
          </Text>
        </Section>

        {tempPassword ? (
        <Section style={credCard}>
          <Text style={cardEyebrow}>YOUR LOGIN</Text>
          <Heading as="h2" style={h2}>Sign in to the app</Heading>
          <Text style={text}>
            We've created your parent account. Use the credentials below — you'll be asked to set your own password the first time you sign in.
          </Text>
          <Section style={credBox}>
            <Text style={credLabel}>Email</Text>
            <Text style={credValue}>{loginEmail || ''}</Text>
            <Text style={credLabel}>Temporary password</Text>
            <Text style={credValuePwd}>{tempPassword}</Text>
          </Section>
          <Button style={button} href={loginUrl || `${appUrl}/auth`}>
            Sign in
          </Button>
          <Text style={smallText}>
            For your security this password expires after first use. Keep it private and never share it.
          </Text>
        </Section>
        ) : null}

        {welcomeKitUrl ? (
        <Section style={card}>
          <Text style={cardEyebrow}>YOUR WELCOME KIT</Text>
          <Heading as="h2" style={h2}>
            Everything you need, in one PDF
          </Heading>
          <Text style={text}>
            A 14-page friendly guide that walks you through the app step-by-step —
            installing it on your phone, your daily learning journey, chatting with
            teachers, paying fees, and more.
          </Text>
          <Button style={button} href={welcomeKitUrl}>
            {ctaLabel || 'Download Welcome Kit (PDF)'}
          </Button>
          <Text style={smallText}>
            Tip: open it on your phone first so you can install the app while you read.
          </Text>
        </Section>
        ) : null}

        <AttachedDocsSection docs={attachedDocuments} heading="More documents for you" />

        <Section style={pillarsWrap}>
          <Heading as="h3" style={h3}>What's inside Sprouts</Heading>
          <Pillar emoji="📸" title="Daily Learning Journey" body="Real photos, observations and milestones from your child's day." />
          <Pillar emoji="💬" title="Direct chat with teachers" body="No more lost notes in school bags — message your teacher in-app." />
          <Pillar emoji="💳" title="Fees & PTM in one place" body="Pay via FPX, view receipts, book parent-teacher meetings." />
          <Pillar emoji="🔔" title="Announcements & alerts" body="Holiday notices, pickup changes and more — never miss a thing." />
        </Section>

        <Hr style={hr} />

        <Section>
          <Heading as="h3" style={h3}>Get started in 60 seconds</Heading>
          <Text style={text}>
            <strong style={strong}>1.</strong> Open the Welcome Kit above<br />
            <strong style={strong}>2.</strong> Install the app on your phone (instructions on page 4)<br />
            <strong style={strong}>3.</strong> Sign in with the invite you'll receive separately
          </Text>
          <Button style={buttonOutline} href={appUrl}>
            Open the app
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          Questions? Reply to this email or write to{' '}
          <Link href={`mailto:${supportEmail}`} style={link}>{supportEmail}</Link>.
          We're here for you.
        </Text>
        <Text style={signoffStyle}>{signoff || `— The ${branchName} team`}</Text>
      </Container>
    </Body>
  </Html>
)

const Pillar = ({ emoji, title, body }: { emoji: string; title: string; body: string }) => (
  <Section style={pillar}>
    <Text style={pillarEmoji}>{emoji}</Text>
    <Text style={pillarTitle}>{title}</Text>
    <Text style={pillarBody}>{body}</Text>
  </Section>
)

export const template = {
  component: Email,
  subject: ({ childName, branchName }: Props) =>
    `Welcome to ${branchName || 'Sprouts'}${childName ? ` — ${childName}'s journey starts here` : ''} 💚`,
  displayName: 'Parent Welcome Kit',
  previewData: {
    parentName: 'Aisha',
    childName: 'Ahmad',
    branchName: 'Little Green Hearts',
    loginEmail: 'aisha@example.com',
    tempPassword: 'Sp9!tK2mQp4x',
  } as Props,
} satisfies TemplateEntry

// ---------- styles ----------
const main = { backgroundColor: '#ffffff', fontFamily: '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const hero = { padding: '32px 28px', backgroundColor: '#f5f3ff', borderRadius: '20px', marginBottom: '24px', textAlign: 'center' as const }
const brandMark = { fontSize: '11px', fontWeight: '800' as const, color: '#7c3aed', letterSpacing: '0.3em', margin: '0 0 16px' }
const h1 = { fontSize: '28px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 12px', letterSpacing: '-0.02em' }
const h2 = { fontSize: '20px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 12px' }
const h3 = { fontSize: '16px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 16px' }
const lead = { fontSize: '15px', color: '#4a4458', lineHeight: '1.6', margin: '0' }
const text = { fontSize: '15px', color: '#4a4458', lineHeight: '1.7', margin: '0 0 20px' }
const smallText = { fontSize: '13px', color: '#8b8694', lineHeight: '1.5', margin: '12px 0 0' }
const strong = { color: '#7c3aed', fontWeight: '700' as const }
const card = { padding: '28px', backgroundColor: '#ffffff', border: '1px solid #ede9fe', borderRadius: '16px', marginBottom: '24px' }
const credCard = { padding: '28px', backgroundColor: '#faf5ff', border: '2px solid #c4b5fd', borderRadius: '16px', marginBottom: '24px' }
const credBox = { padding: '16px 20px', backgroundColor: '#ffffff', border: '1px solid #ede9fe', borderRadius: '12px', margin: '16px 0' }
const credLabel = { fontSize: '11px', fontWeight: '700' as const, color: '#7c3aed', letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: '8px 0 2px' }
const credValue = { fontSize: '15px', color: '#1a1033', margin: '0 0 8px', fontFamily: 'monospace' }
const credValuePwd = { fontSize: '18px', color: '#1a1033', margin: '0', fontFamily: 'monospace', fontWeight: '700' as const, letterSpacing: '0.05em' }
const cardEyebrow = { fontSize: '11px', fontWeight: '700' as const, color: '#7c3aed', letterSpacing: '0.2em', margin: '0 0 8px' }
const pillarsWrap = { marginTop: '24px' }
const pillar = { padding: '16px 0', borderBottom: '1px solid #f1edff' }
const pillarEmoji = { fontSize: '22px', margin: '0 0 4px' }
const pillarTitle = { fontSize: '15px', fontWeight: '700' as const, color: '#1a1033', margin: '0 0 4px' }
const pillarBody = { fontSize: '14px', color: '#6b6478', lineHeight: '1.5', margin: '0' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' }
const buttonOutline = { backgroundColor: '#ffffff', color: '#7c3aed', border: '2px solid #7c3aed', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 26px', textDecoration: 'none', display: 'inline-block' }
const hr = { border: 'none', borderTop: '1px solid #ede9fe', margin: '32px 0' }
const link = { color: '#7c3aed', textDecoration: 'underline' }
const footer = { fontSize: '13px', color: '#6b6478', lineHeight: '1.6', margin: '0 0 8px' }
const signoffStyle = { fontSize: '13px', color: '#8b8694', margin: '0' }