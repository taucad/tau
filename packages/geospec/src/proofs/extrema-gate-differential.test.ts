import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext, proveRelationship } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import type { RelationshipEvidence } from '#proofs/types.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector } from '#selector/types.js';

/**
 * CR4 extrema-gate differential over real OCCT geometry: every occurrence-level
 * contact/clearance claim runs gated and exact-only, and the verdicts must
 * agree row for row. Rows the gate resolves must carry the certified-bound
 * evidence shape (method + mesh-provenance witnesses — the deliberate
 * schema assertion); straddle rows must reproduce the exact path's evidence
 * byte-identically. Tolerances are self-calibrated around each pair's exact
 * distance so the corpus always exercises resolved-pass, resolved-fail, and
 * boundary-straddle rows regardless of fixture dimensions.
 */
const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

type FixtureName = 'flange' | 'flangeGap' | 'gasket';

const fixtureSources: Record<FixtureName, { path: string; pair: [string, string] }> = {
  flange: { path: fixture('contact/flange-face-positive/model.step'), pair: ['runnerFlange', 'head'] },
  flangeGap: { path: fixture('contact/flange-face-gap-negative/model.step'), pair: ['runnerFlange', 'head'] },
  gasket: { path: fixture('contact/gasket-sandwich-positive/model.step'), pair: ['gasket', 'block'] },
};

describe('CR4 extrema-gate differential — gated vs exact on OCCT fixtures', () => {
  const contexts = new Map<FixtureName, RelationshipProofContext>();
  const subjects = new Map<FixtureName, GeometrySubject>();

  beforeAll(async () => {
    const keys = Object.keys(fixtureSources) as FixtureName[];
    const loaded = await Promise.all(
      keys.map(async (key) => loadStep({ source: fixtureSources[key].path, name: `${key}.step` })),
    );
    for (const [index, key] of keys.entries()) {
      const subject = loaded[index]!;
      const context = getSubjectProofContext(subject);
      if (!context) {
        throw new Error(`${key} must carry STEP-XDE and native BRep evidence.`);
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

  type GateExpectation = Partial<GeoSpecSpatialRelationshipExpectation> & {
    kind: 'contact' | 'clearance' | 'interference';
  };

  const run = (key: FixtureName, gate: boolean, expectation: GateExpectation): RelationshipEvidence => {
    const base = contexts.get(key)!;
    const [subjectName, targetName] = fixtureSources[key].pair;
    const subject = resolve({ kind: 'occurrence', name: subjectName } as GeometrySelector, base.index);
    const target = resolve({ kind: 'occurrence', name: targetName } as GeometrySelector, base.index);
    expect(subject.status).toBe('resolved');
    expect(target.status).toBe('resolved');
    // Context injection, never process.env — the differential cannot race a
    // concurrently-running suite.
    const context = { ...base, extremaGate: gate };
    return proveRelationship({
      subject,
      target,
      expectation: { subject: subjectName, target: targetName, ...expectation },
      context,
    });
  };

  it('should agree with the exact path on every self-calibrated row', () => {
    let resolvedRows = 0;
    let straddleRows = 0;
    const table: string[] = [];

    for (const key of Object.keys(fixtureSources) as FixtureName[]) {
      // Calibrate: the exact pair distance anchors every row's thresholds.
      const calibration = run(key, false, { kind: 'contact', tolerance: 1 });
      const distance = calibration.final?.measured['distance'];
      expect(distance).toBeDefined();
      const d = distance!;

      const rows: GateExpectation[] = [
        // Far side of the boundary in both directions, plus exact equality.
        { kind: 'contact', tolerance: d + 2 },
        { kind: 'contact', tolerance: Math.max(d / 2, 0.05) },
        { kind: 'contact', tolerance: d },
        // Clearance bands: comfortably inside, too tight, too loose, boundary.
        { kind: 'clearance', max: d + 3, tolerance: 0.01 },
        { kind: 'clearance', min: d + 2, tolerance: 0.01 },
        ...(d > 0.5 ? [{ kind: 'clearance', max: d / 2, tolerance: 0.01 } as const] : []),
        { kind: 'clearance', min: d, tolerance: 0.01 },
        // CR5: certified-zero interference on separated pairs; touching pairs
        // fall back to the exact boolean.
        { kind: 'interference' },
        ...(d > 0.5 ? [{ kind: 'interference', minVolume: 1, maxVolume: 5 } as const] : []),
      ];

      for (const expectation of rows) {
        const gated = run(key, true, expectation);
        const exact = run(key, false, expectation);
        table.push(
          `${key}\t${JSON.stringify(expectation)}\td=${d.toFixed(4)}\t${gated.verdict}/${exact.verdict}\t${gated.final?.method ?? '-'}`,
        );
        expect({ row: table.at(-1), verdict: gated.verdict }).toEqual({ row: table.at(-1), verdict: exact.verdict });
        if (gated.final?.method === 'mesh-distance-bound') {
          resolvedRows += 1;
          // The deliberate evidence-schema assertion: certified-bound rows
          // carry mesh-provenance witnesses (possibly none on separation
          // certificates) and never fake an exact distance.
          expect(gated.final.witnesses.every((witness) => witness.provenance === 'mesh')).toBe(true);
          expect(gated.final.measured['distance']).toBeUndefined();
        } else {
          straddleRows += 1;
          // Straddles reproduce the exact path byte-identically.
          expect(gated).toEqual(exact);
        }
      }
    }

    // eslint-disable-next-line no-console -- the differential table is the sign-off deliverable
    console.log(`\nfixture\trow\tcalibration\tgated/exact\tmethod\n${table.join('\n')}`);

    // Non-degenerate: the corpus must exercise both the resolved and the
    // straddle paths, or the parity above proves nothing.
    expect(resolvedRows).toBeGreaterThan(0);
    expect(straddleRows).toBeGreaterThan(0);
  }, 180_000);
});
