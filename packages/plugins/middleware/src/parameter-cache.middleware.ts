import { contentDigest } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction } from '@taucad/cache-core';
import { defineMiddleware, getParametersResultSchema } from '@taucad/runtime/middleware';
import type { GetParametersResult } from '@taucad/runtime/types';
import { traceCacheOperation } from '#_internal/cache-span.js';

const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

const parameterCodec: CacheCodec<GetParametersResult> = {
  id: '@taucad/middleware/parameters',
  version: '1',
  mediaType: 'application/vnd.taucad.parameters+json',
  encode: ({ value }) => {
    if (!value.success) {
      throw new Error('Failed parameter extraction results are not reusable.');
    }
    return utf8.encode(JSON.stringify(value));
  },
  decode: ({ bytes }) => getParametersResultSchema.parse(JSON.parse(strictUtf8.decode(bytes))) as GetParametersResult,
};

const parameterAction = (dependencyHash: string): ComputeAction => ({
  schemaVersion: 1,
  namespace: '@taucad/middleware/parameter-cache',
  producer: { id: '@taucad/middleware/parameter-cache', version: '2', implementationAssets: [] },
  operation: 'extract-parameters',
  inputs: [
    {
      kind: 'content',
      role: 'runtime-dependency-set',
      digest: contentDigest({ value: `sha256:${dependencyHash}`, name: 'middleware dependency hash' }),
    },
  ],
  arguments: {},
  environment: {},
  codec: { id: parameterCodec.id, version: parameterCodec.version },
});

/** Parameter extraction reuse backed by the runtime compute CAS. @public */
export const parameterCache = defineMiddleware({
  id: 'parameterCache',
  name: 'ParameterCache',
  version: '2.0.0',

  async wrapGetParameters(input, handler, { compute, dependencyHash, logger, tracer }) {
    const result = await traceCacheOperation(tracer, 'cache.parameter.evaluate', async () =>
      compute.evaluate({
        action: parameterAction(dependencyHash),
        codec: parameterCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Parameter cache ${result.source} for ${dependencyHash}`);
    return result.value;
  },
});
