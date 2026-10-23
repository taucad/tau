import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpViewerPartThumbnails } from '#mcp-viewer-thumbnails.js';
import type { ViewerThumbnailRuntime } from '#mcp-viewer-thumbnails.js';

let root: string;
const primitives = [{ nodeIndex: 1, meshIndex: 2, primitiveIndex: 0 }];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tau-thumbnails-'));
  await writeFile(join(root, 'gear.glb'), Buffer.from('glTF'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('createMcpViewerPartThumbnails', () => {
  it('should render each part as the Tau app frames its part previews, answering the parts it rendered', async () => {
    const transcode = vi.fn<ViewerThumbnailRuntime['transcode']>(
      async () =>
        ({
          success: true,
          data: [{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }],
          issues: [],
        }) as unknown as Awaited<ReturnType<ViewerThumbnailRuntime['transcode']>>,
    );
    const render = createMcpViewerPartThumbnails(async () => ({ transcode }));

    const result = await render({
      root,
      source: { absolutePath: join(root, 'gear.glb') },
      request: {
        modelId: 'm1',
        parts: [
          { id: 'gear', primitives },
          { id: 'axle', primitives },
        ],
        size: 256,
      },
    });

    expect(result).toEqual({ thumbnails: [{ id: 'gear', mimeType: 'image/webp', data: 'AQID' }] });
    const [input] = transcode.mock.calls[0]!;
    expect(input).toMatchObject({
      from: 'glb',
      to: 'webp',
      options: {
        mode: 'batch',
        width: 256,
        height: 256,
        lineWidth: 1,
        views: [
          { id: 'part-0', visiblePrimitives: primitives, camera: { framing: 'fit', up: [0, 0, 1] } },
          { id: 'part-1', visiblePrimitives: primitives },
        ],
      },
    });
  });

  it('should refuse an SVG and pass a render failure through', async () => {
    const transcode = vi.fn<ViewerThumbnailRuntime['transcode']>(
      async () =>
        ({
          success: false,
          issues: [{ message: 'No adapter.' }],
        }) as unknown as Awaited<ReturnType<ViewerThumbnailRuntime['transcode']>>,
    );
    const render = createMcpViewerPartThumbnails(async () => ({ transcode }));
    const request = { modelId: 'm1', parts: [{ id: 'gear', primitives }] };

    await expect(render({ root, source: { absolutePath: join(root, 'drawing.svg') }, request })).resolves.toMatchObject({
      errorCode: 'UNSUPPORTED_FORMAT',
    });
    await expect(render({ root, source: { absolutePath: join(root, 'gear.glb') }, request })).resolves.toEqual({
      errorCode: 'RENDER_FAILED',
      message: 'No adapter.',
    });
  });

  it("should render a watched source's in-memory GLB and refuse its SVG", async () => {
    const transcode = vi.fn<ViewerThumbnailRuntime['transcode']>(
      async () =>
        ({
          success: true,
          data: [{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1, 2, 3]) }],
          issues: [],
        }) as unknown as Awaited<ReturnType<ViewerThumbnailRuntime['transcode']>>,
    );
    const render = createMcpViewerPartThumbnails(async () => ({ transcode }));
    const request = { modelId: 'm1', parts: [{ id: 'gear', primitives }] };
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

    await expect(
      render({ root, source: { bytes, mimeType: 'image/svg+xml' }, request }),
    ).resolves.toMatchObject({ errorCode: 'UNSUPPORTED_FORMAT' });
    await expect(render({ root, source: { bytes, mimeType: 'model/gltf-binary' }, request })).resolves.toEqual({
      thumbnails: [{ id: 'gear', mimeType: 'image/webp', data: 'AQID' }],
    });
    expect(transcode.mock.calls[0]![0].files[0]!.bytes).toBe(bytes);
  });
});
