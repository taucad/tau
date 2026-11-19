/**
 * The runtime root and its `deployment` child (adaptive app deployment mode charter W1, I1, I13): the root keeps the
 * mode `deployment` reports, starts from the build's initial mode, hands the child the page's visibility, focus and
 * the person's Retry, and tags error events with the mode. Unit tests run under the `cloud` ceiling, so the composed
 * runtime here is pinned funded; the adaptive composition has its own project (`*.adaptive.test.ts`).
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import type { AnyEventObject } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { appRuntimeMachine } from '#runtime/app-runtime.machine.js';
import type { DeploymentChildInput, DeploymentCommand } from '#runtime/app-runtime.machine.js';
import { createAppRuntime, describeDeploymentMode, selectDeploymentMode } from '#runtime/app-runtime.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';
import { applyTauEventContext } from '#lib/sentry-context.lib.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';
import type { DeploymentOwnerLogic } from '#runtime/deployment.js';

const idleRootFiles = { rootDirectory: '/', shouldInitializeOnStart: false, backendResolution: 'pending' } as const;

/** A `deployment` stand-in that records what the root sends it and reports on demand. */
const recordingDeployment = () => {
  const received: DeploymentCommand[] = [];
  const inputs: DeploymentChildInput[] = [];
  const logic = createCallbackLogic<DeploymentCommand, DeploymentChildInput>(({ input, receive }) => {
    inputs.push(input);
    receive((event) => {
      received.push(event);
    });
    input.parentRef.send({ type: 'deploymentChanged', mode: { state: 'unknown', problem: 'unreachable' } });
  }) as unknown as DeploymentOwnerLogic;
  return { logic, received, inputs };
};

describe('app runtime: deployment', () => {
  it('should start from the initial mode, keep what deployment reports and send it the page and Retry', () => {
    const child = recordingDeployment();
    const runtime = createActor(appRuntimeMachine.provide({ actors: { deployment: child.logic } }), {
      input: {
        sessions: {},
        rootFiles: idleRootFiles,
        deployment: { state: 'unknown', problem: 'pending' },
        safeMode: true,
      },
    });
    /* I13: before start, the server and the first client render read the initial mode. */
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unknown', problem: 'pending' });
    runtime.start();
    expect(child.inputs).toEqual([{ parentRef: runtime, visible: true, safeMode: true }]);
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unknown', problem: 'unreachable' });

    runtime.send({ type: 'visibilityChanged', visible: false });
    runtime.send({ type: 'focusChanged', focused: false });
    runtime.send({ type: 'focusChanged', focused: true });
    runtime.send({ type: 'deploymentRetried' });
    expect(child.received).toEqual<AnyEventObject[]>([
      { type: 'visibilityChanged', visible: false },
      { type: 'windowFocused' },
      { type: 'retry' },
    ]);
    runtime.send({ type: 'deploymentChanged', mode: { state: 'funded', basis: 'confirmed', environment: 'staging' } });
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({
      state: 'funded',
      basis: 'confirmed',
      environment: 'staging',
    });
    runtime.stop();
  });

  it('should default to a pinned unfunded mode when the composition passes none', () => {
    const runtime = createActor(appRuntimeMachine, { input: { sessions: {}, rootFiles: idleRootFiles } });
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({ state: 'unfunded', basis: 'pinned' });
  });

  it('should pin a cloud build funded with no request, and tag error events with the mode', () => {
    const runtime = createAppRuntime({
      clock: new StepClock(),
      environment: () => createFakeEnvironmentHost(),
      idleFileManagers: true,
    });
    expect(selectDeploymentMode(runtime.getSnapshot())).toEqual({
      state: 'funded',
      basis: 'pinned',
      environment: undefined,
    });
    runtime.start();
    expect(applyTauEventContext<{ tags?: Record<string, string> }>({}).tags?.['deployment_mode']).toBe('funded/pinned');
    runtime.stop();
  });

  it('should describe each mode as one tag value', () => {
    expect(describeDeploymentMode({ state: 'unknown', problem: 'safe-mode' })).toBe('unknown/safe-mode');
    expect(describeDeploymentMode({ state: 'unfunded', basis: 'absent' })).toBe('unfunded/absent');
  });

  it("should read the runtime's mode in render, and the build's initial mode with no runtime", () => {
    const runtime = createAppRuntime({ clock: new StepClock(), environment: () => createFakeEnvironmentHost() });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppRuntimeProvider runtime={runtime}>{children}</AppRuntimeProvider>
    );
    expect(renderHook(() => useDeploymentMode(), { wrapper }).result.current).toEqual({
      state: 'funded',
      basis: 'pinned',
      environment: undefined,
    });
    expect(renderHook(() => useDeploymentMode()).result.current).toEqual({
      state: 'funded',
      basis: 'pinned',
      environment: undefined,
    });
    runtime.stop();
  });
});
