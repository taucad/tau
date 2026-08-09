#!/usr/bin/env tsx
/**
 * F4 deviation gate (cold-cost blueprint Finding 4): before the CR4 extrema
 * gate may resolve anything by default, the certified mesh bounds must
 * CONTAIN the exact OCCT extrema distance on every measured pair —
 * `dLo − k·δsum ≤ d_occt ≤ dHi + k·δsum` — and the safety factor k must come
 * from measurement, never assumption (tolerant edges and B-splines are the
 * known deflection-bound violators).
 *
 * For each fixture occurrence pair and tolerance: d_occt from native
 * BRepExtrema; dLo = the supremum threshold the farther-than predicate still
 * certifies (bisection); dHi = the infimum threshold the within predicate
 * still realizes (bisection); k terms normalized by the summed achieved
 * deflections. Reports per-row k and the corpus maximum.
 */
import { join } from 'node:path';
import {
  buildMeshDistanceData,
  meshWithinDistance,
  meshesFartherThan,
} from '../../src/proofs/mesh-distance-predicates.js';
import { getSubjectProofContext } from '../../src/proofs/index.js';
import { loadStep } from '../../src/step/index.js';

const fixture = (relative: string): string => join(import.meta.dirname, '../../fixtures', relative);

const pairs: Array<{ name: string; path: string; subject: string; target: string }> = [
  { name: 'flange', path: fixture('contact/flange-face-positive/model.step'), subject: 'runnerFlange', target: 'head' },
  {
    name: 'flangeGap',
    path: fixture('contact/flange-face-gap-negative/model.step'),
    subject: 'runnerFlange',
    target: 'head',
  },
  { name: 'gasket', path: fixture('contact/gasket-sandwich-positive/model.step'), subject: 'gasket', target: 'block' },
  { name: 'cone', path: fixture('contact/valve-seat-cone-positive/model.step'), subject: 'seat', target: 'valve' },
  { name: 'plug', path: fixture('contact/plug-seat-positive/model.step'), subject: 'plug', target: 'head' },
  {
    name: 'housing',
    path: fixture('containment/filter-inside-housing-positive/model.step'),
    subject: 'filter',
    target: 'housing',
  },
];

// The contact gate's deflection ladder: min clamp, corpus default, max clamp.
const deflections = [0.005, 0.05, 0.1];

/** Largest threshold the separation certificate still proves (0 when none). */
const certifiedLowerBound = (
  left: ReturnType<typeof buildMeshDistanceData>,
  right: ReturnType<typeof buildMeshDistanceData>,
  ceiling: number,
): number => {
  if (!meshesFartherThan(left, right, 1e-9)) {
    return 0;
  }
  let low = 1e-9;
  let high = ceiling;
  for (let step = 0; step < 48 && high - low > 1e-12 + low * 1e-12; step += 1) {
    const mid = (low + high) / 2;
    if (meshesFartherThan(left, right, mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
};

/** Smallest threshold a realizable pair answers (Infinity when none ≤ ceiling). */
const realizableUpperBound = (
  left: ReturnType<typeof buildMeshDistanceData>,
  right: ReturnType<typeof buildMeshDistanceData>,
  ceiling: number,
): number => {
  const witness = meshWithinDistance(left, right, ceiling);
  return witness ? witness.distance : Number.POSITIVE_INFINITY;
};

const main = async (): Promise<void> => {
  const rows: Array<Record<string, unknown>> = [];
  let maxLowK = 0;
  let maxHighK = 0;
  for (const pair of pairs) {
    const subject = await loadStep({ source: pair.path, name: `${pair.name}.step` });
    const context = getSubjectProofContext(subject);
    const fetchMesh = context?.occurrenceMesh;
    const subjectIndex = context?.occurrenceIndexByPath.get(pair.subject);
    const targetIndex = context?.occurrenceIndexByPath.get(pair.target);
    if (!context || !fetchMesh || subjectIndex === undefined || targetIndex === undefined) {
      rows.push({ pair: pair.name, skipped: 'occurrence pair not resolvable' });
      subject.nativeXde?.delete?.();
      continue;
    }
    const exact = JSON.parse(context.native.extrema(subjectIndex, -1, targetIndex, -1)) as {
      distance?: number;
      error?: string;
    };
    if (exact.distance === undefined) {
      rows.push({ pair: pair.name, skipped: `extrema: ${exact.error ?? 'no distance'}` });
      subject.nativeXde?.delete?.();
      continue;
    }
    for (const deflection of deflections) {
      const meshOptions = { linearDeflection: deflection, angularDeflectionDegrees: 15 };
      const subjectMesh = fetchMesh(subjectIndex, meshOptions);
      const targetMesh = fetchMesh(targetIndex, meshOptions);
      if ('error' in subjectMesh || 'error' in targetMesh) {
        rows.push({ pair: pair.name, deflection, skipped: 'tessellation error' });
        continue;
      }
      const deltaSum = subjectMesh.deflection + targetMesh.deflection;
      const left = buildMeshDistanceData(subjectMesh.triangles);
      const right = buildMeshDistanceData(targetMesh.triangles);
      const ceiling = exact.distance + 10 * deltaSum + 1;
      const dLo = certifiedLowerBound(left, right, ceiling);
      const dHi = realizableUpperBound(left, right, ceiling);
      // Containment violations normalized by δsum: how many deflections the
      // mesh bound overshoots the exact distance by.
      const lowK = dLo > exact.distance ? (dLo - exact.distance) / deltaSum : 0;
      const highK = Number.isFinite(dHi) && exact.distance > dHi ? (exact.distance - dHi) / deltaSum : 0;
      maxLowK = Math.max(maxLowK, lowK);
      maxHighK = Math.max(maxHighK, highK);
      rows.push({
        pair: pair.name,
        deflection,
        deltaSum,
        dOcct: exact.distance,
        dLo,
        dHi: Number.isFinite(dHi) ? dHi : null,
        lowK,
        highK,
      });
    }
    subject.nativeXde?.delete?.();
  }
  console.log(
    JSON.stringify(
      {
        rows,
        maxLowK,
        maxHighK,
        // The operational verdict: with the shipped safety factor, every
        // measured pair's exact distance sits inside the widened interval.
        containedAtK2: maxLowK <= 2 && maxHighK <= 2,
      },
      null,
      2,
    ),
  );
};

await main();
