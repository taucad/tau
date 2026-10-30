import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '#database/database.service.js';
import type { TierAssuranceSource } from '#api/telemetry-purposes/tier-assurance.js';
import type { project, projectDeletion, projectInvitation, telemetryPurposeDecision } from '#database/schema.js';
import { TelemetryPurposeService, grantAt } from '#api/telemetry-purposes/telemetry-purpose.service.js';
import type { TelemetryPurpose } from '#api/telemetry-purposes/telemetry-purpose.schema.js';

const notice = 'observability-notice-2026-10-29';

type DecisionRow = typeof telemetryPurposeDecision.$inferSelect;

/** The four columns the service actually selects; the rest of the row is never read. */
type SelectedDecision = Pick<DecisionRow, 'id' | 'purpose' | 'granted' | 'noticeVersion'>;

const row = (id: number, purpose: TelemetryPurpose, granted: boolean): SelectedDecision => ({
  id,
  purpose,
  granted,
  noticeVersion: notice,
});

/* `findMany` is typed against the whole row, but the service narrows the query with
 * `columns`, so the fixtures carry only the four columns it can see. */
const resolvesTo = (decisions: readonly SelectedDecision[]): DecisionRow[] => [...decisions] as DecisionRow[];

const createService = (
  options: Readonly<{
    noticeVersion?: string | undefined;
    decisions?: readonly SelectedDecision[];
    tier?: 'free' | 'pro' | 'enterprise';
    assured?: boolean;
  }> = {},
) => {
  const database = mockDeep<DatabaseService>();
  database.database.query.telemetryPurposeDecision.findMany.mockResolvedValue(resolvesTo(options.decisions ?? []));
  const values = vi.fn().mockResolvedValue(undefined);
  database.database.insert.mockReturnValue(mock<ReturnType<DatabaseService['database']['insert']>>({ values }));

  const configService = mock<ConfigService>();
  configService.get.mockReturnValue(options.noticeVersion);

  const tierAssurance = mock<TierAssuranceSource>();
  tierAssurance.getTierAssurance.mockResolvedValue({
    tier: options.tier ?? 'free',
    assured: options.assured ?? true,
  });

  return {
    service: new TelemetryPurposeService(
      database,
      configService as unknown as ConstructorParameters<typeof TelemetryPurposeService>[1],
      tierAssurance,
    ),
    database,
    values,
  };
};

const allowedPurposes = (purposes: ReadonlyArray<{ purpose: TelemetryPurpose; allowed: boolean }>): string[] =>
  purposes.filter((state) => state.allowed).map((state) => state.purpose);

