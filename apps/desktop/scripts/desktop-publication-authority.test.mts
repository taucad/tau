#!/usr/bin/env node
/** Purpose: Reject forged, wrong-channel, fork and stale publication identities. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { resolve } from 'node:path';
/* oxlint-disable no-restricted-imports -- Test the protected identity and channel gate admission boundary. */
import {
  requireDesktopInstallerPublicationEnabled,
  verifyDesktopPublicationToken,
} from './desktop-publication-authority.mjs';
/* oxlint-enable no-restricted-imports */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'fixture' }] };
const now = Date.now();
const expected = { channel: 'staging', runId: '123', workflowSha: 'a'.repeat(40) } as const;
const claims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'tau-desktop-installer-publication',
  sub: 'repo:taucad/tau:environment:desktop-installers-staging',
  repository: 'taucad/tau',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  repository_owner: 'taucad',
  ref: 'refs/heads/main',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  workflow_ref: 'taucad/tau/.github/workflows/desktop-route-promotion.yml@refs/heads/main',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  workflow_sha: expected.workflowSha,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  run_id: '123',
  iat: now / 1000,
  nbf: now / 1000,
  exp: now / 1000 + 300,
};
const token = (overrides: Record<string, unknown> = {}): string => {
  const payload = [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture' })).toString('base64url'),
    Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url'),
  ].join('.');
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`;
};
verifyDesktopPublicationToken(token(), jwks, { ...expected, now });
for (const overrides of [
  { repository: 'fork/tau' },
  { ref: 'refs/pull/1/merge' },
  { sub: 'repo:taucad/tau:environment:desktop-installers-production' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { workflow_ref: 'taucad/tau/.github/workflows/other.yml@refs/heads/main' },
  { aud: 'other' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { run_id: '456' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { workflow_sha: 'b'.repeat(40) },
  { exp: now / 1000 - 1 },
  { nbf: now / 1000 + 60 },
]) {
  assert.throws(() => {
    verifyDesktopPublicationToken(token(overrides), jwks, { ...expected, now });
  });
}
assert.throws(() => {
  verifyDesktopPublicationToken(`${token().slice(0, -10)}AAAAAAAAAA`, jwks, { ...expected, now });
});
console.log('Signed publication identity admission checks passed');

assert.throws(() => {
  verifyDesktopPublicationToken(token({ sub: 'repo:taucad/tau:environment:desktop-installer-renewal-staging' }), jwks, {
    ...expected,
    now,
  });
});
verifyDesktopPublicationToken(token({ sub: 'repo:taucad/tau:environment:desktop-installer-renewal-staging' }), jwks, {
  ...expected,
  operation: 'renew-routes',
  now,
});
assert.throws(() => {
  verifyDesktopPublicationToken(token(), jwks, { ...expected, operation: 'renew-routes', now });
});

// Each channel is gated only by its own variable; the retired repository-wide switch enables nothing.
const stagingOnly = {
  DESKTOP_INSTALLER_PUBLICATION_STAGING: 'true',
  DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: 'false',
  DESKTOP_INSTALLER_PUBLICATION: 'true',
  TAU_ENABLE_INSTALLER_PROMOTION: 'true',
};
requireDesktopInstallerPublicationEnabled('staging', stagingOnly);
assert.throws(() => {
  requireDesktopInstallerPublicationEnabled('production', stagingOnly);
}, /disabled for production/u);
for (const value of [undefined, '', 'false', 'TRUE', 'yes', ' true']) {
  assert.throws(() => {
    requireDesktopInstallerPublicationEnabled('staging', { DESKTOP_INSTALLER_PUBLICATION_STAGING: value });
  }, /disabled for staging/u);
}
requireDesktopInstallerPublicationEnabled('production', { DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: 'true' });
assert.throws(() => {
  requireDesktopInstallerPublicationEnabled('staging', { DESKTOP_INSTALLER_PUBLICATION_PRODUCTION: 'true' });
}, /disabled for staging/u);

// The workflow entry point refuses a production renewal with only staging enabled before identity or any download.
for (const [event, operation] of [
  ['schedule', ''],
  ['workflow_dispatch', 'promote-routes'],
  ['workflow_dispatch', 'renew-routes'],
] as const) {
  const prepare = spawnSync(
    process.execPath,
    ['--import', '@oxc-node/core/register', resolve('apps/desktop/scripts/desktop-route-workflow.mts'), 'prepare'],
    {
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        ...stagingOnly,
        CHANNEL: 'production',
        GITHUB_EVENT_NAME: event,
        REQUESTED_OPERATION: operation,
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://fixture.actions.githubusercontent.com/token',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'fixture',
        GITHUB_RUN_ID: '123',
        GITHUB_SHA: 'a'.repeat(40),
      },
    },
  );
  assert.notEqual(prepare.status, 0);
  assert.match(prepare.stderr, /Installer publication is disabled for production/u);
}
console.log('Per-channel installer publication gate checks passed');
