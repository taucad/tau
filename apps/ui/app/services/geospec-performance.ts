import { desktopBridge } from '#filesystem/desktop-bridge.js';
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug-only adapter shares a private benchmark catalog; no package export is added.
import {
  performanceLabCases,
  performanceLabNativeQueries,
  performanceLabScaleCases,
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
} from '../../../../packages/geospec-engine-native/bench/performance-lab-runner.js';
/* oxlint-enable no-restricted-imports */

export type PerformanceLabSelectionCase = CatalogCase | (typeof performanceLabNativeQueries)[number];

export type PerformanceLabPortRequest = {
  id: number;
  type: 'run';
  input: PerformanceLabRunInput;
};
export type PerformanceLabPortResponse =
  | { id: number; type: 'result'; result: PerformanceLabRunResult }
  | { id: number; type: 'error'; message: string };

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
        expectedStatus: value.expectedStatus,
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
        expectedStatus: value.expectedStatus,
      };

export const casesForFixture = (fixtureId: string): readonly PerformanceLabSelectionCase[] => [
  ...performanceLabCases.filter((entry) => entry.fixtureId === fixtureId),
  ...performanceLabScaleCases.filter((entry) => entry.fixtureId === fixtureId),
  ...performanceLabNativeQueries.filter((entry) => entry.fixtureId === fixtureId),
];

const scaleIds = new Set(performanceLabScaleCases.map(({ id }) => id));
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
}: {
  engine: PerformanceLabRunInput['engine'];
  fixture: LabFixture;
  bytes: Uint8Array<ArrayBuffer>;
  cases: readonly PerformanceLabSelectionCase[];
  repeats: number;
  cache: PerformanceLabRunInput['cache'];
}): PerformanceLabRunInput => ({
  engine,
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
): Promise<PerformanceLabRunResult> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
      port.removeEventListener('message', onMessage as EventListener);
      port.removeEventListener('error', onError as EventListener);
      port.removeEventListener('messageerror', onMessageError as EventListener);
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
    port.addEventListener('message', onMessage as EventListener);
    port.addEventListener('error', onError as EventListener);
    port.addEventListener('messageerror', onMessageError as EventListener);
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

/** Browser worker plus optional desktop native port, owned by one debug-route mount. */
export class GeoSpecPerformanceService {
  readonly #workers = new Map<PerformanceLabRunInput['engine'], Worker>();
  #nativePort: MessagePort | undefined;
  readonly #warmModules = new Set<PerformanceLabRunInput['engine']>();
  #id = 0;
  #closed = false;

  public async run(input: PerformanceLabRunInput): Promise<PerformanceLabRunResult> {
    if (this.#closed) {
      throw new Error('Performance lab is closed.');
    }
    const id = ++this.#id;
    if (input.engine !== 'native-desktop') {
      const worker =
        (input.cache === 'warm' ? this.#workers.get(input.engine) : undefined) ??
        new Worker(new URL('../workers/geospec-performance.worker.ts', import.meta.url), { type: 'module' });
      if (input.cache === 'warm') {
        this.#workers.set(input.engine, worker);
      }
      const actualInput: PerformanceLabRunInput =
        input.cache === 'warm' && !this.#warmModules.has(input.engine) ? { ...input, cache: 'cold' } : input;
      try {
        const result = await awaitPort(worker, {
          id,
          type: 'run',
          input: actualInput,
        });
        if (input.cache === 'warm') {
          this.#warmModules.add(input.engine);
        }
        return result;
      } catch (error) {
        if (worker === this.#workers.get(input.engine)) {
          worker.terminate();
          this.#workers.delete(input.engine);
          this.#warmModules.delete(input.engine);
        }
        throw error;
      } finally {
        if (input.cache === 'cold') {
          worker.terminate();
        }
      }
    }
    const bridge = desktopBridge();
    if (!bridge?.geoSpecPerformance) {
      throw new Error('Desktop native GeoSpec utility is unavailable.');
    }
    this.#nativePort ??= await bridge.geoSpecPerformance.connect();
    const actualInput: PerformanceLabRunInput =
      input.cache === 'warm' && !this.#warmModules.has(input.engine) ? { ...input, cache: 'cold' } : input;
    try {
      const result = await awaitPort(this.#nativePort, {
        id,
        type: 'run',
        input: actualInput,
      });
      if (input.cache === 'warm') {
        this.#warmModules.add(input.engine);
      }
      return result;
    } catch (error) {
      this.#nativePort.close();
      this.#nativePort = undefined;
      this.#warmModules.delete(input.engine);
      throw error;
    }
  }

  public close(): void {
    this.#closed = true;
    for (const worker of this.#workers.values()) {
      worker.terminate();
    }
    this.#workers.clear();
    this.#nativePort?.close();
  }
}
