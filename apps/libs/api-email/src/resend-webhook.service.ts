import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { Resend } from 'resend';
import type { WebhookEventPayload } from 'resend';
import type { Environment } from '@taucad/api-core';
import type { DatabaseService } from '@taucad/api-database';
import { emailAddressState, emailEvent } from '@taucad/api-database/schema';
import type { MetricsService } from '@taucad/api-observability/metrics';
import type { EmailTemplateKind } from '#email.types.js';
import { emailEnvironmentOf, maskRecipient, normalizeEmailAddress } from '#email-address.js';
import type { UndeliverableEmailState } from '#email-deliverability.service.js';

/**
 * The Resend event types the webhook endpoint subscribes to (email bounce blueprint, "Subscribed events").
 * The Terraform registration in tau-cloud subscribes exactly these; anything else is acknowledged and dropped.
 * Not `email.opened` or `email.clicked`: Tau does not track readers.
 */
export const resendWebhookEventTypes = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'suppression.added',
  'suppression.removed',
] as const;

export type ResendWebhookEventType = (typeof resendWebhookEventTypes)[number];

/** What a verified delivery did. Every outcome answers 200, so Resend stops retrying. */
export type ResendWebhookOutcome = 'stored' | 'duplicate' | 'other_environment' | 'ignored';

/** The three `svix-*` headers of a delivery, as received. */
export type ResendWebhookHeaders = {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
};

type HandledEvent = Extract<WebhookEventPayload, { type: ResendWebhookEventType }>;

const templateKinds: ReadonlySet<string> = new Set<EmailTemplateKind>([
  'verify-email',
  'account-exists',
  'magic-link',
  'reset-password',
  'password-changed',
  'publication-invite',
  'project-invite',
  'payment-failed',
  'auto-reload-disabled',
  'auto-reload-action-required',
]);

const bounceTypes: ReadonlySet<string> = new Set(['Permanent', 'Transient', 'Undetermined']);

const stateByOrigin = {
  bounce: 'bounced',
  complaint: 'complained',
  manual: 'suppressed',
} as const satisfies Record<'bounce' | 'complaint' | 'manual', UndeliverableEmailState>;

/** Event types whose log line is a warning: each is mail that did not, or will not, arrive. */
const warningTypes: ReadonlySet<ResendWebhookEventType> = new Set([
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'suppression.added',
]);

/** One stored event, flattened to the columns of `email_event`. */
type StoredEvent = {
  readonly type: ResendWebhookEventType;
  readonly environment: string;
  readonly resendEmailId: string | undefined;
  readonly kind: string | undefined;
  readonly recipient: string | undefined;
  readonly bounceType: string | undefined;
  readonly bounceSubType: string | undefined;
  readonly origin: 'bounce' | 'complaint' | 'manual' | undefined;
  readonly occurredAt: Date;
};

type Transaction = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];

/**
 * Receives Resend's signed delivery events (email bounce blueprint R7).
 *
 * Verifies the raw body against `RESEND_WEBHOOK_SECRET`, stores each delivery once by its `svix-id`,
 * keeps `email_address_state` in step with Resend's suppression list, and writes one log line and one
 * `email.events` count per stored event. It makes no outbound call, so Resend's request is answered
 * within the handler.
 *
 * The log line is a contract with the Loki alert rules and must stay stable:
 *
 * ```text
 * Resend event <type> kind=<kind> bounce_type=<bounce_type> origin=<origin> env=<env> recipient=recipient@<domain>
 * Resend event <type> ignored reason=other_environment env=<env>
 * Resend webhook rejected <not_configured|missing_header|invalid_signature>
 * ```
 *
 * `kind` is the template kind or `unknown`; `bounce_type` is Resend's (`Permanent`, `Transient`,
 * `Undetermined`) or `none`; `origin` is a suppression's (`bounce`, `complaint`, `manual`) or `none`.
 */
export class ResendWebhookService {
  private readonly logger = new Logger(this.constructor.name);
  private readonly environment: string;

  public constructor(
    private readonly configService: Pick<ConfigService<Environment, true>, 'get'>,
    private readonly databaseService: Pick<DatabaseService, 'database'>,
    private readonly metrics: Pick<MetricsService, 'emailEventsTotal'>,
  ) {
    this.environment = emailEnvironmentOf(configService);
  }

