import { describe, expect, it } from 'vitest';
import { requestedMaxTokens } from '@taucad/agent-host';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import { liveCompletionCeiling, liveSessionModel } from '#testing/live/live-gateway.harness.js';

/**
 * Hermetic guard on what the live suites ask the provider for.
 *
 * The live tier is only evidence about production if it sends production's own
 * numbers. A test-only ceiling below what a real turn carries under-tests the
 * path and, on a reasoning row, can end a turn on `length` with the budget spent
 * on thinking and no answer — which is why the number now comes from the host's
 * own `requestedMaxTokens` instead of a literal in each suite.
 */
describe('live completion ceiling', () => {
  const enabledRows = Object.values(modelList)
    .flatMap((provider) => Object.values(provider))
    .filter((row) => isModelListEntryEnabled(row));

  it('should ask for what a production turn asks for on every enabled catalog row', () => {
    expect(enabledRows.length).toBeGreaterThan(0);
    for (const row of enabledRows) {
      expect(liveCompletionCeiling(row.id), row.id).toBe(requestedMaxTokens(row.details.maxTokens, undefined));
    }
  });

  it('should carry the route ceiling into the session model rather than a cheaper test value', () => {
    for (const row of enabledRows) {
      expect(liveSessionModel(row.id).maxTokens, row.id).toBe(row.details.maxTokens);
      expect(liveCompletionCeiling(row.id), row.id).toBeLessThanOrEqual(row.details.maxTokens);
    }
  });
});
