import { describe, expect, it } from 'vitest';
import { tessellationSpanAttributes } from '#framework/tessellation-span-attributes.js';

describe('tessellationSpanAttributes', () => {
  it('should flatten a downgraded preset report into tessellation.effective attributes', () => {
    expect(
      tessellationSpanAttributes(
        {
          triangles: 1_999_000,
          vertices: 1_000_500,
          elapsed: 812,
          requested: 'high',
          linearTolerance: 0.04,
          angularTolerance: 13,
          downgraded: 2,
        },
        [{ code: 'TESSELLATION_DOWNGRADED', message: 'downgraded', severity: 'warning' }],
      ),
    ).toEqual({
      'tessellation.effective.form': 'preset',
      'tessellation.effective.preset': 'high',
      'tessellation.effective.linearTolerance': 0.04,
      'tessellation.effective.angularTolerance': 13,
      'tessellation.effective.triangles': 1_999_000,
      'tessellation.effective.vertices': 1_000_500,
      'tessellation.effective.elapsed': 812,
      'tessellation.effective.downgraded': true,
      'tessellation.effective.downgradeSteps': 2,
      'tessellation.effective.simplified': false,
    });
  });

  it('should report an explicit form without a preset name', () => {
    const attributes = tessellationSpanAttributes(
      { triangles: 10, vertices: 8, elapsed: 1, requested: 'explicit', linearTolerance: 0.1, angularTolerance: 5 },
      [],
    );

    expect(attributes).toMatchObject({
      'tessellation.effective.form': 'explicit',
      'tessellation.effective.linearTolerance': 0.1,
      'tessellation.effective.angularTolerance': 5,
      'tessellation.effective.downgraded': false,
    });
    expect(attributes).not.toHaveProperty('tessellation.effective.preset');
  });

  it('should mark a voxel report simplified from its DISPLAY_SIMPLIFIED issue', () => {
    const attributes = tessellationSpanAttributes(
      { triangles: 2_000_000, vertices: 1_000_000, elapsed: 90, voxelSize: 0.2 },
      [{ code: 'DISPLAY_SIMPLIFIED', message: 'simplified', severity: 'warning' }],
    );

    expect(attributes).toEqual({
      'tessellation.effective.triangles': 2_000_000,
      'tessellation.effective.vertices': 1_000_000,
      'tessellation.effective.elapsed': 90,
      'tessellation.effective.voxelSize': 0.2,
      'tessellation.effective.downgraded': false,
      'tessellation.effective.simplified': true,
    });
  });

  it('should return no attributes without a report', () => {
    expect(tessellationSpanAttributes(undefined, [])).toEqual({});
  });
});
