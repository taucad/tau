import type { VmFileSystem } from '@taucad/esbuild/vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describe as geoDescribe, expectGeo, geoSpecMatcherNames, it as geoIt, test } from '#index.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';
import type { GeometryDiagnostic } from '#mesh/types.js';
import { GeoSpecModelLoadError } from '#model/errors.js';
import { bindGeoSpecSubject } from '#model/subject.js';
import { createGeoSpecAssertionClient } from '#assertion-client/index.js';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';

import {
  clearCollectorGlobals,
  collectorGlobalKey,
  createCollector,
  GeoSpecAssertionError,
  getCollector,
  installCollector,
} from '#runner/collector.js';
import { runGeoSpecModule } from '#runner/index.js';

const failure: GeometryDiagnostic = { code: 'FIXTURE_FAIL', severity: 'error', message: 'nope' };

const encode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));

/** A compiled-engine double that answers every claim with one status and diagnostic list. */
const createNativeFixture = (status = 'passed', diagnostics: readonly GeometryDiagnostic[] = []) => {
  const claims: unknown[] = [];
  const engine: GeoSpecAssertionClientOptions['engine'] = {
    processRequest: (input) => input,
    evaluateClaim: (input) => {
      const envelope = JSON.parse(new TextDecoder().decode(input)) as {
        plan: { claims: Array<{ claimId: string }> };
      };
      const [claim] = envelope.plan.claims;
      claims.push(claim);
      return {
        canonicalClaim: encode(claim),
        canonicalPlan: encode(envelope.plan),
        canonicalResult: encode({ results: [{ claimId: claim?.claimId, status, diagnostics }] }),
      };
    },
  };
  const options: GeoSpecAssertionClientOptions = { engine, workUnitLimit: 1000 };
  const subject = bindGeoSpecSubject({
    engine,
    client: createGeoSpecAssertionClient(options),
    identity: { subjectHash: 'a'.repeat(64) },
    isLive: () => true,
  });
  return { claims, options, subject };
};

const createTestCollector = () => createCollector({ nativeAssertions: createNativeFixture().options });

/** The GeoSpec files a module run reads. */
class SpecFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(): Promise<void> {
    return undefined;
  }
}

describe('compiled report outcome accounting', () => {
  it.each([
    ['passed', 'passed'],
    ['failed', 'failed'],
    ['unsupported', 'unsupported'],
    ['refused', 'inconclusive'],
    ['cancelled', 'inconclusive'],
    ['invalid', 'failed'],
    ['engine-error', 'failed'],
  ])('should retain core %s as test %s without changing canonical bytes', async (status, expected) => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    let canonicalResult: Uint8Array<ArrayBuffer> | undefined;
    const engine: GeoSpecAssertionClientOptions['engine'] = {
      processRequest: (input) => input,
      evaluateClaim: (input) => {
        const envelope = JSON.parse(new TextDecoder().decode(input)) as {
          plan: { claims: Array<{ claimId: string }> };
        };
        canonicalResult = encode({ results: [{ claimId: envelope.plan.claims[0]?.claimId, status, diagnostics: [] }] });
        return {
          canonicalClaim: encode(envelope.plan.claims[0]),
          canonicalPlan: encode(envelope.plan),
          canonicalResult,
        };
      },
    };
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 1000 });
    const admitted = bindGeoSpecSubject({
      engine,
      client,
      identity: { subjectHash: 'a'.repeat(64) },
      load: {
        loadId: 'part-load',
        status: 'complete',
        format: 'gsm1',
        parameters: {},
        ingestOptions: {},
        artifacts: [{ name: 'part.gsm1', byteLength: 1, sha256: 'a'.repeat(64) }],
      },
      isLive: () => true,
    });
    const collector = createCollector({ nativeAssertions: { engine, workUnitLimit: 1000 } });
    collector.it('claim', () => {
      try {
        collector.expectGeo(admitted).not.toBeWatertight();
      } catch {
        /* Caught non-pass is still recorded. */
      }
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe(expected);
    expect(collector.tests[0]?.assertions[0]?.report?.status).toBe(status);
    expect(collector.tests[0]?.assertions[0]?.report?.polarity).toBe('negative');
    expect(collector.tests[0]?.assertions[0]?.report?.canonicalResult).toBe(canonicalResult);
    expect(collector.tests[0]?.assertions[0]?.loadId).toBe('part-load');
  });
});

