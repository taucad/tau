import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { Environment } from '@taucad/api-core';
import type { EmailMessage, EmailTemplateKind } from '#email.types.js';
import { renderEmailTemplate, subjectForEmailTemplate } from '#email-templates.js';
import { assertEmailTemplateUrlAllowed } from '#email-link-builder.js';

/** Why an email is sent, which decides the address it comes from (email readiness, Part C). */
type SenderClass = 'identity' | 'notifications' | 'billing';

/** Exhaustive, so a new template kind cannot ship without choosing its sender. */
const senderClassByKind: Record<EmailTemplateKind, SenderClass> = {
  'verify-email': 'identity',
  'account-exists': 'identity',
  'magic-link': 'identity',
  'reset-password': 'identity',
  'password-changed': 'identity',
  'publication-invite': 'notifications',
  'payment-failed': 'billing',
  'auto-reload-disabled': 'billing',
  'auto-reload-action-required': 'billing',
};

const senderVariableByClass = {
  identity: 'TAU_EMAIL_FROM',
  notifications: 'TAU_EMAIL_FROM_NOTIFICATIONS',
  billing: 'TAU_EMAIL_FROM_BILLING',
} as const satisfies Record<SenderClass, keyof Environment>;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(this.constructor.name);
  private readonly resend: Resend | undefined;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const apiKey = this.getResendApiKey();
    this.resend = apiKey ? new Resend(apiKey) : undefined;
  }

  public async send(message: EmailMessage): Promise<void> {
    const templateKind = message.template.kind;
    const frontendURL = this.configService.get('TAU_FRONTEND_URL', { infer: true });
    assertEmailTemplateUrlAllowed({ template: message.template, frontendURL });

    // The frontend origin serves the wordmark and the Geist files the templates reference.
    const rendered = await renderEmailTemplate(message.template, { siteUrl: frontendURL, assetBase: frontendURL });
    const subject = message.subject ?? subjectForEmailTemplate(message.template);

    if (!this.resend) {
      this.logger.log(
        `Email delivery disabled because RESEND_API_KEY is not set; rendered ${templateKind} email for ${this.describeRecipient(message.to)}`,
      );
      return;
    }

    const response = await this.resend.emails.send({
      from: this.senderFor(templateKind),
      to: message.to,
      replyTo: this.configService.get('TAU_EMAIL_REPLY_TO', { infer: true }),
      subject,
      html: rendered.html,
      text: rendered.text,
      // A unique reference per send stops Gmail threading same-subject transactional emails into one conversation,
      // where it trims repeated content and buries the newest link (email readiness R8).
      headers: { 'X-Entity-Ref-ID': randomUUID() },
    });

    if (response.error) {
      this.logger.error(
        `Resend failed for ${templateKind} email to ${this.describeRecipient(message.to)}: ${response.error.message}`,
      );
      throw new Error(`Failed to send ${templateKind} email`);
    }

    this.logger.log(
      `Sent ${templateKind} email to ${this.describeRecipient(message.to)} via Resend (${response.data.id})`,
    );
  }

  public async sendMagicLink(args: {
    readonly email: string;
    readonly url: string;
    readonly device?: string;
  }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'magic-link', ...args } });
  }

  public async sendResetPassword(args: {
    readonly email: string;
    readonly url: string;
    readonly device?: string;
  }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'reset-password', ...args } });
  }

  public async sendPasswordChanged(args: {
    readonly email: string;
    readonly changedAt: string;
    readonly url: string;
    readonly device?: string;
  }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'password-changed', ...args } });
  }

  public async sendVerification(args: { readonly email: string; readonly url: string }): Promise<void> {
    await this.send({
      to: args.email,
      template: { kind: 'verify-email', ...args },
    });
  }

  /** Answers a sign-up for an address that already has a verified account, instead of silence. */
  public async sendAccountExists(args: {
    readonly email: string;
    readonly url: string;
    readonly resetUrl: string;
    readonly device?: string;
  }): Promise<void> {
    await this.send({
      to: args.email,
      template: { kind: 'account-exists', ...args },
    });
  }

  public async sendPaymentFailed(args: {
    readonly email: string;
    readonly billingUrl: string;
    readonly plan?: string;
    readonly amount?: string;
    readonly nextAttemptAt?: string;
    readonly paymentMethodSummary?: string;
  }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'payment-failed', ...args } });
  }

  public async sendAutoReloadDisabled(args: { readonly email: string; readonly billingUrl: string }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'auto-reload-disabled', ...args } });
  }

  public async sendAutoReloadActionRequired(args: {
    readonly email: string;
    readonly billingUrl: string;
  }): Promise<void> {
    await this.send({ to: args.email, template: { kind: 'auto-reload-action-required', ...args } });
  }

  public async sendPublicationInvite(args: {
    readonly recipientEmail: string;
    readonly ownerName: string;
    readonly publicationTitle: string;
    readonly url: string;
  }): Promise<void> {
    await this.send({ to: args.recipientEmail, template: { kind: 'publication-invite', ...args } });
  }

  /**
   * The From address for a template kind. An unset or empty purpose sender falls back to `TAU_EMAIL_FROM`
   * here rather than only in the Nest schema, because the billing worker builds this service from raw
   * `process.env`, where a missing key reads as `''`.
   */
  private senderFor(kind: EmailTemplateKind): string {
    const fallback = this.configService.get('TAU_EMAIL_FROM', { infer: true });
    const sender = this.configService.get(senderVariableByClass[senderClassByKind[kind]], { infer: true });
    return sender === undefined || sender.trim() === '' ? fallback : sender;
  }

  private describeRecipient(email: string): string {
    const [, domain = 'unknown-domain'] = email.split('@');
    return `recipient@${domain}`;
  }

  private getResendApiKey(): string | undefined {
    const apiKey = this.configService.get('RESEND_API_KEY', { infer: true }).trim();
    return apiKey === '' ? undefined : apiKey;
  }
}