  /**
   * Verifies and records one delivery.
   *
   * @param input - The raw body exactly as received, and the three `svix-*` headers.
   * @returns What the delivery did.
   * @throws ServiceUnavailableException when `RESEND_WEBHOOK_SECRET` is unset: nothing is accepted unsigned.
   * @throws BadRequestException when a header is missing or the signature, body or timestamp does not verify.
   */
  public async receive(input: {
    readonly payload: string;
    readonly headers: ResendWebhookHeaders;
  }): Promise<ResendWebhookOutcome> {
    const secret = this.configService.get('RESEND_WEBHOOK_SECRET', { infer: true }).trim();
    if (secret === '') {
      this.logger.warn('Resend webhook rejected not_configured');
      throw new ServiceUnavailableException('resend_webhook_not_configured');
    }
    const { id, timestamp, signature } = input.headers;
    if (!id || !timestamp || !signature) {
      this.logger.warn('Resend webhook rejected missing_header');
      throw new BadRequestException('invalid_resend_webhook');
    }

    let event: WebhookEventPayload;
    try {
      event = this.verifier().webhooks.verify({
        payload: input.payload,
        headers: { id, timestamp, signature },
        webhookSecret: secret,
      });
    } catch {
      // Covers a wrong secret, a re-serialised body and a timestamp outside the five-minute tolerance.
      this.logger.warn('Resend webhook rejected invalid_signature');
      throw new BadRequestException('invalid_resend_webhook');
    }

    if (!isHandled(event)) {
      return 'ignored';
    }
    const stored = this.flatten(event);
    if (stored.environment !== this.environment) {
      this.logger.log(`Resend event ${stored.type} ignored reason=other_environment env=${stored.environment}`);
      this.metrics.emailEventsTotal.add(1, {
        type: stored.type,
        outcome: 'other_environment',
      });
      return 'other_environment';
    }

    const inserted = await this.databaseService.database.transaction(async (tx) => {
      const rows = await tx
        .insert(emailEvent)
        .values({
          svixId: id,
          environment: stored.environment,
          type: stored.type,
          resendEmailId: stored.resendEmailId ?? null,
          kind: stored.kind ?? null,
          recipient: stored.recipient ?? null,
          bounceType: stored.bounceType ?? null,
          bounceSubType: stored.bounceSubType ?? null,
          occurredAt: stored.occurredAt,
        })
        .onConflictDoNothing()
        .returning({ svixId: emailEvent.svixId });
      if (rows[0] === undefined) {
        return undefined;
      }
      const kind = stored.kind ?? (await this.kindOfSourceEmail(tx, stored));
      await this.applyState(tx, id, { ...stored, kind });
      return { ...stored, kind };
    });
    if (inserted === undefined) {
      return 'duplicate';
    }

    this.report(inserted);
    return 'stored';
  }

  /** Signature checks need no API key; a sending-disabled server still verifies with a placeholder. */
  private verifier(): Resend {
    const apiKey = this.configService.get('RESEND_API_KEY', { infer: true }).trim();
    return new Resend(apiKey === '' ? 're_webhook_verification_only' : apiKey);
  }

  private flatten(event: HandledEvent): StoredEvent {
    const occurredAt = new Date(event.created_at);
    const when = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;
    if (event.type === 'suppression.added' || event.type === 'suppression.removed') {
      // Suppressions apply to the whole Resend team and carry no tags, so every environment mirrors them.
      return {
        type: event.type,
        environment: this.environment,
        resendEmailId: event.data.source_id ?? undefined,
        kind: undefined,
        recipient: normalizeEmailAddress(event.data.email),
        bounceType: undefined,
        bounceSubType: undefined,
        origin: event.data.origin,
        occurredAt: when,
      };
    }
    const { kind, env } = event.data.tags ?? {};
    const [recipient] = event.data.to;
    // Typed as always present on a bounce, but a malformed delivery must not turn into a 503 and a retry loop.
    const bounce: { readonly type?: string; readonly subType?: string } | undefined =
      event.type === 'email.bounced' ? (event.data.bounce as Partial<typeof event.data.bounce> | undefined) : undefined;
    return {
      type: event.type,
      // A send from before the tags shipped has no `env`; it can only be this environment's own.
      environment: env ?? this.environment,
      resendEmailId: event.data.email_id,
      kind: kind !== undefined && templateKinds.has(kind) ? kind : undefined,
      recipient: recipient === undefined ? undefined : normalizeEmailAddress(recipient),
      bounceType: bounce?.type,
      bounceSubType: bounce?.subType,
      origin: undefined,
      occurredAt: when,
    };
  }

