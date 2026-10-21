#!/usr/bin/env node
/** Purpose: Reject forged, wrong-channel, fork and stale publication identities. */
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
// oxlint-disable-next-line no-restricted-imports -- Test the protected identity admission boundary.
import { verifyDesktopPublicationToken } from './desktop-publication-authority.mjs';
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
