import { describe, expect, it, vi } from 'vitest';
import { backendAcceptsViewerProfileOptions, withholdViewerProfileOptions } from '#viewer-profile-options.js';

const viewerOptions = {
  mode: 'single',
  lineWidth: 2,
  lineColor: '#868686',
  toneMapping: 'neutral',
  ao: {
    radiusPixels: 19.2,
    intensity: 0.75,
    distanceFalloff: 1,
    thicknessRatio: 1 / 0.09,
    denoiseDepthTolerance: 0.1,
    samples: 16,
    resolutionScale: 0.5,
  },
} as const;

describe('withholdViewerProfileOptions', () => {
  it('should withhold the options nanoraster 0.8 does not accept', () => {
    // The catalog still pins nanoraster 0.8; the bump to the viewer-parity release flips this flag.
    expect(backendAcceptsViewerProfileOptions).toBe(false);
  });

  it('should remove the viewer-parity options and name each one when the backend predates them', () => {
    const onWithheld = vi.fn();
    expect(withholdViewerProfileOptions(viewerOptions, { accepted: false, onWithheld })).toStrictEqual({
      mode: 'single',
      lineWidth: 2,
      ao: { radiusPixels: 19.2, intensity: 0.75, distanceFalloff: 1 },
    });
    expect(onWithheld).toHaveBeenCalledExactlyOnceWith([
      'lineColor',
      'toneMapping',
      'ao.thicknessRatio',
      'ao.denoiseDepthTolerance',
      'ao.samples',
      'ao.resolutionScale',
    ]);
  });

  it('should leave options without viewer-parity keys or ambient occlusion unchanged and silent', () => {
    const onWithheld = vi.fn();
    const plainOptions = { mode: 'single', lineWidth: 3 } as const;
    expect(withholdViewerProfileOptions(plainOptions, { accepted: false, onWithheld })).toStrictEqual({
      mode: 'single',
      lineWidth: 3,
    });
    expect(onWithheld).not.toHaveBeenCalled();
  });

  it("should rewrite the viewer's headlamp and room environment as the same light in the earlier backend's terms", () => {
    const onWithheld = vi.fn();
    const lighting = {
      headlamp: { intensity: 1.5, rightOffset: 2, upOffset: 2 },
      lights: [{ direction: [0, 0, 1], color: [0.5, 0.5, 0.5] }],
      ambient: 0.036,
      environment: { intensity: 1 },
      space: 'view',
      exposure: 1,
    } as const;
    expect(withholdViewerProfileOptions({ mode: 'single', lighting }, { accepted: false, onWithheld })).toStrictEqual({
      mode: 'single',
      lighting: {
        // The backend lights the headlamp first, along [right, up, 2] in view space.
        lights: [
          { direction: [2, 2, 2], color: [1.5, 1.5, 1.5] },
          { direction: [0, 0, 1], color: [0.5, 0.5, 0.5] },
        ],
        ambient: 0.036,
        environment: 'studio',
        space: 'view',
        exposure: 1,
      },
    });
    expect(onWithheld).not.toHaveBeenCalled();
  });

  it('should drop a dark headlamp and keep a named environment and the studio preset as they are', () => {
    const onWithheld = vi.fn();
    expect(
      withholdViewerProfileOptions(
        {
          mode: 'single',
          lighting: { headlamp: { intensity: 0, rightOffset: 2, upOffset: 2 }, lights: [], environment: 'none' },
        },
        { accepted: false, onWithheld },
      ),
    ).toStrictEqual({ mode: 'single', lighting: { lights: [], environment: 'none' } });
    expect(
      withholdViewerProfileOptions({ mode: 'single', lighting: 'studio' }, { accepted: false, onWithheld }),
    ).toStrictEqual({ mode: 'single', lighting: 'studio' });
    expect(onWithheld).not.toHaveBeenCalled();
  });

  it('should name the lighting it cannot express in the earlier backend', () => {
    const onWithheld = vi.fn();
    const light = { direction: [0, 0, 1], color: [1, 1, 1] } as const;
    const headlamp = { intensity: 1.5, rightOffset: 2, upOffset: 2 } as const;
    expect(
      withholdViewerProfileOptions(
        {
          mode: 'single',
          lighting: {
            headlamp,
            lights: [light],
            environment: { intensity: 0.5, cards: [{ position: [0, 0, 2], size: [1, 1], intensity: 1 }] },
            space: 'world',
          },
        },
        { accepted: false, onWithheld },
      ),
    ).toStrictEqual({ mode: 'single', lighting: { lights: [light], environment: 'studio', space: 'world' } });
    expect(onWithheld).toHaveBeenCalledExactlyOnceWith([
      'lighting.headlamp',
      'lighting.environment.cards',
      'lighting.environment.intensity',
    ]);
    onWithheld.mockClear();
    const full = Array.from({ length: 8 }, () => light);
    expect(
      withholdViewerProfileOptions(
        { mode: 'single', lighting: { headlamp, lights: full } },
        { accepted: false, onWithheld },
      ),
    ).toStrictEqual({ mode: 'single', lighting: { lights: full } });
    expect(onWithheld).toHaveBeenCalledExactlyOnceWith(['lighting.headlamp']);
  });

  it('should pass every option through once the backend accepts them', () => {
    const onWithheld = vi.fn();
    expect(withholdViewerProfileOptions(viewerOptions, { accepted: true, onWithheld })).toBe(viewerOptions);
    expect(onWithheld).not.toHaveBeenCalled();
  });
});
