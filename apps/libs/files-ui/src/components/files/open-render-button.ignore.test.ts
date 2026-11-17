import { describe, expect, it } from 'vitest';
import { shouldShowOpenRenderButton } from '#components/files/open-render-button.ignore.js';

describe('shouldShowOpenRenderButton', () => {
  it('returns false for GeoSpec test entry paths', () => {
    expect(shouldShowOpenRenderButton('mainWing.geospec.ts')).toBe(false);
    expect(shouldShowOpenRenderButton('tests/smoke/main.geospec.ts')).toBe(false);
  });

  it('returns true for CAD entry paths', () => {
    expect(shouldShowOpenRenderButton('parts/fuselage.ts')).toBe(true);
    expect(shouldShowOpenRenderButton('main.scad')).toBe(true);
  });
});
