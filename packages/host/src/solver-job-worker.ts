import { availableParallelism } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1/index.js';
import { createJobProviderHost } from '@taucad/jobs';
import type { JobInputSnapshot, JobProvider, JobRunnerRegistration } from '@taucad/jobs';
import {
  createHatchetJobTaskProfile,
  createHttpHatchetJobProjection,
  createHttpJobArtifactStore,
  toHatchetRuntimeWorkerLabels,
} from '@taucad/jobs-hatchet';
import type { HatchetJobRuntimeAffinity, HatchetJobTaskProfile } from '@taucad/jobs-hatchet';
import {
  calculixSolverVersion,
  createCalculixCantileverJobDefinition,
  createCalculixJobProvider,
  createNodeSolverProcessExecutor,
  createOpenFoamJobDefinition,
  createOpenFoamJobProvider,
  openFoamContainerImages,
} from '@taucad/jobs-solvers';
import type {
  CalculixContainerImage,
  OpenFoamSolverVersion,
  SolverInputMaterializer,
  SolverProcessExecutor,
} from '@taucad/jobs-solvers';
import { startHatchetHostJobWorker } from '#hatchet-job-worker.js';
import type { HostJobWorkerCloseResult, HostJobWorkerFactory, HostJobWorkerHandle } from '#job-worker.js';

const runnerHeartbeatInterval = 5000;

/** Static solver worker configuration. @public */
export type SolverHatchetJobWorkerFactoryOptions = {
  readonly hatchetToken: string;
  readonly hatchetNamespace: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly slots: number;
  /** Finite retry counts for which Hatchet task profiles are installed. */
  readonly supportedMaxAttempts?: readonly number[];
  /** Exact OpenFOAM release to host, or `false` to disable the provider. */
  readonly openFoamSolverVersion?: OpenFoamSolverVersion | false;
  readonly openFoamImage?: string;
  readonly calculixImage?: CalculixContainerImage;
  readonly executor?: SolverProcessExecutor;
  /** Deployment-owned resolver for immutable input snapshots. */
  readonly inputMaterializer: SolverInputMaterializer;
  readonly workspaceRoot?: string;
};

const profileSnapshot: JobInputSnapshot = {
  digest: `sha256:${'0'.repeat(64)}`,
  size: 0,
  mediaType: 'application/zip',
  storageKey: 'profile-only',
};

const validateAttempts = (values: readonly number[]): readonly number[] => {
  const attempts = [...new Set(values)].toSorted((left, right) => left - right);
  if (attempts.length === 0 || attempts.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError('Solver worker supportedMaxAttempts must contain positive safe integers.');
  }
  return Object.freeze(attempts);
};

const addProfile = (profiles: Map<string, HatchetJobTaskProfile>, profile: HatchetJobTaskProfile): void => {
  profiles.set(profile.name, profile);
};

const staticProfiles = (input: {
  readonly openFoamSolverVersion: false | OpenFoamSolverVersion;
  readonly calculix: boolean;
  readonly ranks: number;
  readonly attempts: readonly number[];
}): readonly HatchetJobTaskProfile[] => {
  const profiles = new Map<string, HatchetJobTaskProfile>();
  for (const maxAttempts of input.attempts) {
    if (input.openFoamSolverVersion !== false) {
      for (let ranks = 1; ranks <= input.ranks; ranks += 1) {
        addProfile(
          profiles,
          createHatchetJobTaskProfile(
            createOpenFoamJobDefinition({
              input: profileSnapshot,
              preset: 'block-simple-foam',
              solverVersion: input.openFoamSolverVersion,
              ranks,
              maxAttempts,
            }),
          ),
        );
      }
    }
    if (input.calculix) {
      addProfile(
        profiles,
        createHatchetJobTaskProfile(
          createCalculixCantileverJobDefinition({
            input: profileSnapshot,
            maxAttempts,
            parameters: {
              length: 1,
              width: 0.1,
              height: 0.1,
              elasticModulus: 210e9,
              poissonRatio: 0.3,
              tipLoad: -1000,
            },
          }),
        ),
      );
    }
  }
  return Object.freeze([...profiles.values()].toSorted((left, right) => left.name.localeCompare(right.name)));
};

const providerCapabilities = (providers: readonly JobProvider[]): Record<string, string> =>
  Object.fromEntries(
    providers.flatMap((provider) => [
      [`provider.${provider.id}.id`, provider.id],
      [`provider.${provider.id}.version`, provider.version],
    ]),
  );

