/**
 * Type-safe product event emitters for workspace + webaccess project
 * lifecycle (Audit R20). Centralises event names, property shapes, and
 * the noop fallback when analytics is unavailable.
 *
 * Every event includes `workspaceId` when known and `reason` for failure
 * paths so the metrics dashboards can distinguish "missing" vs
 * "permission" vs "unsupported" gates.
 *
 * The app owns analytics and error reporting; it injects both through
 * {@link createWorkspaceTelemetry} and binds the React hook.
 */

import type { ExternalPollTelemetry } from '@taucad/fs-client/file-tree-service';

export const workspaceEventName = {
  created: 'workspace.created',
  connected: 'workspace.connected',
  permissionRevoked: 'workspace.permission_revoked',
  swap: 'workspace.swap',
  openFailed: 'workspace.open_failed',
  unmountFailed: 'workspace.unmount_failed',
  projectCreateWebaccessBlocked: 'project.create.webaccess_blocked',
  externalPoll: 'workspace.external_poll',
  rootSkipped: 'workspace.root_skipped',
  connection: 'workspace.connection',
} as const;

export type WorkspaceEventName = (typeof workspaceEventName)[keyof typeof workspaceEventName];

type WorkspaceFailureReason = 'missing' | 'disconnected' | 'permission' | 'unsupported' | 'aborted' | 'unknown';

/** The product-analytics surface the app injects; `capture` may be absent on a noop stub. */
export type WorkspaceAnalytics = {
  readonly capture?: (event: string, properties?: Readonly<Record<string, unknown>>) => void;
};

/** The tags a workspace failure is reported with (SB4). */
export type WorkspaceFailureDetails = {
  readonly tags: { readonly code: string; readonly subject: 'workspace'; readonly operation: 'open' | 'unmount' };
};

/** The app's error reporter. It must not throw; telemetry callers do not await it. */
export type WorkspaceFailureReporter = (error: unknown, details: WorkspaceFailureDetails) => void;

export type WorkspaceTelemetry = {
  readonly workspaceCreated: (input: { readonly workspaceId: string }) => void;
  readonly workspaceConnected: (input: { readonly workspaceId: string }) => void;
  readonly workspacePermissionRevoked: (input: { readonly workspaceId: string }) => void;
  readonly workspaceSwap: (input: {
    readonly previousWorkspaceId: string | undefined;
    readonly nextWorkspaceId: string;
  }) => void;
  /**
   * A workspace could not be opened. `error`, when the failure threw one, also goes to error reporting (SB4); the
   * product event keeps the outcome fields only.
   */
  readonly workspaceOpenFailed: (input: {
    readonly workspaceId: string | undefined;
    readonly reason: WorkspaceFailureReason;
    readonly error?: unknown;
  }) => void;
  /**
   * Emitted when an explicit unmount call fails — for example the
   * provider's `dispose()` throws while flushing pending writes (Audit
   * Finding 10). `workspaceId` is only present for webaccess mounts
   * because indexeddb / opfs mounts have no per-workspace identity.
   */
  readonly workspaceUnmountFailed: (input: {
    readonly workspaceId: string | undefined;
    readonly prefix: string;
    readonly reason: 'dispose-failed' | 'unknown';
    readonly error?: unknown;
  }) => void;
  readonly projectCreateWebaccessBlocked: (input: { readonly reason: WorkspaceFailureReason }) => void;
  readonly workspaceExternalPoll: (input: ExternalPollTelemetry) => void;
  /**
   * A configured workspace was left out of the worker's route topology
   * because its handle is gone or its permission is no longer granted
   * (R13). Previously a bare `continue` with no signal at all.
   */
  readonly workspaceRootSkipped: (input: {
    readonly workspaceId: string;
    readonly reason: Extract<WorkspaceFailureReason, 'disconnected' | 'permission'>;
  }) => void;
  readonly workspaceConnection: (input: {
    readonly operationId: string;
    readonly workspaceId: string | undefined;
    readonly outcome: 'ready' | 'failed';
    readonly totalMs: number;
    readonly registeringDuration: number;
    readonly mountingDuration: number;
    readonly catalogDuration: number;
    readonly publishingDuration: number;
    readonly candidateCount: number;
    readonly projectCount: number;
    readonly conflictCount: number;
  }) => void;
};

/**
 * Build the workspace emitters over the app's analytics and error reporter.
 *
 * @param options - The injected app services.
 * @param options.analytics - Product analytics; a missing `capture` makes every event a noop.
 * @param options.reportFailure - Receives the error a workspace failure threw, tagged with its `code`, `subject` and `operation`.
 * @returns The workspace telemetry emitters.
 */
export const createWorkspaceTelemetry = ({
  analytics,
  reportFailure,
}: {
  readonly analytics: WorkspaceAnalytics;
  readonly reportFailure: WorkspaceFailureReporter;
}): WorkspaceTelemetry => {
  const emit = (name: WorkspaceEventName, properties: Record<string, unknown>): void => {
    if (typeof analytics.capture !== 'function') {
      return;
    }
    analytics.capture(name, properties);
  };

  const reportWorkspaceFailure = (error: unknown, operation: 'open' | 'unmount', code: string): void => {
    if (error === undefined) {
      return;
    }
    reportFailure(error, { tags: { code, subject: 'workspace', operation } });
  };

  return {
    workspaceCreated: ({ workspaceId }) => {
      emit(workspaceEventName.created, { workspaceId });
    },
    workspaceConnected: ({ workspaceId }) => {
      emit(workspaceEventName.connected, { workspaceId });
    },
    workspacePermissionRevoked: ({ workspaceId }) => {
      emit(workspaceEventName.permissionRevoked, { workspaceId });
    },
    workspaceSwap: ({ previousWorkspaceId, nextWorkspaceId }) => {
      emit(workspaceEventName.swap, { previousWorkspaceId, nextWorkspaceId });
    },
    workspaceOpenFailed: ({ workspaceId, reason, error }) => {
      emit(workspaceEventName.openFailed, { workspaceId, reason });
      reportWorkspaceFailure(error, 'open', reason);
    },
    workspaceUnmountFailed: ({ workspaceId, prefix, reason, error }) => {
      emit(workspaceEventName.unmountFailed, { workspaceId, prefix, reason });
      reportWorkspaceFailure(error, 'unmount', reason);
    },
    projectCreateWebaccessBlocked: ({ reason }) => {
      emit(workspaceEventName.projectCreateWebaccessBlocked, { reason });
    },
    workspaceExternalPoll: (aggregate) => {
      emit(workspaceEventName.externalPoll, aggregate);
    },
    workspaceRootSkipped: ({ workspaceId, reason }) => {
      emit(workspaceEventName.rootSkipped, { workspaceId, reason });
    },
    workspaceConnection: (aggregate) => {
      emit(workspaceEventName.connection, aggregate);
    },
  };
};
