import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { rpcSchemasRegistry, rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import { handleCaptureObservations } from '#rpc/handlers/handle-capture-observations.js';

const captureObservationsInputSchema = rpcSchemasRegistry[rpcName.captureObservations].inputSchema;

describe('handleCaptureObservations', () => {
  it('should reject input missing targetFile via Zod schema validation', () => {
    const result = captureObservationsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept input with targetFile present', () => {
    const result = captureObservationsInputSchema.safeParse({ targetFile: 'main.ts' });
    expect(result.success).toBe(true);
  });

  it('should reject stale screenshot override fields', () => {
    const staleFields = ['target', 'camera', 'display'] as const;

    for (const field of staleFields) {
      const result = captureObservationsInputSchema.safeParse({ targetFile: 'main.ts', [field]: {} });
      expect(result.success, `${field} should not parse`).toBe(false);
    }
  });

  it('should call graphics.captureObservations with the supplied targetFile', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.captureObservations.mockResolvedValue({
      success: true,
      observations: [{ id: 'obs_1', side: 'composite', src: 'data:image/webp;base64,AAA' }],
    });

    await handleCaptureObservations({ targetFile: 'lib/pen.ts' }, graphics);

    expect(graphics.captureObservations).toHaveBeenCalledWith({ targetFile: 'lib/pen.ts' });
  });

  it('should return UNKNOWN error when graphics is undefined', async () => {
    const result = await handleCaptureObservations({ targetFile: 'main.ts' }, undefined);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted for screenshots',
    });
  });

  it('should propagate UNKNOWN_GEOMETRY_UNIT errors from the graphics layer unchanged', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.captureObservations.mockResolvedValue({
      success: false,
      errorCode: rpcClientErrorCode.unknownGeometryUnit,
      message: 'No viewer panel currently displays unmounted.ts',
    });

    const result = await handleCaptureObservations({ targetFile: 'unmounted.ts' }, graphics);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknownGeometryUnit,
      message: 'No viewer panel currently displays unmounted.ts',
    });
  });
});
