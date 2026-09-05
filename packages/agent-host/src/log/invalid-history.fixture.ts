// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent, MessageAppendedEvent, UserProviderMessage } from '#log/event-types.js';

const user = (id: string, content: string): UserProviderMessage => ({ id, role: 'user', content });

const appended = (sequence: number, message: UserProviderMessage): MessageAppendedEvent => ({
  version: 1,
  type: 'message.appended',
  leaderEpoch: 'epoch-a',
  sequence,
  recordedAt: '2026-08-31T00:00:00.000Z',
  runId: 'run-a',
  message,
});

const first = appended(0, user('message-1', 'first'));
const second = appended(1, user('message-2', 'second'));

export const invalidHistoryFixtures: ReadonlyArray<{
  readonly name: string;
  readonly events: readonly AgentLogEvent[];
}> = [
  {
    name: 'out-of-order cursor',
    events: [first, { ...second, sequence: 2 }],
  },
  {
    name: 'mutated idempotency key',
    events: [first, { ...first, message: user('message-1', 'mutated') }],
  },
  {
    name: 'non-prefix history projection',
    events: [
      first,
      second,
      {
        version: 1,
        type: 'turn.history-projection-committed',
        leaderEpoch: 'epoch-a',
        sequence: 2,
        recordedAt: '2026-08-31T00:00:01.000Z',
        runId: 'run-b',
        retainedMessageIds: ['message-2'],
        message: user('message-3', 'next turn'),
        context: { version: 1, systemPrompt: 'system', initialMessages: [], postCompactionMessages: [] },
      },
    ],
  },
];
