import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { deriveTranscodeSources } from '@taucad/runtime/plugin';

import { cadmpegTranscoder } from '#cadmpeg.transcoder.js';

const runtime: AnyRuntimeDefinition = defineRuntime({ transcoders: [cadmpegTranscoder()] });
const cube = new Uint8Array(readFileSync(new URL('fixtures/cube.step', import.meta.url)));

describe('cadmpegTranscoder', () => {
  let client: ReturnType<typeof createRuntimeClient>;

  beforeAll(() => {
    client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) }) });
  });

  afterAll(async () => {
    await client.shutdown();
  });

  it.each(['3dm', 'sldprt', 'f3d', 'fcstd'])('declares STEP to %s', (to) => {
    expect(deriveTranscodeSources(runtime, to)).toEqual(['step']);
  });

  // The cadmpeg 0.6.12's native writers do not yet encode a model read from STEP;
  // these pin the refusal so an upstream release that writes them shows up here.
  it.each([
    ['3dm', 'UNSUPPORTED_FORMAT'],
    ['sldprt', 'UNSUPPORTED_FORMAT'],
    ['f3d', 'UNSUPPORTED_FORMAT'],
    ['fcstd', 'REFUSED'],
  ])(
    'fails STEP to %s with cadmpeg %s',
    async (to, code) => {
      const result = await client.transcode({
        from: 'step',
        to,
        files: [{ name: 'cube.step', bytes: cube, mimeType: 'model/step' }],
        options: {},
      });
      expect(result.success).toBe(false);
      expect(result.issues[0]?.message).toContain(`cadmpeg ${code} (export)`);
    },
    60_000,
  );
});
