/* oxlint-disable typescript/no-unsafe-assignment -- Focused actor doubles intentionally expose only the consumed snapshot fields. */
// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { workbenchRecords } from '@taucad/workbench';
import type { WorkbenchEntries } from '@taucad/workbench';
import { EntriesSyncHost, EntryOwner } from '#routes/w.$workspace.$project/entries-sync-host.js';

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, select: (snapshot: unknown) => unknown) =>
    select(actor.getSnapshot()),
}));
let hostProject: Record<string, unknown>;
let hostContentService: { subscribe: (path: string, listener: () => void) => () => void } | undefined;
let liveRootOnly = false;
let selectedRoot = '/root';
let liveWatchEntries: (() => void) | undefined;
const subscribeWorkbenchRecord = (_path: string, listener: () => void): (() => void) => {
  liveWatchEntries = listener;
  return () => {
    liveWatchEntries = undefined;
  };
};
const hostFiles = vi.hoisted(() => {
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  let fail = false;
  return {
    set: (next: Uint8Array<ArrayBuffer>) => {
      bytes = next;
    },
    get: () => bytes,
    failOnce: () => {
      fail = true;
    },
    exists: async (path: string) => (!liveRootOnly || path.startsWith('/projects/p/')) && bytes !== undefined,
    readFile: async (path: string) => {
      if (liveRootOnly && !path.startsWith('/projects/p/')) {
        throw new Error('candidate entries read');
      }
      if (fail) {
        fail = false;
        throw new Error('offline');
      }
      return bytes!;
    },
    writeFileChecked: vi.fn(async ({ data }: { data: string }) => {
      bytes = new TextEncoder().encode(data);
      return { status: 'applied', content: bytes };
    }),
  };
});
vi.mock('#hooks/use-project.js', () => ({ useProject: () => hostProject }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef: { getSnapshot: () => ({ context: { rootDirectory: selectedRoot } }) },
    parameterFiles: hostFiles,
    contentService: hostContentService,
    subscribeWorkbenchRecord,
  }),
}));
vi.mock('#hooks/use-flush-on-close.js', () => ({ useFlushOnClose: () => undefined }));

