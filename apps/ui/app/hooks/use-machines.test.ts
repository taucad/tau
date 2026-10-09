// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { entry } from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { mock } from 'vitest-mock-extended';
import type { MachineChannelClient, MachineClient, MachineDirectorySnapshot } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import {
  createMachinesFacet,
  printersInUseElsewhere,
  projectMachineDirectoryFrame,
  useMachineDirectory,
  useMachinesFacet,
} from '#hooks/use-machines.js';

const state = vi.hoisted(() => ({ bridge: undefined as unknown }));
vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: () => state.bridge }));

const snapshot: MachineDirectorySnapshot = {
  cursor: { hostId: 'host', authorityId: 'authority', generation: 'g1', position: 0, revision: 0 },
  entries: [],
};

/** One channel to the host over its own port, answering `list`. */
const openChannel = () => {
  const { port1, port2 } = new MessageChannel();
  const client = mock<MachineChannelClient>();
  Object.assign(client, { ready: Promise.resolve() });
  client.list.mockResolvedValue(snapshot);
  return { port: port1, farEnd: port2, client };
};

const available = (facet: RuntimeTransportFacet<MachineClient>): MachineClient => {
  if (!facet.available) {
    throw new Error('expected an available facet');
  }
  return facet;
};

describe('createMachinesFacet', () => {
  it('should dial on the first call, not before, and share one channel between callers', async () => {
    const { port, client } = openChannel();
    const dial = vi.fn(async () => port);
    const facet = available(createMachinesFacet({ dial, connect: async () => client }));
    expect(dial).not.toHaveBeenCalled();

    await Promise.all([facet.list({}), facet.list({})]);

    expect(dial).toHaveBeenCalledOnce();
    expect(client.list).toHaveBeenCalledTimes(2);
  });

  it('should dial again once the far end closes the port', async () => {
    const first = openChannel();
    const second = openChannel();
    const dial = vi
      .fn<() => Promise<MessagePort>>()
      .mockResolvedValueOnce(first.port)
      .mockResolvedValueOnce(second.port);
    const facet = available(
      createMachinesFacet({ dial, connect: async (port) => (port === first.port ? first.client : second.client) }),
    );
    await facet.list({});
    // The facet listened first, so it has forgotten the channel by the time this resolves.
    const closed = new Promise((resolve) => {
      first.port.addEventListener('close', resolve, { once: true });
    });

    first.farEnd.close();
    await closed;
    await facet.list({});

    expect(dial).toHaveBeenCalledTimes(2);
    expect(second.client.list).toHaveBeenCalledOnce();
  });

  it('should dial again after a channel failed to open', async () => {
    const { port, client } = openChannel();
    const dial = vi
      .fn<() => Promise<MessagePort>>()
      .mockRejectedValueOnce(new Error('services unavailable'))
      .mockResolvedValueOnce(port);
    const facet = available(createMachinesFacet({ dial, connect: async () => client }));

    await expect(facet.list({})).rejects.toThrow('services unavailable');
    await expect(facet.list({})).resolves.toBe(snapshot);
    expect(dial).toHaveBeenCalledTimes(2);
  });

  it('should word a store held by another app, from either code, and pass every other failure through', async () => {
    const { port, client } = openChannel();
    const facet = available(createMachinesFacet({ dial: async () => port, connect: async () => client }));
    const owned = new Error('MACHINE_STORE_OWNED_ELSEWHERE');
    client.list.mockRejectedValueOnce(owned).mockRejectedValueOnce(new Error('AUTHORITY_ALREADY_OWNED'));
    const other = new Error('MACHINE_DIRECTORY_UNKNOWN_MACHINE');
    client.get.mockRejectedValueOnce(other);
    // oxlint-disable-next-line require-yield -- a watch that fails before its first frame.
    client.watch.mockImplementation(async function* () {
      throw new Error('AUTHORITY_ALREADY_OWNED');
    });

    await expect(facet.list({})).rejects.toMatchObject({ message: printersInUseElsewhere, cause: owned });
    await expect(facet.list({})).rejects.toThrow(printersInUseElsewhere);
    await expect(facet.get({ machineId: 'workshop-x1c' })).rejects.toBe(other);
    const frames = async (): Promise<void> => {
      for await (const _frame of facet.watch({})) {
        // A failing watch yields nothing.
      }
    };
    await expect(frames()).rejects.toThrow(printersInUseElsewhere);
  });
});

