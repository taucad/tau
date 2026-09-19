/** Exact digest and retained name of one approved subject artifact. @public */
export type TrustedSubjectDigest = {
  readonly name: string;
  readonly sha256: string;
};

/** Inputs used to derive the identities an evaluation authority must pin. @public */
export type DescribeTrustedInputsOptions = {
  readonly planPath: string;
  readonly productRoot: string;
};

/** Exact plan, product, runner, subject, claim, and profile identities derived before evaluation. @public */
export type TrustedInputDescription = {
  readonly approvedPlanSha256: string;
  readonly canonicalProfile: string;
  readonly engineManifestSha256: string;
  readonly expectedClaimIds: readonly string[];
  readonly expectedSubjects: readonly TrustedSubjectDigest[];
  readonly protocolVersion: number;
  readonly registryVersion: number;
  readonly requirementRevision: string;
  readonly requireFreshChallenge: boolean;
  readonly runnerManifestSha256: string;
};

/** Caller-owned signer invoked with the exact DSSE PAE bytes after complete-result validation. @public */
export type TrustedEvaluationSigner = {
  readonly sign: (payload: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
};

/** Independently supplied identities and limits accepted by the evaluator and offline verifier. @public */
export type TrustedVerifierPolicy = TrustedInputDescription & {
  readonly cacheMode: 'disabled';
  readonly evaluatorId: string;
  readonly evaluatorMode: string;
  readonly expectedJobChallenge: string;
  readonly maxArtifactBytes: 67_108_864;
  readonly maxEnvelopeBytes: 4_194_304;
  readonly numericProfile: string;
  readonly payloadType: 'application/vnd.in-toto+json';
  readonly predicateType: 'https://taucad.dev/attestation/geospec-trusted-evaluation/v2';
  readonly publicKeyPem: string;
  readonly schema: 'geospec-trusted-verifier-policy-v2';
  readonly trustedKeyId: string;
};

/** Inputs for one approved signed native evaluation. @public */
export type TrustedEvaluationOptions = {
  readonly jobChallenge: string;
  readonly outputDirectory: string;
  readonly planPath: string;
  readonly productRoot: string;
  readonly signer: TrustedEvaluationSigner;
  readonly verificationPolicy: TrustedVerifierPolicy;
};

/** Statuses that may appear in a complete signed evaluation. @public */
export type TrustedClaimStatus = 'failed' | 'passed' | 'refused';

/** One observed native result in approved claim order. @public */
export type TrustedClaimInventory = {
  readonly canonicalClaimSha256: string;
  readonly canonicalResultSha256: string;
  readonly claimId: string;
  readonly ordinal: number;
  readonly polarity: 'negative' | 'positive';
  readonly status: TrustedClaimStatus;
};

/** Result returned after writing and signing a complete evaluation record. @public */
export type TrustedEvaluationResult = {
  readonly artifacts: number;
  readonly cacheMode: 'disabled';
  readonly claims: readonly TrustedClaimInventory[];
  readonly envelopeSha256: string;
  readonly output: string;
  readonly scope: 'authenticated-complete-record-not-independent-geometry-proof';
  readonly statementSha256: string;
};

/** Declarative file input accepted by the trusted-evaluation CLI. @public */
export type TrustedEvaluationRequest = {
  readonly jobChallenge: string;
  readonly outputDirectory: string;
  readonly planPath: string;
  readonly privateKeyPath: string;
  readonly productRoot: string;
  readonly schema: 'geospec-trusted-evaluation-request-v1';
  readonly verificationPolicyPath: string;
};

/**
 * Derive exact identities for an authority-supplied verification policy.
 *
 * @param options - Installed product and immutable approved-plan paths.
 * @returns Exact identities observed before evaluation.
 * @public
 */
export declare const describeTrustedInputs: (options: DescribeTrustedInputsOptions) => TrustedInputDescription;

/**
 * Evaluate one approved declarative plan and sign its complete result.
 *
 * @param options - Product, plan, output, challenge, signer, and pinned policy.
 * @returns The signed-record location, hashes, and observed claim inventory.
 * @public
 */
export declare const evaluateTrustedPlan: (options: TrustedEvaluationOptions) => Promise<TrustedEvaluationResult>;
