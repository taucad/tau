// @vitest-environment node
/**
 * The repo's first gated timing benchmark: the native OpenRSCAD engine against
 * the WebAssembly one, through the runtime client, on the same source.
 *
 * Shape copied from `repos/nanoraster/bench/gated.mjs` and
 * `repos/nanoraster/scripts/compare-benchmark.mjs`:
 *
 * * every case is **named and versioned** (`…-v1`). A change that legitimately
 *   moves the artifact renames the case; it never edits the fingerprint in
 *   place, because then nothing would have failed.
 * * the artifact **fingerprint is the hard gate** and it is always on. It is
 *   captured from the first call of a fresh client, never from a long-lived
 *   benchmark process — the engine used to emit two different GLBs for one
 *   document inside one process, and a benchmark that samples late would have
 *   recorded the wrong one.
 * * timings are the **median of 15 interleaved samples**. Interleaved is not a
 *   detail: an engine-major harness (all of A, then all of B) measured
 *   `rounded.scad` native-slower, and the interleaved re-run inverted it.
 *
 * Two gates, deliberately different in kind:
 *
 * * **Always on — the native/wasm ratio.** Both engines are sampled in the same
 *   loop on the same machine at the same moment, so the ratio survives an
 *   unquiet host in a way an absolute millisecond figure does not. This is
 *   charter gate G4.
 * * **Opt-in — absolute milliseconds.** `MAX_MEDIAN_MS` (a hard ceiling) and
 *   the +10 % comparison against the checked-in baseline only apply when
 *   `TAU_BENCH_GATE=1`, because a developer laptop under fleet load cannot be
 *   compared to a pinned runner. Set it in CI on the pinned host only.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscadKernel } from '@taucad/openrscad';
import { openrscadNativeKernel } from '@taucad/openrscad-native';
import { loadFixture } from '@taucad/tau-examples/fixtures';

/**
 * Gated cases. Only models whose measured run-to-run spread is small enough for
 * a median of 15 to mean anything belong here — an unstable model turns a gate
 * into a coin flip, and a coin-flip gate gets disabled within a month.
 */
const cases = [
  {
    // Steady state: one long-lived client per engine, so this is the engine's
    // throughput with both caches warm — what an editing session pays.
    name: 'openscad-kitchen-sink-export-glb-warm-v1',
    fixture: loadFixture('openscad', 'kitchen-sink'),
    cold: false,
  },
  {
    // A fresh runtime client per sample: kernel `initialize()`, a cold geometry
    // cache and a cold structured cache every time. Note this is *not* a cold
    // process — the engine module stays in Node's module cache, so the wasm
    // build does not re-pay instantiation or first-call tier-up here. The
    // process-cold figures (module load 1.2-2.2 ms native vs 13.7-18.8 ms wasm)
    // can only be measured by spawning `node`, which a unit test must not do.
    name: 'openscad-kitchen-sink-export-glb-fresh-client-v1',
    fixture: loadFixture('openscad', 'kitchen-sink'),
    cold: true,
  },
] as const;

/**
 * Baseline medians in **milliseconds** from a quiet Apple M2 Pro (macOS 26.5.2,
 * Node 24.10). Only consulted when `TAU_BENCH_GATE=1`; the ratio gate below
 * needs no baseline because it is measured within one run.
 */
const baseline: Record<string, { wasm: number; native: number }> = {
  // Measured medians of 15 interleaved samples, three runs, idle machine:
  // warm 5.1-5.6 / 3.9-4.3 ms, fresh-client 14.2-15.9 / 12.2-13.2 ms.
  // Rounded up to the observed spread's ceiling, since the gate is one-sided.
  'openscad-kitchen-sink-export-glb-warm-v1': { wasm: 5.6, native: 4.4 },
  'openscad-kitchen-sink-export-glb-fresh-client-v1': { wasm: 16, native: 13.3 },
};

const iterations = 15;
const warmups = 8;
const gateAbsolute = process.env['TAU_BENCHMARK_GATE'] === '1' || process.env['TAU_BENCH_GATE'] === '1';

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
};

