import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { PrivacyService } from '#api/privacy/privacy.service.js';
import { updatePrivacyPreferencesSchema } from '#api/privacy/privacy.schema.js';
import { effectiveTrainingConsent } from '#api/privacy/training-consent.js';
import type { TierAssurance } from '#api/billing/subscription-tier.js';
import type { DatabaseService } from '#database/database.service.js';
import type { user } from '#database/schema.js';

const decided = new Date('2026-10-29T00:00:00Z');

const freeAssurance: TierAssurance = { tier: 'free', assured: true };

const createService = (assurance = freeAssurance) => {
  const database = mockDeep<DatabaseService>();
  const returning = vi
    .fn()
    .mockResolvedValue([{ allowsAiTraining: true, aiTrainingDecidedAt: null, allowsUsageMetrics: false }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  database.database.update.mockReturnValue(mock<ReturnType<DatabaseService['database']['update']>>({ set }));
  const tierAssurance = { getTierAssurance: vi.fn().mockResolvedValue(assurance) };
  return { service: new PrivacyService(database, tierAssurance), database, set, returning };
};

describe('PrivacyService', () => {
  it('should read allowsUsageMetrics from the user row', async () => {
    const { service, database } = createService();
    database.database.query.user.findFirst.mockResolvedValue(
      mock<typeof user.$inferSelect>({ allowsAiTraining: false, aiTrainingDecidedAt: null, allowsUsageMetrics: false }),
    );

    await expect(service.getPrivacyPreferences('user-a')).resolves.toEqual({
      allowsAiTraining: false,
      allowsUsageMetrics: false,
    });
  });

  it('should default both preferences on for a Free account whose row is missing', async () => {
    const { service, database } = createService();
    database.database.query.user.findFirst.mockResolvedValue(undefined);

    await expect(service.getPrivacyPreferences('user-a')).resolves.toEqual({
      allowsAiTraining: true,
      allowsUsageMetrics: true,
    });
  });

  it('should keep a paid plan out of training until the user opts in', async () => {
    const { service, database } = createService({ tier: 'pro', assured: true });
    database.database.query.user.findFirst.mockResolvedValue(
      mock<typeof user.$inferSelect>({ allowsAiTraining: true, aiTrainingDecidedAt: null, allowsUsageMetrics: true }),
    );

    await expect(service.getPrivacyPreferences('user-a')).resolves.toMatchObject({ allowsAiTraining: false });
  });

  it('should record when training is chosen, so a paid plan can opt in', async () => {
    const { service, set, returning } = createService({ tier: 'pro', assured: true });
    returning.mockResolvedValue([{ allowsAiTraining: true, aiTrainingDecidedAt: decided, allowsUsageMetrics: true }]);

    await expect(service.updatePrivacyPreferences('user-a', { allowsAiTraining: true })).resolves.toEqual({
      allowsAiTraining: true,
      allowsUsageMetrics: true,
    });
    const [written] = set.mock.calls[0] as [{ allowsAiTraining?: boolean; aiTrainingDecidedAt?: Date }];
    expect(written.allowsAiTraining).toBe(true);
    expect(written.aiTrainingDecidedAt).toBeInstanceOf(Date);
  });

  it('should persist allowsUsageMetrics without touching the training decision', async () => {
    const { service, set } = createService();

    await expect(service.updatePrivacyPreferences('user-a', { allowsUsageMetrics: false })).resolves.toEqual({
      allowsAiTraining: true,
      allowsUsageMetrics: false,
    });
    expect(set).toHaveBeenCalledWith({
      allowsAiTraining: undefined,
      aiTrainingDecidedAt: undefined,
      allowsUsageMetrics: false,
    });
  });
});

describe('effectiveTrainingConsent', () => {
  it.each([
    [
      'assured Free follows the stored default',
      { tier: 'free', assured: true, allowsAiTraining: true, decidedAt: undefined },
      true,
    ],
    [
      'assured Free that opted out',
      { tier: 'free', assured: true, allowsAiTraining: false, decidedAt: decided },
      false,
    ],
    ['Pro on the column default', { tier: 'pro', assured: true, allowsAiTraining: true, decidedAt: undefined }, false],
    ['Pro that opted in', { tier: 'pro', assured: true, allowsAiTraining: true, decidedAt: decided }, true],
    ['Pro that opted out', { tier: 'pro', assured: true, allowsAiTraining: false, decidedAt: decided }, false],
    [
      'an unestablished tier on the default',
      { tier: 'free', assured: false, allowsAiTraining: true, decidedAt: undefined },
      false,
    ],
  ] as const)('%s', (_name, input, expected) => {
    expect(effectiveTrainingConsent(input)).toBe(expected);
  });
});

describe('updatePrivacyPreferencesSchema', () => {
  it('should accept allowsUsageMetrics on its own', () => {
    expect(updatePrivacyPreferencesSchema.parse({ allowsUsageMetrics: false })).toEqual({ allowsUsageMetrics: false });
  });

  it('should reject a non-boolean allowsUsageMetrics', () => {
    expect(updatePrivacyPreferencesSchema.safeParse({ allowsUsageMetrics: 'no' }).success).toBe(false);
  });
});
