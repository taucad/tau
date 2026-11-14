/**
 * `environment`'s memory release (B-08), moved from `use-memory-release` (A5b): on a constrained device, hiding the
 * page, `pagehide` (iOS may never fire `visibilitychange` before a kill), a change to the constrained class and
 * leaving the project ask the registry to release every project but the one focus is on. Elsewhere nothing is
 * released (I22).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { AnyActorRef } from 'xstate';
import { createEnvironmentLogic } from '#runtime/environment.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';

type FocusRequest = Readonly<{ projectId?: string; home?: boolean }> | undefined;

/** A stand-in for focus: its snapshot's request, and the subscribers `environment` adds. */
const createFakeFocus = (initial: FocusRequest) => {
  let request = initial;
  const listeners = new Set<() => void>();
  const ref = {
    getSnapshot: () => ({ context: { request } }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
  };
  return {
    ref: ref as unknown as AnyActorRef,
    route: (next: FocusRequest) => {
      request = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

const start = ({ coarse, projectId }: Readonly<{ coarse: boolean; projectId?: string }>) => {
  const host = createFakeEnvironmentHost({ coarse });
  const send = vi.fn();
  const focus = createFakeFocus(projectId === undefined ? undefined : { projectId });
  const actor = createActor(
    createEnvironmentLogic(() => host),
    {
      input: {
        /* The quit hold listens for `quiesced`; these rows never quit. */
        registry: { send, on: () => ({ unsubscribe: () => undefined }) } as unknown as AnyActorRef,
        focus: focus.ref,
      },
    },
  ).start();
  stops.push(() => {
    actor.stop();
  });
  return { host, send, focus };
};

describe('environment: the memory release (B-08)', () => {
  it('should release every project but the focused one when a constrained page is hidden', () => {
    const { host, send } = start({ coarse: true, projectId: 'projA' });

    host.setVisibility('hidden');

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
  });

  it('should release on pagehide as well, since iOS may never fire visibilitychange before a kill', () => {
    const { host, send } = start({ coarse: true, projectId: 'projA' });

    host.window.dispatchEvent(new Event('pagehide'));

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
  });

  it('should release the project left behind when a constrained device leaves the editor (D-MEAS-05)', () => {
    const { send, focus } = start({ coarse: true, projectId: 'projA' });

    focus.route({ home: true });

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory' });
  });

  it('should release once the device becomes constrained, keeping the focused project', () => {
    const { host, send } = start({ coarse: false, projectId: 'projA' });

    host.setCoarsePointer(true);

    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
  });

  it('should leave desktop-class browsers alone: hiding, pagehide and navigation never close a project (I22)', () => {
    const { host, send, focus } = start({ coarse: false, projectId: 'projA' });

    focus.route({ home: true });
    host.setVisibility('hidden');
    host.window.dispatchEvent(new Event('pagehide'));

    expect(send).not.toHaveBeenCalled();
  });
});
