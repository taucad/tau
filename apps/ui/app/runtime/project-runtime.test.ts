/**
 * The project runtime with no React (plan § 4 A6a). Every actor runs on one `StepClock` under `guardActors`. Path table
 * of the root (one state):
 *
 * 1. `running`: initial; `retryManifestObservation` and `manifestObservationChanged` are answered at the root
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { eventSchemas } from '@taucad/ui-core/lib/xstate.lib';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationWatch } from '@taucad/fs-client/observation-service';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { parameterEntryPath, projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { ParameterFilesClient } from '#hooks/use-file-manager.js';
import { editorIgnoredEvents, editorMachine } from '#machines/editor.machine.js';
import { projectIgnoredEvents, projectMachine } from '#machines/project.machine.js';
import {
  createLibraryEventsLogic,
  createParameterObserversLogic,
  createProjectRuntime,
  projectRuntimeEventTypes,
  projectRuntimeIgnoredEvents,
  projectRuntimeMachine,
  selectEditorRef,
  selectManifestObservationError,
  selectProjectRef,
  selectProjectRuntimeFault,
  selectWorkbenchLayoutRef,
} from '#runtime/project-runtime.js';
import type {
  ProjectChildInput,
  ProjectRuntimeEvent,
  ProjectRuntimeFileManager,
  ProjectRuntimeLibrary,
  ProjectRuntimeProfile,
  ProjectRuntimeProfileOptions,
  ObservablePort,
} from '#runtime/project-runtime.js';
import type { ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';
import { createViewRecordPorts } from '#workbench-records/view-record-session.js';
import { workbenchRecords } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { WorkbenchLayout } from '@taucad/workbench';
import { selectArrangement } from '#workbench-records/workbench-layout.machine.js';
import type * as CadMachineModule from '#machines/cad.machine.js';
import type * as ParameterSetServiceModule from '@taucad/ui-core/services/parameter-set-service';

vi.mock('#constants/browser.constants.js', () => ({ isBrowser: true }));
/* Every parameter service the runtime builds, each with a spied close; `decorate` lets a row stand in for its reads. */
const services = vi.hoisted(() => ({
  built: [] as Array<ParameterSetService & { close: ReturnType<typeof vi.fn> }>,
  decorate: undefined as ((service: ParameterSetService) => ParameterSetService) | undefined,
}));
vi.mock('@taucad/ui-core/services/parameter-set-service', async (importOriginal) => {
  const actual = await importOriginal<typeof ParameterSetServiceModule>();
  return {
    ...actual,
    createParameterSetService: (...args: Parameters<typeof actual.createParameterSetService>) => {
      const service = actual.createParameterSetService(...args);
      const spied = { ...(services.decorate?.(service) ?? service), close: vi.fn(service.close) };
      services.built.push(spied);
      return spied;
    },
  };
});
const disposal = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('#machines/cad.machine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof CadMachineModule>();
  return {
    ...actual,
    disposeCadRuntime: (...args: Parameters<typeof actual.disposeCadRuntime>) => {
      disposal.dispose(...args);
      actual.disposeCadRuntime(...args);
    },
  };
});

const project = createProjectFixture({
  id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
  name: 'Runtime project',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.ts' } },
});
const manifestBytes = serializeProjectManifest(projectToManifest(project));

const ignore = { project: projectIgnoredEvents, editor: editorIgnoredEvents };

/** A content service that serves `tau.json` and follows it through one watch per observation. */
const createContent = () => {
  const watches: Array<ReturnType<typeof Promise.withResolvers<void>> & { dispose: ReturnType<typeof vi.fn> }> = [];
  const watchReady = vi.fn((): ObservationWatch => {
    const closed = Promise.withResolvers<void>();
    const dispose = vi.fn();
    watches.push({ ...closed, dispose });
    return { ready: Promise.resolve(), closed: closed.promise, dispose };
  });
  const readManifest = vi.fn(async () => manifestBytes);
  let source: ObservationService<FileContentResult> | undefined;
  const service = {
    resolve: async () => ({ kind: 'text', content: await readManifest() }),
    /* One source per path, as the content service keeps it. */
    observeContent: () => {
      source ??= new ObservationService<FileContentResult>({
        resource: 'tau.json',
        watch: () => watchReady(),
        read: async () => ({ kind: 'text', content: await readManifest() }),
      });
      return source;
    },
  };
  return { service, watches, watchReady, readManifest };
};

