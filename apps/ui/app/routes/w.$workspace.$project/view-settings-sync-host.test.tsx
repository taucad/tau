// @vitest-environment jsdom
import { StrictMode, useSyncExternalStore } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { ViewSettingsSyncHost } from '#routes/w.$workspace.$project/view-settings-sync-host.js';
import { workbenchRecords } from '@taucad/workbench';

type GraphicsRef = Actor<typeof graphicsMachine>;
const sync = vi.hoisted(() => vi.fn());
const projectStore = vi.hoisted(() => {
  let snapshot: unknown;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    set(next: unknown) { snapshot = next; for (const listener of listeners) { listener(); } },
  };
});
const fileManagerStore = vi.hoisted(() => {
  let snapshot: unknown;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    set(next: unknown) { snapshot = next; for (const listener of listeners) { listener(); } },
  };
});
vi.mock('#hooks/use-project.js', () => ({ useProject: () => useSyncExternalStore(projectStore.subscribe, projectStore.getSnapshot) }));
vi.mock('#hooks/use-view-settings-sync.js', () => ({ useViewSettingsSync: (input: unknown) => { sync(input); } }));
vi.mock('#hooks/use-flush-on-close.js', () => ({ useFlushOnClose: () => undefined }));
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => useSyncExternalStore(fileManagerStore.subscribe, fileManagerStore.getSnapshot) }));

function graphics(): GraphicsRef {
  return createActor(graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }), { input: {} }).start();
}
function setViews(views: Record<string, GraphicsRef>): void {
  const projectRef = { getSnapshot: () => ({ context: { geometryUnits: new Map() } }), subscribe: () => ({ unsubscribe: () => undefined }) };
  projectStore.set({
    projectId: 'p',
    viewGraphics: new Map(Object.entries(views)), viewRecords: new Map(), viewEntryPaths: new Map(),
    projectRef, editorRef: { getSnapshot: () => ({ context: {} }), subscribe: () => ({ unsubscribe: () => undefined }) },
    setViewRecord: () => undefined, setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
    registerWorkbenchRecordProducer: () => () => undefined,
  });
}

function realViewFiles(branchScenario = false) {
  let bytes = new TextEncoder().encode(workbenchRecords.view.serialize(
    workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' }),
  ));
  let selectedRoot = branchScenario ? '/projects/p' : '/project';
  let liveWatch: (() => void) | undefined;
  const files = {
    exists: async (path: string) => !branchScenario || path.startsWith('/projects/p/'),
    readFile: async (path: string) => {
      if (branchScenario && !path.startsWith('/projects/p/')) { throw new Error('candidate view read'); }
      return bytes;
    },
    writeFileChecked: vi.fn(async ({ data }: { data: string }) => {
      bytes = new TextEncoder().encode(data);
      return { status: 'applied', content: bytes };
    }),
  };
  const fileManagerRef = { getSnapshot: () => ({ context: { rootDirectory: selectedRoot } }),
    subscribe: () => ({ unsubscribe: () => undefined }) };
  const setService = (contentService: unknown): void => { fileManagerStore.set({ fileManagerRef, parameterFiles: files, contentService,
    subscribeWorkbenchRecord: (_path: string, listener: () => void) => { liveWatch = listener; return () => { liveWatch = undefined; }; },
  }); };
  setService(undefined);
  return { files, setService, get: () => bytes,
    selectCheckout: () => { selectedRoot = '/checkouts/c'; setService({ subscribe: () => () => undefined }); },
    writeLive: (next: Uint8Array<ArrayBuffer>) => { bytes = next; liveWatch?.(); },
  };
}

