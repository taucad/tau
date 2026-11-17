/**
 * A6d: the project runtime is a lazy session child (plan § 4 A6d; charter D4, D5, D8, I5; rows S12, S34, S38; M2).
 *
 * The session's `project` child builds the project runtime once its `fileManager` child has opened the file manager,
 * through the opener the app runtime composes (a dynamic import there). It hands the runtime the open request's native
 * kernel id and chat, reports the runtime region from the runtime's facts, says when the chat session is ready and
 * which chat the editor focused, forwards each later chat request, rebuilds when the device's choices select another
 * kernel and stops the runtime with the session. On `main` the child was a relay that waited for the React subtree to
 * report the runtime region, `chatReady` was a constant `true`, and nothing was built: every row below fails there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { createSessionsActor, selectProjectSessionRuntime } from '#services/sessions-store.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { sessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeOpenerStandIn, SessionRuntimeStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeFacts, SessionWiring } from '#services/sessions-store.js';
import { projectSessionParkWindowMilliseconds } from '#machines/project-session.machine.js';
import type { ProjectSessionOpenRequest } from '#machines/project-session.machine.js';
import type * as AppRuntimeFaultsModule from '#runtime/app-runtime-faults.js';

type AppRuntimeFaults = typeof AppRuntimeFaultsModule;

const reportFault = vi.hoisted(() => vi.fn());
vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<AppRuntimeFaults>()),
  reportAppRuntimeFault: reportFault,
}));

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const projectId = 'proj_a6d_runtime';

type Harness = Readonly<{
  registry: ReturnType<typeof createSessionsActor>;
  files: SessionFileManagerStandIn[];
  opener: SessionRuntimeOpenerStandIn;
  /** Every runtime built, and every close of a file manager or runtime, in order. */
  closes: string[];
}>;

let current: Harness | undefined;

const harness = (facts: Partial<SessionRuntimeFacts> = {}, clock?: StepClock, wiring?: SessionWiring): Harness => {
  const files: SessionFileManagerStandIn[] = [];
  const closes: string[] = [];
  const opener = sessionRuntimeOpenerStandIn(facts);
  const { open } = opener;
  const registry = createSessionsActor({
    openFileManager: (id) => {
      const standIn = openSessionFileManagerStandIn(id);
      files.push(standIn);
      return {
        ...standIn,
        close: () => {
          closes.push('fileManager');
          standIn.close();
        },
      };
    },
    openRuntime: {
      ...opener,
      open: async (input) => {
        await open(input);
        const runtime = opener.built.at(-1)!;
        closes.push(`open:${opener.built.length - 1}`);
        return {
          ...runtime,
          /* A replacement's flush; the session's own flushes (A7c) are the stand-in's signals. */
          flush: async (kind, gone) => {
            if (kind === 'replace') {
              closes.push(`flush:${opener.built.indexOf(runtime)}`);
            }
            await runtime.flush(kind, gone);
          },
          close: () => {
            if (!runtime.isClosed()) {
              closes.push(`runtime:${opener.built.indexOf(runtime)}`);
            }
            runtime.close();
          },
        };
      },
    },
    ...(clock === undefined ? {} : { clock }),
    ...(wiring === undefined ? {} : { wiring }),
  }).start();
  current = { registry, files, opener, closes };
  return current;
};

const sessionOf = (registry: Harness['registry']) => registry.getSnapshot().context.refs[projectId];

const open = async (registry: Harness['registry'], request?: ProjectSessionOpenRequest): Promise<void> => {
  registry.send({ type: 'open', projectId, ...(request === undefined ? {} : { request }) });
  await flush();
};

afterEach(() => {
  current?.registry.stop();
  current = undefined;
});

