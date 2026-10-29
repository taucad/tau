import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { project, projectDeletion, projectInvitation, telemetryPurposeDecision } from '#database/schema.js';
import type { Environment } from '#config/environment.config.js';
import { Span } from '#telemetry/tracer.service.js';
import { tierAssuranceKey } from '#api/telemetry-purposes/tier-assurance.js';
import type { TierAssuranceSource } from '#api/telemetry-purposes/tier-assurance.js';
import type { ProjectAuthority, RecordedPurposeDecision } from '#api/telemetry-purposes/purpose-authority.js';
import { purposeEpoch, resolvePurposeAuthority } from '#api/telemetry-purposes/purpose-authority.js';
import type {
  EffectiveTelemetryPurposes,
  UpdateTelemetryPurposesInput,
} from '#api/telemetry-purposes/telemetry-purpose.schema.js';

/**
 * Server authority over the agent-observability processing purposes (T04).
 *
 * Every answer is computed here from the account's recorded decisions, the
 * billing projection and the project row. No client tier, cached entitlement
 * or legacy privacy boolean takes part.
 */
@Injectable()
export class TelemetryPurposeService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService<Environment, true>,
    @Inject(tierAssuranceKey) private readonly tierAssurance: TierAssuranceSource,
  ) {}

  /**
   * The effective purpose state this principal's own UI displays.
   *
   * @param userId - The authenticated principal.
   * @param projectId - A project to resolve against, when the question has one.
   * @returns Effective state per purpose, bound to the subject by its epoch.
   */
  @Span()
  public async getEffectivePurposes(userId: string, projectId?: string): Promise<EffectiveTelemetryPurposes> {
    const { effective } = await this.getAdmissionAuthority(userId, projectId);
    return effective;
  }

  /**
   * The effective purposes together with the protection the account's
   * material carries now, as evidence ingress records it at receipt (T06).
   * Paid tiers are `pro`; a tier that was not established affirmatively is
   * `unknown`, never `free`.
   *
   * @param userId - The authenticated principal.
   * @param projectId - A project to resolve against, when the question has one.
   * @returns The effective state and the current source protection.
   */
  @Span()
  public async getAdmissionAuthority(
    userId: string,
    projectId?: string,
  ): Promise<Readonly<{ effective: EffectiveTelemetryPurposes; protection: 'pro' | 'free' | 'unknown' }>> {
    const noticeVersion = this.noticeVersion();
    const [decisions, assurance, projectAuthority] = await Promise.all([
      this.decisionsFor(userId),
      this.tierAssurance.getTierAssurance(userId),
      projectId === undefined ? undefined : this.projectAuthority(userId, projectId),
    ]);

    return {
      effective: {
        epoch: purposeEpoch({ userId, projectId, noticeVersion, decisions }),
        ...(noticeVersion === undefined ? {} : { noticeVersion }),
        ...(projectId === undefined ? {} : { projectId }),
        purposes: resolvePurposeAuthority({
          noticeVersion,
          decisions,
          tier: assurance.tier,
          tierAssured: assurance.assured,
          project: projectAuthority,
        }),
      },
      protection: assurance.assured ? (assurance.tier === 'free' ? 'free' : 'pro') : 'unknown',
    };
  }

  /**
   * Record decisions the account took against the notice it was shown.
   *
   * Rows are append-only: the newest row per purpose is the live answer, and
   * the superseded ones remain as the provenance a later use is checked
   * against. A submission naming a notice that is not in force is refused
   * rather than silently stored against the current one.
   *
   * @param userId - The authenticated principal.
   * @param input - The notice version shown and one entry per decided purpose.
   * @returns The recomputed effective state.
   */
  @Span()
  public async recordDecisions(
    userId: string,
    input: UpdateTelemetryPurposesInput,
  ): Promise<EffectiveTelemetryPurposes> {
    const noticeVersion = this.noticeVersion();
    if (noticeVersion === undefined) {
      throw new BadRequestException('No agent-observability notice has been approved, so no purpose can be decided.');
    }
    if (input.noticeVersion !== noticeVersion) {
      throw new BadRequestException('The notice shown is no longer in force; reload the preferences and decide again.');
    }
    const seen = new Set(input.decisions.map((decision) => decision.purpose));
    if (seen.size !== input.decisions.length) {
      throw new BadRequestException('Each purpose may appear at most once in a submission.');
    }

    await this.databaseService.database.insert(telemetryPurposeDecision).values(
      input.decisions.map((decision) => ({
        userId,
        purpose: decision.purpose,
        granted: decision.granted,
        noticeVersion,
      })),
    );

    return this.getEffectivePurposes(userId);
  }

  /**
   * Withdraw every purpose for an account, as the erasure and membership
   * owners call on sign-out of an authority rather than on sign-out of a
   * session.
   *
   * @param userId - The account whose grants are withdrawn.
   * @param purposes - Purposes to withdraw; all of them when omitted.
   */
  @Span()
  public async withdrawAll(
    userId: string,
    purposes?: ReadonlyArray<RecordedPurposeDecision['purpose']>,
  ): Promise<void> {
    const noticeVersion = this.noticeVersion();
    if (noticeVersion === undefined) {
      return;
    }
    const live = await this.databaseService.database.query.telemetryPurposeDecision.findMany({
      where: and(
        eq(telemetryPurposeDecision.userId, userId),
        eq(telemetryPurposeDecision.noticeVersion, noticeVersion),
        purposes === undefined ? undefined : inArray(telemetryPurposeDecision.purpose, [...purposes]),
      ),
      columns: { purpose: true },
    });
    const affected = [...new Set(live.map((row) => row.purpose))];
    if (affected.length === 0) {
      return;
    }
    await this.databaseService.database.insert(telemetryPurposeDecision).values(
      affected.map((purpose) => ({
        userId,
        purpose,
        granted: false,
        noticeVersion,
      })),
    );
  }

  /** The approved production notice in force, or `undefined` while none is (T01 gate). */
  public noticeVersion(): string | undefined {
    return this.configService.get('TAU_OBSERVABILITY_NOTICE_VERSION', { infer: true });
  }

  private async decisionsFor(userId: string): Promise<RecordedPurposeDecision[]> {
    const rows = await this.databaseService.database.query.telemetryPurposeDecision.findMany({
      where: eq(telemetryPurposeDecision.userId, userId),
      columns: { id: true, purpose: true, granted: true, noticeVersion: true },
    });

    return rows.map((row) => ({
      purpose: row.purpose,
      granted: row.granted,
      noticeVersion: row.noticeVersion,
      sequence: row.id,
    }));
  }

  /**
   * What the server established about the project. A row that cannot be read
   * as the principal's own single-source project refuses rather than defaults.
   */
  private async projectAuthority(userId: string, projectId: string): Promise<ProjectAuthority> {
    const [row, deletion, collaborator] = await Promise.all([
      this.databaseService.database.query.project.findFirst({
        where: eq(project.id, projectId),
        columns: { ownerId: true, forkedFrom: true },
      }),
      this.databaseService.database.query.projectDeletion.findFirst({
        where: eq(projectDeletion.projectId, projectId),
        columns: { projectId: true },
      }),
      this.databaseService.database.query.projectInvitation.findFirst({
        where: and(
          eq(projectInvitation.projectId, projectId),
          eq(projectInvitation.role, 'write'),
          isNotNull(projectInvitation.acceptedAt),
          isNull(projectInvitation.revokedAt),
        ),
        columns: { email: true },
      }),
    ]);

    if (row === undefined) {
      return { fenced: false, ownedByPrincipal: false, mixedSource: true };
    }

    return {
      /* A requested deletion fences the project before anything is cascaded;
       * a cached access verdict does not outlive the admitted intent. */
      fenced: deletion !== undefined,
      ownedByPrincipal: row.ownerId === userId,
      /* A fork carries the source publication's material, and an accepted
       * write collaborator carries their own. Either way the protection of
       * what is in the project is not this account's alone to decide. */
      mixedSource: row.forkedFrom !== null || collaborator !== undefined,
    };
  }
}
