import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext, proveRelationship } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import type { ContactEngine } from '#proofs/relationship-proofs.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector } from '#selector/types.js';

/**
 * Contact-engine verdict-model sign-off (spatial-relationship blueprint R1/R2/R3):
 * every `minContactArea` claim in the corpus is run through the OCCT sampling
 * lattice (default `classify`), the fast-winding-number oracle over the retained
 * lattice (`winding`, R2), and the exact per-face triangulation engine
 * (`topological`, R1). All three MUST reach the same verdict — the winding
 * oracle and the topological footprint are optimizations, never a change to what
 * passes. This corpus is the gate for the whole optimization.
 *
 * Fixtures and thresholds are the ones the `native-proofs` contact suite already
 * certifies against the analytic patch areas, spanning a full planar face, a
 * face group, a cone band, and an annulus.
 */
const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

type Verdict = 'pass' | 'fail' | 'unsupported';
type FixtureName = 'flange' | 'flangeGap' | 'gasket' | 'cone' | 'plug';

const fixtureSources: Record<FixtureName, { path: string; name: string }> = {
  flange: { path: fixture('contact/flange-face-positive/model.step'), name: 'flange-face-positive.step' },
  flangeGap: { path: fixture('contact/flange-face-gap-negative/model.step'), name: 'flange-face-gap-negative.step' },
  gasket: { path: fixture('contact/gasket-sandwich-positive/model.step'), name: 'gasket-sandwich-positive.step' },
  cone: { path: fixture('contact/valve-seat-cone-positive/model.step'), name: 'valve-seat-cone-positive.step' },
  plug: { path: fixture('contact/plug-seat-positive/model.step'), name: 'plug-seat-positive.step' },
};

type Claim = {
  name: string;
  fixture: FixtureName;
  subject: GeometrySelector;
  target: GeometrySelector;
  label: { subject: string; target: string };
  minContactArea: number;
  expect: Verdict;
};

const claims: Claim[] = [
  {
    name: 'flange full-face seat clears (patch ≈ 1600)',
    fixture: 'flange',
    subject: 'runnerFlange.mount',
    target: 'head.port.mount',
    label: { subject: 'runnerFlange.mount', target: 'head.port.mount' },
    minContactArea: 1500,
    expect: 'pass',
  },
  {
    name: 'flange full-face short of threshold',
    fixture: 'flange',
    subject: 'runnerFlange.mount',
    target: 'head.port.mount',
    label: { subject: 'runnerFlange.mount', target: 'head.port.mount' },
    minContactArea: 1900,
    expect: 'fail',
  },
  {
    name: 'gasket face-group seat clears',
    fixture: 'gasket',
    subject: { kind: 'face', of: 'gasket', query: { surfaceType: 'plane', area: 3600 }, expect: 'many' },
    target: { kind: 'occurrence', name: 'block' },
    label: { subject: 'gasket faces', target: 'block' },
    minContactArea: 3000,
    expect: 'pass',
  },
  {
    name: 'gasket face-group short of threshold',
    fixture: 'gasket',
    subject: { kind: 'face', of: 'gasket', query: { surfaceType: 'plane', area: 3600 }, expect: 'many' },
    target: { kind: 'occurrence', name: 'block' },
    label: { subject: 'gasket faces', target: 'block' },
    minContactArea: 7000,
    expect: 'fail',
  },
  {
    name: 'cone band seat clears (patch ≈ 306)',
    fixture: 'cone',
    subject: 'seat.seatCone',
    target: 'valve',
    label: { subject: 'seat.seatCone', target: 'valve' },
    minContactArea: 250,
    expect: 'pass',
  },
  {
    name: 'cone band short of threshold',
    fixture: 'cone',
    subject: 'seat.seatCone',
    target: 'valve',
    label: { subject: 'seat.seatCone', target: 'valve' },
    minContactArea: 380,
    expect: 'fail',
  },
  {
    name: 'plug washer annulus seat clears (patch ≈ 260)',
    fixture: 'plug',
    subject: 'plug.washerSeat',
    target: { kind: 'occurrence', name: 'head' },
    label: { subject: 'plug.washerSeat', target: 'head' },
    minContactArea: 200,
    expect: 'pass',
  },
  {
    name: 'plug washer annulus short of threshold',
    fixture: 'plug',
    subject: 'plug.washerSeat',
    target: { kind: 'occurrence', name: 'head' },
    label: { subject: 'plug.washerSeat', target: 'head' },
    minContactArea: 320,
    expect: 'fail',
  },
  {
    // Gap negative: the flange stands off the head — no footprint point seats,
    // so the patch is ~0 and any positive threshold fails. Guards the winding
    // distance band against over-counting a real gap into a false seat.
    name: 'flange gap does not seat (stand-off)',
    fixture: 'flangeGap',
    subject: 'runnerFlange.mount',
    target: 'head.port.mount',
    label: { subject: 'runnerFlange.mount', target: 'head.port.mount' },
    minContactArea: 100,
    expect: 'fail',
  },
];

