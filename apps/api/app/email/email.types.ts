export type EmailTemplateKind = 'magic-link' | 'reset-password' | 'verify-email' | 'publication-invite';

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly template: EmailTemplate;
};

export type MagicLinkEmailTemplate = {
  readonly kind: 'magic-link';
  readonly email: string;
  readonly url: string;
};

export type ResetPasswordEmailTemplate = {
  readonly kind: 'reset-password';
  readonly email: string;
  readonly url: string;
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

export type EmailTemplate =
  | MagicLinkEmailTemplate
  | ResetPasswordEmailTemplate
  | VerifyEmailTemplate
  | PublicationInviteEmailTemplate;

export type RenderedEmail = {
  readonly html: string;
  readonly text: string;
};