afterEach(() => {
  vi.useRealTimers();
  clearCollectorGlobals();
});

describe('collector globals', () => {
  it('should install, read, and clear the collector global', () => {
    const collector = createTestCollector();
    installCollector(collector);

    expect(getCollector()).toBe(collector);
    expect((globalThis as Record<string, unknown>)[collectorGlobalKey]).toBe(collector);

    clearCollectorGlobals();
    expect(() => getCollector()).toThrow('GeoSpec collector is not active');
  });

  it('should reject a non-collector global', () => {
    (globalThis as Record<string, unknown>)[collectorGlobalKey] = { describe: () => undefined };

    expect(() => getCollector()).toThrow('GeoSpec collector is not active');
  });
});

describe('suite and test tree', () => {
  it.each([
    { name: 'GeoSpecModelLoadError', message: 'empty', diagnostics: [] },
    { name: 'GeoSpecModelLoadError', message: 'malformed', diagnostics: [{ code: 'BAD' }] },
    {
      name: 'GeoSpecModelLoadError',
      message: 'invalid spatial',
      diagnostics: [{ code: 'BAD', severity: 'error', message: 'bad', spatial: { center: [Number.NaN, 0, 0] } }],
    },
    {
      name: 'GeoSpecModelLoadError',
      message: 'invalid suggestion',
      diagnostics: [{ code: 'BAD', severity: 'error', message: 'bad', suggestion: 4 }],
    },
    new Error('ordinary failure'),
    'string failure',
  ])('keeps invalid or ordinary thrown values as serializable failures %#', async (error) => {
    const collector = createTestCollector();
    collector.it('failure', () => {
      // oxlint-disable-next-line typescript/only-throw-error -- Deliberately test arbitrary thrown values at the runner boundary.
      throw error;
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics).toHaveLength(1);
    expect(collector.tests[0]?.diagnostics[0]?.code).toBe('TEST_FAILED');
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- Verify JSON transport, not cloning.
    expect(JSON.parse(JSON.stringify(collector.tests[0]?.diagnostics))).toStrictEqual(collector.tests[0]?.diagnostics);
  });

  it('unwraps a transported model error and normalizes opaque details', async () => {
    const collector = createTestCollector();
    collector.it('failure', () => {
      // oxlint-disable-next-line typescript/only-throw-error -- Worker errors can arrive as plain structured data.
      throw {
        name: 'GeoSpecModelLoadError',
        diagnostics: [
          { code: 'FIRST', severity: 'warning', message: 'warning', details: new Error('native failure') },
          { code: 'SECOND', severity: 'error', message: 'error', details: { callback: () => undefined } },
        ],
      };
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.diagnostics).toEqual([
      { code: 'FIRST', severity: 'warning', message: 'warning', details: { name: 'Error', message: 'native failure' } },
      { code: 'SECOND', severity: 'error', message: 'error', details: '{}' },
    ]);
  });
  it('preserves every diagnostic from a real failing model loader', async () => {
    const diagnostics: GeometryDiagnostic[] = [
      {
        code: 'EXPORT_FAILED',
        severity: 'error',
        message: 'export failed',
        suggestion: 'Repair the model',
        spatial: { center: [1, 2, 3] },
        details: { file: 'gear.ts' },
      },
      { code: 'KERNEL_FAILED', severity: 'error', message: 'kernel failed' },
    ];
    const collector = createTestCollector();
    collector.it('load', async () => {
      throw new GeoSpecModelLoadError(diagnostics);
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.diagnostics).toStrictEqual(diagnostics);
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- Verify JSON transport, not cloning.
    expect(JSON.parse(JSON.stringify(collector.tests[0]?.diagnostics))).toStrictEqual(diagnostics);
  });
  it('should record nested suites, skips, and passing tests', async () => {
    const collector = createTestCollector();
    collector.describe('outer', () => {
      collector.it('passes', () => undefined);
      collector.itSkip('skipped');
    });
    collector.describeSkip('ignored suite', () => {
      throw new Error('never runs');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => [entry.suite, entry.name, entry.status])).toStrictEqual([
      [['outer'], 'passes', 'passed'],
      [['outer'], 'skipped', 'skipped'],
      [[], 'ignored suite', 'skipped'],
    ]);
  });

  it('should settle asynchronous suite definitions before running tests', async () => {
    const collector = createTestCollector();
    collector.describe('async suite', async () => {
      await Promise.resolve();
      collector.it('registered late', () => undefined);
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.status)).toStrictEqual(['passed']);
  });

  it('should record a failed asynchronous suite definition as a failed test', async () => {
    const collector = createTestCollector();
    collector.describe('broken suite', async () => {
      await Promise.resolve();
      throw new Error('definition exploded');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics[0]?.message).toBe('definition exploded');
  });

  it('should run waitForCompletion only once', async () => {
    const collector = createTestCollector();
    collector.it('once', () => undefined);
    await collector.waitForCompletion(1000);
    const first = collector.tests[0]?.durationMs;
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.durationMs).toBe(first);
  });

  it('should not execute tests the name pattern excludes', async () => {
    const executed: string[] = [];
    const collector = createTestCollector();
    collector.it('kept', () => {
      executed.push('kept');
    });
    collector.it('dropped', () => {
      executed.push('dropped');
    });
    await collector.waitForCompletion(1000, /kept/u);

    expect(executed).toStrictEqual(['kept']);
  });

  it('should fail a test that exceeds the timeout', async () => {
    const collector = createTestCollector();
    collector.it('slow', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    await collector.waitForCompletion(1);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics).toHaveLength(1);
    expect(collector.tests[0]?.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_TEST_TIMEOUT',
      severity: 'error',
      details: { testTimeout: 1 },
    });
    expect(collector.tests[0]?.diagnostics[0]?.suggestion).toContain('Keep the assertion');
  });

  it('should report each selected test to the host as it starts and settles', async () => {
    const events: Array<{ type: string; name: string; status: string }> = [];
    const collector = createCollector({
      nativeAssertions: createNativeFixture().options,
      onTestEvent: ({ type, test }) => {
        events.push({ type, name: test.name, status: test.status });
      },
    });
    collector.it('kept', () => undefined);
    collector.it('failing', () => {
      throw new Error('boom');
    });
    collector.it('dropped', () => undefined);
    await collector.waitForCompletion(1000, /kept|failing/u);

    expect(events).toStrictEqual([
      { type: 'test-start', name: 'kept', status: 'passed' },
      { type: 'test-complete', name: 'kept', status: 'passed' },
      { type: 'test-start', name: 'failing', status: 'passed' },
      { type: 'test-complete', name: 'failing', status: 'failed' },
    ]);
  });

  it('should keep a test verdict when its progress observer throws', async () => {
    const collector = createCollector({
      nativeAssertions: createNativeFixture().options,
      onTestEvent: () => {
        throw new Error('observer failed');
      },
    });
    collector.it('kept', () => undefined);
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('passed');
  });

  it('should not impose a default timeout on cold model acquisition', async () => {
    vi.useFakeTimers();
    const collector = createTestCollector();
    collector.it('cold assembly', async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 51_000);
      });
    });

    const completion = collector.waitForCompletion();
    await vi.advanceTimersByTimeAsync(51_000);
    await completion;

    expect(collector.tests[0]?.status).toBe('passed');
  });
});

