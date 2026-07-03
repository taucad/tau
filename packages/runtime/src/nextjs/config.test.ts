/* eslint-disable @typescript-eslint/naming-convention -- Next config keys intentionally mirror framework aliases. */
import { describe, expect, it } from 'vitest';

import { nextRuntimeConfig, nextRuntimeHeaders } from '#nextjs/config.js';

describe('nextRuntimeConfig', () => {
  it('returns COI headers and Turbopack settings for runtime workers', async () => {
    const config = nextRuntimeConfig({ document: '/workspace/:path*' });

    await expect(config.headers()).resolves.toEqual(nextRuntimeHeaders({ document: '/workspace/:path*' }));
    expect(config.turbopack.rules).toEqual({
      '*.wasm': { type: 'asset' },
    });
    expect(config.turbopack.resolveAlias).toEqual({
      fs: '@taucad/runtime/nextjs/node-fs-unavailable',
      'node:fs': '@taucad/runtime/nextjs/node-fs-unavailable',
      'node:fs/promises': '@taucad/runtime/nextjs/node-fs-unavailable',
    });
  });
});
