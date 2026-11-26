/**
 * HA-I10: the writer's lock marker stays fresh on every heartbeat tick with a target, shared or not, outside the chat's
 * serial chain and before any publish.
 */
import { describe, expect, it, vi } from 'vitest';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import type { AgentLogEvent } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';
import { fakePlacement, hostOptions, tools } from '#host/tau-agent-host.fixture.js';

const heartbeatInterval = 20;

/** A model that streams nothing until its run is stopped: the run is live and quiet. */
const quietTransport = (started: PromiseWithResolvers<void>): ModelTransport => ({
  funding: { type: 'unfunded' },
  async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    started.resolve();
    await new Promise<void>((resolve) => {
      request.signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    yield { type: 'completed', stopReason: 'aborted' };
  },
});

/** A memory log whose storage records `touch` calls and can hold a heartbeat append (the chat's chain) forever. */
const touchedLog = (calls: string[], holdHeartbeat: boolean) => {
  const held = Promise.withResolvers<void>();
  let bytes = new Uint8Array(new ArrayBuffer(0));
  const decoder = new TextDecoder();
  return {
    release: () => {
      held.resolve();
    },
    heartbeats: () =>
      decoder
        .decode(bytes)
        .split('\n')
        .filter((line) => line !== '' && (JSON.parse(line) as AgentLogEvent).type === 'run.heartbeat').length,
    open: async () => {
      const storage: EventLogStorage = {
        read: async () => bytes,
        append: async (next) => {
          if (holdHeartbeat && decoder.decode(next).includes('"run.heartbeat"')) {
            calls.push('append-held');
            await held.promise;
          }
          const combined = new Uint8Array(bytes.byteLength + next.byteLength);
          combined.set(bytes);
          combined.set(next, bytes.byteLength);
          bytes = combined;
        },
        truncate: async (size) => {
          bytes = bytes.slice(0, size);
        },
        close: async () => undefined,
        size: async () => bytes.byteLength,
        exclusive: async (section) => section(),
        touch: async () => {
          calls.push('touch');
        },
      };
      return createEventLogAppender(storage);
    },
  };
};

const start = (
  log: ReturnType<typeof touchedLog>,
  publish: NonNullable<ReturnType<typeof fakePlacement>['port']['publish']>,
) => {
  const started = Promise.withResolvers<void>();
  const toolRegistry = tools(async () => ({ content: null, isError: false }));
  const host = createTauAgentHost({
    ...hostOptions({ openEventLog: log.open, transport: quietTransport(started), toolRegistry, idPrefix: 'touch' }),
    delays: { runHeartbeat: heartbeatInterval },
    placement: { ...fakePlacement({ registry: toolRegistry }).port, publish },
  });
  const admission = host.admit({
    chatId: 'chat-touch',
    runId: 'run-touch',
    trigger: 'submit',
    message: { id: 'turn-touch', role: 'user', content: 'Think quietly.' },
  });
  return {
    started: started.promise,
    stop: async () => {
      await host.close();
      await admission.catch(() => undefined);
    },
  };
};

describe('the writer marker touch (HA-I10)', () => {
  it('should touch on every tick of an unshared quiet run, which writes no heartbeat row', async () => {
    const calls: string[] = [];
    const log = touchedLog(calls, false);
    const run = start(log, async ({ requestId }) => ({
      requestId,
      status: 'refused',
      code: 'CHAT_NOT_SHARED',
      message: 'Not shared.',
    }));
    await run.started;
    /* Many intervals stand in for the 11 quiet minutes: the marker stays fresh throughout. */
    await vi.waitFor(() => {
      expect(calls.filter((call) => call === 'touch').length).toBeGreaterThanOrEqual(5);
    });
    expect(log.heartbeats()).toBe(0);
    await run.stop();
  });

  it('should touch before the chain and any publish, even while the chain is held and the publish hangs', async () => {
    const calls: string[] = [];
    const log = touchedLog(calls, true);
    const run = start(log, async () => {
      calls.push('publish');
      return new Promise<never>(() => {
        /* The publish never answers. */
      });
    });
    await run.started;
    await vi.waitFor(() => {
      expect(calls).toContain('append-held');
    });
    const firstTouch = calls.indexOf('touch');
    expect(firstTouch).toBeGreaterThanOrEqual(0);
    expect(firstTouch).toBeLessThan(calls.indexOf('append-held'));
    /* The held append stalls the tick that wrote it, and with it the next tick: the marker is touched regardless. */
    await vi.waitFor(() => {
      expect(
        calls.slice(calls.indexOf('append-held')).filter((call) => call === 'touch').length,
      ).toBeGreaterThanOrEqual(3);
    });
    log.release();
    await run.stop();
  });
});
