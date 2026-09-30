import { createEsbuildModuleVm } from '@taucad/esbuild/vm';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { sha256Bytes } from '@taucad/runtime/kernel';
import { createCollector } from '#runner/collector.js';
import { createGeoSpecAssertionClient } from '#assertion-client/client.js';
import { compileGeoSpecTestNamePattern, filterGeoSpecTests } from '#runner/filter.js';
import { getGeoSpecEngineProtocol, getRegisteredGeoSpecHostBinding } from '#engine/registry.js';
import { analyzeMesh } from '#mesh/load-mesh.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { bindGeoSpecSubject, rawSubjectResidency, resolveGeoSpecSubject } from '#model/subject.js';
import type { CreateModelLoaderOptions, GeoSpecModelLoader, ManagedGeoSpecModelLoader } from '#model/types.js';
import type {
  GeoSpecModuleBundleCache,
  GeoSpecRunResult,
  GeoSpecTestAccounting,
  GeoSpecRunLineage,
  RunGeoSpecModuleOptions,
} from '#runner/types.js';

const geospecRunBindingsGlobalKey = '__GEOSPEC_RUN_BINDINGS__';

type GeoSpecRunBinding = {
  collector: ReturnType<typeof createCollector>;
  nativeAssertions: boolean;
  analyzeMesh: typeof analyzeMesh;
  geoSpecModelLoadError: typeof GeoSpecModelLoadError;
  modelLoader?: RunGeoSpecModuleOptions['modelLoader'];
  nativeModelLoader?: GeoSpecModelLoader;
  createModelLoader?: (defaults: CreateModelLoaderOptions) => ManagedGeoSpecModelLoader;
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

type BundlerRead = Parameters<GeoSpecModuleBundleCache['set']>[1]['bundlerReads'][number];

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

const sameAnswer = (left: BundlerRead['answer'], right: BundlerRead['answer']): boolean =>
  left instanceof Uint8Array && right instanceof Uint8Array ? bytesEqual(left, right) : left === right;

const ask = async (filesystem: VmFileSystem, { question, path }: BundlerRead): Promise<BundlerRead['answer']> => {
  if (question === 'exists') {
    return filesystem.exists(path);
  }
  return question === 'utf8' ? filesystem.readFile(path, 'utf8') : filesystem.readFile(path);
};

const cacheEntryIsCurrent = async (filesystem: VmFileSystem, reads: readonly BundlerRead[]): Promise<boolean> => {
  const comparisons = await Promise.all(
    reads.map(async (read) => {
      try {
        return sameAnswer(await ask(filesystem, read), read.answer);
      } catch {
        return false;
      }
    }),
  );
  return comparisons.every(Boolean);
};

/**
 * Wrap the VM filesystem so a new bundle is cached with the answers it was
 * built from, not a later re-read that a mid-bundle save could already have
 * changed.
 *
 * @param filesystem - The run's VM filesystem.
 * @returns The recording filesystem for the bundler, and its reads: undefined
 *   when the bundle must not be cached, because a read failed or the same read
 *   returned two different answers.
 */
const recordBundlerReads = (
  filesystem: VmFileSystem,
): { filesystem: VmFileSystem; reads: () => BundlerRead[] | undefined; observed: () => BundlerRead[] } => {
  const reads = new Map<string, BundlerRead>();
  let consistent = true;
  const observe = async <Answer extends BundlerRead['answer']>(
    question: BundlerRead['question'],
    path: string,
    pending: Promise<Answer>,
  ): Promise<Answer> => {
    try {
      const answer = await pending;
      const previous = reads.get(`${question}:${path}`);
      if (previous === undefined) {
        reads.set(`${question}:${path}`, {
          question,
          path,
          answer: answer instanceof Uint8Array ? Uint8Array.from(answer) : answer,
        });
      } else {
        consistent &&= sameAnswer(previous.answer, answer);
      }
      return answer;
    } catch (error) {
      consistent = false;
      throw error;
    }
  };
  // ponytail: exactly the VmFileSystem contract; record any read method the bundler gains (an optional stat) here too.
  return {
    filesystem: {
      exists: async (path) => observe('exists', path, filesystem.exists(path)),
      readFile: (async (path: string, encoding?: 'utf8') =>
        encoding === 'utf8'
          ? observe('utf8', path, filesystem.readFile(path, 'utf8'))
          : observe('bytes', path, filesystem.readFile(path))) as VmFileSystem['readFile'],
      writeFile: async (path, content) => filesystem.writeFile(path, content),
      ensureDir: async (path) => filesystem.ensureDir(path),
    },
    reads: () => (consistent ? [...reads.values()] : undefined),
    observed: () => [...reads.values()],
  };
};

const resolveCachedBundle = async (options: RunGeoSpecModuleOptions) => {
  const entry = options.bundleCache?.get(options.entryPath);
  if (
    entry === undefined ||
    entry.builtinIdentity !== builtinIdentity(options) ||
    !(await cacheEntryIsCurrent(options.filesystem, entry.bundlerReads))
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

export const describe = (name, fn) => getRunBinding().collector.describe(name, fn);
describe.skip = (name, fn) => getRunBinding().collector.describeSkip(name, fn);

export const it = (name, fn) => getRunBinding().collector.it(name, fn);
it.skip = (name, fn) => getRunBinding().collector.itSkip(name, fn);

export const test = it;
export const expectGeo = (subject) => getRunBinding().collector.expectGeo(subject);
`;

const createGeospecModelBuiltinCode = (runToken: string): string => `
${createBindingAccessorCode(runToken)}
export const GeoSpecModelLoadError = getRunBinding().geoSpecModelLoadError;

export const loadModel = async (options) => {
  const binding = getRunBinding();
  const loader = binding.nativeAssertions ? binding.nativeModelLoader : binding.modelLoader;
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

export const createModelLoader = (defaults = {}) => {
  const factory = getRunBinding().createModelLoader;
  if (typeof factory !== 'function') {
    throw new GeoSpecModelLoadError([{ code: 'GEOSPEC_MODEL_LOADER_UNAVAILABLE', severity: 'error', message: 'No managed GeoSpec model loader is active for this runner.' }]);
  }
  return factory(defaults);
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

  const recorder = recordBundlerReads(options.filesystem);
  const vm = await createEsbuildModuleVm({
    filesystem: recorder.filesystem,
  });
  const collector = createCollector({
    ...(options.matcherWallBackstop === undefined ? {} : { matcherWallBackstop: options.matcherWallBackstop }),
    ...(options.forensic === undefined ? {} : { forensic: options.forensic }),
    ...(options.nativeAssertions === undefined ? {} : { nativeAssertions: options.nativeAssertions }),
  });
  const cached = await resolveCachedBundle(options);
  const runToken = createRunToken();
  const bindings = ensureRunBindings();
  // D-S3: the model loader is INJECTED. The engine's runner hosts own its
  // construction (caching, affinity, resource-scope tracking); this module
  // compiles and executes the spec against whatever it is handed.
  const meshSubjects = new Set<string>();
  const meshProtocol = options.nativeAssertions === undefined ? getGeoSpecEngineProtocol() : undefined;
  const nativeAdmissions = new Set<Promise<unknown>>();
  const loads: Array<GeoSpecRunLineage['loads'][number]> = [];
  const drainAdmissions = async (): Promise<void> => {
    do {
      const batch = [...nativeAdmissions];
      // oxlint-disable-next-line no-await-in-loop -- Settled load callbacks may register another finite admission.
      await Promise.allSettled(batch);
      for (const pending of batch) {
        nativeAdmissions.delete(pending);
      }
    } while (nativeAdmissions.size > 0);
  };
  const configuredNativeModelLoader = options.nativeModelLoader;
  const configuredModelLoader = options.modelLoader;
  const admissionClient =
    options.nativeAssertions === undefined ? undefined : createGeoSpecAssertionClient(options.nativeAssertions);
  let nativeScopeLive = true;
  /* oxlint-disable typescript/promise-function-async -- Return the exact admission promise to the authored module. */
  const trackedNativeModelLoader: GeoSpecModelLoader | undefined =
    configuredNativeModelLoader === undefined && configuredModelLoader === undefined
      ? undefined
      : (loadOptions) => {
          const index = loads.length;
          const loadId = `${runToken}:load:${index + 1}`;
          loads.push({ loadId, status: 'unavailable' });
          const pending = (async () => {
            try {
              const admission =
                configuredNativeModelLoader === undefined
                  ? resolveGeoSpecSubject(await configuredModelLoader!(loadOptions), options.nativeAssertions?.engine)
                  : undefined;
              const rawSubject =
                admission === undefined
                  ? await configuredNativeModelLoader!(loadOptions)
                  : { ...admission.identity, load: admission.load };
              const { load, ...identity } = rawSubject;
              const ensureResident = admission?.ensureResident ?? rawSubjectResidency(rawSubject);
              const evidence = load === undefined ? undefined : { ...structuredClone(load), loadId };
              loads[index] = {
                loadId,
                status: evidence?.status ?? 'unavailable',
                subject: identity,
                ...(evidence === undefined ? {} : { evidence }),
              };
              return bindGeoSpecSubject({
                engine: admission?.engine ?? options.nativeAssertions!.engine,
                client: admission?.client ?? admissionClient!,
                identity,
                ...(evidence === undefined ? {} : { load: evidence }),
                isLive: () => nativeScopeLive && (admission?.isLive() ?? true),
                ...(ensureResident === undefined ? {} : { ensureResident }),
              });
            } catch (error) {
              loads[index] = {
                loadId,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                ...(error instanceof GeoSpecModelLoadError ? { diagnostics: error.diagnostics } : {}),
              };
              throw error;
            }
          })();
          // oxlint-disable-next-line promise/prefer-await-to-then -- Observe detached failures immediately, preserving the original admission promise for drainage.
          nativeAdmissions.add(pending.catch(() => undefined));
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
    ...(configuredModelLoader && trackedNativeModelLoader ? { modelLoader: trackedNativeModelLoader } : {}),
    ...(trackedNativeModelLoader ? { nativeModelLoader: trackedNativeModelLoader } : {}),
    ...(trackedNativeModelLoader
      ? {
          createModelLoader: (defaults: CreateModelLoaderOptions): ManagedGeoSpecModelLoader => {
            // VM subjects are released by the run's existing raw-loader owner. A
            // managed child scope drains its loads and invalidates only its facades.
            if (defaults.engine !== undefined || defaults.readSource !== undefined) {
              throw new TypeError('Authored VM model defaults cannot replace the admitting host.');
            }
            let generation = 0;
            const loads = new Set<Promise<unknown>>();
            const loader: GeoSpecModelLoader = async (input) => {
              const current = generation;
              const subject = await trackedNativeModelLoader({ ...defaults, ...input });
              const admission = resolveGeoSpecSubject(subject);
              return bindGeoSpecSubject({
                ...admission,
                isLive: () => admission.isLive() && generation === current,
              });
            };
            // oxlint-disable-next-line typescript/promise-function-async -- Preserve the exact child admission promise for lifecycle drainage.
            const tracked: GeoSpecModelLoader = (input) => {
              const pending = loader(input);
              loads.add(pending);
              return pending;
            };
            return Object.assign(tracked, {
              async dispose() {
                do {
                  const pending = [...loads];
                  // oxlint-disable-next-line no-await-in-loop -- Child-scope load callbacks may enqueue more admissions while draining.
                  await Promise.allSettled(pending);
                  for (const load of pending) {
                    loads.delete(load);
                  }
                } while (loads.size > 0);
                generation += 1;
              },
            });
          },
        }
      : {}),
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
    const bundlerReads = recorder.reads();
    if (options.bundleCache !== undefined && cached === undefined && bundlerReads !== undefined) {
      options.bundleCache.set(options.entryPath, {
        builtinIdentity: builtinIdentity(options),
        runToken,
        bundle,
        bundlerReads,
      });
    }

    // A cached bundle embeds the token of the run that built it. Executing it under this run's own token
    // leaves work that outlives an earlier run with no binding, instead of this run's.
    const executed = await vm.execute(
      cached === undefined ? bundle.code : bundle.code.replaceAll(cached.runToken, runToken),
    );
    const lineage = async (): Promise<GeoSpecRunLineage> => {
      const files: Record<string, string> = {};
      let consistent = recorder.reads() !== undefined;
      for (const read of cached?.bundlerReads ?? recorder.observed()) {
        if (read.question === 'exists' || typeof read.answer === 'boolean') {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- Digest the exact recorded bundler answers, not mutable filesystem rereads.
        const digest = await sha256Bytes(
          typeof read.answer === 'string' ? new TextEncoder().encode(read.answer) : read.answer,
        );
        consistent &&= files[read.path] === undefined || files[read.path] === `sha256:${digest}`;
        files[read.path] = `sha256:${digest}`;
      }
      const observed = new Map<string, string>(Object.entries(files));
      for (const load of loads) {
        const { evidence } = load;
        for (const artifact of evidence?.exportOptions === undefined ? (evidence?.artifacts ?? []) : []) {
          if (artifact.sourcePath !== undefined) {
            const digest = `sha256:${artifact.sha256}`;
            consistent &&= !observed.has(artifact.sourcePath) || observed.get(artifact.sourcePath) === digest;
            observed.set(artifact.sourcePath, digest);
          }
        }
        if (evidence?.sourcePath !== undefined && evidence.exportOptions === undefined) {
          const primary = evidence.artifacts[0];
          if (primary !== undefined) {
            const digest = `sha256:${primary.sha256}`;
            consistent &&= !observed.has(evidence.sourcePath) || observed.get(evidence.sourcePath) === digest;
            observed.set(evidence.sourcePath, digest);
          }
        }
        for (const [path, digest] of Object.entries(load.evidence?.sourceRevision?.files ?? {})) {
          consistent &&= !observed.has(path) || observed.get(path) === digest;
          observed.set(path, digest);
        }
      }
      return {
        status: consistent ? (loads.some((load) => load.status !== 'complete') ? 'unavailable' : 'complete') : 'mixed',
        modules: [
          {
            entryPath: options.entryPath,
            bundleSha256: await sha256Bytes(
              new TextEncoder().encode(
                cached === undefined ? bundle.code : bundle.code.replaceAll(cached.runToken, runToken),
              ),
            ),
            files,
            consistent,
          },
        ],
        loads,
      };
    };
    const accounting = (selected: number): GeoSpecTestAccounting => ({
      discovered: collector.tests.length,
      selected,
      completed: collector.tests.filter((test) => test.status !== 'not-run' && test.status !== 'skipped').length,
      passed: collector.tests.filter((test) => test.status === 'passed').length,
      failed: collector.tests.filter((test) => test.status === 'failed').length,
      unsupported: collector.tests.filter((test) => test.status === 'unsupported').length,
      inconclusive: collector.tests.filter((test) => test.status === 'inconclusive').length,
      skipped: collector.tests.filter((test) => test.status === 'skipped').length,
      notRun: collector.tests.filter((test) => test.status === 'not-run').length,
    });
    if (!executed.success) {
      await drainAdmissions();
      return {
        success: false,
        issues: executed.issues,
        bundle,
        tests: collector.tests,
        accounting: accounting(0),
        lineage: await lineage(),
      };
    }
    if (options.collectOnly === true) {
      // R3 shard splitting: register tests (async describes included) without
      // running any body — a never-matching pattern skips every scheduled test.
      await collector.waitForCompletion(options.testTimeout, /(?!)/u);
      await drainAdmissions();
      return {
        success: true,
        passed: false,
        tests: collector.tests,
        bundle,
        accounting: accounting(0),
        lineage: await lineage(),
      };
    }
    await collector.waitForCompletion(options.testTimeout, compiledTestNamePattern.pattern);
    await drainAdmissions();
    const tests = filterGeoSpecTests(collector.tests, compiledTestNamePattern.pattern);
    const sourceLineage = await lineage();

    return {
      success: true,
      passed:
        sourceLineage.status === 'complete' &&
        tests.every((test) => test.status === 'passed' || test.status === 'skipped'),
      tests,
      bundle,
      accounting: accounting(tests.length),
      lineage: sourceLineage,
    };
  } finally {
    meshAnalysisClosed = true;
    await drainAdmissions();
    nativeScopeLive = false;
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
