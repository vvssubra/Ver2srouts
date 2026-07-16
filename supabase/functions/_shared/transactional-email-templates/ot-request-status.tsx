/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { StatusEmail, RequestStatus } from './_status-shared.tsx'
import { brand } from './_brand.ts'

interface Props {
  staffName?: string; status?: RequestStatus; otDate?: string; hours?: string
  reason?: string; approverNote?: string; companyName?: string
  actionUrl?: string; intro?: string; ctaLabel?: string; signoff?: string
}

const Email = ({
  staffName, status = 'approved', otDate = '', hours = '0', reason,
  approverNote, companyName = 'Sprouts',
  actionUrl = brand.appUrl + '/overtime', intro, ctaLabel, signoff,
}: Props) =>
  React.createElement(StatusEmail, {
    recipientName: staffName,
    category: 'Overtime',
    status,
    headline: `OT request ${status}`,
    intro,
    rows: [
      { label: 'Date', value: otDate || '—' },
      { label: 'Hours', value: `${hours} h` },
      ...(reason ? [{ label: 'Reason', value: reason }] : []),
    ],
    approverNote,
    actionUrl,
    ctaLabel: ctaLabel || 'View OT request',
    signoff,
    companyName,
  })

export const template = {
  component: Email,
  subject: ({ status, otDate }: Props) => `OT request ${status || 'updated'}${otDate ? ` — ${otDate}` : ''}`,
  displayName: 'OT Request Status',
  previewData: {
    staffName: 'Nadia', status: 'approved', otDate: '02 Jun 2026', hours: '2.5',
    reason: 'Late pickup coverage', approverNote: 'Thanks for staying back!',
    companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry