/**
 * Type-safe PostHog event emitters for workspace + webaccess project
 * lifecycle (Audit R20). Centralises event names, property shapes, and
 * the noop fallback when analytics is unavailable.
 *
 * Every event includes `workspaceId` when known and `reason` for failure
 * paths so the metrics dashboards can distinguish "missing" vs
 * "permission" vs "unsupported" gates.
 */

import { useMemo } from 'react';
import { useAnalytics } from '#hooks/use-analytics.js';
import type { Analytics } from '#hooks/use-analytics.js';
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

export type WorkspaceTelemetry = {
  readonly workspaceCreated: (input: { readonly workspaceId: string }) => void;
  readonly workspaceConnected: (input: { readonly workspaceId: string }) => void;
  readonly workspacePermissionRevoked: (input: { readonly workspaceId: string }) => void;
  readonly workspaceSwap: (input: {
    readonly previousWorkspaceId: string | undefined;
    readonly nextWorkspaceId: string;
  }) => void;
  readonly workspaceOpenFailed: (input: {
    readonly workspaceId: string | undefined;
    readonly reason: WorkspaceFailureReason;
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

const emit = (analytics: Analytics, name: WorkspaceEventName, properties: Record<string, unknown>): void => {
  if (typeof analytics.capture !== 'function') {
    return;
  }
  analytics.capture(name, properties);
};

export const buildWorkspaceTelemetry = (analytics: Analytics): WorkspaceTelemetry => ({
  workspaceCreated: ({ workspaceId }) => {
    emit(analytics, workspaceEventName.created, { workspaceId });
  },
  workspaceConnected: ({ workspaceId }) => {
    emit(analytics, workspaceEventName.connected, { workspaceId });
  },
  workspacePermissionRevoked: ({ workspaceId }) => {
    emit(analytics, workspaceEventName.permissionRevoked, { workspaceId });
  },
  workspaceSwap: ({ previousWorkspaceId, nextWorkspaceId }) => {
    emit(analytics, workspaceEventName.swap, { previousWorkspaceId, nextWorkspaceId });
  },
  workspaceOpenFailed: ({ workspaceId, reason }) => {
    emit(analytics, workspaceEventName.openFailed, { workspaceId, reason });
  },
  workspaceUnmountFailed: ({ workspaceId, prefix, reason }) => {
    emit(analytics, workspaceEventName.unmountFailed, { workspaceId, prefix, reason });
  },
  projectCreateWebaccessBlocked: ({ reason }) => {
    emit(analytics, workspaceEventName.projectCreateWebaccessBlocked, { reason });
  },
  workspaceExternalPoll: (aggregate) => {
    emit(analytics, workspaceEventName.externalPoll, aggregate);
  },
  workspaceRootSkipped: ({ workspaceId, reason }) => {
    emit(analytics, workspaceEventName.rootSkipped, { workspaceId, reason });
  },
  workspaceConnection: (aggregate) => {
    emit(analytics, workspaceEventName.connection, aggregate);
  },
});

export const useWorkspaceTelemetry = (): WorkspaceTelemetry => {
  const analytics = useAnalytics();
  return useMemo(() => buildWorkspaceTelemetry(analytics), [analytics]);
};
