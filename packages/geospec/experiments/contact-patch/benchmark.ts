#!/usr/bin/env tsx
/**
 * Contact-patch (spatialRelationships `minContactArea`) baseline benchmark.
 *
 * The contact-patch estimator grids a subject face on a `G x G` lattice and
 * runs an exact point classification of every lattice point against BOTH the
 * subject and the target solid, then two tolerance probes per footprint point
 * (see proveContactArea / estimateContactPatch in relationship-proofs.ts,
 * G = contactPatchGrid = 40). The dominant cost is therefore
 *   ~2 * G^2 classifications per subject face (+ up to 2 * footprint probes),
 * each an OCCT BRepClass3d_SolidClassifier point-in-solid query.
 *
 * This harness measures the two complexity axes empirically, with no source
 * change to the engine:
 *   A. classification wall vs point count N  -> establishes O(N)=O(G^2)
 *   B. classification wall vs target face count -> establishes per-point cost C
 *   C. end-to-end contact-patch wall at G=40 reconstructed from the same
 *      native ops the estimator issues.
 *
 * Run: pnpm --filter geospec exec tsx experiments/contact-patch/benchmark.ts
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext } from '#proofs/index.js';
import type { Vec3 } from '#mesh/types.js';

type Aabb = { min: Vec3; max: Vec3 };
type FaceFact = { area?: number; bounds?: Aabb; centroid?: Vec3; surfaceType?: string };

const fixturesRoot = join(import.meta.dirname, '../../fixtures');

/**
 * Deterministic fixture set spanning small -> larger solids (face-count axis).
 * Each entry is the relative path to a STEP file under fixtures/. Small mate /
 * contact fixtures anchor the low end; the NIST AP242 machined parts anchor the
 * high-face-count end so C(target faces) can be extrapolated to assembly scale.
 */
const fixtureCandidates = [
  'contact/plug-seat-positive/model.step',
  'contact/valve-seat-cone-positive/model.step',
  'contact/flange-face-positive/model.step',
  'contact/gasket-sandwich-positive/model.step',
  'containment/pin-through-boss-positive/model.step',
  'mate/shaft-shoulder-bearing-positive/model.step',
  'mate/flanged-pipe-port-positive/model.step',
  'mate/dowel-located-flange-positive/model.step',
  'interop/nist-pmi/nist_ctc_01_asme1_ap242-e1.stp',
  'interop/nist-pmi/nist_ctc_05_asme1_ap242-e1.stp',
  'interop/nist-pmi/nist_ctc_02_asme1_ap242-e2.stp',
  'interop/nist-pmi/nist_stc_08_asme1_ap242-e3.stp',
];

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
};
const median = (values: readonly number[]): number => percentile(values, 50);

const unionBounds = (faces: FaceFact[]): Aabb | undefined => {
  let min: Vec3 | undefined;
  let max: Vec3 | undefined;
  for (const f of faces) {
    if (!f.bounds) continue;
    min = min
      ? [Math.min(min[0], f.bounds.min[0]), Math.min(min[1], f.bounds.min[1]), Math.min(min[2], f.bounds.min[2])]
      : [...f.bounds.min];
    max = max
      ? [Math.max(max[0], f.bounds.max[0]), Math.max(max[1], f.bounds.max[1]), Math.max(max[2], f.bounds.max[2])]
      : [...f.bounds.max];
  }
  return min && max ? { min, max } : undefined;
};

/** Mirror faceGridPoints: G x G lattice on the two widest AABB axes, third held at mid. */
const latticePoints = (aabb: Aabb, g: number): Vec3[] => {
  const ext: [number, number, number] = [
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2],
  ];
  const flat: 0 | 1 | 2 = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const axes = ([0, 1, 2] as const).filter((axis) => axis !== flat) as [0 | 1 | 2, 0 | 1 | 2];
  const [u, v] = axes;
  const mid: [number, number, number] = [
    (aabb.min[0] + aabb.max[0]) / 2,
    (aabb.min[1] + aabb.max[1]) / 2,
    (aabb.min[2] + aabb.max[2]) / 2,
  ];
  const points: Vec3[] = [];
  for (let i = 0; i < g; i += 1) {
    for (let j = 0; j < g; j += 1) {
      const p: [number, number, number] = [mid[0], mid[1], mid[2]];
      p[u] = aabb.min[u] + (i + 0.5) * (ext[u] / g);
      p[v] = aabb.min[v] + (j + 0.5) * (ext[v] / g);
      points.push(p);
    }
  }
  return points;
};

