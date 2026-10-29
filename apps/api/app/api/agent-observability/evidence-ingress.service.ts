import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseEvidence } from '@taucad/agent-observability/contract';
import { canonicalEvidence, verifyEvidenceDigest } from '@taucad/agent-observability/identity';
import { DatabaseService } from '#database/database.service.js';
import type { Environment } from '#config/environment.config.js';
import { MetricsService } from '#telemetry/metrics.js';
import type { AgentEvidenceAdmissionAttributes } from '#telemetry/metrics.js';
import { Span } from '#telemetry/tracer.service.js';
import { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import { admitEvidence } from '#api/agent-observability/evidence-admission.js';
import type { EvidenceReceipt } from '#api/agent-observability/evidence-admission.js';
import { sealEvidence } from '#api/agent-observability/evidence-seal.js';
import type { EvidenceSealKey } from '#api/agent-observability/evidence-seal.js';

/** Submissions one principal may have in flight in one process. */
export const evidenceConcurrencyPerPrincipal = 4;

/** How far ahead of Tau's clock a client's original time may run before it is refused. */
const clockSkewMilliseconds = 5 * 60_000;

/** A Postgres SQLSTATE, the one detail of a database failure safe to log here. */
const sqlState = (error: unknown): string | undefined => {
  const code: unknown = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
  return typeof code === 'string' && /^[\dA-Z]{5}$/u.test(code) ? code : undefined;
};

/** The bounded health outcome of one admission; `granted` tells a stale epoch from a withheld purpose. */
const admissionOutcome = (
  outcome: Awaited<ReturnType<typeof admitEvidence>>,
  granted: boolean,
): AgentEvidenceAdmissionAttributes['outcome'] => {
  switch (outcome.kind) {
    case 'receipt': {
      const { disposition, duplicate } = outcome.receipt;
      return disposition === 'accepted' && duplicate ? 'duplicate' : disposition;
    }
    case 'refused': {
      return granted ? 'policy_stale' : 'refused';
    }
    default: {
      return outcome.kind;
    }
  }
};

/**
 * Authenticated agent-evidence ingress (blueprint T06).
 *
 * Every refusal is a fixed code and message. Neither the submitted bytes,
 * the validation issues nor a database error's text reaches a response, a
 * log line, Sentry or a span: the payload can carry prompts and designs.
 */
@Injectable()
export class EvidenceIngressService {
  private readonly logger = new Logger(EvidenceIngressService.name);
  private readonly key: EvidenceSealKey | undefined;
  private readonly environment: string;
  private readonly budgets: Readonly<{ total: number; principal: number }>;
  private readonly active = new Map<string, number>();

  public constructor(
    private readonly databaseService: DatabaseService,
    configService: ConfigService<Environment, true>,
    private readonly telemetryPurposes: TelemetryPurposeService,
    private readonly metrics: MetricsService,
  ) {
    const encodedKey = configService.get('TAU_OBSERVABILITY_PAYLOAD_KEY', { infer: true });
    if (encodedKey !== undefined) {
      const key = Buffer.from(encodedKey, 'base64url');
      if (key.byteLength !== 32) {
        throw new Error('TAU_OBSERVABILITY_PAYLOAD_KEY must encode exactly 32 bytes.');
      }
      this.key = {
        version: configService.get('TAU_OBSERVABILITY_PAYLOAD_KEY_VERSION', { infer: true }),
        key: Uint8Array.from(key),
      };
    }
    /* Staging and each production region are distinct deployments of one NODE_ENV. */
    const deployment: unknown = configService.get('BILLING_ENVIRONMENT', { infer: true });
    this.environment = typeof deployment === 'string' ? deployment : configService.get('NODE_ENV', { infer: true });
    this.budgets = {
      total: configService.get('TAU_OBSERVABILITY_BACKLOG_BYTES', { infer: true }),
      principal: configService.get('TAU_OBSERVABILITY_PRINCIPAL_BACKLOG_BYTES', { infer: true }),
    };
  }

  /**
   * Admit one evidence envelope for the authenticated principal.
   *
   * @param userId - The authenticated principal.
   * @param body - The envelope bytes, already bounded by the route's body limit.
   * @returns The durable receipt, committed before this resolves.
   */
  @Span()
  public async admit(userId: string, body: Uint8Array<ArrayBuffer>): Promise<EvidenceReceipt> {
    const { key } = this;
    if (key === undefined) {
      throw new ServiceUnavailableException({
        code: 'EVIDENCE_UNAVAILABLE',
        message: 'Evidence admission is not available.',
      });
    }
    const parsed = parseEvidence(body);
    if (!parsed.ok) {
      throw parsed.code === 'EVIDENCE_SIZE'
        ? new PayloadTooLargeException({ code: 'EVIDENCE_SIZE', message: 'The evidence envelope is too large.' })
        : new BadRequestException({ code: 'EVIDENCE_INVALID', message: 'The evidence envelope is not valid.' });
    }
    const evidence = parsed.value;
    /* Only the host reports over HTTP; API-reported facts are written by the
     * API itself. The principal is the session's, never the envelope's. */
    if (evidence.authority !== 'host-reported' || evidence.scope.principal !== userId) {
      throw new ForbiddenException({ code: 'EVIDENCE_SCOPE', message: 'The evidence is outside this session.' });
    }
    if (!(await verifyEvidenceDigest(evidence))) {
      throw new BadRequestException({ code: 'EVIDENCE_DIGEST', message: 'The evidence digest does not match.' });
    }
    const now = new Date();
    if (
      evidence.retention.originalAt > now.getTime() + clockSkewMilliseconds ||
      evidence.retention.expiresAt <= now.getTime()
    ) {
      throw new UnprocessableEntityException({
        code: 'EVIDENCE_EXPIRED',
        message: 'The evidence is outside its retention window.',
      });
    }

    const inFlight = this.active.get(userId) ?? 0;
    if (inFlight >= evidenceConcurrencyPerPrincipal) {
      throw new HttpException(
        { code: 'EVIDENCE_BUSY', message: 'Too many evidence submissions are in flight.', retryAfterSeconds: 1 },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.active.set(userId, inFlight + 1);
    try {
      return await this.admitWithin(evidence, key, now);
    } finally {
      const remaining = (this.active.get(userId) ?? 1) - 1;
      if (remaining === 0) {
        this.active.delete(userId);
      } else {
        this.active.set(userId, remaining);
      }
    }
  }

  /**
   * Admit evidence the API itself observed (T07), under the same purpose,
   * epoch, lineage, fence and budget checks as host evidence. It never
   * throws: a refusal or failure answers its bounded code, because the
   * caller is a request path that must not change for observation.
   *
   * @param evidence - API-reported evidence for a principal Tau authenticated.
   * @returns The receipt, or the code it was refused with.
   */
  public async admitApiReported(
    evidence: Parameters<typeof admitEvidence>[0]['evidence'],
  ): Promise<Readonly<{ receipt: EvidenceReceipt }> | Readonly<{ refused: string }>> {
    const { key } = this;
    if (key === undefined || evidence.authority !== 'api-reported') {
      return { refused: 'EVIDENCE_UNAVAILABLE' };
    }
    try {
      return { receipt: await this.admitWithin(evidence, key, new Date()) };
    } catch (error) {
      const body: unknown = error instanceof HttpException ? error.getResponse() : undefined;
      const code: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'code') : undefined;
      return { refused: typeof code === 'string' ? code : 'EVIDENCE_UNAVAILABLE' };
    }
  }

  private async admitWithin(
    evidence: Parameters<typeof admitEvidence>[0]['evidence'],
    key: EvidenceSealKey,
    now: Date,
  ): Promise<EvidenceReceipt> {
    const { scope } = evidence;
    const { plane } = evidence.payload;
    const authority = await this.telemetryPurposes.getAdmissionAuthority(scope.principal, scope.project);
    const state = authority.effective.purposes.find((purpose) => purpose.purpose === plane);
    const granted = state?.allowed === true;
    const current = authority.effective.epoch === scope.policyEpoch;
    const bytes = new TextEncoder().encode(canonicalEvidence(evidence));
    const count = (outcome: AgentEvidenceAdmissionAttributes['outcome']): void => {
      this.metrics.agentEvidenceAdmissions.add(1, {
        'tau.agent_evidence.authority': evidence.authority === 'host-reported' ? 'host' : 'api',
        'tau.agent_evidence.plane': plane,
        outcome,
      } satisfies AgentEvidenceAdmissionAttributes);
    };

    let outcome: Awaited<ReturnType<typeof admitEvidence>>;
    try {
      outcome = await admitEvidence({
        database: this.databaseService.database,
        evidence,
        allowed: { replay: granted, admit: granted && current },
        protection: authority.protection,
        seal: (receipt) => ({
          payload: sealEvidence(
            bytes,
            { environment: this.environment, principal: scope.principal, project: scope.project, receipt, plane },
            key,
          ),
          keyVersion: key.version,
        }),
        budgets: this.budgets,
        now,
      });
    } catch (error) {
      count('error');
      this.logger.warn(
        { name: error instanceof Error ? error.name : typeof error, sqlState: sqlState(error) },
        'Evidence admission failed',
      );
      throw new ServiceUnavailableException({
        code: 'EVIDENCE_UNAVAILABLE',
        message: 'Evidence admission is not available.',
      });
    }

    count(admissionOutcome(outcome, granted));
    switch (outcome.kind) {
      case 'receipt': {
        return outcome.receipt;
      }
      case 'refused': {
        if (granted) {
          throw new ConflictException({
            code: 'EVIDENCE_POLICY_STALE',
            message: 'The permission this evidence was captured under has changed; reload it.',
          });
        }
        throw new ForbiddenException({
          code: 'EVIDENCE_PURPOSE',
          message: 'This evidence is not permitted; the account preferences say why.',
        });
      }
      case 'conflict': {
        throw new ConflictException({
          code: 'EVIDENCE_CONFLICT',
          message: 'Different evidence is already held under this identity.',
        });
      }
      case 'fenced': {
        throw new GoneException({ code: 'PROJECT_DELETED', message: 'This project has been deleted from Tau Cloud.' });
      }
      case 'capacity': {
        throw new ServiceUnavailableException({
          code: 'EVIDENCE_CAPACITY',
          message: 'Evidence admission is at capacity.',
          retryAfterSeconds: 60,
        });
      }
    }
  }
}
