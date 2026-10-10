import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { PrivacyService } from '#api/privacy/privacy.service.js';
import { updatePrivacyPreferencesSchema } from '#api/privacy/privacy.schema.js';
import type { DatabaseService } from '#database/database.service.js';
import type { user } from '#database/schema.js';

const createService = () => {
  const database = mockDeep<DatabaseService>();
  const returning = vi.fn().mockResolvedValue([{ allowsAiTraining: true, allowsUsageMetrics: false }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  database.database.update.mockReturnValue(mock<ReturnType<DatabaseService['database']['update']>>({ set }));
  return { service: new PrivacyService(database), database, set };
};

describe('PrivacyService', () => {
  it('should read allowsUsageMetrics from the user row', async () => {
    const { service, database } = createService();
    database.database.query.user.findFirst.mockResolvedValue(
      mock<typeof user.$inferSelect>({ allowsAiTraining: false, allowsUsageMetrics: false }),
    );

    await expect(service.getPrivacyPreferences('user-a')).resolves.toEqual({
      allowsAiTraining: false,
      allowsUsageMetrics: false,
    });
  });

  it('should default both preferences on when the user row is missing', async () => {
    const { service, database } = createService();
    database.database.query.user.findFirst.mockResolvedValue(undefined);

    await expect(service.getPrivacyPreferences('user-a')).resolves.toEqual({
      allowsAiTraining: true,
      allowsUsageMetrics: true,
    });
  });

  it('should persist allowsUsageMetrics and return the stored preferences', async () => {
    const { service, set } = createService();

    await expect(service.updatePrivacyPreferences('user-a', { allowsUsageMetrics: false })).resolves.toEqual({
      allowsAiTraining: true,
      allowsUsageMetrics: false,
    });
    expect(set).toHaveBeenCalledWith({ allowsAiTraining: undefined, allowsUsageMetrics: false });
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
