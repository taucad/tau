/**
 * The project runtime: one root that owns a project's actors with no React (app state orchestration charter D4, D5,
 * D8, D23; plan § 4 A6a; inventory rows S11, S13 to S16).
 *
 * `createProjectRuntime` builds what `ProjectProvider` (`hooks/use-project.tsx`) builds today: the project and editor
 * actors, the parameter service, the parameter observers and the manifest observation. It returns the root unstarted
 * (MC-R4) with the current parameter service beside it, as a port, since the runtime rebuilds it when the file
 * manager's connections change. Starting the root sends the editor `load`, which a mount effect sends
 * today; stopping it releases every subscription and each geometry unit's kernel runtime, which the provider's unmount
 * effect does today. The parameter service is not closed on stop, except on the shared profile without a preview
 * service, because the project session owns its final close (as the provider leaves it today).
 *
 * Host objects (the parameter service, the file-manager facade, the library) live in the closures of the root's
 * callback children, never in its context (D4). The root's context holds the two child refs, the manifest
 * observation's health and the first fault its root `onError` caught (MC-R12, D23).
 *
 * `ProjectProvider` builds one through the app runtime's lease store (A6b); A6d loads it lazily from the session. The
 * runtime also owns the producer set a leave, close or unload flush walks (R3-F5, row S40), so a runtime child can
 * register in it without a mount, and reports its first fault once through the app runtime's one fault hook (D23).
 *
 * @module
 */
