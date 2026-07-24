import { describe, expect, it } from 'vitest';
import { providerEnvForModelId } from '#testing/skip-helpers.js';

describe('providerEnvForModelId', () => {
  it('should resolve Moonshot catalog ids to the Moonshot credential', () => {
    expect(providerEnvForModelId('moonshot-kimi-k3')).toBe('MOONSHOT_API_KEY');
  });
});
