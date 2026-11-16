import { describe, expect, it } from 'vitest';

import { defineTranscoder } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';

import { serveHostRuntime } from '#runtime-host.js';

const imageTranscoder = defineTranscoder({
  id: 'fixture-image',
  name: 'FixtureImage',
  version: '1.0.0',
  edges: [
    { from: 'avif', to: 'jpeg' },
    { from: 'gif', to: 'jpeg' },
    { from: 'avif', to: 'png' },
  ],
  async initialize() {
    return {};
  },
  async transcode() {
    return { success: true, data: [], issues: [] };
  },
});

describe('serveHostRuntime', () => {
  it('reports the formats its runtime converts to JPEG, for the daemon to convert agent media from', async () => {
    const host = await serveHostRuntime({
      runtime: defineRuntime({ transcoders: [imageTranscoder()] }),
      authorizationToken: 'a'.repeat(32),
    });
    try {
      expect(host.transcodeSources).toEqual(['avif', 'gif']);
    } finally {
      await host.close();
    }
  });

  it('reports none for a runtime that converts nothing', async () => {
    const host = await serveHostRuntime({ runtime: defineRuntime({}), authorizationToken: 'a'.repeat(32) });
    try {
      expect(host.transcodeSources).toEqual([]);
    } finally {
      await host.close();
    }
  });
});
