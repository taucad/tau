import { ChildProcess } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createActor, createCallbackLogic } from 'xstate';
import type { AcpSessionEvent } from '#acp/acp-machine-schemas.js';
import { describe, expect, it, vi } from 'vitest';
import { flush } from '@taucad/xstate-testing/clock';
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
      createCallbackLogic<AcpSessionEvent>(({ receive }) => {
        receive((event) => events.push(event));
      }),
    );
    parent.start();
    const actor = createActor(createAdapterConnection(), {
      parent,
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
    });
    actor.start();
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
});
