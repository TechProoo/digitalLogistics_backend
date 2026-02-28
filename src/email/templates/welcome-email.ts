import * as React from 'react';
import {
  Body,
  Button,
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

export type WelcomeEmailProps = {
  name?: string | null;
  appUrl: string;
  supportEmail: string;
  logoUrl: string;
};

function normalizeBaseUrl(url: string) {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return 'https://digitaldelivery.org';
  return trimmed.replace(/\/+$/, '');
}

export function welcomeEmailText(props: WelcomeEmailProps) {
  const appUrl = normalizeBaseUrl(props.appUrl);
  const name = (props.name ?? '').trim() || 'there';

  return [
    `Hi ${name},`,
    '',
    'Welcome to Digital Delivery.',
    '',
    `Get started: ${appUrl}/dashboard`,
    `Track a shipment: ${appUrl}/tracking`,
    '',
    `Need help? Email us at ${props.supportEmail}`,
    '',
    '— Digital Delivery',
  ].join('\n');
}

export function WelcomeEmail(props: WelcomeEmailProps): React.ReactElement {
  const appUrl = normalizeBaseUrl(props.appUrl);
  const name = (props.name ?? '').trim() || 'there';

  const dashboardUrl = `${appUrl}/dashboard`;
  const trackingUrl = `${appUrl}/tracking`;

  const preheader = 'Welcome to Digital Delivery — get started in minutes.';

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

  const button = {
    backgroundColor: '#0ea5e9',
    borderRadius: '10px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '14px',
    fontWeight: 700,
    padding: '12px 18px',
    textDecoration: 'none',
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
          React.createElement(
            Section,
            { style: { marginBottom: '18px', textAlign: 'center' as const } },
            React.createElement(Img, {
              src: props.logoUrl,
              alt: 'Digital Delivery',
              style: logo,
            }),
          ),
          React.createElement(
            Text,
            { style: h1 },
            'Welcome to Digital Delivery',
          ),
          React.createElement(
            Text,
            { style: p },
            `Hi ${name}, thanks for creating your account. We\'re excited to help you ship, track, and manage deliveries with confidence.`,
          ),
          React.createElement(
            Text,
            { style: p },
            'Here are a few quick links to get you moving:',
          ),
          React.createElement(
            Section,
            { style: { marginTop: '16px', marginBottom: '10px' } },
            React.createElement(
              Button,
              { href: dashboardUrl, style: button },
              'Go to Dashboard',
            ),
          ),
          React.createElement(
            Text,
            { style: p },
            'Want to check a shipment right away? ',
            React.createElement(
              Link,
              { href: trackingUrl, style: subtleLink },
              'Track your package',
            ),
            '.',
          ),
          React.createElement(Hr, {
            style: { borderColor: '#e5e7eb', margin: '18px 0' },
          }),
          React.createElement(
            Text,
            { style: p },
            'Need help? Reply to this email or contact us at ',
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
            `If you didn\'t create this account, you can ignore this email.`,
          ),
        ),
      ),
    ),
  );
}
