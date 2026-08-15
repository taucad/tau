#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const PROVENANCE_TYPE = 'https://slsa.dev/provenance/v1';
const BUILD_TYPE = 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1';
const BUILDER_ID = 'https://github.com/actions/runner/github-hosted';
const REPOSITORY = 'https://github.com/taucad/@@CREATE_REPO_slug@@';
const WORKFLOW = '.github/workflows/ci.yml';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const decodeProvenance = (entry) => {
  const attestation = entry.attestationBundles?.find(({ predicateType }) => predicateType === PROVENANCE_TYPE);
  assert(attestation, `${entry.name}@${entry.version} has no verified provenance attestation`);
  return JSON.parse(Buffer.from(attestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
};

const expectedDigest = (integrity) => {
  assert(integrity.startsWith('sha512-'), `unsupported integrity: ${integrity}`);
  return Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
};

const verifyPackage = ({ audit, candidate, commit, runId, runAttempt }) => {
  const entry = audit.verified?.find(({ name, version }) => name === candidate.name && version === candidate.version);
  assert(entry, `${candidate.name}@${candidate.version} has no verified npm signature`);
  assert(entry.attestations?.provenance?.predicateType === PROVENANCE_TYPE, `${candidate.name} lacks provenance`);

  const statement = decodeProvenance(entry);
  const subject = statement.subject?.find(({ name }) => name === `pkg:npm/${candidate.name}@${candidate.version}`);
  assert(subject?.digest?.sha512 === expectedDigest(candidate.integrity), `${candidate.name} digest differs`);

  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  assert(definition?.buildType === BUILD_TYPE, `${candidate.name} has the wrong build type`);
  assert(workflow?.repository === REPOSITORY, `${candidate.name} has the wrong source repository`);
  assert(workflow?.path === WORKFLOW, `${candidate.name} has the wrong source workflow`);
  assert(workflow?.ref === 'refs/heads/main', `${candidate.name} was not built from main`);

  const source = definition.resolvedDependencies?.find(({ uri }) => uri === `git+${REPOSITORY}@refs/heads/main`);
  assert(source?.digest?.gitCommit === commit, `${candidate.name} has the wrong source commit`);
  assert(statement.predicate?.runDetails?.builder?.id === BUILDER_ID, `${candidate.name} used the wrong builder`);
  assert(
    statement.predicate?.runDetails?.metadata?.invocationId ===
      `${REPOSITORY}/actions/runs/${runId}/attempts/${runAttempt}`,
    `${candidate.name} has the wrong workflow invocation`,
  );
};

export const verifyReleaseAttestations = ({ audit, manifest, commit, runId, runAttempt }) => {
  assert((audit.invalid ?? []).length === 0, 'npm reported invalid signatures');
  assert((audit.missing ?? []).length === 0, 'npm reported missing signatures');
  for (const candidate of manifest.packages) {
    verifyPackage({ audit, candidate, commit, runId, runAttempt });
  }
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const [auditPath, manifestPath, commit, runId, runAttempt] = process.argv.slice(2);
    assert(
      auditPath && manifestPath && commit && runId && runAttempt,
      'expected audit, manifest, commit, run, attempt',
    );
    verifyReleaseAttestations({
      audit: JSON.parse(readFileSync(auditPath, 'utf8')),
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      commit,
      runId,
      runAttempt,
    });
    process.stdout.write('release provenance matches the configured repository and ci.yml\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
