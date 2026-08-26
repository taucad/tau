import { describe, expect, it } from 'vitest';
import { providerEnvForModelId } from '#testing/skip-helpers.js';

describe('providerEnvForModelId', () => {
  it('should resolve each Kimi catalog id to its provider credential', () => {
    expect(providerEnvForModelId('moonshot-kimi-k3')).toBe('MOONSHOT_API_KEY');
    expect(providerEnvForModelId('together-kimi-k3')).toBe('TOGETHER_API_KEY');
  });
});
