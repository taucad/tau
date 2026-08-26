import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { rpcName } from '#constants/rpc.constants.js';
import { rpcSchemasRegistry } from '#schemas/rpc.schema.js';
import type { CaptureImagesRpcResult } from '#schemas/rpc.schema.js';
import type { RpcImageClient } from '#rpc/rpc-dependencies.js';
import { handleCaptureImages } from '#rpc/handlers/handle-capture-images.js';

const { inputSchema } = rpcSchemasRegistry[rpcName.captureImages];

describe('handleCaptureImages', () => {
  it('should accept the exact task-specific input and optional edge request', () => {
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts' }).success).toBe(true);
    expect(inputSchema.safeParse({ mode: 'multi_angle', targetFile: 'main.ts', includeEdges: false }).success).toBe(
      true,
    );
    expect(inputSchema.safeParse({ mode: 'single', targetFile: 'main.ts', width: 800 }).success).toBe(false);
  });

  it('should delegate the complete request to the headless image client', async () => {
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

  it('should propagate a typed client failure without changing it', async () => {
    const images = mock<RpcImageClient>();
    const failure: CaptureImagesRpcResult = {
      success: false,
      errorCode: 'RENDER_TIMEOUT',
      message: 'Image render timed out',
    };
    images.captureImages.mockResolvedValue(failure);

    await expect(handleCaptureImages({ mode: 'single', targetFile: 'main.ts' }, images)).resolves.toEqual(failure);
  });

  it('should fail cleanly when no image client is available', async () => {
    await expect(handleCaptureImages({ mode: 'single', targetFile: 'main.ts' }, undefined)).resolves.toMatchObject({
      success: false,
      message: 'Headless image capture is unavailable',
    });
  });
});
