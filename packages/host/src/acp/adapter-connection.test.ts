import { ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createActor, createAsyncLogic, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { childEventSchemas } from '#acp/acp-machine-schemas.js';
import type { AcpSessionEvent } from '#acp/acp-machine-schemas.js';
import { describe, expect, it, vi } from 'vitest';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, createFakeParent } from '@taucad/xstate-testing/fakes';
import { acpSessionMachine } from '#acp/acp-session.machine.js';
import { createAdapterConnection } from '#acp/adapter-connection.js';
import { spawnAcpAdapter } from '#acp/spawn.js';
import type * as Spawn from '#acp/spawn.js';
import { grokPermissionNotification } from '#acp/grok-controls.js';
import type { AcpAdapter } from '#acp/index.js';

vi.mock('#acp/spawn.js', () => ({ spawnAcpAdapter: vi.fn() }));

const fakeAdapter = (modulePath: string): AcpAdapter => ({
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath,
});

type AdapterExited = Extract<AcpSessionEvent, { readonly type: 'adapterExited' }>;

/* The connection under a parent that records each `adapterExited` it reports. */
const connect = (adapter: AcpAdapter, cwd: string): { readonly stop: () => void; readonly events: AdapterExited[] } => {
  const events: AdapterExited[] = [];
  const parent = createActor(
    setup({
      schemas: {
        events: childEventSchemas,
        children: { adapter: types<ActorRefFrom<ReturnType<typeof createAdapterConnection>>>() },
      },
      actors: { adapter: createAdapterConnection() },
    }).createMachine({
      invoke: { id: 'adapter', src: 'adapter', input: { adapter, cwd } },
      on: {
        adapterExited: ({ event }) => {
          events.push(event);
          return {};
        },
      },
    }),
  );
  parent.start();
  return {
    stop: () => {
      parent.stop();
    },
    events,
  };
};

