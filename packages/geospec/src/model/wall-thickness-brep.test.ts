import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadModel } from '#model/index.js';
import type { GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import { loadStep as loadStepSource } from '#step/index.js';

const mainFile = 'main.ts';
const tolerance = 1e-6;
const importedAssemblyStepPath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

type WallThicknessCase = {
  id: string;
  name: string;
  expected: number;
  tolerance?: number;
  minTieCount?: number;
  code: string;
};

const loadStep = async (code: string): Promise<GeometrySubject> =>
  loadModel({
    code: { [mainFile]: code },
    file: mainFile,
    format: 'step',
  });

const expectMinimumWallThickness = async (fixture: WallThicknessCase): Promise<void> => {
  const subject = await loadStep(fixture.code);
  const thickness = subject.brep?.minimumWallThickness;
  const expectationTolerance = fixture.tolerance ?? 1e-5;

  expect(Math.abs((thickness?.value ?? Number.NaN) - fixture.expected)).toBeLessThanOrEqual(expectationTolerance);
  if (fixture.minTieCount !== undefined) {
    expect(thickness?.tieCount ?? 0).toBeGreaterThanOrEqual(fixture.minTieCount);
  }
};

const topologyCases: WallThicknessCase[] = [
  {
    id: 'H1',
    name: 'centered through-cylinder in a cube',
    expected: 10,
    minTieCount: 2,
    code: `
      import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cubeSize = 40;
        const cylinderRadius = 10;
        const cylinderHeight = 50;
        const cube = makeBaseBox(cubeSize, cubeSize, cubeSize);
        const cutout = makeCylinder(cylinderRadius, cylinderHeight)
          .translateZ((cubeSize - cylinderHeight) / 2);

        return cube.cut(cutout);
      }
    `,
  },
  {
    id: 'H2',
    name: 'offset through-cylinder near one cube side',
    expected: 2,
    code: `
      import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cubeSize = 40;
        const cylinderRadius = 10;
        const cylinderHeight = 50;
        const cube = makeBaseBox(cubeSize, cubeSize, cubeSize);
        const cutout = makeCylinder(cylinderRadius, cylinderHeight)
          .translate([8, 0, (cubeSize - cylinderHeight) / 2]);

        return cube.cut(cutout);
      }
    `,
  },
  {
    id: 'H3',
    name: 'web between two parallel through-holes',
    expected: 4,
    code: `
      import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const plateHeight = 30;
        const holeHeight = 40;
        const plate = makeBaseBox(40, 40, plateHeight);
        const leftHole = makeCylinder(5, holeHeight)
          .translate([-7, 0, (plateHeight - holeHeight) / 2]);
        const rightHole = makeCylinder(5, holeHeight)
          .translate([7, 0, (plateHeight - holeHeight) / 2]);

        return plate.cutAll([leftHole, rightHole]);
      }
    `,
  },
  {
    id: 'H4',
    name: 'coaxial cylindrical tube',
    expected: 5,
    code: `
      import { makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const outer = makeCylinder(15, 30);
        const inner = makeCylinder(10, 40).translateZ(-5);

        return outer.cut(inner);
      }
    `,
  },
  {
    id: 'H5',
    name: 'centered rectangular through-slot in a block',
    expected: 16,
    code: `
      import { makeBaseBox, makeBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const block = makeBaseBox(40, 80, 40);
        const slot = makeBox([-4, -24, -5], [4, 24, 45]);

        return block.cut(slot);
      }
    `,
  },
  {
    id: 'H6',
    name: 'blind cylindrical pocket with bottom wall',
    expected: 10,
    code: `
      import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cube = makeBaseBox(40, 40, 40);
        const pocket = makeCylinder(10, 30).translateZ(10);

        return cube.cut(pocket);
      }
    `,
  },
  {
    id: 'H7',
    name: 'open-top box shell with thin side walls',
    expected: 2,
    code: `
      import { makeBaseBox, makeBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const outer = makeBaseBox(40, 40, 30);
        const cavity = makeBox([-18, -18, 3], [18, 18, 35]);

        return outer.cut(cavity);
      }
    `,
  },
  {
    id: 'H8',
    name: 'rotated off-center through-cylinder',
    expected: 2,
    code: `
      import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cubeSize = 40;
        const cylinderRadius = 10;
        const cylinderHeight = 50;
        const cube = makeBaseBox(cubeSize, cubeSize, cubeSize);
        const cutout = makeCylinder(cylinderRadius, cylinderHeight)
          .translate([8, 0, (cubeSize - cylinderHeight) / 2]);

        return cube.cut(cutout).rotate(30, [0, 0, cubeSize / 2], [0, 1, 0]);
      }
    `,
  },
  {
    id: 'H9',
    name: 'two separate solids with a clearance gap',
    expected: 10,
    code: `
      import { makeBaseBox, type ShapeConfig } from 'replicad';

      const part = (name: string, x: number): ShapeConfig => ({
        shape: makeBaseBox(10, 10, 10).translate([x, 0, 0]),
        name,
      });

      export default function main(): ShapeConfig[] {
        return [
          part('left-block', -5.5),
          part('right-block', 5.5),
        ];
      }
    `,
  },
  {
    id: 'H11',
    name: 'conical through-hole in a cube',
    expected: 8,
    code: `
      import { draw, makeBaseBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cube = makeBaseBox(40, 40, 40);
        const taperedCutter = draw([0, -5])
          .hLineTo(8)
          .lineTo([12, 40])
          .vLineTo(45)
          .hLineTo(0)
          .close()
          .sketchOnPlane('XZ')
          .revolve([0, 0, 1]);

        return cube.cut(taperedCutter);
      }
    `,
  },
  {
    id: 'H12',
    name: 'spherical cavity near one cube side',
    expected: 2,
    code: `
      import { makeBaseBox, makeSphere, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const cube = makeBaseBox(40, 40, 40);
        const cavity = makeSphere(10).translate([8, 0, 20]);

        return cube.cut(cavity);
      }
    `,
  },
  {
    id: 'H13',
    name: 'partial revolved ring wall',
    expected: 4,
    code: `
      import { draw, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        return draw([10, 0])
          .hLineTo(14)
          .vLineTo(30)
          .hLineTo(10)
          .close()
          .sketchOnPlane('XZ')
          .revolve([0, 0, 1], { angle: 270 });
      }
    `,
  },
  {
    id: 'H14',
    name: 'smooth lofted through-cavity in a block',
    expected: 11,
    code: `
      import { drawCircle, makeBaseBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const block = makeBaseBox(50, 50, 40);
        const bottom = drawCircle(8).sketchOnPlane('XY', -5);
        const middle = drawCircle(14).sketchOnPlane('XY', 20);
        const top = drawCircle(8).sketchOnPlane('XY', 45);

        return block.cut(bottom.loftWith([middle, top], { ruled: false }));
      }
    `,
  },
  {
    id: 'H15',
    name: 'swept curved tube shell',
    expected: 3,
    code: `
      import { Sketcher, sketchCircle, type Shape3D } from 'replicad';

      const spine = () =>
        new Sketcher('XZ')
          .vLine(30)
          .tangentArc(20, 20)
          .hLine(20)
          .done();

      export default function main(): Shape3D {
        const outer = spine().sweepSketch((plane, origin) => sketchCircle(12, { plane, origin }));
        const inner = spine().sweepSketch((plane, origin) => sketchCircle(9, { plane, origin }));

        return outer.cut(inner);
      }
    `,
  },
  {
    id: 'H16',
    name: 'twisted ring extrusion',
    expected: 3,
    code: `
      import { drawCircle, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const outer = drawCircle(13)
          .sketchOnPlane()
          .extrude(30, { twistAngle: 45 });
        const inner = drawCircle(10)
          .sketchOnPlane()
          .extrude(30, { twistAngle: 45 });

        return outer.cut(inner);
      }
    `,
  },
  {
    id: 'H17',
    name: 'replicad shelled rounded box',
    expected: 3,
    code: `
      import { drawRoundedRectangle, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        return drawRoundedRectangle(40, 40, 6)
          .sketchOnPlane()
          .extrude(30)
          .shell(3, (faces) => faces.inPlane('XY', 30));
      }
    `,
  },
  {
    id: 'H18',
    name: 'spherical shell with enclosed void',
    expected: 3,
    code: `
      import { makeSphere, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        return makeSphere(15).cut(makeSphere(12));
      }
    `,
  },
  {
    id: 'H19',
    name: 'elliptical through-slot in a block',
    expected: 8,
    code: `
      import { drawEllipse, makeBaseBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const block = makeBaseBox(50, 50, 30);
        const slot = drawEllipse(17, 8).sketchOnPlane('XY', -5).extrude(40);

        return block.cut(slot);
      }
    `,
  },
  {
    id: 'H20',
    name: 'polygonal through-hole in a block',
    expected: 10,
    code: `
      import { drawPolysides, makeBaseBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const block = makeBaseBox(40, 40, 30);
        const hole = drawPolysides(10, 6).sketchOnPlane('XY', -5).extrude(40);

        return block.cut(hole);
      }
    `,
  },
  {
    id: 'H21',
    name: 'thin rib fused to a thick body',
    expected: 4,
    code: `
      import { makeBaseBox, makeBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const body = makeBaseBox(30, 20, 20);
        const rib = makeBox([-2, 10, 0], [2, 30, 20]);

        return body.fuse(rib);
      }
    `,
  },
  {
    id: 'H22',
    name: 'boolean-cut sliver wall',
    expected: 0.5,
    code: `
      import { makeBaseBox, makeBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const block = makeBaseBox(20, 20, 20);
        const notch = makeBox([-9.5, -4, -5], [12, 4, 25]);

        return block.cut(notch);
      }
    `,
  },
  {
    id: 'H23',
    name: 'mixed compound with thin part and clearance gap',
    expected: 3,
    code: `
      import { makeBaseBox, type ShapeConfig } from 'replicad';

      export default function main(): ShapeConfig[] {
        return [
          { name: 'thick-block', shape: makeBaseBox(10, 10, 10).translate([-5.5, 0, 0]) },
          { name: 'thin-plate', shape: makeBaseBox(12, 12, 3).translate([6.5, 0, 0]) },
        ];
      }
    `,
  },
  {
    id: 'H25',
    name: 'tube with curved side-port trimming',
    expected: 4,
    code: `
      import { makeCylinder, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        const outer = makeCylinder(20, 40);
        const inner = makeCylinder(16, 50).translateZ(-5);
        const sidePort = makeCylinder(3, 60)
          .rotate(90, [0, 0, 0], [0, 1, 0])
          .translate([-30, 0, 20]);

        return outer.cut(inner).cut(sidePort);
      }
    `,
  },
  {
    id: 'H26',
    name: 'variable fillet local blend thinning on a slab',
    expected: Math.SQRT2,
    code: `
      import { makeBaseBox, type Shape3D } from 'replicad';

      export default function main(): Shape3D {
        return makeBaseBox(30, 50, 10)
          .fillet([4, 1], (edges) => edges.inPlane('YZ', 15).inDirection('Y'));
      }
    `,
  },
];

const openShellCode = `
  import { drawCircle, type Shape3D } from 'replicad';

  export default function main(): Shape3D {
    const bottom = drawCircle(10).sketchOnPlane('XY', 0);
    const top = drawCircle(15).sketchOnPlane('XY', 20);

    return bottom.loftWith(top, { ruled: false }, true);
  }
`;

const invalidBrepSubject = (): GeometrySubject => ({
  kind: 'geometry-subject',
  provenance: {
    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'invalid-brep-wall-thickness-fixture' },
    unit: 'mm',
    loader: 'in-memory',
  },
  capabilities: [{ kind: 'brep', feature: 'wall-thickness' }],
  diagnostics: [],
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: 0,
      meshCount: 0,
      triangleCount: 0,
      meshQuality: {
        triangleCount: 0,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles: [],
        surfaceArea: 0,
        signedVolume: 0,
      },
      connectedComponents: () => 0,
      analyseConnectedComponents: () => ({ count: 0, clusters: [], gaps: [] }),
      watertight: false,
      analyseWatertight: () => ({
        watertight: false,
        irregularEdges: 0,
        openBoundaryEdges: 0,
        nonManifoldEdges: 0,
        irregularEdgeKindCounts: { openBoundary: 0, nonManifold: 0 },
        irregularEdgeClusters: [],
        totalEdges: 0,
        irregularEdgeFraction: 0,
        perPrimitive: [],
      }),
    },
  },
  brep: {
    validity: {
      valid: false,
      freeBounds: { count: 1 },
      closedShells: false,
      closedWires: true,
    },
    minimumWallThickness: { value: 10, location: [0, 0, 0] },
  },
});

describe('BRep minimum wall thickness topology repros', () => {
  it.each(topologyCases)('$id should report $expected mm for $name', { timeout: 120_000 }, async (fixture) => {
    await expectMinimumWallThickness(fixture);
  });

  it('H10 should reject invalid BRep wall-thickness evidence', async () => {
    const collector = createCollector();
    installCollector(collector);

    try {
      collector.it('should reject invalid BRep wall-thickness evidence', () => {
        collector.expectGeo(invalidBrepSubject()).toHaveMinimumWallThickness({
          value: { greaterThanOrEqual: 1 },
          tolerance,
        });
      });
      await collector.waitForCompletion(1000);

      const diagnostic = collector.tests[0]?.assertions[0]?.diagnostics?.[0];
      expect(collector.tests[0]?.status).toBe('failed');
      expect(diagnostic).toMatchObject({
        code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
        severity: 'error',
      });
    } finally {
      clearCollectorGlobals();
    }
  });

  it('H24 should reject an open Replicad shell as wall-thickness evidence', async () => {
    const subject = await loadStep(openShellCode);

    expect(subject.brep?.validity?.valid).toBe(false);
    expect(subject.brep?.minimumWallThickness).toBeUndefined();
  });

  it('H27 should report per-solid wall thickness for an imported STEP compound', { timeout: 60_000 }, async () => {
    const subject = await loadStepSource({ source: importedAssemblyStepPath, name: 'two-cube-assembly.step' });

    expect(subject.brep?.minimumWallThickness?.value).toBeCloseTo(10, 6);
  });
});
