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
import { flush } from '@taucad/xstate-testing/clock';
import { createSessionsActor, selectProjectSessionRuntime } from '#services/sessions-store.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { sessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeFacts } from '#services/sessions-store.js';
import type { ProjectSessionOpenRequest } from '#machines/project-session.machine.js';

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

const harness = (facts: Partial<SessionRuntimeFacts> = {}): Harness => {
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
          close: () => {
            if (!runtime.isClosed()) {
              closes.push(`runtime:${opener.built.indexOf(runtime)}`);
            }
            runtime.close();
          },
        };
      },
    },
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

  it('should build the next runtime and then stop this one when the choices select another kernel, with no flush (D14)', async () => {
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
    /* Built before the one it replaces stops, so the entries record session yields with a flush (I13). */
    expect(closes).toEqual(['open:0', 'open:1', 'runtime:0']);
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