const readRuntimeAffinity = async (input: {
  readonly apiUrl: URL;
  readonly credential: string;
  readonly fetchImplementation: typeof globalThis.fetch;
}): Promise<HatchetJobRuntimeAffinity> => {
  const response = await input.fetchImplementation(new URL('/v1/agents/worker-affinity', input.apiUrl), {
    headers: { authorization: `Bearer ${input.credential}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Tau Host worker affinity request failed with HTTP ${String(response.status)}.`);
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('runtimeAffinity' in body)) {
    throw new TypeError('Tau Host worker affinity response is malformed.');
  }
  const { runtimeAffinity } = body;
  if (
    typeof runtimeAffinity !== 'object' ||
    runtimeAffinity === null ||
    !('kind' in runtimeAffinity) ||
    runtimeAffinity.kind !== 'owner' ||
    !('value' in runtimeAffinity) ||
    typeof runtimeAffinity.value !== 'string' ||
    !/^sha256:[\da-f]{64}$/u.test(runtimeAffinity.value)
  ) {
    throw new TypeError('Tau Host worker affinity response must contain an owner affinity.');
  }
  return { kind: 'owner', value: runtimeAffinity.value };
};

const runnerRequest = async (input: {
  readonly apiUrl: URL;
  readonly credential: string;
  readonly path: 'drain' | 'heartbeat' | 'register';
  readonly payload?: Record<string, unknown>;
  readonly fetchImplementation: typeof globalThis.fetch;
}): Promise<Record<string, unknown>> => {
  const response = await input.fetchImplementation(new URL(`/v1/jobs/runners/${input.path}`, input.apiUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${input.credential}`, 'content-type': 'application/json' },
    body: JSON.stringify(input.payload ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Tau job runner ${input.path} request failed with HTTP ${String(response.status)}.`);
  }
  if (response.status === 204) {
    return {};
  }
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new TypeError(`Tau job runner ${input.path} response is malformed.`);
  }
  return body as Record<string, unknown>;
};

const superviseRegisteredWorker = (input: {
  readonly worker: HostJobWorkerHandle;
  readonly apiUrl: URL;
  readonly credential: string;
  readonly fetchImplementation: typeof globalThis.fetch;
}): HostJobWorkerHandle => {
  const heartbeatStop = new AbortController();
  const lifecycle = { closeRequested: false };
  let closePromise: Promise<void> | undefined;
  const heartbeat = (async (): Promise<void> => {
    while (!heartbeatStop.signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- one authenticated heartbeat owns the runner lease cadence.
      await delay(runnerHeartbeatInterval, undefined, { signal: heartbeatStop.signal });
      // oxlint-disable-next-line no-await-in-loop -- runner heartbeats must be ordered and non-overlapping.
      const outcome = await runnerRequest({ ...input, path: 'heartbeat' });
      if (outcome['accepted'] !== true) {
        const reason = typeof outcome['reason'] === 'string' ? outcome['reason'] : 'unknown';
        throw new Error(`Tau job runner heartbeat was rejected: ${reason}.`);
      }
    }
  })();
  type WorkerRace =
    | { readonly type: 'worker'; readonly result: HostJobWorkerCloseResult }
    | { readonly type: 'heartbeat-stopped' }
    | { readonly type: 'heartbeat-failed'; readonly error: unknown };
  const closed = (async (): Promise<HostJobWorkerCloseResult> => {
    const outcome: WorkerRace = await Promise.race([
      input.worker.closed.then((result): WorkerRace => ({ type: 'worker', result })),
      heartbeat.then(
        (): WorkerRace => ({ type: 'heartbeat-stopped' }),
        (error: unknown): WorkerRace => ({ type: 'heartbeat-failed', error }),
      ),
    ]);
    heartbeatStop.abort();
    if (outcome.type === 'worker') {
      return outcome.result;
    }
    if (lifecycle.closeRequested || outcome.type === 'heartbeat-stopped') {
      return { cause: 'requested' };
    }
    await input.worker.close();
    return {
      cause: 'fatal',
      error: outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error)),
    };
  })();
  return Object.freeze({
    registration: input.worker.registration,
    profiles: input.worker.profiles,
    ready: input.worker.ready,
    closed,
    async close() {
      if (closePromise) {
        return closePromise;
      }
      lifecycle.closeRequested = true;
      heartbeatStop.abort();
      closePromise = (async () => {
        await runnerRequest({ ...input, path: 'drain' }).catch(() => undefined);
        await input.worker.close();
        await closed;
      })();
      return closePromise;
    },
  });
};

