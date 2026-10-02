/* eslint-disable @typescript-eslint/naming-convention -- PicoGK C# parameter names are PascalCase. */
import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
import assemblyJson from './assembly.json' with { type: 'json' };

type PartBase = { id: string; count: number; cut?: boolean };
type Part =
  | (PartBase & {
      kind: 'ring';
      profile: Array<[number, number]>;
      y?: number;
      z?: number;
      pitch?: number;
      phase?: number;
      holes?: number;
      holeRadius?: number;
    })
  | (PartBase & {
      kind: 'perforated';
      x: number;
      length: number;
      radius: number;
      thickness: number;
    })
  | (PartBase & {
      kind: 'box';
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      wall?: number;
    })
  | (PartBase & {
      kind: 'blade';
      x: number;
      chord: number;
      sweep: number;
      naca: string;
      root: number;
      tip: number;
      taper: number;
    });
const assembly = assemblyJson as unknown as { parts: Part[] };

const load = async (parameters = {}) =>
  loadModel({ file: 'main.cs', parameters });
const nacaUnitAreas: Record<string, number> = {
  '2410': 0.06856840935884928,
  '2412': 0.08228209123061872,
  '4412': 0.08249743662848986,
  '4415': 0.10312179578561202,
  '0012': 0.08220999966710626,
  '0018': 0.1233149995006608,
};

