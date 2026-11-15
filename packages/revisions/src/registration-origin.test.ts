import { describe, expect, it } from 'vitest';

import { registrationOrigin } from '#registration-origin.js';

describe('registrationOrigin (B4c)', () => {
  it('should name a project with a GitHub remote GitHub-linked', () => {
    expect(registrationOrigin([{}, { provider: 'github' }])).toStrictEqual({ origin: 'github' });
  });

  it('should send no origin for a project with no GitHub remote', () => {
    expect(registrationOrigin([])).toStrictEqual({});
    expect(registrationOrigin([{}])).toStrictEqual({});
  });
});
