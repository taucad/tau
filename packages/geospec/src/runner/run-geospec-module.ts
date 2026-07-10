import { createEsbuildModuleVm } from '@taucad/vm';
import { createCollector } from '#runner/collector.js';
import { compileGeoSpecTestNamePattern, filterGeoSpecTests } from '#runner/filter.js';
import { createCachedModelLoader } from '#runner/model-load-cache.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';
import type { GeoSpecRunResult, RunGeoSpecModuleOptions } from '#runner/types.js';

const defaultTestTimeout = 30_000;
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
 * @param options - filesystem, project root, and test entry path.
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
    projectPath: options.projectPath,
  });
  const collector = createCollector();
  const runToken = createRunToken();
  const bindings = ensureRunBindings();
  const ownsResourceScope = !options.resourceScope;
  const resourceScope =
    options.resourceScope ?? createGeoSpecResourceScope({ profile: options.internalProfile?.resourceScope });
  const modelLoader = createCachedModelLoader(options.modelLoader, {
    stats: options.internalProfile?.moduleModelLoadCache,
    onLoadResolved: (subject) => {
      resourceScope.trackSubject(subject);
    },
  });
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
    const bundle = await vm.bundle(options.entryPath);
    if (!bundle.success) {
      return { success: false, issues: bundle.issues, bundle };
    }

    const executed = await vm.execute(bundle.code);
    if (!executed.success) {
      return { success: false, issues: executed.issues, bundle };
    }
    await collector.waitForCompletion(options.testTimeout ?? defaultTestTimeout, compiledTestNamePattern.pattern);
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
    if (ownsResourceScope) {
      await resourceScope.dispose();
    }
    vm.dispose();
  }
}
