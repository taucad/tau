/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { refusedShellEnvironment } from '#shell/shell-environment.js';

describe('refusedShellEnvironment', () => {
  it('should accept an allowlisted environment', () => {
    expect(
      refusedShellEnvironment({ PATH: '/usr/bin:/bin', HOME: '/h', TMPDIR: '/t', LANG: 'C.UTF-8', TERM: 'xterm' }),
    ).toStrictEqual([]);
  });

  it('should refuse startup hooks, loader variables, sockets, proxies and credentials in input order', () => {
    expect(
      refusedShellEnvironment({
        BASH_ENV: '/x',
        ld_preload: '/x',
        DYLD_INSERT_LIBRARIES: '/x',
        NODE_OPTIONS: '--require x',
        SSH_AUTH_SOCK: '/s',
        https_proxy: 'http://x',
        GITHUB_TOKEN: 'x',
        MY_API_KEY: 'x',
        PSExecutionPolicyPreference: 'Bypass',
        PATH: '/usr/bin',
      }),
    ).toStrictEqual([
      'BASH_ENV',
      'ld_preload',
      'DYLD_INSERT_LIBRARIES',
      'NODE_OPTIONS',
      'SSH_AUTH_SOCK',
      'https_proxy',
      'GITHUB_TOKEN',
      'MY_API_KEY',
      'PSExecutionPolicyPreference',
    ]);
  });

  it('should refuse a malformed name or a value holding NUL', () => {
    expect(refusedShellEnvironment({ 'A=B': 'x', OK: 'a\0b' })).toStrictEqual(['A=B', 'OK']);
  });
});
