import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { KernelIssue } from '@taucad/runtime';
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

    await handleExportGeometry(
      { toolCallId: 'tc-1', targetFile: 'src/pen.ts', format: 'stl' },
      { graphics, fileSystem },
    );

    expect(graphics.exportGeometry).toHaveBeenCalledWith({ targetFile: 'src/pen.ts', format: 'stl' }, undefined);
  });

  it('should forward host export options to graphics.exportGeometry as given', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: true,
      files: [{ name: 'model.gcode.3mf', bytes: new Uint8Array([7]), mimeType: 'application/vnd.bambulab.gcode-3mf' }],
    });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    await handleExportGeometry(
      {
        toolCallId: 'tc-1',
        targetFile: 'src/pen.ts',
        format: 'gcode.3mf',
        exportOptions: { preset: 'fine', walls: 3 },
      },
      { graphics, fileSystem },
    );

    expect(graphics.exportGeometry).toHaveBeenCalledWith(
      { targetFile: 'src/pen.ts', format: 'gcode.3mf', exportOptions: { preset: 'fine', walls: 3 } },
      undefined,
    );
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
      { graphics, fileSystem },
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

  it('should hand the warnings of a successful export to the tool output', async () => {
    const warning: KernelIssue = {
      message: 'Sliced in one colour: the printer profile has one filament for three model colours.',
      code: 'REPRESENTATION_UNSUPPORTED',
      severity: 'warning',
      details: { colors: ['#ff0000', '#00ff00', '#0000ff'] },
    };
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockResolvedValue({
      success: true,
      files: [{ name: 'model.gcode.3mf', bytes: new Uint8Array([7]), mimeType: 'application/vnd.bambulab.gcode-3mf' }],
      issues: [warning, { message: 'Sliced with Bambu Studio 2.0.', code: 'UNKNOWN', severity: 'info' }],
    });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    const result = await handleExportGeometry(
      { toolCallId: 'tc-1', targetFile: 'main.ts', format: 'gcode.3mf' },
      { graphics, fileSystem },
    );

    /* Only warnings reach the agent, and the wire schema keeps them. */
    expect(rpcSchemasRegistry[rpcName.exportGeometry].resultSchema.parse(result)).toMatchObject({
      success: true,
      warnings: [warning],
    });
    expect(result.success && result.warnings).toEqual([warning]);
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
      { graphics, fileSystem },
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
      { graphics, fileSystem },
    );

    expect(result).toEqual({ success: false, errorCode: rpcClientErrorCode.unknown, message: 'boom' });
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('does not persist artifacts after a non-cooperative export resolves into cancellation', async () => {
    const controller = new AbortController();
    const context = { signal: controller.signal };
    const graphics = mock<RpcGraphicsClient>();
    graphics.exportGeometry.mockImplementation(async (_input, receivedContext) => {
      expect(receivedContext).toBe(context);
      controller.abort(new Error('export stopped'));
      return {
        success: true,
        files: [{ name: 'model.stl', bytes: new Uint8Array([1]), mimeType: 'model/stl' }],
      };
    });
    const fileSystem = mock<RpcFileSystem>();

    await expect(
      handleExportGeometry(
        { toolCallId: 'tc-1', targetFile: 'main.ts', format: 'stl' },
        { graphics, fileSystem },
        context,
      ),
    ).rejects.toThrow('export stopped');
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });
});
