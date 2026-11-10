import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { AssistantMessage, Context } from '@earendil-works/pi-ai';
import { readPrefixStamp } from '#log/prefix-stamp.js';
import type { PrefixStamp } from '#log/prefix-stamp.js';
import { prefixCodecEpoch, stampPrefix } from '#transport/prefix-stamp.js';
import type { PrefixStampInput } from '#transport/prefix-stamp.js';

type Message = Context['messages'][number];

const model = { api: 'anthropic-messages', provider: 'anthropic', id: 'claude-fixture' } as const;
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

const user = (text: string): Message => ({ role: 'user', content: text, timestamp: 1 });
const result = (id: string, text: string): Message => ({
  role: 'toolResult',
  toolCallId: id,
  toolName: 'read_file',
  content: [{ type: 'text', text }],
  isError: false,
  timestamp: 1,
});
const assistant = (content: AssistantMessage['content'], overrides: Partial<AssistantMessage> = {}): Message => ({
  role: 'assistant',
  content,
  ...model,
  model: model.id,
  usage: { ...usage, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop',
  timestamp: 1,
  ...overrides,
});

const tools: PrefixStampInput['tools'] = [
  { name: 'read_file', description: 'Read a file.', parameters: { type: 'object' } },
  { name: 'edit_file', description: 'Edit a file.', parameters: { type: 'object' } },
];

const stamped = (overrides: Partial<PrefixStampInput> = {}): PrefixStamp =>
  stampPrefix({
    model,
    system: ['You are a CAD agent.'],
    tools,
    messages: [user('Make a nut')],
    stamps: [],
    settings: 'high',
    cleared: 0,
    evicted: 0,
    ...overrides,
  });

/**
 * The break a chat's second request suffers: the first request's reply carries its stamp into the second.
 *
 * @param change - What the second request changes about itself.
 * @param edit - What happens to the history between the two requests.
 * @param first - What both requests share that the default request lacks.
 * @returns The second request's typed break.
 */
const secondBreak = (
  change: Partial<PrefixStampInput> = {},
  edit: (messages: Message[]) => Message[] = (messages) => messages,
  first: Partial<PrefixStampInput> = {},
): PrefixStamp['break'] => {
  const opening = [user('Make a nut')];
  const stamp = stamped({ ...first, messages: opening });
  const reply = assistant([{ type: 'text', text: 'Done.' }]);
  const messages = edit([...opening, reply, user('Make it M8')]);
  return stamped({
    ...first,
    ...change,
    messages,
    stamps: messages.map((message) => (message === reply ? stamp : undefined)),
  }).break;
};

describe('stampPrefix', () => {
  it('should report no break when the next request only appends', () => {
    expect(secondBreak()).toBeUndefined();
  });

  it.each([
    ['tools', { tools: tools.slice(0, 1) }, {}],
    ['instructions', { system: ['You are a CAD agent in plan mode.'] }, {}],
    ['settings', { settings: 'medium' }, {}],
    ['definitions', { system: ['A release reworded this.'], release: 'ui@2' }, { release: 'ui@1' }],
    [
      'definitions',
      { tools: [{ ...tools[0]!, description: 'Reworded.' }, tools[1]!], release: 'ui@2' },
      { release: 'ui@1' },
    ],
    /* The outermost tier names the break: a tool change hides the system and settings changes behind it. */
    ['tools', { tools: tools.slice(0, 1), system: ['Other.'], settings: 'low' }, {}],
  ] as const)('should attribute a %s break', (cause, change, first) => {
    expect(secondBreak(change, undefined, first)).toBe(cause);
  });

  it('should attribute an edited earlier message by what the request holds now', () => {
    const edit = (messages: Message[]): Message[] => [user('Make a bolt'), ...messages.slice(1)];
    expect(secondBreak({}, edit)).toBe('unsanctioned');
    expect(secondBreak({ summary: 'summary-1' }, edit)).toBe('compaction');
    expect(secondBreak({ cleared: 3 }, edit)).toBe('clearing');
    expect(secondBreak({ evicted: 2 }, edit)).toBe('attachment-eviction');
    /* A count that moved while the messages were reproduced is not a break: nothing the reply was bound to changed. */
    expect(secondBreak({ evicted: 2 })).toBeUndefined();
  });

  it('should attribute a model break when the newest stamped reply is another model’s', () => {
    const messages = [user('Make a nut'), assistant([{ type: 'text', text: 'Done.' }], { model: 'other-model' })];
    expect(stamped({ messages, stamps: [undefined, stamped()] }).break).toBe('model');
  });

  it('should attribute a compaction break when a summary is all that is left to compare with', () => {
    const messages = [user('<summary>Earlier work.</summary>'), user('Make it M8')];
    expect(stamped({ messages, summary: 'summary-1' }).break).toBe('compaction');
    expect(stamped({ messages }).break).toBeUndefined();
  });

  it('should leave native reasoning out of the digest, and nothing else', () => {
    const call = { type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { targetFile: 'a.scad' } } as const;
    const digestOf = (content: AssistantMessage['content']): string =>
      stamped({ messages: [user('Make a nut'), assistant(content), result('call-1', 'ok')] }).digest;
    const bare = digestOf([call]);
    expect(
      digestOf([
        { type: 'thinking', thinking: 'reasoning', thinkingSignature: 'sig-1' },
        { ...call, thoughtSignature: 'gemini-signature' },
      ]),
    ).toBe(bare);
    expect(digestOf([{ ...call, arguments: { targetFile: 'b.scad' } }])).not.toBe(bare);
    expect(digestOf([{ type: 'text', text: 'A note.' }, call])).not.toBe(bare);
  });

  it('should skip a reply the codec never sends, and keep the stamp it carries as the comparison', () => {
    const opening = [user('Make a nut')];
    const stamp = stamped({ messages: opening });
    const failed = assistant([{ type: 'text', text: 'partial' }], { stopReason: 'error' });
    const retried = stamped({ messages: [...opening, failed], stamps: [undefined, stamp] });
    expect(retried.break).toBeUndefined();
    expect(retried.digest).toBe(stamp.digest);
  });

  it('should not depend on tool order', () => {
    expect(stamped({ tools: tools.toReversed() })).toEqual(stamped());
  });

  it('should record only the facts a request has', () => {
    const {
      digest,
      system,
      tools: toolsDigest,
      ...facts
    } = stamped({
      release: 'ui@1',
      summary: 'summary-1',
      cleared: 2,
      evicted: 1,
    });
    expect([digest, system, toolsDigest].every((value) => /^[\da-z]{2,14}$/u.test(value))).toBe(true);
    expect(facts).toEqual({
      settings: 'high',
      release: 'ui@1',
      summary: 'summary-1',
      cleared: 2,
      evicted: 1,
      break: 'compaction',
    });
    expect(Object.keys(stamped())).toEqual(['digest', 'system', 'tools', 'settings']);
  });
});

describe('readPrefixStamp', () => {
  it('should read back what a row stored and refuse anything else', () => {
    const stamp = { ...stamped({ cleared: 1 }), break: 'clearing', dropped: 4 } as const;
    expect(readPrefixStamp(structuredClone(stamp))).toEqual(stamp);
    expect(readPrefixStamp({ ...stamp, break: 'not-a-cause' })?.break).toBeUndefined();
    expect(readPrefixStamp({ digest: 'd' })).toBeUndefined();
    expect(readPrefixStamp(undefined)).toBeUndefined();
    expect(readPrefixStamp([stamp])).toBeUndefined();
  });
});

describe('prefixCodecEpoch', () => {
  it('should name the installed pi-ai version, so an upgrade changes every digest instead of trusting old ones', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../node_modules/@earendil-works/pi-ai/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(prefixCodecEpoch.startsWith(`pi-ai@${manifest.version}/`)).toBe(true);
  });
});
