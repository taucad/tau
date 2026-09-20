import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import { createCollector } from '#runner/collector.js';
import { compileGeoSpecTestNamePattern, filterGeoSpecTests } from '#runner/filter.js';
import { getGeoSpecEngineProtocol, getRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import { analyzeMesh } from '#mesh/load-mesh.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import type { GeoSpecRunResult, GeoSpecTestCase, RunGeoSpecModuleOptions } from '#runner/types.js';

const geospecRunBindingsGlobalKey = '__GEOSPEC_RUN_BINDINGS__';

type GeoSpecRunBinding = {
  collector: ReturnType<typeof createCollector>;
  nativeAssertions: boolean;
  analyzeMesh: typeof analyzeMesh;
  geoSpecModelLoadError: typeof GeoSpecModelLoadError;
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  nativeModelLoader?: RunGeoSpecModuleOptions['nativeModelLoader'];
  stepLoader?: RunGeoSpecModuleOptions['stepLoader'];
};

const runBindingsGlobal = globalThis as typeof globalThis & {
  [geospecRunBindingsGlobalKey]?: Map<string, GeoSpecRunBinding>;
};

const createRunToken = (): string => `geospec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const builtinIdentity = (options: RunGeoSpecModuleOptions): string =>
  `${options.nativeAssertions === undefined ? 'legacy' : 'native'}:` +
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
const getLegacyCollector = () => {
  const binding = getRunBinding();
  if (binding.nativeAssertions) {
    throw new Error('Legacy expectGeo is unavailable in native mode. Import expectNativeGeo from geospec.');
  }
  const collector = binding.collector;
  if (!collector) {
    throw new Error('GeoSpec collector is not active. Run the module through runGeoSpecModule().');
  }
  return collector;
};
const getNativeCollector = () => {
  const binding = getRunBinding();
  if (!binding.nativeAssertions) {
    throw new Error('Native expectGeo requires a collector configured with nativeAssertions.');
  }
  return binding.collector;
};

export const describe = (name, fn) => getRunBinding().collector.describe(name, fn);
describe.skip = (name, fn) => getRunBinding().collector.describeSkip(name, fn);

export const it = (name, fn) => getRunBinding().collector.it(name, fn);
it.skip = (name, fn) => getRunBinding().collector.itSkip(name, fn);

export const test = it;
export const expectGeo = (subject) => getLegacyCollector().expectGeo(subject);
export const expectNativeGeo = (subject) => getNativeCollector().expectGeo(subject);
`;

const createGeospecModelBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
export const GeoSpecModelLoadError = getRunBinding().geoSpecModelLoadError;

export const loadModel = async (options) => {
  const binding = getRunBinding();
  const loader = binding.modelLoader;
  if (typeof loader !== 'function') {
    throw new GeoSpecModelLoadError([
      {
        code: binding.nativeAssertions
          ? 'GEOSPEC_LEGACY_MODEL_LOADER_UNAVAILABLE_IN_NATIVE_MODE'
          : 'GEOSPEC_MODEL_LOADER_UNAVAILABLE',
        severity: 'error',
        message: binding.nativeAssertions
          ? 'No legacy GeoSpec model loader is active in this native runner.'
          : 'No GeoSpec model loader is active for this runner.',
        suggestion: binding.nativeAssertions
          ? 'Import loadNativeModel from geospec/runner/native, or explicitly supply a legacy modelLoader.'
          : 'Run this test through the GeoSpec CLI or Tau browser test runner.',
      },
    ]);
  }
  return loader(options);
};

export const createModelLoader = (defaults = {}) => async (options) => loadModel({ ...defaults, ...options });
`;

const createGeospecNativeRunnerBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
export const loadNativeModel = async (options) => {
  const binding = getRunBinding();
  if (!binding.nativeAssertions) {
    throw new Error('Native loadModel requires a collector configured with nativeAssertions.');
  }
  if (typeof binding.nativeModelLoader !== 'function') {
    throw new binding.geoSpecModelLoadError([
      {
        code: 'GEOSPEC_NATIVE_MODEL_LOADER_UNAVAILABLE',
        severity: 'error',
        message: 'No native GeoSpec model loader is active for this runner.',
        suggestion: 'Run this test through createNativeGeoSpecRunner() with a managed native model loader.',
      },
    ]);
  }
  return binding.nativeModelLoader(options);
};
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
    ...(options.nativeAssertions === undefined ? {} : { nativeAssertions: options.nativeAssertions }),
  });
  const cached = await resolveCachedBundle(options);
  const runToken = cached?.runToken ?? createRunToken();
  const bindings = ensureRunBindings();
  // D-S3: the model loader is INJECTED. The engine's runner hosts own its
  // construction (caching, affinity, resource-scope tracking); this module
  // compiles and executes the spec against whatever it is handed.
  const meshSubjects = new Set<string>();
  const meshProtocol = options.nativeAssertions === undefined ? getGeoSpecEngineProtocol() : undefined;
  const nativeAdmissions = new Set<Promise<unknown>>();
  const configuredNativeModelLoader = options.nativeModelLoader;
  /* oxlint-disable typescript/promise-function-async -- Return the exact admission promise to the authored module. */
  const trackedNativeModelLoader: RunGeoSpecModuleOptions['nativeModelLoader'] =
    configuredNativeModelLoader === undefined
      ? undefined
      : (loadOptions) => {
          const pending = configuredNativeModelLoader(loadOptions);
          nativeAdmissions.add(pending);
          return pending;
        };
  /* oxlint-enable typescript/promise-function-async */
  let meshAnalysisClosed = false;
  const releaseMeshSubject = async (subjectId: string) =>
    meshProtocol?.releaseSubject({ requestId: `${runToken}:release:${subjectId}`, subjectId });
  bindings.set(runToken, {
    collector,
    nativeAssertions: options.nativeAssertions !== undefined,
    geoSpecModelLoadError: GeoSpecModelLoadError,
    analyzeMesh: async (input) => {
      if (options.nativeAssertions !== undefined) {
        throw new Error('Native runs require host-admitted subjects through injected modules.');
      }
      const result = await analyzeMesh(input);
      if (result.success && 'source' in input) {
        if (meshAnalysisClosed) {
          await Promise.allSettled([releaseMeshSubject(result.subject.subjectId)]);
        } else {
          meshSubjects.add(result.subject.subjectId);
        }
      }
      return result;
    },
    ...(options.modelLoader ? { modelLoader: options.modelLoader } : {}),
    ...(trackedNativeModelLoader ? { nativeModelLoader: trackedNativeModelLoader } : {}),
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
  vm.registerModule('geospec/runner/native', {
    version: '0.0.0-poc',
    code: createGeospecNativeRunnerBuiltinCode(runToken),
  });
  vm.registerModule('geospec/step', {
    version: '0.0.0-poc',
    code: createGeospecStepBuiltinCode(runToken),
  });
  vm.registerModule('geospec/mesh', {
    version: '0.0.0-poc',
    code: `${createBindingAccessorCode(runToken)}\nexport const analyzeMesh = (options) => getRunBinding().analyzeMesh(options);`,
  });
  vm.registerModule('geospec/brep', {
    version: '0.0.0-poc',
    code:
      options.nativeAssertions === undefined
        ? geospecBrepBuiltinCode
        : `
      export const analyzeBrep = () => { throw new Error('Native runs require host-injected BRep queries.'); };
    `,
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
    meshAnalysisClosed = true;
    do {
      const batch = [...nativeAdmissions];
      // oxlint-disable-next-line no-await-in-loop -- Admissions can register another load while this batch settles.
      await Promise.allSettled(batch);
      for (const pending of batch) {
        nativeAdmissions.delete(pending);
      }
    } while (nativeAdmissions.size > 0);
    bindings.delete(runToken);
    if (bindings.size === 0) {
      Reflect.deleteProperty(runBindingsGlobal, geospecRunBindingsGlobalKey);
    }
    vm.dispose();
    // Complete every release even if a host throws during cleanup.
    await Promise.allSettled([...meshSubjects].map(async (subjectId) => releaseMeshSubject(subjectId)));
    // R9: land write-behind evidence at every module/shard boundary so
    // pending entries become durable (and visible to sibling workers) off the
    // matcher path. No-op when no engine or store is installed.
    if (options.nativeAssertions === undefined) {
      await getRegisteredGeoSpecHostBinding<() => Promise<void>>('flushEvidenceStore')?.();
    }
  }
}
