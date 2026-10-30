import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { billingOwnerBinding } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import { EvidenceIngressService } from '#api/agent-observability/evidence-ingress.service.js';
import { providerAttemptEvidence } from '#api/agent-observability/model-invocation-evidence.js';
import type { ObservedAttempt } from '#api/agent-observability/model-invocation-evidence.js';
import { settlementEvidence } from '#api/agent-observability/settlement-evidence.js';
import type { ObservedSettlement } from '#api/agent-observability/settlement-evidence.js';

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
   * Record one attempt in the background. Never awaited by the request path.
   *
   * @param attempt - What the relay observed.
   */
  public record(attempt: ObservedAttempt): void {
    this.background(async () => this.admit(attempt));
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
    if (authority.effective.purposes.find((purpose) => purpose.purpose === 'summary')?.allowed !== true) {
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

  private async admit(attempt: ObservedAttempt): Promise<string> {
    const authority = await this.telemetryPurposes.getAdmissionAuthority(attempt.principal, attempt.project);
    if (authority.effective.purposes.find((purpose) => purpose.purpose === 'summary')?.allowed !== true) {
      return 'not-permitted';
    }
    const evidence = await providerAttemptEvidence(attempt, {
      policyEpoch: authority.effective.epoch,
      protection: authority.protection,
    });
    const outcome = await this.ingress.admitApiReported(evidence);
    return 'receipt' in outcome ? outcome.receipt.disposition : outcome.refused;
  }

  private count(code: string): void {
    this.counts.set(code, (this.counts.get(code) ?? 0) + 1);
  }
}