describe('useMachineDirectory', () => {
  it('should clear its error and dial again on Refresh after the host could not be reached', async () => {
    const { port, client } = openChannel();
    client.listProviders.mockResolvedValue([]);
    // oxlint-disable-next-line require-yield -- a watch that only ends on abort yields nothing.
    client.watch.mockImplementation(async function* ({ signal }) {
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            resolve();
          },
          { once: true },
        );
      });
    });
    const dial = vi
      .fn<() => Promise<MessagePort>>()
      .mockRejectedValueOnce(new Error('services unavailable'))
      .mockResolvedValueOnce(port);
    const facet = available(createMachinesFacet({ dial, connect: async () => client }));
    const { result } = renderHook(() => useMachineDirectory(facet));
    await waitFor(() => {
      expect(result.current.error).toBe('services unavailable');
    });

    act(() => {
      result.current.refresh();
    });

    expect(result.current.error).toBeUndefined();
    await waitFor(() => {
      expect(result.current.snapshot).toBe(snapshot);
    });
    expect(dial).toHaveBeenCalledTimes(2);
  });
});

describe('useMachinesFacet', () => {
  it('should be unsupported on the web, and one facet per document on the desktop, whether or not a project is open', () => {
    state.bridge = undefined;
    const web = renderHook(() => useMachinesFacet());
    expect(web.result.current).toEqual({ available: false, reason: 'unsupported' });

    const connect = vi.fn();
    state.bridge = { machines: { connect } };
    const first = renderHook(() => useMachinesFacet());
    const second = renderHook(() => useMachinesFacet());

    expect(first.result.current.available).toBe(true);
    expect(second.result.current).toBe(first.result.current);
    // Nothing dials until a caller uses the facet.
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('machine identity across telemetry', () => {
  it('preserves order when either printer updates and appends a new machine', () => {
    const x1 = entry({ machineId: 'x1' });
    const mini = entry({ machineId: 'mini' });
    let directory: MachineDirectorySnapshot = { ...snapshot, entries: [x1, mini] };
    for (const machineId of ['mini', 'x1', 'mini', 'x1']) {
      const updated = entry({ machineId, name: `${machineId} updated` });
      directory = projectMachineDirectoryFrame(directory, {
        type: 'event',
        cursor: snapshot.cursor,
        event: {
          hostId: 'host',
          authorityId: 'authority',
          revision: 1,
          type: 'machine-directory-upserted',
          entry: updated,
        },
      });
      expect(directory.entries.map((candidate) => candidate.machineId)).toEqual(['x1', 'mini']);
      expect(directory.entries.find((candidate) => candidate.machineId === machineId)).toBe(updated);
    }
    const added = entry({ machineId: 'third' });
    expect(
      projectMachineDirectoryFrame(directory, {
        type: 'event',
        cursor: snapshot.cursor,
        event: {
          hostId: 'host',
          authorityId: 'authority',
          revision: 1,
          type: 'machine-directory-upserted',
          entry: added,
        },
      }).entries.map((candidate) => candidate.machineId),
    ).toEqual(['x1', 'mini', 'third']);
  });

  it('folds an observed frame into its machine without moving the cursor', () => {
    const x1 = entry({ machineId: 'x1' });
    const mini = entry({ machineId: 'mini' });
    const [first, ...rest] = x1.snapshot.components;
    const moved = { ...first!, receivedAt: '2026-09-24T02:00:09.000Z' };
    const directory = projectMachineDirectoryFrame(
      { ...snapshot, entries: [x1, mini] },
      { type: 'observed', machineId: 'x1', observedAt: '2026-09-24T02:00:09.000Z', components: [moved] },
    );
    expect(directory.cursor).toBe(snapshot.cursor);
    const [folded, untouched] = directory.entries;
    expect(folded?.snapshot.observedAt).toBe('2026-09-24T02:00:09.000Z');
    expect(folded?.snapshot.components).toEqual(expect.arrayContaining([moved, ...rest]));
    expect(folded?.snapshot.components).toHaveLength(x1.snapshot.components.length);
    expect(untouched).toBe(mini);
  });

  it('shares an explicit selection between mounted panes within one project only', () => {
    const entries = [entry({ machineId: 'x1' }), entry({ machineId: 'mini' })];
    const panes = renderHook(() => ({
      print: useMachinesSelection('selection-sync', entries),
      preview: useMachinesSelection('selection-sync', entries),
      other: useMachinesSelection('selection-other', entries),
    }));
    act(() => {
      panes.result.current.print.select('mini');
    });
    expect(panes.result.current.preview.selected?.machineId).toBe('mini');
    expect(panes.result.current.other.selected?.machineId).toBe('x1');
    panes.unmount();
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Node26/jsdom can omit storage; the selection owner intentionally supports that environment.
    globalThis.localStorage?.removeItem('tau:print:selected-machine:selection-sync');
  });
});
