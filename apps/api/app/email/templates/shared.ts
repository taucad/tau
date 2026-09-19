import { createElement, Fragment } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from 'react-email';
import { dark, fontStack, light, radius } from '#email/templates/email-palette.generated.js';

export type LayoutOptions = {
  /** Origin serving /wordmark.png and /fonts/*.woff2; the frontend origin in production. */
  readonly assetBase: string;
  /** Frontend origin used for the footer links. */
  readonly siteUrl: string;
};

export type TauEmailLayoutProps = LayoutOptions & {
  readonly subject: string;
  /** Inbox preheader; complements the subject instead of repeating it. Max 90 characters. */
  readonly preheader: string;
  /** Mono kicker above the heading, authored in sentence case and rendered uppercase. */
  readonly kicker: string;
  readonly heading: string;
  /** Footer sentence explaining why this person received the email. */
  readonly reason: string;
  readonly children?: ReactNode;
};

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: light.canvas,
    fontFamily: fontStack.sans,
    color: light.foreground,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React inline styles name vendor-prefixed properties in PascalCase
    WebkitFontSmoothing: 'antialiased',
  },
  container: { maxWidth: '560px', margin: '0 auto', padding: '32px 24px' },
  header: { padding: '0 0 20px' },
  card: {
    backgroundColor: light.surface,
    border: `1px solid ${light.border}`,
    borderRadius: `${radius.lg}px`,
    padding: '32px',
  },
  kicker: {
    margin: '0 0 12px',
    fontFamily: fontStack.mono,
    fontSize: '12px',
    lineHeight: '16px',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: light.muted,
  },
  heading: {
    margin: '0 0 16px',
    fontSize: '24px',
    lineHeight: '32px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: light.foreground,
  },
  text: { margin: '0 0 16px', fontSize: '15px', lineHeight: '24px', color: light.foreground },
  note: { margin: '0', fontSize: '13px', lineHeight: '20px', color: light.muted },
  detail: { margin: '8px 0 24px', backgroundColor: light.detail, borderRadius: `${radius.md}px`, padding: '4px 16px' },
  detailLabel: {
    margin: 0,
    padding: '10px 0',
    fontSize: '13px',
    lineHeight: '20px',
    color: light.muted,
    verticalAlign: 'top',
  },
  detailValue: {
    margin: 0,
    padding: '10px 0',
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: 500,
    color: light.foreground,
    textAlign: 'right',
    verticalAlign: 'top',
  },
  // Mirrors the app's default Button (`primary-action shadow-xs`, h-8 px-4 text-sm font-medium rounded-md).
  // backgroundColor is the flat fallback for clients that drop background-image, such as Outlook for Windows.
  // The border is authored in both schemes so the box never changes size; only its colour is swapped for dark,
  // where it becomes the rim that makes the button identifiable. Padding absorbs the edge: 5 + 20 + 5 + 2 = 32.
  action: {
    display: 'inline-block',
    backgroundColor: light.action,
    backgroundImage: light.actionSheen,
    boxShadow: light.actionShadow,
    border: `1px solid ${light.actionBorder}`,
    color: light.actionForeground,
    borderRadius: `${radius.md}px`,
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: 500,
    padding: '5px 15px',
    textDecoration: 'none',
  },
  fallbackLabel: { margin: '0 0 4px', fontSize: '12px', lineHeight: '18px', color: light.muted },
  fallbackUrl: {
    margin: '0 0 24px',
    fontFamily: fontStack.mono,
    fontSize: '12px',
    lineHeight: '18px',
    color: light.muted,
    wordBreak: 'break-all',
  },
  rule: { borderTop: `1px solid ${light.border}`, borderBottom: 'none', margin: '24px 0' },
  footer: { padding: '24px 0 0' },
  footerText: { margin: '0 0 8px', fontSize: '12px', lineHeight: '18px', color: light.muted },
  footerLink: { color: light.muted, textDecoration: 'underline' },
  inlineLink: { color: light.foreground, textDecoration: 'underline' },
} as const satisfies Record<string, CSSProperties>;

