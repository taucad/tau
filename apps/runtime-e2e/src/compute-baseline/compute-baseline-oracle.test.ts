/**
 * T7/G-B7/U41: the geometry oracle is independent of the cache, and the
 * wrong-geometry attacks the blueprint names must fail it.
 *
 * The expectation is analytic. `parity-box` is a 40 x 30 x 20 mm block with a
 * full-height bore of radius 5 mm on its centre, translated by (100, 0, 0) mm,
 * so its volume is `40*30*20 - pi*5^2*20` exactly. Nothing here reads the store,
 * the session or a digest produced by the run under test.
 *
 * Units and axes: the renderer emits glTF (metres, Y-up), so CAD `(x, y, z)` mm
 * arrives as `(x, z, -y) / 1000` m. The expectation is written in that frame.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import type { Expectation, Geometry } from '#compute-baseline/oracle.js';
import { attacks, describeGlb, violations } from '#compute-baseline/oracle.js';
import type { ArmReport } from '#compute-baseline/runner.js';
import { readDump, runArm, scratch } from '#compute-baseline/runner.js';

const millimetre = 0.001;
const analyticVolumeMm3 = 40 * 30 * 20 - Math.PI * 5 * 5 * 20;

const expectation: Expectation = {
  names: ['ParityBox'],
  volume: analyticVolumeMm3 * millimetre ** 3,
  // A tessellated bore is an inscribed prism, so the meshed solid is slightly
  // larger than the analytic one; 0.1% covers that without hiding a real defect.
  volumeTolerance: 0.001,
  bounds: [100 * millimetre, 0, -30 * millimetre, 140 * millimetre, 20 * millimetre, 0],
  boundsTolerance: 10e-6,
};

let workspace: string;
let honest: ArmReport;
let geometry: Geometry;

beforeAll(async () => {
  workspace = await scratch('oracle');
  const dumps = `${workspace}/glb`;
  honest = await runArm(
    { model: 'parity-box', arm: 'memory', steps: ['cold'], dumpGlb: dumps, label: 'honest' },
    workspace,
  );
  geometry = await describeGlb(await readDump({ directory: dumps, model: 'parity-box', arm: 'memory', step: 'cold' }));
});

afterAll(async () => {
  if (workspace) {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('compute-baseline geometry oracle', () => {
  it('accepts the honest render against an analytic expectation', () => {
    expect(honest.steps).toHaveLength(1);
    expect(violations(geometry, expectation)).toEqual([]);
    expect(geometry.occurrences).toHaveLength(1);
    expect(geometry.totalTriangles).toBeGreaterThan(0);
  });

  it('rejects a translated part that keeps every scalar identical', () => {
    const attacked = attacks.translated(geometry, [millimetre, 0, 0]);
    expect(attacked.totalVolume).toBe(geometry.totalVolume);
    expect(attacked.totalTriangles).toBe(geometry.totalTriangles);
    expect(violations(attacked, expectation)).not.toEqual([]);
  });

  it('rejects a mirrored part that keeps every scalar identical', () => {
    const attacked = attacks.mirrored(geometry);
    expect(attacked.totalVolume).toBe(geometry.totalVolume);
    expect(violations(attacked, expectation)).not.toEqual([]);
  });

  it('rejects a swapped assembly whose label set and scalars are identical', () => {
    // Two geometrically distinct bodies; the attack keeps every scalar and the
    // whole label set, and only moves geometry between the labels.
    const shifted = attacks.translated(geometry, [50 * millimetre, 0, 0]).occurrences[0]!;
    const twoBodies = {
      ...geometry,
      occurrences: [
        { ...geometry.occurrences[0]!, name: 'Left' },
        { ...shifted, name: 'Right' },
      ],
    };
    const assembly: Expectation = {
      ...expectation,
      names: ['Left', 'Right'],
      volume: twoBodies.occurrences.reduce((total, occurrence) => total + occurrence.volume, 0),
      bounds: [
        expectation.bounds[0],
        expectation.bounds[1],
        expectation.bounds[2],
        expectation.bounds[3] + 50 * millimetre,
        expectation.bounds[4],
        expectation.bounds[5],
      ],
      /* eslint-disable-next-line @typescript-eslint/naming-convention -- keys are CAD occurrence labels, not identifiers. */
      occurrenceBounds: { Left: twoBodies.occurrences[0]!.bounds, Right: twoBodies.occurrences[1]!.bounds },
    };
    const honestAssembly = { ...twoBodies, totalVolume: assembly.volume, bounds: assembly.bounds };
    expect(violations(honestAssembly, assembly)).toEqual([]);

    const swapped = attacks.swapped(honestAssembly);
    expect(swapped.totalVolume).toBe(honestAssembly.totalVolume);
    expect(swapped.occurrences.map((occurrence) => occurrence.name).sort((a, b) => a.localeCompare(b))).toEqual([
      'Left',
      'Right',
    ]);
    expect(violations(swapped, assembly)).not.toEqual([]);
  });

  it('is not satisfied by topology and volume alone', () => {
    // A scalar-only oracle would accept every attack above; this pins that the
    // oracle's discriminating power comes from placement and bounds.
    const scalarsOnly = (candidate: typeof geometry): boolean =>
      candidate.totalTriangles === geometry.totalTriangles && candidate.totalVolume === geometry.totalVolume;
    expect(scalarsOnly(attacks.translated(geometry, [millimetre, 0, 0]))).toBe(true);
    expect(scalarsOnly(attacks.mirrored(geometry))).toBe(true);
  });
});
