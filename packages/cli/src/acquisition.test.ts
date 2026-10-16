import { describe, expect, it } from 'vitest';

import { acquisitionOf } from '#acquisition.js';

describe('acquisitionOf', () => {
  it.each([undefined, '', ' ', 'open', ' open '])('should read %j as open', (value) => {
    expect(acquisitionOf(value)).toBe('open');
  });

  it.each(['locked', ' locked', 'LOCKED', 'closed'])('should read %j as locked, never opening the network', (value) => {
    expect(acquisitionOf(value)).toBe('locked');
  });
});
