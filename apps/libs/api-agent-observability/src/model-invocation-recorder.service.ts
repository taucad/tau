import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseService } from '@taucad/api-database';
import { billingOwnerBinding } from '@taucad/api-database/schema';
import type { Environment } from '@taucad/api-core';
import { ShutdownService } from '@taucad/api-lifecycle/shutdown';
import { TelemetryPurposeService } from '#telemetry-purposes/telemetry-purpose.service.js';
import { EvidenceIngressService } from '#evidence-ingress.service.js';
import { providerAttemptEvidence, providerContentEvidence } from '#model-invocation-evidence.js';
import { contentCapturePermits } from '#telemetry-purposes/purpose-authority.js';
import { requestContent } from '#provider-content.js';
import type { ProviderOutputCapture } from '#provider-content.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import { settlementEvidence } from '#settlement-evidence.js';
import type { ObservedSettlement } from '@taucad/api-billing';

/** An account's admission authority, as the purpose service answers it. */
type AdmissionAuthority = Awaited<ReturnType<TelemetryPurposeService['getAdmissionAuthority']>>;

/**
 * A purpose lookup started when a request arrives and not awaited by it (LW3). The relay asks it at the first chunk
 * whether to capture content; the record reuses its answer.
 */
export type AttemptPermission = Readonly<{
  /** The lookup itself, for the record to await off the request path. */
  authority: Promise<AdmissionAuthority>;
  /** Whether `content` is effective: `undefined` while the lookup is pending, `false` when it failed. */
  content: () => boolean | undefined;
}>;

const allowed = (authority: AdmissionAuthority, purpose: 'summary' | 'content'): boolean =>
  authority.effective.purposes.find((state) => state.purpose === purpose)?.allowed === true;

/**
 * What the relay captured for one attempt: the request body as it was relayed and the output it assembled. The
 * recorder reads them only in the background, after the account's `content` purpose is confirmed.
 */
export type CapturedContent = Readonly<{ body: unknown; output: ProviderOutputCapture }>;

/** Recordings one process may have in flight; past it, an attempt goes unrecorded and is counted. */
export const attemptRecordingsInFlight = 16;

/**
 * Records one API-reported summary per supplier attempt and one financial
 * fact per funded settlement (blueprint T07).
 * Capture is possible only with a payload key and an approved notice, and an
 * attempt is admitted only when its account's summary purpose allows it for
 * the project; every refusal and failure is counted, never thrown.
 */
@Injectable()
export class ModelInvocationEvidenceRecorder {
  /** Whether capture can ever be admitted in this process. */
  public readonly capable: boolean;
  private readonly logger = new Logger(ModelInvocationEvidenceRecorder.name);
  private inFlight = 0;
  private readonly counts = new Map<string, number>();

  public constructor(
    configService: ConfigService<Environment, true>,
    private readonly telemetryPurposes: TelemetryPurposeService,
    private readonly ingress: EvidenceIngressService,
    private readonly shutdown: ShutdownService,
    private readonly databaseService: DatabaseService,
  ) {
    this.capable =
      configService.get('TAU_OBSERVABILITY_PAYLOAD_KEY', { infer: true }) !== undefined &&
      configService.get('TAU_OBSERVABILITY_NOTICE_VERSION', { infer: true }) !== undefined;
  }

