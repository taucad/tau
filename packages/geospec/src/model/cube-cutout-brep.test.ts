import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import { loadModel } from '#model/index.js';
import type { GeometrySubject } from '#mesh/types.js';

const mainFile = 'main.ts';
const cubeCutoutCode = `
  import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

  export const defaultParams = {
    cubeSize: 50,
    cylinderRadius: 10,
    cylinderHeight: 60,
  };

  export default function main(p = defaultParams): Shape3D {
    const cube = makeBaseBox(p.cubeSize, p.cubeSize, p.cubeSize);
    const cutout = makeCylinder(p.cylinderRadius, p.cylinderHeight)
      .translateZ((p.cubeSize - p.cylinderHeight) / 2);

    return cube.cut(cutout);
  }
`;

const transcriptBlindCutoutCode = `
  import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

  export const defaultParams = {
    cubeSize: 50,
    cylinderRadius: 8,
    cylinderHeight: 60,
  };

  export default function main(p = defaultParams): Shape3D {
    const cube = makeBaseBox(p.cubeSize, p.cubeSize, p.cubeSize);
    const cylinder = makeCylinder(
      p.cylinderRadius,
      p.cylinderHeight,
      [0, 0, -p.cylinderHeight / 2],
      [0, 0, 1]
    );

    return cube.cut(cylinder);
  }
`;

const transcriptThroughCutoutCode = `
  import { makeBaseBox, makeCylinder, type Shape3D } from 'replicad';

  export const defaultParams = {
    cubeSize: 50,
    cylinderRadius: 8,
    cylinderHeight: 60,
  };

  export default function main(p = defaultParams): Shape3D {
    const cube = makeBaseBox(p.cubeSize, p.cubeSize, p.cubeSize);
    const cylinder = makeCylinder(p.cylinderRadius, p.cylinderHeight)
      .translateZ((p.cubeSize - p.cylinderHeight) / 2);

    return cube.cut(cylinder);
  }
`;

let stepSubjectPromise: Promise<GeometrySubject> | undefined;
let glbSubjectPromise: Promise<GeometrySubject> | undefined;
let transcriptBlindSubjectPromise: Promise<GeometrySubject> | undefined;
let transcriptThroughSubjectPromise: Promise<GeometrySubject> | undefined;

const loadCubeCutoutStep = async (): Promise<GeometrySubject> => {
  stepSubjectPromise ??= loadModel({
    code: { [mainFile]: cubeCutoutCode },
    file: mainFile,
    format: 'step',
  });
  return stepSubjectPromise;
};

const loadCubeCutoutGlb = async (): Promise<GeometrySubject> => {
  glbSubjectPromise ??= loadModel({
    code: { [mainFile]: cubeCutoutCode },
    file: mainFile,
    format: 'glb',
  });
  return glbSubjectPromise;
};

const loadTranscriptBlindStep = async (): Promise<GeometrySubject> => {
  transcriptBlindSubjectPromise ??= loadModel({
    code: { [mainFile]: transcriptBlindCutoutCode },
    file: mainFile,
    format: 'step',
  });
  return transcriptBlindSubjectPromise;
};

const loadTranscriptThroughStep = async (): Promise<GeometrySubject> => {
  transcriptThroughSubjectPromise ??= loadModel({
    code: { [mainFile]: transcriptThroughCutoutCode },
    file: mainFile,
    format: 'step',
  });
  return transcriptThroughSubjectPromise;
};

const expectWithin = (actual: number | undefined, expected: number, tolerance: number): void => {
  expect(actual).toBeTypeOf('number');
  expect(Math.abs((actual ?? 0) - expected)).toBeLessThanOrEqual(tolerance);
};

