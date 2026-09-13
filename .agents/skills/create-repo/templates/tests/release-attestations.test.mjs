import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { verifyReleaseAttestations } from '../../scripts/verify-release-attestations.mjs';

const candidate = {
  name: '@@CREATE_REPO_npm-name@@',
  version: '0.1.0',
  integrity: `sha512-${Buffer.from('artifact').toString('base64')}`,
};
const commit = 'a'.repeat(40);
const statement = {
  subject: [
    {
      name: 'pkg:npm/@@CREATE_REPO_npm-name@@@0.1.0',
      digest: { sha512: Buffer.from('artifact').toString('hex') },
    },
  ],
  predicate: {
    buildDefinition: {
      buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
      externalParameters: {
        workflow: {
          repository: 'https://github.com/taucad/@@CREATE_REPO_slug@@',
          path: '.github/workflows/ci.yml',
          ref: 'refs/heads/main',
        },
      },
      resolvedDependencies: [
        {
          uri: 'git+https://github.com/taucad/@@CREATE_REPO_slug@@@refs/heads/main',
          digest: { gitCommit: commit },
        },
      ],
    },
    runDetails: {
      builder: { id: 'https://github.com/actions/runner/github-hosted' },
      metadata: {
        invocationId: 'https://github.com/taucad/@@CREATE_REPO_slug@@/actions/runs/123/attempts/1',
      },
    },
  },
};
const audit = {
  invalid: [],
  missing: [],
  verified: [
    {
      name: '@@CREATE_REPO_npm-name@@',
      version: '0.1.0',
      attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } },
      attestationBundles: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
        },
      ],
    },
  ],
};
const options = { audit, manifest: { packages: [candidate] }, commit, runId: '123', runAttempt: '1' };

describe('release attestation verification', () => {
  it('binds every candidate to the exact repository, workflow, run, commit, and digest', () => {
    assert.doesNotThrow(() => verifyReleaseAttestations(options));
    assert.throws(() => verifyReleaseAttestations({ ...options, commit: 'b'.repeat(40) }), /wrong source commit/u);
  });
});
