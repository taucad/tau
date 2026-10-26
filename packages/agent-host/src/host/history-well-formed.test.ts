/**
 * The model's history stays well formed past another device's abandoned run (round 21): every tool output follows its
 * call directly, before any other message, so the provider is never sent a stray tool result. A command that goes on
 * past an abandoned foreign run says that run's person's words in its own run's batch; they go where no call is left
 * open, after every rewind the batch holds (`carriedPlace`; `t14_plan_well_formed`, `t14_carried_survive_rewind` in
 * ChatLedger.lean).
 */
import type { Api, Message, Model } from '@earendil-works/pi-ai';
import { transformMessages } from '@earendil-works/pi-ai/api/transform-messages';
import { describe, expect, it, vi } from 'vitest';

import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
import { createTauAgentHost } from '#host/tau-agent-host.js';
import { createMemoryLogFile, hostOptions, readLog, seedLog, tools } from '#host/tau-agent-host.fixture.js';
import type { SeededLogEvent } from '#host/tau-agent-host.fixture.js';
import type { ForeignRun } from '#log/foreign-runs.js';
import { foreignRunStaleMilliseconds } from '#log/foreign-runs.js';
import type { ProviderMessage } from '#log/event-types.js';
import { reduceEventLog } from '#log/reducer.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';

/** Another device's run, admitted and never settled, whose pulls found its segment quiet past the bound. */
const abandonedDesktopRun: ForeignRun = {
  deviceId: 'device-desktop',
  runId: 'run-desktop',
  state: 'running',
  lastRecordedAt: Date.UTC(2026, 8, 1),
  tip: { leaderEpoch: 'desktop', sequence: 1 },
  observedAt: 0,
  pulledQuiet: foreignRunStaleMilliseconds + 1,
  words: { id: 'desktop-user', role: 'user', content: 'from the desktop' },
};

