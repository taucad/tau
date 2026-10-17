import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import {
  createGeoSpecAssertionClient,
  GeoSpecAssertionError,
  geoSpecMaximumWorkUnitLimit,
} from '#assertion-client/index.js';
import type { GeoSpecNativeClaimEvaluation, GeoSpecNativeEngine } from '#assertion-client/index.js';
import { bindGeoSpecSubject } from '#model/subject.js';
import type { GeoSpecModelLoadEvidence } from '#model/native-model-loader.js';
import { expectGeoSubject } from '#model/subject-assertions.js';
import { createCollector } from '#runner/collector.js';

const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(value)) as Record<string, unknown>;
const hash = 'a'.repeat(64);

/** Records each submitted budget and answers with a configurable result row. */
class BudgetEngine implements GeoSpecNativeEngine {
  public readonly budgets: number[] = [];
  public row: Record<string, JSONValue> = { status: 'passed', diagnostics: [] };
  public configurationProfile = 'geospec-entry-config-v1';

  public evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation {
    const plan = decode(request)['plan'] as {
      claims: Array<{ claimId: string; workUnitBudget: number }>;
    };
    const [claim] = plan.claims;
    this.budgets.push(claim!.workUnitBudget);
    return {
      canonicalClaim: encode({ claimId: claim!.claimId }),
      canonicalPlan: encode({ plan: 'canonical' }),
      canonicalResult: encode({
        results: [{ claimId: claim!.claimId, ...this.row }],
      }),
    };
  }

  public processRequest(): Uint8Array<ArrayBuffer> {
    return encode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        configuration: {
          configurationProfile: this.configurationProfile,
          defaultWorkUnitBudget: 8_000_000,
        },
        protocolVersion: 3,
        registryVersion: 5,
      },
    });
  }
}

const loadEvidence = (workUnitLimit?: number): GeoSpecModelLoadEvidence => ({
  loadId: 'load-1',
  status: 'complete',
  format: 'glb',
  parameters: {},
  ingestOptions: {},
  artifacts: [],
  ...(workUnitLimit === undefined ? {} : { workUnitLimit }),
});