describe('Replicad cube cutout BRep evidence', () => {
  it('should load the cube cutout as STEP/BRep evidence through GeoSpec OpenCascade', { timeout: 60_000 }, async () => {
    const subject = await loadCubeCutoutStep();

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.loader).toBe('opencascade-step');
    expect(subject.provenance.source.format).toBe('step');
    expect(subject.step?.readStrategy).toEqual(
      expect.objectContaining({
        strategy: 'native-stream',
        nativeReadStream: true,
      }),
    );
    expect(subject.brep?.validity).toMatchObject({ valid: true });
    expectWithin(subject.brep?.massProperties?.volume, 109_292.0367, 0.01);
    expectWithin(subject.brep?.massProperties?.surfaceArea, 17_513.2741, 0.01);
    expect(subject.brep?.massProperties?.centerOfMass).toEqual([
      expect.closeTo(0, 0.001),
      expect.closeTo(0, 0.001),
      expect.closeTo(25, 0.001),
    ]);
    expect(subject.mesh.stats.triangleCount).toBeGreaterThan(0);
  });

  it('should pass BRep feature matchers for the cube cutout', { timeout: 60_000 }, async () => {
    const subject = await loadCubeCutoutStep();
    const collector = createCollector();
    installCollector(collector);

    try {
      collector.it('should validate cube cutout exact evidence', () => {
        collector.expectGeo(subject).toHaveVolume({
          value: 109_292.0367,
          tolerance: 0.01,
          evidence: 'brep',
        });
        collector.expectGeo(subject).toHaveSurfaceArea({
          value: 17_513.2741,
          tolerance: 0.01,
          evidence: 'brep',
        });
        collector.expectGeo(subject).toHaveCenterOfMass({
          point: { x: 0, y: 0, z: 25 },
          tolerance: 0.001,
          evidence: 'brep',
        });
        collector.expectGeo(subject).toHavePlanarFace({
          normal: { x: 0, y: 0, z: 1 },
          offset: 50,
          area: { greaterThan: 2000 },
          tolerance: 0.1,
        });
        collector.expectGeo(subject).toHavePlanarFace({
          normal: { x: 0, y: 0, z: -1 },
          offset: 0,
          area: { greaterThan: 2000 },
          tolerance: 0.1,
        });
        collector.expectGeo(subject).toHaveCylindricalFace({
          radius: 10,
          axis: 'z',
          tolerance: 0.1,
        });
        collector.expectGeo(subject).toHaveCircularHole({
          diameter: 20,
          through: true,
          axis: 'z',
          center: { x: 0, y: 0 },
          tolerance: 0.1,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('passed');
      expect(collector.tests[0]?.assertions.map((assertion) => assertion.kind)).toEqual([
        'volume',
        'surfaceArea',
        'centerOfMass',
        'planarFace',
        'planarFace',
        'cylindricalFace',
        'circularHole',
      ]);
    } finally {
      clearCollectorGlobals();
    }
  });

  it(
    'should report unsupported BRep diagnostics for the cube cutout when loaded as GLB',
    { timeout: 60_000 },
    async () => {
      const subject = await loadCubeCutoutGlb();
      const collector = createCollector();
      installCollector(collector);

      try {
        collector.it('should require exact BRep evidence for feature checks', () => {
          collector.expectGeo(subject).toHaveCylindricalFace({
            radius: 10,
            axis: 'z',
            tolerance: 0.1,
          });
        });
        await collector.waitForCompletion(1000);

        const diagnostic = collector.tests[0]?.assertions[0]?.diagnostics?.[0];
        expect(collector.tests[0]?.status).toBe('failed');
        expect(diagnostic).toMatchObject({
          code: 'UNSUPPORTED_GEOMETRY_EVIDENCE',
          severity: 'error',
        });
        expect(diagnostic?.suggestion).toContain('loadModel({ format: "step" })');
      } finally {
        clearCollectorGlobals();
      }
    },
  );

  it('should classify the transcript cylinder placement as a blind cutout', { timeout: 60_000 }, async () => {
    const subject = await loadTranscriptBlindStep();

    expectWithin(subject.brep?.massProperties?.volume, 118_968.1421, 0.01);
    expectWithin(subject.brep?.massProperties?.surfaceArea, 16_507.9645, 0.01);
    expect(subject.brep?.massProperties?.centerOfMass).toEqual([
      expect.closeTo(0, 0.001),
      expect.closeTo(0, 0.001),
      expect.closeTo(25.507, 0.001),
    ]);
    expect(subject.brep?.circularHoles).toEqual([
      expect.objectContaining({
        diameter: 16,
        through: false,
        axis: 'z',
      }),
    ]);
  });

  it(
    'should fail through-hole assertions for the transcript blind cutout with actionable diagnostics',
    { timeout: 60_000 },
    async () => {
      const subject = await loadTranscriptBlindStep();
      const collector = createCollector();
      installCollector(collector);

      try {
        collector.it('should require a through-hole', () => {
          collector.expectGeo(subject).toHaveCircularHole({
            diameter: 16,
            through: true,
            axis: 'z',
            center: { x: 0, y: 0 },
            tolerance: 0.1,
          });
        });
        await collector.waitForCompletion(1000);

        const test = collector.tests.at(0);
        const diagnostic = test?.assertions.at(0)?.diagnostics?.at(0);
        expect(test?.status).toBe('failed');
        expect(diagnostic?.code).toBe('CIRCULAR_HOLE_NOT_FOUND');
        expect(diagnostic?.message).toContain('through false');
        expect(diagnostic?.suggestion).toContain('fully spans the part');
      } finally {
        clearCollectorGlobals();
      }
    },
  );

  it(
    'should pass exact through-hole BRep checks when the cut tool spans the full cube',
    { timeout: 60_000 },
    async () => {
      const subject = await loadTranscriptThroughStep();
      const collector = createCollector();
      installCollector(collector);

      try {
        collector.it('should validate the centered through-hole', () => {
          collector.expectGeo(subject).toHaveVolume({
            value: 114_946.9035,
            tolerance: 0.01,
            evidence: 'brep',
          });
          collector.expectGeo(subject).toHaveSurfaceArea({
            value: 17_111.1503,
            tolerance: 0.01,
            evidence: 'brep',
          });
          collector.expectGeo(subject).toHaveCenterOfMass({
            point: { x: 0, y: 0, z: 25 },
            tolerance: 0.001,
            evidence: 'brep',
          });
          collector.expectGeo(subject).toHavePlanarFace({
            normal: { x: 0, y: 0, z: 1 },
            offset: 50,
            area: { lessThan: 2400 },
            tolerance: 0.1,
          });
          collector.expectGeo(subject).toHaveCircularHole({
            diameter: 16,
            through: true,
            axis: 'z',
            center: { x: 0, y: 0 },
            tolerance: 0.1,
          });
        });
        await collector.waitForCompletion(1000);

        expect(collector.tests[0]?.status).toBe('passed');
      } finally {
        clearCollectorGlobals();
      }
    },
  );

  it('should apply explicit parameters to Replicad STEP exports', { timeout: 60_000 }, async () => {
    const largerCube = await loadModel({
      code: { [mainFile]: transcriptThroughCutoutCode },
      file: mainFile,
      format: 'step',
      parameters: { cubeSize: 100, cylinderRadius: 8, cylinderHeight: 120 },
    });
    const widerHole = await loadModel({
      code: { [mainFile]: transcriptThroughCutoutCode },
      file: mainFile,
      format: 'step',
      parameters: { cubeSize: 50, cylinderRadius: 12, cylinderHeight: 60 },
    });
    const collector = createCollector();
    installCollector(collector);

    try {
      collector.it('should validate parameterized variants', () => {
        collector.expectGeo(largerCube).toHaveBoundingBox({
          size: { x: 100, y: 100, z: 100 },
          tolerance: 0.05,
          evidence: 'brep',
        });
        collector.expectGeo(widerHole).toHaveCylindricalFace({
          radius: 12,
          axis: 'z',
          tolerance: 0.1,
        });
        collector.expectGeo(widerHole).toHaveCircularHole({
          diameter: 24,
          through: true,
          axis: 'z',
          center: { x: 0, y: 0 },
          tolerance: 0.1,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('passed');
    } finally {
      clearCollectorGlobals();
    }
  });
});
