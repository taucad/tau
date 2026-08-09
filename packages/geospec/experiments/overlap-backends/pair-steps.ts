#!/usr/bin/env tsx
/**
 * CR1 pair-step microbench: attribute the per-pair cost of the production
 * exact-volume sequence — Mesh construction + merge, Manifold construction,
 * `Manifold.intersection`, `.volume()`, witness `boundingBox()`, `.delete()` —
 * per step, per pair class, so the cold-cost blueprint's CR2 rung selection is
 * decided by measurement instead of the 41 ms/pair aggregate.
 *
 * Default mode benches synthetic pair classes (box/sphere at three triangle
 * scales × disjoint/kissing/penetrating/nested). `--project <path> --file
 * <path>` benches real subject pairs instead, stratified across the outcome
 * classes the CR1 census defines. `--iterations` (default 20) and `--pairs`
 * (real mode cap, default 20) tune sampling.
 */
import initManifold from 'manifold-3d';
import type { Manifold as ManifoldSolid, ManifoldToplevel } from 'manifold-3d';
import { boxSoup } from '../../src/mesh/testing/overlap-subjects.js';
import { loadModel } from '../../src/model/load-model.js';
import { aabbCandidatePairs, buildComponentRecords } from './component-records.js';
import type { OverlapExperimentComponent } from './types.js';

type StepName = 'meshCtor' | 'manifoldCtor' | 'intersection' | 'volume' | 'witness' | 'delete';

type StepSamples = Record<StepName, number[]>;

type PairRow = {
  label: string;
  trianglesLeft: number;
  trianglesRight: number;
  intersectionVolume: number;
  steps: Record<StepName, { medianMs: number; p95Ms: number }>;
  /** Median one-boolean pair cost excluding construction (the per-pair op). */
  medianOpsMs: number;
  /** Median construction cost for both participants (amortized in production). */
  medianConstructionMs: number;
};

const now = (): number => performance.now();

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
};

const readFlag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

/** Lat-long UV sphere soup (9 floats/triangle), ~2·segments² triangles. */
const sphereSoup = (radius: number, segments: number, center: readonly [number, number, number]): number[] => {
  const soup: number[] = [];
  const point = (ring: number, segment: number): [number, number, number] => {
    const theta = (ring / segments) * Math.PI;
    const phi = (segment / segments) * 2 * Math.PI;
    return [
      center[0] + radius * Math.sin(theta) * Math.cos(phi),
      center[1] + radius * Math.sin(theta) * Math.sin(phi),
      center[2] + radius * Math.cos(theta),
    ];
  };
  for (let ring = 0; ring < segments; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = point(ring, segment);
      const b = point(ring + 1, segment);
      const c = point(ring + 1, segment + 1);
      const d = point(ring, segment + 1);
      if (ring > 0) {
        soup.push(...a, ...b, ...d);
      }
      if (ring < segments - 1) {
        soup.push(...b, ...c, ...d);
      }
    }
  }
  return soup;
};

const shiftSoup = (soup: readonly number[], offset: readonly [number, number, number]): number[] =>
  soup.map((value, index) => value + offset[index % 3]!);

type SyntheticClass = { label: string; left: number[]; right: number[] };

/** Box/sphere shapes at three triangle scales × the four pair relationships. */
const syntheticClasses = (): SyntheticClass[] => {
  const classes: SyntheticClass[] = [];
  const shapes: Array<{ name: string; soup: number[]; extent: number }> = [
    { name: 'box12', soup: boxSoup([0, 0, 0], [10, 10, 10]), extent: 10 },
    { name: 'sphere480', soup: sphereSoup(5, 16, [5, 5, 5]), extent: 10 },
    { name: 'sphere8k', soup: sphereSoup(5, 64, [5, 5, 5]), extent: 10 },
  ];
  for (const shape of shapes) {
    // Disjoint: a genuine gap. Kissing: exact face/tangent contact.
    // Penetrating: half-extent transversal crossing. Nested: half-scale copy.
    classes.push(
      { label: `${shape.name}/disjoint`, left: shape.soup, right: shiftSoup(shape.soup, [shape.extent * 1.5, 0, 0]) },
      { label: `${shape.name}/kissing`, left: shape.soup, right: shiftSoup(shape.soup, [shape.extent, 0, 0]) },
      {
        label: `${shape.name}/penetrating`,
        left: shape.soup,
        right: shiftSoup(shape.soup, [shape.extent / 2, 0, 0]),
      },
      {
        label: `${shape.name}/nested`,
        left: shape.soup,
        right: shape.soup.map((value, index) => value / 2 + [2.5, 2.5, 2.5][index % 3]!),
      },
    );
  }
  return classes;
};

/** The production construction sequence: soup → Mesh → merge → Manifold. */
const buildManifold = (
  wasm: ManifoldToplevel,
  soup: readonly number[],
  samples: StepSamples,
): ManifoldSolid | undefined => {
  const meshStart = now();
  const vertProperties = new Float32Array(soup);
  const triVerts = new Uint32Array(vertProperties.length / 3);
  for (let index = 0; index < triVerts.length; index++) {
    triVerts[index] = index;
  }
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  samples.meshCtor.push(now() - meshStart);
  const manifoldStart = now();
  try {
    const manifold = new wasm.Manifold(mesh);
    manifold.status();
    samples.manifoldCtor.push(now() - manifoldStart);
    return manifold;
  } catch {
    samples.manifoldCtor.push(now() - manifoldStart);
    return undefined;
  }
};