describe('authored work-unit budgets', () => {
  it('should apply the expectGeo budget, then the loadModel budget, then the client default', () => {
    const engine = new BudgetEngine();
    const client = createGeoSpecAssertionClient({ engine });
    const subject = bindGeoSpecSubject({
      client,
      engine,
      identity: { subjectHash: hash },
      isLive: () => true,
      load: loadEvidence(20_000_000),
    });
    client.expectGeo(subject).toBeWatertight();
    client.expectGeo(subject, { workUnitLimit: 40_000_000 }).not.toBeWatertight();
    client.expectGeo({ subjectHash: hash }).toBeWatertight();
    client.expectGeo({ subjectHash: hash }, { workUnitLimit: geoSpecMaximumWorkUnitLimit }).toBeWatertight();
    expect(engine.budgets).toEqual([20_000_000, 40_000_000, 8_000_000, 512_000_000]);
  });

  it('should refuse an unbounded expectGeo budget before any claim', () => {
    const engine = new BudgetEngine();
    const client = createGeoSpecAssertionClient({ engine });
    for (const workUnitLimit of [0, -1, 2.5, geoSpecMaximumWorkUnitLimit + 1]) {
      expect(() => client.expectGeo({ subjectHash: hash }, { workUnitLimit })).toThrow(
        `GeoSpec expectGeo workUnitLimit must be a positive integer no greater than this host's maximum of 512000000 (the host can raise it with maximumWorkUnitLimit); received ${workUnitLimit}.`,
      );
    }
    expect(() => client.expectGeo({ subjectHash: hash }, { workUnitLimit: '10' as unknown as number })).toThrow(
      "GeoSpec expectGeo workUnitLimit must be a positive integer no greater than this host's maximum of 512000000 (the host can raise it with maximumWorkUnitLimit); received string.",
    );
    expect(engine.budgets).toEqual([]);
  });

  it('should accept a host configuration profile and refuse an unknown profile', () => {
    const engine = new BudgetEngine();
    engine.configurationProfile = 'geospec-host-config-v1-0123456789abcdef';
    createGeoSpecAssertionClient({ engine }).expectGeo({ subjectHash: hash }).toBeWatertight();
    expect(engine.budgets).toEqual([8_000_000]);

    const unknown = new BudgetEngine();
    unknown.configurationProfile = 'geospec-other-config-v1';
    expect(() =>
      createGeoSpecAssertionClient({ engine: unknown }).expectGeo({ subjectHash: hash }).toBeWatertight(),
    ).toThrow('GeoSpec engine returned an unsupported configuration profile.');
    expect(unknown.budgets).toEqual([]);
  });

  it('should let the host raise the authored maximum and refuse a malformed host maximum', () => {
    const engine = new BudgetEngine();
    const client = createGeoSpecAssertionClient({ engine, maximumWorkUnitLimit: 4_000_000_000 });
    client.expectGeo({ subjectHash: hash }, { workUnitLimit: 3_000_000_000 }).toBeWatertight();
    expect(engine.budgets).toEqual([3_000_000_000]);
    expect(() => client.expectGeo({ subjectHash: hash }, { workUnitLimit: 4_000_000_001 })).toThrow(
      "no greater than this host's maximum of 4000000000",
    );
    for (const maximumWorkUnitLimit of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createGeoSpecAssertionClient({ engine, maximumWorkUnitLimit }).expectGeo({ subjectHash: hash }),
      ).toThrow('GeoSpec maximumWorkUnitLimit must be a positive safe integer');
    }
  });

  it('should apply the same precedence to standalone subject assertions', () => {
    const engine = new BudgetEngine();
    const client = createGeoSpecAssertionClient({ engine });
    const bind = (workUnitLimit?: number) =>
      bindGeoSpecSubject({
        client,
        engine,
        identity: { subjectHash: hash },
        isLive: () => true,
        load: loadEvidence(workUnitLimit),
      });
    const budgeted = bind(12_000_000);
    expectGeoSubject(budgeted).toBeWatertight();
    expectGeoSubject(budgeted, { workUnitLimit: 36_000_000 }).toBeWatertight();
    expectGeoSubject(bind()).not.toBeWatertight();
    expect(engine.budgets).toEqual([12_000_000, 36_000_000, 8_000_000]);
  });

  it.each([
    [
      'generic budget refusal',
      {
        matcher: 'toHaveConnectedComponents',
        budget: 100,
        unitsUsed: 101,
        unit: 'work-units',
      },
      { limit: 100, used: 101 },
    ],
    ['bounding-box refusal', { requiredWorkUnits: 7, workUnitBudget: 5 }, { limit: 5, used: 7 }],
    ['backend refusal without numbers', undefined, { limit: 300 }],
  ] as const)('should report limit and used on a MATCHER_TIMEOUT %s', (_name, details, expected) => {
    const engine = new BudgetEngine();
    engine.row = {
      status: 'refused',
      diagnostics: [
        {
          code: 'MATCHER_TIMEOUT',
          severity: 'error',
          message: 'Budget exhausted.',
          ...(details === undefined ? {} : { details }),
        },
        { code: 'GEOSPEC_OTHER', severity: 'warning', message: 'Untouched.' },
      ],
    };
    const client = createGeoSpecAssertionClient({
      engine,
      workUnitLimit: 300,
    });
    let report: GeoSpecAssertionError['report'] | undefined;
    try {
      client.expectGeo({ subjectHash: hash }).toBeWatertight();
    } catch (error) {
      report = error instanceof GeoSpecAssertionError ? error.report : undefined;
    }
    expect(report?.diagnostics[0]).toStrictEqual({
      code: 'MATCHER_TIMEOUT',
      severity: 'error',
      message: 'Budget exhausted.',
      details: { ...details, ...expected, maximumLimit: 512_000_000 },
    });
    expect(report?.diagnostics[1]).toStrictEqual({
      code: 'GEOSPEC_OTHER',
      severity: 'warning',
      message: 'Untouched.',
    });
    // The engine's exact result row keeps its own bytes and values.
    expect(report?.result['diagnostics']).toStrictEqual(engine.row['diagnostics']);
    expect(new TextDecoder().decode(report?.canonicalResult)).not.toContain('maximumLimit');
  });

  it("should report the host's raised maximum on a MATCHER_TIMEOUT", () => {
    const engine = new BudgetEngine();
    engine.row = {
      status: 'refused',
      diagnostics: [{ code: 'MATCHER_TIMEOUT', severity: 'error', message: 'Budget exhausted.' }],
    };
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 300, maximumWorkUnitLimit: 1_024_000_000 });
    let report: GeoSpecAssertionError['report'] | undefined;
    try {
      client.expectGeo({ subjectHash: hash }).toBeWatertight();
    } catch (error) {
      report = error instanceof GeoSpecAssertionError ? error.report : undefined;
    }
    expect(report?.diagnostics[0]).toMatchObject({ details: { limit: 300, maximumLimit: 1_024_000_000 } });
  });

  it('should carry the loadModel budget and an expectGeo override through the runner collector', async () => {
    const engine = new BudgetEngine();
    const collector = createCollector({ nativeAssertions: { engine } });
    const subject = bindGeoSpecSubject({
      client: createGeoSpecAssertionClient({ engine }),
      engine,
      identity: { subjectHash: hash },
      isLive: () => true,
      load: loadEvidence(24_000_000),
    });
    collector.it('budgets', () => {
      collector.expectGeo(subject).toBeWatertight();
      collector.expectGeo(subject, { workUnitLimit: 48_000_000 }).not.toBeWatertight();
    });
    collector.it('unbounded', () => {
      collector.expectGeo(subject, { workUnitLimit: 1e12 });
    });
    await collector.waitForCompletion();
    expect(engine.budgets).toEqual([24_000_000, 48_000_000]);
    expect(collector.tests.map(({ status }) => status)).toEqual(['passed', 'failed']);
    expect(collector.tests[1]?.diagnostics[0]?.message).toContain('expectGeo workUnitLimit must be a positive integer');
  });
});
