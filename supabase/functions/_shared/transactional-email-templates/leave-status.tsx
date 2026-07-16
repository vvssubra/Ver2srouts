/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { StatusEmail, RequestStatus } from './_status-shared.tsx'
import { brand } from './_brand.ts'

interface Props {
  staffName?: string; status?: RequestStatus; leaveType?: string
  startDate?: string; endDate?: string; days?: string
  approverNote?: string; companyName?: string
  actionUrl?: string; intro?: string; ctaLabel?: string; signoff?: string
}

const Email = ({
  staffName, status = 'approved', leaveType = '', startDate = '', endDate = '', days = '',
  approverNote, companyName = 'Sprouts',
  actionUrl = brand.appUrl + '/leave-management', intro, ctaLabel, signoff,
}: Props) =>
  React.createElement(StatusEmail, {
    recipientName: staffName,
    category: 'Leave',
    status,
    headline: `Leave ${status}`,
    intro,
    rows: [
      ...(leaveType ? [{ label: 'Type', value: leaveType }] : []),
      { label: 'Dates', value: `${startDate}${endDate && endDate !== startDate ? ` — ${endDate}` : ''}` },
      ...(days ? [{ label: 'Days', value: days }] : []),
    ],
    approverNote,
    actionUrl,
    ctaLabel: ctaLabel || 'View leave request',
    signoff,
    companyName,
  })

export const template = {
  component: Email,
  subject: ({ status, leaveType }: Props) => `Leave ${status || 'updated'}${leaveType ? ` — ${leaveType}` : ''}`,
  displayName: 'Leave Status',
  previewData: {
    staffName: 'Nadia', status: 'approved', leaveType: 'Annual Leave',
    startDate: '10 Jun 2026', endDate: '12 Jun 2026', days: '3',
    approverNote: 'Have a great break!', companyName: 'Little Green Hearts',
  } as Props,
} satisfies TemplateEntry