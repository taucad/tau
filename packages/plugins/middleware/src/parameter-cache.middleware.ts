import { contentDigest } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction } from '@taucad/cache-core';
import type { ParameterManifest } from '@taucad/parameters';
import { defineMiddleware, describeResultSchema } from '@taucad/runtime/middleware';
import type { DescribeResult } from '@taucad/runtime/types';
import { traceCacheOperation } from '#_internal/cache-span.js';

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

const parameterCodec: CacheCodec<DescribeResult<ParameterManifest>> = {
  id: '@taucad/middleware/parameters',
  version: '2',
  mediaType: 'application/vnd.taucad.parameters+json',
  encode: ({ value }) => {
    if (!value.success) {
      throw new Error('Failed parameter extraction results are not reusable.');
    }
    return utf8.encode(JSON.stringify(value));
  },
  decode: ({ bytes }) =>
    describeResultSchema.parse(JSON.parse(strictUtf8.decode(bytes))) as DescribeResult<ParameterManifest>,
};

const parameterAction = (semanticHash: string): ComputeAction => ({
  schemaVersion: 1,
  namespace: '@taucad/middleware/parameter-cache',
  producer: { id: '@taucad/middleware/parameter-cache', version: '4', implementationAssets: [] },
  operation: 'extract-parameters',
  inputs: [
    {
      kind: 'content',
      role: 'parameter-semantics',
      digest: contentDigest({ value: `sha256:${semanticHash}`, name: 'parameter semantic hash' }),
    },
  ],
  arguments: {},
  environment: {},
  codec: { id: parameterCodec.id, version: parameterCodec.version },
});

/**
 * Parameter extraction reuse backed by the runtime compute CAS.
 *
 * @deprecated The kernel worker re-runs extraction after every cache hit to trust the producer
 * declaration, so a hit saves nothing; its own parameter result cache already reuses extraction.
 * Remove it from your middleware list.
 * @public
 */
export const parameterCache = defineMiddleware({
  id: 'parameterCache',
  name: 'ParameterCache',
  version: '4.0.0',

  async wrapDescribe(input, handler, { compute, dependencyHash: semanticHash, logger, tracer }) {
    if (compute.status !== 'on') {
      return handler(input);
    }
    const result = await traceCacheOperation(tracer, 'cache.parameter.evaluate', async () =>
      compute.evaluate({
        action: parameterAction(semanticHash),
        codec: parameterCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Parameter cache ${result.source} for ${semanticHash}`);
    return result.value;
  },
});
