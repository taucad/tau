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

  it('should accept GIT_CONFIG_NOSYSTEM=1, which only drops the system config, and nothing else under GIT_CONFIG', () => {
    expect(refusedShellEnvironment({ PATH: '/usr/bin', GIT_CONFIG_NOSYSTEM: '1' })).toStrictEqual([]);
    expect(
      refusedShellEnvironment({
        GIT_CONFIG_NOSYSTEM: '0',
        git_config_nosystem: '1',
        GIT_CONFIG: '/x',
        GIT_CONFIG_GLOBAL: '/x',
        GIT_CONFIG_SYSTEM: '/x',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.fsmonitor',
        GIT_CONFIG_VALUE_0: '/x',
        GIT_CONFIG_PARAMETERS: "'core.fsmonitor=/x'",
      }),
    ).toStrictEqual([
      'GIT_CONFIG_NOSYSTEM',
      'git_config_nosystem',
      'GIT_CONFIG',
      'GIT_CONFIG_GLOBAL',
      'GIT_CONFIG_SYSTEM',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_0',
      'GIT_CONFIG_PARAMETERS',
    ]);
  });

  it('should refuse a malformed name or a value holding NUL', () => {
    expect(refusedShellEnvironment({ 'A=B': 'x', OK: 'a\0b' })).toStrictEqual(['A=B', 'OK']);
  });
});
