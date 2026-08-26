import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import { createCollector } from '#runner/collector.js';
import { compileGeoSpecTestNamePattern, filterGeoSpecTests } from '#runner/filter.js';
import { getRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import type { GeoSpecRunResult, GeoSpecTestCase, RunGeoSpecModuleOptions } from '#runner/types.js';

const geospecRunBindingsGlobalKey = '__GEOSPEC_RUN_BINDINGS__';

type GeoSpecRunBinding = {
  collector: ReturnType<typeof createCollector>;
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
};

const runBindingsGlobal = globalThis as typeof globalThis & {
  [geospecRunBindingsGlobalKey]?: Map<string, GeoSpecRunBinding>;
};

const createRunToken = (): string => `geospec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const builtinIdentity = (options: RunGeoSpecModuleOptions): string =>
  JSON.stringify(
    Object.entries(options.builtinModules ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, module_]) => [name, module_.version, module_.globalName, module_.code]),
  );

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const cacheEntryIsCurrent = async (
  filesystem: RunGeoSpecModuleOptions['filesystem'],
  dependencyContents: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
): Promise<boolean> => {
  const comparisons = await Promise.all(
    [...dependencyContents].map(async ([path, previous]) => {
      try {
        return bytesEqual(await filesystem.readFile(path), previous);
      } catch {
        return false;
      }
    }),
  );
  return comparisons.every(Boolean);
};

const snapshotDependencies = async (
  options: RunGeoSpecModuleOptions,
  dependencies: readonly string[],
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  const entries = await Promise.all(
    [...new Set([options.entryPath, ...dependencies])].map(
      async (path): Promise<readonly [string, Uint8Array<ArrayBuffer>]> => [
        path,
        await options.filesystem.readFile(path),
      ],
    ),
  );
  return new Map(entries);
};

const resolveCachedBundle = async (options: RunGeoSpecModuleOptions) => {
  const entry = options.bundleCache?.get(options.entryPath);
  if (
    entry === undefined ||
    entry.builtinIdentity !== builtinIdentity(options) ||
    !(await cacheEntryIsCurrent(options.filesystem, entry.dependencyContents))
  ) {
    return undefined;
  }
  return entry;
};

const ensureRunBindings = (): Map<string, GeoSpecRunBinding> => {
  const existing = runBindingsGlobal[geospecRunBindingsGlobalKey];
  if (existing) {
    return existing;
  }
  const bindings = new Map<string, GeoSpecRunBinding>();
  runBindingsGlobal[geospecRunBindingsGlobalKey] = bindings;
  return bindings;
};

const createBindingAccessorCode = (runToken: string): string => `
const getRunBinding = () => {
  const binding = globalThis.${geospecRunBindingsGlobalKey}?.get(${JSON.stringify(runToken)});
  if (!binding) {
    throw new Error('GeoSpec runner binding is not active. Run the module through runGeoSpecModule().');
  }
  return binding;
};
`;

const createGeospecBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
const getCollector = () => {
  const collector = getRunBinding().collector;
  if (!collector) {
    throw new Error('GeoSpec collector is not active. Run the module through runGeoSpecModule().');
  }
  return collector;
};

export const describe = (name, fn) => getCollector().describe(name, fn);
describe.skip = (name, fn) => getCollector().describeSkip(name, fn);

export const it = (name, fn) => getCollector().it(name, fn);
it.skip = (name, fn) => getCollector().itSkip(name, fn);

export const test = it;
export const expectGeo = (subject) => getCollector().expectGeo(subject);
`;

const createGeospecModelBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
export class GeoSpecModelLoadError extends Error {
  constructor(diagnostics) {
    const snapshot = diagnostics.map((diagnostic) => {
      try {
        return structuredClone(diagnostic);
      } catch {
        return {
          ...diagnostic,
          details: diagnostic?.details === undefined ? undefined : String(diagnostic.details),
        };
      }
    });
    super(snapshot.map((diagnostic) => diagnostic.message).join('\\n') || 'GeoSpec model load failed.');
    this.name = 'GeoSpecModelLoadError';
    this.diagnostics = Object.freeze(snapshot);
  }
}

export const loadModel = async (options) => {
  const loader = getRunBinding().modelLoader;
  if (typeof loader !== 'function') {
    throw new GeoSpecModelLoadError([
      {
        code: 'GEOSPEC_MODEL_LOADER_UNAVAILABLE',
        severity: 'error',
        message: 'No GeoSpec model loader is active for this runner.',
        suggestion: 'Run this test through the GeoSpec CLI or Tau browser test runner.',
      },
    ]);
  }
  return loader(options);
};

export const createModelLoader = (defaults = {}) => async (options) => loadModel({ ...defaults, ...options });
`;

const createGeospecStepBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
export const loadStep = async (options) => {
  const loader = getRunBinding().stepLoader;
  if (typeof loader !== 'function') {
    throw new Error('No GeoSpec STEP loader is active for this runner. Run this test through the GeoSpec CLI or pass stepLoader to runGeoSpecModule().');
  }
  return loader(options);
};

export const createStepLoader = (defaults = {}) => async (options) => loadStep({ ...defaults, ...options });
`;

const geospecBrepBuiltinCode = `
export const analyzeBrep = ({ subject }) => {
  if (!subject || typeof subject !== 'object' || subject.kind !== 'geometry-subject') {
    return {
      success: false,
      diagnostics: [{
        code: 'UNSUPPORTED_GEOMETRY_SUBJECT',
        severity: 'error',
        message: 'analyzeBrep requires a GeoSpec GeometrySubject.',
        suggestion: 'Load a subject with loadStep(...) or loadModel({ format: "step" }).',
      }],
    };
  }
  if (!subject.brep) {
    return {
      success: false,
      diagnostics: [{
        code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
        severity: 'error',
        message: 'Geometry subject does not include BRep evidence.',
        suggestion: 'Load a STEP/BRep-capable subject with loadStep(...) or loadModel({ format: "step" }).',
      }],
    };
  }
  return { success: true, brep: subject.brep, diagnostics: subject.diagnostics ?? [] };
};
`;

/**
 * Execute an ESM GeoSpec module using the shared Tau VM substrate.
 *
 * @param options - filesystem and test entry path.
 * @returns collected test cases or structured VM issues.
 *
 * @public
 */
export async function runGeoSpecModule(options: RunGeoSpecModuleOptions): Promise<GeoSpecRunResult> {
  const compiledTestNamePattern = compileGeoSpecTestNamePattern(options.testNamePattern);
  if (!compiledTestNamePattern.success) {
    return { success: false, issues: [compiledTestNamePattern.issue] };
  }

  const vm = await createEsbuildModuleVm({
    filesystem: options.filesystem,
  });
  const collector = createCollector({
    ...(options.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: options.matcherWallBackstop }),
    ...(options.forensic === undefined ? {} : { forensic: options.forensic }),
  });
  const cached = await resolveCachedBundle(options);
  const runToken = cached?.runToken ?? createRunToken();
  const bindings = ensureRunBindings();
  // D-S3: the model loader is INJECTED. The engine's runner hosts own its
  // construction (caching, affinity, resource-scope tracking); this module
  // compiles and executes the spec against whatever it is handed.
  const { modelLoader } = options;
  bindings.set(runToken, {
    collector,
    ...(modelLoader ? { modelLoader } : {}),
    ...(options.stepLoader ? { stepLoader: options.stepLoader } : {}),
  });

  vm.registerModule('geospec', {
    version: '0.0.0-poc',
    code: createGeospecBuiltinCode(runToken),
  });
  vm.registerModule('geospec/model', {
    version: '0.0.0-poc',
    code: createGeospecModelBuiltinCode(runToken),
  });
  vm.registerModule('geospec/step', {
    version: '0.0.0-poc',
    code: createGeospecStepBuiltinCode(runToken),
  });
  vm.registerModule('geospec/brep', {
    version: '0.0.0-poc',
    code: geospecBrepBuiltinCode,
  });
  for (const [name, module_] of Object.entries(options.builtinModules ?? {})) {
    vm.registerModule(name, module_);
  }

  try {
    const bundle = cached?.bundle ?? (await vm.bundle(options.entryPath));
    if (!bundle.success) {
      return { success: false, issues: bundle.issues, bundle };
    }
    if (options.bundleCache !== undefined && cached === undefined) {
      try {
        options.bundleCache.set(options.entryPath, {
          builtinIdentity: builtinIdentity(options),
          runToken,
          bundle,
          dependencyContents: await snapshotDependencies(options, bundle.dependencies),
        });
      } catch {
        // Cache bookkeeping must never change execution semantics.
      }
    }

    const executed = await vm.execute(bundle.code);
    if (!executed.success) {
      return { success: false, issues: executed.issues, bundle };
    }
    if (options.collectOnly === true) {
      // R3 shard splitting: register tests (async describes included) without
      // running any body — a never-matching pattern skips every scheduled test.
      await collector.waitForCompletion(options.testTimeout, /(?!)/u);
      return {
        success: true,
        passed: true,
        tests: collector.tests.map((test): GeoSpecTestCase => ({ ...test, status: 'skipped' })),
        bundle,
      };
    }
    await collector.waitForCompletion(options.testTimeout, compiledTestNamePattern.pattern);
    const tests = filterGeoSpecTests(collector.tests, compiledTestNamePattern.pattern);

    return {
      success: true,
      passed: tests.every((test) => test.status !== 'failed'),
      tests,
      bundle,
    };
  } finally {
    bindings.delete(runToken);
    if (bindings.size === 0) {
      Reflect.deleteProperty(runBindingsGlobal, geospecRunBindingsGlobalKey);
    }
    vm.dispose();
    // R9: land write-behind evidence at every module/shard boundary so
    // pending entries become durable (and visible to sibling workers) off the
    // matcher path. No-op when no engine or store is installed.
    await getRegisteredGeoSpecHostBinding<() => Promise<void>>('flushEvidenceStore')?.();
  }
}