  /** A suppression event names the email that caused it; its kind is on the stored event for that email. */
  private async kindOfSourceEmail(tx: Transaction, stored: StoredEvent): Promise<string | undefined> {
    if (stored.resendEmailId === undefined) {
      return undefined;
    }
    const rows = await tx
      .select({ kind: emailEvent.kind })
      .from(emailEvent)
      .where(and(eq(emailEvent.resendEmailId, stored.resendEmailId), isNotNull(emailEvent.kind)))
      .limit(1);
    return rows[0]?.kind ?? undefined;
  }

  /**
   * Transitions (blueprint, Storage): `suppression.added` writes the row and `suppression.removed` clears it;
   * a permanent bounce or a complaint writes it too, in case the suppression event is late. Transient bounces,
   * delays and failures change nothing.
   */
  private async applyState(tx: Transaction, svixId: string, stored: StoredEvent): Promise<void> {
    if (stored.recipient === undefined) {
      return;
    }
    if (stored.type === 'suppression.removed') {
      await tx
        .update(emailAddressState)
        .set({ clearedAt: stored.occurredAt, clearedBy: svixId })
        .where(and(eq(emailAddressState.address, stored.recipient), isNull(emailAddressState.clearedAt)));
      return;
    }
    const state = this.stateFor(stored);
    if (state === undefined) {
      return;
    }
    const row = {
      address: stored.recipient,
      state,
      originKind: stored.kind ?? null,
      originEvent: svixId,
      since: stored.occurredAt,
      clearedAt: null,
      clearedBy: null,
    };
    if (stored.type === 'suppression.added') {
      // Resend's list is the authority: its origin replaces an earlier bounce or complaint row.
      await tx
        .insert(emailAddressState)
        .values(row)
        .onConflictDoUpdate({
          target: emailAddressState.address,
          set: {
            state,
            originKind: sql`coalesce(excluded.origin_kind, ${emailAddressState.originKind})`,
            originEvent: svixId,
            since: stored.occurredAt,
            clearedAt: null,
            clearedBy: null,
          },
        });
      return;
    }
    // A bounce or complaint only fills a gap: it never overwrites a live row, but re-opens a cleared one.
    await tx
      .insert(emailAddressState)
      .values(row)
      .onConflictDoUpdate({
        target: emailAddressState.address,
        set: {
          state,
          originKind: row.originKind,
          originEvent: svixId,
          since: stored.occurredAt,
          clearedAt: null,
          clearedBy: null,
        },
        setWhere: isNotNull(emailAddressState.clearedAt),
      });
  }

  private stateFor(stored: StoredEvent): UndeliverableEmailState | undefined {
    if (stored.type === 'suppression.added') {
      return stored.origin === undefined ? undefined : stateByOrigin[stored.origin];
    }
    if (stored.type === 'email.bounced' && stored.bounceType === 'Permanent') {
      return 'bounced';
    }
    if (stored.type === 'email.complained') {
      return 'complained';
    }
    return undefined;
  }

  private report(stored: StoredEvent): void {
    const kind = stored.kind ?? 'unknown';
    const bounceType = stored.bounceType ?? 'none';
    const line = [
      `Resend event ${stored.type}`,
      `kind=${kind}`,
      `bounce_type=${bounceType}`,
      `origin=${stored.origin ?? 'none'}`,
      `env=${stored.environment}`,
      `recipient=${stored.recipient === undefined ? 'none' : maskRecipient(stored.recipient)}`,
    ].join(' ');
    if (warningTypes.has(stored.type)) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
    this.metrics.emailEventsTotal.add(1, {
      type: stored.type,
      kind: templateKinds.has(kind) ? kind : 'unknown',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the registry's attribute name
      bounce_type: stored.bounceType === undefined ? 'none' : bounceTypes.has(bounceType) ? bounceType : 'other',
      outcome: 'stored',
    });
  }
}

const handledTypes: ReadonlySet<string> = new Set(resendWebhookEventTypes);

const isHandled = (event: WebhookEventPayload): event is HandledEvent => handledTypes.has(event.type);
