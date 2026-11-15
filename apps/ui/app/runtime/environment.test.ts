/**
 * `environment`'s memory release (B-08), moved from `use-memory-release` (A5b): on a constrained device, hiding the
 * page, `pagehide` (iOS may never fire `visibilitychange` before a kill), a change to the constrained class and
 * leaving the project ask the registry to release every project but the one focus is on. Elsewhere nothing is
 * released (I22).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { AnyActorRef } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { createEnvironmentLogic, createUnloadSequencer } from '#runtime/environment.js';
import type { OwedWritesPort } from '#runtime/environment.js';
import { createFakeEnvironmentHost } from '#runtime/environment.fixture.js';

type FocusRequest = Readonly<{ projectId?: string; home?: boolean }> | undefined;

/** A stand-in for focus: its snapshot's request, and the subscribers `environment` adds. */
const createFakeFocus = (initial: FocusRequest) => {
  let request = initial;
  const listeners = new Set<() => void>();
  const ref = mock<AnyActorRef>();
  ref.getSnapshot.mockImplementation(() => ({ context: { request } }));
  ref.subscribe.mockImplementation((listener) => {
    /* `environment` subscribes with a plain listener and reads the request from the snapshot itself; an observer
     * object is not a shape it uses, so it is never notified here. */
    const notify =
      typeof listener === 'function'
        ? (): void => {
            listener(ref.getSnapshot());
          }
        : (): void => undefined;
    listeners.add(notify);
    return {
      unsubscribe: () => {
        listeners.delete(notify);
      },
    };
  });
  return {
    ref,
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

const start = ({
  coarse,
  projectId,
  sequencer,
  owedWrites,
}: Readonly<{
  coarse: boolean;
  projectId?: string;
  sequencer?: ReturnType<typeof createUnloadSequencer>;
  owedWrites?: OwedWritesPort;
}>) => {
  const host = createFakeEnvironmentHost({ coarse });
  const registry = mock<AnyActorRef>();
  /* The quit hold listens for `quiesced`; these rows never quit. */
  registry.on.mockReturnValue({ unsubscribe: () => undefined });
  const { send } = registry;
  const focus = createFakeFocus(projectId === undefined ? undefined : { projectId });
  const actor = createActor(
    createEnvironmentLogic(() => host, { sequencer, owedWrites }),
    { input: { registry, focus: focus.ref } },
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

  it('should run every session flush and still release memory on pagehide when one registrant throws', () => {
    const sequencer = createUnloadSequencer();
    const later = vi.fn();
    sequencer.register('session', () => {
      throw new Error('flush failed');
    });
    sequencer.register('session', later);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { host, send } = start({ coarse: true, projectId: 'projA', sequencer });

    host.window.dispatchEvent(new Event('pagehide'));

    expect(later).toHaveBeenCalledWith('pagehide');
    expect(send).toHaveBeenCalledWith({ type: 'releaseMemory', keepProjectId: 'projA' });
    errors.mockRestore();
  });

  it('should log a session whose pagehide flush rejects, as every registrant through useFlushOnClose is async', async () => {
    const sequencer = createUnloadSequencer();
    const later = vi.fn();
    sequencer.register('session', async () => {
      throw new Error('port closed');
    });
    sequencer.register('session', later);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    sequencer.pagehide();
    await vi.waitFor(() => {
      expect(errors).toHaveBeenCalledWith('A session could not flush on pagehide.', expect.any(Error));
    });

    expect(later).toHaveBeenCalledWith('pagehide');
    errors.mockRestore();
  });

  it('should offer every session its pagehide flush before the memory release closes any (round 8)', () => {
    const order: string[] = [];
    const sequencer = createUnloadSequencer();
    sequencer.register('session', async (phase) => {
      order.push(`flush:${phase}`);
    });
    const { host, send } = start({ coarse: true, projectId: 'projA', sequencer });
    send.mockImplementation((event: { type: string }) => {
      order.push(event.type);
    });

    host.window.dispatchEvent(new Event('pagehide'));

    expect(order).toEqual(['flush:pagehide', 'releaseMemory']);
  });
});

/** A stand-in for the page's owed record writes: the row says whether one is owed and when that changes. */
const createOwedWrites = (initial: boolean) => {
  let owes = initial;
  const listeners = new Set<() => void>();
  const port: OwedWritesPort = {
    owes: () => owes,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    port,
    set: (next: boolean) => {
      owes = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

describe('environment: the beforeunload producer stage (D26 as amended, A7c)', () => {
  it('should run the producer stage and no session stage on beforeunload while a write is owed, and never prompt', async () => {
    const sequencer = createUnloadSequencer();
    const producer = vi.fn(async () => undefined);
    const session = vi.fn(async () => undefined);
    sequencer.register('producer', producer);
    sequencer.register('session', session);
    const { host } = start({ coarse: false, sequencer, owedWrites: createOwedWrites(true).port });
    const event = new Event('beforeunload', { cancelable: true });

    host.window.dispatchEvent(event);
    await vi.waitFor(() => {
      expect(producer).toHaveBeenCalledWith('hidden');
    });

    expect(session).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('should hold no beforeunload listener while nothing is owed, and drop it once the owed write settles', () => {
    const owed = createOwedWrites(false);
    const { host } = start({ coarse: false, sequencer: createUnloadSequencer(), owedWrites: owed.port });

    expect(host.listeners()).not.toContain('window:beforeunload');

    owed.set(true);

    expect(host.listeners()).toContain('window:beforeunload');

    owed.set(false);

    expect(host.listeners()).not.toContain('window:beforeunload');
  });

  it('should take its beforeunload listener away when it stops while a write is owed', () => {
    const owed = createOwedWrites(true);
    const host = createFakeEnvironmentHost();
    const actor = createActor(
      createEnvironmentLogic(() => host, { owedWrites: owed.port }),
      {
        input: undefined,
      },
    ).start();

    expect(host.listeners()).toContain('window:beforeunload');

    actor.stop();

    expect(host.listeners()).not.toContain('window:beforeunload');
  });
});
