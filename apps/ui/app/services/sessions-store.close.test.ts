// @vitest-environment jsdom
/**
 * A session over a **real** project runtime with nothing mounted (A7c, row S6, I5, I6): the registry's session opens
 * it, parks it, hears a foreign change of its layout record, flushes it and closes it, and every step runs through the
 * session's own children. The runtime is `createProjectRuntime` over a layout record held in memory and watched; its
 * producers, stores and close are the session's to drive. Only the revision client and the connector are stand-ins,
 * which say when the session asked them to quiesce and when they were released.
 *
 * Rows: the close in order (I6: the producers write before the close cut takes the close revision); the unload's
 * producer stage over `environment`'s sequencer (D26: each session registers once there); focus's leave flush (I3)
 * through the session; and the connector's release on the close and on an eviction.
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, setup, types } from 'xstate';
import type { AnyActorRef, AnyEventObject, EventObject } from 'xstate';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import type { WatchEvent } from '@taucad/filesystem';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { CheckedFileWriteResult } from '@taucad/types';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import type { WorkbenchLayout } from '@taucad/workbench';
import type { Chat } from '@taucad/chat';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import type { EditorState } from '@taucad/ui-core/types/editor.types';
import { projectSessionParkWindowMilliseconds } from '#machines/project-session.machine.js';
import {
  createProjectRuntime,
  selectEditorRef,
  selectProjectRef,
  selectWorkbenchLayoutRef,
} from '#runtime/project-runtime.js';
import type { ProjectRuntimeFileManager, ProjectRuntimeLibrary } from '#runtime/project-runtime.js';
import * as sessionModule from '#runtime/project-runtime.session.js';
import { createFocusComposition } from '#runtime/app-runtime-focus.js';
import { createUnloadSequencer } from '#runtime/environment.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { createViewRecordPorts } from '#workbench-records/view-record-session.js';
import type { EntriesRecordSession } from '#workbench-records/entries-record-session.js';
import { createSessionsActor, createSessionsRegistryLogic } from '#services/sessions-store.js';
import type { SessionRuntime, SessionRuntimeOpener, SessionWiring } from '#services/sessions-store.js';

vi.mock('@taucad/files-ui/constants/browser.constants', () => ({ isBrowser: true }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const project = createProjectFixture({
  id: 'proj_close_aaaaaaaaaaaaaa',
  name: 'Close project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const projectB = 'proj_close_bbbbbbbbbbbbbb';
const manifestBytes = serializeProjectManifest(projectToManifest(project));
const encoder = new TextEncoder();

const stored: WorkbenchLayout = {
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
};
/** What another window wrote: it closed the chat lane. */
const foreign: WorkbenchLayout = { ...stored, lanes: { chat: false, workbench: true } };
/** The person's edit, owed when the session closes. */
const edited = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] } as const;

/** Every step of the runtime the session drove, in order. */
const log: string[] = [];

