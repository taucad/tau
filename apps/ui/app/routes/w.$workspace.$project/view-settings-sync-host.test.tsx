// @vitest-environment jsdom
/**
 * The view record's owners after G6b: the project machine spawns each view's record session beside its graphics actor,
 * and `ViewSettingsSyncHost` only registers the sessions' flush on close. These rows run a real project actor with the
 * session logic provided over in-memory files, as `ProjectProvider` provides it.
 */
import type { WatchEvent } from '@taucad/filesystem';
import { render } from '@testing-library/react';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchView } from '@taucad/workbench';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { projectMachine } from '#machines/project.machine.js';
import type { ProjectContext, ViewRecordSessionActorInput } from '#machines/project.machine.js';
import { ViewSettingsSyncHost } from '#routes/w.$workspace.$project/view-settings-sync-host.js';
import type { KernelOptionsFactory } from '#types/runtime-client.alias.js';
import { readRecordIssues } from '#workbench-records/record-issues.js';
import { createViewRecordPorts, startViewRecordSession } from '#workbench-records/view-record-session.js';

const flushOnClose = vi.hoisted(() => vi.fn());
const project = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('#hooks/use-flush-on-close.js', () => ({ useFlushOnClose: flushOnClose }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project.current }));

const projectId = 'host-test';
const encode = (record: WorkbenchView): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(workbenchRecords.view.serialize(record));

/** Let the store's file ports answer. */
const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 30; turn++) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one port answer.
    await Promise.resolve();
  }
};

const actors: Array<{ stop: () => void }> = [];
afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

function startProject() {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const writes: string[] = [];
  const ports = createViewRecordPorts({
    projectId,
    root: `/projects/${projectId}`,
    host: {
      files: {
        exists: async (path) => files.has(path),
        readFile: async (path) => files.get(path)!,
        writeFileChecked: async ({ path, data }) => {
          const bytes = new TextEncoder().encode(data);
          files.set(path, bytes);
          writes.push(path);
          return { status: 'applied', content: bytes };
        },
      },
      watch: (_path: string, _listener: (event: WatchEvent) => void) => ({
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          // The watch never closes in these rows.
        }),
        dispose: () => undefined,
      }),
    },
    setViewRecord: () => undefined,
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const sessions: string[] = [];
  const viewRecord = createCallbackLogic<{ type: 'never' }, ViewRecordSessionActorInput>(({ input }) => {
    sessions.push(input.viewId);
    return startViewRecordSession({ viewId: input.viewId, graphics: input.graphics, ports });
  });
  const actor = createActor(
    projectMachine.provide({
      actors: { viewRecord },
      // The project stays idle: these rows need its view lifecycle only.
      guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
    }),
    {
      input: {
        projectId,
        shouldLoadModelOnStart: false,
        fileManagerRef: mock<ProjectContext['fileManagerRef']>({ send: vi.fn() }),
        fileSystemRoot: `/projects/${projectId}`,
        kernelOptionsFactory: async () => () => mock<ReturnType<KernelOptionsFactory>>(),
      },
    },
  ).start();
  actors.push(actor);
  const pathOf = (viewId: string): string => `/projects/${projectId}/${workbenchPaths.view(viewId)}`;
  return { actor, files, writes, ports, sessions, pathOf };
}

describe('ViewSettingsSyncHost and the project-spawned view record sessions', () => {
  it("should read a view's record when the project spawns its graphics, and adopt it through the owners", async () => {
    const harness = startProject();
    harness.files.set(
      harness.pathOf('v1'),
      encode(
        workbenchRecords.view.schema.parse({
          version: 1,
          entryPath: 'a.ts',
          display: { ...workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' }).display, grid: false },
        }),
      ),
    );
    harness.actor.send({ type: 'createViewGraphics', viewId: 'v1' });
    await settle();
    expect(harness.sessions).toEqual(['v1']);
    const graphics = harness.actor.getSnapshot().context.viewGraphics.get('v1')!;
    expect(graphics.getSnapshot().context.enableGrid).toBe(false);
  });

  it('should run one session per live view, and stop a closed view after writing what it owes', async () => {
    const harness = startProject();
    for (const viewId of ['v1', 'v2']) {
      harness.files.set(
        harness.pathOf(viewId),
        encode(workbenchRecords.view.schema.parse({ version: 1, entryPath: 'a.ts' })),
      );
      harness.actor.send({ type: 'createViewGraphics', viewId });
    }
    await settle();
    expect([...harness.actor.getSnapshot().context.viewRecordSessions.keys()]).toEqual(['v1', 'v2']);
    harness.actor.getSnapshot().context.viewGraphics.get('v2')!.send({ type: 'setAxesVisibility', payload: false });
    harness.actor.send({ type: 'destroyViewGraphics', viewId: 'v2' });
    await settle();
    expect([...harness.actor.getSnapshot().context.viewRecordSessions.keys()]).toEqual(['v1']);
    const written = workbenchRecords.view.schema.parse(
      JSON.parse(new TextDecoder().decode(harness.files.get(harness.pathOf('v2')))),
    );
    expect(written.display.axes).toBe(false);
    expect(readRecordIssues(projectId)).toEqual([]);
  });

  it("should register the sessions' flush as a workbench record producer and with the close guard", () => {
    const harness = startProject();
    const unregister = vi.fn();
    const registerWorkbenchRecordProducer = vi.fn(() => unregister);
    project.current = { viewRecordPorts: harness.ports, registerWorkbenchRecordProducer };
    const view = render(<ViewSettingsSyncHost />);
    expect(registerWorkbenchRecordProducer).toHaveBeenCalledWith(harness.ports.flush);
    expect(flushOnClose).toHaveBeenCalledWith(harness.ports.flush, { stage: 'producer' });
    view.unmount();
    expect(unregister).toHaveBeenCalled();
  });
});
