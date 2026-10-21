#!/usr/bin/env node
/** Purpose: Reject fork, source, workflow and artifact provenance substitutions. */
import assert from 'node:assert/strict';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Test provenance admission itself.
import { verifyDesktopReceiptProvenance } from './desktop-receipt-provenance.mjs';
const tag = 'desktop-staging@0.1.0-staging.102';
const identity = desktopReleaseIdentity(tag);
const { platform: _platform, ...definition } = desktopArtifactKinds['windows-nsis'];
const manifest = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: 'a'.repeat(40),
  artifacts: [
    {
      kind: 'windows-nsis',
      target: 'win32-x64',
      name: desktopArtifactName({ ...identity, kind: 'windows-nsis', arch: 'x64' }),
      ...definition,
      size: 10,
      sha256: 'b'.repeat(64),
      sha512: Buffer.alloc(64).toString('base64'),
    },
  ],
});
const run = {
  id: 123,
  event: 'workflow_dispatch',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  path: '.github/workflows/desktop-route-qualification.yml',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  head_sha: manifest.sourceCommit,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  repository: { full_name: 'taucad/tau' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  head_repository: { full_name: 'taucad/tau' },
};
const artifact = {
  id: 456,
  name: 'desktop-route-ci-receipts',
  expired: false,
  digest: `sha256:${'c'.repeat(64)}`,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  workflow_run: { id: 123, head_sha: manifest.sourceCommit },
};
assert.equal(verifyDesktopReceiptProvenance(run, artifact, { environment: 'ci', manifest }).id, 456);
for (const difference of [
  { event: 'pull_request' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { head_branch: 'unprotected' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { head_repository: { full_name: 'fork/tau' } },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { repository: { full_name: 'fork/tau' } },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { head_sha: 'd'.repeat(40) },
  { path: '.github/workflows/desktop-packaging.yml' },
  { conclusion: 'failure' },
]) {
  assert.throws(() =>
    verifyDesktopReceiptProvenance({ ...run, ...difference }, artifact, { environment: 'ci', manifest }),
  );
}
for (const difference of [
  { expired: true },
  { name: 'arbitrary' },
  { digest: undefined },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
  { workflow_run: { id: 999, head_sha: manifest.sourceCommit } },
]) {
  assert.throws(() =>
    verifyDesktopReceiptProvenance(run, { ...artifact, ...difference }, { environment: 'ci', manifest }),
  );
}
assert.throws(() => verifyDesktopReceiptProvenance(run, artifact, { environment: 'vm', manifest }));
console.log('Trusted workflow and artifact provenance checks passed');
