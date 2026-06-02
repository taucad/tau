import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RpcFileSystem, RpcGraphicsClient } from '#rpc/rpc-dependencies.js';
import { rpcSchemasRegistry, rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { rpcName } from '#constants/rpc.constants.js';
import { handleFetchGeometry } from '#rpc/handlers/handle-fetch-geometry.js';

const fetchGeometryInputSchema = rpcSchemasRegistry[rpcName.fetchGeometry].inputSchema;

describe('handleFetchGeometry', () => {
  it('should reject input missing targetFile via Zod schema validation', () => {
    const result = fetchGeometryInputSchema.safeParse({ artifactId: 'tc-1' });
    expect(result.success).toBe(false);
  });

  it('should accept input with targetFile present', () => {
    const result = fetchGeometryInputSchema.safeParse({ artifactId: 'tc-1', targetFile: 'main.ts' });
    expect(result.success).toBe(true);
  });

  it('should call graphics.fetchGeometry with the supplied targetFile and parameters', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({ success: true, glb: new Uint8Array([1, 2, 3]) });
    const fileSystem = mock<RpcFileSystem>();

    await handleFetchGeometry(
      { artifactId: 'tc-1', targetFile: 'src/pen.ts', parameters: { width: 12 } },
      graphics,
      fileSystem,
    );

    expect(graphics.fetchGeometry).toHaveBeenCalledWith({ targetFile: 'src/pen.ts', parameters: { width: 12 } });
  });

  it('should embed slug(targetFile) in artifactPath', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({ success: true, glb: new Uint8Array([1]) });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    const result = await handleFetchGeometry(
      { artifactId: 'tc-42', targetFile: 'src/pen with spaces.ts' },
      graphics,
      fileSystem,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifactPath).toBe('.tau/artifacts/tc-42__src_pen_with_spaces.ts.glb');
    }
    expect(fileSystem.writeBinaryFile).toHaveBeenCalledWith(
      '.tau/artifacts/tc-42__src_pen_with_spaces.ts.glb',
      expect.any(Uint8Array),
    );
  });

  it('should not write artifact when artifactId is omitted', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({ success: true, glb: new Uint8Array([1]) });
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleFetchGeometry({ targetFile: 'main.ts' }, graphics, fileSystem);

    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifactPath).toBeUndefined();
    }
  });

  it('should return UNKNOWN error when graphics is undefined', async () => {
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleFetchGeometry({ artifactId: 'tc-1', targetFile: 'main.ts' }, undefined, fileSystem);

    expect(result).toEqual({
      success: false,
      errorCode: rpcClientErrorCode.unknown,
      message: 'No graphics view is currently mounted',
    });
  });

  it('should propagate the underlying graphics failure unchanged', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({
      success: false,
      errorCode: rpcClientErrorCode.ioError,
      message: 'boom',
    });
    const fileSystem = mock<RpcFileSystem>();

    const result = await handleFetchGeometry({ artifactId: 'tc-1', targetFile: 'main.ts' }, graphics, fileSystem);

    expect(result).toEqual({ success: false, errorCode: rpcClientErrorCode.ioError, message: 'boom' });
    expect(fileSystem.writeBinaryFile).not.toHaveBeenCalled();
  });

  it('should swallow write errors and return success with undefined artifactPath', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({ success: true, glb: new Uint8Array([1]) });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockRejectedValue(new Error('disk full'));

    const result = await handleFetchGeometry({ artifactId: 'tc-1', targetFile: 'main.ts' }, graphics, fileSystem);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifactPath).toBeUndefined();
    }
  });
});

describe('handleFetchGeometry — slug behavior', () => {
  // Slug helper is internal; we cover its observable behavior via artifactPath.
  it('should canonicalize slashes, dots-only-leading, and special chars', async () => {
    const graphics = mock<RpcGraphicsClient>();
    graphics.fetchGeometry.mockResolvedValue({ success: true, glb: new Uint8Array([1]) });
    const fileSystem = mock<RpcFileSystem>();
    fileSystem.writeBinaryFile.mockResolvedValue(undefined);

    const cases: Array<{ targetFile: string; expectedSuffix: string }> = [
      { targetFile: 'main.ts', expectedSuffix: 'main.ts.glb' },
      { targetFile: 'lib/sub-dir/PEN.TS', expectedSuffix: 'lib_sub-dir_PEN.TS.glb' },
      { targetFile: 'a/../b.ts', expectedSuffix: 'a_.._b.ts.glb' },
      { targetFile: 'unicode-名前.scad', expectedSuffix: 'unicode-__.scad.glb' },
    ];

    const results = await Promise.all(
      cases.map(async ({ targetFile }) =>
        handleFetchGeometry({ artifactId: 'tc-x', targetFile }, graphics, fileSystem),
      ),
    );

    for (const [index, result] of results.entries()) {
      const { expectedSuffix } = cases[index]!;
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.artifactPath?.endsWith(`__${expectedSuffix}`)).toBe(true);
      }
    }
  });
});
