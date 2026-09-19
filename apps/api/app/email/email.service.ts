import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Environment } from '#config/environment.config.js';
import type { EmailMessage } from '#email/email.types.js';
import { renderEmailTemplate, subjectForEmailTemplate } from '#email/email-templates.js';
import { assertEmailTemplateUrlAllowed } from '#email/email-link-builder.js';

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
      from: this.configService.get('TAU_EMAIL_FROM', { infer: true }),
      to: message.to,
      replyTo: this.configService.get('TAU_EMAIL_REPLY_TO', { infer: true }),
      subject,
      html: rendered.html,
      text: rendered.text,
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
    await this.send({ to: args.email, template: { kind: 'verify-email', ...args } });
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

  public async sendPublicationInvite(args: {
    readonly recipientEmail: string;
    readonly ownerName: string;
    readonly publicationTitle: string;
    readonly url: string;
  }): Promise<void> {
    await this.send({ to: args.recipientEmail, template: { kind: 'publication-invite', ...args } });
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
