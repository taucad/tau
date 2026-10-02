import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { TranscoderServices } from '@taucad/runtime/transcoder';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { imageTranscoder } from '#image.transcoder.js';

const backendMock = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock('#image-backend.js', () => ({ loadImageBackend: backendMock.load }));

describe('image transcoder renderer loading', () => {
  it('should reject initialization when the renderer fails to load', async () => {
    backendMock.load.mockRejectedValue(new Error('nanoraster module failed to load'));
    const definition = await resolveRuntimePluginDefinition('transcoder', imageTranscoder());
    const runtime = mock<TranscoderServices>();

    await expect(definition.initialize({}, runtime)).rejects.toThrow('nanoraster module failed to load');
    expect(backendMock.load).toHaveBeenCalledOnce();
  });
});
