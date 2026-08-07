import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import type { RpcImageClient } from '#rpc/rpc-dependencies.js';
import { handleCaptureImages } from '#rpc/handlers/handle-capture-images.js';

const { inputSchema } = rpcSchemasRegistry[rpcName.captureImages];

describe('handleCaptureImages', () => {
  it('accepts the exact task-specific input and optional edge request', () => {
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts' }).success).toBe(true);
    expect(inputSchema.safeParse({ mode: 'multi_angle', targetFile: 'main.ts', includeEdges: false }).success).toBe(
      true,
    );
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts', width: 800 }).success).toBe(false);
  });

  it('delegates the complete request to the headless image client', async () => {
    const images = mock<RpcImageClient>();
    images.captureImages.mockResolvedValue({
      success: true,
      images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }],
    });
    const input: Parameters<typeof handleCaptureImages>[0] = {
      mode: 'single',
      targetFile: 'lib/pen.ts',
      includeEdges: false,
    };

    await expect(handleCaptureImages(input, images)).resolves.toEqual({
      success: true,
      images: [{ view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' }],
    });
    expect(images.captureImages).toHaveBeenCalledWith(input);
  });

  it('fails cleanly when no image client is available', async () => {
    await expect(handleCaptureImages({ mode: 'single', targetFile: 'main.ts' }, undefined)).resolves.toMatchObject({
      success: false,
      message: 'Headless image capture is unavailable',
    });
  });
});
