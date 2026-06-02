import { createEsbuildModuleVm } from '@taucad/vm';
import { clearCollectorGlobals, collectorGlobalKey, createCollector, installCollector } from '#runner/collector.js';
import { filterGeoSpecTests } from '#runner/filter.js';
import type { GeoSpecRunResult, RunGeoSpecModuleOptions } from '#runner/types.js';

const defaultTestTimeout = 30_000;
const geospecModelLoaderGlobalKey = '__GEOSPEC_MODEL_LOADER__';
const geospecStepLoaderGlobalKey = '__GEOSPEC_STEP_LOADER__';

const geospecBuiltinCode = `
const getCollector = () => {
  const collector = globalThis.${collectorGlobalKey};
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

const geospecModelBuiltinCode = `
const modelLoaderGlobalKey = '${geospecModelLoaderGlobalKey}';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeParameters = (defaults, overrides) => {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : value;
  }
  return merged;
};

const parseParameterEntry = (entry) => {
  const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
  if (!isRecord(parsed) || typeof parsed.activeGroup !== 'string' || !isRecord(parsed.groups)) {
    throw new Error('Invalid GeoSpec parameter file: expected activeGroup and groups.');
  }
  return parsed;
};

const groupNames = (entry) => {
  const ordered = entry.order ?? [entry.activeGroup, ...Object.keys(entry.groups).filter((name) => name !== entry.activeGroup)];
  const seen = new Set();
  const names = [];
  for (const name of [...ordered, ...Object.keys(entry.groups)]) {
    if (seen.has(name) || entry.groups[name] === undefined) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
};

export class GeoSpecModelLoadError extends Error {
  constructor(diagnostics) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\\n') || 'GeoSpec model load failed.');
    this.name = 'GeoSpecModelLoadError';
    this.diagnostics = diagnostics;
  }
}

export const params = (entry, options = {}) => {
  const parsed = parseParameterEntry(entry);
  const defaults = options.defaults ?? {};
  const groups = groupNames(parsed).map((name) => {
    const overrides = parsed.groups[name]?.values ?? {};
    return {
      name,
      active: name === parsed.activeGroup,
      values: mergeParameters(defaults, overrides),
      overrides,
      provenance: {
        ...(options.parameterFile ? { parameterFile: options.parameterFile } : {}),
        activeGroup: parsed.activeGroup,
        groupName: name,
      },
    };
  });
  const active = groups.find((group) => group.active);
  if (!active) {
    throw new Error(\`Invalid GeoSpec parameter file: active group '\${parsed.activeGroup}' is missing.\`);
  }
  return { active, groups, defaults };
};

export const activeParams = (entry, options = {}) => params(entry, options).active.values;
export const parameterGroups = (entry, options = {}) => params(entry, options).groups;

export const loadModel = async (options) => {
  const loader = globalThis[modelLoaderGlobalKey];
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

const geospecStepBuiltinCode = `
const stepLoaderGlobalKey = '${geospecStepLoaderGlobalKey}';

export const loadStep = async (options) => {
  const loader = globalThis[stepLoaderGlobalKey];
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
  return { success: true, evidence: subject.brep, diagnostics: subject.diagnostics ?? [] };
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
  const vm = await createEsbuildModuleVm({
    filesystem: options.filesystem,
    projectPath: options.projectPath,
  });
  const collector = createCollector();
  const globalWithModelLoader = globalThis as typeof globalThis & {
    [geospecModelLoaderGlobalKey]?: RunGeoSpecModuleOptions['modelLoader'];
    [geospecStepLoaderGlobalKey]?: RunGeoSpecModuleOptions['stepLoader'];
  };
  const previousModelLoader = globalWithModelLoader[geospecModelLoaderGlobalKey];
  const previousStepLoader = globalWithModelLoader[geospecStepLoaderGlobalKey];

  vm.registerModule('geospec', {
    version: '0.0.0-poc',
    code: geospecBuiltinCode,
  });
  vm.registerModule('geospec/model', {
    version: '0.0.0-poc',
    code: geospecModelBuiltinCode,
  });
  vm.registerModule('geospec/step', {
    version: '0.0.0-poc',
    code: geospecStepBuiltinCode,
  });
  vm.registerModule('geospec/brep', {
    version: '0.0.0-poc',
    code: geospecBrepBuiltinCode,
  });
  for (const [name, module_] of Object.entries(options.builtinModules ?? {})) {
    vm.registerModule(name, module_);
  }
  if (options.modelLoader) {
    globalWithModelLoader[geospecModelLoaderGlobalKey] = options.modelLoader;
  }
  if (options.stepLoader) {
    globalWithModelLoader[geospecStepLoaderGlobalKey] = options.stepLoader;
  }

  try {
    const bundle = await vm.bundle(options.entryPath);
    if (!bundle.success) {
      return { success: false, issues: bundle.issues, bundle };
    }

    installCollector(collector);
    const executed = await vm.execute(bundle.code);
    if (!executed.success) {
      return { success: false, issues: executed.issues, bundle };
    }
    await collector.waitForCompletion(options.testTimeout ?? defaultTestTimeout);
    const tests = filterGeoSpecTests(collector.tests, options.testNamePattern);

    return {
      success: true,
      passed: tests.every((test) => test.status !== 'failed'),
      tests,
      bundle,
    };
  } finally {
    clearCollectorGlobals();
    if (previousModelLoader === undefined) {
      Reflect.deleteProperty(globalWithModelLoader, geospecModelLoaderGlobalKey);
    } else {
      globalWithModelLoader[geospecModelLoaderGlobalKey] = previousModelLoader;
    }
    if (previousStepLoader === undefined) {
      Reflect.deleteProperty(globalWithModelLoader, geospecStepLoaderGlobalKey);
    } else {
      globalWithModelLoader[geospecStepLoaderGlobalKey] = previousStepLoader;
    }
    vm.dispose();
  }
}