/** One project's runtime: a real `createProjectRuntime` over an in-memory layout record and its watch. */
const buildRuntime = (projectId: string, clock: StepClock) => {
  let bytes = encoder.encode(workbenchRecords.layout.serialize(stored));
  const listeners = new Set<(event: WatchEvent) => void>();
  const files = {
    exists: async () => true,
    readFile: async () => bytes,
    writeFileChecked: async ({ data }: { path: string; data: string }): Promise<CheckedFileWriteResult> => {
      log.push(`write:layout:${projectId}`);
      bytes = encoder.encode(data);
      return { status: 'applied', content: bytes };
    },
  };
  const viewRecordPorts = createViewRecordPorts({
    projectId,
    root: `/projects/${projectId}`,
    host: {
      files,
      watch: (_path, listener) => {
        listeners.add(listener);
        return {
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Stays open: the host never closes it. */
          }),
          dispose: () => listeners.delete(listener),
        };
      },
    },
    setViewRecord: () => undefined,
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const content = {
    resolve: async () => ({ kind: 'text', content: manifestBytes }),
    observeContent: () =>
      new ObservationService<FileContentResult>({
        resource: 'tau.json',
        watch: () => ({
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Stays open. */
          }),
          dispose: () => undefined,
        }),
        read: async () => ({ kind: 'text', content: manifestBytes }),
      }),
  };
  const fileManagerMachine = setup({
    schemas: {
      context: types<{ rootDirectory: string; contentService: unknown }>(),
      events: eventSchemas<EventObject>(),
    },
  }).createMachine({
    id: 'close-file-manager',
    context: { rootDirectory: `/projects/${projectId}`, contentService: content },
    initial: 'ready',
    states: { ready: {} },
  });
  const library = {
    touchProject: vi.fn(async () => undefined),
    getChatRecordsForResource: vi.fn(async () => []),
    createNavigationRepairChat: vi.fn(async () => mock<Chat>({ id: 'chat_created' })),
    getEditorState: vi.fn(async (): Promise<EditorState | undefined> => undefined),
    updateEditorState: vi.fn(async () => undefined),
    invalidateProjectListing: vi.fn(async () => undefined),
    invalidateChatListing: vi.fn(async () => undefined),
  } satisfies ProjectRuntimeLibrary;
  const entriesRecord: EntriesRecordSession = {
    getSnapshot: () => ({ entriesRecord: undefined, appliedEntryRevisions: new Map() }),
    subscribe: () => () => undefined,
    changePaths: async () => false,
    replaceHost: () => undefined,
    start: () => () => undefined,
  };
  const runtime = createProjectRuntime({
    projectId,
    fileManager: {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a ready file manager, read by snapshot only.
      fileManagerRef: createActor(fileManagerMachine).start() as unknown as ProjectRuntimeFileManager['fileManagerRef'],
      parameterFiles: {
        get: () => mock<ReturnType<ProjectRuntimeFileManager['parameterFiles']['get']>>(),
        subscribe: () => () => undefined,
      },
    },
    library,
    profile: 'editor',
    viewRecordPorts,
    entriesRecord,
    input: { shouldLoadModelOnStart: false },
    clock,
  });
  return {
    runtime,
    /** Another window writes the layout record, and the watch says so. */
    writeForeign: (layout: WorkbenchLayout) => {
      bytes = encoder.encode(workbenchRecords.layout.serialize(layout));
      for (const listener of listeners) {
        listener({ type: 'change', path: `/projects/${projectId}/${workbenchPaths.layout}` });
      }
    },
    read: () => workbenchRecords.layout.read(bytes),
  };
};

type Built = ReturnType<typeof buildRuntime>;
const built = new Map<string, Built>();

/* The session's runtime work, named here by its module export so the rows read the same before and after A7c. */
type RuntimeWork = (input: Readonly<Record<string, unknown>>) => Readonly<{
  flush?: (kind: string, gone: AbortSignal) => Promise<void>;
  closeParameters?: () => Promise<void>;
  closeRuntime?: () => Promise<void>;
}>;
const runtimeWork = (sessionModule as unknown as Readonly<{ sessionRuntimeWork?: RuntimeWork }>).sessionRuntimeWork;

/** The opener the app composes, over a real runtime per session: the session drives its park, flushes and close. */
const openerOn = (clock: StepClock): SessionRuntimeOpener => ({
  open: async ({ projectId }) => {
    const opened = buildRuntime(projectId, clock);
    built.set(projectId, opened);
    const { runtime } = opened;
    runtime.actor.start();
    const projectRef = selectProjectRef(runtime.actor.getSnapshot());
    const editorRef = selectEditorRef(runtime.actor.getSnapshot());
    const work = runtimeWork?.({
      projectId,
      producers: runtime.producers,
      parameterService: () => runtime.parameterService.get(),
      projectRef,
      editorRef,
    });
    const session = {
      runtimeRef: runtime.actor,
      facts: () => ({
        loaded: true,
        kernelRefusal: undefined,
        chatReady: true,
        chatDeferred: false,
        focusedChat: undefined,
      }),
      subscribe: () => () => undefined,
      requestChat: () => undefined,
      kernelIsCurrent: () => true,
      park: (parked: boolean) => {
        log.push(`park:${String(parked)}`);
        projectRef.send({ type: parked ? 'parkRuntime' : 'resumeRuntime' });
      },
      retryFocusedChat: () => undefined,
      ...(work?.flush === undefined
        ? {}
        : {
            flush: async (kind: string, gone: AbortSignal) => {
              log.push(`flush:${kind}`);
              await work.flush?.(kind, gone);
            },
          }),
      ...(work?.closeParameters === undefined
        ? {}
        : {
            closeParameters: async () => {
              log.push('closeParameters');
              await work.closeParameters?.();
            },
          }),
      ...(work?.closeRuntime === undefined
        ? {}
        : {
            closeRuntime: async () => {
              log.push('closeRuntime');
              await work.closeRuntime?.();
            },
          }),
      close: () => {
        log.push(`stop:${projectId}`);
        runtime.actor.stop();
      },
    };
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the session's runtime, as the app's opener builds it.
    return session as unknown as SessionRuntime;
  },
  onChoicesChanged: () => () => undefined,
});