type FileManagerPatch = Readonly<{ rootDirectory?: string; contentService?: unknown }>;

/** A file manager that is ready at once, with the content service the test hands it; `patch` replaces either. */
const createFileManager = (contentService: unknown) => {
  const machine = setup({
    schemas: {
      context: types<{ rootDirectory: string; contentService: unknown }>(),
      events: eventSchemas<{ type: 'patch'; patch: FileManagerPatch }>(),
    },
  }).createMachine({
    id: 'fake-file-manager',
    context: { rootDirectory: `/projects/${project.id}`, contentService },
    initial: 'ready',
    states: {
      ready: { on: { patch: ({ context, event }) => ({ context: { ...context, ...event.patch } }) } },
    },
  });
  const actor = createActor(machine);
  actor.start();
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in for the file-manager actor, read by snapshot only.
  return actor as unknown as ProjectRuntimeFileManager['fileManagerRef'];
};

const patchFileManager = (fileManagerRef: ProjectRuntimeFileManager['fileManagerRef'], patch: FileManagerPatch) => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the stand-in takes its own patch event.
  (fileManagerRef as unknown as { send: (event: { type: 'patch'; patch: FileManagerPatch }) => void }).send({
    type: 'patch',
    patch,
  });
};

const createLibrary = () => {
  const library = {
    touchProject: vi.fn(async () => undefined),
    getChatRecordsForResource: vi.fn(async () => []),
    createNavigationRepairChat: vi.fn(async () => mock<Chat>({ id: 'chat_created' })),
    getEditorState: vi.fn(async () => undefined),
    updateEditorState: vi.fn(async () => undefined),
    invalidateProjectListing: vi.fn(async () => undefined),
    invalidateChatListing: vi.fn(async () => undefined),
  } satisfies ProjectRuntimeLibrary;
  return library;
};

/** A port whose value never changes. */
const fixedPort = <T>(value: T): ObservablePort<T> => ({ get: () => value, subscribe: () => () => undefined });

/** A port the test replaces, which counts its subscribers. */
const createPort = <T>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: T) => {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    size: () => listeners.size,
  };
};

/** The editor profile loading from disk takes the view record ports; no view opens in these rows. */
const profileOptions = (profile: ProjectRuntimeProfile): ProjectRuntimeProfileOptions =>
  profile === 'editor' ? { profile, viewRecordPorts: mock<ViewRecordPortsHandle>() } : { profile };

/** Let the fakes' promises deliver: one real macrotask per round, in order. */
const settle = async (rounds = 10): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each round must follow the previous one.
    await flush();
  }
};

