import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem, RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { rpcSchemasRegistry, rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import { handleExportGeometry } from '#rpc/handlers/handle-export-geometry.js';

const exportGeometryInputSchema = rpcSchemasRegistry[rpcName.exportGeometry].inputSchema;

describe('handleExportGeometry', () => {
  it('should reject input missing toolCallId via Zod schema validation', () => {
    const result = exportGeometryInputSchema.safeParse({ targetFile: 'main.ts', format: 'glb' });
    expect(result.success).toBe(false);
  });

  it('should accept full input', () => {
    const result = exportGeometryInputSchema.safeParse({
      toolCallId: 'tc-1',
      targetFile: 'main.ts',
      format: 'step',
    });
    expect(result.success).toBe(true);
  });

  it('should call graphics.exportGeometry with targetFile and format', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: true,
      files: [{ name: 'model.step', bytes: new Uint8Array([9, 9, 9]), mimeType: 'application/step' }],
    });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    await handleExportGeometry({ toolCallId: 'tc-1', targetFile: 'src/pen.ts', format: 'stl' }, graphics, fileSystem);

    expect(graphics.exportGeometry).toHaveBeenCalledWith({ targetFile: 'src/pen.ts', format: 'stl' });
  });

  it('should embed slug(targetFile) and format in artifactPath', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: true,
      files: [
        { name: 'model.obj', bytes: new Uint8Array([1, 2]), mimeType: 'model/obj' },
        { name: 'materials/model.mtl', bytes: new Uint8Array([3]), mimeType: 'application/octet-stream' },
      ],
    });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    const result = await handleExportGeometry(
      { toolCallId: 'tc-42', targetFile: 'src/pen with spaces.ts', format: 'stl' },
      graphics,
      fileSystem,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.files).toEqual([
        {
          name: 'model.obj',
          artifactPath: '.tau/artifacts/tc-42__src_pen_with_spaces.ts-stl/model.obj',
          mimeType: 'model/obj',
          byteLength: 2,
        },
        {
          name: 'materials/model.mtl',
          artifactPath: '.tau/artifacts/tc-42__src_pen_with_spaces.ts-stl/materials/model.mtl',
          mimeType: 'application/octet-stream',
          byteLength: 1,
        },
      ]);
      expect(result.format).toBe('stl');
    }
  });

  it('should return IO_ERROR when write fails', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: true,
      files: [{ name: 'model.stl', bytes: new Uint8Array([1]), mimeType: 'model/stl' }],
    });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockRejectedValue(new Error('disk full'));

    const result = await handleExportGeometry(
      { toolCallId: 'tc-1', targetFile: 'main.ts', format: 'stl' },
      graphics,
      fileSystem,
    );

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'Failed to persist export artifact to the project filesystem',
    });
  });

  it('should propagate graphics failure unchanged', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'boom',
    });
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleExportGeometry(
      { toolCallId: 'tc-1', targetFile: 'main.ts', format: 'glb' },
      graphics,
      fileSystem,
    );

    expect(result).toEqual({ success: false, errorCode: rpcClientErrorCode.unknown, message: 'boom' });
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });
});