describe('ACP adapter connection', () => {
  it('should fail closed when a permission notification cannot reach the adapter', async () => {
    const signal = vi.fn();
    const child = new ChildProcess();
    const written = vi.fn(() => {
      throw new Error('broken pipe');
    });
    vi.mocked(spawnAcpAdapter).mockReturnValue({
      // Only exit/error subscriptions are needed; the real SDK still owns the failing wire.
      child: child as ChildProcessWithoutNullStreams,
      stream: { readable: new ReadableStream(), writable: new WritableStream({ write: written }) },
      stderr: () => 'adapter pipe closed',
      signal,
      close: vi.fn(),
    });
    const events: AcpSessionEvent[] = [];
    const parent = createActor(
      setup({
        schemas: {
          events: childEventSchemas,
          children: { adapter: types<ActorRefFrom<ReturnType<typeof createAdapterConnection>>>() },
        },
        actors: { adapter: createAdapterConnection() },
      }).createMachine({
        invoke: {
          id: 'adapter',
          src: 'adapter',
          input: {
            adapter: {
              id: 'grok',
              displayName: 'Grok',
              package: 'fixture',
              version: '1.0.52',
              configEnv: [],
              modulePath: '/unused',
            },
            cwd: '/unused',
          },
        },
        on: {
          adapterExited: ({ event }) => {
            events.push(event);
            return {};
          },
          callSettled: ({ event }) => {
            events.push(event);
            return {};
          },
        },
      }),
    );
    parent.start();
    const actor = parent.getSnapshot().children.adapter!;
    try {
      actor.send({ type: 'notify', ...grokPermissionNotification('ask') });
      actor.send({
        type: 'call',
        id: 'prompt',
        method: 'session/prompt',
        params: { sessionId: 'session', prompt: [{ type: 'text', text: 'Do work' }] },
      });
      await flush();
      /* A failed call reads its stderr tail after two event-loop turns (`stderrWrittenBefore`). */
      for (let turn = 0; turn < 2; turn++) {
        // oxlint-disable-next-line no-await-in-loop -- one event-loop turn at a time, as the connection takes them.
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
      }
      await flush();
      expect(written).toHaveBeenCalledTimes(1);
      expect(signal).toHaveBeenCalledWith('SIGKILL');
      expect(events).toContainEqual({ type: 'adapterExited', stderr: 'adapter pipe closed' });
      expect(events.find((event) => event.type === 'callSettled')).toMatchObject({
        type: 'callSettled',
        id: 'prompt',
        answer: { error: { message: 'broken pipe' } },
      });
      child.emit('exit');
      expect(events.filter((event) => event.type === 'adapterExited')).toHaveLength(1);
    } finally {
      parent.stop();
    }
  });

  it('should report the stderr that drains after the adapter exits', async () => {
    const child = new ChildProcess();
    let stderr = 'starting\n';
    vi.mocked(spawnAcpAdapter).mockReturnValue({
      child: child as ChildProcessWithoutNullStreams,
      stream: { readable: new ReadableStream(), writable: new WritableStream() },
      stderr: () => stderr,
      signal: vi.fn(),
      close: vi.fn(),
    });
    const { stop, events } = connect(fakeAdapter('/unused'), '/unused');
    try {
      /* Node may emit `exit` before the stderr pipe is drained; the last line is read just before `close`. */
      child.emit('exit', 3, null);
      await flush();
      stderr += 'fatal: last words\n';
      child.emit('close', 3, null);
      await flush();
      expect(events).toEqual([{ type: 'adapterExited', stderr: 'starting\nfatal: last words\n' }]);
    } finally {
      stop();
    }
  });

  it('should report an exit whose stdio a descendant holds open once the drain window passes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const child = new ChildProcess();
    vi.mocked(spawnAcpAdapter).mockReturnValue({
      child: child as ChildProcessWithoutNullStreams,
      stream: { readable: new ReadableStream(), writable: new WritableStream() },
      stderr: () => 'fatal: last words\n',
      signal: vi.fn(),
      close: vi.fn(),
    });
    const { stop, events } = connect(fakeAdapter('/unused'), '/unused');
    try {
      child.emit('exit', 3, null);
      await vi.advanceTimersByTimeAsync(999);
      expect(events).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(events).toEqual([{ type: 'adapterExited', stderr: 'fatal: last words\n' }]);
      child.emit('close', 3, null);
      expect(events).toHaveLength(1);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it('should report everything a real adapter wrote to stderr right before it exited', async () => {
    const actual = await vi.importActual<typeof Spawn>('#acp/spawn.js');
    vi.mocked(spawnAcpAdapter).mockImplementation(actual.spawnAcpAdapter);
    const root = await mkdtemp(join(tmpdir(), 'tau-acp-exit-'));
    const modulePath = join(root, 'dying-adapter.mjs');
    await writeFile(
      modulePath,
      "import { writeSync } from 'node:fs';\nwriteSync(2, 'x'.repeat(32_768) + '\\n');\nwriteSync(2, 'fatal: last words\\n');\nprocess.exit(3);\n",
    );
    const { stop, events } = connect(fakeAdapter(modulePath), root);
    try {
      await vi.waitFor(() => {
        expect(events).toHaveLength(1);
      });
      expect(events[0]?.stderr).toMatch(/x\nfatal: last words\n$/);
    } finally {
      stop();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should fail the session with CLI_NOT_FOUND, without looping, when the CLI is gone at spawn', async () => {
    const gone = Object.assign(new Error('/Applications/Fake.app/fake is gone. The fake CLI was not found.'), {
      code: 'CLI_NOT_FOUND',
    });
    vi.mocked(spawnAcpAdapter).mockImplementation(() => {
      throw gone;
    });
    const parent = createFakeParent();
    const fakes = createFakeCallbackActors();
    const actor = createActor(
      acpSessionMachine.provide({
        actors: {
          adapterConnection: createAdapterConnection(),
          lentTurn: fakes.actor('lentTurn'),
          publishSkills: createAsyncLogic<readonly string[], undefined>({ run: async () => [] }),
          persistPresentation: createAsyncLogic<void, unknown>({ run: async () => undefined }),
        },
      }),
      {
        input: {
          key: 'fake:chat-1',
          parentRef: parent.ref,
          opening: {
            adapter: {
              id: 'fake',
              displayName: 'Fake',
              configEnv: [],
              cli: 'fake',
              args: ['acp'],
              executablePath: '/Applications/Fake.app/fake',
              executableSource: 'fallback',
            },
            cwd: '/work',
            mcpServers: [],
            sessionMessageId: 'session-message',
            sessionCommitted: false,
            notices: true,
          },
          lend: { requestId: 'run-1:0', prompt: { fresh: [{ type: 'text', text: 'hi' }] } },
        },
        clock: new StepClock(),
      },
    );
    try {
      actor.start();
      await flush();
      expect(actor.getSnapshot().status).toBe('done');
      expect(parent.events).toMatchObject([
        {
          type: 'turnEnded',
          resting: false,
          outcome: { ok: false, failure: { code: 'CLI_NOT_FOUND', message: gone.message } },
        },
        { type: 'closed', failure: { code: 'CLI_NOT_FOUND', message: gone.message } },
      ]);
    } finally {
      actor.stop();
    }
  });
});
