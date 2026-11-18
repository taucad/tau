import { describe, expect, it } from 'vitest';
import { parseRenderTierQueryOverride } from '#components/geometry/render-tier-override.js';

describe('parseRenderTierQueryOverride', () => {
  it('should read the override in an undeployed debug build', () => {
    expect(parseRenderTierQueryOverride('?renderTier=hardware', true)).toEqual({ features: 'hardware' });
    expect(parseRenderTierQueryOverride('renderTier=software', true)).toEqual({ features: 'software' });
  });

  it('should ignore the override in any other build', () => {
    expect(parseRenderTierQueryOverride('?renderTier=hardware', false)).toBeUndefined();
  });

  it('should ignore an absent or unknown value', () => {
    expect(parseRenderTierQueryOverride('', true)).toBeUndefined();
    expect(parseRenderTierQueryOverride('?renderTier=fast', true)).toBeUndefined();
  });
});