describe('the session builds its project runtime as a child (A6d)', () => {
  it("should build the runtime on its file manager, with the open request's native kernel and chat (S12, S34)", async () => {
    const { registry, files, opener } = harness();

    await open(registry, { workspace: 'ws', nativeKernelId: 'build123d', chatId: 'chat-1' });

    expect(opener.built).toHaveLength(1);
    expect(opener.built[0]?.input).toMatchObject({
      projectId,
      fileManagerRef: files[0]?.fileManagerRef,
      request: { nativeKernelId: 'build123d', chatId: 'chat-1' },
    });
    expect(opener.built[0]?.chats).toEqual([{ chatId: 'chat-1', createdChatId: undefined }]);
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[0]?.runtimeRef);
  });

  it('I5: should go live once its runtime has loaded the project, with nothing mounted', async () => {
    const { registry, opener } = harness({ loaded: false });
    await open(registry);

    expect(sessionOf(registry)?.getSnapshot().matches('opening')).toBe(true);

    opener.built[0]?.set({ loaded: true });
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should fail the runtime region with a kernel refusal and clear it when the kernel is back (R4)', async () => {
    const { registry, opener } = harness();
    await open(registry);

    opener.built[0]?.set({ kernelRefusal: 'Kernel budget reached' });
    await flush();
    expect(sessionOf(registry)?.getSnapshot().context.failures).toEqual({ runtime: 'Kernel budget reached' });

    opener.built[0]?.set({ kernelRefusal: undefined });
    await flush();
    expect(sessionOf(registry)?.getSnapshot().context.failures).toEqual({});
  });

  it('M2: should report the chat session ready only once the editor has left ensuring the focused chat', async () => {
    const { registry, opener } = harness({ chatReady: false });
    await open(registry);

    expect(registry.getSnapshot().context.status[projectId]).toMatchObject({ state: 'live', chatReady: false });

    opener.built[0]?.set({ chatReady: true });
    await flush();

    expect(registry.getSnapshot().context.status[projectId]).toMatchObject({ chatReady: true });
  });

  it("should hand each later chat request to the runtime's editor, once per change (S12)", async () => {
    const { registry, opener } = harness();
    await open(registry, { workspace: 'ws', chatId: 'chat-1' });

    registry.send({ type: 'chatRequested', projectId, chatId: 'chat-2' });
    registry.send({ type: 'chatRequested', projectId, chatId: 'chat-2' });
    registry.send({ type: 'chatRequested', projectId, chatId: 'chat-new', createdChatId: 'chat-new' });
    await flush();

    expect(opener.built[0]?.chats).toEqual([
      { chatId: 'chat-1', createdChatId: undefined },
      { chatId: 'chat-2', createdChatId: undefined },
      { chatId: 'chat-new', createdChatId: 'chat-new' },
    ]);
  });

  it('should tell the registry which chat the editor focused for the chat it was asked for, and no other (I18)', async () => {
    const { registry, opener } = harness();
    const focused: unknown[] = [];
    registry.on('chatFocused', (event) => {
      focused.push(event);
    });
    await open(registry, { workspace: 'ws', chatId: 'chat-1' });

    /* A resolution of a chat the session has moved away from is not reported. */
    opener.built[0]?.set({ focusedChat: { requestedChatId: 'chat-0', chatId: 'chat-0' } });
    opener.built[0]?.set({ focusedChat: { requestedChatId: 'chat-1', chatId: 'chat-1' } });
    await flush();

    expect(focused).toEqual([{ type: 'chatFocused', projectId, requestedChatId: 'chat-1', chatId: 'chat-1' }]);
  });

  it('should ask the editor for the chat it showed itself, so its next focus change is reported (D21 round 1)', async () => {
    const { registry, opener } = harness();
    const focused: unknown[] = [];
    registry.on('chatFocused', (event) => {
      focused.push(event);
    });
    await open(registry);
    opener.built[0]?.set({ focusedChat: { requestedChatId: undefined, chatId: 'chat-y' } });
    await flush();
    expect(opener.built[0]?.chats.at(-1)).toEqual({ chatId: 'chat-y', createdChatId: undefined });

    /* The editor moves to another chat on its own: its request is still the chat it was asked for. */
    opener.built[0]?.set({ focusedChat: { requestedChatId: 'chat-y', chatId: 'chat-n' } });
    await flush();

    expect(focused).toEqual([
      { type: 'chatFocused', projectId, chatId: 'chat-y' },
      { type: 'chatFocused', projectId, requestedChatId: 'chat-y', chatId: 'chat-n' },
    ]);
  });

  it('should tell the route its chat when a live project is opened again with no chat (A0.1 I2 witness)', async () => {
    const { registry, opener } = harness();
    const focused: unknown[] = [];
    registry.on('chatFocused', (event) => {
      focused.push(event);
    });
    await open(registry, { workspace: 'ws' });
    opener.built[0]?.set({ focusedChat: { requestedChatId: undefined, chatId: 'chat-x' } });
    await flush();

    /* Focus opens the retained project again through a link with no chat. */
    registry.send({ type: 'open', projectId, request: { workspace: 'ws' } });
    await flush();

    expect(focused).toEqual([
      { type: 'chatFocused', projectId, chatId: 'chat-x' },
      { type: 'chatFocused', projectId, chatId: 'chat-x' },
    ]);
  });

  it('should report the focused chat again when the route asks for no chat while the editor shows one (I2 witness)', async () => {
    const { registry, opener } = harness();
    const focused: unknown[] = [];
    registry.on('chatFocused', (event) => {
      focused.push(event);
    });
    await open(registry);
    /* The editor ensured a chat for a route that named none; focus shows it on the route. */
    opener.built[0]?.set({ focusedChat: { requestedChatId: undefined, chatId: 'chat-x' } });
    await flush();

    /* The person comes back to the project through a link with no chat: the route must be told again. */
    registry.send({ type: 'chatRequested', projectId });
    await flush();

    expect(focused).toEqual([
      { type: 'chatFocused', projectId, chatId: 'chat-x' },
      { type: 'chatFocused', projectId, chatId: 'chat-x' },
    ]);
  });

  it('should build the next runtime and then stop this one when the choices select another kernel (A6e flushes first)', async () => {
    const { registry, opener, closes } = harness();
    await open(registry, { workspace: 'ws', chatId: 'chat-1' });

    /* A change that keeps the kernel rebuilds nothing. */
    opener.changeChoices();
    await flush();
    expect(opener.built).toHaveLength(1);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();

    expect(opener.built).toHaveLength(2);
    expect(opener.built[1]?.input.request).toMatchObject({ chatId: 'chat-1' });
    /* Flushed first (B4), then built before the one it replaces stops, so the entries record session yields (I13). */
    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0']);
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should stop its runtime before its file manager when the session closes (I23)', async () => {
    const { registry, closes } = harness();
    await open(registry);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();

    expect(sessionOf(registry)).toBeUndefined();
    expect(closes).toEqual(['open:0', 'runtime:0', 'fileManager']);
  });
});