/** The wiring the app runtime composes, over a sequencer and stand-ins for the revision client and the connector. */
const wiringOn = (sequencer: ReturnType<typeof createUnloadSequencer>) =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wiring the app runtime composes, its leaves stood in.
  ({
    loadRevisions: async () => ({
      createSessionRevisionsPorts: (ports: unknown) => ports,
      /* The revision client: it quiesces when the session asks, which is when the close cut takes its revision. */
      sessionRevisionsCallback:
        () =>
        ({
          sendBack,
          receive,
        }: Readonly<{
          sendBack: (event: AnyEventObject) => void;
          receive?: (listener: (event: EventObject) => void) => void;
        }>) => {
          receive?.((event) => {
            if (event.type === 'quiesce') {
              log.push('quiesce');
              sendBack({ type: 'syncQuiesced', requestId: (event as EventObject & { requestId: string }).requestId });
            }
          });
          return () => undefined;
        },
    }),
    /* The connector: its cleanup is its release. */
    loadHostConnector: async () => ({
      hostConnectorCallback:
        () =>
        ({ input }: Readonly<{ input: Readonly<{ projectId: string }> }>) =>
        () => {
          log.push(`connector:release:${input.projectId}`);
        },
    }),
    registerCloseCut: (cut: (phase: 'hidden' | 'pagehide') => Promise<void>) => sequencer.register('session', cut),
    registerProducer: (producer: (phase: 'hidden' | 'pagehide') => Promise<void>) =>
      sequencer.register('producer', producer),
    focusedProject: { get: () => undefined, subscribe: () => () => undefined },
    documentVisible: { get: () => false, subscribe: () => () => undefined },
    chatSessions: mock<SessionWiring['chatSessions']>({ cancelProjectedRun: async () => 'stopped' }),
    choices: () => {
      throw new Error('no chat attaches in these rows');
    },
    rootSync: () => ({ syncProjectRoots: async () => undefined, close: () => undefined }),
  }) as unknown as SessionWiring;

const roots: Array<{ stop: () => void }> = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    root.stop();
  }
  built.clear();
  log.length = 0;
});

const settle = async (rounds = 20): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round must follow the previous one.
    await flush();
  }
};

/** A registry over real runtimes, its sequencer and clock, with `projectId` live and nothing mounted. */
const openLive = async () => {
  const clock = new StepClock();
  const sequencer = createUnloadSequencer();
  const registry = createSessionsActor({
    clock,
    openFileManager: (id) => openSessionFileManagerStandIn(id),
    openRuntime: openerOn(clock),
    wiring: wiringOn(sequencer),
  });
  registry.start();
  roots.push(registry);
  registry.send({ type: 'open', projectId: project.id });
  await settle();
  const session = registry.getSnapshot().context.refs[project.id];
  expect(session?.getSnapshot().matches('live')).toBe(true);
  return { clock, sequencer, registry, session: session!, opened: built.get(project.id)! };
};

/** The person's edit, made with no page showing the project: its adapters attach, edit and detach. */
const editWithNothingMounted = (opened: Built): void => {
  const layout = selectWorkbenchLayoutRef(opened.runtime.actor.getSnapshot())!;
  for (const adapter of ['workbench', 'viewer'] as const) {
    layout.send({ type: 'adapterAttaching', adapter });
    layout.send({ type: 'adapterAttached', adapter });
  }
  layout.send({ type: 'personEdited', adapter: 'workbench', node: edited });
  for (const adapter of ['workbench', 'viewer'] as const) {
    layout.send({ type: 'adapterDetached', adapter });
  }
};