const emptySamples = (): StepSamples => ({
  meshCtor: [],
  manifoldCtor: [],
  intersection: [],
  volume: [],
  witness: [],
  delete: [],
});

/** Run the full production sequence `iterations` times on one soup pair. */
const benchPair = (
  wasm: ManifoldToplevel,
  label: string,
  left: readonly number[],
  right: readonly number[],
  iterations: number,
): PairRow | undefined => {
  const samples = emptySamples();
  let intersectionVolume = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const leftManifold = buildManifold(wasm, left, samples);
    const rightManifold = buildManifold(wasm, right, samples);
    if (!leftManifold || !rightManifold) {
      leftManifold?.delete();
      rightManifold?.delete();
      return undefined;
    }
    const intersectionStart = now();
    const intersection = wasm.Manifold.intersection(leftManifold, rightManifold);
    samples.intersection.push(now() - intersectionStart);
    const volumeStart = now();
    intersectionVolume = intersection.volume();
    samples.volume.push(now() - volumeStart);
    if (intersectionVolume > 1e-12) {
      const witnessStart = now();
      intersection.boundingBox();
      samples.witness.push(now() - witnessStart);
    }
    const deleteStart = now();
    intersection.delete();
    samples.delete.push(now() - deleteStart);
    leftManifold.delete();
    rightManifold.delete();
  }
  const steps = Object.fromEntries(
    (Object.keys(samples) as StepName[]).map((step) => [
      step,
      { medianMs: percentile(samples[step], 50), p95Ms: percentile(samples[step], 95) },
    ]),
  ) as PairRow['steps'];
  return {
    label,
    trianglesLeft: left.length / 9,
    trianglesRight: right.length / 9,
    intersectionVolume,
    steps,
    medianOpsMs: steps.intersection.medianMs + steps.volume.medianMs + steps.witness.medianMs + steps.delete.medianMs,
    medianConstructionMs: 2 * (steps.meshCtor.medianMs + steps.manifoldCtor.medianMs),
  };
};

const componentSoup = (component: OverlapExperimentComponent): number[] => {
  const soup: number[] = [];
  for (const triangle of component.triangles) {
    soup.push(...triangle.a, ...triangle.b, ...triangle.c);
  }
  return soup;
};

/** CR1 outcome class of one computed pair (census thresholds). */
const outcomeClass = (wasm: ManifoldToplevel, left: number[], right: number[], tolerance: number): string => {
  const samples = emptySamples();
  const leftManifold = buildManifold(wasm, left, samples);
  const rightManifold = buildManifold(wasm, right, samples);
  if (!leftManifold || !rightManifold) {
    leftManifold?.delete();
    rightManifold?.delete();
    return 'invalid';
  }
  const intersection = wasm.Manifold.intersection(leftManifold, rightManifold);
  const volume = intersection.volume();
  const smaller = Math.min(leftManifold.volume(), rightManifold.volume());
  intersection.delete();
  leftManifold.delete();
  rightManifold.delete();
  if (volume <= 1e-12) {
    return 'separated';
  }
  if (volume >= smaller * 0.999) {
    return 'containment';
  }
  return volume <= Math.max(tolerance ** 3, 1e-12) ? 'touching' : 'transversal';
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const iterations = Number(readFlag(args, '--iterations') ?? 20);
  const pairBudget = Number(readFlag(args, '--pairs') ?? 20);
  const tolerance = Number(readFlag(args, '--tolerance') ?? 0.1);
  const projectPath = readFlag(args, '--project');
  const file = readFlag(args, '--file');
  const wasm = await initManifold();
  wasm.setup();

  const rows: PairRow[] = [];
  if (projectPath || file) {
    if (!projectPath || !file) {
      throw new Error('Use --project and --file together for subject-backed benchmarks.');
    }
    const subject = await loadModel({ projectPath, file });
    const records = buildComponentRecords(subject);
    const candidates = aabbCandidatePairs(records, tolerance);
    // Stratify the sampled pairs across outcome classes so every class the
    // corpus contains is represented up to the pair budget.
    const byClass = new Map<string, Array<{ label: string; left: number[]; right: number[] }>>();
    for (const pair of candidates) {
      const left = componentSoup(records.components[pair.leftComponentId]!);
      const right = componentSoup(records.components[pair.rightComponentId]!);
      const kind = outcomeClass(wasm, left, right, tolerance);
      const bucket = byClass.get(kind) ?? [];
      bucket.push({ label: `${kind}: ${pair.leftLabel} × ${pair.rightLabel}`, left, right });
      byClass.set(kind, bucket);
    }
    const buckets = [...byClass.values()];
    for (let round = 0; rows.length < pairBudget; round++) {
      const bucket = buckets[round % buckets.length];
      const next = bucket?.shift();
      if (buckets.every((entries) => entries.length === 0) && !next) {
        break;
      }
      if (next) {
        const row = benchPair(wasm, next.label, next.left, next.right, iterations);
        if (row) {
          rows.push(row);
        }
      }
    }
  } else {
    for (const syntheticClass of syntheticClasses()) {
      const row = benchPair(wasm, syntheticClass.label, syntheticClass.left, syntheticClass.right, iterations);
      if (row) {
        rows.push(row);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: projectPath ? 'subject' : 'synthetic',
        ...(projectPath ? { projectPath, file } : {}),
        iterations,
        tolerance,
        rows,
      },
      null,
      2,
    ),
  );
};

await main();
