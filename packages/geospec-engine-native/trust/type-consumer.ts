import { describeTrustedInputs, evaluateTrustedPlan } from '@taucad/geospec-engine-native/trust';
import type {
  TrustedEvaluationResult,
  TrustedEvaluationSigner,
  TrustedInputDescription,
  TrustedVerifierPolicy,
} from '@taucad/geospec-engine-native/trust';

const signer: TrustedEvaluationSigner = {
  sign: async (payload) => payload.slice(0, 64),
};

const described: TrustedInputDescription = describeTrustedInputs({
  planPath: '/authority/approved-plan.json',
  productRoot: '/installed/product',
});

const verificationPolicy: TrustedVerifierPolicy = {
  ...described,
  cacheMode: 'disabled',
  evaluatorId: 'example-evaluator',
  evaluatorMode: 'example-signer',
  expectedJobChallenge: 'example-challenge',
  maxArtifactBytes: 67_108_864,
  maxEnvelopeBytes: 4_194_304,
  numericProfile: 'geospec-st-logical-requests-v3',
  payloadType: 'application/vnd.in-toto+json',
  predicateType: 'https://taucad.dev/attestation/geospec-trusted-evaluation/v2',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nexample\n-----END PUBLIC KEY-----\n',
  schema: 'geospec-trusted-verifier-policy-v2',
  trustedKeyId: 'example-key-id',
};

export const positiveConsumer: Promise<TrustedEvaluationResult> = evaluateTrustedPlan({
  jobChallenge: verificationPolicy.expectedJobChallenge,
  outputDirectory: '/evaluation/output',
  planPath: '/authority/approved-plan.json',
  productRoot: '/installed/product',
  signer,
  verificationPolicy,
});
