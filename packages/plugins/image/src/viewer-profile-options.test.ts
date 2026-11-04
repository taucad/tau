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

  it('should pass every option through once the backend accepts them', () => {
    const onWithheld = vi.fn();
    expect(withholdViewerProfileOptions(viewerOptions, { accepted: true, onWithheld })).toBe(viewerOptions);
    expect(onWithheld).not.toHaveBeenCalled();
  });
});
