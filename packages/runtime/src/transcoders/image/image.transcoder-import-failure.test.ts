import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ExportFile } from '@taucad/types';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { imageTranscoder } from '#transcoders/image/image.transcoder.js';
import type { TranscoderRuntime } from '#types/runtime-transcoder.types.js';

afterEach(() => {
  vi.doUnmock('nanoraster');
});

const glb: ExportFile = {
  name: 'model.glb',
  bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
  mimeType: 'model/gltf-binary',
};

describe('image transcoder renderer loading', () => {
  it('should contain the initial renderer import failure without retrying it', async () => {
    let importAttempts = 0;
    vi.doMock('nanoraster', () => {
      importAttempts += 1;
      throw new Error('nanoraster module failed to load');
    });
    const definition = await resolveRuntimePluginDefinition('transcoder', imageTranscoder());
    const runtime = mock<TranscoderRuntime>();
    const context = await definition.initialize({}, runtime);

    const result = await definition.transcode({ from: 'glb', to: 'webp', files: [glb], options: {} }, runtime, context);

    expect(result).toEqual({
      success: false,
      issues: [
        {
          message: 'nanoraster module failed to load',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          details: { type: 'render', code: 'unknown' },
        },
      ],
    });
    expect(importAttempts).toBe(1);
  });
});
