/* oxlint-disable eslint/no-await-in-loop -- benchmark observations are deliberately sequential */

import { createRuntimeClient } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { TelemetryEntry } from '@taucad/runtime/types';

type FixtureName = 'birdhouse' | 'feature-matrix';
type State = 'cold' | 'warm-cache-disabled' | 'full-hot';
type BenchmarkRow = {
  readonly wall: number;
  readonly runtimeRootCoverage: number;
  readonly clientOverhead: number;
  readonly telemetryEntries: number;
  readonly runtimePhases: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly sha256: string;
};
type TraceDetail = { readonly spanId?: unknown; readonly parentSpanId?: unknown };

const fixtureModules = import.meta.glob(
  '../../../../../libs/tau-examples/src/kernels/replicad/{birdhouse,bundler-feature-matrix}/**/*.{ts,tsx,js,jsx,json,txt,bin}',
  { eager: true, import: 'default', query: '?raw' },
) as Readonly<Record<string, string>>;

const loadFixture = (name: FixtureName) => {
  const directory = name === 'feature-matrix' ? 'bundler-feature-matrix' : 'birdhouse';
  const entry = 'main.ts';
  const marker = `/replicad/${directory}/`;
  const files = Object.fromEntries(
    Object.entries(fixtureModules)
      .filter(([path]) => path.includes(marker))
      .map(([path, source]) => [path.slice(path.indexOf(marker) + marker.length), source]),
  );
  return { files, entry };
};

const hash = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const rootCoverage = (entries: readonly TelemetryEntry[]): number => {
  const ids = new Set(
    entries
      .map(({ detail }) => (detail as TraceDetail | undefined)?.spanId)
      .filter((id): id is string => typeof id === 'string'),
  );
  const roots = entries
    .filter(({ detail }) => {
      const parent = (detail as TraceDetail | undefined)?.parentSpanId;
      return typeof parent !== 'string' || !ids.has(parent);
    })
    .map(({ startTime, duration }) => ({ start: startTime, end: startTime + duration }))
    .sort((left, right) => left.start - right.start);
  let covered = 0;
  let end = Number.NEGATIVE_INFINITY;
  for (const range of roots) {
    covered += Math.max(0, range.end - Math.max(range.start, end));
    end = Math.max(end, range.end);
  }
  return covered;
};

const createClient = (state: State, files: Readonly<Record<string, string>>) => {
  const createWorker = (): Worker =>
    state === 'warm-cache-disabled'
      ? new Worker(new URL('uncached.worker.ts', import.meta.url), { name: 'tau-bundler-uncached', type: 'module' })
      : new Worker(new URL('cached.worker.ts', import.meta.url), { name: 'tau-bundler-cached', type: 'module' });
  return createRuntimeClient(createWebWorkerClientOptions({ createWorker, files, renderTimeout: 300_000 }));
};

const invoke = async (input: {
  readonly client: ReturnType<typeof createClient>;
  readonly fixture: ReturnType<typeof loadFixture>;
  readonly state: State;
  readonly index: number;
}): Promise<BenchmarkRow> => {
  const { client, fixture, index, state } = input;
  const telemetry: TelemetryEntry[] = [];
  const off = client.on('telemetry', (batch) => telemetry.push(...batch));
  const entrySource = fixture.files[fixture.entry];
  if (typeof entrySource !== 'string') {
    throw new TypeError(`Missing browser fixture entry '${fixture.entry}'.`);
  }
  const source =
    state === 'warm-cache-disabled'
      ? {
          files: {
            ...fixture.files,
            [fixture.entry]: `${entrySource}\nexport const __benchmarkVariant = ${index};\n`,
          },
          entry: fixture.entry,
        }
      : { path: fixture.entry };
  const started = performance.now();
  const result = await client.export('glb', { source });
  const wall = performance.now() - started;
  off();
  if (!result.success) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  const output = result.data.find(({ name }) => name.endsWith('.glb'))?.bytes;
  if (output === undefined) {
    throw new Error('Runtime returned no GLB output.');
  }
  const coverage = rootCoverage(telemetry);
  return {
    wall,
    runtimeRootCoverage: coverage,
    clientOverhead: wall - coverage,
    telemetryEntries: telemetry.length,
    runtimePhases: Object.fromEntries(
      [...new Set(telemetry.map(({ name }) => name))].map((name) => [
        name,
        telemetry.filter((entry) => entry.name === name).reduce((total, entry) => total + entry.duration, 0),
      ]),
    ),
    bytes: output.byteLength,
    sha256: await hash(output),
  };
};

const cold = async (name: FixtureName): Promise<BenchmarkRow> => {
  const fixture = loadFixture(name);
  const client = createClient('cold', fixture.files);
  try {
    return await invoke({ client, fixture, state: 'cold', index: 0 });
  } finally {
    await client.shutdown({ drain: true });
  }
};

const warm = async (input: {
  readonly fixture: FixtureName;
  readonly state: Exclude<State, 'cold'>;
  readonly iterations: number;
  readonly warmups: number;
}) => {
  const fixture = loadFixture(input.fixture);
  const clientStarted = performance.now();
  const client = createClient(input.state, fixture.files);
  const clientCreation = performance.now() - clientStarted;
  const rows: BenchmarkRow[] = [];
  let shutdown = 0;
  try {
    for (let index = 0; index < input.warmups + input.iterations; index += 1) {
      const row = await invoke({ client, fixture, state: input.state, index });
      if (index >= input.warmups) {
        rows.push(row);
      }
    }
  } finally {
    const shutdownStarted = performance.now();
    await client.shutdown({ drain: true });
    shutdown = performance.now() - shutdownStarted;
  }
  return { clientCreation, shutdown, rows };
};

globalThis.__tauBundlerBenchmark = { cold, warm };

declare global {
  var __tauBundlerBenchmark: {
    readonly cold: typeof cold;
    readonly warm: typeof warm;
  };
}

/* oxlint-enable eslint/no-await-in-loop -- end sequential benchmark */