/** React-email's Font emits a global `*` rule, so only one may exist; the mono face is a plain @font-face. */
const monoFontFace = (assetBase: string): string =>
  `@font-face { font-family: 'Geist Mono'; font-style: normal; font-weight: 100 900; mso-font-alt: 'Consolas'; src: url(${assetBase}/fonts/GeistMono-Variable.woff2) format('woff2'); }`;

/** Only the rules inline styles cannot express: the dark scheme and the narrow-width reflow. */
const responsiveCss = `
  @media (max-width: 600px) {
    /* react-email moves Section padding onto the inner cell, so the overrides target the cell, not the table. */
    .tau-container > tbody > tr > td { padding: 16px !important; }
    .tau-card > tbody > tr > td { padding: 24px 20px !important; }
    .tau-action { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
    .tau-detail-label, .tau-detail-value { display: block !important; width: 100% !important; text-align: left !important; }
    .tau-detail-label { padding-bottom: 0 !important; }
    .tau-detail-value { padding-top: 2px !important; }
  }
  @media (prefers-color-scheme: dark) {
    /* Body puts the className on <body> but repeats the same inline background on an unclassed wrapper cell that
       paints over it. Both have to be overridden or the page stays light around the card. */
    .tau-body,
    .tau-body > table > tbody > tr > td { background-color: ${dark.canvas} !important; }
    .tau-card { background-color: ${dark.surface} !important; border-color: ${dark.border} !important; }
    .tau-fg, .tau-fg a { color: ${dark.foreground} !important; }
    .tau-muted, .tau-muted a { color: ${dark.muted} !important; }
    .tau-detail { background-color: ${dark.detail} !important; }
    .tau-rule { border-top-color: ${dark.border} !important; }
    /* Row authors its separator inline on the row table; without this the rows keep the light border. */
    .tau-rule-row,
    .tau-rule-row > tbody > tr,
    .tau-rule-row > tbody > tr > td { border-top-color: ${dark.rowBorder} !important; }
    .tau-action { background-color: ${dark.action} !important; background-image: ${light.actionSheen} !important; border-color: ${dark.actionBorder} !important; color: ${dark.actionForeground} !important; }
  }
`;

export const tauEmailLayout = ({
  assetBase,
  siteUrl,
  subject,
  preheader,
  kicker,
  heading,
  reason,
  children,
}: TauEmailLayoutProps): ReactElement =>
  createElement(
    Html,
    { lang: 'en', dir: 'ltr' },
    createElement(
      Head,
      null,
      createElement('title', null, subject),
      createElement('meta', { name: 'color-scheme', content: 'light dark' }),
      createElement('meta', { name: 'supported-color-schemes', content: 'light dark' }),
      createElement(Font, {
        fontFamily: 'Geist',
        fallbackFontFamily: ['Helvetica', 'Arial', 'sans-serif'],
        webFont: { url: `${assetBase}/fonts/Geist-Variable.woff2`, format: 'woff2' },
        fontWeight: '100 900',
      }),
      createElement('style', null, `${monoFontFace(assetBase)}${responsiveCss}`),
    ),
    createElement(Preview, null, preheader),
    createElement(
      Body,
      { className: 'tau-body', style: styles.body },
      createElement(
        Container,
        { className: 'tau-container', style: styles.container },
        createElement(
          Section,
          { style: styles.header },
          createElement(Img, {
            src: `${assetBase}/wordmark.png`,
            width: '56',
            height: '21',
            alt: 'Tau',
            style: { display: 'block' },
          }),
        ),
        createElement(
          Section,
          { className: 'tau-card', style: styles.card },
          createElement(Text, { className: 'tau-muted', style: styles.kicker }, kicker),
          createElement(Heading, { as: 'h1', className: 'tau-fg', style: styles.heading }, heading),
          children,
        ),
        createElement(
          Section,
          { style: styles.footer },
          createElement(Text, { className: 'tau-muted', style: styles.footerText }, reason),
          // Operator ruling 2026-09-16 (OQ3): lowercase entity name, city and country retained.
          createElement(
            Text,
            { className: 'tau-muted', style: styles.footerText },
            'Tau · taucad limited · Auckland, New Zealand',
          ),
          createElement(
            Text,
            { className: 'tau-muted', style: styles.footerText },
            createElement(Link, { href: 'https://docs.tau.new', style: styles.footerLink }, 'Help'),
            ' · ',
            createElement(Link, { href: `${siteUrl}/legal/privacy`, style: styles.footerLink }, 'Privacy'),
            ' · ',
            createElement(Link, { href: `${siteUrl}/legal/terms`, style: styles.footerLink }, 'Terms'),
          ),
        ),
      ),
    ),
  );

