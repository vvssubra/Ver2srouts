/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { AttachedDocsSection, type AttachedDoc } from './_attached-docs.tsx'
import { brand, styles as s } from './_brand.ts'

interface Props {
  parentName?: string
  childName?: string
  invoiceNumber?: string
  amount?: string
  currency?: string
  dueDate?: string
  branchName?: string
  lineItems?: Array<{ description: string; amount: string }>
  payUrl?: string
  intro?: string
  ctaLabel?: string
  signoff?: string
}

const Email = ({
  parentName, childName, invoiceNumber, amount = '0.00', currency = 'RM',
  dueDate, branchName = 'Sprouts', lineItems = [], payUrl = brand.appUrl + '/fees',
  intro, ctaLabel = 'Pay Invoice', signoff,  attachedDocuments,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Invoice {invoiceNumber} — {currency} {amount}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>New invoice ready</Heading>
        <Text style={s.lead}>
          {intro ||
            `Hi${parentName ? ` ${parentName}` : ''}, a new invoice${childName ? ` for ${childName}` : ''} is now available.`}
        </Text>

        <Section style={s.heroBox}>
          <Text style={s.amountLabel}>Amount due</Text>
          <Text style={s.amount}>{currency} {amount}</Text>
          {dueDate && (
            <Text style={{ ...s.text, margin: '4px 0 0' }}>
              Due by <strong style={{ color: brand.text }}>{dueDate}</strong>
            </Text>
          )}
        </Section>

        <Section style={s.card}>
          <Text style={s.rowLabel}>Invoice</Text>
          <Text style={s.rowValue}>{invoiceNumber || '—'}</Text>
          {lineItems.length > 0 && (
            <>
              <Hr style={{ ...s.hr, margin: '14px 0' }} />
              {lineItems.map((li, i) => (
                <Section key={i} style={s.row}>
                  <Text style={{ ...s.text, margin: 0 }}>
                    {li.description} — <strong style={{ color: brand.text }}>{currency} {li.amount}</strong>
                  </Text>
                </Section>
              ))}
            </>
          )}
        </Section>

        <Section style={{ textAlign: 'center', margin: '20px 0' }}>
          <Button style={s.button} href={payUrl}>{ctaLabel}</Button>
        </Section>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          Questions? Reply to this email or write to{' '}
          <Link href={`mailto:${brand.supportEmail}`} style={s.link}>{brand.supportEmail}</Link>.
        </Text>
        <Text style={s.signoff}>{signoff || `— The ${branchName} team`}</Text>
              <AttachedDocsSection docs={attachedDocuments} />
        </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: ({ invoiceNumber, branchName }: Props) =>
    `${branchName || 'Sprouts'} — Invoice ${invoiceNumber || ''} is ready`,
  displayName: 'Invoice Issued',
  previewData: {
    parentName: 'Aisha', childName: 'Ahmad', invoiceNumber: 'INV-2026-00123',
    amount: '450.00', currency: 'RM', dueDate: '15 Jun 2026', branchName: 'Little Green Hearts',
    lineItems: [
      { description: 'June 2026 Tuition', amount: '400.00' },
      { description: 'Meals — June', amount: '50.00' },
    ],
  } as Props,
} satisfies TemplateEntry