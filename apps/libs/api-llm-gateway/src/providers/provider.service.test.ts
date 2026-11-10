import { describe, it, expect } from 'vitest';
import { modelFamilySchema, providerIdSchema } from '@taucad/chat/model-catalog';
import { ProviderService } from '#providers/provider.service.js';

/**
 * The `tau` provider existed only for the TAU_TEST_MODE replay model, which
 * left with the API agent plane (W3-CUT-2). An enum member no catalog row can
 * satisfy is a trap: it type-checks in every `Exclude<ProviderId, …>` alias and
 * resolves at runtime to a factory that throws.
 */
describe('provider identity catalog', () => {
  it('has no replay provider or model family', () => {
    expect(providerIdSchema.safeParse('tau').success).toBe(false);
    expect(modelFamilySchema.safeParse('tau').success).toBe(false);
    expect(providerIdSchema.safeParse('openai').success).toBe(true);
  });
});

describe('ProviderService metadata', () => {
  const service = new ProviderService();

  it.each(providerIdSchema.options)('should describe %s without carrying a credential', (providerId) => {
    const provider = service.getProvider(providerId);

    expect(provider.provider).toBe(providerId);
    expect(provider.configuration).toEqual({});
  });

  it.each([
    { providerId: 'together', otelProviderName: 'together', cacheRead: true, cacheWrite: false },
    { providerId: 'moonshot', otelProviderName: 'moonshot', cacheRead: true, cacheWrite: false },
    { providerId: 'vertexai', otelProviderName: 'gcp.vertex_ai', cacheRead: true, cacheWrite: false },
    { providerId: 'anthropic', otelProviderName: 'anthropic', cacheRead: true, cacheWrite: true },
  ] as const)(
    'should expose the $providerId telemetry name and inclusive-cache accounting',
    ({ providerId, otelProviderName, cacheRead, cacheWrite }) => {
      expect(service.getProvider(providerId)).toMatchObject({
        otelProviderName,
        inputTokensIncludesCacheReadTokens: cacheRead,
        inputTokensIncludesCacheWriteTokens: cacheWrite,
      });
    },
  );
});
