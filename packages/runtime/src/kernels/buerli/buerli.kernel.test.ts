// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- File names use extensions like 'box.ts' */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  KernelRuntime,
  CreateGeometryInput,
  ExportGeometryInput,
  GetParametersInput,
} from '#types/runtime-kernel.types.js';
import { createMockKernelRuntime, assertSuccess, assertFailure } from '#testing/kernel-testing.utils.js';
import buerliKernel from '#kernels/buerli/buerli.kernel.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BuerliKernel', () => {
  // ===========================================================================
  // Tests: getParameters
  // ===========================================================================

  describe('getParameters', () => {
    it('should extract defaultParams from module', async () => {
      const runtime = createMockKernelRuntime();

      const bundleCode = `
        export const defaultParams = { width: 10, height: 20 };
        export default function main(p) { return p; }
      `;

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: bundleCode,
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          defaultParams: { width: 10, height: 20 },
          default: (p: Record<string, unknown>) => p,
        },
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertSuccess(result);
      expect(result.data.defaultParameters).toEqual({ width: 10, height: 20 });
      expect(result.data.jsonSchema).toMatchObject({
        type: 'object',
        properties: {
          width: { type: 'integer', default: 10 },
          height: { type: 'integer', default: 20 },
        },
      });
    });

    it('should return empty defaults when no params exported', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'export default function main() {}',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => undefined,
        },
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertSuccess(result);
      expect(result.data.defaultParameters).toEqual({});
    });

    it('should return error on bundle failure', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Syntax error', type: 'build', severity: 'error' }],
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toBe('Syntax error');
    });

    it('should return error on execute failure', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'invalid',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Reference error', type: 'runtime', severity: 'error' }],
      });

      const result = await buerliKernel.getParameters(
        mock<GetParametersInput>({ filePath: '/test/model.ts', basePath: '/test' }),
        runtime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toBe('Reference error');
    });
  });

  // ===========================================================================
  // Tests: createGeometry
  // ===========================================================================

  describe('createGeometry', () => {
    it('should return warning when main returns undefined', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'export default function main() {}',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => undefined,
        },
      });

      const result = await buerliKernel.createGeometry(
        mock<CreateGeometryInput>({
          filePath: '/test/model.ts',
          basePath: '/test',
          parameters: {},
        }),
        runtime,
        {},
      );

      expect(result.geometry).toEqual([]);
      expect(result.issues).toBeDefined();
      expect(result.issues![0]!.severity).toBe('warning');
    });

    it('should return warning when main returns empty array', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'export default function main() { return []; }',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => [],
        },
      });

      const result = await buerliKernel.createGeometry(
        mock<CreateGeometryInput>({
          filePath: '/test/model.ts',
          basePath: '/test',
          parameters: {},
        }),
        runtime,
        {},
      );

      expect(result.geometry).toEqual([]);
      expect(result.issues).toBeDefined();
    });

    it('should throw on bundle failure', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Build failed', type: 'build', severity: 'error' }],
      });

      await expect(
        buerliKernel.createGeometry(
          mock<CreateGeometryInput>({
            filePath: '/test/model.ts',
            basePath: '/test',
            parameters: {},
          }),
          runtime,
          {},
        ),
      ).rejects.toThrow('Build failed');
    });

    it('should throw on execute failure', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'invalid',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: false,
        issues: [{ message: 'Execution failed', type: 'runtime', severity: 'error' }],
      });

      await expect(
        buerliKernel.createGeometry(
          mock<CreateGeometryInput>({
            filePath: '/test/model.ts',
            basePath: '/test',
            parameters: {},
          }),
          runtime,
          {},
        ),
      ).rejects.toThrow('Execution failed');
    });

    it('should throw on runtime error in main()', async () => {
      const runtime = createMockKernelRuntime();

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'export default function main() { throw new Error("oops"); }',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => {
            throw new Error('oops');
          },
        },
      });

      await expect(
        buerliKernel.createGeometry(
          mock<CreateGeometryInput>({
            filePath: '/test/model.ts',
            basePath: '/test',
            parameters: {},
          }),
          runtime,
          {},
        ),
      ).rejects.toThrow('oops');
    });

    it('should return GLB when model returns ArrayBuffer', async () => {
      const runtime = createMockKernelRuntime();
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);

      runtime.bundler.bundle = vi.fn().mockResolvedValue({
        success: true,
        code: 'test',
        sourceMap: undefined,
      });

      runtime.execute = vi.fn().mockResolvedValue({
        success: true,
        value: {
          default: () => fakeGlb.buffer,
        },
      });

      const result = await buerliKernel.createGeometry(
        mock<CreateGeometryInput>({
          filePath: '/test/model.ts',
          basePath: '/test',
          parameters: {},
        }),
        runtime,
        {},
      );

      expect(result.geometry).toHaveLength(1);
      expect(result.geometry[0]!.format).toBe('gltf');
    });
  });

  // ===========================================================================
  // Tests: exportGeometry
  // ===========================================================================

  describe('exportGeometry', () => {
    it('should export GLB format', async () => {
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({
          fileType: 'glb',
          nativeHandle: { glb: fakeGlb },
        }),
        {} as KernelRuntime,
        {},
      );

      assertSuccess(result);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.fileName).toBe('model.glb');
    });

    it('should export GLTF format', async () => {
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({
          fileType: 'gltf',
          nativeHandle: { glb: fakeGlb },
        }),
        {} as KernelRuntime,
        {},
      );

      assertSuccess(result);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.fileName).toBe('model.gltf');
    });

    it('should return error for unsupported format', async () => {
      const fakeGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({
          fileType: 'step' as any,
          nativeHandle: { glb: fakeGlb },
        }),
        {} as KernelRuntime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toContain('not implemented');
    });

    it('should return error when no geometry available', async () => {
      const result = await buerliKernel.exportGeometry(
        mock<ExportGeometryInput>({
          fileType: 'glb',
          nativeHandle: undefined,
        }),
        {} as KernelRuntime,
        {},
      );

      assertFailure(result);
      expect(result.issues[0]!.message).toContain('No geometry available');
    });
  });

  // ===========================================================================
  // Tests: getDependencies
  // ===========================================================================

  describe('getDependencies', () => {
    it('should delegate to bundler resolveDependencies', async () => {
      const runtime = createMockKernelRuntime();
      const expectedDeps = [{ path: '/test/helper.ts', type: 'local' as const }];
      runtime.bundler.resolveDependencies = vi.fn().mockResolvedValue(expectedDeps);

      const result = await buerliKernel.getDependencies({ filePath: '/test/model.ts' }, runtime, {});

      expect(runtime.bundler.resolveDependencies).toHaveBeenCalledWith('/test/model.ts');
      expect(result).toEqual(expectedDeps);
    });
  });

  // ===========================================================================
  // Tests: Kernel metadata
  // ===========================================================================

  describe('kernel metadata', () => {
    it('should have correct name and version', () => {
      expect(buerliKernel.name).toBe('BuerliKernel');
      expect(buerliKernel.version).toBe('1.0.0');
    });

    it('should have an options schema requiring classcadKey', () => {
      expect(buerliKernel.optionsSchema).toBeDefined();

      const validResult = buerliKernel.optionsSchema!.safeParse({ classcadKey: 'test-key-123' });
      expect(validResult.success).toBe(true);

      const invalidResult = buerliKernel.optionsSchema!.safeParse({});
      expect(invalidResult.success).toBe(false);

      const emptyKeyResult = buerliKernel.optionsSchema!.safeParse({ classcadKey: '' });
      expect(emptyKeyResult.success).toBe(false);
    });
  });
});
