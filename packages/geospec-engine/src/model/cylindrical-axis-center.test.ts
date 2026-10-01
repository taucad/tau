import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadModel } from '#model/load-model.js';
import { loadStep } from '#step/load-step.js';
import { releaseEngineSubject } from '#engine/subject-store.js';

describe('STEP cylindrical feature centers', () => {
  it('should keep split cylindrical faces on the translated bore axis', async () => {
    const subject = await loadModel({
      code: {
        'main.ts': `import { drawCircle } from 'replicad';
export default function main() {
  return drawCircle(10).cut(drawCircle(5)).sketchOnPlane('XY').extrude(8).translate(17, -9, 3);
}`,
      },
      file: 'main.ts',
      format: 'step',
    });
    try {
      const holes = subject.brep?.circularHoles ?? [];
      expect(holes.length).toBeGreaterThan(0);
      for (const hole of holes) {
        expect(hole.diameter).toBeCloseTo(10, 5);
        expect(hole.axis).toBe('z');
        expect(hole.through).toBe(true);
        expect(hole.center?.[0]).toBeCloseTo(17, 5);
        expect(hole.center?.[1]).toBeCloseTo(-9, 5);
        expect(hole.center?.[2]).toBeCloseTo(7, 5);
      }
    } finally {
      if (subject.subjectId !== undefined) {
        releaseEngineSubject(subject.subjectId);
      }
    }
  }, 120_000);

  it.each([
    {
      name: 'chamfered through bore',
      through: true,
      model: "drawCircle(10).cut(drawCircle(5)).sketchOnPlane('XY').extrude(8).chamfer(0.5)",
    },
    {
      name: 'blind bore',
      through: false,
      model:
        "drawCircle(10).sketchOnPlane('XY').extrude(8).cut(drawCircle(5).sketchOnPlane('XY').extrude(6).translateZ(2))",
    },
  ])(
    'should classify the material passage of a $name',
    async ({ through, model }) => {
      const subject = await loadModel({
        code: {
          'main.ts': `import { drawCircle } from 'replicad';
export default function main() { return ${model}; }`,
        },
        file: 'main.ts',
        format: 'step',
      });
      try {
        const holes = subject.brep?.circularHoles ?? [];
        expect(holes.length).toBeGreaterThan(0);
        for (const hole of holes) {
          expect(hole.diameter).toBeCloseTo(10, 5);
          expect(hole.through).toBe(through);
        }
      } finally {
        if (subject.subjectId !== undefined) {
          releaseEngineSubject(subject.subjectId);
        }
      }
    },
    120_000,
  );

  it('should distinguish a blind counterbore from its smaller through passage', async () => {
    const subject = await loadModel({
      code: {
        'main.ts': `import { drawCircle } from 'replicad';
export default function main() {
  return drawCircle(10).cut(drawCircle(3)).sketchOnPlane('XY').extrude(8)
    .cut(drawCircle(6).sketchOnPlane('XY').extrude(3).translateZ(5));
}`,
      },
      file: 'main.ts',
      format: 'step',
    });
    try {
      const holes = subject.brep?.circularHoles ?? [];
      const counterbores = holes.filter((hole) => Math.abs(hole.diameter - 12) < 1e-5);
      const passages = holes.filter((hole) => Math.abs(hole.diameter - 6) < 1e-5);
      expect(counterbores.length).toBeGreaterThan(0);
      expect(passages.length).toBeGreaterThan(0);
      for (const hole of counterbores) {
        expect(hole.through).toBe(false);
      }
      for (const hole of passages) {
        expect(hole.through).toBe(true);
      }
    } finally {
      if (subject.subjectId !== undefined) {
        releaseEngineSubject(subject.subjectId);
      }
    }
  }, 120_000);
});

describe('STEP analytic bounds', () => {
  it('should measure a conical annulus without tessellation padding', async () => {
    const subject = await loadModel({
      code: {
        'main.ts': `import { draw } from 'replicad';
export default function main() {
  return draw([5, 1.5]).lineTo([10, 0]).lineTo([10, 1]).lineTo([5, 2.5])
    .close().sketchOnPlane('XZ').revolve();
}`,
      },
      file: 'main.ts',
      format: 'step',
    });
    try {
      const bounds = subject.brep?.boundingBox;
      expect(bounds).toBeDefined();
      for (const [index, expected] of [-10, -10, 0].entries()) {
        expect(bounds?.min[index]).toBeCloseTo(expected, 5);
      }
      for (const [index, expected] of [10, 10, 2.5].entries()) {
        expect(bounds?.max[index]).toBeCloseTo(expected, 5);
      }
    } finally {
      if (subject.subjectId !== undefined) {
        releaseEngineSubject(subject.subjectId);
      }
    }
  }, 120_000);
});

describe('STEP spline edge healing', () => {
  it('should read intersecting cylinders without exhausting the native stack', async () => {
    // Replicad AP242 export: a 4.8 mm shaft joined to a transverse 24/14 mm
    // annulus. ShapeFix::SameParameter needs more than the old 64 KiB stack.
    const subject = await loadStep({
      source: fileURLToPath(new URL('__fixtures__/intersecting-cylinders.step', import.meta.url)),
      mesh: false,
    });
    try {
      expect(subject.diagnostics).toEqual([]);
      expect(subject.brep?.topologyCounts?.solids).toBe(1);
      const bounds = subject.brep?.boundingBox;
      expect(bounds).toBeDefined();
      expect(bounds?.max[0]).toBeCloseTo(12, 5);
      expect(bounds?.min[0]).toBeCloseTo(-12, 5);
      expect(bounds?.max[1]).toBeCloseTo(2.4, 5);
      expect(bounds?.min[1]).toBeCloseTo(-2.4, 5);
      expect(bounds?.max[2]).toBeCloseTo(43.2, 5);
      expect(bounds?.min[2]).toBeCloseTo(0, 5);
    } finally {
      if (subject.subjectId !== undefined) {
        releaseEngineSubject(subject.subjectId);
      }
    }
  }, 120_000);
});