describe('entry owner reconciliation', () => {
  beforeEach(() => {
    liveRootOnly = false;
    selectedRoot = '/root';
    liveWatchEntries = undefined;
  });
  it('retains and observes live entry settings after code selects a checkout', async () => {
    liveRootOnly = true;
    selectedRoot = '/projects/p';
    hostFiles.writeFileChecked.mockClear();
    hostFiles.set(
      new TextEncoder().encode(
        workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 30_000 } } }),
      ),
    );
    const setEntriesRecord = vi.fn();
    let operationTimeout = 30_000;
    const cad = {
      getSnapshot: () => ({ context: { operationTimeout } }),
      send: (event: { type: string; operationTimeout: number }) => {
        if (event.type === 'setOperationTimeout') {
          operationTimeout = event.operationTimeout;
        }
      },
    };
    hostProject = {
      projectId: 'p',
      geometryUnits: new Map([['a.ts', cad]]),
      modelInteractionRef: { getSnapshot: () => ({ context: { unitsById: {} } }) },
      entriesRecord: undefined,
      setEntriesRecord,
      registerWorkbenchRecordProducer: () => () => undefined,
      registerEntryPathChange: () => () => undefined,
      setAppliedEntryRevision: () => undefined,
    };
    hostContentService = { subscribe: () => () => undefined };
    const view = render(<EntriesSyncHost />);
    await waitFor(() => {
      expect(setEntriesRecord).toHaveBeenCalled();
    });
    selectedRoot = '/checkouts/c';
    view.rerender(<EntriesSyncHost />);
    setEntriesRecord.mockClear();
    hostFiles.set(
      new TextEncoder().encode(
        workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 45_000 } } }),
      ),
    );
    await act(async () => {
      liveWatchEntries?.();
    });
    await waitFor(() => {
      expect(setEntriesRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: { 'a.ts': expect.objectContaining({ operationTimeout: 45_000 }) },
        }),
      );
    });
    operationTimeout = 60_000;
    view.rerender(<EntriesSyncHost />);
    await waitFor(
      () => {
        expect(hostFiles.writeFileChecked).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/projects/p/.tau/workbench/entries.json',
          }),
        );
      },
      { timeout: 1600 },
    );
    view.unmount();
    liveRootOnly = false;
    selectedRoot = '/root';
  });
  it('persists an entry owner edit after first service readiness and StrictMode replay', async () => {
    hostFiles.set(
      new TextEncoder().encode(
        workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 30_000 } } }),
      ),
    );
    hostFiles.writeFileChecked.mockClear();
    hostContentService = undefined;
    let operationTimeout = 30_000;
    const cad = { getSnapshot: () => ({ context: { operationTimeout } }), send: vi.fn() };
    const model = { getSnapshot: () => ({ context: { unitsById: {} } }), send: vi.fn() };
    const acknowledged = new Map<string, string>();
    hostProject = {
      geometryUnits: new Map([['a.ts', cad]]),
      modelInteractionRef: model,
      entriesRecord: undefined,
      setEntriesRecord: (record: WorkbenchEntries) => {
        hostProject['entriesRecord'] = record;
      },
      registerWorkbenchRecordProducer: () => () => undefined,
      registerEntryPathChange: () => () => undefined,
      setAppliedEntryRevision: (path: string, digest: string | undefined) => {
        if (digest) {
          acknowledged.set(path, digest);
        } else {
          acknowledged.delete(path);
        }
      },
    };
    const view = render(
      <StrictMode>
        <EntriesSyncHost />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(acknowledged.has('a.ts')).toBe(true);
    });
    hostContentService = { subscribe: () => () => undefined };
    view.rerender(
      <StrictMode>
        <EntriesSyncHost />
      </StrictMode>,
    );
    operationTimeout = 45_000;
    view.rerender(
      <StrictMode>
        <EntriesSyncHost />
      </StrictMode>,
    );
    await waitFor(
      () => {
        expect(workbenchRecords.entries.read(hostFiles.get()!)).toMatchObject({
          status: 'current',
          record: { entries: { 'a.ts': { operationTimeout: 45_000 } } },
        });
      },
      { timeout: 1500 },
    );
    expect(hostFiles.writeFileChecked).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('does not reacknowledge stale entry bytes after a read failure and a new owner mount', async () => {
    hostFiles.set(
      new TextEncoder().encode(
        workbenchRecords.entries.serialize({ version: 1, entries: { 'a.ts': { operationTimeout: 30_000 } } }),
      ),
    );
    hostContentService = { subscribe: () => () => undefined };
    const acknowledged = new Map<string, string>();
    const setAppliedEntryRevision = vi.fn((path: string, digest: string | undefined) => {
      if (digest) {
        acknowledged.set(path, digest);
      } else {
        acknowledged.delete(path);
      }
    });
    const cad = { getSnapshot: () => ({ context: { operationTimeout: 30_000 } }), send: vi.fn() };
    const model = { getSnapshot: () => ({ context: { unitsById: {} } }), send: vi.fn() };
    const geometryUnits = new Map([['a.ts', cad]]);
    hostProject = {
      geometryUnits,
      modelInteractionRef: model,
      entriesRecord: undefined,
      setEntriesRecord: (record: WorkbenchEntries) => {
        hostProject['entriesRecord'] = record;
      },
      registerWorkbenchRecordProducer: () => () => undefined,
      registerEntryPathChange: () => () => undefined,
      setAppliedEntryRevision,
    };
    const view = render(<EntriesSyncHost />);
    await waitFor(() => {
      expect(acknowledged.has('a.ts')).toBe(true);
    });
    hostFiles.failOnce();
    await act(async () => {
      liveWatchEntries?.();
    });
    expect(acknowledged.has('a.ts')).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('offline');
    geometryUnits.set('b.ts', cad);
    view.rerender(<EntriesSyncHost />);
    await act(async () => undefined);
    expect(acknowledged.has('b.ts')).toBe(false);
    await act(async () => {
      liveWatchEntries?.();
    });
    await waitFor(() => {
      expect(acknowledged.has('a.ts')).toBe(true);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
  });
  it('persists a human hide without reverting it and adopts a foreign isolation independently', async () => {
    let operationTimeout = 180_000;
    let hidden: string[] = [];
    let isolated: string[] = [];
    let opacity: Record<string, number> = {};
    const cad = {
      getSnapshot: () => ({ context: { operationTimeout } }),
      send: vi.fn((event: { type: string; operationTimeout: number }) => {
        if (event.type === 'setOperationTimeout') {
          operationTimeout = event.operationTimeout;
        }
      }),
    } as unknown as ActorRefFrom<typeof cadMachine>;
    const model = {
      getSnapshot: () => ({
        context: {
          unitOrder: ['file:a.ts'],
          unitsById: {
            'file:a.ts': { hiddenComponentIds: hidden, isolatedComponentIds: isolated, opacityByComponentId: opacity },
          },
        },
      }),
      send: vi.fn(
        (event: {
          type: string;
          componentDisplay?: {
            unitsById: Record<
              string,
              {
                hiddenComponentIds: string[];
                isolatedComponentIds: string[];
                opacityByComponentId: Record<string, number>;
              }
            >;
          };
        }) => {
          if (event.type !== 'restoreComponentDisplay') {
            return;
          }
          const next = event.componentDisplay?.unitsById['file:a.ts'];
          if (next) {
            hidden = next.hiddenComponentIds;
            isolated = next.isolatedComponentIds;
            opacity = next.opacityByComponentId;
          }
        },
      ),
    } as unknown as ActorRefFrom<typeof modelInteractionMachine>;
    type Entry = WorkbenchEntries['entries'][string];
    const empty: Entry = { operationTimeout: 180_000, components: { hidden: [], isolated: [], opacity: [] } };
    const write = vi.fn(async (_path: string, _next: Entry) => true);
    const draw = (entry: Entry) => (
      <EntryOwner
        path='a.ts'
        cadRef={cad}
        modelInteractionRef={model}
        entry={entry}
        recordPresent
        ready
        write={write}
      />
    );
    const view = render(draw(empty));
    await act(async () => undefined);
    hidden = ['part-a'];
    view.rerender(draw(empty));
    await waitFor(() => {
      expect(write).toHaveBeenCalledWith(
        'a.ts',
        expect.objectContaining({
          components: expect.objectContaining({ hidden: ['part-a'] }),
        }),
      );
    });
    expect(hidden).toEqual(['part-a']);
    expect(model.send).not.toHaveBeenCalled();
    view.rerender(draw({ ...empty, components: { hidden: [], isolated: ['part-b'], opacity: [] } }));
    await waitFor(() => {
      expect(isolated).toEqual(['part-b']);
    });
    expect(hidden).toEqual(['part-a']);
    view.unmount();
  });

  it('keeps newer local entry settings when an older checked write is received with a foreign sibling field', async () => {
    let operationTimeout = 180_000;
    let hidden: string[] = [];
    let isolated: string[] = [];
    const cad = {
      getSnapshot: () => ({ context: { operationTimeout } }),
      send: vi.fn((event: { type: string; operationTimeout: number }) => {
        if (event.type === 'setOperationTimeout') {
          operationTimeout = event.operationTimeout;
        }
      }),
    } as unknown as ActorRefFrom<typeof cadMachine>;
    const model = {
      getSnapshot: () => ({
        context: {
          unitOrder: ['file:a.ts'],
          unitsById: {
            'file:a.ts': { hiddenComponentIds: hidden, isolatedComponentIds: isolated, opacityByComponentId: {} },
          },
        },
      }),
      send: vi.fn(
        (event: {
          type: string;
          componentDisplay?: {
            unitsById: Record<
              string,
              {
                hiddenComponentIds: string[];
                isolatedComponentIds: string[];
              }
            >;
          };
        }) => {
          if (event.type === 'restoreComponentDisplay') {
            const next = event.componentDisplay?.unitsById['file:a.ts'];
            if (next) {
              hidden = next.hiddenComponentIds;
              isolated = next.isolatedComponentIds;
            }
          }
        },
      ),
    } as unknown as ActorRefFrom<typeof modelInteractionMachine>;
    type Entry = WorkbenchEntries['entries'][string];
    const initial: Entry = { operationTimeout, components: { hidden: [], isolated: [], opacity: [] } };
    const write = vi.fn(async (_path: string, _next: Entry) => true);
    const draw = (entry: Entry, localPatch?: { operationTimeout?: number; components?: { hidden?: string[] } }) => (
      <EntryOwner
        path='a.ts'
        cadRef={cad}
        modelInteractionRef={model}
        entry={entry}
        localPatch={localPatch}
        recordPresent
        ready
        write={write}
      />
    );
    const view = render(draw(initial));
    await act(async () => {
      await Promise.resolve();
    });
    hidden = ['part-a'];
    operationTimeout = 200_000;
    view.rerender(draw(initial));
    await waitFor(() => {
      expect(write).toHaveBeenCalled();
    });
    const olderLocal = write.mock.lastCall![1];
    hidden = ['part-a', 'part-b'];
    operationTimeout = 300_000;
    view.rerender(draw(initial));
    view.rerender(
      draw(
        { ...olderLocal, components: { ...olderLocal.components!, isolated: ['part-c'] } },
        { operationTimeout: olderLocal.operationTimeout, components: { hidden: olderLocal.components!.hidden } },
      ),
    );
    await waitFor(() => {
      expect(isolated).toEqual(['part-c']);
    });
    expect(hidden).toEqual(['part-a', 'part-b']);
    expect(operationTimeout).toBe(300_000);
    view.unmount();
  });
});