import type { ChatSessionStore } from '#services/chat-session-store.js';
import { createActor, createCallbackLogic, setup, types, waitFor } from 'xstate';
import type {
  Actor,
  ActorOptions,
  ActorRefFrom,
  AnyActorLogic,
  CallbackActorLogic,
  EventObject,
  InputFrom,
  SnapshotFrom,
} from 'xstate';
import { toast } from 'sonner';
import { reportAppRuntimeFault } from '#runtime/app-runtime-faults.js';
import { Topic } from '@taucad/events';
import { parameterRecordInputValues } from '@taucad/parameters';
import { projectToManifest, readProjectManifestBytes, serializeProjectManifest } from '@taucad/types';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { fileContentBytes } from '@taucad/fs-client/file-content-service';
import { isMemoryConstrainedDevice, runtimeRecycleHeapBytes } from '@taucad/ui-core/lib/device-memory-class';
import { getComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import { createParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';
import type { EditorState, EditorStateInput } from '@taucad/ui-core/types/editor.types';
import { recordInteraction } from '#lib/kill-work-context.js';
import { recordMemoryBreadcrumb } from '#lib/memory-kill-signal.js';
import { canOpenCloudProject, isCloudProjectPending, tauCloudIntent } from '#hooks/use-cloud-projects.js';
import { peekRevisionClient } from '#services/revision-client-registry.js';
import {
  createProjectManifestChangeObserver,
  ensureFocusedChatForProject,
  parameterStageForSettlement,
  resolveScopedProjectManifest,
  shouldDispatchParameterSettlement,
} from '#runtime/project-runtime.helpers.js';
import type { ParameterFilesClient } from '#hooks/use-file-manager.js';
import type { ProjectKernelSelection } from '#hooks/use-project-kernel-options.js';
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { projectMachine } from '#machines/project.machine.js';
import type {
  ProjectContext,
  ProjectLoadInput,
  ProjectRetrievedEvent,
  ViewRecordSessionActorInput,
} from '#machines/project.machine.js';
import { editorMachine } from '#machines/editor.machine.js';
import { disposeCadRuntime } from '#machines/cad.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import type { ChatStorage } from '#types/storage.types.js';
import { startViewRecordSession } from '#workbench-records/view-record-session.js';
import type { EntriesRecordSession } from '#workbench-records/entries-record-session.js';
import type { ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';

/** The editor writes the project's records; `shared` shows a project without saving editor state or chats. */
export type ProjectRuntimeProfile = 'editor' | 'shared';

/**
 * The library calls the runtime makes (A2 supplies the implementation; tests pass a fake): touching the project on
 * activity, the chat-file methods of the focused-chat ensure, the editor-state record, and the listings a change
 * invalidates.
 */
export type ProjectRuntimeLibrary = Readonly<
  Pick<ChatStorage, 'getChatRecordsForResource' | 'createNavigationRepairChat'> & {
    touchProject: (projectId: string) => Promise<unknown>;
    getEditorState: (projectId: string) => Promise<EditorState | undefined>;
    updateEditorState: (editorState: EditorStateInput) => Promise<unknown>;
    /** The project listing changed: today `invalidateQueries({ queryKey: ['projects'] })`. */
    invalidateProjectListing: () => Promise<unknown>;
    /** A project's chat listing changed: today `invalidateQueries({ queryKey: ['chats', projectId] })`. */
    invalidateChatListing: (projectId: string) => Promise<unknown>;
  }
>;

/** A value that can change: the current value, and a listener called after each change. */
export type ObservablePort<T> = Readonly<{
  get: () => T;
  subscribe: (listener: () => void) => () => void;
}>;

/**
 * The parts of the project's file manager the runtime reads. The root directory and the content service are read
 * from the file-manager actor's snapshot. The parameter client is a port because it is built outside that actor and
 * replaced when the filesystem's connections are (a new bridge opener): A6b feeds it from the file-manager provider,
 * and A6c from the session's file-manager child.
 */
export type ProjectRuntimeFileManager = Readonly<{
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  parameterFiles: ObservablePort<ParameterFilesClient>;
}>;

type ProjectMachineInput = NonNullable<InputFrom<typeof projectMachine>>;
type ProjectRef = ActorRefFrom<typeof projectMachine>;

/** The project's own loader, replacing its actors wholesale: a project that is not on disk loads from its source. */
export type ProjectRuntimeProvide = Readonly<{
  actors: Pick<MachineActors<typeof projectMachine>, 'loadProjectActor'>;
}>;

/**
 * The profile and how the project loads. The editor profile loading from disk always runs each view's record session
 * over the ports every view shares (charter G6b) and the project's entries record session (A9), so it must be given
 * them; a project with its own loader, and a shared workbench, keep neither.
 */
export type ProjectRuntimeProfileOptions =
  | Readonly<{
      profile: 'editor';
      provide?: undefined;
      viewRecordPorts: ViewRecordPortsHandle;
      entriesRecord: EntriesRecordSession;
    }>
  | Readonly<{
      profile: 'editor';
      provide: ProjectRuntimeProvide;
      viewRecordPorts?: undefined;
      entriesRecord?: undefined;
    }>
  | Readonly<{
      profile: 'shared';
      provide?: ProjectRuntimeProvide;
      viewRecordPorts?: undefined;
      entriesRecord?: undefined;
    }>;

export type ProjectRuntimeOptions = Readonly<{
  projectId: string;
  fileManager: ProjectRuntimeFileManager;
  library: ProjectRuntimeLibrary;
  /** Omitted, the project runs the local kernel with the current reuse preference (the converter's case today). */
  kernelSelection?: Pick<ProjectKernelSelection, 'kernelOptionsFactory'>;
  /** The rest of the project machine's input. */
  input?: Omit<ProjectMachineInput, 'projectId' | 'fileManagerRef' | 'fileSystemRoot' | 'kernelOptionsFactory'>;
  /** The chat the route asked for when the editor is created. */
  requestedChatId?: string;
  /** A preview's own parameter service: used instead of building one, and its values reach the kernel as previews. */
  previewParameterService?: ParameterSetService;
  /** The chat store, told of a chat the focused-chat ensure created empty so it shows empty at once (A12, I21). */
  chatSessions?: Pick<ChatSessionStore, 'noteCreatedEmpty'>;
}> &
  ProjectRuntimeProfileOptions &
  Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;

type ProjectRuntimeInput = Readonly<{
  projectId: string;
  profile: ProjectRuntimeProfile;
  project: ProjectMachineInput;
  editor: NonNullable<InputFrom<typeof editorMachine>>;
}>;

export type ProjectRuntimeContext = {
  projectId: string;
  profile: ProjectRuntimeProfile;
  projectRef: ProjectRef;
  editorRef: ActorRefFrom<typeof editorMachine>;
  /** Why `tau.json` is not being followed, while its observation is closed or failed. */
  manifestObservationError: string | undefined;
  /** The first defect the root `onError` caught; later ones are usually its consequences (MC-R12, D23). */
  fault: string | undefined;
};

export type ProjectRuntimeEvent =
  | Readonly<{ type: 'retryManifestObservation' }>
  | Readonly<{ type: 'manifestObservationChanged'; error: string | undefined }>
  /** A parameter entry's resolve settled: a preview's resolved values go to its kernel (A6b). */
  | Readonly<{ type: 'parameterEntryResolved'; entryPath: string }>;

/** The public alphabet, in union order. */
export const projectRuntimeEventTypes = [
  'retryManifestObservation',
  'manifestObservationChanged',
  'parameterEntryResolved',
] as const satisfies ReadonlyArray<ProjectRuntimeEvent['type']>;

/** The (state, event) pairs the runtime root leaves unanswered (MC-R17): none. */
export const projectRuntimeIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

/** What the parameter observers child receives: a resolve that settled, whose preview values it publishes. */
export type ParameterObserversEvent = Readonly<{ type: 'publishPreviewParameters'; entryPath: string }>;

/** What the manifest observation child receives. */
export type ManifestObservationEvent = Readonly<{ type: 'refresh' }>;

/** Input of the children that follow the project actor. */
export type ProjectChildInput = Readonly<{ project: ProjectRef }>;

type ProjectChildLogic<Received extends EventObject = Readonly<{ type: 'never' }>> = CallbackActorLogic<
  Received,
  ProjectChildInput
>;

/* Each slot's default keeps nothing: a callback driver may default to a no-op (MC-R8). The factory provides them. */
const parameterObservers: ProjectChildLogic<ParameterObserversEvent> = createCallbackLogic<
  ParameterObserversEvent,
  ProjectChildInput
>(() => undefined);
const manifestObservation: ProjectChildLogic<ManifestObservationEvent> = createCallbackLogic<
  ManifestObservationEvent,
  ProjectChildInput
>(() => undefined);
const libraryEvents: ProjectChildLogic = createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => undefined);
const resources: ProjectChildLogic = createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => undefined);
const parameterServiceOwner: CallbackActorLogic<{ type: 'never' }> = createCallbackLogic<{ type: 'never' }>(
  () => undefined,
);
const entriesRecord: ProjectChildLogic = createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => undefined);