describe('createProjectRuntime', () => {
  it.each(['editor', 'shared'] as const)(
    'should compose, start and stop the %s profile with no React',
    async (profile) => {
      const guard = guardActors({ ignore });
      const clock = new StepClock();
      const content = createContent();
      const library = createLibrary();
      const { actor, parameterService } = createProjectRuntime({
        projectId: project.id,
        fileManager: {
          fileManagerRef: createFileManager(content.service),
          parameterFiles: fixedPort(mock<ParameterFilesClient>()),
        },
        library,
        ...profileOptions(profile),
        input: { shouldLoadModelOnStart: false },
        clock,
        inspect: guard.inspect,
      });
      const close = vi.spyOn(parameterService.get(), 'close');
      expect(actor.getSnapshot().status).toBe('active');
      expect(selectProjectRef(actor.getSnapshot()).getSnapshot().status).toBe('active');
      // Unstarted: nothing has loaded yet.
      expect(selectEditorRef(actor.getSnapshot()).getSnapshot().value).toBe('idle');

      actor.start();
      await settle();
      const editor = selectEditorRef(actor.getSnapshot()).getSnapshot();
      expect(editor.matches('ready')).toBe(true);
      expect(editor.context.focusedChatId).toBe(profile === 'shared' ? `shared:${project.id}` : 'chat_created');
      expect(selectProjectRef(actor.getSnapshot()).getSnapshot().matches('ready')).toBe(true);
      expect(library.getEditorState).toHaveBeenCalledTimes(profile === 'shared' ? 0 : 1);
      expect(library.invalidateChatListing).toHaveBeenCalledTimes(profile === 'shared' ? 0 : 1);
      expect(content.watchReady).toHaveBeenCalledTimes(1);
      expect(selectManifestObservationError(actor.getSnapshot())).toBeUndefined();

      // The editor's store debounce runs on the injected clock: nothing is written until the step clock moves.
      expect(library.updateEditorState).not.toHaveBeenCalled();
      expect(clock.next()).toBe(true);
      await settle();
      expect(library.updateEditorState).toHaveBeenCalledTimes(profile === 'shared' ? 0 : 1);

      actor.stop();
      expect(selectProjectRef(actor.getSnapshot()).getSnapshot().status).toBe('stopped');
      expect(selectEditorRef(actor.getSnapshot()).getSnapshot().status).toBe('stopped');
      // The observation released its watch, and only the shared profile closes the service it built.
      expect(content.watches[0]?.dispose).toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(profile === 'shared' ? 1 : 0);
      expect(selectProjectRuntimeFault(actor.getSnapshot())).toBeUndefined();
    },
  );

  /* A8b exit: the layout is the runtime's child, not the focused page's. A project that is not focused is flushed
   * through its runtime's producers (its persistence guard's `hidden` flush), and the runtime's stop (a session's
   * close or leave) writes an edit still in its debounce. */
  it('should flush its layout through its producers and write an owed edit when it stops', async () => {
    const stored: WorkbenchLayout = {
      version: 1,
      lanes: { chat: true, workbench: true },
      viewer: { kind: 'group', tabs: [] },
      workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
    };
    const encoder = new TextEncoder();
    let bytes = encoder.encode(workbenchRecords.layout.serialize(stored));
    const writes: string[] = [];
    const files = {
      exists: async () => true,
      readFile: async () => bytes,
      writeFileChecked: async ({ data }: { path: string; data: string }): Promise<CheckedFileWriteResult> => {
        writes.push(data);
        bytes = encoder.encode(data);
        return { status: 'applied', content: bytes };
      },
    };
    const viewRecordPorts = createViewRecordPorts({
      projectId: project.id,
      root: `/projects/${project.id}`,
      host: {
        files,
        watch: () => ({
          ready: Promise.resolve(),
          closed: new Promise<void>(() => {
            /* Stays open: the watch is never closed by its host. */
          }),
          dispose: () => undefined,
        }),
      },
      setViewRecord: () => undefined,
      setViewEntryPath: () => undefined,
      setAppliedWorkbenchRevision: () => undefined,
    });
    const content = createContent();
    const clock = new StepClock();
    const runtime = createProjectRuntime({
      projectId: project.id,
      fileManager: {
        fileManagerRef: createFileManager(content.service),
        parameterFiles: fixedPort(mock<ParameterFilesClient>()),
      },
      library: createLibrary(),
      profile: 'editor',
      viewRecordPorts,
      input: { shouldLoadModelOnStart: false },
      clock,
    });
    runtime.actor.start();
    await settle();
    const layout = selectWorkbenchLayoutRef(runtime.actor.getSnapshot())!;
    expect(selectArrangement(layout.getSnapshot())).toEqual(stored);
    // No page shows the project: its adapters attach and the person's edit is owed, as a page left behind it.
    for (const adapter of ['workbench', 'viewer'] as const) {
      layout.send({ type: 'adapterAttaching', adapter });
      layout.send({ type: 'adapterAttached', adapter });
    }
    const edited = { kind: 'group', tabs: [{ kind: 'pane', pane: 'details' }] } as const;
    layout.send({ type: 'personEdited', adapter: 'workbench', node: edited });
    for (const adapter of ['workbench', 'viewer'] as const) {
      layout.send({ type: 'adapterDetached', adapter });
    }
    // The hidden flush walks the producers: the edit is written before its debounce.
    await runtime.producers.flushAll();
    expect(writes).toHaveLength(1);
    expect(workbenchRecords.layout.read(bytes)).toMatchObject({ record: { ...stored, workbench: edited } });
    // A second edit, then the session closes within its debounce: the stop writes it.
    layout.send({ type: 'adapterAttaching', adapter: 'workbench' });
    layout.send({ type: 'adapterAttached', adapter: 'workbench' });
    layout.send({ type: 'personEdited', adapter: 'workbench', node: stored.workbench });
    runtime.actor.stop();
    await settle();
    expect(writes).toHaveLength(2);
    expect(workbenchRecords.layout.read(bytes)).toMatchObject({ record: stored });
  });

  it("should release each geometry unit's kernel runtime when it stops", async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const { actor } = createProjectRuntime({
      projectId: project.id,
      fileManager: {
        fileManagerRef: createFileManager(content.service),
        parameterFiles: fixedPort(mock<ParameterFilesClient>()),
      },
      library: createLibrary(),
      ...profileOptions('editor'),
      kernelSelection: { kernelOptionsFactory: vi.fn() },
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    await settle();
    const projectRef = selectProjectRef(actor.getSnapshot());
    projectRef.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
    const unit = projectRef.getSnapshot().context.geometryUnits.get('main.ts');
    expect(unit).toBeDefined();
    disposal.dispose.mockClear();
    actor.stop();
    expect(disposal.dispose).toHaveBeenCalledWith(unit?.getSnapshot().context);
  });

  it("should leave a preview's own parameter service open when the shared profile stops", async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const previewParameterService = {
      actor: () => undefined,
      snapshot: () => undefined,
      subscribeActors: () => () => undefined,
      close: vi.fn(async () => undefined),
    };
    const { actor, parameterService } = createProjectRuntime({
      projectId: project.id,
      fileManager: {
        fileManagerRef: createFileManager(content.service),
        parameterFiles: fixedPort(mock<ParameterFilesClient>()),
      },
      library: createLibrary(),
      profile: 'shared',
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the reads the runtime makes of a preview's service.
      previewParameterService: previewParameterService as unknown as ParameterSetService,
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    expect(parameterService.get()).toBe(previewParameterService);
    actor.start();
    await settle();
    actor.stop();
    await settle(2);
    expect(previewParameterService.close).not.toHaveBeenCalled();
  });

  it('should rebuild the parameter service over a replaced client and close the one it replaced', async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const first = mock<ParameterFilesClient>();
    first.exists.mockResolvedValue(false);
    const second = mock<ParameterFilesClient>();
    second.exists.mockResolvedValue(false);
    const parameterFiles = createPort<ParameterFilesClient>(first);
    const { actor, parameterService } = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef: createFileManager(content.service), parameterFiles },
      library: createLibrary(),
      ...profileOptions('editor'),
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    await settle();
    const replaced = parameterService.get();
    const close = vi.spyOn(replaced, 'close');
    const changed = vi.fn();
    const unsubscribe = parameterService.subscribe(changed);

    parameterFiles.set(second);
    expect(changed).toHaveBeenCalledTimes(1);
    const rebuilt = parameterService.get();
    expect(rebuilt).not.toBe(replaced);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(rebuilt.readSettled('main.ts')).resolves.toBeUndefined();
    expect(second.exists).toHaveBeenCalled();
    expect(first.exists).not.toHaveBeenCalled();

    // The same client again changes nothing.
    parameterFiles.set(second);
    expect(parameterService.get()).toBe(rebuilt);
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    actor.stop();
    await settle(2);
  });

  it("should release the parameter client port when it stops, and never rebuild a preview's service", async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const parameterFiles = createPort(mock<ParameterFilesClient>());
    const { actor } = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef: createFileManager(content.service), parameterFiles },
      library: createLibrary(),
      ...profileOptions('editor'),
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    await settle();
    expect(parameterFiles.size()).toBe(1);
    actor.stop();
    expect(parameterFiles.size()).toBe(0);

    const previewParameterService = mock<ParameterSetService>();
    const previewFiles = createPort(mock<ParameterFilesClient>());
    const preview = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef: createFileManager(createContent().service), parameterFiles: previewFiles },
      library: createLibrary(),
      profile: 'shared',
      previewParameterService,
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    preview.actor.start();
    await settle();
    expect(previewFiles.size()).toBe(0);
    previewFiles.set(mock<ParameterFilesClient>());
    expect(preview.parameterService.get()).toBe(previewParameterService);
    preview.actor.stop();
    await settle(2);
    expect(previewParameterService.close).not.toHaveBeenCalled();
  });

  it('should rebuild the parameter service when the file manager root or content service changes', async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const fileManagerRef = createFileManager(content.service);
    services.built.length = 0;
    const { actor, parameterService } = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef, parameterFiles: fixedPort(mock<ParameterFilesClient>()) },
      library: createLibrary(),
      ...profileOptions('editor'),
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    const [initial] = services.built;
    expect(parameterService.get()).toBe(initial);

    // A root that moved before the runtime started: the owner rebuilds as it starts.
    patchFileManager(fileManagerRef, { rootDirectory: `/projects/${project.id}-moved` });
    expect(services.built).toHaveLength(1);
    actor.start();
    expect(services.built).toHaveLength(2);
    expect(parameterService.get()).toBe(services.built[1]);
    expect(initial?.close).toHaveBeenCalledTimes(1);
    await settle();

    // A new content service while running.
    patchFileManager(fileManagerRef, { contentService: createContent().service });
    expect(services.built).toHaveLength(3);
    expect(parameterService.get()).toBe(services.built[2]);
    expect(services.built[1]?.close).toHaveBeenCalledTimes(1);
    expect(services.built[2]?.close).not.toHaveBeenCalled();
    actor.stop();
    await settle(2);
  });

  it('should deliver a settled commit from the rebuilt service to its geometry unit', async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const fileManagerRef = createFileManager(content.service);
    const commits: Array<{ actor: unknown; event: unknown }> = [];
    const { actor, parameterService } = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef, parameterFiles: fixedPort(mock<ParameterFilesClient>()) },
      library: createLibrary(),
      ...profileOptions('editor'),
      kernelSelection: { kernelOptionsFactory: vi.fn() },
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: (event) => {
        guard.inspect(event);
        if (event.type === '@xstate.transition' && event.event.type === 'commitParameters') {
          commits.push({ actor: event.actorRef, event: event.event });
        }
      },
    });
    actor.start();
    await settle();
    const projectRef = selectProjectRef(actor.getSnapshot());
    projectRef.send({ type: 'createGeometryUnit', entryPath: 'main.ts' });
    const unit = projectRef.getSnapshot().context.geometryUnits.get('main.ts');
    expect(unit).toBeDefined();

    // The rebuilt service has a parameter set for the unit; the one it replaced had none.
    const settleMachine = setup({
      schemas: {
        events: eventSchemas<{ type: 'settle' }>(),
        emitted: eventSchemas<{ type: 'settled'; outcome: { status: 'committed'; write: 'applied' } }>(),
      },
    }).createMachine({
      on: {
        settle: (_args, enq) => {
          enq.emit({ type: 'settled', outcome: { status: 'committed', write: 'applied' } });
          return {};
        },
      },
    });
    const set = createActor(settleMachine);
    set.start();
    const bytes = new Uint8Array([7]);
    services.decorate = (service) => ({
      ...service,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in set actor that only settles.
      actor: (entryPath) =>
        entryPath === 'main.ts' ? (set as unknown as ReturnType<ParameterSetService['actor']>) : undefined,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the one field the observers read.
      snapshot: () => ({ bytes }) as unknown as ReturnType<ParameterSetService['snapshot']>,
    });
    try {
      patchFileManager(fileManagerRef, { contentService: createContent().service });
    } finally {
      services.decorate = undefined;
    }
    expect(parameterService.get().actor('main.ts')).toBe(set);
    set.send({ type: 'settle' });
    expect(commits).toEqual([
      { actor: unit, event: { type: 'commitParameters', stage: { [parameterEntryPath('main.ts')]: bytes } } },
    ]);
    actor.stop();
    await settle(2);
    expect(guard.take('unanswered')).toEqual([
      expect.objectContaining({ kind: 'unanswered', machineId: 'cad', eventType: 'commitParameters' }),
    ]);
  });

  it('should close the current service on a shared stop, and the replaced one only once', async () => {
    const guard = guardActors({ ignore });
    const content = createContent();
    const fileManagerRef = createFileManager(content.service);
    services.built.length = 0;
    const { actor, parameterService } = createProjectRuntime({
      projectId: project.id,
      fileManager: { fileManagerRef, parameterFiles: fixedPort(mock<ParameterFilesClient>()) },
      library: createLibrary(),
      profile: 'shared',
      input: { shouldLoadModelOnStart: false },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();
    await settle();
    patchFileManager(fileManagerRef, { contentService: createContent().service });
    const [initial, current] = services.built;
    expect(parameterService.get()).toBe(current);
    // A file-manager change while the root stops (here, from inside the close) builds nothing after the close.
    current?.close.mockImplementation(async () => {
      patchFileManager(fileManagerRef, { contentService: createContent().service });
    });
    actor.stop();
    await settle(2);
    expect(current?.close).toHaveBeenCalledTimes(1);
    expect(initial?.close).toHaveBeenCalledTimes(1);
    expect(services.built).toHaveLength(2);
  });

  it('should follow the manifest, report its observation closing and retry it, on the step clock', async () => {
    const guard = guardActors({ ignore });
    const clock = new StepClock();
    const content = createContent();
    const { actor } = createProjectRuntime({
      projectId: project.id,
      fileManager: {
        fileManagerRef: createFileManager(content.service),
        parameterFiles: fixedPort(mock<ParameterFilesClient>()),
      },
      library: createLibrary(),
      profile: 'shared',
      input: { shouldLoadModelOnStart: false },
      clock,
      inspect: guard.inspect,
    });
    actor.start();
    await settle();
    expect(content.readManifest).toHaveBeenCalled();
    const reads = content.readManifest.mock.calls.length;

    content.watches[0]?.reject(new Error('Disconnected'));
    await settle();
    expect(selectManifestObservationError(actor.getSnapshot())).toContain('Observation connection closed.');

    actor.send({ type: 'retryManifestObservation' });
    await settle();
    // The retry recreated the closed watch (the service also refreshes its content source).
    expect(content.watchReady.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(content.readManifest.mock.calls.length).toBeGreaterThan(reads);
    expect(selectManifestObservationError(actor.getSnapshot())).toBeUndefined();
    // The healthy manifest was neither reloaded nor reported.
    const projectRef = selectProjectRef(actor.getSnapshot());
    expect(projectRef.getSnapshot().context.manifestIssue).toBeUndefined();
    const projectStates: string[] = [];
    const states = projectRef.subscribe((snapshot) => {
      projectStates.push(JSON.stringify(snapshot.value));
    });

    // A renamed manifest on disk: the watch re-arms, the observer reads it and the project reloads.
    const renamed = serializeProjectManifest(projectToManifest({ ...project, name: 'Renamed project' }));
    content.readManifest.mockImplementation(async () => renamed);
    content.watches.at(-1)?.reject(new Error('Disconnected'));
    await settle();
    actor.send({ type: 'retryManifestObservation' });
    await settle();
    expect(projectStates).toContain(JSON.stringify('loading'));
    expect(projectRef.getSnapshot().matches('ready')).toBe(true);
    expect(projectRef.getSnapshot().context.project?.name).toBe('Renamed project');
    expect(projectRef.getSnapshot().context.manifestIssue).toBeUndefined();

    // Bytes that do not parse: the observer reports the issue instead of reloading.
    projectStates.length = 0;
    content.readManifest.mockImplementation(async () => new TextEncoder().encode('{ "tau": '));
    content.watches.at(-1)?.reject(new Error('Disconnected'));
    await settle();
    actor.send({ type: 'retryManifestObservation' });
    await settle();
    expect(projectRef.getSnapshot().context.manifestIssue).toBeDefined();
    expect(projectStates).not.toContain(JSON.stringify('loading'));
    states.unsubscribe();
    actor.stop();
  });

  it('should answer every public event in every state', () => {
    const stub = createCallbackLogic(() => undefined);
    const machine = projectRuntimeMachine.provide({
      actors: { project: projectMachine, editor: editorMachine, parameterObservers: stub, manifestObservation: stub },
    });
    const samples: { [T in ProjectRuntimeEvent['type']]: ReadonlyArray<Extract<ProjectRuntimeEvent, { type: T }>> } = {
      retryManifestObservation: [{ type: 'retryManifestObservation' }],
      manifestObservationChanged: [
        { type: 'manifestObservationChanged', error: 'closed' },
        { type: 'manifestObservationChanged', error: undefined },
      ],
      parameterEntryResolved: [{ type: 'parameterEntryResolved', entryPath: 'main.ts' }],
    };
    expect(Object.keys(samples)).toEqual([...projectRuntimeEventTypes]);
    const options = {
      input: {
        projectId: project.id,
        profile: 'shared' satisfies ProjectRuntimeProfile,
        project: {
          projectId: project.id,
          fileManagerRef: createFileManager(undefined),
          fileSystemRoot: `/projects/${project.id}`,
          kernelOptionsFactory: vi.fn(),
        },
        editor: { projectId: project.id },
      },
      events: Object.values(samples).flat(),
      limit: 50,
      serializeState: (snapshot: { value: unknown; context: { manifestObservationError?: string } }) =>
        JSON.stringify([snapshot.value, snapshot.context.manifestObservationError]),
    };
    expect(unansweredEvents(machine, { ...options, ignore: projectRuntimeIgnoredEvents })).toEqual([]);
    expect(unreachedStates(machine, options)).toEqual([]);
  });
});

describe('the parameter observers', () => {
  type Settled = { type: 'settled'; outcome: { status: 'committed'; write: 'applied' } };

  /** A geometry unit that keeps what the observers send it. */
  const unitMachine = setup({
    schemas: { context: types<{ received: unknown[] }>() },
  }).createMachine({
    id: 'fake-unit',
    context: { received: [] },
    on: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- XState wildcard event
      '*': ({ context, event }) => ({ context: { received: [...context.received, event] } }),
    },
  });

  /** A parameter-set actor that emits `settled` when told to. */
  const setMachine = setup({
    schemas: { events: eventSchemas<{ type: 'settle' }>(), emitted: eventSchemas<Settled>() },
  }).createMachine({
    id: 'fake-parameter-set',
    on: {
      settle: (_args, enq) => {
        enq.emit({ type: 'settled', outcome: { status: 'committed', write: 'applied' } });
        return {};
      },
    },
  });

  /** A project whose geometry units the test replaces. */
  const projectStandIn = setup({
    schemas: {
      context: types<{ geometryUnits: Map<string, unknown> }>(),
      events: eventSchemas<{ type: 'setUnits'; geometryUnits: Map<string, unknown> }>(),
    },
  }).createMachine({
    id: 'fake-project',
    context: { geometryUnits: new Map<string, unknown>() },
    on: { setUnits: ({ event }) => ({ context: { geometryUnits: event.geometryUnits } }) },
  });

  it('should send each settled commit to its unit, and follow the units as they change, on the step clock', () => {
    const clock = new StepClock();
    const unit = createActor(unitMachine, { clock });
    unit.start();
    const set = createActor(setMachine, { clock });
    set.start();
    const bytes = new Uint8Array([1, 2, 3]);
    let actorListeners = 0;
    const serviceOver = (setActor: typeof set) => ({
      actor: (entryPath: string) => (entryPath === 'main.ts' ? setActor : undefined),
      snapshot: () => ({ bytes }),
      subscribeActors: () => {
        actorListeners += 1;
        return () => {
          actorListeners -= 1;
        };
      },
    });
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the three reads the observers make.
    const services = createPort(serviceOver(set) as unknown as ParameterSetService);
    const standIn = createActor(projectStandIn, { clock });
    standIn.start();
    const observers = createActor(
      createParameterObserversLogic({
        parameterService: services,
      }),
      {
        clock,
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in read by snapshot only.
        input: { project: standIn as unknown as ProjectChildInput['project'] },
      },
    );
    observers.start();

    set.send({ type: 'settle' });
    expect(unit.getSnapshot().context.received).toEqual([]);

    standIn.send({ type: 'setUnits', geometryUnits: new Map([['main.ts', unit]]) });
    set.send({ type: 'settle' });
    expect(unit.getSnapshot().context.received).toEqual([
      { type: 'commitParameters', stage: { [parameterEntryPath('main.ts')]: bytes } },
    ]);
    expect(actorListeners).toBe(1);

    // A rebuilt service: the observers follow it and let the replaced one go.
    const rebuiltSet = createActor(setMachine, { clock });
    rebuiltSet.start();
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the three reads the observers make.
    services.set(serviceOver(rebuiltSet) as unknown as ParameterSetService);
    set.send({ type: 'settle' });
    expect(unit.getSnapshot().context.received).toHaveLength(1);
    rebuiltSet.send({ type: 'settle' });
    expect(unit.getSnapshot().context.received).toHaveLength(2);
    expect(actorListeners).toBe(1);

    standIn.send({ type: 'setUnits', geometryUnits: new Map() });
    rebuiltSet.send({ type: 'settle' });
    expect(unit.getSnapshot().context.received).toHaveLength(2);

    observers.stop();
    expect(actorListeners).toBe(0);
    expect(services.size()).toBe(0);
    expect(clock.nextDue()).toBeUndefined();
  });
});

