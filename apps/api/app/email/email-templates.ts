import { createElement } from 'react';
import type { ReactElement } from 'react';
import { render, toPlainText } from 'react-email';
import type { EmailTemplate, RenderedEmail } from '#email/email.types.js';
import { expiresIn, footerCopy } from '#email/email-copy.js';
import {
  details,
  inlineLink,
  note,
  paragraph,
  primaryAction,
  strong,
  tauEmailLayout,
} from '#email/templates/shared.js';
import type { DetailRow, LayoutOptions } from '#email/templates/shared.js';

export type EmailSpec = {
  readonly subject: string;
  /** Max 90 characters, and never a restatement of the subject. */
  readonly preheader: string;
  readonly kicker: string;
  readonly heading: string;
  /** Footer sentence explaining why this person received the email. */
  readonly reason: string;
  /** Body elements in the fixed order: paragraphs, detail rows, action, note. */
  readonly body: ReadonlyArray<ReactElement | undefined>;
};

const row = (label: string, value: string | undefined): DetailRow | undefined =>
  value === undefined ? undefined : { label, value };

export const specForEmailTemplate = (template: EmailTemplate): EmailSpec => {
  switch (template.kind) {
    case 'magic-link': {
      return {
        subject: 'Your sign-in link for Tau',
        preheader: `This link signs you in once and expires in ${expiresIn('magicLink')}.`,
        kicker: 'Sign in',
        heading: 'Sign in to Tau',
        reason: `You received this email because someone asked to sign in to Tau as ${template.email}.`,
        body: [
          createElement(
            paragraph,
            null,
            'Use the button below to sign in as ',
            createElement(strong, null, template.email),
            `. The link works once and expires in ${expiresIn('magicLink')}.`,
          ),
          createElement(details, { rows: [row('Device', template.device)] }),
          createElement(primaryAction, { href: template.url }, 'Sign in to Tau'),
          createElement(
            note,
            null,
            "If you didn't request this, you can ignore this email. Nobody can sign in without this link.",
          ),
        ],
      };
    }
    case 'reset-password': {
      return {
        subject: 'Reset your Tau password',
        preheader: 'Choose a new password within the next hour. Nothing changes until you do.',
        kicker: 'Password reset',
        heading: 'Reset your password',
        reason: `You received this email because a password reset was requested for ${template.email}.`,
        body: [
          createElement(
            paragraph,
            null,
            'We received a request to reset the password for ',
            createElement(strong, null, template.email),
            `. The link expires in ${expiresIn('resetPassword')}.`,
          ),
          createElement(paragraph, null, 'Choosing a new password signs out every other session on your account.'),
          createElement(details, { rows: [row('Device', template.device)] }),
          createElement(primaryAction, { href: template.url }, 'Choose a new password'),
          createElement(
            note,
            null,
            "If you didn't request this, your password stays the same and you can ignore this email.",
          ),
        ],
      };
    }
    case 'password-changed': {
      return {
        subject: 'Your Tau password was changed',
        preheader: "If this was you, there's nothing to do. If not, secure your account now.",
        kicker: 'Security',
        heading: 'Your password was changed',
        reason: `You received this email because the password for ${template.email} was changed.`,
        body: [
          createElement(
            paragraph,
            null,
            'The password for ',
            createElement(strong, null, template.email),
            ' was changed and other sessions were signed out.',
          ),
          createElement(details, {
            rows: [row('Account', template.email), row('When', template.changedAt), row('Device', template.device)],
          }),
          createElement(paragraph, null, "If this was you, there's nothing else to do."),
          createElement(primaryAction, { href: template.url }, "I didn't do this"),
          createElement(
            note,
            null,
            "That button starts a new password reset for this address. If you can't sign in afterwards, reply to this email and we'll help.",
          ),
        ],
      };
    }
    case 'verify-email': {
      return {
        subject: 'Confirm your email for Tau',
        preheader: `One click finishes setting up your account. The link expires in ${expiresIn('verifyEmail')}.`,
        kicker: 'Email verification',
        heading: 'Confirm your email address',
        reason: `You received this email because a Tau account was created with ${template.email}.`,
        body: [
          createElement(
            paragraph,
            null,
            'Confirm ',
            createElement(strong, null, template.email),
            ` to finish setting up your Tau account. The link expires in ${expiresIn('verifyEmail')}.`,
          ),
          createElement(primaryAction, { href: template.url }, 'Confirm email'),
          createElement(
            note,
            null,
            "If you didn't create a Tau account, you can ignore this email and no account will be activated.",
          ),
        ],
      };
    }
    case 'publication-invite': {
      return {
        subject: `${template.ownerName} shared “${template.publicationTitle}” with you on Tau`,
        preheader: `Sign in as ${template.recipientEmail} to open this private design.`,
        kicker: 'Shared with you',
        heading: `${template.ownerName} shared a design with you`,
        reason: `You received this email because ${template.ownerName} added ${template.recipientEmail} to a private Tau design.`,
        body: [
          createElement(
            paragraph,
            null,
            'This design is private. Sign in with ',
            createElement(strong, null, template.recipientEmail),
            ' to view it in the Tau viewer.',
          ),
          createElement(details, {
            rows: [
              row('Design', template.publicationTitle),
              row('Shared by', template.ownerName),
              row('Access', 'Private · invited recipients only'),
            ],
          }),
          createElement(primaryAction, { href: template.url }, 'Open design'),
          createElement(
            note,
            null,
            "If you weren't expecting this, you can ignore this email. Opening the link only shows the design to you.",
          ),
        ],
      };
    }
    case 'payment-failed': {
      const retry =
        template.nextAttemptAt === undefined
          ? 'We retry automatically over the next few days.'
          : `We retry automatically on ${template.nextAttemptAt}.`;
      return {
        subject: 'Action needed: your Tau Pro payment failed',
        preheader: `Update your payment method to keep Pro. ${retry}`,
        kicker: 'Billing',
        heading: "We couldn't process your Pro payment",
        reason: `You received this email because ${template.email} has an active Tau Pro subscription.`,
        body: [
          createElement(
            paragraph,
            null,
            'The renewal payment for ',
            createElement(strong, null, template.email),
            " didn't go through. We'll retry automatically; update your payment method to keep Pro without interruption.",
          ),
          createElement(details, {
            rows: [
              row('Plan', template.plan),
              row('Amount', template.amount),
              row('Next attempt', template.nextAttemptAt),
              row('Payment method', template.paymentMethodSummary),
            ],
          }),
          createElement(primaryAction, { href: template.billingUrl }, 'Update payment method'),
          createElement(
            note,
            null,
            'Your projects and credits stay safe either way. Questions? Reply to this email or visit ',
            createElement(inlineLink, { href: footerCopy.helpUrl }, 'the help docs'),
            '.',
          ),
        ],
      };
    }
  }
};