export const projectRuntimeActors = {
  project: projectMachine,
  editor: editorMachine,
  parameterObservers,
  manifestObservation,
  libraryEvents,
  resources,
  parameterServiceOwner,
  entriesRecord,
};

const describeFault = (error: unknown): string =>
  String(typeof error === 'object' && error !== null && 'message' in error ? error.message : error);

/**
 * The root's `onError` and each invoked child's own (MC-R12): the runtime records the fault, keeps the first and keeps
 * running. The first is reported once through the app runtime's one fault hook (D23); later ones are usually its
 * consequences, so they are neither kept nor reported.
 */
const recordFault = (
  {
    context,
    event,
  }: Readonly<{ context: Readonly<{ fault: string | undefined }>; event: Readonly<{ error: unknown }> }>,
  enq: (effect: (error: unknown) => void, error: unknown) => void,
) => {
  if (context.fault !== undefined) {
    return { context: { fault: context.fault } };
  }
  enq(reportAppRuntimeFault, event.error);
  return { context: { fault: describeFault(event.error) } };
};

/**
 * The project runtime's root. Its children are the project and editor actors (spawned with the root, so their refs
 * are in context from the first snapshot) and four callback actors that live as long as it does.
 */
export const projectRuntimeMachine = setup({
  schemas: {
    context: types<ProjectRuntimeContext>(),
    events: eventSchemas<ProjectRuntimeEvent>(),
    input: types<ProjectRuntimeInput>(),
  },
  actors: projectRuntimeActors,
}).createMachine({
  id: 'project-runtime',
  version: '1',
  // A defect is recorded and the runtime keeps running: the first is kept and reported once, since later ones are
  // usually its consequences (MC-R12, D23, B2).
  onError: recordFault,
  context: ({ input, spawn, actors }) => ({
    projectId: input.projectId,
    profile: input.profile,
    projectRef: spawn(actors.project, { id: 'project', input: input.project }),
    editorRef: spawn(actors.editor, { id: 'editor', input: input.editor }),
    manifestObservationError: undefined,
    fault: undefined,
  }),
  // The runtime's start is the editor's `load` (row S14).
  entry: ({ context }, enq) => {
    enq.sendTo(context.editorRef, { type: 'load' });
  },
  on: {
    retryManifestObservation: ({ children }, enq) => {
      const observation = children['manifestObservation'];
      if (observation !== undefined) {
        enq.sendTo(observation, { type: 'refresh' });
      }
      return {};
    },
    manifestObservationChanged: ({ context, event }) =>
      context.manifestObservationError === event.error ? {} : { context: { manifestObservationError: event.error } },
    parameterEntryResolved: ({ children, event }, enq) => {
      const observers = children['parameterObservers'];
      if (observers !== undefined) {
        enq.sendTo(observers, { type: 'publishPreviewParameters', entryPath: event.entryPath });
      }
      return {};
    },
  },
  initial: 'running',
  states: {
    running: {
      // The project and editor actors spawned in context stop first; of the invoked children the owner stops first,
      // so a file-manager change during the root's stop cannot rebuild after the shared close.
      invoke: [
        { id: 'parameterServiceOwner', src: 'parameterServiceOwner', onError: recordFault },
        {
          id: 'parameterObservers',
          src: 'parameterObservers',
          input: ({ context }) => ({ project: context.projectRef }),
          onError: recordFault,
        },
        {
          id: 'manifestObservation',
          src: 'manifestObservation',
          input: ({ context }) => ({ project: context.projectRef }),
          onError: recordFault,
        },
        {
          id: 'libraryEvents',
          src: 'libraryEvents',
          input: ({ context }) => ({ project: context.projectRef }),
          onError: recordFault,
        },
        {
          id: 'resources',
          src: 'resources',
          input: ({ context }) => ({ project: context.projectRef }),
          onError: recordFault,
        },
        {
          id: 'entriesRecord',
          src: 'entriesRecord',
          input: ({ context }) => ({ project: context.projectRef }),
          onError: recordFault,
        },
      ],
    },
  },
});

