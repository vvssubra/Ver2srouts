/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { template as parentWelcomeKit } from './parent-welcome-kit.tsx'
import { template as invoiceIssued } from './invoice-issued.tsx'
import { template as invoiceReceipt } from './invoice-receipt.tsx'
import { template as paymentReminder } from './payment-reminder.tsx'
import { template as momentsDigest } from './moments-digest.tsx'
import { template as learningStoryReady } from './learning-story-ready.tsx'
import { template as schoolAnnouncement } from './school-announcement.tsx'
import { template as chatMessageMissed } from './chat-message-missed.tsx'
import { template as payslipPublished } from './payslip-published.tsx'
import { template as otRequestStatus } from './ot-request-status.tsx'
import { template as claimStatus } from './claim-status.tsx'
import { template as leaveStatus } from './leave-status.tsx'
import { template as approvalPending } from './approval-pending.tsx'
import { template as parentPasswordReset } from './parent-password-reset.tsx'
import { template as parentPtmStatus } from './parent-ptm-status.tsx'
import { template as parentPtmBookingRequest } from './parent-ptm-booking-request.tsx'
import { template as staffWelcome } from './staff-welcome.tsx'
import { template as enrollmentStatus } from './enrollment-status.tsx'
import { template as childAbsent } from './child-absent.tsx'
import { template as schoolDocumentRequired } from './school-document-required.tsx'
import { template as ptmSlotsOpen } from './ptm-slots-open.tsx'
import { template as otLeaveReminder } from './ot-leave-reminder.tsx'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: (data: Record<string, any>) => string
  category?: 'parents' | 'finance' | 'staff'
  description?: string
  // Keys the admin can override in content_overrides (text-only).
  editableFields?: Array<{ key: string; label: string; multiline?: boolean }>
}

const commonEditable = [
  { key: 'intro', label: 'Intro paragraph', multiline: true },
  { key: 'ctaLabel', label: 'CTA button label' },
  { key: 'signoff', label: 'Signoff' },
]

export const TEMPLATES: Record<string, TemplateEntry> = {
  'parent-welcome-kit': {
    ...parentWelcomeKit,
    category: 'parents',
    description: 'Sent when a new parent is onboarded. Includes the Welcome Kit PDF.',
    editableFields: commonEditable,
  },
  'invoice-issued': {
    ...invoiceIssued,
    category: 'finance',
    description: 'Sent when a new invoice is issued to a parent or payer.',
    editableFields: commonEditable,
  },
  'invoice-receipt': {
    ...invoiceReceipt,
    category: 'finance',
    description: 'Sent after a payment is recorded successfully.',
    editableFields: commonEditable,
  },
  'payment-reminder': {
    ...paymentReminder,
    category: 'finance',
    description: 'Reminder cadence: 7d before due, on due date, 3d / 7d / 14d overdue.',
    editableFields: commonEditable,
  },
  'moments-digest': {
    ...momentsDigest,
    category: 'parents',
    description: 'Daily digest of new Moments/photos posted for the child.',
    editableFields: commonEditable,
  },
  'learning-story-ready': {
    ...learningStoryReady,
    category: 'parents',
    description: 'Sent when a monthly learning story / summary is published.',
    editableFields: commonEditable,
  },
  'school-announcement': {
    ...schoolAnnouncement,
    category: 'parents',
    description: 'Sent when an announcement is broadcast to parents.',
    editableFields: commonEditable,
  },
  'chat-message-missed': {
    ...chatMessageMissed,
    category: 'parents',
    description: 'Sent when chat messages remain unread for 30+ minutes.',
    editableFields: commonEditable,
  },
  'payslip-published': {
    ...payslipPublished,
    category: 'staff',
    description: 'Sent when a payroll run is published for the staff member.',
    editableFields: commonEditable,
  },
  'ot-request-status': {
    ...otRequestStatus,
    category: 'staff',
    description: 'Sent when an OT request is approved or rejected.',
    editableFields: commonEditable,
  },
  'claim-status': {
    ...claimStatus,
    category: 'staff',
    description: 'Sent when a staff claim is approved or rejected.',
    editableFields: commonEditable,
  },
  'leave-status': {
    ...leaveStatus,
    category: 'staff',
    description: 'Sent when a leave request is approved or rejected.',
    editableFields: commonEditable,
  },
  'approval-pending': {
    ...approvalPending,
    category: 'staff',
    description: 'Sent to approvers when a new OT/Claim/Leave request is submitted.',
    editableFields: commonEditable,
  },
  'parent-password-reset': {
    ...parentPasswordReset,
    category: 'parents',
    description: 'Sent when a parent requests a password reset.',
    editableFields: commonEditable,
  },
  'parent-ptm-status': {
    ...parentPtmStatus,
    category: 'parents',
    description: 'Sent when a parent–teacher meeting is scheduled, rescheduled, reminded, cancelled, or completed.',
    editableFields: commonEditable,
  },
  'parent-ptm-booking-request': {
    ...parentPtmBookingRequest,
    category: 'staff',
    description: 'Sent to the assigned class teacher(s) when a parent books or reschedules a PTM slot.',
    editableFields: commonEditable,
  },
  'staff-welcome': {
    ...staffWelcome,
    category: 'staff',
    description: 'Sent when an administrator provisions a new staff account with temporary credentials.',
    editableFields: commonEditable,
  },
  'enrollment-status': {
    ...enrollmentStatus,
    category: 'parents',
    description: 'Sent when a CRM lead status changes (tour scheduled, trial, waitlisted, enrolled).',
    editableFields: commonEditable,
  },
  'child-absent': {
    ...childAbsent,
    category: 'parents',
    description: 'Sent to parents when their child is marked absent for the day.',
    editableFields: commonEditable,
  },
  'school-document-required': {
    ...schoolDocumentRequired,
    category: 'parents',
    description: 'Sent to parents when an admin publishes a school document that requires acknowledgement.',
    editableFields: commonEditable,
  },
  'ptm-slots-open': {
    ...ptmSlotsOpen,
    category: 'parents',
    description: 'Sent to parents when PTM booking slots are opened for their child\'s class or branch.',
    editableFields: commonEditable,
  },
  'ot-leave-reminder': {
    ...otLeaveReminder,
    category: 'staff',
    description: 'Bi-weekly reminder asking staff to submit any pending OT or Leave records before payroll.',
    editableFields: commonEditable,
  },
}