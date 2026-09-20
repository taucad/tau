import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { createAgentSession } from '#harness/session.js';
import { reduceEventLog } from '#log/reducer.js';
import { parseEventLog } from '#log/serialization.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const fixture = gunzipSync(
  readFileSync(new URL('testing/replay/sanitized-production-through-seq-859.events.jsonl.gz', import.meta.url)),
).toString();

class ReplayTransport implements ModelTransport {
  public readonly requests: ModelStreamRequest[] = [];

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    if (this.requests.length === 1) {
      yield { type: 'tool-input', toolCallId: 'replay-call', toolName: 'read_file', input: { targetFile: 'x' } };
      yield { type: 'completed', stopReason: 'toolUse' };
      return;
    }
    yield { type: 'text-delta', text: 'replay complete' };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

describe('production compaction replay', () => {
  it('should reduce the sanitized production history and complete one tool turn', async () => {
    expect(fixture).not.toMatch(/aerodynamic|racing|OpenSCAD/iu);
    const seeded = parseEventLog(fixture);
    expect(seeded).toHaveLength(860);
    expect(() => reduceEventLog(seeded)).not.toThrow();

    const file = createMemoryEventLogFile();
    const seedLog = await file.open();
    for (const event of seeded) {
      // oxlint-disable-next-line no-await-in-loop -- Preserve the production JSONL cursor order.
      await seedLog.append(event);
    }
    await seedLog.close();

    const transport = new ReplayTransport();
    const invoke = vi.fn(async () => ({ content: { ok: true }, isError: false }));
    const tools: ToolRegistry = {
      list: () => [{ name: 'read_file', description: 'Read a file.', inputSchema: { type: 'object' } }],
      invoke,
    };
    let id = 0;
    const session = await createAgentSession({
      chatId: 'sanitized-production-replay',
      runId: 'replay-run',
      leaderEpoch: 'replay-epoch',
      systemPrompt: 'system',
      model: { id: 'replay-model', contextWindow: 200_000, providerKind: 'xai' },
      modelTransport: transport,
      toolRegistry: tools,
      eventLog: await file.open(),
      summarize: async () => 'Sanitized production history.',
      createId: () => `replay-${id++}`,
      now: () => new Date('2026-09-20T00:00:00.000Z'),
    });

    await session.prompt({ id: 'replay-user', role: 'user', content: 'continue' });

    const snapshot = await session.snapshot();
    const log = await file.open();
    const events = await log.read();
    const replayed = reduceEventLog(events);
    const compactions = events.flatMap((event) => {
      if (event.type !== 'history.compacted' && event.type !== 'message.envelope-replaced') {
        return [];
      }
      return event.details === undefined ? [] : [event];
    });
    const terminal = events.findLast((event) => event.runId === 'replay-run' && event.type === 'run.lifecycle');

    expect(compactions).toHaveLength(1);
    expect(compactions[0]?.details?.tier).toBe('tool_result_clearing');
    expect(terminal?.type === 'run.lifecycle' && terminal.state).toBe('completed');
    expect(snapshot.failure).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain('SESSION_LOG_INTEGRITY');
    expect(replayed).toEqual(snapshot.messages);
    expect(transport.requests).toHaveLength(2);
    expect(invoke).toHaveBeenCalledOnce();

    await log.close();
    await session.close();
  });
});