describe('TelemetryPurposeService', () => {
  describe('getEffectivePurposes', () => {
    it('refuses every purpose for an account that has decided nothing', async () => {
      const { service } = createService({ noticeVersion: notice });

      const effective = await service.getEffectivePurposes('user-a');

      expect(effective.noticeVersion).toBe(notice);
      expect(allowedPurposes(effective.purposes)).toEqual([]);
      expect(effective.purposes.every((state) => state.refusal === 'no-decision')).toBe(true);
    });

    it('never reads the legacy privacy booleans', async () => {
      const { service, database } = createService({ noticeVersion: notice });

      await service.getEffectivePurposes('user-a');

      /* The `user` row carries `allows_ai_training` and `allows_usage_metrics`,
       * both defaulting to on. Neither authorises a purpose here, so the
       * authority never reads that row at all. */
      expect(database.database.query.user.findFirst).not.toHaveBeenCalled();
    });

    it('keeps every purpose unavailable while no notice is approved', async () => {
      const { service } = createService({ decisions: [row(1, 'summary', true)] });

      const effective = await service.getEffectivePurposes('user-a');

      expect(effective.noticeVersion).toBeUndefined();
      expect(effective.purposes.every((state) => state.refusal === 'notice-unapproved')).toBe(true);
    });

    it('takes the newest row per purpose', async () => {
      const { service } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true), row(2, 'summary', false)],
      });

      const effective = await service.getEffectivePurposes('user-a');

      expect(effective.purposes.find((state) => state.purpose === 'summary')?.refusal).toBe('withdrawn');
    });

    it('binds the answer to the principal and the project', async () => {
      const { service, database } = createService({ noticeVersion: notice });
      database.database.query.project.findFirst.mockResolvedValue(
        mock<typeof project.$inferSelect>({ ownerId: 'user-a', forkedFrom: null }),
      );
      database.database.query.projectDeletion.findFirst.mockResolvedValue(undefined);
      database.database.query.projectInvitation.findFirst.mockResolvedValue(undefined);

      const account = await service.getEffectivePurposes('user-a');
      const scoped = await service.getEffectivePurposes('user-a', 'project-a');

      expect(scoped.projectId).toBe('project-a');
      expect(scoped.epoch).not.toBe(account.epoch);
    });

    it('refuses a project the principal does not own', async () => {
      const { service, database } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true)],
      });
      database.database.query.project.findFirst.mockResolvedValue(
        mock<typeof project.$inferSelect>({ ownerId: 'user-b', forkedFrom: null }),
      );
      database.database.query.projectDeletion.findFirst.mockResolvedValue(undefined);
      database.database.query.projectInvitation.findFirst.mockResolvedValue(undefined);

      const effective = await service.getEffectivePurposes('user-a', 'project-a');

      expect(effective.purposes.every((state) => state.refusal === 'project-not-owned')).toBe(true);
    });

    it('refuses a deletion-fenced project', async () => {
      const { service, database } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true)],
      });
      database.database.query.project.findFirst.mockResolvedValue(
        mock<typeof project.$inferSelect>({ ownerId: 'user-a', forkedFrom: null }),
      );
      database.database.query.projectDeletion.findFirst.mockResolvedValue(
        mock<typeof projectDeletion.$inferSelect>({ projectId: 'project-a' }),
      );
      database.database.query.projectInvitation.findFirst.mockResolvedValue(undefined);

      const effective = await service.getEffectivePurposes('user-a', 'project-a');

      expect(effective.purposes.every((state) => state.refusal === 'project-fenced')).toBe(true);
    });

    it('refuses content-bearing purposes for a forked project', async () => {
      const { service, database } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true), row(2, 'content', true)],
      });
      database.database.query.project.findFirst.mockResolvedValue(
        mock<typeof project.$inferSelect>({ ownerId: 'user-a', forkedFrom: 'publication-a' }),
      );
      database.database.query.projectDeletion.findFirst.mockResolvedValue(undefined);
      database.database.query.projectInvitation.findFirst.mockResolvedValue(undefined);

      const effective = await service.getEffectivePurposes('user-a', 'project-a');

      expect(allowedPurposes(effective.purposes)).toEqual(['summary']);
      expect(effective.purposes.find((state) => state.purpose === 'content')?.refusal).toBe('project-mixed-source');
    });

    it('refuses content-bearing purposes for a project with an accepted write collaborator', async () => {
      const { service, database } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true), row(2, 'content', true)],
      });
      database.database.query.project.findFirst.mockResolvedValue(
        mock<typeof project.$inferSelect>({ ownerId: 'user-a', forkedFrom: null }),
      );
      database.database.query.projectDeletion.findFirst.mockResolvedValue(undefined);
      database.database.query.projectInvitation.findFirst.mockResolvedValue(
        mock<typeof projectInvitation.$inferSelect>({ email: 'other@example.com' }),
      );

      const effective = await service.getEffectivePurposes('user-a', 'project-a');

      expect(allowedPurposes(effective.purposes)).toEqual(['summary']);
      expect(effective.purposes.find((state) => state.purpose === 'content')?.refusal).toBe('project-mixed-source');
    });

    it('refuses a project row that does not exist', async () => {
      const { service, database } = createService({
        noticeVersion: notice,
        decisions: [row(1, 'summary', true)],
      });
      database.database.query.project.findFirst.mockResolvedValue(undefined);
      database.database.query.projectDeletion.findFirst.mockResolvedValue(undefined);
      database.database.query.projectInvitation.findFirst.mockResolvedValue(undefined);

      const effective = await service.getEffectivePurposes('user-a', 'missing');

      expect(allowedPurposes(effective.purposes)).toEqual([]);
    });

    it('lets a paid tier use reuse and training only once it granted them', async () => {
      const { service } = createService({
        noticeVersion: notice,
        tier: 'pro',
        decisions: [row(1, 'content', true), row(2, 'reuse', true)],
      });

      const effective = await service.getEffectivePurposes('user-a');

      expect(allowedPurposes(effective.purposes)).toEqual(['content', 'reuse']);
      expect(effective.purposes.find((state) => state.purpose === 'training')?.refusal).toBe('no-decision');
    });

    it('refuses reuse when the free tier is only the unrecognised-plan fallback', async () => {
      const { service } = createService({
        noticeVersion: notice,
        assured: false,
        decisions: [row(1, 'content', true), row(2, 'reuse', true)],
      });

      const effective = await service.getEffectivePurposes('user-a');

      expect(allowedPurposes(effective.purposes)).toEqual(['content']);
      expect(effective.purposes.find((state) => state.purpose === 'reuse')?.refusal).toBe('tier-unverified');
    });
  });

  describe('recordDecisions', () => {
    it('refuses a submission while no notice is approved', async () => {
      const { service } = createService();

      await expect(service.recordDecisions('user-a', { noticeVersion: notice, decisions: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a submission naming a notice that is no longer in force', async () => {
      const { service, values } = createService({ noticeVersion: notice });

      await expect(
        service.recordDecisions('user-a', {
          noticeVersion: 'observability-notice-2026-09-01',
          decisions: [{ purpose: 'summary', granted: true }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(values).not.toHaveBeenCalled();
    });

    it('refuses a submission that names a purpose twice', async () => {
      const { service, values } = createService({ noticeVersion: notice });

      await expect(
        service.recordDecisions('user-a', {
          noticeVersion: notice,
          decisions: [
            { purpose: 'summary', granted: true },
            { purpose: 'summary', granted: false },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(values).not.toHaveBeenCalled();
    });

    it('appends a row per decided purpose against the notice in force', async () => {
      const { service, values } = createService({ noticeVersion: notice });

      await service.recordDecisions('user-a', {
        noticeVersion: notice,
        decisions: [
          { purpose: 'summary', granted: true },
          { purpose: 'content', granted: false },
        ],
      });

      expect(values).toHaveBeenCalledExactlyOnceWith([
        { userId: 'user-a', purpose: 'summary', granted: true, noticeVersion: notice },
        { userId: 'user-a', purpose: 'content', granted: false, noticeVersion: notice },
      ]);
    });
  });

  describe('withdrawAll', () => {
    it('appends a withdrawal for every live grant', async () => {
      const { service, database, values } = createService({ noticeVersion: notice });
      database.database.query.telemetryPurposeDecision.findMany.mockResolvedValue(
        resolvesTo([row(1, 'summary', true), row(2, 'content', true)]),
      );

      await service.withdrawAll('user-a');

      expect(values).toHaveBeenCalledExactlyOnceWith([
        { userId: 'user-a', purpose: 'summary', granted: false, noticeVersion: notice },
        { userId: 'user-a', purpose: 'content', granted: false, noticeVersion: notice },
      ]);
    });

    it('writes nothing when the account has decided nothing', async () => {
      const { service, values } = createService({ noticeVersion: notice });

      await service.withdrawAll('user-a');

      expect(values).not.toHaveBeenCalled();
    });
  });

  describe('feedbackGrants', () => {
    const at = Date.parse('2026-10-29T00:00:00.000Z');

    it('answers each account by its last feedback decision at the time asked, and any other account as unknown', async () => {
      const { service, database } = createService();
      database.database.query.telemetryPurposeDecision.findMany.mockResolvedValue([
        { userId: 'user-a', granted: true, decidedAt: new Date(at + 1000) },
        { userId: 'user-a', granted: false, decidedAt: new Date(at + 5000) },
      ] as DecisionRow[]);

      const grants = await service.feedbackGrants(['user-a', 'user-b']);

      expect([at, at + 1000, at + 4999, at + 5000].map((time) => grants('user-a', time))).toEqual([
        'withheld',
        'granted',
        'granted',
        'withheld',
      ]);
      expect(grants('user-b', at + 2000)).toBe('withheld');
      expect(grants('user-c', at + 2000)).toBe('unknown');
    });

    it('asks nothing of the database for no accounts', async () => {
      const { service, database } = createService();

      const grants = await service.feedbackGrants([]);

      expect(database.database.query.telemetryPurposeDecision.findMany).not.toHaveBeenCalled();
      expect(grants('user-a', Date.now())).toBe('unknown');
    });

    it('takes the later of two decisions at the same instant', () => {
      expect(
        grantAt(
          [
            { granted: true, decidedAt: at },
            { granted: false, decidedAt: at },
          ],
          at,
        ),
      ).toBe('withheld');
    });
  });
});
