import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assert, asyncProperty, sample, scheduler, schedulerFor } from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSeamSimulator } from '#seam/simulator.js';
import type { ToySeamOptions } from '#seam/toy-seam.fixture.js';
import { runToySeam, traceText } from '#seam/toy-seam.fixture.js';

const schedulerOf = (seed: number) => sample(scheduler(), { seed, numRuns: 1 })[0]!;
const traces = path.resolve(import.meta.dirname, '../../specs/ToySeam/traces');
const updating = process.env['FORMAL_UPDATE'] === '1';

/** The committed traces TLC validates in the Java tier (`specs/expected.json`), by scenario and seed. */
const committed: ReadonlyArray<{ readonly file: string; readonly seed: number; readonly options: ToySeamOptions }> = [
  { file: 'clean-1.ndjson', seed: 1, options: { faults: [['duplicate', 'server']] } },
  {
    file: 'clean-7.ndjson',
    seed: 7,
    options: {
      faults: [
        ['duplicate', 'server'],
        ['freeze', 'client'],
        ['thaw', 'client'],
      ],
    },
  },
  { file: 'no-dedupe-1.ndjson', seed: 1, options: { dedupe: false, faults: [['duplicate', 'server']] } },
];

describe('seam simulator', () => {
  it('should write identical traces for the same seed', async () => {
    const first = await runToySeam(schedulerOf(3), { faults: [['duplicate', 'server']] });
    const second = await runToySeam(schedulerOf(3), { faults: [['duplicate', 'server']] });

    expect(first.outcome).toBe('done');
    expect(traceText(second.trace)).toBe(traceText(first.trace));
  });

  it('should replay a failing schedule from its report', async () => {
    const seeded = schedulerOf(1);
    const failing = await runToySeam(seeded, { dedupe: false, faults: [['duplicate', 'server']] });
    const ordering = seeded.report().map((item) => item.taskId);
    const replayed = await runToySeam(schedulerFor(ordering), { dedupe: false, faults: [['duplicate', 'server']] });
    const effects = failing.trace
      .filter((line) => line.kind === 'serve' && line['effect'] === true)
      .map((line) => line['id']);

    expect(new Set(effects).size).toBeLessThan(effects.length);
    expect(traceText(replayed.trace)).toBe(traceText(failing.trace));
  });

  it('should stop with no-progress when nothing is pending and the run is not done', async () => {
    const run = await runToySeam(schedulerOf(1), { answer: false, retry: false });

    expect(run.outcome).toBe('no-progress');
    expect(run.trace.at(-1)?.kind).not.toBe('done');
  });

  // FM-A18: a scenario passes only when its run ends `done`, `done()` being its properties' quiescence predicates.
  it('should fail a scenario that stops with a command unanswered', async () => {
    const run = await runToySeam(schedulerOf(2), { answer: false, retry: false });

    expect(run.outcome).not.toBe('done');
  });

  it('should fail a scenario whose lease is never retired', async () => {
    const simulator = createSeamSimulator(schedulerOf(4), () => []);
    const holder = simulator.process('holder', { stop: () => undefined });
    const lease = { held: true };
    const heartbeat = (): void => {
      holder.clock.setTimeout(heartbeat, 1000);
    };
    heartbeat();

    expect(await simulator.run({ maxSteps: 50, done: () => !lease.held })).toBe('step-cap');
  });

  it('should hold a frozen process deliveries until thaw and drop a dead process deliveries silently', async () => {
    const frozen = await runToySeam(schedulerOf(7), {
      faults: [
        ['freeze', 'server'],
        ['thaw', 'server'],
      ],
    });
    const dead = await runToySeam(schedulerOf(5), { faults: [['processDeath', 'server']], maxSteps: 40 });

    // A frozen server serves late; a dead one never answers and tells nobody, so the client retries to the cap.
    expect(frozen.outcome).toBe('done');
    expect(dead.outcome).toBe('step-cap');
  });

  it('should apply every effect at most once under any schedule when the server dedupes', async () => {
    await assert(
      asyncProperty(scheduler(), async (random) => {
        const run = await runToySeam(random, {
          faults: [
            ['duplicate', 'server'],
            ['duplicate', 'server'],
          ],
        });
        const effects = run.trace
          .filter((line) => line.kind === 'serve' && line['effect'] === true)
          .map((line) => line['id']);

        expect(run.outcome).toBe('done');
        expect(new Set(effects).size).toBe(effects.length);
      }),
      { numRuns: 50 },
    );
  });

  for (const { file, seed, options } of committed) {
    it(`should match the committed trace ${file} for seed ${seed}`, async () => {
      const run = await runToySeam(schedulerOf(seed), options);
      const text = traceText(run.trace);
      const target = path.join(traces, file);
      if (updating) {
        writeFileSync(target, text);
      }

      expect(existsSync(target)).toBe(true);
      expect(text).toBe(readFileSync(target, 'utf8'));
    });
  }
});
