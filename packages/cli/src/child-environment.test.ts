import { describe, expect, it } from 'vitest';

import { childEnvironment } from '#child-environment.js';

/* Built by assignment so no environment key is a source literal; values are placeholders. */
const agentEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
    'PATH',
    'HOME',
    'LANG',
    'TMPDIR',
    'XDG_DATA_HOME',
    'HTTPS_PROXY',
    'no_proxy',
    'NODE_EXTRA_CA_CERTS',
    'NODE_USE_ENV_PROXY',
    'TAU_CONFIG_DIR',
    'TAU_PAYLOAD_MIRROR',
    'TAU_ACQUISITION',
    /* What Claude Code passes through and a runtime thread must never see (S25). */
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_PROJECT_DIR',
    'GITHUB_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'NODE_OPTIONS',
    'TAU_HOST_AGENT_TOKEN',
    'TAU_AUTH_TOKEN',
    'TAU_VIEWER_PAGE',
  ]) {
    environment[name] = `placeholder-${name}`;
  }
  return environment;
};

describe('childEnvironment', () => {
  it("should pass the baseline, proxy, CA and managed-profile names and drop the agent app's own (X9)", () => {
    expect(Object.keys(childEnvironment(agentEnvironment())).toSorted()).toEqual(
      [
        'HOME',
        'HTTPS_PROXY',
        'LANG',
        'NODE_EXTRA_CA_CERTS',
        'NODE_USE_ENV_PROXY',
        'PATH',
        'TAU_ACQUISITION',
        'TAU_CONFIG_DIR',
        'TAU_PAYLOAD_MIRROR',
        'TMPDIR',
        'XDG_DATA_HOME',
        'no_proxy',
      ].toSorted(),
    );
  });

  it('should keep values verbatim and skip unset names', () => {
    const environment: NodeJS.ProcessEnv = {};
    environment['PATH'] = '/usr/bin:/bin';
    environment['HOME'] = undefined;

    const expected: NodeJS.ProcessEnv = {};
    expected['PATH'] = '/usr/bin:/bin';
    expect(childEnvironment(environment)).toEqual(expected);
  });
});
