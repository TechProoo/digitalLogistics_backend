import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export type ApplicationUnderReviewEmailProps = {
  name?: string | null;
  vehicleType: string;
  plateNumber: string;
  supportEmail: string;
  logoUrl: string;
};

export function applicationUnderReviewEmailText(
  props: ApplicationUnderReviewEmailProps,
) {
  const name = (props.name ?? '').trim() || 'there';
  return [
    `Hi ${name},`,
    '',
    'Thank you for submitting your driver application with Digital Delivery!',
    '',
    'Application Details:',
    `  Vehicle type: ${props.vehicleType}`,
    `  Plate number: ${props.plateNumber}`,
    '',
    'Your application is now under review. Our team will go through your documents and get back to you within 48 hours.',
    '',
    `If you have any questions, email us at ${props.supportEmail}.`,
    '',
    '— Digital Delivery Team',
  ].join('\n');
}

export function ApplicationUnderReviewEmail(
  props: ApplicationUnderReviewEmailProps,
): React.ReactElement {
  const name = (props.name ?? '').trim() || 'there';

  const preheader =
    'Your driver application is under review — we will get back to you within 48 hours.';

  const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    padding: '32px 0',
  } as const;

  const container = {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e5e7eb',
    margin: '0 auto',
    padding: '28px',
    width: '100%',
    maxWidth: '560px',
  } as const;

  const h1 = {
    color: '#111827',
    fontSize: '22px',
    fontWeight: 800,
    lineHeight: '28px',
    margin: '0 0 12px',
  } as const;

  const p = {
    color: '#374151',
    fontSize: '14px',
    lineHeight: '22px',
    margin: '0 0 12px',
  } as const;

  const detailBox = {
    backgroundColor: '#f0fdf4',
    borderRadius: '12px',
    border: '1px solid #bbf7d0',
    padding: '16px',
    margin: '16px 0',
  } as const;

  const detailLabel = {
    color: '#6b7280',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: '0 0 4px',
  } as const;

  const detailValue = {
    color: '#111827',
    fontSize: '14px',
    fontWeight: 600,
    margin: '0 0 10px',
  } as const;

  const subtleLink = {
    color: '#0ea5e9',
    textDecoration: 'underline',
  } as const;

  const footerText = {
    color: '#6b7280',
    fontSize: '12px',
    lineHeight: '18px',
    margin: '0',
  } as const;

  const logo = {
    display: 'block',
    margin: '0 auto',
    height: '34px',
    width: 'auto',
  } as const;

  const statusBadge = {
    display: 'inline-block',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 700,
    margin: '0 0 12px',
  } as const;

  return React.createElement(
    Html,
    { lang: 'en' },
    React.createElement(Head, null),
    React.createElement(Preview, null, preheader),
    React.createElement(
      Body,
      { style: main },
      React.createElement(
        Container,
        { style: container },
        React.createElement(
          Section,
          null,
          // Logo
          React.createElement(
            Section,
            { style: { marginBottom: '18px', textAlign: 'center' as const } },
            React.createElement(Img, {
              src: props.logoUrl,
              alt: 'Digital Delivery',
              style: logo,
            }),
          ),
          // Title
          React.createElement(Text, { style: h1 }, 'Application Received'),
          // Status badge
          React.createElement(
            Text,
            { style: { margin: '0 0 16px' } },
            React.createElement(
              'span',
              { style: statusBadge },
              '⏳ Under Review',
            ),
          ),
          // Greeting
          React.createElement(
            Text,
            { style: p },
            `Hi ${name}, thank you for applying to drive with Digital Delivery! We have received your application and our team is currently reviewing your documents.`,
          ),
          // Details box
          React.createElement(
            Section,
            { style: detailBox },
            React.createElement(Text, { style: detailLabel }, 'Vehicle Type'),
            React.createElement(
              Text,
              { style: detailValue },
              props.vehicleType,
            ),
            React.createElement(Text, { style: detailLabel }, 'Plate Number'),
            React.createElement(
              Text,
              { style: { ...detailValue, margin: '0' } },
              props.plateNumber,
            ),
          ),
          // What to expect
          React.createElement(
            Text,
            { style: { ...p, fontWeight: 600 } },
            'What happens next?',
          ),
          React.createElement(
            Text,
            { style: p },
            '• Our team reviews your uploaded documents and information.',
          ),
          React.createElement(
            Text,
            { style: p },
            '• You will receive a response within 48 hours.',
          ),
          React.createElement(
            Text,
            { style: p },
            '• If we need any additional information, we will reach out to you via WhatsApp or email.',
          ),
          // Divider
          React.createElement(Hr, {
            style: { borderColor: '#e5e7eb', margin: '18px 0' },
          }),
          // Support
          React.createElement(
            Text,
            { style: p },
            'Have questions? Contact us at ',
            React.createElement(
              Link,
              { href: `mailto:${props.supportEmail}`, style: subtleLink },
              props.supportEmail,
            ),
            '.',
          ),
          React.createElement(
            Text,
            { style: footerText },
            '— Digital Delivery Team',
          ),
        ),
      ),
    ),
  );
}