  /** Outcomes so far, by bounded code. Counts only. */
  public outcomes(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.counts);
  }

  /**
   * Whether the deployment's content capture mode could permit this account at all. When it cannot, the relay
   * captures nothing and does not wait on the lookup for it.
   *
   * @param principal - The account.
   * @returns `false` while the mode is off, or under `allowlist` for an unlisted account.
   */
  public contentEligible(principal: string): boolean {
    return contentCapturePermits(this.telemetryPurposes.contentCapture(), principal);
  }

  /**
   * Start the account's purpose lookup now, without waiting for it.
   *
   * @param principal - The account.
   * @param project - The project the attempt belongs to.
   * @returns The pending lookup and a synchronous view of its `content` answer.
   */
  public permission(principal: string, project: string): AttemptPermission {
    let content: boolean | undefined;
    const authority = this.telemetryPurposes.getAdmissionAuthority(principal, project);
    const watch = async (): Promise<void> => {
      try {
        content = allowed(await authority, 'content');
      } catch {
        content = false;
      }
    };
    this.shutdown.track(watch());
    return { authority, content: () => content };
  }

  /**
   * Record one attempt in the background. Never awaited by the request path.
   *
   * @param attempt - What the relay observed.
   * @param permission - The lookup the relay started for it, when it started one.
   * @param captured - What the relay captured, when content was effective at the first chunk.
   */
  public record(attempt: ObservedAttempt, permission?: AttemptPermission, captured?: CapturedContent): void {
    if (attempt.capture === 'missing') {
      this.count('content-missing');
    }
    this.background(async () => this.admit(attempt, permission, captured));
  }

  /**
   * Record one funded settlement in the background, after the ledger committed
   * it. Never awaited by settlement, and nothing it does can fail one.
   *
   * @param settlement - What the ledger terminalized.
   */
  public recordSettlement(settlement: ObservedSettlement): void {
    if (!this.capable) {
      return;
    }
    this.background(async () => this.admitSettlement(settlement));
  }

  /**
   * Hold observation work open against the shutdown deadline.
   *
   * @param work - Observation the request path does not wait for.
   */
  public track(work: Promise<unknown>): void {
    this.shutdown.track(work);
  }

  private background(admit: () => Promise<string>): void {
    if (this.inFlight >= attemptRecordingsInFlight) {
      this.count('capacity');
      return;
    }
    this.inFlight++;
    const work = (async (): Promise<void> => {
      try {
        this.count(await admit());
      } catch (error) {
        this.count('failed');
        this.logger.warn({ name: error instanceof Error ? error.name : typeof error }, 'Attempt evidence failed');
      } finally {
        this.inFlight--;
      }
    })();
    this.shutdown.track(work);
  }

  /**
   * A settlement belongs to a funded account; the fact is the account's active
   * owner's. A closed or unbound account has no owner left to admit it for.
   */
  private async admitSettlement(settlement: ObservedSettlement): Promise<string> {
    const { operation } = settlement;
    if (operation.projectHint === null) {
      return 'unscoped';
    }
    const [owner] = await this.databaseService.database
      .select({ authUserId: billingOwnerBinding.authUserId })
      .from(billingOwnerBinding)
      .where(
        and(
          eq(billingOwnerBinding.accountId, operation.accountId),
          eq(billingOwnerBinding.environment, operation.environment),
          isNull(billingOwnerBinding.revokedAt),
          isNotNull(billingOwnerBinding.authUserId),
        ),
      )
      .limit(1);
    if (owner?.authUserId === undefined || owner.authUserId === null) {
      return 'unbound';
    }
    const authority = await this.telemetryPurposes.getAdmissionAuthority(owner.authUserId, operation.projectHint);
    if (!allowed(authority, 'summary')) {
      return 'not-permitted';
    }
    const evidence = await settlementEvidence(settlement, owner.authUserId, {
      project: operation.projectHint,
      policyEpoch: authority.effective.epoch,
      protection: authority.protection,
    });
    const outcome = await this.ingress.admitApiReported(evidence);
    return 'receipt' in outcome ? outcome.receipt.disposition : outcome.refused;
  }

  private async admit(
    attempt: ObservedAttempt,
    permission: AttemptPermission | undefined,
    captured: CapturedContent | undefined,
  ): Promise<string> {
    const started = await permission?.authority;
    /*
     * The relay starts its lookup before the call, which can be before a new project's row is committed; that lookup
     * reads the project as not the account's and refuses. Ask again now the call is done, so the first call of a new
     * project keeps its generation (and its settlement is not left late). A refusal now is the account's answer.
     */
    const authority =
      started !== undefined && allowed(started, 'summary')
        ? started
        : await this.telemetryPurposes.getAdmissionAuthority(attempt.principal, attempt.project);
    if (!allowed(authority, 'summary')) {
      return 'not-permitted';
    }
    const stamp = { policyEpoch: authority.effective.epoch, protection: authority.protection };
    /* Content is checked again here, and again by ingress and at export: a withdrawal in between drops it (rule 5). */
    const content = allowed(authority, 'content')
      ? await providerContentEvidence(
          {
            ...attempt,
            /* Normalised here, in the background, never on the relay's path. */
            content:
              attempt.content ??
              (captured === undefined
                ? undefined
                : {
                    input: requestContent(attempt.wire, captured.body),
                    output: captured.output.messages(),
                    truncated: captured.output.truncated,
                  }),
          },
          stamp,
        )
      : undefined;
    if (content !== undefined) {
      const outcome = await this.ingress.admitApiReported(content);
      if ('receipt' in outcome) {
        return outcome.receipt.disposition;
      }
      /* A refused content envelope (capacity, a purpose withdrawn since) must not lose the call's usage. */
      this.count('content-refused');
    }
    const evidence = await providerAttemptEvidence(
      { ...attempt, content: undefined, capture: attempt.capture === 'missing' ? 'missing' : 'omitted' },
      stamp,
    );
    const outcome = await this.ingress.admitApiReported(evidence);
    return 'receipt' in outcome ? outcome.receipt.disposition : outcome.refused;
  }

  private count(code: string): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + 1);
  }
}
