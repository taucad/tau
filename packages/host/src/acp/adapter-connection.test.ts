import { ChildProcess } from 'node:child_process';
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
import { grokPermissionNotification } from '#acp/grok-controls.js';

vi.mock('#acp/spawn.js', () => ({ spawnAcpAdapter: vi.fn() }));

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