/** A run whose host went away, as `markAbandoned` leaves it, with `tail` its last message. */
const abandonedAfter = (tail: ProviderMessage): readonly SeededLogEvent[] => [
  { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
  { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
  { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
  { type: 'message.appended', runId: 'run-1', message: tail },
  {
    type: 'run.lifecycle',
    runId: 'run-1',
    state: 'failed',
    detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
  },
];

/** A reply that called one tool, which never returned. */
const callingReply: ProviderMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: [{ type: 'toolCall', id: 'call-read', name: 'read_file', arguments: { targetFile: 'main.ts' } }],
  metadata: { stopReason: 'toolUse' },
};

/** The marker the stream wrapper leaves when a call fails in transit: a Resume rewinds it. */
const transportMarker: ProviderMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: [],
  metadata: {
    diagnostics: [
      {
        type: 'tau.model-transport-failure',
        timestamp: 1,
        error: { name: 'GatewayModelTransportError', message: 'The stream dropped.', code: 'NETWORK_ERROR' },
      },
    ],
  },
};

/** A host over `file` whose log reads one abandoned run on another device, and whose model answers once. */
const hostPastAbandonedRun = (file: ReturnType<typeof createMemoryLogFile>, name: string) => {
  const requests: ModelStreamRequest[] = [];
  const transport: ModelTransport = {
    funding: { type: 'unfunded' },
    async *stream(request): AsyncGenerator<ModelStreamEvent> {
      requests.push(request);
      yield { type: 'text-delta', text: 'Carried on.' };
      yield { type: 'completed', stopReason: 'stop' };
    },
  };
  const host = createTauAgentHost(
    hostOptions({
      openEventLog: async () => {
        const log = await file.open();
        return {
          ...log,
          refresh: async () => undefined,
          foreignRuns: async () => [abandonedDesktopRun],
          foreignWroteSinceTermBegan: async () => false,
          runTakenOver: async () => false,
        };
      },
      transport,
      toolRegistry: tools(async () => ({ content: 'must not run', isError: false })),
      idPrefix: name,
    }),
  );
  return { host, requests };
};

/** The tool results the provider-bound list holds that do not follow their call directly (pi-ai's own transform). */
const strayResults = (messages: readonly ProviderMessage[]): string[] => {
  const model = {
    id: 'scripted-g2-model',
    name: 'fixture',
    api: 'anthropic-messages',
    provider: 'anthropic',
    baseUrl: '',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 4096,
  } as unknown as Model<Api>;
  const identities = new MessageIdentities(() => 'id');
  const bound = transformMessages(
    messages.flatMap((message) => providerMessageToPi(message, model, identities) ?? []) as Message[],
    model,
  );
  const stray: string[] = [];
  let open = new Set<string>();
  for (const message of bound) {
    if (message.role === 'assistant') {
      open = new Set(message.content.flatMap((block) => (block.type === 'toolCall' ? [block.id] : [])));
    } else if (message.role === 'toolResult') {
      if (!open.delete(message.toolCallId)) {
        stray.push(message.toolCallId);
      }
    } else {
      open = new Set();
    }
  }
  return stray;
};

describe('the history past another device’s abandoned run', () => {
  /*
   * Finding 1: a Resume computes the outputs that close the calls its history left open, then went on past the
   * abandoned run by saying its words at the head of the batch, between the call and its output. The provider's adapter
   * answered the call as having no result and then met the real result after a person's message: every later request
   * of the chat was rejected.
   */
  it('should close the calls a Resume found open before the abandoned run’s words', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, abandonedAfter(callingReply));
    const { host, requests } = hostPastAbandonedRun(file, 'resume-open-call');

    const final = await host.resume('chat-resume-open-call');

    const call = final.findIndex((message) => message.id === 'assistant-1');
    expect(final[call + 1]).toMatchObject({
      role: 'tool-output',
      toolCallId: 'call-read',
      content: { errorCode: 'CLIENT_DISCONNECTED' },
    });
    expect(final.findIndex((message) => message.id === 'desktop-user')).toBeGreaterThan(call + 1);
    expect(requests).toHaveLength(1);
    expect(strayResults(requests[0]!.messages)).toEqual([]);
    expect(strayResults(final)).toEqual([]);
    await host.close();
  });

  /*
   * Finding 2: a Resume that clears a transport failure's marker rewinds to what it named before anything was carried,
   * so the words it carried at the head of its batch were cut by its own rewind, and no later copy brought them back.
   */
  it('should keep the abandoned run’s words a Resume carries past its own rewind', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, abandonedAfter(transportMarker));
    const { host, requests } = hostPastAbandonedRun(file, 'resume-rewind');

    const final = await host.resume('chat-resume-rewind');

    expect(final.map((message) => message.id)).toContain('desktop-user');
    expect(final.map((message) => message.id)).not.toContain('assistant-1');
    expect(requests[0]?.messages.map((message) => message.id)).toContain('desktop-user');
    const rows = await readLog(file);
    const rewound = rows.findIndex((row) => row.type === 'history.rewound');
    const said = rows.findIndex((row) => row.type === 'message.appended' && row.message.id === 'desktop-user');
    expect(rewound).toBeGreaterThan(-1);
    expect(said).toBeGreaterThan(rewound);
    await host.close();
  });
});

describe('a person’s turn past another device’s abandoned run', () => {
  /*
   * Round 23: this device's last run went away mid-tool, so its history ends in a call no output answers. A new turn's
   * admission batch leaves that call open, so the abandoned run's words waited for the run's next batch, its turn's
   * commit, and were said after the person's new message: the model answered the stale prompt.
   */
  it('should say the abandoned run’s words before the person’s new turn when the history ends in an open call', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, abandonedAfter(callingReply));
    const { host, requests } = hostPastAbandonedRun(file, 'turn-open-call');

    await host.admit({
      chatId: 'chat-turn-open-call',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Now this.' },
    });
    await vi.waitFor(async () => {
      expect(await host.snapshot('chat-turn-open-call')).toMatchObject({ runId: 'run-2', state: 'completed' });
    });

    const ids = reduceEventLog(await readLog(file)).map((message) => message.id);
    expect(ids).toContain('desktop-user');
    expect(ids.indexOf('desktop-user')).toBeLessThan(ids.indexOf('turn-2'));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.messages.at(-1)).toMatchObject({ id: 'turn-2', role: 'user' });
    expect(strayResults(requests[0]!.messages)).toEqual([]);
    await host.close();
  });
});