/**
 * Create the daemon factory for Tau's selected native Hatchet solver worker.
 *
 * The paired device credential authenticates Tau projection and artifact calls;
 * the Hatchet token is used only for the scheduler connection.
 *
 * @param options - Scheduler, capacity, exact solver images, and host process policy.
 * @returns A credential-aware worker factory suitable for {@link startHostDaemon}.
 * @public
 */
export const createSolverHatchetJobWorkerFactory = (
  options: SolverHatchetJobWorkerFactoryOptions,
): HostJobWorkerFactory => {
  if (!options.hatchetToken.trim() || !options.hatchetNamespace.trim()) {
    throw new TypeError('Solver Hatchet worker token and namespace must be non-empty.');
  }
  if (!Number.isSafeInteger(options.slots) || options.slots < 1) {
    throw new TypeError('Solver Hatchet worker slots must be a positive safe integer.');
  }
  const openFoamSolverVersion = options.openFoamSolverVersion ?? '2506';
  if (openFoamSolverVersion === false && options.calculixImage === undefined) {
    throw new TypeError('Solver Hatchet worker must configure at least one provider.');
  }
  if (openFoamSolverVersion === '2606' && !options.openFoamImage) {
    throw new TypeError('OpenFOAM 2606 must provide an explicit reviewed immutable image.');
  }
  const attempts = validateAttempts(options.supportedMaxAttempts ?? [1]);
  const physicalSlots = Math.min(options.slots, availableParallelism());
  const processExecutor = options.executor ?? createNodeSolverProcessExecutor();

  return Object.freeze({
    async start(input) {
      const fetchImplementation = options.fetch ?? globalThis.fetch;
      const runtimeAffinity = await readRuntimeAffinity({
        apiUrl: input.apiUrl,
        credential: input.credential.credential,
        fetchImplementation,
      });
      const runnerId = input.credential.deviceId;
      const artifactStore = createHttpJobArtifactStore({
        apiUrl: input.apiUrl.href,
        credential: input.credential.credential,
        runnerId,
        fetch: fetchImplementation,
      });
      const providers: JobProvider[] = [];
      if (openFoamSolverVersion !== false) {
        const configuredImage = options.openFoamImage ?? openFoamContainerImages[openFoamSolverVersion];
        providers.push(
          createOpenFoamJobProvider({
            executor: processExecutor,
            inputMaterializer: options.inputMaterializer,
            ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}),
            ...(configuredImage ? { images: { [openFoamSolverVersion]: configuredImage } } : {}),
          }),
        );
      }
      if (options.calculixImage) {
        providers.push(
          createCalculixJobProvider({
            executor: processExecutor,
            inputMaterializer: options.inputMaterializer,
            image: options.calculixImage,
            ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}),
          }),
        );
      }
      const capabilities: JobRunnerRegistration['capabilities'] = Object.freeze({
        'container.engine': 'docker',
        'cpu.count': physicalSlots,
        ...(openFoamSolverVersion === false ? {} : { 'solver.openfoam.version': openFoamSolverVersion }),
        ...(options.calculixImage ? { 'solver.calculix.version': calculixSolverVersion } : {}),
        ...providerCapabilities(providers),
        ...toHatchetRuntimeWorkerLabels(runtimeAffinity),
      });
      const registration: JobRunnerRegistration = {
        runnerId,
        capabilities,
        slots: options.slots,
      };
      const registered = await runnerRequest({
        apiUrl: input.apiUrl,
        credential: input.credential.credential,
        path: 'register',
        payload: { capabilities, slots: registration.slots },
        fetchImplementation,
      });
      if (registered['accepted'] !== true) {
        const reason = typeof registered['reason'] === 'string' ? registered['reason'] : 'unknown';
        throw new Error(`Tau job runner registration was rejected: ${reason}.`);
      }
      const profiles = staticProfiles({
        openFoamSolverVersion,
        calculix: options.calculixImage !== undefined,
        ranks: physicalSlots,
        attempts,
      });
      const client = new HatchetClient({ token: options.hatchetToken, namespace: options.hatchetNamespace });
      const worker = startHatchetHostJobWorker({
        client,
        registration,
        profiles,
        host: createJobProviderHost({ providers, artifactStore }),
        projection: createHttpHatchetJobProjection({
          apiUrl: input.apiUrl.href,
          credential: input.credential.credential,
        }),
      });
      return superviseRegisteredWorker({
        worker,
        apiUrl: input.apiUrl,
        credential: input.credential.credential,
        fetchImplementation,
      });
    },
  });
};
