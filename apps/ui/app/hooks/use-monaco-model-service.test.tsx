/**
 * Wiring tests for the geometry-unit prefetch hook.
 *
 * The full `MonacoModelServiceProvider` pulls in too many providers to
 * exercise in jsdom, so we extract `useGeometryUnitKernelPrefetch` and verify
 * its contract against a stub geometry-units map.
 */
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { registry } from '#lib/monaco-language-registry.js';
import { useGeometryUnitKernelPrefetch } from '#hooks/use-monaco-model-service.js';
import type { AppCapabilitiesManifest } from '#types/runtime-client.alias.js';

type GeometryUnits = Map<string, ActorRefFrom<typeof cadMachine>>;

const capabilities: AppCapabilitiesManifest = {
  registrations: [
    { kind: 'kernel', id: 'replicad', extensions: ['ts', 'js'] },
    { kind: 'kernel', id: 'zoo', extensions: ['kcl'] },
  ],
  routes: [],
  renderCapabilities: {},
};

type Snapshot = { context: { activeKernelId?: string; capabilities?: AppCapabilitiesManifest } };
type Listener = (snapshot: Snapshot) => void;
type StubActor = {
  subscribe: (listener: Listener) => { unsubscribe: () => void };
  __emit: (kernelId: string | undefined, nextCapabilities?: AppCapabilitiesManifest) => void;
  __unsubscribeCalls: number;
};

function createStubActor(): StubActor {
  const listeners = new Set<Listener>();
  let unsubscribeCalls = 0;
  const actor: StubActor = {
    subscribe(listener) {
      listeners.add(listener);
      return {
        unsubscribe() {
          unsubscribeCalls++;
          listeners.delete(listener);
        },
      };
    },
    __emit(kernelId, nextCapabilities = capabilities) {
      for (const listener of listeners) {
        listener({ context: { activeKernelId: kernelId, capabilities: nextCapabilities } });
      }
    },
    get __unsubscribeCalls() {
      return unsubscribeCalls;
    },
  };
  return actor;
}

describe('useGeometryUnitKernelPrefetch', () => {
  type Mock = ReturnType<typeof vi.fn<(ids: readonly string[]) => void>>;
  let prefetchSpy: Mock;
  let originalPrefetch: typeof registry.prefetch;

  beforeEach(() => {
    prefetchSpy = vi.fn<(ids: readonly string[]) => void>();
    originalPrefetch = registry.prefetch.bind(registry);
    registry.prefetch = prefetchSpy as unknown as typeof registry.prefetch;
  });

  afterEach(() => {
    registry.prefetch = originalPrefetch;
  });

  function unitsOf(...entries: ReadonlyArray<readonly [string, StubActor]>): GeometryUnits {
    return new Map<string, ActorRefFrom<typeof cadMachine>>(
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal stub satisfies the hook's actor.subscribe contract
      entries.map(([k, v]) => [k, v as unknown as ActorRefFrom<typeof cadMachine>]),
    );
  }

  it('should not subscribe when disabled', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.ts', actor]);

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, false);
    });
    actor.__emit('replicad');

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('should call registry.prefetch with mapped monaco ids when activeKernelId emits', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.ts', actor]);

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    actor.__emit('replicad');

    expect(prefetchSpy).toHaveBeenCalledTimes(1);
    const firstCall = prefetchSpy.mock.calls[0]!;
    const ids = firstCall[0];
    expect(ids).toEqual(expect.arrayContaining(['typescript', 'javascript']));
  });

  it('should not call prefetch when activeKernelId is undefined', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.ts', actor]);

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    actor.__emit(undefined);

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('should not call prefetch when kernel id has no extension mapping', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.ts', actor]);

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    actor.__emit('non-existent-kernel');

    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('should read extensions from each live capabilities snapshot', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.ts', actor]);
    const unavailable: AppCapabilitiesManifest = { registrations: [], routes: [], renderCapabilities: {} };

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    actor.__emit('replicad', unavailable);
    actor.__emit('replicad', capabilities);

    expect(prefetchSpy).toHaveBeenCalledTimes(1);
    expect(prefetchSpy).toHaveBeenCalledWith(['typescript', 'javascript']);
  });

  it('should call prefetch with kcl when the active kernel is zoo', () => {
    const actor = createStubActor();
    const units = unitsOf(['main.kcl', actor]);

    renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    actor.__emit('zoo');

    expect(prefetchSpy).toHaveBeenCalledWith(['kcl']);
  });

  it('should unsubscribe from removed geometry units across renders', () => {
    const actor = createStubActor();
    const initialUnits = unitsOf(['main.ts', actor]);

    const { rerender } = renderHook(
      ({ units }) => {
        useGeometryUnitKernelPrefetch(units, true);
      },
      {
        initialProps: { units: initialUnits },
      },
    );

    expect(actor.__unsubscribeCalls).toBe(0);

    rerender({ units: new Map<string, ActorRefFrom<typeof cadMachine>>() });

    expect(actor.__unsubscribeCalls).toBe(1);
  });

  it('should unsubscribe from every actor on unmount', () => {
    const actorA = createStubActor();
    const actorB = createStubActor();
    const units = unitsOf(['a.ts', actorA], ['b.ts', actorB]);

    const { unmount } = renderHook(() => {
      useGeometryUnitKernelPrefetch(units, true);
    });
    unmount();

    expect(actorA.__unsubscribeCalls).toBe(1);
    expect(actorB.__unsubscribeCalls).toBe(1);
  });
});
