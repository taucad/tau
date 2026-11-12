import { describe, expect, it } from 'vitest';
import { mutantEnv } from '#mutants.js';

describe('mutantEnv', () => {
  it('should drop the fresh-seed request and keep the simulated behaviours', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables
    const env = { FORMAL_FRESH_TRACES: '20000', FORMAL_SIMULATED: 'out/simulated', PATH: '/bin' };

    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables
    expect(mutantEnv(env)).toEqual({ FORMAL_SIMULATED: 'out/simulated', PATH: '/bin' });
    expect(env.FORMAL_FRESH_TRACES).toBe('20000');
  });
});
