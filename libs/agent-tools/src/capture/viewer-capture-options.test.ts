import { describe, expect, it } from 'vitest';
import { viewerRenderProfile } from '@taucad/types/constants/viewer-render-profile';

import {
  buildViewerCaptureImageOptions,
  resolveViewerCapturePixelRatio,
  viewerCaptureReferenceViewport,
} from '#capture/viewer-capture-options.js';

describe('buildViewerCaptureImageOptions', () => {
  it('should reproduce the dark-scheme viewer at the 768×576 reference frame', () => {
    expect(buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' })).toStrictEqual({
      lineWidth: 1,
      lineColor: '#868686',
      ao: {
        radiusPixels: 960 * 0.01,
        intensity: 0.75,
        distanceFalloff: 1,
        thicknessRatio: 1 / 0.09,
        denoiseDepthTolerance: 0.1,
        samples: 16,
        resolutionScale: 0.5,
      },
      toneMapping: 'neutral',
      lighting: {
        lights: [{ direction: [2, 2, 2], color: [1.5, 1.5, 1.5] }],
        // Three.js ambient 0.1 with the dark boost 1.15, over π for nanoraster's direct diffuse multiplier.
        ambient: (0.1 * 1 * 1.15) / Math.PI,
        environment: 'studio',
        space: 'view',
        exposure: 1,
      },
    });
  });

  it('should scale edges and the AO radius with the capture as a denser display would', () => {
    const thumbnail = buildViewerCaptureImageOptions({ width: 1536, height: 1152, colorScheme: 'dark' });
    expect(thumbnail.lineWidth).toBe(2);
    expect(thumbnail.ao.radiusPixels).toBeCloseTo(19.2, 12);
  });

  it('should keep the AO radius at four output pixels or more on a small capture', () => {
    expect(buildViewerCaptureImageOptions({ width: 192, height: 144, colorScheme: 'dark' }).ao.radiusPixels).toBe(4);
  });

  it('should draw black edges and no ambient boost in the light scheme', () => {
    const light = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'light' });
    expect(light.lineColor).toBe('#000000');
    expect(light.lighting.ambient).toBe(0.1 / Math.PI);
  });

  it('should only rely on the environment intensity nanoraster draws its studio at', () => {
    // The nanoraster 0.8 lighting rig has no environment intensity; its studio environment is drawn at 1.
    for (const scheme of Object.values(viewerRenderProfile.colorSchemes)) {
      expect(viewerRenderProfile.lighting.environmentIntensity * scheme.lightIntensityScale).toBe(1);
    }
  });

  it('should return fresh arrays so a caller can serialize or edit its options', () => {
    const first = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' });
    const second = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' });
    expect(first.lighting.lights).not.toBe(second.lighting.lights);
    expect(first.lighting.lights[0].direction).not.toBe(second.lighting.lights[0].direction);
  });
});

describe('resolveViewerCapturePixelRatio', () => {
  it('should be 1 at the reference frame and grow with the diagonal', () => {
    expect(resolveViewerCapturePixelRatio(viewerCaptureReferenceViewport)).toBe(1);
    expect(resolveViewerCapturePixelRatio({ width: 2400, height: 1350 })).toBeCloseTo(Math.hypot(2400, 1350) / 960, 12);
  });
});
