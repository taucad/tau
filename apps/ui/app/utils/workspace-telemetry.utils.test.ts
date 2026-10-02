import { describe, expect, it, vi } from 'vitest';
import { buildWorkspaceTelemetry, workspaceEventName } from '#utils/workspace-telemetry.utils.js';
import type { Analytics } from '#hooks/use-analytics.js';

const makeAnalyticsStub = () => {
  const capture = vi.fn();
  return {
    analytics: { capture } as unknown as Analytics,
    capture,
  };
};

describe('buildWorkspaceTelemetry', () => {
  it('emits workspace.created with workspaceId + isDefault', () => {
    const { analytics, capture } = makeAnalyticsStub();
    const telemetry = buildWorkspaceTelemetry(analytics);

    telemetry.workspaceCreated({ workspaceId: 'wsp_abc', isDefault: true });

    expect(capture).toHaveBeenCalledWith(workspaceEventName.created, {
      workspaceId: 'wsp_abc',
      isDefault: true,
    });
  });

  it('emits workspace.connected', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).workspaceConnected({ workspaceId: 'wsp_xyz' });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.connected, { workspaceId: 'wsp_xyz' });
  });

  it('emits workspace.swap with previous + next ids', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).workspaceSwap({
      previousWorkspaceId: 'wsp_old',
      nextWorkspaceId: 'wsp_new',
    });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.swap, {
      previousWorkspaceId: 'wsp_old',
      nextWorkspaceId: 'wsp_new',
    });
  });

  it('emits workspace.open_failed with reason', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).workspaceOpenFailed({
      workspaceId: 'wsp_abc',
      reason: 'permission',
    });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.openFailed, {
      workspaceId: 'wsp_abc',
      reason: 'permission',
    });
  });

  it('emits project.create.webaccess_blocked with reason', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).projectCreateWebaccessBlocked({ reason: 'missing' });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.projectCreateWebaccessBlocked, {
      reason: 'missing',
    });
  });

  it('emits workspace.permission_revoked', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).workspacePermissionRevoked({ workspaceId: 'wsp_abc' });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.permissionRevoked, {
      workspaceId: 'wsp_abc',
    });
  });

  // Audit Finding 10: explicit `unmount` is a fire-and-forget operation —
  // when it rejects (e.g. the worker crashed mid-call) the failure must still
  // surface as telemetry so we can track silent unmount loss in production.
  it('emits workspace.unmount_failed with prefix + reason', () => {
    const { analytics, capture } = makeAnalyticsStub();
    buildWorkspaceTelemetry(analytics).workspaceUnmountFailed({
      workspaceId: 'wsp_X',
      prefix: '/projects/proj_X',
      reason: 'dispose-failed',
    });
    expect(capture).toHaveBeenCalledWith(workspaceEventName.unmountFailed, {
      workspaceId: 'wsp_X',
      prefix: '/projects/proj_X',
      reason: 'dispose-failed',
    });
  });

  it('does not throw when analytics lacks capture (noop stub)', () => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing the PostHog `Analytics` surface as empty to exercise the noop-fallback branch
    const noopAnalytics = {} as Analytics;
    const telemetry = buildWorkspaceTelemetry(noopAnalytics);
    expect(() => {
      telemetry.workspaceCreated({ workspaceId: 'wsp_x', isDefault: false });
      telemetry.workspaceOpenFailed({ workspaceId: undefined, reason: 'unsupported' });
    }).not.toThrow();
  });
});
