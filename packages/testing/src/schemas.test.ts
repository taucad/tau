/* eslint-disable @typescript-eslint/naming-convention -- file-path keys (e.g. 'main.ts') aren't camelCase */
import { describe, expect, it } from 'vitest';
import {
  measurementTestRequirementSchema,
  testFailureSchema,
  testFileEntrySchema,
  testFileSchema,
  testModelOutputSchema,
  testPassSchema,
} from '#schemas.js';

describe('legacy requirement map schema', () => {
  it('should parse a single-file legacy requirement map keyed by source path', () => {
    const parsed = testFileSchema.parse({
      'main.ts': {
        requirements: [
          {
            id: 'req_box_width',
            description: 'Box is 100mm wide',
            type: 'measurement',
            check: 'boundingBox',
            expected: { size: { x: 100 } },
          },
        ],
      },
    });

    expect(Object.keys(parsed)).toEqual(['main.ts']);
    expect(parsed['main.ts']?.requirements).toHaveLength(1);
    expect(parsed['main.ts']?.requirements[0]?.id).toBe('req_box_width');
  });

  it('should parse a multi-file legacy requirement map with two distinct CUs', () => {
    const parsed = testFileSchema.parse({
      'main.ts': {
        requirements: [
          {
            id: 'req_main_solid',
            description: 'Main is a solid',
            type: 'measurement',
            check: 'connectedComponents',
            expected: { count: 1 },
          },
        ],
      },
      'pen.ts': {
        requirements: [
          {
            id: 'req_pen_watertight',
            description: 'Pen is watertight',
            type: 'measurement',
            check: 'watertight',
          },
        ],
      },
    });

    expect(Object.keys(parsed).sort()).toEqual(['main.ts', 'pen.ts']);
    expect(parsed['main.ts']?.requirements[0]?.check).toBe('connectedComponents');
    expect(parsed['pen.ts']?.requirements[0]?.check).toBe('watertight');
  });

  it('should reject a flat { requirements: [] } top-level object (must be keyed by source file path)', () => {
    const result = testFileSchema.safeParse({
      requirements: [
        {
          id: 'flat',
          description: 'Flat-shape requirement',
          type: 'measurement',
          check: 'connectedComponents',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('should reject the deprecated meshCount check (consolidated away from the agent surface)', () => {
    const result = measurementTestRequirementSchema.safeParse({
      id: 'req_legacy',
      description: 'legacy mesh count',
      type: 'measurement',
      check: 'meshCount',
    });
    expect(result.success).toBe(false);
  });

  it('should reject the deprecated vertexCount check (consolidated away from the agent surface)', () => {
    const result = measurementTestRequirementSchema.safeParse({
      id: 'req_legacy_vertex',
      description: 'legacy vertex count',
      type: 'measurement',
      check: 'vertexCount',
    });
    expect(result.success).toBe(false);
  });

  it('should expose exactly the consolidated 3-check enum on the agent-facing surface', () => {
    // Snapshot the surviving check vocabulary so any drift here forces an
    // intentional update across prompt + tool descriptions + research doc.
    const checkSchema = measurementTestRequirementSchema.shape.check;
    expect(checkSchema.options).toEqual(['boundingBox', 'connectedComponents', 'watertight']);
  });

  it('should reject a file entry missing requirements', () => {
    const result = testFileSchema.safeParse({
      'main.ts': {},
    });
    expect(result.success).toBe(false);
  });

  it('should accept an empty record (no per-file entries)', () => {
    const parsed = testFileSchema.parse({});
    expect(parsed).toEqual({});
  });
});

describe('testFileEntrySchema', () => {
  it('should accept an entry with an empty requirements array', () => {
    const parsed = testFileEntrySchema.parse({ requirements: [] });
    expect(parsed.requirements).toEqual([]);
  });
});

describe('testFailureSchema / testPassSchema', () => {
  it('should require targetFile on every failure', () => {
    const missing = testFailureSchema.safeParse({
      id: 'req_x',
      requirement: 'desc',
      reason: 'r',
      suggestion: 's',
    });
    expect(missing.success).toBe(false);

    const present = testFailureSchema.parse({
      id: 'req_x',
      requirement: 'desc',
      reason: 'r',
      suggestion: 's',
      targetFile: 'main.ts',
    });
    expect(present.targetFile).toBe('main.ts');
  });

  it('should round-trip an optional structured failure payload', () => {
    const data = testFailureSchema.parse({
      id: 'req_cc',
      requirement: 'Single solid',
      reason: 'Connected components: expected 1, got 2 (tolerance: 0.1mm)',
      suggestion: 'Fuse parts',
      targetFile: 'main.ts',
      failure: {
        check: 'connectedComponents',
        expected: 1,
        got: 2,
        toleranceMm: 0.1,
        clusters: [
          {
            label: 'A',
            primitives: [{ name: 'Body', vertices: 8, aabb: { min: [0, 0, 0], max: [1, 1, 1] } }],
            aabb: { min: [0, 0, 0], max: [1, 1, 1] },
            centroid: [0.5, 0.5, 0.5],
            totalVertices: 8,
          },
        ],
        gaps: [
          {
            fromLabel: 'A',
            toLabel: 'B',
            axis: 'x',
            gapMm: 10,
            fromPrimitive: 'Body',
            toPrimitive: 'Handle',
          },
        ],
      },
    });

    expect(data.failure?.check).toBe('connectedComponents');
    expect(testFailureSchema.parse(data)).toEqual(data);
  });

  it('should require targetFile on every pass', () => {
    const missing = testPassSchema.safeParse({
      id: 'req_x',
      requirement: 'desc',
    });
    expect(missing.success).toBe(false);

    const present = testPassSchema.parse({
      id: 'req_x',
      requirement: 'desc',
      targetFile: 'pen.ts',
    });
    expect(present.targetFile).toBe('pen.ts');
  });
});

describe('testModelOutputSchema', () => {
  it('should accept geometryArtifactPaths as an optional record of file→path strings', () => {
    const parsed = testModelOutputSchema.parse({
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
      geometryArtifactPaths: {
        'main.ts': '.tau/artifacts/tc-1__main_ts.glb',
        'pen.ts': '.tau/artifacts/tc-1__pen_ts.glb',
      },
    });

    expect(parsed.geometryArtifactPaths?.['main.ts']).toContain('main_ts.glb');
    expect(parsed.geometryArtifactPaths?.['pen.ts']).toContain('pen_ts.glb');
  });

  it('should accept output without geometryArtifactPaths (optional)', () => {
    const parsed = testModelOutputSchema.parse({
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
    });
    expect(parsed.geometryArtifactPaths).toBeUndefined();
  });

  it('should drop the singular geometryArtifactPath field from the output (only the plural geometryArtifactPaths map is supported)', () => {
    const result = testModelOutputSchema.safeParse({
      failures: [],
      passes: [],
      passed: 0,
      total: 0,
      geometryArtifactPath: '.tau/artifacts/tc-1.glb',
    });
    if (result.success) {
      expect(Object.hasOwn(result.data, 'geometryArtifactPath')).toBe(false);
    }
  });
});
