import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TaucadVm from '@taucad/vm';
import type { ModuleVm } from '@taucad/vm';
import { createEsbuildModuleVm } from '@taucad/vm';
import esbuildBundler from '#bundler/esbuild.bundler.js';
import { createMockFileSystem } from '#testing/kernel-testing.utils.js';

vi.mock('@taucad/vm', async (importOriginal) => {
  const actual = await importOriginal<typeof TaucadVm>();
  return {
    ...actual,
    createEsbuildModuleVm: vi.fn(),
  };
});

const createMockVm = (): ModuleVm => ({
  detectImports: vi.fn(),
  bundle: vi.fn(),
  execute: vi.fn(),
  registerModule: vi.fn(),
  resolveDependencies: vi.fn(),
  dispose: vi.fn(),
});

describe('Esbuild runtime adapter', () => {
  beforeEach(() => {
    vi.mocked(createEsbuildModuleVm).mockReset();
  });

  it('should initialize a VM with runtime filesystem and CAD auto-exports', async () => {
    const filesystem = createMockFileSystem();
    const vm = createMockVm();
    vi.mocked(createEsbuildModuleVm).mockResolvedValue(vm);

    const context = await esbuildBundler.initialize({ filesystem, projectPath: '/project' }, {});

    expect(context.vm).toBe(vm);
    expect(createEsbuildModuleVm).toHaveBeenCalledWith({
      filesystem,
      projectPath: '/project',
      autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
      cacheExecution: true,
    });
  });

  it('should delegate import detection to the VM', async () => {
    const vm = createMockVm();
    vi.mocked(vm.detectImports).mockResolvedValue({
      detectedModules: ['geospec'],
      dependencies: ['/project/model.test.ts'],
    });

    const result = await esbuildBundler.detectImports({ entryPath: '/project/model.test.ts' }, { vm });

    expect(vm.detectImports).toHaveBeenCalledWith('/project/model.test.ts');
    expect(result).toEqual({
      detectedModules: ['geospec'],
      dependencies: ['/project/model.test.ts'],
    });
  });

  it('should map VM bundle issues into runtime kernel issues', async () => {
    const vm = createMockVm();
    vi.mocked(vm.bundle).mockResolvedValue({
      success: false,
      code: '',
      dependencies: ['/project/model.ts'],
      unresolvedPaths: [],
      issues: [
        {
          message: 'Could not resolve "geospec"',
          code: 'BUNDLER_FAILED',
          type: 'compilation',
          severity: 'error',
          location: {
            fileName: 'model.ts',
            startLineNumber: 3,
            startColumn: 12,
          },
        },
      ],
    });

    const result = await esbuildBundler.bundle({ entryPath: '/project/model.ts' }, { vm });

    expect(vm.bundle).toHaveBeenCalledWith('/project/model.ts');
    expect(result).toEqual({
      success: false,
      code: '',
      dependencies: ['/project/model.ts'],
      unresolvedPaths: [],
      issues: [
        {
          message: 'Could not resolve "geospec"',
          code: 'BUNDLER_FAILED',
          type: 'compilation',
          severity: 'error',
          location: {
            fileName: 'model.ts',
            startLineNumber: 3,
            startColumn: 12,
            endLineNumber: undefined,
            endColumn: undefined,
          },
        },
      ],
    });
  });

  it('should map VM execution issues into runtime kernel issues', async () => {
    const vm = createMockVm();
    vi.mocked(vm.execute).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'boom',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ],
    });

    const result = await esbuildBundler.execute('throw new Error("boom");', { vm });

    expect(vm.execute).toHaveBeenCalledWith('throw new Error("boom");');
    expect(result).toEqual({
      success: false,
      issues: [
        {
          message: 'boom',
          code: 'RUNTIME',
          location: undefined,
          type: 'runtime',
          severity: 'error',
        },
      ],
    });
  });

  it('should normalize unknown VM issue discriminators for runtime consumers', async () => {
    const vm = createMockVm();
    vi.mocked(vm.execute).mockResolvedValue({
      success: false,
      issues: [
        {
          message: 'custom VM diagnostic',
          code: 'VM_CUSTOM',
          type: 'vm-custom',
          severity: 'error',
        },
      ],
    });

    const result = await esbuildBundler.execute('throw new Error("custom");', { vm });

    expect(result).toEqual({
      success: false,
      issues: [
        {
          message: 'custom VM diagnostic',
          code: 'UNKNOWN',
          location: undefined,
          type: 'unknown',
          severity: 'error',
        },
      ],
    });
  });

  it('should register builtin modules and cleanup through the VM', async () => {
    const vm = createMockVm();

    esbuildBundler.registerModule(
      'geospec',
      {
        code: 'export const describe = () => {};',
        version: '0.0.0-test',
        globalName: 'GeoSpec',
      },
      { vm },
    );
    await esbuildBundler.cleanup?.({ vm });

    expect(vm.registerModule).toHaveBeenCalledWith('geospec', {
      code: 'export const describe = () => {};',
      version: '0.0.0-test',
      globalName: 'GeoSpec',
    });
    expect(vm.dispose).toHaveBeenCalledOnce();
  });

  it('should delegate dependency resolution to the VM', async () => {
    const vm = createMockVm();
    vi.mocked(vm.resolveDependencies).mockResolvedValue({
      resolved: ['/project/main.ts'],
      unresolved: ['/project/missing.ts'],
    });

    const result = await esbuildBundler.resolveDependencies?.({ entryPath: '/project/main.ts' }, { vm });

    expect(vm.resolveDependencies).toHaveBeenCalledWith('/project/main.ts');
    expect(result).toEqual({
      resolved: ['/project/main.ts'],
      unresolved: ['/project/missing.ts'],
    });
  });
});