/**
 * A6e: a change of kernel selection is the session event `replaceRuntime` (plan § 4 A6e; charter D8, B4; R1-F7). The
 * superseded runtime writes what it owes before it stops, which A6d's risk "writes dropped on a kernel change" names: on
 * `main` the old runtime stops with no flush, so a layout or editor-state edit owed at the moment of the change is lost
 * (main's 5 s lease grace used to let the debounced write land).
 */
describe('a change of kernel selection replaces the runtime through the session (A6e)', () => {
  /** A flush a row settles itself. */
  const held = () => {
    let settle: (error?: Error) => void = () => undefined;
    const flush = async (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        settle = (error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        };
      });
    return {
      flush,
      settle: (error?: Error) => {
        settle(error);
      },
    };
  };

  /* A7c: the close's producer flush is the runtime's own `flush('close')`; a row holds it, then lets it land or refuse. */
  const heldClose = (runtime: SessionRuntimeStandIn | undefined) => {
    const release = runtime?.hold((signal) => signal === 'flush:close') ?? (() => undefined);
    return {
      settle: (error?: Error) => {
        if (error !== undefined) {
          runtime?.refuse(error.message);
        }
        release();
      },
    };
  };

  /* A7c: the wiring the session's close cancels runs through; its revision client quiesces at once. */
  const wiringCancelling = (cancelProjectedRun: () => Promise<'stopped' | 'continuing'>): SessionWiring =>
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wiring the app runtime composes, its leaves stood in.
    ({
      loadRevisions: async () => ({
        createSessionRevisionsPorts: (ports: unknown) => ports,
        sessionRevisionsCallback:
          () =>
          ({
            sendBack,
            receive,
          }: Readonly<{
            sendBack: (event: { type: string; requestId?: string }) => void;
            receive?: (listener: (event: { type: string; requestId?: string }) => void) => void;
          }>) => {
            receive?.((event) => {
              if (event.type === 'quiesce') {
                sendBack({ type: 'syncQuiesced', requestId: event.requestId });
              }
            });
            return () => undefined;
          },
      }),
      loadHostConnector: async () => ({ hostConnectorCallback: () => () => () => undefined }),
      registerCloseCut: () => () => undefined,
      registerProducer: () => () => undefined,
      focusedProject: { get: () => undefined, subscribe: () => () => undefined },
      documentVisible: { get: () => true, subscribe: () => () => undefined },
      chatSessions: {
        cancelProjectedRun,
        publishProjectHostConnector: () => undefined,
        getChatHostSettings: () => undefined,
        setRevisionFacts: () => undefined,
      },
      choices: () => {
        throw new Error('no chat attaches in these rows');
      },
      rootSync: () => ({ syncProjectRoots: async () => undefined, close: () => undefined }),
    }) as unknown as SessionWiring;

  it('B4: should land what the superseded runtime owes before it stops, with nothing mounted', async () => {
    const { registry, opener, closes } = harness();
    await open(registry, { workspace: 'ws', chatId: 'chat-1' });
    /* A layout edit inside its 500 ms debounce, owed by runtime 0 when the person moves compute. */
    opener.built[0]?.owed.push('layout edit');

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();

    expect(opener.built[0]?.landed).toEqual(['layout edit']);
    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0']);
    expect(opener.built[1]?.input.request).toMatchObject({ chatId: 'chat-1' });
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should replace once when the choices change again during the flush, for the chat asked meanwhile', async () => {
    const { registry, opener, closes } = harness();
    await open(registry, { workspace: 'ws', chatId: 'chat-1' });
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    opener.changeChoices();
    registry.send({ type: 'chatRequested', projectId, chatId: 'chat-2' });
    await flush();
    flushing.settle();
    await flush();
    await flush();

    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0']);
    expect(opener.built[1]?.input.request).toMatchObject({ chatId: 'chat-2' });
  });

  it('should build nothing when the session closes during the flush, and stop the runtime it had (I23)', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();
    flushing.settle();
    await flush();
    await flush();

    expect(opener.built).toHaveLength(1);
    expect(closes).toEqual(['open:0', 'flush:0', 'runtime:0', 'fileManager']);
  });

  it('should build once, on the new file manager, when the file manager changes during the flush', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    /* The shared worker is replaced: the child closes the runtime on the old file manager and builds on the new one. */
    const next = openSessionFileManagerStandIn(projectId);
    sessionOf(registry)?.send({ type: 'fileManagerChanged', fileManagerRef: next.fileManagerRef });
    await flush();
    flushing.settle();
    await flush();
    await flush();

    expect(closes).toEqual(['open:0', 'flush:0', 'runtime:0', 'open:1']);
    expect(opener.built).toHaveLength(2);
    expect(opener.built[1]?.input.fileManagerRef).toBe(next.fileManagerRef);
    next.close();
  });

  it('should replace the runtime a new file manager built during the flush when its kernel changes before the flush settles', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    const next = openSessionFileManagerStandIn(projectId);
    sessionOf(registry)?.send({ type: 'fileManagerChanged', fileManagerRef: next.fileManagerRef });
    await flush();
    /* The runtime built on the new file manager is superseded while runtime 0's flush is still under way. */
    opener.built[1]?.supersede();
    opener.changeChoices();
    await flush();
    flushing.settle();
    await flush();
    await flush();
    await flush();

    expect(closes).toEqual(['open:0', 'flush:0', 'runtime:0', 'open:1', 'flush:1', 'open:2', 'runtime:1']);
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[2]?.runtimeRef);
    next.close();
  });

  it('should replace the runtime of a session that failed to open on a refused kernel (D21 round 2)', async () => {
    const { registry, opener } = harness({ kernelRefusal: 'Kernel budget reached' });
    await open(registry);
    expect(sessionOf(registry)?.getSnapshot().matches('failed')).toBe(true);

    /* Moving compute to another device is the remedy. */
    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();

    expect(opener.built).toHaveLength(2);
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
  });

  it('should replace the runtime once a close whose run cancel was under way during the change fails (D21 round 2)', async () => {
    let answer: (outcome: 'stopped' | 'continuing') => void = () => undefined;
    const { registry, opener } = harness(
      {},
      undefined,
      wiringCancelling(
        async () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
    );
    await open(registry);
    const session = sessionOf(registry)!;
    session.send({ type: 'projectedRunsChanged', runs: ['run-1'], stoppableRuns: ['run-1'] });
    registry.send({ type: 'close', projectId, reason: 'idle' });
    session.send({ type: 'confirmClose' });
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches({ closing: 'cancellingRuns' })).toBe(true);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    /* The run changed holder: the chat store could not stop it, so the close fails. */
    answer('continuing');
    await flush();
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('failed')).toBe(true);
    expect(opener.built).toHaveLength(2);
  });

  it('should still replace the runtime when the flush is refused, and report the refusal (D23 hook)', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const reported: unknown[] = [];
    reportFault.mockImplementation((error: unknown) => {
      reported.push(error);
    });
    const refusal = new Error('Pane layout is not confirmed saved.');
    opener.built[0]?.flushWith(async () => {
      throw refusal;
    });

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();

    expect(reported).toEqual([refusal]);
    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0']);
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should keep the runtime, still usable, when the choices come back to its kernel during the flush', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);
    const runtime = opener.built[0]!;
    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();

    /* The flush closes nothing, so the runtime the choices came back to is kept as it is. */
    runtime.restore();
    flushing.settle();
    await flush();
    await flush();

    expect(opener.built).toHaveLength(1);
    expect(runtime.isClosed()).toBe(false);
    expect(closes).toEqual(['open:0', 'flush:0']);
  });

  it('should replace the runtime once a close that was under way during the change is refused (D21 round 1)', async () => {
    const { registry, opener } = harness();
    await open(registry);
    const closing = heldClose(opener.built[0]);
    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    closing.settle(new Error('Unsaved parameter drafts'));
    await flush();
    await flush();

    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
    expect(selectProjectSessionRuntime(sessionOf(registry)!.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
  });

  it('A6 exit: should open, park, replace the runtime of and close a project in order, with no React', async () => {
    const clock = new StepClock();
    const { registry, opener, closes } = harness({}, clock);
    await open(registry, { workspace: 'ws' });
    const session = sessionOf(registry)!;
    const parking: boolean[] = [];
    session.on('runtimeParking', (event) => parking.push(event.parked));

    session.send({ type: 'visibilityChanged', visible: false, focused: false });
    clock.advance(projectSessionParkWindowMilliseconds);
    await flush();
    expect(parking).toEqual([true]);

    opener.built[0]?.owed.push('editor state');
    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();
    expect(opener.built[0]?.landed).toEqual(['editor state']);
    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0']);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();
    expect(sessionOf(registry)).toBeUndefined();
    expect(closes).toEqual(['open:0', 'flush:0', 'open:1', 'runtime:0', 'runtime:1', 'fileManager']);
  });

  it('should build nothing mid-close when a replacement handed on before the close settles its flush (D21 round 3)', async () => {
    const { registry, opener, closes } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);
    const closing = heldClose(opener.built[0]);
    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();
    const before = [...closes];
    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    flushing.settle();
    await flush();
    await flush();
    expect(closes).toEqual(before);

    /* The close is refused: the session is live again and the replacement goes ahead, flushed afresh. */
    closing.settle(new Error('Unsaved parameter drafts'));
    await flush();
    await flush();
    flushing.settle();
    await flush();
    await flush();
    expect(sessionOf(registry)?.getSnapshot().matches('live')).toBe(true);
    expect(closes).toEqual([...before, 'flush:0', 'open:1', 'runtime:0']);
  });

  it('should not report a flush the close cut short as a fault (D21 round 3)', async () => {
    const { registry, opener } = harness();
    await open(registry);
    reportFault.mockClear();
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();
    flushing.settle(new Error('Actor terminated without satisfying predicate'));
    await flush();
    await flush();

    expect(reportFault).not.toHaveBeenCalled();
  });

  it('should replace the runtime when a close asked again during a held replacement is cancelled (D21 round 4)', async () => {
    const { registry, opener } = harness();
    await open(registry);
    const flushing = held();
    opener.built[0]?.flushWith(flushing.flush);
    heldClose(opener.built[0]);
    const session = sessionOf(registry)!;
    session.send({ type: 'projectedRunsChanged', runs: ['run-1'], stoppableRuns: ['run-1'] });
    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    registry.send({ type: 'close', projectId, reason: 'user' });
    session.send({ type: 'confirmClose' });
    await flush();
    expect(session.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    expect(session.getSnapshot().matches({ closing: 'asking' })).toBe(true);
    flushing.settle();
    await flush();
    session.send({ type: 'cancelClose' });
    await flush();
    flushing.settle();
    await flush();
    await flush();

    expect(session.getSnapshot().matches('live')).toBe(true);
    expect(opener.built).toHaveLength(2);
    expect(selectProjectSessionRuntime(session.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
  });

  it('should replace the runtime when a close is asked again after a kernel change it ignored (D21 round 6)', async () => {
    const { registry, opener } = harness();
    await open(registry);
    /* The close's producer flush never lands. */
    heldClose(opener.built[0]);
    const session = sessionOf(registry)!;
    session.send({ type: 'projectedRunsChanged', runs: ['run-1'], stoppableRuns: ['run-1'] });
    registry.send({ type: 'close', projectId, reason: 'user' });
    session.send({ type: 'confirmClose' });
    await flush();
    expect(session.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    opener.built[0]?.supersede();
    opener.changeChoices();
    await flush();
    await flush();
    registry.send({ type: 'close', projectId, reason: 'user' });
    await flush();
    await flush();

    expect(session.getSnapshot().matches({ closing: 'asking' })).toBe(true);
    expect(opener.built).toHaveLength(2);
    expect(selectProjectSessionRuntime(session.getSnapshot())).toBe(opener.built[1]?.runtimeRef);
  });
});
