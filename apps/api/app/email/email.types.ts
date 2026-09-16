export type EmailTemplateKind =
  | 'magic-link'
  | 'reset-password'
  | 'password-changed'
  | 'verify-email'
  | 'publication-invite'
  | 'payment-failed';

export type EmailMessage = {
  readonly to: string;
  readonly subject?: string;
  readonly template: EmailTemplate;
};

export type MagicLinkEmailTemplate = {
  readonly kind: 'magic-link';
  readonly email: string;
  readonly url: string;
  /** Coarse request-context label such as `Safari on macOS`; the row is dropped when absent. */
  readonly device?: string;
};

export type ResetPasswordEmailTemplate = {
  readonly kind: 'reset-password';
  readonly email: string;
  readonly url: string;
  readonly device?: string;
};

export type PasswordChangedEmailTemplate = {
  readonly kind: 'password-changed';
  readonly email: string;
  /** Pre-formatted timestamp; the email module does not format dates. */
  readonly changedAt: string;
  /** Forgot-password link for a recipient who did not make the change. */
  readonly url: string;
  readonly device?: string;
};

export type VerifyEmailTemplate = {
  readonly kind: 'verify-email';
  readonly email: string;
  readonly url: string;
};

export type PublicationInviteEmailTemplate = {
  readonly kind: 'publication-invite';
  readonly recipientEmail: string;
  readonly ownerName: string;
  readonly publicationTitle: string;
  readonly url: string;
};

export type PaymentFailedEmailTemplate = {
  readonly kind: 'payment-failed';
  readonly email: string;
  /** Billing-settings deep link where the card can be updated. */
  readonly billingUrl: string;
  // Pre-formatted strings; the email module formats neither money nor dates. Each row is dropped when absent.
  readonly plan?: string;
  readonly amount?: string;
  readonly nextAttemptAt?: string;
  readonly paymentMethodSummary?: string;
};

export type EmailTemplate =
  | MagicLinkEmailTemplate
  | ResetPasswordEmailTemplate
  | PasswordChangedEmailTemplate
  | VerifyEmailTemplate
  | PublicationInviteEmailTemplate
  | PaymentFailedEmailTemplate;

export type RenderedEmail = {
  readonly html: string;
  readonly text: string;
};
