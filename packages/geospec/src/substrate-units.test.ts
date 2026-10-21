import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { loadModel } from '#model/load-model.js';
import { createCollector } from '#runner/collector.js';
import { compileGeoSpecTestNamePattern, matchesGeoSpecTestName } from '#runner/filter.js';
import { countRunnerTests } from '#runner/worker/serial-runner.js';
import type { GeoSpecTestCase } from '#runner/types.js';

describe('GeoSpecModelLoadError', () => {
  it('should refuse a direct loadModel call outside a GeoSpec runner', async () => {
    const pending = loadModel({ source: new Uint8Array() });

    await expect(pending).rejects.toBeInstanceOf(GeoSpecModelLoadError);
    await expect(pending).rejects.toMatchObject({
      diagnostics: [{ code: 'GEOSPEC_MODEL_LOADER_UNAVAILABLE', severity: 'error' }],
    });
  });

  it('should snapshot structured diagnostics', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'first' },
      { code: 'B', severity: 'error', message: 'second' },
    ]);

    expect(error.message).toBe('first\nsecond');
    expect(error.diagnostics).toHaveLength(2);
  });

  it('should default the message when no diagnostics are supplied', () => {
    expect(new GeoSpecModelLoadError([]).message).toBe('GeoSpec model load failed.');
  });

  it('should stringify details that cannot be structurally cloned', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: { fn: () => undefined } },
    ]);

    expect(error.diagnostics[0]?.details).toBe('{}');
  });

  it('should keep string details verbatim', () => {
    const error = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: 'reason' as unknown as { fn: () => void } },
    ]);
    const cloned = new GeoSpecModelLoadError([
      { code: 'A', severity: 'error', message: 'unclonable', details: { fn: () => undefined, self: undefined } },
    ]);

    expect(error.diagnostics[0]?.details).toBe('reason');
    expect(cloned.diagnostics[0]?.details).toBe('{}');
  });

  it('should tolerate a diagnostic with no details at all', () => {
    const bigint = { value: 1n };
    const error = new GeoSpecModelLoadError([{ code: 'A', severity: 'error', message: 'x', details: bigint }]);

    expect(error.diagnostics[0]?.details).toStrictEqual(bigint);
  });
});

describe('test-name filter', () => {
  const test = (suite: string[], name: string): GeoSpecTestCase => ({
    suite,
    name,
    assertions: [],
    status: 'passed',
    diagnostics: [],
  });

  it('should treat blank patterns as no filter', () => {
    expect(compileGeoSpecTestNamePattern(undefined)).toStrictEqual({ success: true });
    expect(compileGeoSpecTestNamePattern('   ')).toStrictEqual({ success: true });
  });

  it('should pass a precompiled expression through', () => {
    const pattern = /abc/u;

    expect(compileGeoSpecTestNamePattern(pattern)).toStrictEqual({ success: true, pattern });
  });

  it('should compile a string source', () => {
    const compiled = compileGeoSpecTestNamePattern('bore');

    expect(compiled.success && compiled.pattern?.source).toBe('bore');
  });

  it('should report an invalid source', () => {
    const compiled = compileGeoSpecTestNamePattern('(');

    expect(compiled.success).toBe(false);
    expect(!compiled.success && compiled.issue.code).toBe('INVALID_GEOSPEC_TEST_NAME_PATTERN');
  });

  it('should match against the full suite path', () => {
    expect(matchesGeoSpecTestName(test(['outer'], 'inner'), /outer > inner/u)).toBe(true);
    expect(matchesGeoSpecTestName(test(['outer'], 'inner'), /nope/u)).toBe(false);
    expect(matchesGeoSpecTestName(test([], 'inner'), undefined)).toBe(true);
  });
});

describe('runner aggregates', () => {
  it('should count pass and fail totals, ignoring skips', () => {
    expect(
      countRunnerTests([
        { suite: [], name: 'a', assertions: [], status: 'passed', diagnostics: [] },
        { suite: [], name: 'b', assertions: [], status: 'failed', diagnostics: [] },
        { suite: [], name: 'c', assertions: [], status: 'skipped', diagnostics: [] },
      ]),
    ).toStrictEqual({ passed: 1, failed: 1 });
  });
});

describe('collector suite errors', () => {
  it('should record a synchronous suite-definition failure', async () => {
    const collector = createCollector({ nativeAssertions: mock<GeoSpecAssertionClientOptions>() });
    collector.describe('broken', () => {
      throw new Error('sync definition exploded');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('sync definition exploded');
  });

  it('should stringify a non-Error thrown from a test body', async () => {
    const collector = createCollector({ nativeAssertions: mock<GeoSpecAssertionClientOptions>() });
    collector.it('throws a string', () => {
      // oxlint-disable-next-line typescript/only-throw-error -- the collector must survive non-Error throws.
      throw 'plain string';
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('plain string');
  });
});
