/** Opt-in protocol-3 serial runner over the existing GeoSpec VM. @module */

import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type {
  CreateGeoSpecNativeModelLoaderOptions,
  GeoSpecNativeModelEngine,
  GeoSpecNativeLoadModelOptions,
  ManagedGeoSpecNativeModelLoader,
} from '#model/native-model-loader.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunner, GeoSpecRunnerOptions } from '#runner/worker/index.js';

/** Native assertion options whose engine can also admit and release subjects. @public */
export type GeoSpecNativeRunnerAssertions = Omit<GeoSpecAssertionClientOptions, 'engine'> & {
  readonly engine: GeoSpecNativeModelEngine;
};

/** Options for the native serial runner. @public */
export type GeoSpecNativeRunnerOptions = Omit<GeoSpecRunnerOptions, 'nativeAssertions' | 'nativeModelLoader'> & {
  /** Actual protocol-3 engine used by authored assertions. */
  readonly nativeAssertions: GeoSpecNativeRunnerAssertions;
  /** Optional managed loader; the runner releases its subjects after every run. */
  readonly nativeModelLoader?: ManagedGeoSpecNativeModelLoader;
  /** Defaults used when the runner constructs its own native loader. */
  readonly model?: Omit<CreateGeoSpecNativeModelLoaderOptions, 'engine'>;
};

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Only this run's successful model loads authorize assertion subjects.
 * @param request - Encoded native claim request.
 * @param admitted - Subjects loaded in the current runner invocation.
 */
const assertAdmittedSubjects = (request: Uint8Array<ArrayBuffer>, admitted: ReadonlySet<string>): void => {
  const envelope: unknown = JSON.parse(decoder.decode(request));
  if (typeof envelope !== 'object' || envelope === null || !('plan' in envelope)) {
    throw new TypeError('Native GeoSpec assertion requires a plan with admitted subjects.');
  }
  const { plan } = envelope;
  if (
    typeof plan !== 'object' ||
    plan === null ||
    !('subjects' in plan) ||
    !Array.isArray(plan.subjects) ||
    plan.subjects.length === 0
  ) {
    throw new TypeError('Native GeoSpec assertion requires admitted subjects.');
  }
  for (const subject of plan.subjects as unknown[]) {
    if (typeof subject !== 'object' || subject === null) {
      throw new TypeError('Native GeoSpec assertion requires admitted subjects.');
    }
    const hasSubjectHash = 'subjectHash' in subject;
    const hasContentHash = 'contentHash' in subject;
    if (hasSubjectHash === hasContentHash) {
      throw new TypeError('Native GeoSpec assertion requires one admitted subject identity.');
    }
    const hash: unknown = hasSubjectHash
      ? subject.subjectHash
      : 'contentHash' in subject
        ? subject.contentHash
        : undefined;
    if (typeof hash !== 'string' || !admitted.has(hash)) {
      throw new TypeError('Native GeoSpec subject was not admitted by this run.');
    }
  }
};

/**
 * Compose compiled assertion and model bindings with the SDK's serial lifecycle.
 *
 * @param options - VM filesystem, native engine/client options and model defaults.
 * @returns The ordinary GeoSpec runner lifecycle and event contract.
 * @public
 */
export const createNativeGeoSpecRunner = (options: GeoSpecNativeRunnerOptions): GeoSpecRunner => {
  const nativeModelLoader =
    options.nativeModelLoader ??
    createGeoSpecNativeModelLoader({
      ...options.model,
      engine: options.nativeAssertions.engine,
    });
  const admitted = new Set<string>();
  const scopedLoader: ManagedGeoSpecNativeModelLoader = Object.assign(
    async (loadOptions: GeoSpecNativeLoadModelOptions) => {
      const subject = await nativeModelLoader(loadOptions);
      admitted.add(subject.subjectHash);
      return subject;
    },
    {
      async releaseAll() {
        try {
          await nativeModelLoader.releaseAll();
        } finally {
          admitted.clear();
        }
      },
    },
  );
  const sourceEngine = options.nativeAssertions.engine;
  const assertionEngine: GeoSpecNativeModelEngine = {
    evaluateClaim(request) {
      assertAdmittedSubjects(request, admitted);
      return sourceEngine.evaluateClaim(request);
    },
    processRequest(request) {
      const envelope: unknown = JSON.parse(decoder.decode(request));
      if (
        typeof envelope === 'object' &&
        envelope !== null &&
        'method' in envelope &&
        envelope.method === 'submitClaims'
      ) {
        assertAdmittedSubjects(request, admitted);
      }
      return sourceEngine.processRequest(request);
    },
    ingestSubject: (request, primary, resources) => sourceEngine.ingestSubject(request, primary, resources),
    subjectHandle: (request) => sourceEngine.subjectHandle(request),
    releaseSubject: (request) => sourceEngine.releaseSubject(request),
  };
  const runner = createSerialGeoSpecRunner({
    filesystem: options.filesystem,
    nativeAssertions: { ...options.nativeAssertions, engine: assertionEngine },
    nativeModelLoader: scopedLoader,
    ...(options.builtinModules === undefined ? {} : { builtinModules: options.builtinModules }),
  });
  return {
    ...runner,
    async close() {
      try {
        await runner.close();
      } finally {
        admitted.clear();
      }
    },
  };
};