describe('refused admissions', () => {
  const capacity = {
    code: 'GEOSPEC_RESOURCE_LIMIT',
    limitClass: 'admission',
    unit: 'bytes',
    limit: 67_108_864,
    required: 72_000_184,
  };
  const engineRefusal = Object.assign(
    new Error(
      'Primary geometry is 68.7 MiB (72000184 bytes); the configured binary subject limit is 64 MiB (67108864 bytes).',
    ),
    { name: 'ProtocolError', code: 'limit-exceeded', capacity },
  );
  const hostRefusal = Object.assign(new RangeError('GeoSpec retained admission input exceeds its byte limit.'), {
    code: 'limit-exceeded',
    capacity: { ...capacity, name: 'maxTotalBinaryBytes', limit: 134_217_728, required: 144_000_184, source: 'host' },
  });

  it.each([
    {
      by: 'the engine',
      error: engineRefusal,
      diagnostic: {
        code: 'GEOSPEC_RESOURCE_LIMIT',
        severity: 'error',
        message: engineRefusal.message,
        details: { limitClass: 'admission', unit: 'bytes', limit: 67_108_864, required: 72_000_184 },
      },
    },
    {
      by: 'the host',
      error: hostRefusal,
      diagnostic: {
        code: 'GEOSPEC_RESOURCE_LIMIT',
        severity: 'error',
        message: hostRefusal.message,
        details: {
          limitClass: 'admission',
          unit: 'bytes',
          name: 'maxTotalBinaryBytes',
          limit: 134_217_728,
          required: 144_000_184,
          source: 'host',
        },
      },
    },
    {
      by: 'a transport without its numbers',
      error: { code: 'limit-exceeded' },
      diagnostic: { code: 'GEOSPEC_RESOURCE_LIMIT', severity: 'error', message: 'GeoSpec refused to admit this load.' },
    },
  ])('should record a load refused by $by as an inconclusive test with its capacity', async ({ error, diagnostic }) => {
    const collector = createTestCollector();
    collector.it('knot', async () => {
      await Promise.resolve();
      // oxlint-disable-next-line typescript/only-throw-error -- Refusals can arrive as plain structured data.
      throw error;
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe('inconclusive');
    expect(collector.tests[0]?.diagnostics).toStrictEqual([diagnostic]);
  });

  it.each([
    { thrown: 'a refused load', error: engineRefusal, status: 'inconclusive', code: 'GEOSPEC_RESOURCE_LIMIT' },
    { thrown: 'any other error', error: new Error('definition exploded'), status: 'failed', code: 'TEST_FAILED' },
  ])('should record $thrown in a describe body as a $status suite', async ({ error, status, code }) => {
    const collector = createTestCollector();
    collector.describe('async knots', async () => {
      await Promise.resolve();
      throw error;
    });
    collector.describe('knots', () => {
      throw error;
    });
    await collector.waitForCompletion();
    expect(collector.tests.map((entry) => [entry.name, entry.status, entry.diagnostics[0]?.code])).toStrictEqual([
      ['knots', status, code],
      ['async knots', status, code],
    ]);
  });

  it.each([
    {
      refusal: 'an engine ProtocolError',
      error: Object.assign(new Error('GeoSpec engine handles are exhausted.'), {
        name: 'ProtocolError',
        code: 'limit-exceeded',
      }),
      name: 'ProtocolError',
      message: 'GeoSpec engine handles are exhausted.',
    },
    {
      refusal: 'a bare structured refusal',
      error: { code: 'limit-exceeded' },
      name: 'Error',
      message: 'GeoSpec ran out of room for this claim.',
    },
  ])('should fail a claim the engine refuses while evaluating it ($refusal), never as a limit', async (refused) => {
    const engine: GeoSpecAssertionClientOptions['engine'] = {
      processRequest: (input) => input,
      evaluateClaim: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- Refusals can arrive as plain structured data.
        throw refused.error;
      },
    };
    const options: GeoSpecAssertionClientOptions = { engine, workUnitLimit: 1000 };
    const subject = bindGeoSpecSubject({
      engine,
      client: createGeoSpecAssertionClient(options),
      identity: { subjectHash: 'a'.repeat(64) },
      isLive: () => true,
    });
    const collector = createCollector({ nativeAssertions: options });
    collector.it('handles', () => {
      collector.expectGeo(subject).toBeWatertight();
    });
    await collector.waitForCompletion();
    const { name, message } = refused;
    const diagnostic = { code: 'TEST_FAILED', severity: 'error', message, details: { name, message } };
    const [test] = collector.tests;
    expect(test).toMatchObject({
      status: 'failed',
      assertions: [{ passed: false, diagnostics: [diagnostic] }],
      diagnostics: [diagnostic],
    });
    // The test repeats its claim's own diagnostic, so a projection reads one infrastructure failure.
    expect(test?.diagnostics[0]).toBe(test?.assertions[0]?.diagnostics?.[0]);
  });

  it('should leave passed claims undecided as a whole when a later load is refused', async () => {
    const fixture = createNativeFixture();
    const collector = createCollector({ nativeAssertions: fixture.options });
    collector.it('passed then refused', () => {
      collector.expectGeo(fixture.subject).toBeWatertight();
      throw hostRefusal;
    });
    await collector.waitForCompletion();
    expect(collector.tests[0]?.status).toBe('inconclusive');
  });

  it('should keep a test failed when a claim was decided false or could not run beside a refused load', async () => {
    const fixture = createNativeFixture('failed', [failure]);
    const collector = createCollector({ nativeAssertions: fixture.options });
    collector.it('decided then refused', () => {
      try {
        collector.expectGeo(fixture.subject).toBeWatertight();
      } catch {
        /* The decided claim is still recorded. */
      }
      throw engineRefusal;
    });
    collector.it('unevaluated then refused', () => {
      try {
        collector.expectGeo('subject').toHaveVolume({ value: 1 });
      } catch {
        /* The unevaluated claim is still recorded. */
      }
      throw engineRefusal;
    });
    await collector.waitForCompletion();
    expect(collector.tests.map((entry) => entry.status)).toStrictEqual(['failed', 'failed']);
  });

  it('should count a refused load as inconclusive, never failed, in the run accounting', async () => {
    const filesystem = new SpecFileSystem();
    filesystem.setText(
      'knot.geospec.ts',
      `import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('is watertight', async () => { await loadModel({ file: 'knot.glb' }); });`,
    );
    const result = await runGeoSpecModule({
      filesystem,
      entryPath: 'knot.geospec.ts',
      nativeAssertions: createNativeFixture().options,
      nativeModelLoader: async () => {
        throw engineRefusal;
      },
    });
    expect(result).toMatchObject({
      tests: [
        { status: 'inconclusive', diagnostics: [{ code: 'GEOSPEC_RESOURCE_LIMIT', details: { limit: 67_108_864 } }] },
      ],
      accounting: { completed: 1, passed: 0, failed: 0, inconclusive: 1 },
      lineage: { loads: [{ status: 'failed', error: engineRefusal.message }] },
    });
  });
});

describe('expectGeo proxy', () => {
  it('should expose every registry matcher name in registry order', () => {
    const matcher = createTestCollector().expectGeo(undefined);

    expect(Object.keys(matcher)).toStrictEqual([...Object.keys(geoSpecMatcherDescriptors), 'not']);
    expect(geoSpecMatcherNames).toStrictEqual(Object.keys(geoSpecMatcherDescriptors));
  });

  it('should refuse assertions outside it()', () => {
    expect(() => createTestCollector().expectGeo(undefined).toBeWatertight()).toThrow(
      'expectGeo() must be called inside it().',
    );
  });

  it('should record a passing assertion with its normalized expectation and canonical claim', async () => {
    const fixture = createNativeFixture();
    const collector = createCollector({ nativeAssertions: fixture.options });
    collector.it('bounds', () => {
      collector.expectGeo(fixture.subject).toHaveBoundingBox([0, 0, 0], [1, 1, 1]);
    });
    await collector.waitForCompletion(1000);

    const [assertion] = collector.tests[0]?.assertions ?? [];
    expect(collector.tests[0]?.status).toBe('passed');
    expect(assertion?.passed).toBe(true);
    expect(assertion?.subject).toStrictEqual({ subjectHash: 'a'.repeat(64) });
    expect(assertion?.expected).toStrictEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    expect(assertion?.durationMs).toBeGreaterThanOrEqual(0);
    expect(fixture.claims[0]).toMatchObject({
      capability: 'toHaveBoundingBox',
      polarity: 'positive',
      payload: {
        kind: 'boundingBox',
        arguments: [
          [0, 0, 0],
          [1, 1, 1],
        ],
      },
    });
  });

  it('should throw GeoSpecAssertionError inside it() when a native claim fails', async () => {
    const fixture = createNativeFixture('failed', [failure]);
    const collector = createCollector({ nativeAssertions: fixture.options });
    let caught: unknown;
    collector.it('watertight', () => {
      try {
        collector.expectGeo(fixture.subject).toBeWatertight();
      } catch (error) {
        caught = error;
        throw error;
      }
    });
    await collector.waitForCompletion(1000);

    expect(caught).toBeInstanceOf(GeoSpecAssertionError);
    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.diagnostics).toStrictEqual([failure]);
    expect(collector.tests[0]?.assertions[0]?.diagnostics).toStrictEqual([failure]);
  });

  it('should fail an assertion on a subject the host never admitted', async () => {
    const collector = createTestCollector();
    collector.it('volume', () => {
      collector.expectGeo('subject').toHaveVolume({ value: 1 });
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests[0]?.status).toBe('failed');
    expect(collector.tests[0]?.assertions[0]?.passed).toBe(false);
    expect(collector.tests[0]?.diagnostics[0]).toMatchObject({ code: 'TEST_FAILED' });
    expect(collector.tests[0]?.diagnostics[0]?.message).toContain('not admitted');
  });

  it('should translate known subject-API misuse into a guided diagnostic', async () => {
    const collector = createTestCollector();
    collector.it('misuse', () => {
      throw new Error('model.volume is not a function');
    });
    collector.it('bounds misuse', () => {
      throw new Error("Cannot read properties of undefined (reading 'bounds')");
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.diagnostics[0]?.code)).toStrictEqual([
      'GEOSPEC_SUBJECT_API_MISUSE',
      'GEOSPEC_SUBJECT_API_MISUSE',
    ]);
  });
});

describe('authoring helpers', () => {
  it('should reject forged root subjects independently of an installed reference collector', () => {
    installCollector(createTestCollector());

    // @ts-expect-error -- The public trust boundary refuses hash bags.
    expect(() => expectGeo({ contentHash: 'sha256:test' })).toThrow('not admitted');
  });

  it('should retain suite registration while rejecting unadmitted root subjects', async () => {
    const passthrough = (input: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => input;
    const collector = createCollector({
      nativeAssertions: {
        engine: {
          evaluateClaim: (input) => ({ canonicalClaim: input, canonicalPlan: input, canonicalResult: input }),
          processRequest: passthrough,
        },
      },
    });
    installCollector(collector);

    geoDescribe('native helpers', () => {
      geoIt('registers', () => undefined);
    });
    // @ts-expect-error -- A string is not an admitted subject.
    expect(() => expectGeo('legacy subject')).toThrow('not admitted');
    expect(collector.expectGeo({ subjectHash: 'a'.repeat(64) })).toHaveProperty('toBeWatertight');

    await collector.waitForCompletion();
    expect(collector.tests.map(({ name, status }) => ({ name, status }))).toStrictEqual([
      { name: 'registers', status: 'passed' },
    ]);
  });

  it('should delegate the module-scoped helpers to the installed collector', async () => {
    const collector = createTestCollector();
    installCollector(collector);

    geoDescribe('helpers', () => {
      geoIt('runs', () => {
        expect(collector.expectGeo('subject')).toHaveProperty('toBeWatertight');
      });
      test('aliased', () => undefined);
      geoIt.skip('skipped test');
      geoDescribe.skip('skipped suite');
    });
    await collector.waitForCompletion(1000);

    expect(collector.tests.map((entry) => entry.name)).toStrictEqual([
      'runs',
      'aliased',
      'skipped test',
      'skipped suite',
    ]);
  });
});
