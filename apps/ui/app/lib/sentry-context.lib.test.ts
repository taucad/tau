// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag and context names are wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

const environment = vi.hoisted(() => ({ TAU_DEPLOY_CONTEXT: 'deploy-preview' as string | undefined }));
vi.mock('#environment.config.js', () => ({ ENV: environment }));
vi.mock('#lib/build-identity.js', () => ({ readBuildId: () => 1_792_730_113_029 }));
const device = vi.hoisted(() => ({ constrained: true }));
vi.mock('#lib/device-memory-class.js', () => ({ isMemoryConstrainedDevice: () => device.constrained }));
type Counts = { readonly liveProjectCount: number; readonly chatCount: number };
const counts = vi.hoisted((): { value: Counts | undefined } => ({ value: { liveProjectCount: 2, chatCount: 5 } }));
vi.mock('#lib/memory-kill-signal.js', () => ({ readDocumentSessionCounts: () => counts.value }));

const { applyTauEventContext, readRouteId, setReportedUserId } = await import('#lib/sentry-context.lib.js');

type RouterWindow = Window & { __reactRouterDataRouter?: unknown };

afterEach(() => {
  delete (globalThis.window as RouterWindow).__reactRouterDataRouter;
  setReportedUserId(undefined);
  environment.TAU_DEPLOY_CONTEXT = 'deploy-preview';
});

const publishRouter = (ids: readonly string[]): void => {
  (globalThis.window as RouterWindow).__reactRouterDataRouter = {
    state: { matches: ids.map((id) => ({ route: { id } })) },
  };
};

const event = (patch: Partial<ErrorEvent> = {}): ErrorEvent => ({ type: undefined, ...patch });

describe('applyTauEventContext', () => {
  it('should tag the route, device class, build and deploy context', () => {
    publishRouter(['root', 'routes/w.$workspace', 'routes/w.$workspace.$project']);

    expect(applyTauEventContext(event()).tags).toStrictEqual({
      route: 'routes/w.$workspace.$project',
      device_class: 'constrained',
      build_id: '1792730113029',
      deploy_context: 'deploy-preview',
    });
  });

  it('should leave a value it cannot read absent rather than guess, and keep the tags an event has', () => {
    environment.TAU_DEPLOY_CONTEXT = undefined;
    device.constrained = false;

    const { tags } = applyTauEventContext(event({ tags: { device_class: 'from-event', e2e_run: 'e2e-1' } }));

    expect(tags).toStrictEqual({ device_class: 'from-event', build_id: '1792730113029', e2e_run: 'e2e-1' });
    expect(readRouteId()).toBeUndefined();
    device.constrained = true;
  });

  it('should add tau.device and tau.session beside the contexts the SDK set, without tau.memory', () => {
    const { contexts } = applyTauEventContext(event({ contexts: { browser: { name: 'Chrome' } } }));

    expect(contexts?.['browser']).toStrictEqual({ name: 'Chrome' });
    expect(contexts?.['tau.device']).toMatchObject({
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: `${String(globalThis.innerWidth)}x${String(globalThis.innerHeight)}`,
    });
    expect(contexts?.['tau.session']).toMatchObject({ liveProjectCount: 2, chatCount: 5, visibility: 'visible' });
    expect(contexts?.['tau.session']?.['uptimeSeconds']).toEqual(expect.any(Number));
    expect(contexts).not.toHaveProperty('tau.memory');
  });

  it('should leave session counts absent before the reporter has any', () => {
    counts.value = undefined;

    expect(applyTauEventContext(event()).contexts?.['tau.session']).not.toHaveProperty('chatCount');
    counts.value = { liveProjectCount: 2, chatCount: 5 };
  });

  it('should carry the opaque user id while one is set, and nothing once it is cleared', () => {
    setReportedUserId('usr_opaque123');
    expect(applyTauEventContext(event()).user).toStrictEqual({ id: 'usr_opaque123' });

    setReportedUserId(undefined);
    expect(applyTauEventContext(event())).not.toHaveProperty('user');
  });
});