describe('TF-2000 assembly requirements', () => {
  it('REQ-001: full engine occupies the 3600 by 2000 mm design envelope', async () => {
    const model = await load({ Cutaway: false });
    expectGeo(model).toHaveBoundingBox({
      min: { x: 0, y: -1000, z: -1000 },
      max: { x: 3600, y: 1000, z: 1000 },
      tolerance: 0.1,
    });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 1e8, lessThan: 3e9 },
    });
  });

  it('REQ-002: default section exposes the machinery without open mesh boundaries', async () => {
    const model = await load();
    expectGeo(model).toHaveBoundingBox({ size: { x: 3600 }, tolerance: 0.1 });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveMeshIntegrity({
      finitePositions: true,
      degenerateTriangles: { maxCount: 0 },
      duplicateFaces: { maxCount: 0 },
    });
    expectGeo(model).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: assembly.parts.flatMap((part) =>
        Array.from({ length: part.count }, (_, instance) => ({
          name: `${part.id} #${String(instance + 1).padStart(3, '0')}`,
          count: 1,
        })),
      ),
    });
  });

  for (const part of assembly.parts) {
    it(`LEAF ${part.id}: all ${part.count} instances are closed, finite and nonempty`, async () => {
      const model = await load({ Component: part.id, Cutaway: false });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveAssemblyOccurrences({
        uniqueNames: true,
        occurrences: Array.from({ length: part.count }, (_, instance) => ({
          name: `${part.id} #${String(instance + 1).padStart(3, '0')}`,
          count: 1,
        })),
      });
      expectGeo(model).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { maxCount: 0 },
        duplicateFaces: { maxCount: 0 },
      });
      expectGeo(model).toHaveVolume({ value: { greaterThan: 0 } });
      expectGeo(model).toHaveNoDiagnostics();

      if (part.kind === 'ring') {
        const axial = part.profile.map((point) => point[0]);
        const radius = Math.max(...part.profile.map((point) => point[1]));
        expectGeo(model).toHaveBoundingBox({
          min: { x: Math.min(...axial) },
          max: { x: Math.max(...axial) },
          tolerance: 0.01,
        });
        if (part.count === 1) {
          expectGeo(model).toHaveBoundingBox({
            center: { y: part.y ?? 0, z: part.z ?? 0 },
            size: { y: radius * 2, z: radius * 2 },
            tolerance: 0.1,
          });
        }
        if (part.count > 1) {
          const { pitch } = part;
          if (pitch === undefined) {
            throw new Error(`${part.id} lacks blade pitch`);
          }
          const centers: Array<[number, number]> = Array.from(
            { length: part.count },
            (_, index) => {
              const angle =
                (2 * Math.PI * index) / part.count +
                ((part.phase ?? 0) * Math.PI) / 180;
              return [
                (part.y ?? 0) + pitch * Math.cos(angle),
                (part.z ?? 0) + pitch * Math.sin(angle),
              ];
            },
          );
          expectGeo(model).toHaveBoundingBox({
            min: {
              y: Math.min(...centers.map((point) => point[0])) - radius,
              z: Math.min(...centers.map((point) => point[1])) - radius,
            },
            max: {
              y: Math.max(...centers.map((point) => point[0])) + radius,
              z: Math.max(...centers.map((point) => point[1])) + radius,
            },
            tolerance: 0.1,
          });
        }
        if (
          part.profile.length === 4 &&
          part.profile[0]![1] === part.profile[1]![1] &&
          part.profile[2]![1] === part.profile[3]![1]
        ) {
          const outer = part.profile[0]![1];
          const inner = part.profile[2]![1];
          const exact =
            Math.PI *
            (outer * outer -
              inner * inner -
              (part.holes ?? 0) * (part.holeRadius ?? 0) ** 2) *
            (Math.max(...axial) - Math.min(...axial)) *
            part.count;
          expectGeo(model).toHaveVolume({
            value: exact,
            tolerance: exact * (part.holes ? 0.003 : 0.002),
          });
          expectGeo(model).toHaveCenterOfMass({
            point: {
              x: (Math.max(...axial) + Math.min(...axial)) / 2,
              y: part.y ?? 0,
              z: part.z ?? 0,
            },
            tolerance: 0.02,
          });
        }
      }
      if (part.kind === 'perforated') {
        expectGeo(model).toHaveBoundingBox({
          min: { x: part.x },
          max: { x: part.x + part.length },
          size: {
            y: 2 * (part.radius + part.thickness),
            z: 2 * (part.radius + part.thickness),
          },
          tolerance: 0.1,
        });
        const solidSleeve =
          Math.PI *
          ((part.radius + part.thickness) ** 2 - part.radius ** 2) *
          part.length;
        expectGeo(model).toHaveVolume({
          value: {
            greaterThan: solidSleeve * 0.65,
            lessThan: solidSleeve * 0.98,
          },
        });
      }
      if (part.kind === 'box') {
        expectGeo(model).toHaveBoundingBox({
          center: { x: part.x, y: part.y, z: part.z },
          size: { x: part.sx, y: part.sy, z: part.sz },
          tolerance: 0.01,
        });
        const cavity = part.wall
          ? (part.sx - 2 * part.wall) *
            (part.sy - 2 * part.wall) *
            (part.sz - 2 * part.wall)
          : 0;
        expectGeo(model).toHaveVolume({
          value: part.sx * part.sy * part.sz - cavity,
          tolerance: 0.5,
        });
      }
      if (part.kind === 'blade') {
        expectGeo(model).toHaveBoundingBox({
          center: { x: part.x + part.chord * 0.5 + part.sweep * 0.5 },
          tolerance: part.chord,
        });
        const nacaArea = nacaUnitAreas[part.naca];
        if (nacaArea === undefined) {
          throw new Error(`Unknown NACA profile ${part.naca}`);
        }
        const ideal =
          ((nacaArea *
            part.chord ** 2 *
            (part.tip - part.root) *
            (1 + part.taper + part.taper ** 2)) /
            3) *
          part.count;
        expectGeo(model).toHaveVolume({
          value: ideal,
          tolerance: ideal * 0.02,
        });
        if (part.count > 1) {
          expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.01 });
        }
      }
    });
  }

  for (const part of assembly.parts.filter((part) => part.cut)) {
    it(`SECTION ${part.id}: cut surfaces are capped and retain the lower half`, async () => {
      const model = await load({ Component: part.id, Cutaway: true });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({
        count: 1,
        toleranceMm: 0.001,
      });
      expectGeo(model).toHaveBoundingBox({ max: { z: 0 }, tolerance: 0.01 });
      expectGeo(model).toHaveVolume({ value: { greaterThan: 0 } });
    });
  }

  for (const samples of [16, 40, 64]) {
    it(`REQ-003: NACA blade remains closed at ${samples} chord samples`, async () => {
      const model = await load({
        Component: 'fan/blades',
        ChordSamples: samples,
      });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveAssemblyOccurrences({
        occurrences: [{ name: 'fan/blades #024', count: 1 }],
      });
      expectGeo(model).toHaveMeshIntegrity({
        degenerateTriangles: { maxCount: 0 },
        duplicateFaces: { maxCount: 0 },
      });
    });
  }

  for (const stations of [3, 12]) {
    it(`REQ-006: blade span loft remains valid at ${stations} stations`, async () => {
      const model = await load({
        Component: 'fan/blades',
        SpanStations: stations,
      });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveMeshIntegrity({
        finitePositions: true,
        degenerateTriangles: { maxCount: 0 },
        duplicateFaces: { maxCount: 0 },
      });
      expectGeo(model).toHaveNoComponentInterference();
    });
  }

  it('REQ-004: concentric LP and HP shafts have a real radial clearance', async () => {
    const model = await load({ Component: 'shafts', Cutaway: false });
    expectGeo(model).toHaveAssemblyOccurrences({
      occurrences: [
        { name: 'shafts/lowPressure #001', count: 1 },
        { name: 'shafts/highPressure #001', count: 1 },
      ],
    });
    expectGeo(model).toHaveNoComponentInterference();
  });

  it('REQ-005: full assembly has no unintended part interference', async () => {
    expectGeo(await load({ Cutaway: false })).toHaveNoComponentInterference({
      tolerance: 0.01,
    });
  });
});
