import { desktopBridge } from '#filesystem/desktop-bridge.js';
// oxlint-disable-next-line no-restricted-imports -- Debug-only current-source authority overlay; frozen catalog stays intact.
// eslint-disable-next-line @nx/enforce-module-boundaries -- Debug-only private current-source overlay.
import currentAuthority from '../../../../packages/geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v5.json' with { type: 'json' };
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug-only adapter shares a private benchmark catalog; no package export is added.
import {
  performanceLabCases,
  performanceLabNativeQueries,
  performanceLabScaleCases,
  performanceLabScaleQueries,
} from '../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Type-only view of the same private benchmark catalog.
import type {
  LabFixture,
  PerformanceLabCase as CatalogCase,
} from '../../../../packages/geospec-engine-native/bench/performance-lab.js';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Private runner contract shared with the desktop utility.
import type {
  PerformanceLabRunInput,
  PerformanceLabRunResult,
  PerformanceLabWasmExecution,
} from '../../../../packages/geospec-engine-native/bench/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */

declare const tauGeoSpecMtReceipts: Readonly<Record<number, string>>;

export const availableMtPermits = (): readonly number[] =>
  Object.keys(tauGeoSpecMtReceipts)
    .map(Number)
    .sort((left, right) => left - right);

export const mtExecution = (permits: number): Extract<PerformanceLabWasmExecution, { variant: 'mt' }> | undefined => {
  const path = tauGeoSpecMtReceipts[permits];
  return path && typeof location !== 'undefined'
    ? { variant: 'mt', permits, receipt: new URL(path, location.href).href }
    : undefined;
};

export type PerformanceLabSelectionCase =
  | CatalogCase
  | (typeof performanceLabNativeQueries)[number]
  | (typeof performanceLabScaleQueries)[number];
const unverifiedV5 = new Set(currentAuthority.affectedCaseIds);

export type PerformanceLabPortRequest = {
  id: number;
  type: 'run';
  input: PerformanceLabRunInput;
};
export type PerformanceLabPortResponse =
  | { id: number; type: 'result'; result: PerformanceLabRunResult }
  | { id: number; type: 'error'; message: string };

/** Per-cell infrastructure deadline in milliseconds. */
const cellTimeout = 300_000;
const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new Error('Performance lab is closed.');

const toRunCase = (value: PerformanceLabSelectionCase): PerformanceLabRunInput['cases'][number] =>
  'matcher' in value
    ? {
        id: value.id,
        kind: 'matcher',
        matcher: value.matcher,
        arguments: value.arguments,
        payload: value.claim.payload,
        claimId: value.claim.claimId,
        subjectSlot: value.claim.subjectSlots[0],
        workUnitBudget: value.claim.workUnitBudget,
        polarity: value.claim.polarity,
        expectedStatus: unverifiedV5.has(value.id) ? 'unverified' : value.expectedStatus,
      }
    : {
        id: value.id,
        kind: 'query',
        matcher: value.capability,
        arguments: [],
        payload: value.claim.payload,
        claimId: value.claim.claimId,
        subjectSlot: value.claim.subjectSlots[0],
        workUnitBudget: value.claim.workUnitBudget,
        polarity: 'positive',
        expectedStatus: unverifiedV5.has(value.id) ? 'unverified' : value.expectedStatus,
      };

export const casesForFixture = (fixtureId: string): readonly PerformanceLabSelectionCase[] => [
  ...performanceLabCases.filter((entry) => entry.fixtureId === fixtureId),
  ...performanceLabScaleCases.filter((entry) => entry.fixtureId === fixtureId),
  ...performanceLabScaleQueries.filter((entry) => entry.fixtureId === fixtureId),
  ...performanceLabNativeQueries.filter((entry) => entry.fixtureId === fixtureId),
];

const scaleIds = new Set([...performanceLabScaleCases, ...performanceLabScaleQueries].map(({ id }) => id));
export const catalogCasesForFixture = (
  fixtureId: string,
  includeScale: boolean,
): readonly PerformanceLabSelectionCase[] =>
  casesForFixture(fixtureId).filter(({ id }) => includeScale || !scaleIds.has(id));

