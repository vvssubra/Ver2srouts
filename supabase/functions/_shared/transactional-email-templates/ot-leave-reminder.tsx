/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { brand, styles as s } from './_brand.ts'

interface Props {
  staffName?: string
  companyName?: string
  otUrl?: string
  leaveUrl?: string
}

const Email = ({
  staffName,
  companyName = 'Sprouts HR System',
  otUrl = brand.appUrl + '/overtime',
  leaveUrl = brand.appUrl + '/leave',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder: Update Your Overtime (OT) and Leave Records</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandMark}>{brand.brandLabel}</Text>
        <Heading style={s.h1}>OT & Leave Reminder</Heading>
        <Text style={s.lead}>Dear {staffName || 'Team'},</Text>
        <Text style={s.text}>
          This is a friendly reminder to review your Overtime (OT) and Leave applications.
        </Text>
        <Text style={s.text}>
          If you have worked overtime or taken leave but have not submitted the request in
          Sprouts, please do so as soon as possible to ensure accurate payroll processing.
        </Text>
        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={otUrl} style={{ ...s.button, marginRight: '12px' }}>Review My OT</Button>
          <Button href={leaveUrl} style={s.buttonGhost}>Review My Leave</Button>
        </Section>
        <Text style={s.smallText}>Thank you,<br />{companyName}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Reminder: Update Your Overtime (OT) and Leave Records',
  displayName: 'OT & Leave Reminder',
  previewData: { staffName: 'Nadia', companyName: 'Sprouts HR System' } as Props,
} satisfies TemplateEntry