describe('a session over a real runtime, nothing mounted (A7c, S6, I5, I6)', () => {
  it('should open, park, hear a foreign layout change, flush and close in order', async () => {
    const { clock, registry, session, opened } = await openLive();

    /* Parked: hidden and not focused, past its grace. */
    clock.advance(projectSessionParkWindowMilliseconds);
    await settle();
    expect(log).toContain('park:true');

    /* Another window writes the layout: the runtime's layout child reads it with nothing mounted. */
    opened.writeForeign(foreign);
    await settle();
    const layout = selectWorkbenchLayoutRef(opened.runtime.actor.getSnapshot())!;
    expect(layout.getSnapshot().context.latest).toMatchObject({ layout: foreign, origin: 'foreign' });

    editWithNothingMounted(opened);
    log.length = 0;
    registry.send({ type: 'close', projectId: project.id, reason: 'user' });
    await settle(40);

    expect(registry.getSnapshot().context.refs[project.id]).toBeUndefined();
    expect(session.getSnapshot().status).toBe('stopped');
    /* I6: the producers wrote the owed edit before the close cut took the close revision; then the runtime closed and
     * the session stopped its children. */
    expect(log.filter((entry) => !entry.startsWith('connector:'))).toEqual([
      'flush:close',
      `write:layout:${project.id}`,
      'closeParameters',
      'quiesce',
      'closeRuntime',
      `stop:${project.id}`,
    ]);
    /* The owed edit is on disk. It was made over the arrangement the adapters showed: no adapter here applies the
     * foreign publication, so the person's edit is written over what they saw (the layout machine's rule 8). */
    expect(opened.read()).toMatchObject({ record: { workbench: edited } });
  });

  it('should write the producers on the unload before the close cut, with nothing mounted (D26)', async () => {
    const { sequencer, opened } = await openLive();
    editWithNothingMounted(opened);
    /* A React producer, registered beside the session's. */
    sequencer.register('producer', async () => {
      log.push('producer:react');
    });
    sequencer.register('session', async () => {
      log.push('cut');
    });
    log.length = 0;

    await sequencer.hidden();

    expect(log).toContain(`write:layout:${project.id}`);
    expect(log).toContain('producer:react');
    expect(log.indexOf(`write:layout:${project.id}`)).toBeLessThan(log.indexOf('cut'));
    expect(log.at(-1)).toBe('cut');
  });

  it("should flush a project's producers when focus asks for its leave flush, with nothing mounted (I3)", async () => {
    const { registry, opened } = await openLive();
    editWithNothingMounted(opened);
    const told: AnyEventObject[] = [];
    const focus = mock<AnyActorRef>();
    focus.send.mockImplementation((event: AnyEventObject) => {
      told.push(event);
    });
    const composition = createFocusComposition({
      library: {
        routeAccess: async () => ({ status: 'missing' }),
        epoch: () => 0,
        onEpochChanged: () => () => undefined,
      },
      loadModule: async () => undefined,
    });
    const port = createActor(composition.logics.flush, { input: { sessions: registry, focus: () => focus } }).start();
    roots.push(port);
    log.length = 0;

    port.send({ type: 'leaveFlushAsked', requestId: 'flush:1', projectId: project.id } as AnyEventObject);
    await settle();

    expect(log).toContain(`write:layout:${project.id}`);
    expect(told).toEqual([{ type: 'leaveFlushSettled', requestId: 'flush:1', ok: true }]);
  });

  it('should release the connector when the session closes and when the budget evicts it', async () => {
    const { registry } = await openLive();
    registry.send({ type: 'close', projectId: project.id, reason: 'user' });
    await settle(40);
    expect(log).toContain(`connector:release:${project.id}`);
    expect(log.indexOf(`connector:release:${project.id}`)).toBeGreaterThan(log.indexOf('closeRuntime'));

    /* An eviction: a one-project registry closes the idle project to open another. */
    log.length = 0;
    const clock = new StepClock();
    const sequencer = createUnloadSequencer();
    const evicting = createActor(
      createSessionsRegistryLogic({
        sharedWorker: () => undefined,
        openFileManager: (id) => openSessionFileManagerStandIn(id),
        openRuntime: openerOn(clock),
        wiring: wiringOn(sequencer),
      }),
      { clock, input: { budget: 1 } },
    ).start();
    roots.push(evicting);
    evicting.send({ type: 'open', projectId: project.id });
    await settle();
    evicting.send({ type: 'open', projectId: projectB });
    await settle(40);
    expect(evicting.getSnapshot().context.refs[project.id]).toBeUndefined();
    expect(log).toContain(`connector:release:${project.id}`);
  });
});