/**
 * Merged with react-email's own defaults, which skip images and `data-skip-in-text` blocks.
 * Without these the plain-text part shouts the heading, drops the wordmark and runs each detail
 * label straight into its value. html-to-text's own image formatter prints the src beside the alt,
 * which is noise in a mail client, so the wordmark gets a formatter that emits only its alt text.
 */
const plainTextOptions = {
  formatters: {
    altTextOnly: (
      element: { readonly attribs?: Record<string, string> },
      _walk: unknown,
      builder: { addInline: (text: string) => void },
    ): void => {
      builder.addInline(element.attribs?.['alt'] ?? '');
    },
  },
  selectors: [
    { selector: 'h1', options: { uppercase: false } },
    { selector: 'img', format: 'altTextOnly' },
    { selector: '.tau-detail-row', format: 'dataTable' },
  ],
};

export const subjectForEmailTemplate = (template: EmailTemplate): string => specForEmailTemplate(template).subject;

export const renderEmailTemplate = async (template: EmailTemplate, options: LayoutOptions): Promise<RenderedEmail> => {
  const { body, ...spec } = specForEmailTemplate(template);
  const html = await render(createElement(tauEmailLayout, { ...spec, ...options }, ...body));
  return {
    html,
    text: toPlainText(html, plainTextOptions),
  };
};
