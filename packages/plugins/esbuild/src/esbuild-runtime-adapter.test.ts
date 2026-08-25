import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ModuleVmModule from '#vm/module-vm.js';
import type { ModuleVm } from '#vm/module-vm.js';
import { createEsbuildModuleVm } from '#vm/module-vm.js';
import { esbuildBundler } from '#esbuild.bundler.js';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createMockFileSystem } from '@taucad/runtime-testing';

vi.mock('#vm/module-vm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ModuleVmModule>();
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
  clearExecutionCache: vi.fn(),
  resolveDependencies: vi.fn(),
  dispose: vi.fn(),
});

describe('Esbuild runtime adapter', () => {
  const bundlerRuntime = { signal: new AbortController().signal };
  const resolveEsbuildDefinition = async () => resolveRuntimePluginDefinition('bundler', esbuildBundler());
  let esbuildDefinition: Awaited<ReturnType<typeof resolveEsbuildDefinition>>;

  beforeEach(async () => {
    vi.mocked(createEsbuildModuleVm).mockReset();
    esbuildDefinition = await resolveEsbuildDefinition();
  });

  it('should initialize a VM with runtime filesystem and CAD auto-exports', async () => {
    const filesystem = createMockFileSystem();
    const vm = createMockVm();
    vi.mocked(createEsbuildModuleVm).mockResolvedValue(vm);

    const context = (await esbuildDefinition.initialize({}, { filesystem })) as {
      vm: ModuleVm;
    };

    expect(context.vm).toBe(vm);
    expect(createEsbuildModuleVm).toHaveBeenCalledWith({
      filesystem,
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

    const result = await esbuildDefinition.detectImports({ entryPath: '/project/model.test.ts' }, bundlerRuntime, {
      vm,
    });

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

    const result = await esbuildDefinition.bundle({ entryPath: '/project/model.ts' }, bundlerRuntime, { vm });

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

    const result = await esbuildDefinition.execute({ code: 'throw new Error("boom");' }, bundlerRuntime, { vm });

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

    const result = await esbuildDefinition.execute({ code: 'throw new Error("custom");' }, bundlerRuntime, { vm });

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

    esbuildDefinition.registerModule(
      {
        name: 'geospec',
        module: {
          code: 'export const describe = () => {};',
          version: '0.0.0-test',
          globalName: 'GeoSpec',
        },
      },
      { vm },
    );
    await esbuildDefinition.cleanup?.({ vm });

    expect(vm.registerModule).toHaveBeenCalledWith('geospec', {
      code: 'export const describe = () => {};',
      version: '0.0.0-test',
      globalName: 'GeoSpec',
    });
    expect(vm.dispose).toHaveBeenCalledOnce();
  });
});
