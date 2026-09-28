/* oxlint-disable no-restricted-imports, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- This standalone demo consumes the owned trust module directly until the package owner adds the public export. */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describeTrustedInputs, evaluateTrustedPlan } from './run.mjs';

const TRUST_ROOT = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = resolve(
  TRUST_ROOT,
  '../../../node_modules/.cache/geospec-engine-native/m3-geometry-a1/principal-integration-a14/node',
);
const PLAN_PATH = join(TRUST_ROOT, 'approved-plan.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const runFrozenA14Demo = async ({ jobChallenge, outputDirectory }) => {
  assert.ok(outputDirectory, 'outputDirectory is required');
  assert.match(jobChallenge, /^[\w.:-]{1,128}$/, 'job challenge must be bounded ASCII');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const described = describeTrustedInputs({ planPath: PLAN_PATH, productRoot: PRODUCT_ROOT });
  const verificationPolicy = {
    ...described,
    cacheMode: 'disabled',
    evaluatorId: 'm4-local-trusted-evaluator-a1',
    evaluatorMode: 'signed-local-record',
    expectedJobChallenge: jobChallenge,
    isolationClass: 'none',
    maxArtifactBytes: 67_108_864,
    maxEnvelopeBytes: 4_194_304,
    numericProfile: 'geospec-st-logical-requests-v3',
    payloadType: 'application/vnd.in-toto+json',
    predicateType: 'https://taucad.dev/attestation/geospec-trusted-evaluation/v3',
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }),
    schema: 'geospec-trusted-verifier-policy-v3',
    trustedKeyId: sha256(publicDer),
  };
  const result = await evaluateTrustedPlan({
    jobChallenge,
    outputDirectory,
    planPath: PLAN_PATH,
    productRoot: PRODUCT_ROOT,
    signer: { sign: (bytes) => sign(null, bytes, privateKey) },
    verificationPolicy,
  });
  return { ...result, privateKeyPersistence: 'memory-only-demo' };
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [outputDirectory, jobChallenge = 'm4-positive-demo'] = process.argv.slice(2);
  assert.ok(outputDirectory, 'Usage: node demo.mjs <new-output-directory> [job-challenge]');
  process.stdout.write(`${JSON.stringify(await runFrozenA14Demo({ jobChallenge, outputDirectory }))}\n`);
}
