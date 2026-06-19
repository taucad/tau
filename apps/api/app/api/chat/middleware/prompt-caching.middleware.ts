import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import type { ProviderId } from '#api/providers/provider.schema.js';

type PromptCacheSettings = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API setting name.
  cache_control?: {
    type: 'ephemeral';
    ttl: '5m' | '1h';
  };
};

const DEFAULT_CACHE_TTL: NonNullable<PromptCacheSettings['cache_control']>['ttl'] = '5m';

/**
 * Adds Anthropic prompt caching through LangChain model settings instead of
 * mutating message content blocks. Keeping cache metadata on the ModelRequest
 * makes the compaction budget evaluate the same request shape sent to the
 * provider while leaving canonical chat history untouched.
 */
export const createPromptCachingMiddleware = (targetProvider: ProviderId): AgentMiddleware =>
  createMiddleware({
    name: 'PromptCaching',

    async wrapModelCall(request, handler) {
      if (targetProvider !== 'anthropic') {
        return handler(request);
      }

      const existingSettings =
        typeof request.modelSettings === 'object' && request.modelSettings !== null ? request.modelSettings : {};

      return handler({
        ...request,
        modelSettings: {
          ...existingSettings,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API setting name.
          cache_control: {
            type: 'ephemeral',
            ttl: DEFAULT_CACHE_TTL,
          },
        } satisfies typeof existingSettings & PromptCacheSettings,
      });
    },
  });
