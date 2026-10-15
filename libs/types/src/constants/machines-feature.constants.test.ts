import { describe, expect, it } from 'vitest';
import { isMachinesFeatureEnabled } from '#constants/machines-feature.constants.js';

describe('machine deployment opt-in', () => {
  it.each([undefined, null, false, '', 'false', '0', 'yes', ' true ', {}, 1])('fails closed for %j', (value) => {
    expect(isMachinesFeatureEnabled(value)).toBe(false);
  });
  it.each([true, 'true', 'TRUE', '1'])('accepts explicit opt-in %j', (value) => {
    expect(isMachinesFeatureEnabled(value)).toBe(true);
  });
});
