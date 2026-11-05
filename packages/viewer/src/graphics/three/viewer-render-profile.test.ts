/**
 * Charter invariant I1: the viewer reads its render constants from the shared viewer render profile without changing
 * a value. Each expectation is the literal the viewer held before the profile owned it.
 */

import { describe, expect, it } from 'vitest';
import { defaultPostProcessingSettings, resolveAoRadiusCssPixels } from '#graphics/three/post-processing-settings.js';
import {
  ambientBaseIntensity,
  darkModeAmbientBoost,
  darkModeIntensityScale,
  defaultHeadlampConfig,
  defaultStudioLighting,
  environmentBaseIntensity,
  headlampBaseIntensity,
} from '#graphics/three/utils/lights.utils.js';
import { gltfEdgeColorDarkMode, gltfEdgeColorLightMode } from '#graphics/three/overlay-colors.constants.js';
import { gltfEdgeLineWidth } from '#graphics/three/materials/gltf-edges.js';

describe('viewer render profile adoption', () => {
  it('should keep the production post-processing defaults', () => {
    expect(defaultPostProcessingSettings).toStrictEqual({
      aoEnabled: true,
      radiusCssPixels: 'viewport',
      aoCompositeStage: 'display',
      intensity: 3,
      gtaoIntensity: 0.75,
      distanceFalloff: 0.2,
      gtaoDistanceFalloff: 1,
      webglHalfResolution: false,
      webglDenoiseRadiusCssPixels: 3,
      displayMode: 'combined',
      toneMapping: 'neutral',
    });
  });

  it.each([
    { radius: 'viewport', viewport: { width: 768, height: 576, dpr: 1 } },
    { radius: 'viewport', viewport: { width: 1280, height: 720, dpr: 2 } },
    { radius: 'viewport', viewport: { width: 160, height: 120, dpr: 2 } },
    { radius: 5, viewport: { width: 768, height: 576, dpr: 1 } },
  ] as const)(
    'should resolve the $radius AO radius as before at $viewport.width×$viewport.height',
    ({ radius, viewport }) => {
      const previous =
        radius === 'viewport' ? Math.max(Math.hypot(viewport.width, viewport.height) * 0.01, 4 / viewport.dpr) : radius;
      expect(resolveAoRadiusCssPixels(radius, viewport)).toBe(previous);
    },
  );

  it('should keep the studio lighting defaults', () => {
    expect(ambientBaseIntensity).toBe(0.1);
    expect(headlampBaseIntensity).toBe(1.5);
    expect(environmentBaseIntensity).toBe(1);
    expect(darkModeIntensityScale).toBe(1);
    expect(darkModeAmbientBoost).toBe(1.15);
    expect(defaultHeadlampConfig).toStrictEqual({ rightOffset: 2, upOffset: 2, targetRightSkew: 0, targetUpSkew: 0 });
    expect(defaultStudioLighting).toStrictEqual({
      environment: 'room',
      ambientIntensity: 0.1,
      headlampIntensity: 1.5,
      environmentIntensity: 1,
      keyIntensity: 64,
      keySize: 1.2,
      fillIntensity: 1,
      backgroundIntensity: 0,
      exposure: 1,
    });
  });

  it('should keep one-CSS-pixel edges black in both themes', () => {
    expect(gltfEdgeLineWidth).toBe(1);
    expect(gltfEdgeColorLightMode).toBe(0x00_00_00);
    expect(gltfEdgeColorDarkMode).toBe(0x00_00_00);
  });
});
