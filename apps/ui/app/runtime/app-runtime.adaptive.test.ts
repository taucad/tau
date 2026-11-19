/**
 * The runtime composed under the `adaptive` ceiling (adaptive app deployment mode charter W1, W2, I1, I13, D10). Unit
 * tests run under the `cloud` ceiling, so the aliased boundary is pointed at its adaptive file here, exactly as the
 * alias rule points an adaptive build at it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { createAppRuntime, selectDeploymentMode } from '#runtime/app-runtime.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import { deploymentRecordKey } from '#runtime/deployment.js';
import { applyTauEventContext } from '#lib/sentry-context.lib.js';

vi.mock('#cloud/deployment-mode.js', async () => import('#cloud/deployment-mode.adaptive.js'));

const apiOrigin = 'http://localhost:4000';
const answer = (funded: boolean): Response =>
  Response.json(
    funded
      ? { version: 1, edition: 'cloud', billing: { funded: true, environment: 'staging' }, maxAgeSeconds: 300 }
      : { version: 1, edition: 'self-host', billing: { funded: false }, maxAgeSeconds: 300 },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const compose = (options: Readonly<{ safeMode?: boolean }> = {}) => {
  const clock = new StepClock();
  clock.set(Date.UTC(2026, 10, 19));
  return createAppRuntime({
    clock,
    environment: () => createFakeEnvironmentHost(),
    idleFileManagers: true,
    ...(options.safeMode === undefined ? {} : { safeMode: options.safeMode }),
  });
};

describe('app runtime under the adaptive ceiling', () => {
  it('should render unknown before start on both sides, and never wait for the answer (I13, I1)', async () => {
    const fetch = vi.fn(async () => Promise.withResolvers<Response>().promise);
    vi.stubGlobal('fetch', fetch);
    const runtime = compose();
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unknown', problem: 'pending' });
    expect(fetch).not.toHaveBeenCalled();
    runtime.start();
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      `${apiOrigin}/v1/deployment`,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unknown', problem: 'pending' });
    runtime.stop();
  });

  it('should start from the record, confirm it from the answer and tag error events with the mode', async () => {
    localStorage.setItem(
      deploymentRecordKey(apiOrigin),
      JSON.stringify({ version: 1, state: 'unfunded', confirmedAt: Date.UTC(2026, 10, 18) }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(true)),
    );
    const runtime = compose();
    runtime.start();
    await flush();
    await flush();
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({
      state: 'funded',
      basis: 'confirmed',
      environment: 'staging',
    });
    expect(applyTauEventContext<{ tags?: Record<string, string> }>({}).tags?.['deployment_mode']).toBe(
      'funded/confirmed',
    );
    runtime.stop();
  });

  it('should stay idle in safe mode: no record read, no request (D10)', async () => {
    const fetch = vi.fn(async () => answer(true));
    vi.stubGlobal('fetch', fetch);
    localStorage.setItem(
      deploymentRecordKey(apiOrigin),
      JSON.stringify({ version: 1, state: 'funded', environment: 'staging', confirmedAt: Date.UTC(2026, 10, 18) }),
    );
    const runtime = compose({ safeMode: true });
    runtime.start();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unknown', problem: 'safe-mode' });
    runtime.stop();
  });
});
