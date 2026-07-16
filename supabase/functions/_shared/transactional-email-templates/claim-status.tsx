/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { StatusEmail, RequestStatus } from './_status-shared.tsx'
import { brand } from './_brand.ts'

interface Props {
  staffName?: string; status?: RequestStatus; claimTitle?: string
  claimType?: string; amount?: string; currency?: string
  approverNote?: string; companyName?: string
  actionUrl?: string; intro?: string; ctaLabel?: string; signoff?: string
}

const Email = ({
  staffName, status = 'approved', claimTitle = '', claimType = '', amount = '0.00', currency = 'RM',
  approverNote, companyName = 'Sprouts',
  actionUrl = brand.appUrl + '/claims', intro, ctaLabel, signoff,
}: Props) =>
  React.createElement(StatusEmail, {
    recipientName: staffName,
    category: 'Claim',
    status,
    headline: `Claim ${status}`,
    intro,
    rows: [
      ...(claimTitle ? [{ label: 'Title', value: claimTitle }] : []),
      ...(claimType ? [{ label: 'Type', value: claimType }] : []),
      { label: 'Amount', value: `${currency} ${amount}` },
    ],
    approverNote,
    actionUrl,
    ctaLabel: ctaLabel || 'View claim',
    signoff,
    companyName,
  })

export const template = {
  component: Email,
  subject: ({ status, claimTitle }: Props) => `Claim ${status || 'updated'}${claimTitle ? ` — ${claimTitle}` : ''}`,
  displayName: 'Claim Status',
  previewData: {
    staffName: 'Nadia', status: 'approved',
    claimTitle: 'Art supplies — May', claimType: 'Reimbursement',
    amount: '85.40', currency: 'RM',
    approverNote: 'Approved, paid next payroll.', companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry