// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRecordObject,
  getModuleRegistry,
  createKernelModuleShim,
  registerKernelModule,
  createKernelParameterDeclaration,
  extractDefaultParameters,
  toVmEntryPath,
  convertRawIssuesToKernelIssues,
  enrichIssueLocation,
  loadBinaryFile,
} from '#kernels/kernel-module-helpers.js';
import type { KernelIssue } from '#types/runtime.types.js';
import type { BuiltinModule, KernelBundler } from '#types/runtime-bundler-service.types.js';
import type { AnyKernelDefinitionV2 } from '#types/runtime-kernel-v2.types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { defineRuntime } from '#worker/runtime-definition.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  getTestFileSystem,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

describe('isRecordObject', () => {
  it('should return true for plain objects', () => {
    expect(isRecordObject({})).toBe(true);
    expect(isRecordObject({ a: 1 })).toBe(true);
  });

  it('should return false for arrays', () => {
    expect(isRecordObject([])).toBe(false);
    expect(isRecordObject([1, 2])).toBe(false);
  });

  it('should return false for null and primitives', () => {
    expect(isRecordObject(null)).toBe(false);
    expect(isRecordObject(undefined)).toBe(false);
    expect(isRecordObject(42)).toBe(false);
    expect(isRecordObject('string')).toBe(false);
  });
});

describe('getModuleRegistry', () => {
  it('should return a Map', () => {
    const registry = getModuleRegistry();
    expect(registry).toBeInstanceOf(Map);
  });

  it('should return the same instance on repeated calls', () => {
    const a = getModuleRegistry();
    const b = getModuleRegistry();
    expect(a).toBe(b);
  });

  it('should store the registry on globalThis', () => {
    const registry = getModuleRegistry();
    expect((globalThis as Record<string, unknown>)['__KERNEL_MODULES__']).toBe(registry);
  });
});

describe('createKernelModuleShim', () => {
  it('preserves public export names as local bindings for readable runtime diagnostics', () => {
    const code = createKernelModuleShim({
      moduleExpression: 'globalThis.__testModule',
      exports: {
        primitives: {},
        transforms: {},
      },
    });

    expect(code).toContain('const primitives = __mod["primitives"];');
    expect(code).toContain('export { primitives };');
    expect(code).toContain('const transforms = __mod["transforms"];');
    expect(code).toContain('export { transforms };');
    expect(code).not.toContain('__kernel_export');
  });

  it('uses a generated local binding when the export name cannot be a safe local identifier', () => {
    const code = createKernelModuleShim({
      moduleExpression: 'globalThis.__testModule',
      exports: {
        class: {},
      },
    });

    expect(code).toContain('const __kernel_export_0 = __mod["class"];');
    expect(code).toContain('export { __kernel_export_0 as class };');
  });
});

describe('extractDefaultParameters', () => {
  it('should extract defaultParams from a module', () => {
    const result = extractDefaultParameters({ defaultParams: { width: 10 } });
    expect(result).toEqual({ width: 10 });
  });

  it('should extract defaultParameters from a module', () => {
    const result = extractDefaultParameters({ defaultParameters: { height: 20 } });
    expect(result).toEqual({ height: 20 });
  });

  it('should prefer defaultParams over defaultParameters', () => {
    const result = extractDefaultParameters({
      defaultParams: { a: 1 },
      defaultParameters: { b: 2 },
    });
    expect(result).toEqual({ a: 1 });
  });

  it('should return empty object for non-record module', () => {
    expect(extractDefaultParameters(null)).toEqual({});
    expect(extractDefaultParameters(undefined)).toEqual({});
    expect(extractDefaultParameters(42)).toEqual({});
  });

  it('should return empty object when params are not a record', () => {
    expect(extractDefaultParameters({ defaultParams: 'not-a-record' })).toEqual({});
    expect(extractDefaultParameters({ defaultParams: [1, 2] })).toEqual({});
  });
});

describe('createKernelParameterDeclaration', () => {
  it('should delegate producer Draft-7 projection to the admitted parameter adapter', () => {
    const declaration = createKernelParameterDeclaration(
      { length: 2 },
      {
        type: 'object',
        properties: { length: { type: 'number', minimum: 0, 'x-ogc-unit': 'mm', 'x-ogc-unitLang': 'UCUM' } },
      },
      { id: 'urn:test:kernel:parameters:v1', name: 'KernelParameters' },
    );

    expect(declaration).toMatchObject({
      schema: {
        $id: 'urn:test:kernel:parameters:v1',
        name: 'KernelParameters',
        properties: { length: { type: 'double', minimum: 0, ucumUnit: 'mm' } },
      },
      defaults: { length: 2 },
    });
  });
});

describe('toVmEntryPath', () => {
  it('converts a canonical local path to the VM entry spelling', () => {
    expect(toVmEntryPath('src/main.ts')).toBe('src/main.ts');
  });

  it('rejects traversal above the virtual root', () => {
    expect(() => toVmEntryPath('../secret.ts')).toThrow('escapes');
  });
});

describe('convertRawIssuesToKernelIssues', () => {
  it('should convert raw issues to KernelIssue with fallback location', () => {
    const raw = [{ message: 'syntax error', severity: 'error' }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result).toEqual([
      {
        code: 'UNKNOWN',
        message: 'syntax error',
        severity: 'error',
        type: 'runtime',
        location: { fileName: 'main.ts', startLineNumber: 1, startColumn: 1 },
      },
    ]);
  });

  it('should normalize warning severity', () => {
    const raw = [{ message: 'deprecated', severity: 'warning' }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result[0]!.severity).toBe('warning');
  });

  it('should preserve existing location', () => {
    const location = { fileName: 'other.ts', startLineNumber: 5, startColumn: 3 };
    const raw = [{ message: 'error', severity: 'error', location }];
    const result = convertRawIssuesToKernelIssues(raw, 'main.ts');
    expect(result[0]!.location).toEqual(location);
  });

  it('should validate issue codes without legacy alias rewriting', () => {
    const legacyGeometryCode = `JSCAD_${'GEOMETRY'}_INVALID`;
    const result = convertRawIssuesToKernelIssues(
      [
        { message: 'generic geometry issue', severity: 'warning', code: 'GEOMETRY_INVALID' },
        { message: 'legacy provider-specific issue', severity: 'warning', code: legacyGeometryCode },
      ],
      'main.ts',
    );

    expect(result.map((issue) => issue.code)).toEqual(['GEOMETRY_INVALID', 'UNKNOWN']);
  });
});

describe('enrichIssueLocation', () => {
  it('should add fallback location when missing', () => {
    const issues: KernelIssue[] = [{ message: 'oops', code: 'RUNTIME', type: 'runtime', severity: 'error' }];
    const result = enrichIssueLocation(issues, 'fallback.ts');
    expect(result[0]!.location).toEqual({
      fileName: 'fallback.ts',
      startLineNumber: 1,
      startColumn: 1,
    });
  });

  it('should preserve existing location', () => {
    const location = { fileName: 'original.ts', startLineNumber: 10, startColumn: 5 };
    const issues: KernelIssue[] = [{ message: 'oops', code: 'RUNTIME', type: 'runtime', severity: 'error', location }];
    const result = enrichIssueLocation(issues, 'fallback.ts');
    expect(result[0]!.location).toEqual(location);
  });
});

