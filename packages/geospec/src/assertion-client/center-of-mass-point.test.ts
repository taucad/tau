import { describe, expect, it } from 'vitest';
import type { JSONValue } from '@taucad/runtime/types';
import { createGeoSpecAssertionClient } from '#assertion-client/index.js';
import type { GeoSpecNativeClaimEvaluation, GeoSpecNativeEngine } from '#assertion-client/index.js';
import type { GeoSpecCenterOfMassExpectation, GeoSpecPointExpectation } from '#runner/types.js';

const encode = (value: JSONValue): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(value)) as Record<string, unknown>;
const hash = 'a'.repeat(64);

/** Records each submitted claim budget and answers every claim as passed. */
class ClaimEngine implements GeoSpecNativeEngine {
  public readonly budgets: number[] = [];

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
        results: [{ claimId: claim!.claimId, status: 'passed', diagnostics: [] }],
      }),
    };
  }

  public processRequest(): Uint8Array<ArrayBuffer> {
    return encode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        configuration: {
          configurationProfile: 'geospec-entry-config-v1',
          defaultWorkUnitBudget: 8_000_000,
        },
        protocolVersion: 3,
        registryVersion: 5,
      },
    });
  }
}

// Authored JavaScript reaches the matcher untyped; these values model what the type system rejects.
const rangedPoint = JSON.parse('{ "y": { "greaterThan": 1 } }') as GeoSpecPointExpectation;
const namedPoint = JSON.parse('"origin"') as GeoSpecPointExpectation;
const overlongPoint = JSON.parse('[1, 2, 3, "w"]') as GeoSpecPointExpectation;
const missingPoint = JSON.parse('{}') as GeoSpecCenterOfMassExpectation;

describe('center-of-mass point authoring', () => {
  it('should reject a per-axis range early, naming the matcher and the supported form', () => {
    const engine = new ClaimEngine();
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 10 });
    const matchers = client.expectGeo({ subjectHash: hash });
    expect(() =>
      matchers.toHaveCenterOfMass({
        point: rangedPoint,
        tolerance: 0.1,
      }),
    ).toThrow(
      'GeoSpec matcher toHaveCenterOfMass point.y must be a finite number in millimetres: per-axis ranges such as { greaterThan } are not supported for center of mass. Assert the expected point with a tolerance instead.',
    );
    expect(() => matchers.not.toHaveCenterOfMass({ point: [0, Number.NaN, 0] })).toThrow(
      'GeoSpec matcher toHaveCenterOfMass point.y must be a finite number in millimetres.',
    );
    expect(() => matchers.toHaveCenterOfMass({ point: overlongPoint })).toThrow(
      'GeoSpec matcher toHaveCenterOfMass point.3 must be a finite number in millimetres.',
    );
    expect(() => matchers.toHaveCenterOfMass({ point: namedPoint })).toThrow(
      'GeoSpec matcher toHaveCenterOfMass needs point as [x, y, z] or { x, y, z } in millimetres, with an optional tolerance.',
    );
    expect(engine.budgets).toEqual([]);
  });

  it('should still submit exact points, partial axes and engine-owned omissions', () => {
    const engine = new ClaimEngine();
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 10 });
    const matchers = client.expectGeo({ subjectHash: hash });
    matchers.toHaveCenterOfMass({ point: [1, 2, 3], tolerance: 0.1 });
    matchers.toHaveCenterOfMass({ point: { z: 4 } });
    matchers.toHaveCenterOfMass(missingPoint);
    expect(engine.budgets).toHaveLength(3);
  });
});