describe('ViewSettingsSyncHost', () => {
  it('reads a named view whose graphics actor appears after the record bytes already exist', async () => {
    realViewFiles();
    setViews({});
    const setViewRecord = vi.fn();
    projectStore.set({ ...(projectStore.getSnapshot() as Record<string, unknown>), setViewRecord });
    const result = render(<ViewSettingsSyncHost />);
    const actor = graphics();
    act(() => {
      projectStore.set({ ...(projectStore.getSnapshot() as Record<string, unknown>),
        viewGraphics: new Map([['late-view', actor]]) });
    });
    await waitFor(() => { expect(setViewRecord).toHaveBeenCalledWith('late-view',
      expect.objectContaining({ entryPath: 'a.ts' })); });
    result.unmount();
    actor.stop();
  });

  it('reads and observes a live view after code switches to a checkout', async () => {
    const memory = realViewFiles(true);
    const actor = graphics();
    setViews({ 'v-abcd1234': actor });
    const setViewRecord = vi.fn();
    projectStore.set({ ...(projectStore.getSnapshot() as Record<string, unknown>), setViewRecord });
    const view = render(<ViewSettingsSyncHost />);
    await waitFor(() => { expect(setViewRecord).toHaveBeenCalled(); });
    act(() => { memory.selectCheckout(); });
    setViewRecord.mockClear();
    await act(async () => { memory.writeLive(new TextEncoder().encode(workbenchRecords.view.serialize(
      workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts', name: 'Live view' }),
    ))); });
    await waitFor(() => { expect(setViewRecord).toHaveBeenCalledWith('v-abcd1234', expect.objectContaining({ name: 'Live view' })); });
    const latest = sync.mock.calls.at(-1)?.[0] as { writeRecord: (record: unknown) => Promise<boolean> };
    expect(await latest.writeRecord(workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts', name: 'Person edit' }))).toBe(true);
    expect(memory.files.writeFileChecked).toHaveBeenCalledWith(expect.objectContaining({
      path: '/projects/p/.tau/workbench/views/v-abcd1234.json',
    }));
    view.unmount();
    actor.stop();
  });
  it('mounts a record-backed sync owner for each live view, including an added view, and removes a closed one', async () => {
    realViewFiles();
    const first = graphics();
    const second = graphics();
    setViews({ first });
    const result = render(<ViewSettingsSyncHost />);
    await waitFor(() => { expect(sync).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'first', graphicsRef: first })); });
    sync.mockClear();
    act(() => { setViews({ first, second }); });
    await waitFor(() => { expect(sync).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'second', graphicsRef: second })); });
    sync.mockClear();
    act(() => { setViews({ second }); });
    await waitFor(() => { expect(sync).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'second' })); });
    expect(sync.mock.calls.every(([input]) => (input as { viewId: string }).viewId === 'second')).toBe(true);
    result.unmount();
    first.stop(); second.stop();
  });

  it('persists a person view edit through first readiness, service replacement, and StrictMode replay', async () => {
    const memory = realViewFiles();
    const first = graphics();
    setViews({ 'v-abcd1234': first });
    const result = render(<StrictMode><ViewSettingsSyncHost /></StrictMode>);
    await waitFor(() => { expect(sync).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'v-abcd1234', recordReady: true })); });
    act(() => { memory.setService({ subscribe: () => () => undefined }); });
    await waitFor(() => { expect(sync).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'v-abcd1234', recordReady: true })); });
    const latest = sync.mock.calls.at(-1)?.[0] as { writeRecord: (record: unknown) => Promise<boolean> };
    const renamed = workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts', name: 'Person' });
    expect(await latest.writeRecord(renamed)).toBe(true);
    expect(workbenchRecords.view.read(memory.get())).toMatchObject({ status: 'current', record: { name: 'Person' } });
    act(() => { memory.setService({ subscribe: () => () => undefined }); });
    const afterReplacement = sync.mock.calls.at(-1)?.[0] as { writeRecord: (record: unknown) => Promise<boolean> };
    const renamedAgain = workbenchRecords.view.schema.parse({ ...renamed, name: 'After replacement' });
    expect(await afterReplacement.writeRecord(renamedAgain)).toBe(true);
    expect(workbenchRecords.view.read(memory.get())).toMatchObject({ status: 'current', record: { name: 'After replacement' } });
    result.unmount();
    first.stop();
  });
});
