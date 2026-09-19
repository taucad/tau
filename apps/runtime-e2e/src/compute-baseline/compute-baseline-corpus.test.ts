/**
 * Q5/D19: the corpus is pinned with provenance and rights, and the threshold
 * table cannot be quietly refitted.
 *
 * A model marked `workspace-apache-2.0` must actually resolve inside this
 * repository, or the fixture claim is false. A model marked `host-local` must
 * NOT resolve from the repository: it belongs to the operator's private model
 * workspace and stays an opt-in leg, so public CI can never distribute it.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { arms, corpus, intervals, thresholds } from '#compute-baseline/qualification.js';
import { models } from '#compute-baseline/harness/models.mts';

const repoRoot = resolve(import.meta.dirname, '../../../..');

describe('compute-baseline corpus', () => {
  it('names only models the harness can build', () => {
    for (const entry of corpus) {
      expect(models[entry.model], `corpus entry ${entry.model} has no harness model`).toBeDefined();
      expect(models[entry.model]!.kernel).toBe(entry.kernel);
    }
  });

  it('resolves every rights-cleared model inside this repository', () => {
    for (const entry of corpus.filter((candidate) => candidate.rights === 'workspace-apache-2.0')) {
      // `files()` reads the tracked sources; an unresolvable model throws here.
      const files = models[entry.model]!.files();
      expect(Object.keys(files).length, `${entry.model} produced no files`).toBeGreaterThan(0);
      expect(files[models[entry.model]!.mainFile], `${entry.model} is missing its entry`).toBeDefined();
    }
  });

  it('keeps rights-uncleared models out of the repository and behind an opt-in', () => {
    for (const entry of corpus.filter((candidate) => candidate.rights === 'host-local')) {
      // No model entry may exist under the distributed examples: these models
      // carry no licence. (An orphan `.tau/cache` tree of the same name is not
      // a model -- it holds no sources and is untracked.)
      expect(
        existsSync(join(repoRoot, 'libs/tau-examples/src/kernels/replicad', entry.model, 'main.ts')),
        `${entry.model} must not be a distributed fixture: it carries no licence`,
      ).toBe(false);
      // Absent the opt-in, the harness resolves them under an empty root and
      // they are simply unavailable rather than silently substituted.
      if (!process.env['TAU_COMPUTE_BASELINE_WORKSPACE']) {
        expect(() => models[entry.model]!.files()).toThrow();
      }
    }
  });

  it('pins the Apache-2.0 rights source it claims', () => {
    const licence = join(repoRoot, 'libs/tau-examples/LICENSE');
    expect(existsSync(licence)).toBe(true);
    expect(readFileSync(licence, 'utf8')).toContain('Apache License');
    expect(JSON.parse(readFileSync(join(repoRoot, 'libs/tau-examples/package.json'), 'utf8')).license).toBe(
      'Apache-2.0',
    );
  });

  it('pins the fault-injection fixture by content hash', () => {
    // The oracle expectation in compute-baseline-oracle.test.ts is analytic for
    // exactly this source; a silent edit must break here, not there.
    const source = models['parity-box']!.files()['main.ts']!;
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '5b2c932ee042e43d849dda675b0c805ddb4371ec60eb19b739f290458f9d2807',
    );
  });
});

describe('compute-baseline thresholds', () => {
  it('records a measurement source for every threshold', () => {
    for (const threshold of thresholds) {
      expect(threshold.source.length, `${threshold.id} has no source`).toBeGreaterThan(20);
    }
  });

  it('marks unmeasured thresholds provisional rather than passing', () => {
    // D19: thresholds are frozen from the baseline before any optimised run.
    // A row without an admitted measurement on this host must say so.
    const pinned = thresholds.filter((threshold) => threshold.status === 'pinned').map((threshold) => threshold.id);
    expect(pinned).toEqual(['T1', 'T7', 'T12', 'G-I1', 'G-F9', 'G-B10']);
  });

  it('keeps G-B10 split: the load-invariant share is pinned, the absolute stage cost is not', () => {
    // An absolute millisecond figure moved up to 65% with host load, so only the
    // candidate-internal ratio and the enumeration proof survive as a pin.
    const share = thresholds.find((threshold) => threshold.id === 'G-B10')!;
    expect(share.status).toBe('pinned');
    expect(share.value).not.toMatch(/ms/);
    const absolute = thresholds.find((threshold) => threshold.id === 'G-B10-abs')!;
    expect(absolute.status).toBe('provisional');
    expect(absolute.value).toContain('1065.79 ms');
  });

  it('marks the arms whose runner mapping cannot produce their proof', () => {
    // `run-arm.mts` accepts no budget and coordinates no concurrent starts, so
    // these two rows must not read as "the arm exists".
    expect(arms.filter((arm) => arm.runnable === false).map((arm) => arm.id)).toEqual([
      'simultaneously-cold',
      'pressure-failure',
    ]);
  });

  it('carries the two accepted W10 exceptions as measured facts', () => {
    const exceptions = thresholds.filter((threshold) => threshold.value.includes('ACCEPTED EXCEPTION'));
    expect(exceptions.map((threshold) => threshold.id)).toEqual(['G-I1', 'G-F9']);
    for (const exception of exceptions) {
      expect(exception.status).toBe('pinned');
    }
  });

  it('maps every interval to a span or counter the harness records', () => {
    expect(intervals.length).toBeGreaterThanOrEqual(20);
    expect(new Set(intervals.map((measuredInterval) => measuredInterval.id)).size).toBe(intervals.length);
    for (const measuredInterval of intervals) {
      expect(measuredInterval.source.key).not.toBe('');
    }
  });
});