export const paragraph = ({ children }: { readonly children?: ReactNode }): ReactElement =>
  createElement(Text, { className: 'tau-fg', style: styles.text }, children);

export const strong = ({ children }: { readonly children?: ReactNode }): ReactElement =>
  createElement('strong', { style: { fontWeight: 600 } }, children);

export const inlineLink = ({
  href,
  children,
}: {
  readonly href: string;
  readonly children?: ReactNode;
}): ReactElement => createElement(Link, { href, style: styles.inlineLink }, children);

export type DetailRow = { readonly label: string; readonly value: ReactNode };

/** Label/value rows describing the object the email is about. Rows with an absent value are dropped. */
export const details = ({
  rows,
}: {
  readonly rows: ReadonlyArray<DetailRow | undefined>;
}): ReactElement | undefined => {
  const present = rows.filter((row): row is DetailRow => row !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  return createElement(
    Section,
    { className: 'tau-detail', style: styles.detail },
    ...present.map((row, index) =>
      createElement(Row, {
        key: row.label,
        style: index > 0 ? { borderTop: `1px solid ${light.rowBorder}` } : undefined,
        className: index > 0 ? 'tau-detail-row tau-rule-row' : 'tau-detail-row',
        // oxlint-disable-next-line react/no-children-prop -- Row requires children in its props type, so createElement's variadic form does not typecheck against it.
        children: [
          createElement(
            Column,
            { key: 'label', className: 'tau-detail-label tau-muted', style: styles.detailLabel },
            row.label,
          ),
          createElement(
            Column,
            { key: 'value', className: 'tau-detail-value tau-fg', style: styles.detailValue },
            row.value,
          ),
        ],
      }),
    ),
  );
};

/**
 * Primary action plus the same URL as selectable text for clients that block or rewrite buttons.
 * The fallback block carries `data-skip-in-text` so the plain-text part states the URL once.
 */
export const primaryAction = ({
  href,
  children,
}: {
  readonly href: string;
  readonly children?: ReactNode;
}): ReactElement =>
  createElement(
    Fragment,
    null,
    createElement(
      Section,
      { style: { margin: '24px 0 20px' } },
      createElement(Button, { href, className: 'tau-action', style: styles.action }, children),
    ),
    createElement(
      'div',
      { 'data-skip-in-text': 'true' },
      createElement(
        Text,
        { className: 'tau-muted', style: styles.fallbackLabel },
        'Or paste this link into your browser:',
      ),
      createElement(
        Text,
        { className: 'tau-muted', style: styles.fallbackUrl },
        createElement(Link, { href, style: { color: 'inherit', textDecoration: 'underline' } }, href),
      ),
    ),
  );

/** Closing security or reassurance line, separated from the body by a rule. */
export const note = ({ children }: { readonly children?: ReactNode }): ReactElement =>
  createElement(
    Fragment,
    null,
    createElement(Hr, { className: 'tau-rule', style: styles.rule }),
    createElement(Text, { className: 'tau-muted', style: styles.note }, children),
  );