describe('loadBinaryFile', () => {
  it('should load a file via file: URL in Node.js', async () => {
    const result = await loadBinaryFile(new URL('kernel-module-helpers.test.ts', import.meta.url).href);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result!.byteLength).toBeGreaterThan(0);
  });

  it('should return undefined for a non-existent file: URL', async () => {
    const result = await loadBinaryFile('file:///nonexistent/path/font.ttf');
    expect(result).toBeUndefined();
  });

  it('should return undefined for an unreachable HTTP URL', async () => {
    const result = await loadBinaryFile('http://127.0.0.1:1/nonexistent.ttf');
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// Worker-scoped built-in module registry
// =============================================================================

/** A bundler double that records registrations and returns the registered shim as the bundle. */
const createRecordingBundler = (
  registryScope: string,
): KernelBundler & { readonly modules: Map<string, BuiltinModule> } => {
  const modules = new Map<string, BuiltinModule>();
  return {
    modules,
    registryScope,
    bundle: async () => ({ code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] }),
    resolveDependencies: async () => ({ resolved: [], unresolved: [] }),
    registerModule: (name, entry) => {
      modules.set(name, entry);
    },
  };
};

/** Evaluate a registry expression the way a bundle banner binds it. */
const readRegistryExpression = async (expression: string | undefined): Promise<unknown> => {
  expect(expression).toEqual(expect.any(String));
  const source = `export default ${expression};`;
  const module = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`)) as {
    default: unknown;
  };
  return module.default;
};

describe('registerKernelModule', () => {
  it('should give each bundler its own registry entry for one module name', async () => {
    const exportsA = { token: 'A' };
    const exportsB = { token: 'B' };
    const bundlerA = createRecordingBundler('worker-a');
    const bundlerB = createRecordingBundler('worker-b');

    registerKernelModule({ bundler: bundlerA }, { name: 'scoped-fake', exports: exportsA, version: '1.0.0' });
    registerKernelModule({ bundler: bundlerB }, { name: 'scoped-fake', exports: exportsB, version: '1.0.0' });

    const entryA = bundlerA.modules.get('scoped-fake');
    const entryB = bundlerB.modules.get('scoped-fake');
    expect(await readRegistryExpression(entryA?.registryExpression)).toBe(exportsA);
    expect(await readRegistryExpression(entryB?.registryExpression)).toBe(exportsB);
    expect(entryA?.code).toContain(`const __mod = ${entryA?.registryExpression};`);
    expect(entryA?.code).not.toBe(entryB?.code);
  });

  it('should forward the version and global name with the registry expression', () => {
    const bundler = createRecordingBundler('worker');

    registerKernelModule(
      { bundler },
      { name: 'global-fake', exports: { token: 'G' }, version: '2.0.0', globalName: 'globalFake' },
    );

    const entry = bundler.modules.get('global-fake');
    expect(Object.keys(entry ?? {}).toSorted()).toEqual(['code', 'globalName', 'registryExpression', 'version']);
    expect(entry).toMatchObject({ version: '2.0.0', globalName: 'globalFake' });
    expect(entry?.code).toContain(`const __mod = ${entry?.registryExpression};`);
  });

  it('should expose one property of the exports as a subpath module', async () => {
    const booleans = { union: (): string => 'union', subtract: (): string => 'subtract' };
    const bundler = createRecordingBundler('worker');

    registerKernelModule(
      { bundler },
      { name: '@fake/modeling/booleans', exports: { booleans, colors: {} }, exportPath: 'booleans', version: '1.0.0' },
    );

    const entry = bundler.modules.get('@fake/modeling/booleans');
    expect(await readRegistryExpression(entry?.registryExpression)).toBe(booleans);
    expect(entry?.code).toContain('export { union };');
    expect(entry?.code).toContain('export { subtract };');
    expect(entry?.code).not.toContain('colors');
  });

  it('should reject an export path that does not name a module object', () => {
    const bundler = createRecordingBundler('worker');

    expect(() => {
      registerKernelModule(
        { bundler },
        { name: '@fake/modeling/missing', exports: { booleans: {} }, exportPath: 'missing', version: '1.0.0' },
      );
    }).toThrow(new TypeError('Kernel module "@fake/modeling/missing" export path "missing" is not an object.'));
    expect(bundler.modules.has('@fake/modeling/missing')).toBe(false);
  });
});

const fakeParameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:registry-parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'RegistryParameters',
    type: 'object',
  },
  defaults: {},
} as const;

let executionNonce = 0;

/** Bundles the registered `fake` shim as the program and executes it as an ES module. */
const fakeBundler = defineBundler({
  id: 'fake-bundler',
  name: 'Fake bundler',
  version: '1.0.0',
  extensions: ['fake'],
  async initialize() {
    return { modules: new Map<string, BuiltinModule>() };
  },
  async detectImports() {
    return { detectedModules: ['fake'], dependencies: [] };
  },
  async bundle({ entryPath }, _runtime, context) {
    const shim = context.modules.get('fake');
    return {
      code: shim?.code ?? '',
      issues: [],
      success: shim !== undefined,
      dependencies: [entryPath],
      unresolvedPaths: [],
    };
  },
  async execute({ code }) {
    // A fresh specifier per execution: the realm's ESM cache must not replay an earlier evaluation.
    executionNonce += 1;
    const source = Buffer.from(`${code}\n// execution ${executionNonce}\n`).toString('base64');
    const module = (await import(/* @vite-ignore */ `data:text/javascript;base64,${source}`)) as { default: unknown };
    return { success: true, value: module.default };
  },
  registerModule({ name, module }, context) {
    context.modules.set(name, module);
  },
});

