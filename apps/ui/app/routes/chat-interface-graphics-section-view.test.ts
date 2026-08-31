import { describe, expect, it } from 'vitest';
import { resolveSectionTranslationControl } from '#routes/w.$workspace.$project/chat-interface-graphics-section-view.js';

describe('resolveSectionTranslationControl', () => {
  it.each([
    ['nm', 1e-9],
    ['mm', 1e-3],
    ['km', 1e3],
  ] as const)('uses one displayed %s as the physical metre step', (displaySymbol, expectedStepMeters) => {
    expect(
      resolveSectionTranslationControl({
        displaySymbol,
        geometryCenterMeters: [0, 0, 0],
        geometryRadiusMeters: 0.1,
        selectedPlaneId: 'xy',
      }).stepMeters,
    ).toBe(expectedStepMeters);
  });

  it('centers the physical range on displaced geometry without a fixed metre floor', () => {
    expect(
      resolveSectionTranslationControl({
        displaySymbol: 'mm',
        geometryCenterMeters: [10, 20, 30],
        geometryRadiusMeters: 0.1,
        selectedPlaneId: 'xy',
      }),
    ).toEqual({ stepMeters: 0.001, minMeters: 29.8, maxMeters: 30.2 });
  });

  it('leaves the range unconstrained before geometry bounds are known', () => {
    expect(
      resolveSectionTranslationControl({
        displaySymbol: 'mm',
        geometryCenterMeters: [0, 0, 0],
        geometryRadiusMeters: 0,
        selectedPlaneId: 'xy',
      }),
    ).toEqual({ stepMeters: 0.001, minMeters: undefined, maxMeters: undefined });
  });
});