export type ProjectRuntimeActor = Actor<typeof projectRuntimeMachine>;
export type ProjectRuntimeSnapshot = SnapshotFrom<typeof projectRuntimeMachine>;

/** One producer: it writes what it holds and settles, rejecting when it cannot confirm it saved. */
type ProjectProducerFlush = () => Promise<void>;

/**
 * The producer set a leave, close or unload flush walks (R3-F5, row S40; the flush-ownership table of plan § 4 A7). Each
 * producer writes what it holds and settles; `flushAll` runs every registered producer at once and rejects with every
 * refusal, so one producer that cannot confirm its records never hides another's.
 */
export type ProjectRuntimeProducers = Readonly<{
  /**
   * Add a producer to the set.
   *
   * @param flush - Writes what the producer holds; rejects when it cannot confirm it saved.
   * @returns The removal. Registering the same function twice keeps it once.
   */
  register: (flush: () => Promise<void>) => () => void;
  /**
   * Flush every registered producer and wait for each to settle.
   *
   * @returns Resolves when every producer confirmed; rejects with an `AggregateError` of every refusal otherwise.
   */
  flushAll: () => Promise<void>;
}>;

/** A built project runtime: the unstarted root, the parameter service its children share, and its producer set. */
export type ProjectRuntime = Readonly<{
  actor: ProjectRuntimeActor;
  parameterService: ObservablePort<ParameterSetService>;
  producers: ProjectRuntimeProducers;
  /**
   * Hand a preview's runtime the service its scope rebuilt (a new worker opener): the observers rebind to it, as the
   * provider's memo followed the prop. The scope owns and closes the services; a runtime built without one ignores it.
   */
  replacePreviewParameterService: (service: ParameterSetService) => void;
}>;

/**
 * Build a project's producer set. It is a host object of the runtime, beside its root and never in its context (D4).
 *
 * @returns The set.
 */
export const createProjectRuntimeProducers = (): ProjectRuntimeProducers => {
  /* A producer set awaited as a whole, not an event fan-out: `flushAll` needs every producer's own settlement. */
  const producers = new Set<ProjectProducerFlush>();
  return {
    register: (flush) => {
      producers.add(flush);
      return () => {
        producers.delete(flush);
      };
    },
    flushAll: async () => {
      const outcomes = await Promise.allSettled([...producers].map(async (flush) => flush()));
      const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (failures.length > 0) {
        const reasons = failures.map((failure) => failure.reason as unknown);
        throw new AggregateError(
          reasons,
          reasons
            .map((reason) => (reason instanceof Error ? reason.message : 'Workbench records are not confirmed saved.'))
            .join(' '),
        );
      }
    },
  };
};

/** The runtime's current parameter service, which its owner child replaces. */
type ParameterServiceHolder = ObservablePort<ParameterSetService> &
  Readonly<{ replace: (next: ParameterSetService) => void }>;

