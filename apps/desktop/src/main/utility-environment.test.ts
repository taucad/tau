/* eslint-disable @typescript-eslint/naming-convention -- environment names are SCREAMING_SNAKE */
import { describe, expect, it } from 'vitest';

import { utilityEnvironment } from '#main/utility-environment.js';

describe('utilityEnvironment', () => {
  it('copies only the allowlisted names', () => {
    expect(
      utilityEnvironment({
        PATH: '/usr/bin',
        TMPDIR: '/tmp',
        LANG: 'en_NZ.UTF-8',
        NODE_ENV: 'production',
      }),
    ).toEqual({ PATH: '/usr/bin', TMPDIR: '/tmp', LANG: 'en_NZ.UTF-8', NODE_ENV: 'production' });
  });

  it('drops everything that changes what the child is, or leaks a secret into it', () => {
    const environment = utilityEnvironment({
      PATH: '/usr/bin',
      /* These two change the child's identity, not just its configuration. */
      NODE_OPTIONS: '--require ./evil.cjs',
      ELECTRON_RUN_AS_NODE: '1',
      OPENAI_API_KEY: 'sk-live-secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      TAU_DESKTOP_TOKEN: 'session-token',
    });
    expect(environment).toEqual({ PATH: '/usr/bin' });
  });

  it('merges caller-named additions last', () => {
    expect(utilityEnvironment({ PATH: '/usr/bin' }, { TAU_PROJECT_ROOT: '/root' })).toEqual({
      PATH: '/usr/bin',
      TAU_PROJECT_ROOT: '/root',
    });
  });

  it('omits an allowlisted name that main itself does not have', () => {
    expect(utilityEnvironment({})).toEqual({});
  });
});
