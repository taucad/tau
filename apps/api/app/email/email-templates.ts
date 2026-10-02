import { createElement } from 'react';
import { render, toPlainText } from 'react-email';
import type { EmailTemplate, RenderedEmail } from '#email/email.types.js';
import { bodyText, fallbackLink, mutedText, primaryAction, tauEmailLayout } from '#email/templates/shared.js';

export const subjectForEmailTemplate = (template: EmailTemplate): string => {
  switch (template.kind) {
    case 'magic-link':
      return 'Sign in to Tau';
    case 'reset-password':
      return 'Reset your Tau password';
    case 'verify-email':
      return 'Verify your Tau email';
    case 'publication-invite':
      return `${template.ownerName} shared a Tau design with you`;
  }
};

export const renderEmailTemplate = async (template: EmailTemplate): Promise<RenderedEmail> => {
  const element = (() => {
    switch (template.kind) {
      case 'magic-link':
        return createElement(
          tauEmailLayout,
          {
            preview: 'Use this secure link to continue to Tau.',
            heading: 'Continue to Tau',
          },
          createElement(bodyText, null, `We received a request to sign in as ${template.email}.`),
          createElement(bodyText, null, 'Use the secure link below to continue.'),
          createElement(primaryAction, { href: template.url }, 'Continue to Tau'),
          createElement(fallbackLink, { href: template.url }),
          createElement(mutedText, null, "If you didn't request this, you can safely ignore this email."),
        );
      case 'reset-password':
        return createElement(
          tauEmailLayout,
          {
            preview: 'Reset your Tau password.',
            heading: 'Reset your password',
          },
          createElement(bodyText, null, `We received a password reset request for ${template.email}.`),
          createElement(primaryAction, { href: template.url }, 'Reset password'),
          createElement(fallbackLink, { href: template.url }),
          createElement(mutedText, null, "If you didn't request this, no changes were made."),
        );
      case 'verify-email':
        return createElement(
          tauEmailLayout,
          {
            preview: 'Verify your Tau email address.',
            heading: 'Verify your email',
          },
          createElement(bodyText, null, `Confirm ${template.email} so your Tau account is ready to use.`),
          createElement(primaryAction, { href: template.url }, 'Verify email'),
          createElement(fallbackLink, { href: template.url }),
        );
      case 'publication-invite':
        return createElement(
          tauEmailLayout,
          {
            preview: `${template.ownerName} shared a private Tau design with you.`,
            heading: 'A private design was shared with you',
          },
          createElement(
            bodyText,
            null,
            `${template.ownerName} shared "${template.publicationTitle}" with ${template.recipientEmail}.`,
          ),
          createElement(bodyText, null, 'Sign in with this email address to open the private viewer.'),
          createElement(primaryAction, { href: template.url }, 'Open design'),
          createElement(fallbackLink, { href: template.url }),
        );
    }
  })();

  const html = await render(element);
  return {
    html,
    text: toPlainText(html),
  };
};