describe('the library events', () => {
  const emitter = setup({
    schemas: {
      events: eventSchemas<{ type: 'update' } | { type: 'active' }>(),
      emitted: eventSchemas<{ type: 'projectUpdated' } | { type: 'projectActivity' }>(),
    },
  }).createMachine({
    id: 'fake-project',
    on: {
      update: (_args, enq) => {
        enq.emit({ type: 'projectUpdated' });
        return {};
      },
      active: (_args, enq) => {
        enq.emit({ type: 'projectActivity' });
        return {};
      },
    },
  });

  it.each(['editor', 'shared'] as const)(
    'should take the project emits to the library on the %s profile',
    async (profile) => {
      const library = createLibrary();
      const source = createActor(emitter);
      source.start();
      const events = createActor(createLibraryEventsLogic({ projectId: project.id, profile, library }), {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in that only emits.
        input: { project: source as unknown as ActorRefFrom<typeof projectMachine> },
      });
      events.start();
      source.send({ type: 'update' });
      source.send({ type: 'active' });
      await settle(2);
      const editor = profile === 'editor';
      expect(library.invalidateProjectListing).toHaveBeenCalledTimes(editor ? 2 : 0);
      expect(library.touchProject).toHaveBeenCalledTimes(editor ? 1 : 0);
      events.stop();
      source.send({ type: 'update' });
      expect(library.invalidateProjectListing).toHaveBeenCalledTimes(editor ? 2 : 0);
    },
  );
});