/** A kernel that registers `exports` as built-in `fake` and records what its bundles import. */
const createRegistryKernel = (exports: Record<string, unknown>, executed: unknown[]): AnyKernelDefinitionV2 => ({
  id: 'fake-kernel',
  extensions: ['fake'],
  name: 'Fake kernel',
  version: '1.0.0',
  views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
  exports: {},
  initialize: async (_options, services) => {
    registerKernelModule(services, { name: 'fake', exports, version: '1.0.0', globalName: 'fakeModule' });
    return {};
  },
  resolve: async ({ entryPath }) => ({ resolved: [entryPath], unresolved: [] }),
  describe: async () => ({ success: true, data: { parameters: fakeParameterDeclaration }, issues: [] }),
  evaluate: async ({ entryPath }, services) => {
    const bundle = await services.bundler.bundle(entryPath);
    const result = await services.execute(bundle.code);
    if (!result.success) {
      throw new Error(result.issues.map((issue) => issue.message).join('\n'));
    }
    executed.push(result.value);
    return { handle: {} };
  },
  render: async () => ({ content: new Uint8Array([1]) }),
  export: async () => {
    throw new Error('The fake kernel declares no exports.');
  },
});

const registryWorkers: KernelRuntimeWorker[] = [];

const startRegistryWorker = async (
  exports: Record<string, unknown>,
  executed: unknown[],
): Promise<KernelRuntimeWorker> => {
  const kernel = createRegistryKernel(exports, executed);
  const worker = new KernelRuntimeWorker({
    runtime: defineRuntime({
      kernels: [attachRuntimePluginDefinition({ id: 'fake-kernel', extensions: ['fake'] }, () => kernel)],
      bundlers: [fakeBundler()],
    }),
  });
  registryWorkers.push(worker);
  await initializeWorkerForTesting(worker);
  return worker;
};

const evaluateDocument = async (worker: KernelRuntimeWorker, documentId: string): Promise<void> => {
  const evaluated = vi.fn();
  worker.onEvaluated = evaluated;
  worker.handleOpenDocument({
    documentId,
    intent: 1,
    file: createGeometryFile('model.fake'),
    parameters: {},
    watch: false,
  });
  await vi.waitFor(() => {
    expect(evaluated).toHaveBeenCalledOnce();
  });
  expect(evaluated.mock.calls[0]![0] as unknown).toMatchObject({ success: true });
};

describe('worker-scoped kernel module registry', () => {
  afterEach(async () => {
    await Promise.all(registryWorkers.splice(0).map(async (worker) => worker.cleanup()));
  });

  it("should resolve a worker's built-in to its own exports after another worker registered the same name", async () => {
    await seedTestFileSystem({ 'model.fake': 'fake' });
    const exportsA = { token: 'A' };
    const exportsB = { token: 'B' };
    const executedA: unknown[] = [];
    const executedB: unknown[] = [];

    const workerA = await startRegistryWorker(exportsA, executedA);
    await evaluateDocument(workerA, 'a-1');
    const workerB = await startRegistryWorker(exportsB, executedB);
    await evaluateDocument(workerB, 'b-1');
    // An edited model re-executes its bundle; an unchanged one may replay the first evaluation.
    await getTestFileSystem().writeFile('model.fake', 'fake, edited');
    await evaluateDocument(workerA, 'a-2');

    expect(executedA).toEqual([exportsA, exportsA]);
    expect(executedA[1]).toBe(exportsA);
    expect(executedB).toEqual([exportsB]);
    expect(executedB[0]).toBe(exportsB);
  });

  it("should remove a worker's registry entries on cleanup and keep the other worker's", async () => {
    await seedTestFileSystem({ 'model.fake': 'fake' });
    const exportsA = { token: 'A' };
    const exportsB = { token: 'B' };
    const workerA = await startRegistryWorker(exportsA, []);
    await evaluateDocument(workerA, 'a-1');
    const workerB = await startRegistryWorker(exportsB, []);
    await evaluateDocument(workerB, 'b-1');

    const registered = (): unknown[] => [...getModuleRegistry().values()];
    expect(registered()).toContain(exportsA);
    expect(registered()).toContain(exportsB);

    await workerA.cleanup();

    expect(registered()).not.toContain(exportsA);
    expect(registered()).toContain(exportsB);
  });

  it("should remove a worker's registry entries when its cleanup throws", async () => {
    await seedTestFileSystem({ 'model.fake': 'fake' });
    const exports = { token: 'A' };
    const worker = await startRegistryWorker(exports, []);
    await evaluateDocument(worker, 'a-1');
    // `onCleanup` is protected; the spy reaches it to simulate a failing kernel teardown.
    vi.spyOn(worker as unknown as { onCleanup(): Promise<void> }, 'onCleanup').mockRejectedValueOnce(
      new Error('teardown failed'),
    );

    await expect(worker.cleanup()).rejects.toThrow('teardown failed');
    registryWorkers.splice(registryWorkers.indexOf(worker), 1);

    expect([...getModuleRegistry().values()]).not.toContain(exports);
  });
});
