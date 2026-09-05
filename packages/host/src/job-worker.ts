import type { JobRunnerRegistration } from '@taucad/jobs';

import type { HostCredential } from '#credential-store.js';

/** Static task identity installed by a daemon job worker. @public */
export type HostJobTaskProfile = {
  readonly name: string;
  readonly slotCost: number;
  readonly maxAttempts: number;
  readonly executionTimeout: string;
  readonly scheduleTimeout: string;
  /** Milliseconds. */
  readonly idempotencyTtl: number;
};

/** Final closure result for a daemon-owned job worker. @public */
export type HostJobWorkerCloseResult =
  | { readonly cause: 'requested' }
  | { readonly cause: 'fatal'; readonly error: Error };

/** Lifecycle handle implemented by one daemon-owned job worker. @public */
export type HostJobWorkerHandle = {
  readonly registration: JobRunnerRegistration;
  readonly profiles: readonly HostJobTaskProfile[];
  readonly ready: Promise<void>;
  readonly closed: Promise<HostJobWorkerCloseResult>;
  /** Stop accepting attempts and wait for all active attempts to drain. */
  close(): Promise<void>;
};

/** Input passed by the daemon after its device credential is available. @public */
export type HostJobWorkerStartInput = {
  readonly apiUrl: URL;
  readonly credential: HostCredential;
};

/** Credential-aware worker factory owned by the Tau daemon. @public */
export type HostJobWorkerFactory = {
  start(input: HostJobWorkerStartInput): Promise<HostJobWorkerHandle>;
};
