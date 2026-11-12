import { describe, expect, it } from 'vitest';
import type { CameraVector } from '@taucad/camera';
import { defaultFramingStage, resolveFramingStage } from '#graphics/three/framing-stage.js';

const crossLength = ([ax, ay, az]: CameraVector, [bx, by, bz]: CameraVector): number =>
  Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);

describe('resolveFramingStage', () => {
  it('should resolve a valid up when the configured direction is parallel to the current up', () => {
    const { orientation } = resolveFramingStage({ rotation: { side: 0, vertical: Math.PI / 2 } }, [0, 0, 1]);
    expect(orientation.direction[2]).toBeCloseTo(1);
    expect(crossLength(orientation.direction, orientation.up)).toBeGreaterThan(1e-8);
  });

  it('should keep the current up where the configured direction allows it', () => {
    const { orientation, margin } = defaultFramingStage([0, 0, 1]);
    expect(orientation.up).toEqual([0, 0, 1]);
    expect(crossLength(orientation.direction, orientation.up)).toBeGreaterThan(1e-8);
    expect(margin).toBe(0.1);
  });

  it('should take the configured fit margin', () => {
    expect(resolveFramingStage({ fitMargin: 0.25 }, [0, 0, 1]).margin).toBe(0.25);
  });
});
