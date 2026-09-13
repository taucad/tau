/** JSON scalar accepted by durable job contracts. @public */
// oxlint-disable-next-line typescript/no-restricted-types -- JSON null is a wire value; undefined is not valid JSON.
export type JobJsonScalar = boolean | number | string | null;

/** Recursively serializable JSON value accepted by durable job contracts. @public */
export type JobJsonValue = JobJsonScalar | JobJsonObject | readonly JobJsonValue[];

/** Serializable object used for provider-owned job options and results. @public */
export type JobJsonObject = { readonly [key: string]: JobJsonValue };

/** A scalar capability advertised by a runner. @public */
export type JobCapabilityValue = boolean | number | string;

/** A requirement evaluated against a runner's advertised capabilities. @public */
export type JobCapabilityRequirement =
  | {
      readonly key: string;
      readonly condition: 'equals';
      readonly value: JobCapabilityValue;
    }
  | {
      readonly key: string;
      readonly condition: 'one-of';
      readonly values: readonly JobCapabilityValue[];
    }
  | {
      readonly key: string;
      readonly condition: 'at-least';
      readonly value: number;
    };

/** Immutable capabilities and execution slots advertised by a job runner. @public */
export type JobRunnerRegistration = {
  readonly runnerId: string;
  readonly capabilities: Readonly<Record<string, JobCapabilityValue>>;
  readonly slots: number;
};

/** Declares one artifact a job is expected to produce. @public */
export type JobOutputDeclaration = {
  readonly role: string;
  readonly logicalPath: string;
  readonly mediaType: string;
};

/** Content-addressed input snapshot consumed by a job. @public */
export type JobInputSnapshot = {
  readonly digest: `sha256:${string}`;
  readonly size: number;
  readonly mediaType: string;
  readonly storageKey: string;
};

/**
 * Immutable, serializable definition submitted to the durable job plane.
 * Provider-owned configuration stays under `options`; scheduling fields remain framework-owned.
 *
 * @public
 */
export type JobDefinition<Options extends JobJsonObject = JobJsonObject> = {
  readonly type: string;
  readonly version: string;
  readonly input: JobInputSnapshot;
  readonly requirements: readonly JobCapabilityRequirement[];
  readonly slotCost: number;
  readonly maxAttempts: number;
  readonly options: Options;
  readonly outputs: readonly JobOutputDeclaration[];
};

/** Identity of one leased execution attempt. @public */
export type JobAttemptIdentity = {
  readonly jobId: string;
  readonly attemptId: string;
  readonly attempt: number;
  readonly runnerId: string;
};

/** A job definition leased to a compatible runner. @public */
export type JobAttemptLease = JobAttemptIdentity & {
  readonly definition: JobDefinition;
  readonly leaseExpiresAt: number;
};

/** Framework-owned provenance recorded for every output artifact. @public */
export type JobArtifactProvenance = JobAttemptIdentity & {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly inputDigest: `sha256:${string}`;
};

/** Durable manifest for one content-addressed job artifact. @public */
export type JobArtifactManifest = {
  readonly artifactId: string;
  readonly digest: `sha256:${string}`;
  readonly size: number;
  readonly mediaType: string;
  readonly role: string;
  readonly logicalPath: string;
  readonly storageKey: string;
  readonly provenance: JobArtifactProvenance;
};

/** Structured provider failure safe to persist and display. @public */
export type JobFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
};

/** Normal terminal outcome returned by a provider attempt. @public */
export type JobProviderExecutionOutcome =
  | {
      readonly status: 'completed';
      readonly artifacts: readonly JobArtifactManifest[];
      readonly result: JobJsonValue;
    }
  | { readonly status: 'cancelled'; readonly reason: string }
  | { readonly status: 'failed'; readonly failure: JobFailure };

/** Progress update emitted while a provider attempt is running. @public */
export type JobProgress = {
  readonly phase: string;
  readonly completed: number;
  readonly total: number;
  readonly message: string;
};

/** Durable lifecycle state projected for a job. @public */
export type JobState =
  | 'queued'
  | 'leased'
  | 'running'
  | 'cancellation-requested'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Current attempt projection retained with a non-terminal job. @public */
export type JobAttemptSnapshot = JobAttemptIdentity & {
  readonly state: 'leased' | 'running' | 'cancellation-requested';
  readonly leaseExpiresAt: number;
  readonly lastHeartbeatAt: number;
};

/** Queryable projection of one durable job. @public */
export type JobSnapshot = {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly definitionDigest: `sha256:${string}`;
  readonly definition: JobDefinition;
  readonly state: JobState;
  readonly sequence: number;
  readonly submittedAt: number;
  readonly attemptCount: number;
  readonly activeAttempt?: JobAttemptSnapshot;
  readonly artifacts: readonly JobArtifactManifest[];
  readonly result?: JobJsonValue;
  readonly failure?: JobFailure;
  readonly cancellationReason?: string;
};