const createParameterServiceHolder = (initial: ParameterSetService): ParameterServiceHolder => {
  let current = initial;
  const changes = new Topic<void>({ name: 'project-runtime-parameter-service' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    replace: (next) => {
      current = next;
      changes.emit();
    },
  };
};

/* Readers for React and for the session: the only way anything outside reads the root (MC-R25). */
export const selectProjectRef = (snapshot: ProjectRuntimeSnapshot): ProjectRef => snapshot.context.projectRef;
export const selectEditorRef = (snapshot: ProjectRuntimeSnapshot): ActorRefFrom<typeof editorMachine> =>
  snapshot.context.editorRef;
export const selectManifestObservationError = (snapshot: ProjectRuntimeSnapshot): string | undefined =>
  snapshot.context.manifestObservationError;
export const selectProjectRuntimeFault = (snapshot: ProjectRuntimeSnapshot): string | undefined =>
  snapshot.context.fault;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';

/**
 * The parameter observers (row S13): each geometry unit's set actor settles into its kernel, and a preview's values
 * reach the kernel as previews. Rebuilt whenever the project's geometry units change, as the provider's effect is.
 *
 * @param options - The parameter service and, for a preview, its own service.
 * @returns The observers' callback logic.
 */
export const createParameterObserversLogic = (
  options: Readonly<{
    parameterService: ObservablePort<ParameterSetService>;
    /** A preview's: its resolved values reach the kernel as temporary parameters instead of committed stages. */
    publishesPreviewParameters?: boolean;
  }>,
): ProjectChildLogic<ParameterObserversEvent> => {
  const publishesPreviewParameters = options.publishesPreviewParameters === true;
  return createCallbackLogic<ParameterObserversEvent, ProjectChildInput>(({ input: { project }, receive }) => {
    /* The service the observers are bound to: a rebuilt service rebinds them, as the provider's effect re-runs. */
    let parameterService = options.parameterService.get();
    /* Keyed by entry path but bound to one actor: a retired and re-created set actor at the same path gets a fresh
     * subscription. */
    const observers = new Map<string, Readonly<{ actor: unknown; unsubscribe: () => void }>>();
    const previewValuesByRuntime = new WeakMap<WeakKey, string>();

    const publishPreviewParameters = (entryPath: string): void => {
      if (!publishesPreviewParameters) {
        return;
      }
      const cadRef = project.getSnapshot().context.geometryUnits.get(entryPath);
      const snapshot = parameterService.snapshot(entryPath);
      if (cadRef === undefined || snapshot === undefined) {
        return;
      }
      const runtime = cadRef.getSnapshot();
      const { document } = runtime.context;
      if (document === undefined || !runtime.can({ type: 'setPreviewParameters', parameters: {} })) {
        return;
      }
      const parameters = parameterRecordInputValues(snapshot.entry);
      const signature = JSON.stringify(parameters);
      if (previewValuesByRuntime.get(document) === signature) {
        return;
      }
      previewValuesByRuntime.set(document, signature);
      cadRef.send({ type: 'setPreviewParameters', parameters });
    };

    const observeParameters = (entryPath: string): void => {
      const actor = parameterService.actor(entryPath);
      const existing = observers.get(entryPath);
      if (actor === undefined || existing?.actor === actor) {
        return;
      }
      existing?.unsubscribe();
      const subscription = actor.on('settled', ({ outcome }) => {
        performance.mark('tau:parameter-settled', { detail: { entryPath } });
        const cadRef = project.getSnapshot().context.geometryUnits.get(entryPath);
        const current = parameterService.snapshot(entryPath);
        if (cadRef === undefined || current === undefined) {
          return;
        }
        if (publishesPreviewParameters) {
          if (shouldDispatchParameterSettlement(outcome)) {
            publishPreviewParameters(entryPath);
          }
          return;
        }
        const stage = parameterStageForSettlement({ entryPath, outcome, bytes: current.bytes ?? undefined });
        if (stage !== undefined) {
          /* Only the bytes the authority just persisted travel: the runtime resolves the values from them. */
          performance.mark('tau:parameter-dispatch', { detail: { entryPath } });
          recordMemoryBreadcrumb('render');
          recordInteraction('parameter');
          cadRef.send({ type: 'commitParameters', stage });
        }
      });
      observers.set(entryPath, {
        actor,
        unsubscribe: () => {
          subscription.unsubscribe();
        },
      });
    };

    const observeUnits = (geometryUnits: ProjectContext['geometryUnits']): (() => void) => {
      const observeAll = (): void => {
        for (const entryPath of geometryUnits.keys()) {
          observeParameters(entryPath);
          publishPreviewParameters(entryPath);
        }
      };
      const runtimeSubscriptions = [...geometryUnits].map(([entryPath, cadRef]) =>
        cadRef.subscribe(() => {
          publishPreviewParameters(entryPath);
        }),
      );
      observeAll();
      const unsubscribeActors = parameterService.subscribeActors(observeAll);
      for (const [entryPath, { unsubscribe }] of observers) {
        if (!geometryUnits.has(entryPath)) {
          unsubscribe();
          observers.delete(entryPath);
        }
      }
      return () => {
        unsubscribeActors();
        for (const subscription of runtimeSubscriptions) {
          subscription.unsubscribe();
        }
        for (const { unsubscribe } of observers.values()) {
          unsubscribe();
        }
        observers.clear();
      };
    };

    /* A resolve that settled: its values reach a preview's kernel, as the provider published them after `resolve`. */
    receive((event) => {
      publishPreviewParameters(event.entryPath);
    });
    let { geometryUnits } = project.getSnapshot().context;
    let release = observeUnits(geometryUnits);
    const projectSubscription = project.subscribe((snapshot) => {
      if (snapshot.context.geometryUnits === geometryUnits) {
        return;
      }
      release();
      ({ geometryUnits } = snapshot.context);
      release = observeUnits(geometryUnits);
    });
    const unsubscribeService = options.parameterService.subscribe(() => {
      const next = options.parameterService.get();
      if (next === parameterService) {
        return;
      }
      release();
      parameterService = next;
      release = observeUnits(geometryUnits);
    });
    return () => {
      unsubscribeService();
      projectSubscription.unsubscribe();
      release();
    };
  });
};

/**
 * The manifest observation (row S15): while the project is ready and its file manager has a content service,
 * `tau.json` is followed, a change reloads the project and an unreadable one is reported. Its health reaches the root
 * as `manifestObservationChanged`, and `refresh` retries it.
 *
 * @param options - The project id and its file manager.
 * @returns The observation's callback logic.
 */
export const createManifestObservationLogic = (
  options: Readonly<{ projectId: string; fileManagerRef: ProjectRuntimeFileManager['fileManagerRef'] }>,
): ProjectChildLogic<ManifestObservationEvent> => {
  const { projectId, fileManagerRef } = options;
  return createCallbackLogic<ManifestObservationEvent, ProjectChildInput>(
    ({ input: { project }, sendBack, receive }) => {
      const observe = (
        contentService: FileContentService,
      ): Readonly<{ observation: ObservationService<void>; release: () => void }> => {
        const observer = createProjectManifestChangeObserver({
          projectId,
          onSettled: () => {
            if (
              isCloudProjectPending(projectId) &&
              canOpenCloudProject(projectId) &&
              peekRevisionClient(projectId)?.status()?.sync.hasAppliedRemote === true
            ) {
              tauCloudIntent.set(projectId, undefined);
            }
          },
          getCurrent: () => {
            const { project: current, manifestIssue } = project.getSnapshot().context;
            return { project: current, issue: manifestIssue };
          },
          reload: () => {
            project.send({ type: 'reloadProject' });
          },
          report: (issue) => {
            project.send({ type: 'manifestIssueObserved', issue });
          },
        });
        const observation = new ObservationService({
          resource: 'tau.json',
          invalidate: observer.invalidate,
          read: async (read) =>
            observer.check({
              readManifest: async () =>
                fileContentBytes({
                  path: 'tau.json',
                  result: await read.observe(contentService.observeContent('tau.json')),
                }),
            }),
        });
        const updateHealth = (): void => {
          const snapshot = observation.getSnapshot();
          if (snapshot.status === 'ready') {
            sendBack({ type: 'manifestObservationChanged', error: undefined });
          } else if (snapshot.status === 'closed' || snapshot.status === 'error') {
            sendBack({ type: 'manifestObservationChanged', error: snapshot.error });
          }
        };
        const unsubscribe = observation.subscribe(updateHealth);
        const lease = observation.acquire();
        return {
          observation,
          release: () => {
            unsubscribe();
            observer.dispose();
            lease.release();
          },
        };
      };

      let current:
        | Readonly<{ contentService: FileContentService; observation: ObservationService<void>; release: () => void }>
        | undefined;
      const sync = (): void => {
        const contentService = project.getSnapshot().matches('ready')
          ? fileManagerRef.getSnapshot().context.contentService
          : undefined;
        if (current?.contentService === contentService) {
          return;
        }
        current?.release();
        current = contentService === undefined ? undefined : { contentService, ...observe(contentService) };
      };
      // `refresh` is the one event this child takes.
      receive(() => {
        current?.observation.refresh();
      });
      const projectSubscription = project.subscribe(sync);
      const fileManagerSubscription = fileManagerRef.subscribe(sync);
      sync();
      return () => {
        projectSubscription.unsubscribe();
        fileManagerSubscription.unsubscribe();
        current?.release();
        current = undefined;
      };
    },
  );
};

/**
 * The project's two emits go to the library (row S14): an update invalidates the project listing, and activity touches
 * the project first. A shared workbench reports neither.
 *
 * @param options - The project id, the profile and the library.
 * @returns The library events' callback logic.
 */
export const createLibraryEventsLogic = (
  options: Readonly<{ projectId: string; profile: ProjectRuntimeProfile; library: ProjectRuntimeLibrary }>,
): ProjectChildLogic => {
  const { projectId, profile, library } = options;
  return createCallbackLogic<{ type: 'never' }, ProjectChildInput>(({ input: { project } }) => {
    if (profile === 'shared') {
      return undefined;
    }
    const updated = project.on('projectUpdated', () => {
      void library.invalidateProjectListing();
    });
    const activity = project.on('projectActivity', () => {
      // async-iife: bootstrap -- an emitted-event handler cannot await the touch before the listing refresh.
      void (async () => {
        await library.touchProject(projectId);
        await library.invalidateProjectListing();
      })();
    });
    return () => {
      updated.unsubscribe();
      activity.unsubscribe();
    };
  });
};

/**
 * The entries record session as a runtime child (plan § 4 A9, rows S24 and S25): it starts with the runtime, follows
 * the project's geometry units, and registers its flush in the runtime's producer set at its start (D12), so the leave,
 * close and unload flushes reach it with nothing mounted.
 *
 * @param options - The session and the runtime's producer set.
 * @returns The child's callback logic.
 */
export const createEntriesRecordLogic = (
  options: Readonly<{ session: EntriesRecordSession; producers: ProjectRuntimeProducers }>,
): ProjectChildLogic => {
  const { session, producers } = options;
  return createCallbackLogic<{ type: 'never' }, ProjectChildInput>(({ input: { project } }) =>
    session.start({ project, producers }),
  );
};

/**
 * What the runtime releases when it stops: each geometry unit's kernel runtime (a root stop runs no machine exit), and
 * on the shared profile without a preview service, the parameter service it built.
 *
 * @param options - The parameter service and whether this runtime closes it.
 * @returns The resources' callback logic.
 */
export const createResourcesLogic = (
  options: Readonly<{ parameterService: ObservablePort<ParameterSetService>; closesParameterService: boolean }>,
): ProjectChildLogic => {
  const { parameterService, closesParameterService } = options;
  return createCallbackLogic<{ type: 'never' }, ProjectChildInput>(({ input: { project } }) => () => {
    for (const unit of project.getSnapshot().context.geometryUnits.values()) {
      disposeCadRuntime(unit.getSnapshot().context);
    }
    if (closesParameterService) {
      // async-iife: bootstrap -- a callback's cleanup cannot await the service's close.
      void (async () => {
        try {
          await parameterService.get().close();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Parameter service could not close.');
        }
      })();
    }
  });
};

/** What a parameter service is built over: it is rebuilt when any of them changes, as the provider's memo is. */
type ParameterServiceSource = Readonly<{
  rootDirectory: string;
  client: ParameterFilesClient;
  contentService: FileContentService | undefined;
}>;

const readParameterServiceSource = (fileManager: ProjectRuntimeFileManager): ParameterServiceSource => {
  const { rootDirectory, contentService } = fileManager.fileManagerRef.getSnapshot().context;
  return { rootDirectory, client: fileManager.parameterFiles.get(), contentService };
};

const sameParameterServiceSource = (a: ParameterServiceSource, b: ParameterServiceSource): boolean =>
  a.rootDirectory === b.rootDirectory && a.client === b.client && a.contentService === b.contentService;

/** Build a parameter service over one source; its watches read that source's content service. */
const buildParameterService = ({
  rootDirectory,
  client,
  contentService,
}: ParameterServiceSource): ParameterSetService =>
  createParameterSetService({
    rootDirectory,
    client,
    watchReady: (request, onEvent) => {
      if (!contentService) {
        throw new Error('The parameter filesystem is not ready.');
      }
      const watch = contentService.watchReady(request, onEvent);
      return {
        ready: watch.ready,
        closed: (async () => {
          await watch.closed;
        })(),
        unsubscribe: watch.dispose,
      };
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

/**
 * The parameter service's owner: it rebuilds the service when the file manager's root, content service or parameter
 * client changes, and closes the one it replaced, as `ProjectProvider` does today. It never closes the current one:
 * the project session owns the final close.
 *
 * @param options - The file manager, the holder of the current service and the source it was built over.
 * @returns The owner's callback logic.
 */
export const createParameterServiceOwnerLogic = (
  options: Readonly<{
    fileManager: ProjectRuntimeFileManager;
    holder: ParameterServiceHolder;
    source: ParameterServiceSource;
  }>,
): CallbackActorLogic<{ type: 'never' }> => {
  const { fileManager, holder } = options;
  let { source } = options;
  return createCallbackLogic<{ type: 'never' }>(() => {
    const sync = (): void => {
      const next = readParameterServiceSource(fileManager);
      if (sameParameterServiceSource(source, next)) {
        return;
      }
      source = next;
      const previous = holder.get();
      holder.replace(buildParameterService(next));
      // async-iife: bootstrap -- a listener cannot await the replaced service's close.
      void (async () => {
        try {
          await previous.close();
        } catch (error) {
          toast.error(errorMessage(error));
        }
      })();
    };
    const unsubscribeClient = fileManager.parameterFiles.subscribe(sync);
    const fileManagerSubscription = fileManager.fileManagerRef.subscribe(sync);
    sync();
    return () => {
      unsubscribeClient();
      fileManagerSubscription.unsubscribe();
    };
  });
};

/**
 * Build a project runtime, unstarted (MC-R4). Its owner starts it once and stops it when the project goes away.
 *
 * @param options - The project, its file manager and library, the profile, the kernel selection and the actor
 *   options tests inject.
 * @returns The unstarted root, the parameter service its children share and its producer set.
 */
export function createProjectRuntime(options: ProjectRuntimeOptions): ProjectRuntime {
  const { projectId, fileManager, library, profile, provide, previewParameterService, viewRecordPorts, chatSessions } =
    options;
  const producers = createProjectRuntimeProducers();
  const { fileManagerRef } = fileManager;
  const fileSystemRoot = fileManagerRef.getSnapshot().context.rootDirectory;
  const kernelOptionsFactory =
    options.kernelSelection?.kernelOptionsFactory ?? localKernelOptions(projectId, undefined, getComputeReuseMode());

  /* A preview's own service is used as given and never rebuilt; otherwise the owner child rebuilds this one. */
  const parameterSource = readParameterServiceSource(fileManager);
  const parameterService = createParameterServiceHolder(
    previewParameterService ?? buildParameterService(parameterSource),
  );

  const projectActors = {
    loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async ({ input }) => {
      const readySnapshot = await waitFor(fileManagerRef, (state) => state.matches('ready'));
      const { contentService } = readySnapshot.context;
      if (!contentService) {
        throw new Error(`Project content service is unavailable for ${input.projectId}`);
      }
      const { project, issue } = await resolveScopedProjectManifest({ contentService, projectId: input.projectId });
      return { type: 'projectRetrieved', project, ...(issue === undefined ? {} : { issue }) };
    }),
    writeProjectActor: fromSafeAsync(async ({ input }) => {
      const { contentService } = fileManagerRef.getSnapshot().context;
      if (!contentService) {
        throw new Error('File manager content service is not ready');
      }
      if (!input.repair) {
        // Re-read: an implicit write must never replace a degraded manifest (R4).
        const current = await contentService.resolve('tau.json', { forceText: true });
        if (current.kind === 'text') {
          const read = readProjectManifestBytes(current.content);
          if (!read.success || read.issue !== undefined) {
            throw new Error('tau.json needs repair before Tau can change it. Repair it, or fix it in the editor.');
          }
        }
      }
      await contentService.write('tau.json', serializeProjectManifest(projectToManifest(input.project)), 'machine');
    }),
  } satisfies Partial<MachineActors<typeof projectMachine>>;

  /* Only the editor loading from disk writes view records (G6b), and only it is given the ports (by its options' type). */
  const providedProject =
    provide === undefined
      ? viewRecordPorts === undefined
        ? projectMachine.provide({ actors: projectActors })
        : projectMachine.provide({
            actors: {
              ...projectActors,
              viewRecord: createCallbackLogic<{ type: 'never' }, ViewRecordSessionActorInput>(({ input: session }) =>
                startViewRecordSession({ viewId: session.viewId, graphics: session.graphics, ports: viewRecordPorts }),
              ),
            },
          })
      : projectMachine.provide({ actors: provide.actors });

  const providedEditor = editorMachine.provide({
    actors: {
      loadEditorStateActor: fromSafeAsync(async ({ input }) => {
        if (profile === 'shared') {
          return { type: 'editorStateRetrieved', state: undefined };
        }
        const state = await library.getEditorState(input.projectId);
        return { type: 'editorStateRetrieved', state };
      }),
      saveEditorStateActor: fromSafeAsync(async ({ input }) => {
        if (profile === 'shared') {
          return;
        }
        await library.updateEditorState(input.editorState);
      }),
      ensureFocusedChatActor: fromSafeAsync(async ({ input }) => {
        if (profile === 'shared') {
          return { type: 'focusedChatEnsured', focusedChatId: `shared:${input.projectId}` };
        }
        return ensureFocusedChatForProject({
          projectId: input.projectId,
          requestedChatId: input.requestedChatId,
          persistedChatId: input.persistedChatId,
          worker: library,
          canCreateChat: () => {
            const status = peekRevisionClient(input.projectId)?.status();
            if (isCloudProjectPending(input.projectId) && status?.sync.hasAppliedRemote !== true) {
              return false;
            }
            return status?.remote.kind !== 'tau' || status.sync.chats === 'ready';
          },
          onCreatedChat: (chatId) => {
            chatSessions?.noteCreatedEmpty(chatId);
            void library.invalidateChatListing(input.projectId);
          },
        });
      }),
    } satisfies Partial<MachineActors<typeof editorMachine>>,
  });

  const machine = projectRuntimeMachine.provide({
    actors: {
      project: providedProject,
      editor: providedEditor,
      parameterObservers: createParameterObserversLogic({
        parameterService,
        publishesPreviewParameters: previewParameterService !== undefined,
      }),
      manifestObservation: createManifestObservationLogic({ projectId, fileManagerRef }),
      libraryEvents: createLibraryEventsLogic({ projectId, profile, library }),
      resources: createResourcesLogic({
        parameterService,
        closesParameterService: profile === 'shared' && previewParameterService === undefined,
      }),
      parameterServiceOwner:
        previewParameterService === undefined
          ? createParameterServiceOwnerLogic({ fileManager, holder: parameterService, source: parameterSource })
          : parameterServiceOwner,
      entriesRecord:
        options.entriesRecord === undefined
          ? entriesRecord
          : createEntriesRecordLogic({ session: options.entriesRecord, producers }),
    },
  });

  const { clock, inspect, onRejectedEvent } = options;
  // An explicit `undefined` would replace xstate's own default, so only what was given is passed on.
  const actor = createActor(machine, {
    ...(clock === undefined ? {} : { clock }),
    ...(inspect === undefined ? {} : { inspect }),
    ...(onRejectedEvent === undefined ? {} : { onRejectedEvent }),
    input: {
      projectId,
      profile,
      project: {
        projectId,
        fileManagerRef,
        fileSystemRoot,
        kernelOptionsFactory,
        recycleHeapBytes: runtimeRecycleHeapBytes(isMemoryConstrainedDevice()),
        ...options.input,
      },
      editor: {
        projectId,
        ...(options.requestedChatId === undefined ? {} : { requestedChatId: options.requestedChatId }),
      },
    },
  });
  return {
    actor,
    parameterService: { get: parameterService.get, subscribe: parameterService.subscribe },
    producers,
    replacePreviewParameterService: (service) => {
      if (previewParameterService !== undefined && service !== parameterService.get()) {
        parameterService.replace(service);
      }
    },
  };
}