export const runInput = ({
  engine,
  fixture,
  bytes,
  cases,
  repeats,
  cache,
  execution,
}: {
  engine: PerformanceLabRunInput['engine'];
  fixture: LabFixture;
  bytes: Uint8Array<ArrayBuffer>;
  cases: readonly PerformanceLabSelectionCase[];
  repeats: number;
  cache: PerformanceLabRunInput['cache'];
  execution?: PerformanceLabWasmExecution;
}): PerformanceLabRunInput => ({
  engine,
  ...(execution === undefined ? {} : { execution }),
  fixture: {
    id: fixture.id,
    format: fixture.format,
    sourceUnit: fixture.sourceUnit,
    bytes,
    sha256: fixture.sha256,
  },
  cases: cases.map((value) => toRunCase(value)),
  repeats,
  cache,
});

export const loadFixtureBytes = async (fixture: LabFixture): Promise<Uint8Array<ArrayBuffer>> => {
  const response = await fetch(fixture.url);
  if (!response.ok) {
    throw new Error(`Could not load ${fixture.label}: HTTP ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

export const loadPreview = async (
  fixture: LabFixture,
): Promise<{ format: 'gltf'; content: Uint8Array<ArrayBuffer>; hash: string } | undefined> => {
  const preview = fixture.format === 'glb' ? { url: fixture.url, sha256: fixture.sha256 } : fixture.previewGlb;
  if (!preview) {
    return undefined;
  }
  const response = await fetch(preview.url);
  if (!response.ok) {
    throw new Error(`Could not load preview: HTTP ${response.status}.`);
  }
  const content = new Uint8Array(await response.arrayBuffer());
  const actualHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', content)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (actualHash !== preview.sha256) {
    throw new Error('Pinned preview SHA-256 does not match its bytes.');
  }
  return {
    format: 'gltf',
    content,
    hash: preview.sha256,
  };
};

const awaitPort = async (
  port: Worker | MessagePort,
  request: PerformanceLabPortRequest,
  signal: AbortSignal,
): Promise<PerformanceLabRunResult> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      port.removeEventListener('message', onMessage as EventListener);
      port.removeEventListener('error', onError as EventListener);
      port.removeEventListener('messageerror', onMessageError as EventListener);
      signal.removeEventListener('abort', onAbort);
    };
    const onMessage = (event: MessageEvent<PerformanceLabPortResponse>): void => {
      if (event.data.id !== request.id) {
        return;
      }
      cleanup();
      if (event.data.type === 'result') {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.message));
      }
    };
    const onError = (event: Event): void => {
      cleanup();
      reject(new Error(event instanceof ErrorEvent ? event.message : 'Performance worker failed to start or execute.'));
    };
    const onMessageError = (): void => {
      cleanup();
      reject(new Error('Performance worker returned an unreadable message.'));
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal));
    };
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    port.addEventListener('message', onMessage as EventListener);
    port.addEventListener('error', onError as EventListener);
    port.addEventListener('messageerror', onMessageError as EventListener);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      if ('start' in port) {
        port.start();
      }
      port.postMessage(request);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

const awaitConnection = async (connection: Promise<MessagePort>, signal: AbortSignal): Promise<MessagePort> => {
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const port = await Promise.race([
      connection.then((connected) => {
        if (signal.aborted) {
          connected.close();
          throw abortError(signal);
        }
        return connected;
      }),
      aborted,
    ]);
    if (signal.aborted) {
      port.close();
      throw abortError(signal);
    }
    return port;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

/** Browser worker plus optional desktop native port, owned by one debug-route mount. */
export class GeoSpecPerformanceService {
  readonly #workers = new Map<string, Worker>();
  readonly #activeWorkers = new Set<Worker>();
  readonly #activePorts = new Set<MessagePort>();
  readonly #activeRequests = new Set<AbortController>();
  #nativePort: MessagePort | undefined;
  readonly #warmModules = new Set<string>();
  #id = 0;
  #closed = false;

  public async run(input: PerformanceLabRunInput): Promise<PerformanceLabRunResult> {
    if (this.#closed) {
      throw new Error('Performance lab is closed.');
    }
    const controller = new AbortController();
    this.#activeRequests.add(controller);
    const cellTimeoutHandle = setTimeout(() => {
      controller.abort(new Error(`Performance lab infrastructure timeout after ${cellTimeout} ms.`));
    }, cellTimeout);
    try {
      return await this.#run(input, controller.signal);
    } finally {
      clearTimeout(cellTimeoutHandle);
      this.#activeRequests.delete(controller);
    }
  }

  public close(): void {
    this.#closed = true;
    for (const request of this.#activeRequests) {
      request.abort(new Error('Performance lab is closed.'));
    }
    for (const worker of this.#activeWorkers) {
      this.#retireWorker(worker);
    }
    this.#workers.clear();
    this.#warmModules.clear();
    for (const port of this.#activePorts) {
      this.#retirePort(port);
    }
  }

  async #run(input: PerformanceLabRunInput, signal: AbortSignal): Promise<PerformanceLabRunResult> {
    const id = ++this.#id;
    const identity =
      input.execution?.variant === 'mt'
        ? `combined-wasm/mt/${input.execution.permits}/${input.execution.receipt}`
        : `${input.engine}/${input.execution?.variant ?? 'st'}`;
    if (input.engine !== 'native-desktop') {
      const worker =
        (input.cache === 'warm' ? this.#workers.get(identity) : undefined) ??
        new Worker(new URL('../workers/geospec-performance.worker.ts', import.meta.url), { type: 'module' });
      this.#activeWorkers.add(worker);
      if (input.cache === 'warm') {
        this.#workers.set(identity, worker);
      }
      const actualInput: PerformanceLabRunInput =
        input.cache === 'warm' && !this.#warmModules.has(identity) ? { ...input, cache: 'cold' } : input;
      try {
        const result = await awaitPort(
          worker,
          {
            id,
            type: 'run',
            input: actualInput,
          },
          signal,
        );
        if (signal.aborted) {
          throw abortError(signal);
        }
        if (input.cache === 'warm') {
          this.#warmModules.add(identity);
        }
        return result;
      } catch (error) {
        if (worker === this.#workers.get(identity)) {
          this.#workers.delete(identity);
          this.#warmModules.delete(identity);
        }
        this.#retireWorker(worker);
        throw error;
      } finally {
        if (input.cache === 'cold') {
          this.#retireWorker(worker);
        }
      }
    }
    const bridge = desktopBridge();
    if (!bridge?.geoSpecPerformance) {
      throw new Error('Desktop native GeoSpec utility is unavailable.');
    }
    const port = this.#nativePort ?? (await awaitConnection(bridge.geoSpecPerformance.connect(), signal));
    this.#activePorts.add(port);
    this.#nativePort = port;
    const actualInput: PerformanceLabRunInput =
      input.cache === 'warm' && !this.#warmModules.has(identity) ? { ...input, cache: 'cold' } : input;
    try {
      const result = await awaitPort(
        port,
        {
          id,
          type: 'run',
          input: actualInput,
        },
        signal,
      );
      if (signal.aborted) {
        throw abortError(signal);
      }
      if (input.cache === 'warm') {
        this.#warmModules.add(identity);
      }
      return result;
    } catch (error) {
      this.#retirePort(port);
      this.#warmModules.delete(identity);
      throw error;
    }
  }

  #retireWorker(worker: Worker): void {
    if (this.#activeWorkers.delete(worker)) {
      worker.terminate();
    }
  }

  #retirePort(port: MessagePort): void {
    if (this.#nativePort === port) {
      this.#nativePort = undefined;
    }
    if (this.#activePorts.delete(port)) {
      port.close();
    }
  }
}
