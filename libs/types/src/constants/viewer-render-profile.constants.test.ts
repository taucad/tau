import { describe, expect, it } from 'vitest';
import { resolveViewerAoRadiusCssPixels, viewerRenderProfile } from '#constants/viewer-render-profile.constants.js';

describe('viewerRenderProfile', () => {
  it('should hold the GTAO controls the viewer runs', () => {
    expect(viewerRenderProfile.ambientOcclusion).toStrictEqual({
      intensity: 0.75,
      distanceFalloff: 1,
      radiusCssPixels: 'viewport',
      radiusViewportFraction: 0.01,
      radiusMinimumDevicePixels: 4,
      thicknessRatio: 1 / 0.09,
      denoiseDepthTolerance: 0.1,
      samples: 16,
      resolutionScale: 0.5,
    });
  });

  it('should tone-map with Neutral at exposure 1', () => {
    expect(viewerRenderProfile.toneMapping).toBe('neutral');
    expect(viewerRenderProfile.exposure).toBe(1);
  });

  it('should light with the room environment, a camera-relative headlamp and a low ambient fill', () => {
    const { studio, ...lighting } = viewerRenderProfile.lighting;
    expect(lighting).toStrictEqual({
      environment: 'room',
      environmentIntensity: 1,
      ambientIntensity: 0.1,
      headlamp: { intensity: 1.5, rightOffset: 2, upOffset: 2, targetRightSkew: 0, targetUpSkew: 0, targetDistance: 2 },
      environmentResolution: { default: 512, coarsePointer: 256, softwareRasterizer: 64 },
    });
    expect(studio).toStrictEqual({
      keyIntensity: 64,
      keySize: 1.2,
      keyPosition: [1, 1, 1],
      fillIntensity: 1,
      backgroundIntensity: 0,
      fills: [
        { intensity: 1.2, position: [-3, 1, 0.5], rotation: [Math.PI / 8, Math.PI / 3, 0], size: 4 },
        { intensity: 0.25, position: [0, 3, 0], rotation: [Math.PI / 2, 0, 0], size: 3 },
        { intensity: 1.5, position: [2, -3, 0], rotation: [-Math.PI / 2, 0, 0], size: 6 },
        { intensity: 8, position: [2, -3, 4], size: 2 },
      ],
    });
  });

  it('should draw one-CSS-pixel edges, black in light mode and grey in dark mode', () => {
    expect(viewerRenderProfile.edges.lineWidthCssPixels).toBe(1);
    expect(viewerRenderProfile.edges.cardLineWidthCssPixels).toBe(2);
    expect(viewerRenderProfile.colorSchemes).toStrictEqual({
      light: { lightIntensityScale: 1, ambientBoost: 1, edgeColor: 0x00_00_00 },
      dark: { lightIntensityScale: 1, ambientBoost: 1.15, edgeColor: 0x86_86_86 },
    });
  });
});

describe('resolveViewerAoRadiusCssPixels', () => {
  it('should return a fixed radius unchanged', () => {
    expect(resolveViewerAoRadiusCssPixels(7, { width: 768, height: 576, dpr: 2 })).toBe(7);
  });

  it('should use one percent of the viewport diagonal for the viewport radius', () => {
    expect(resolveViewerAoRadiusCssPixels('viewport', { width: 768, height: 576, dpr: 1 })).toBeCloseTo(9.6, 12);
  });

  it('should keep the viewport radius at four device pixels or more when the viewport is small', () => {
    expect(resolveViewerAoRadiusCssPixels('viewport', { width: 160, height: 120, dpr: 2 })).toBe(2);
  });
});
