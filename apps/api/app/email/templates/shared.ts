import { createElement, Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from 'react-email';

const colors = {
  background: '#fcffff',
  surface: '#ffffff',
  text: '#000301',
  mutedSurface: '#ecf4f1',
  muted: '#4b5953',
  border: '#d8e0dd',
  accent: '#00987c',
  accentText: '#f9fffe',
} as const;

const bodyStyle: CSSProperties = {
  margin: 0,
  backgroundColor: colors.background,
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: colors.text,
};

const containerStyle: CSSProperties = {
  width: '100%',
  maxWidth: '600px',
  margin: '0 auto',
  padding: '32px 20px',
};

const cardStyle: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  padding: '32px',
};

const logoMarkStyle: CSSProperties = {
  display: 'inline-block',
  width: '32px',
  height: '32px',
  margin: '0 8px 0 0',
  verticalAlign: 'middle',
};

const wordmarkStyle: CSSProperties = {
  display: 'inline-block',
  margin: 0,
  fontSize: '18px',
  lineHeight: '32px',
  fontWeight: 700,
  letterSpacing: '0',
  color: colors.text,
  verticalAlign: 'middle',
};

const headingStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '24px',
  lineHeight: '32px',
  fontWeight: 650,
  color: colors.text,
};

const textStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '15px',
  lineHeight: '24px',
  color: colors.text,
};

const mutedTextStyle: CSSProperties = {
  margin: '0 0 16px',
  fontSize: '13px',
  lineHeight: '20px',
  color: colors.muted,
};

const buttonStyle: CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: '6px',
  color: colors.accentText,
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 650,
  lineHeight: '20px',
  padding: '12px 18px',
  textDecoration: 'none',
};

const fallbackUrlStyle: CSSProperties = {
  ...mutedTextStyle,
  wordBreak: 'break-all',
};

type TauEmailLayoutProps = {
  readonly preview: string;
  readonly heading: string;
  readonly children?: ReactNode;
};

const tauLogo = (): React.ReactElement =>
  createElement(
    'svg',
    {
      'aria-label': 'Tau logo',
      fill: 'none',
      height: '32',
      role: 'img',
      style: logoMarkStyle,
      viewBox: '0 0 512 512',
      width: '32',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    createElement('path', {
      d: 'M256 37.873 392.533 2.622l102.4 26.441L256 90.754 17.067 29.063l102.4-26.441L256 37.873ZM0 59.906l238.933 61.692v387.78l-51.2-13.218V161.261L0 112.792V59.906Zm512 0-238.933 61.692v387.78l51.2-13.218V161.261L512 112.787V59.906Z',
      fill: '#008f7b',
    }),
  );

export const tauEmailLayout = ({ preview, heading, children }: TauEmailLayoutProps): React.ReactElement =>
  createElement(
    Html,
    { lang: 'en' },
    createElement(Head),
    createElement(Preview, null, preview),
    createElement(
      Body,
      { style: bodyStyle },
      createElement(
        Container,
        { style: containerStyle },
        createElement(
          Section,
          { style: cardStyle },
          createElement(
            Section,
            { style: { margin: '0 0 24px' } },
            tauLogo(),
            createElement(Text, { style: wordmarkStyle }, 'Tau'),
          ),
          createElement(Heading, { as: 'h1', style: headingStyle }, heading),
          children,
          createElement(Hr, { style: { borderColor: colors.border, margin: '28px 0 18px' } }),
          createElement(
            Text,
            { style: mutedTextStyle },
            'Tau is the AI-native CAD workspace for building, sharing, and iterating on designs.',
          ),
        ),
      ),
    ),
  );

export const bodyText = ({ children }: { readonly children: ReactNode }): React.ReactElement =>
  createElement(Text, { style: textStyle }, children);

export const mutedText = ({ children }: { readonly children: ReactNode }): React.ReactElement =>
  createElement(Text, { style: mutedTextStyle }, children);

export const primaryAction = ({
  href,
  children,
}: {
  readonly href: string;
  readonly children?: ReactNode;
}): React.ReactElement =>
  createElement(
    Section,
    { style: { margin: '24px 0' } },
    createElement(Button, { href, style: buttonStyle }, children),
  );

export const fallbackLink = ({ href }: { readonly href: string }): React.ReactElement =>
  createElement(
    Fragment,
    null,
    createElement(mutedText, null, "If the button doesn't work, paste this link into your browser:"),
    createElement(
      Text,
      { style: fallbackUrlStyle },
      createElement(Link, { href, style: { color: colors.accent } }, href),
    ),
  );
