/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  staffName?: string; period?: string; netSalary?: string; currency?: string
  payslipUrl?: string; companyName?: string
  intro?: string; ctaLabel?: string; signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  staffName, period = '', netSalary = '0.00', currency = 'RM',
  payslipUrl = brand.appUrl + '/my-payslips', companyName = 'Sprouts',
  intro, ctaLabel = 'View payslip', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {period} payslip is ready</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>Your payslip is ready 💸</Heading>
        <Text style={s.lead}>
          {intro || `Hi${staffName ? ` ${staffName}` : ''}, your payslip for ${period} has been published.`}
        </Text>
        <Section style={{ ...s.heroBox, backgroundColor: '#ecfdf5' }}>
          <Text style={{ ...s.amountLabel, color: brand.success }}>Net pay · {period}</Text>
          <Text style={s.amount}>{currency} {netSalary}</Text>
        </Section>
        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={payslipUrl}>{ctaLabel}</Button>
        </Section>
        <Hr style={s.hr} />
        <Text style={s.footer}>If anything looks wrong, please contact HR within 7 days.</Text>
        <Text style={s.signoff}>{signoff || `— ${companyName} HR`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ period }: Props) => `Your ${period || ''} payslip is ready`,
  displayName: 'Payslip Published',
  previewData: {
    staffName: 'Nadia', period: 'May 2026', netSalary: '3,250.00', currency: 'RM',
    companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry