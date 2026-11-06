import { describe, expect, it } from 'vitest';
import { tessellationSpanAttributes } from '#framework/tessellation-span-attributes.js';

describe('tessellationSpanAttributes', () => {
  it('should flatten a preset report into tessellation.effective attributes', () => {
    expect(
      tessellationSpanAttributes({
        triangles: 1_999_000,
        vertices: 1_000_500,
        elapsed: 812,
        requested: 'high',
        linearTolerance: 0.04,
        angularTolerance: 13,
      }),
    ).toEqual({
      'tessellation.effective.form': 'preset',
      'tessellation.effective.preset': 'high',
      'tessellation.effective.linearTolerance': 0.04,
      'tessellation.effective.angularTolerance': 13,
      'tessellation.effective.triangles': 1_999_000,
      'tessellation.effective.vertices': 1_000_500,
      'tessellation.effective.elapsed': 812,
    });
  });

  it('should report an explicit form without a preset name', () => {
    const attributes = tessellationSpanAttributes({
      triangles: 10,
      vertices: 8,
      elapsed: 1,
      requested: 'explicit',
      linearTolerance: 0.1,
      angularTolerance: 5,
    });

    expect(attributes).toMatchObject({
      'tessellation.effective.form': 'explicit',
      'tessellation.effective.linearTolerance': 0.1,
      'tessellation.effective.angularTolerance': 5,
    });
    expect(attributes).not.toHaveProperty('tessellation.effective.preset');
  });

  it('should add the voxel size of a voxel report', () => {
    const attributes = tessellationSpanAttributes({
      triangles: 2_000_000,
      vertices: 1_000_000,
      elapsed: 90,
      voxelSize: 0.2,
    });

    expect(attributes).toEqual({
      'tessellation.effective.triangles': 2_000_000,
      'tessellation.effective.vertices': 1_000_000,
      'tessellation.effective.elapsed': 90,
      'tessellation.effective.voxelSize': 0.2,
    });
  });

  it('should carry no downgrade attribute, since kernels render at the requested tolerance', () => {
    const attributes = tessellationSpanAttributes({ triangles: 10, vertices: 8, elapsed: 1, requested: 'high' });

    expect(Object.keys(attributes).filter((key) => key.includes('downgrade'))).toEqual([]);
  });

  it('should return no attributes without a report', () => {
    expect(tessellationSpanAttributes(undefined)).toEqual({});
  });
});