const createClient = (kernel: typeof openrscadKernel, files: Record<string, string>) => {
  const runtime = defineRuntime({ kernels: [kernel()] });
  return createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs(files) }) });
};

const exportGlb = async (client: ReturnType<typeof createClient>, mainFile: string) => {
  const result = await client.export('glb', {
    source: { path: mainFile },
    parameters: {},
  });
  if (!result.success) {
    throw new Error(result.issues.map((issue) => issue.message).join('; '));
  }
  const file = result.data[0];
  if (!file) {
    throw new Error('export produced no file');
  }
  return Buffer.from(file.bytes);
};

describe('native OpenRSCAD speedup (gated)', () => {
  for (const { name, fixture, cold } of cases) {
    it(
      name,
      async () => {
        // Fingerprints first, each from a fresh client's first call.
        const engines = { wasm: openrscadKernel, native: openrscadNativeKernel };
        const fingerprints: Record<string, { bytes: number; sha256: string }> = {};
        for (const [engine, kernel] of Object.entries(engines)) {
          const client = createClient(kernel, fixture.files);
          // eslint-disable-next-line no-await-in-loop -- one cold client per engine, sequentially
          const glb = await exportGlb(client, fixture.mainFile);
          fingerprints[engine] = { bytes: glb.byteLength, sha256: createHash('sha256').update(glb).digest('hex') };
          client.terminate();
        }

        // Then timings, interleaved sample by sample. Warm cases reuse one
        // client per engine; cold cases build (and time) a fresh one per sample.
        const shared = cold
          ? undefined
          : {
              wasm: createClient(openrscadKernel, fixture.files),
              native: createClient(openrscadNativeKernel, fixture.files),
            };
        const timings: Record<string, number[]> = { wasm: [], native: [] };
        try {
          for (let sample = 0; sample < iterations + (cold ? 1 : warmups); sample += 1) {
            for (const engine of ['wasm', 'native'] as const) {
              const client = shared?.[engine] ?? createClient(engines[engine], fixture.files);
              const started = performance.now();
              // eslint-disable-next-line no-await-in-loop -- interleaved sampling is the point
              await exportGlb(client, fixture.mainFile);
              const elapsed = performance.now() - started;
              if (shared === undefined) {
                client.terminate();
              }
              if (sample >= (cold ? 1 : warmups)) {
                timings[engine]!.push(elapsed);
              }
            }
          }
        } finally {
          shared?.wasm.terminate();
          shared?.native.terminate();
        }

        const report = {
          name,
          cold,
          iterations,
          wasmMedianMs: Math.round(median(timings['wasm']!) * 1000) / 1000,
          nativeMedianMs: Math.round(median(timings['native']!) * 1000) / 1000,
          speedup: Math.round((median(timings['wasm']!) / median(timings['native']!)) * 1000) / 1000,
          fingerprints,
        };
        console.log(JSON.stringify(report, null, 2));

        // Gate 1 (always on): the two engines are one pipeline, so the artifact
        // must be identical. A deliberate change renames the case.
        expect(fingerprints['native']).toEqual(fingerprints['wasm']);

        // Gate 2 (always on): G4 — never slower than 0.95x, measured interleaved.
        expect(report.speedup).toBeGreaterThanOrEqual(0.95);

        // Gate 3 (pinned hosts only): absolute ceilings.
        if (gateAbsolute) {
          const expected = baseline[name];
          const ceiling = Number(process.env['MAX_MEDIAN_MS']);
          if (Number.isFinite(ceiling)) {
            expect(report.nativeMedianMs).toBeLessThanOrEqual(ceiling);
          }
          if (expected) {
            expect(report.nativeMedianMs).toBeLessThanOrEqual(expected.native * 1.1);
            expect(report.wasmMedianMs).toBeLessThanOrEqual(expected.wasm * 1.1);
          }
        }
      },
      120_000,
    );
  }
});
