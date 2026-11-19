import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { Environment } from '@taucad/api-core';
import { DatabaseService } from '@taucad/api-database';
import { project, user } from '@taucad/api-database/schema';
import {
  buildProjectInvitationUrl,
  EmailDeliverabilityService,
  EmailService,
  maskRecipient,
  normalizeEmailAddress,
} from '@taucad/api-email';
import { MetricsService } from '@taucad/api-observability/metrics';
import type { CollaboratorInviteEmailDelivery } from '@taucad/types/constants';

/** One invitation just written, with the raw token that exists only in this request. */
export type ProjectInviteEmailInput = Readonly<{
  projectId: string;
  ownerId: string;
  email: string;
  role: 'read' | 'write';
  token: string;
  /** ISO timestamp the invitation stops working. */
  expiresAt: string;
}>;

/* Dates in transactional email are written once, in UTC, the way the other templates write them. */
const expiryFormat = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeZone: 'UTC' });

/**
 * Emails a collaborator invitation (stable cloud link blueprint D6, E6).
 *
 * Sent after the invitation row is written, in the same request, because the
 * raw token exists only then. The owner's daily invite budget already bounds
 * these (one email per invite), so there is no second budget. A skipped email
 * never fails the invite: the token is still returned, and the answer says why
 * nothing was sent, so the pane offers the link to copy instead (D7). The token
 * and the link are never logged; the recipient is masked.
 */
@Injectable()
export class ProjectInviteEmailService {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly metrics: MetricsService,
    // oxlint-disable-next-line eslint/new-cap -- Nest's Optional decorator is a function by contract.
    @Optional() private readonly deliverability?: EmailDeliverabilityService,
  ) {}

  /**
   * Emails one invitation and answers what happened to it.
   *
   * @param input - The invitation just written and its one-time token.
   * @returns `sent`, or `skipped` with why.
   */
  public async send(input: ProjectInviteEmailInput): Promise<CollaboratorInviteEmailDelivery> {
    const outcome = await this.deliver(input);
    this.metrics.projectInviteEmailsTotal.add(1, {
      outcome: outcome.status === 'sent' ? 'sent' : outcome.reason,
    });
    return outcome;
  }

  private async deliver(input: ProjectInviteEmailInput): Promise<CollaboratorInviteEmailDelivery> {
    if (await this.isUndeliverable(input.email)) {
      return { status: 'skipped', reason: 'undeliverable' };
    }
    if (!this.emailService.isDeliveryEnabled) {
      return { status: 'skipped', reason: 'email_disabled' };
    }

    try {
      const names = await this.namesOf(input);
      const frontendURL = this.configService.get('TAU_FRONTEND_URL', { infer: true });
      const sent = await this.emailService.sendProjectInvite({
        recipientEmail: input.email,
        ownerName: names.ownerName,
        projectName: names.projectName,
        role: input.role,
        expiresAt: expiryFormat.format(new Date(input.expiresAt)),
        url: buildProjectInvitationUrl({ frontendURL, token: input.token }),
      });
      return sent === 'sent' ? { status: 'sent' } : { status: 'skipped', reason: 'email_disabled' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Project invite email failed for ${maskRecipient(input.email)}: ${message}`);
      return { status: 'skipped', reason: 'send_failed' };
    }
  }

  /** The owner's and the project's names, as the invitee will recognise them. */
  private async namesOf(input: ProjectInviteEmailInput): Promise<Readonly<{ ownerName: string; projectName: string }>> {
    const { database } = this.databaseService;
    const [owner] = await database.select({ name: user.name }).from(user).where(eq(user.id, input.ownerId)).limit(1);
    const [row] = await database
      .select({ name: project.name })
      .from(project)
      .where(eq(project.id, input.projectId))
      .limit(1);
    const ownerName = owner?.name.trim() ?? '';
    const projectName = row?.name.trim() ?? '';
    return {
      ownerName: ownerName === '' ? 'A Tau user' : ownerName,
      projectName: projectName === '' ? 'Untitled project' : projectName,
    };
  }

  /**
   * Whether Resend would drop mail to this address (bounce blueprint R9). A
   * failed lookup is not a reason to skip: Resend still suppresses at send time.
   */
  private async isUndeliverable(email: string): Promise<boolean> {
    if (this.deliverability === undefined) {
      return false;
    }
    try {
      const undeliverable = await this.deliverability.undeliverableAmong([email]);
      return undeliverable.has(normalizeEmailAddress(email));
    } catch (error) {
      /* The error's message can quote the query, and the query names the address. */
      const name = error instanceof Error ? error.name : 'unknown';
      this.logger.warn(`Email deliverability lookup failed (${name}); treating the invitee as deliverable`);
      return false;
    }
  }
}
