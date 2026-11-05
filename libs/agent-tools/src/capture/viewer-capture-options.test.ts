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
      lineColor: '#000000',
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
        // `defaultHeadlampConfig`: 1.5, two radii right and up of the camera, aimed two radii ahead.
        headlamp: { intensity: 1.5, rightOffset: 2, upOffset: 2 },
        lights: [],
        // Three.js ambient 0.1 with the dark boost 1.15, over π for nanoraster's direct diffuse multiplier.
        ambient: (0.1 * 1 * 1.15) / Math.PI,
        // The viewer's `RoomEnvironment` at intensity 1: nanoraster's card-less environment.
        environment: { intensity: 1 },
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

  it('should draw card edges at the card line weight for the width the card is shown at', () => {
    const card = buildViewerCaptureImageOptions({ width: 1536, height: 1152, colorScheme: 'dark', displayWidth: 512 });
    const featured = buildViewerCaptureImageOptions({
      width: 1536,
      height: 1152,
      colorScheme: 'dark',
      displayWidth: 1024,
    });
    const viewer = buildViewerCaptureImageOptions({ width: 1536, height: 1152, colorScheme: 'dark' });

    expect(card.lineWidth).toBe(6);
    expect(featured.lineWidth).toBe(3);
    expect({ ...card, lineWidth: viewer.lineWidth }).toStrictEqual(viewer);
  });

  it('should keep the AO radius at four output pixels or more on a small capture', () => {
    expect(buildViewerCaptureImageOptions({ width: 192, height: 144, colorScheme: 'dark' }).ao.radiusPixels).toBe(4);
  });

  it('should draw black edges and no ambient boost in the light scheme', () => {
    const light = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'light' });
    expect(light.lineColor).toBe('#000000');
    expect(light.lighting.ambient).toBe(0.1 / Math.PI);
  });

  it('should send the viewer environment intensity and headlamp of each scheme explicitly', () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const { lighting } = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme });
      const scale = viewerRenderProfile.colorSchemes[colorScheme].lightIntensityScale;
      expect(lighting.environment).toStrictEqual({
        intensity: viewerRenderProfile.lighting.environmentIntensity * scale,
      });
      expect(lighting.headlamp.intensity).toBe(viewerRenderProfile.lighting.headlamp.intensity * scale);
    }
  });

  it("should keep the headlamp's view direction when mapping it onto nanoraster's two-radius aim", () => {
    const { headlamp } = viewerRenderProfile.lighting;
    const { lighting } = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' });
    const viewer = [
      headlamp.rightOffset + headlamp.targetRightSkew,
      headlamp.upOffset + headlamp.targetUpSkew,
      headlamp.targetDistance,
    ];
    const nanoraster = [lighting.headlamp.rightOffset, lighting.headlamp.upOffset, 2];
    const unit = (vector: readonly number[]) => vector.map((axis) => axis / Math.hypot(...vector));
    expect(unit(nanoraster)).toStrictEqual(unit(viewer));
  });

  it('should return fresh objects so a caller can serialize or edit its options', () => {
    const first = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' });
    const second = buildViewerCaptureImageOptions({ width: 768, height: 576, colorScheme: 'dark' });
    expect(first.lighting.lights).not.toBe(second.lighting.lights);
    expect(first.lighting.headlamp).not.toBe(second.lighting.headlamp);
    expect(first.lighting.environment).not.toBe(second.lighting.environment);
  });
});

describe('resolveViewerCapturePixelRatio', () => {
  it('should be 1 at the reference frame and grow with the diagonal', () => {
    expect(resolveViewerCapturePixelRatio(viewerCaptureReferenceViewport)).toBe(1);
    expect(resolveViewerCapturePixelRatio({ width: 2400, height: 1350 })).toBeCloseTo(Math.hypot(2400, 1350) / 960, 12);
  });
});
