import { describe, expect, it } from 'vitest';
import type { ReuseAuthority } from '#api/agent-observability/evaluation-selection.js';
import { purposeReuse, selectEvaluationCase } from '#api/agent-observability/evaluation-selection.js';
import { evidenceFixture } from '#api/agent-observability/evidence.test-fixture.js';
import type { TelemetryPurposeService } from '#api/telemetry-purposes/telemetry-purpose.service.js';

const now = Date.now();
const allowing =
  (allowed: ReadonlyArray<readonly [string, string]>): ReuseAuthority =>
  async (principal, project) =>
    allowed.some(([user, scope]) => user === principal && scope === project) ? 'allowed' : 'denied';
const operators = new Set(['operator-a']);

describe('selectEvaluationCase', () => {
  it("admits a case only when every customer scope it draws on allows reuse now, and Tau's own evidence without one", async () => {
    const mine = await evidenceFixture({ principal: 'user-a', project: 'project-a' });
    const other = await evidenceFixture({ principal: 'user-b', project: 'project-b', sequence: 8 });
    const operator = await evidenceFixture({ principal: 'operator-a', sequence: 9 });
    const reuse = allowing([['user-a', 'project-a']]);

    expect(await selectEvaluationCase([mine], { operators, reuse }, now)).toEqual({ eligible: true });
    expect(await selectEvaluationCase([operator], { operators, reuse: allowing([]) }, now)).toEqual({ eligible: true });
    expect(await selectEvaluationCase([mine, other], { operators, reuse }, now)).toEqual({
      eligible: false,
      refusal: 'reuse-not-allowed',
    });
    expect(
      await selectEvaluationCase([await evidenceFixture({ project: 'project-b' })], { operators, reuse }, now),
    ).toEqual({ eligible: false, refusal: 'reuse-not-allowed' });
  });

  it('keeps material captured as Pro refused after a downgrade, even with reuse allowed and an operator principal', async () => {
    const replayed = [
      await evidenceFixture({ principal: 'user-a', protection: 'free' }),
      await evidenceFixture({ principal: 'user-a', protection: 'pro', sequence: 8 }),
    ];
    const reuse = allowing([['user-a', 'project-a']]);

    expect(await selectEvaluationCase(replayed, { operators, reuse }, now)).toEqual({
      eligible: false,
      refusal: 'pro-protected',
    });
    expect(
      await selectEvaluationCase(
        [await evidenceFixture({ principal: 'operator-a', protection: 'pro' })],
        {
          operators,
          reuse,
        },
        now,
      ),
    ).toEqual({ eligible: false, refusal: 'pro-protected' });
  });

  it('refuses a case once its evidence or a source has expired, and a case with no evidence at all', async () => {
    const reuse = allowing([['user-a', 'project-a']]);
    const evidence = await evidenceFixture();

    expect(await selectEvaluationCase([evidence], { operators, reuse }, evidence.retention.expiresAt)).toEqual({
      eligible: false,
      refusal: 'expired',
    });
    expect(await selectEvaluationCase([], { operators, reuse }, now)).toEqual({
      eligible: false,
      refusal: 'lineage-missing',
    });
  });
});

describe('purposeReuse', () => {
  const authorityOf = (allowed: boolean): Awaited<ReturnType<TelemetryPurposeService['getAdmissionAuthority']>> => ({
    effective: { epoch: 'epoch-1', purposes: [{ purpose: 'reuse', allowed, decided: true, granted: true }] },
    protection: 'free',
  });

  it('reads the live reuse purpose for the project, and a failed lookup as unknown', async () => {
    const asked: Array<[string, string | undefined]> = [];
    const reuse = purposeReuse({
      getAdmissionAuthority: async (userId, projectId) => {
        asked.push([userId, projectId]);
        return authorityOf(userId === 'user-a');
      },
    });

    expect(await reuse('user-a', 'project-a')).toBe('allowed');
    expect(await reuse('user-b', 'project-a')).toBe('denied');
    expect(asked).toEqual([
      ['user-a', 'project-a'],
      ['user-b', 'project-a'],
    ]);
    expect(
      await purposeReuse({
        getAdmissionAuthority: async () => {
          throw new Error('unavailable');
        },
      })('user-a', 'project-a'),
    ).toBe('unknown');
  });
});
