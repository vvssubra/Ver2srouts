/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  parentName?: string; childName?: string; invoiceNumber?: string
  amountPaid?: string; currency?: string; balance?: string
  paymentMethod?: string; paymentDate?: string; receiptUrl?: string
  branchName?: string; intro?: string; ctaLabel?: string; signoff?: string
  attachedDocuments?: AttachedDoc[]
}

const Email = ({
  parentName, childName, invoiceNumber, amountPaid = '0.00', currency = 'RM',
  balance, paymentMethod, paymentDate, receiptUrl = brand.appUrl + '/fees',
  branchName = 'Sprouts', intro, ctaLabel = 'View receipt', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Payment received — {currency} {amountPaid} ✓</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>Payment received ✓</Heading>
        <Text style={s.lead}>
          {intro ||
            `Thank you${parentName ? `, ${parentName}` : ''}! We've received your payment${childName ? ` for ${childName}` : ''}.`}
        </Text>

        <Section style={{ ...s.heroBox, backgroundColor: '#ecfdf5' }}>
          <Text style={{ ...s.amountLabel, color: brand.success }}>Paid</Text>
          <Text style={s.amount}>{currency} {amountPaid}</Text>
          {paymentDate && <Text style={s.smallText}>on {paymentDate}</Text>}
        </Section>

        <Section style={s.card}>
          {invoiceNumber && (<><Text style={s.rowLabel}>Invoice</Text><Text style={s.rowValue}>{invoiceNumber}</Text></>)}
          {paymentMethod && (<><Text style={{...s.rowLabel, marginTop: 12}}>Method</Text><Text style={s.rowValue}>{paymentMethod}</Text></>)}
          {balance && (<><Text style={{...s.rowLabel, marginTop: 12}}>Outstanding balance</Text><Text style={s.rowValue}>{currency} {balance}</Text></>)}
        </Section>

        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.buttonGhost} href={receiptUrl}>{ctaLabel}</Button>
        </Section>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          Need help? <Link href={`mailto:${brand.supportEmail}`} style={s.link}>{brand.supportEmail}</Link>
        </Text>
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ amountPaid, currency }: Props) => `Payment received — ${currency || 'RM'} ${amountPaid || ''} ✓`,
  displayName: 'Invoice Receipt',
  previewData: {
    parentName: 'Aisha', childName: 'Ahmad', invoiceNumber: 'INV-2026-00123',
    amountPaid: '450.00', currency: 'RM', balance: '0.00',
    paymentMethod: 'FPX — Maybank', paymentDate: '04 Jun 2026',
    branchName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry