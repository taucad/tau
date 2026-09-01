/**
 * Locks the infinite grid sRGB tints exported from
 * {@link ./overlay-colors.constants.ts} so a stray re-tune (e.g. matching the legacy
 * `0xA6_A6_A6` / `0x37_37_37` values that were calibrated to a WebGL bug) trips a
 * test failure rather than silently regressing WebGPU visibility.
 *
 * The values themselves may change with intentional UX review and visual proof against
 * `/e2e/graphics-backend` — this file is the single point that ratchets them.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  gltfEdgeColorDarkMode,
  gltfEdgeColorLightMode,
  infiniteGridColorDarkMode,
  infiniteGridColorLightMode,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';

describe('Grid theme colors', () => {
  it('uses linear-blend tuned tints visible on both WebGL gamma blend and WebGPU linear blend', () => {
    expect(infiniteGridColorLightMode).toBe(0x73_73_73);
    expect(infiniteGridColorDarkMode).toBe(0x55_55_55);
  });
});

describe('GLTF edge theme colors', () => {
  it('uses black in light mode and neutral gray in dark mode', () => {
    expect(gltfEdgeColorLightMode).toBe(0x00_00_00);
    expect(gltfEdgeColorDarkMode).toBe(0x86_86_86);
  });
});
