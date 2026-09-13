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

export const workspaceEventName = {
  created: 'workspace.created',
  connected: 'workspace.connected',
  permissionRevoked: 'workspace.permission_revoked',
  swap: 'workspace.swap',
  openFailed: 'workspace.open_failed',
  unmountFailed: 'workspace.unmount_failed',
  projectCreateWebaccessBlocked: 'project.create.webaccess_blocked',
} as const;

export type WorkspaceEventName = (typeof workspaceEventName)[keyof typeof workspaceEventName];

type WorkspaceFailureReason = 'missing' | 'permission' | 'unsupported' | 'aborted' | 'unknown';

export type WorkspaceTelemetry = {
  readonly workspaceCreated: (input: { readonly workspaceId: string; readonly isDefault: boolean }) => void;
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
};

const emit = (analytics: Analytics, name: WorkspaceEventName, properties: Record<string, unknown>): void => {
  if (typeof analytics.capture !== 'function') {
    return;
  }
  analytics.capture(name, properties);
};

export const buildWorkspaceTelemetry = (analytics: Analytics): WorkspaceTelemetry => ({
  workspaceCreated: ({ workspaceId, isDefault }) => {
    emit(analytics, workspaceEventName.created, { workspaceId, isDefault });
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
});

export const useWorkspaceTelemetry = (): WorkspaceTelemetry => {
  const analytics = useAnalytics();
  return useMemo(() => buildWorkspaceTelemetry(analytics), [analytics]);
};