const timeClassify = (
  native: { classifyPoints: (occ: number, json: string) => string },
  occ: number,
  points: Vec3[],
  iters: number,
): number => {
  const json = JSON.stringify(points);
  native.classifyPoints(occ, json); // warm-up
  const samples: number[] = [];
  for (let k = 0; k < iters; k += 1) {
    const t = performance.now();
    native.classifyPoints(occ, json);
    samples.push(performance.now() - t);
  }
  return median(samples);
};

type Loaded = {
  name: string;
  native: { classifyPoints: (o: number, j: string) => string; faceFacts: (o: number) => string };
  aabb: Aabb;
  faceCount: number;
};

const load = async (relative: string): Promise<Loaded | undefined> => {
  const step = join(fixturesRoot, relative);
  if (!existsSync(step)) return undefined;
  const subject = await loadStep({ source: step, name: relative });
  const context = getSubjectProofContext(subject);
  if (!context) return undefined;
  const native = context.native as unknown as {
    classifyPoints: (o: number, j: string) => string;
    faceFacts: (o: number) => string;
  };
  const parsed = JSON.parse(native.faceFacts(0)) as { faces?: FaceFact[] };
  const faces = parsed.faces ?? [];
  const aabb = unionBounds(faces);
  if (!aabb) return undefined;
  return { name: relative, native, aabb, faceCount: faces.length };
};

const main = async (): Promise<void> => {
  const loaded: Loaded[] = [];
  for (const c of fixtureCandidates) {
    const l = await load(c);
    if (l) loaded.push(l);
  }
  loaded.sort((a, b) => a.faceCount - b.faceCount);

  console.log('\n=== fixtures (sorted by face count) ===');
  for (const l of loaded) console.log(`  ${l.name.padEnd(42)} faces=${String(l.faceCount).padStart(4)}`);

  const facesOnly = process.env['CP_BENCH_FACES_ONLY'] === '1';

  // --- Axis A: classification wall vs N (grid density), on the largest solid ---
  const big = loaded[loaded.length - 1];
  if (big && !facesOnly) {
    console.log(`\n=== Axis A: classifyPoints wall vs N (grid G x G), target='${big.name}' faces=${big.faceCount} ===`);
    console.log('     G      N     medMs     ns/point');
    for (const g of [8, 16, 24, 32, 40, 56, 80, 113, 160]) {
      const pts = latticePoints(big.aabb, g);
      const ms = timeClassify(big.native, 0, pts, 7);
      console.log(
        `  ${String(g).padStart(4)} ${String(pts.length).padStart(6)}  ${ms.toFixed(3).padStart(8)}  ${((ms * 1e6) / pts.length).toFixed(1).padStart(9)}`,
      );
    }
  }

  // --- Axis B: classification wall vs target face count (fixed N=1600, G=40) ---
  console.log('\n=== Axis B: classifyPoints wall @ N=1600 (G=40) vs target face count ===');
  console.log('  faces   medMs    ns/point   fixture');
  for (const l of loaded) {
    const pts = latticePoints(l.aabb, 40);
    const ms = timeClassify(l.native, 0, pts, 7);
    console.log(
      `  ${String(l.faceCount).padStart(5)}  ${ms.toFixed(3).padStart(7)}   ${((ms * 1e6) / pts.length).toFixed(1).padStart(8)}   ${l.name}`,
    );
  }

  // --- Axis C: end-to-end contact-patch wall at G=40, reconstructed ---
  // The estimator issues: classify(subject,1600) + classify(target,1600) +
  // classify(target, footprint) x2 probes. Upper-bounded here by 4 x 1600.
  console.log('\n=== Axis C: reconstructed contact-patch wall per subject face @ G=40 ===');
  console.log('  (2x full-lattice classify [subject+target] + 2x probe classify; upper bound)');
  console.log('  perFaceMs   fixture');
  if (!facesOnly) {
    for (const l of loaded) {
      const pts = latticePoints(l.aabb, 40);
      const one = timeClassify(l.native, 0, pts, 7);
      const perFace = one * 4; // subject + target + 2 probe passes (footprint <= 1600)
      console.log(`  ${perFace.toFixed(2).padStart(9)}   ${l.name}`);
    }
  }
  console.log('');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
