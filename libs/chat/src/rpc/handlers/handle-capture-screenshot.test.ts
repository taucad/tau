import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { rpcSchemasRegistry, rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import { handleCaptureScreenshot } from '#rpc/handlers/handle-capture-screenshot.js';

const captureScreenshotInputSchema = rpcSchemasRegistry[rpcName.captureScreenshot].inputSchema;

describe('handleCaptureScreenshot', () => {
  it('should reject input missing targetFile via Zod schema validation', () => {
    const result = captureScreenshotInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept input with targetFile present', () => {
    const result = captureScreenshotInputSchema.safeParse({ targetFile: 'main.ts' });
    expect(result.success).toBe(true);
  });

  it('should reject stale screenshot override fields', () => {
    const staleFields = ['target', 'camera', 'display'] as const;

    for (const field of staleFields) {
      const result = captureScreenshotInputSchema.safeParse({ targetFile: 'main.ts', [field]: {} });
      expect(result.success, `${field} should not parse`).toBe(false);
    }
  });

  it('should call graphics.captureScreenshot with the supplied targetFile', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.captureScreenshot.mockResolvedValue({
      success: true,
      images: [{ view: 'current', dataUrl: 'data:image/webp;base64,AAA' }],
    });

    await handleCaptureScreenshot({ targetFile: 'lib/pen.ts' }, graphics);

    expect(graphics.captureScreenshot).toHaveBeenCalledWith({ targetFile: 'lib/pen.ts' });
  });

  it('should return UNKNOWN error when graphics is undefined', async () => {
    const result = await handleCaptureScreenshot({ targetFile: 'main.ts' }, undefined);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted for screenshots',
    });
  });

  it('should propagate UNKNOWN_GEOMETRY_UNIT errors from the graphics layer unchanged', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.captureScreenshot.mockResolvedValue({
      success: false,
      errorCode: rpcClientErrorCode.unknownGeometryUnit,
      message: 'No viewer panel currently displays unmounted.ts',
    });

    const result = await handleCaptureScreenshot({ targetFile: 'unmounted.ts' }, graphics);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknownGeometryUnit,
      message: 'No viewer panel currently displays unmounted.ts',
    });
  });
});