describe('contact differential corpus — classify vs winding vs topological', () => {
  const contexts = new Map<FixtureName, RelationshipProofContext>();
  const subjects = new Map<FixtureName, GeometrySubject>();

  beforeAll(async () => {
    const keys = Object.keys(fixtureSources) as FixtureName[];
    const loaded = await Promise.all(
      keys.map(async (key) => loadStep({ source: fixtureSources[key].path, name: fixtureSources[key].name })),
    );
    for (const [index, key] of keys.entries()) {
      const subject = loaded[index]!;
      const context = getSubjectProofContext(subject);
      if (!context) {
        throw new Error(`${fixtureSources[key].name} must carry STEP-XDE and native BRep evidence.`);
      }
      subjects.set(key, subject);
      contexts.set(key, context);
    }
  }, 180_000);

  afterAll(() => {
    for (const subject of subjects.values()) {
      subject.nativeXde?.delete?.();
    }
  });

  it('should reach the same verdict on every claim across all three contact engines', () => {
    const runClaim = (claim: Claim, engine: ContactEngine, options?: { analyticSeating?: boolean }): Verdict => {
      const base = contexts.get(claim.fixture);
      if (!base) {
        throw new Error(`missing context for ${claim.fixture}`);
      }
      // Inject the engine through the context — never global process.env — so the
      // corpus cannot race a concurrently-running suite reading the env.
      const context = {
        ...base,
        ...(engine === 'classify' ? {} : { contactEngine: engine }),
        // Pinned both ways so the rows keep their meaning regardless of the
        // CO-R6 env default (promoted to ON): the band rows cover the
        // GEOSPEC_CONTACT_ANALYTIC_SEATING=0 escape hatch.
        ...(options?.analyticSeating === undefined ? {} : { contactAnalyticSeating: options.analyticSeating }),
      };
      return proveRelationship({
        subject: resolve(claim.subject, context.index),
        target: resolve(claim.target, context.index),
        expectation: {
          kind: 'contact',
          subject: claim.label.subject,
          target: claim.label.target,
          minContactArea: claim.minContactArea,
        },
        context,
      }).verdict;
    };

    const rows = claims.map((claim) => ({
      name: claim.name,
      expect: claim.expect,
      classify: runClaim(claim, 'classify'),
      winding: runClaim(claim, 'winding', { analyticSeating: false }),
      topological: runClaim(claim, 'topological', { analyticSeating: false }),
      analytic: runClaim(claim, 'topological', { analyticSeating: true }),
    }));

    // eslint-disable-next-line no-console -- the differential corpus table is the sign-off deliverable
    console.log('\nclassify\twinding\ttopo\tanalytic\texpect\tclaim');
    for (const row of rows) {
      // eslint-disable-next-line no-console -- the differential corpus table is the sign-off deliverable
      console.log(`${row.classify}\t${row.winding}\t${row.topological}\t${row.analytic}\t${row.expect}\t${row.name}`);
    }

    for (const row of rows) {
      // R2: the winding oracle must match the OCCT lattice verdict.
      expect({ claim: row.name, winding: row.winding }).toEqual({ claim: row.name, winding: row.classify });
      // R1: the topological per-face engine must match the OCCT lattice verdict.
      expect({ claim: row.name, topological: row.topological }).toEqual({ claim: row.name, topological: row.classify });
      // CO-R6 (promoted default): analytic seating must keep matching the
      // OCCT baseline; the band rows above keep the escape hatch covered.
      expect({ claim: row.name, analytic: row.analytic }).toEqual({ claim: row.name, analytic: row.classify });
      // Sanity: the corpus exercises the intended pass/fail path, so the parity
      // above is a real signal and not a degenerate all-unsupported agreement.
      expect({ claim: row.name, verdict: row.classify }).toEqual({ claim: row.name, verdict: row.expect });
    }
  }, 180_000);
});
