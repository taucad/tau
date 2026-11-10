import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { AssistantMessage, Context } from '@earendil-works/pi-ai';
import { readPrefixStamp } from '#log/prefix-stamp.js';
import type { PrefixStamp } from '#log/prefix-stamp.js';
import { prefixCodecEpoch, stampPrefix, withoutNativeReasoning } from '#transport/prefix-stamp.js';
import type { PrefixStampInput, StampedPrefix } from '#transport/prefix-stamp.js';

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

const request = (overrides: Partial<PrefixStampInput> = {}): StampedPrefix =>
  stampPrefix({
    epoch: prefixCodecEpoch,
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
const stamped = (overrides: Partial<PrefixStampInput> = {}): PrefixStamp => request(overrides).stamp;

const thinking = (text: string) => ({ type: 'thinking', thinking: text, thinkingSignature: `sig-${text}` }) as const;
const call = (id: string, signature?: string) =>
  ({
    type: 'toolCall',
    id,
    name: 'read_file',
    arguments: { targetFile: `${id}.scad` },
    ...(signature === undefined ? {} : { thoughtSignature: signature }),
  }) as const;

/**
 * A chat as its durable rows hold it: every reply stamped by the request that produced it, which obeyed the replay
 * rule in turn.
 *
 * @param messages - The whole history, replies included.
 * @param shared - What every request of the chat sent besides its messages.
 * @returns The stamp of each message's row, by index.
 */
const stampsOf = (messages: Message[], shared: Partial<PrefixStampInput> = {}): Array<PrefixStamp | undefined> => {
  const stamps: Array<PrefixStamp | undefined> = [];
  for (const [index, message] of messages.entries()) {
    stamps.push(
      message.role === 'assistant'
        ? request({ ...shared, messages: messages.slice(0, index), stamps }).stamp
        : undefined,
    );
  }
  return stamps;
};

/* Three steps of one tool loop, each reply thinking before it calls. */
const loop: Message[] = [
  user('Make a nut'),
  assistant([thinking('one'), call('call-1')]),
  result('call-1', 'first'),
  assistant([thinking('two'), call('call-2')]),
  result('call-2', 'second'),
  assistant([thinking('three'), { type: 'text', text: 'Done.' }]),
  user('Make it M8'),
];

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
    /* Whether a row replays its reasoning is decided from this digest, so the digest cannot depend on the answer. */
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

describe('the replay rule (P2)', () => {
  it('should replay every row while requests only append', () => {
    const next = request({ messages: loop, stamps: stampsOf(loop) });
    expect([...next.stale]).toEqual([]);
    expect(next.stamp).toMatchObject({ replayed: 3 });
    expect(next.stamp.break).toBeUndefined();
  });

  it('should leave out the reasoning minted after an edit, and keep what was minted before it', () => {
    const stamps = stampsOf(loop);
    const cleared = loop.map((message, index) => (index === 2 ? result('call-1', '[cleared]') : message));
    const next = request({ messages: cleared, stamps, cleared: 1 });
    /* Anthropic binds a block to everything before it: the first reply precedes the cleared result and stays valid. */
    expect([...next.stale]).toEqual([3, 5]);
    expect(next.stamp).toMatchObject({ break: 'clearing', replayed: 1, dropped: 2 });
  });

  it('should keep a stale row stale on every later request, and replay what was minted after the break', () => {
    const stamps = stampsOf(loop);
    const cleared = loop.map((message, index) => (index === 2 ? result('call-1', '[cleared]') : message));
    const broken = request({ messages: cleared, stamps, cleared: 1 });
    const reply = assistant([thinking('four'), { type: 'text', text: 'It is M8.' }]);
    const later = request({
      messages: [...cleared, reply, user('Thanks')],
      stamps: [...stamps, broken.stamp, undefined],
      cleared: 1,
    });
    /* Putting a block back after it was left out fails at the provider, so the verdict never flips. */
    expect([...later.stale]).toEqual([3, 5]);
    expect(later.stamp).toMatchObject({ replayed: 2 });
    expect(later.stamp.break).toBeUndefined();
  });

  it('should treat a row with no stamp as stale', () => {
    const stamps = stampsOf(loop).map((stamp, index) => (index === 1 ? undefined : stamp));
    expect([...request({ messages: loop, stamps }).stale]).toEqual([1]);
  });

  it('should leave every row out when the system text or the tools change, and take them back with the old ones', () => {
    const stamps = stampsOf(loop);
    const planning = request({ messages: loop, stamps, system: ['You are a CAD agent in plan mode.'] });
    expect([...planning.stale]).toEqual([1, 3, 5]);
    expect(planning.stamp).toMatchObject({ break: 'instructions', dropped: 3 });
    expect([...request({ messages: loop, stamps, tools: tools.slice(0, 1) }).stale]).toEqual([1, 3, 5]);

    /* The reply minted in plan mode never saw the earlier reasoning. Back in agent mode the earlier rows' prefix is
     * what it was, so they replay, and the plan-mode reply is the one left out. */
    const planned = assistant([thinking('plan'), { type: 'text', text: 'A plan.' }]);
    const back = request({
      messages: [...loop, planned, user('Go')],
      stamps: [...stamps, planning.stamp, undefined],
    });
    expect([...back.stale]).toEqual([7]);
    expect(back.stamp).toMatchObject({ break: 'instructions', replayed: 3 });
  });

  it('should keep reasoning across a reasoning-level change, which no provider binds it to', () => {
    const next = request({ messages: loop, stamps: stampsOf(loop), settings: 'low' });
    expect([...next.stale]).toEqual([]);
    expect(next.stamp).toMatchObject({ break: 'settings', replayed: 3 });
    expect(next.stamp.dropped).toBeUndefined();
  });

  it('should leave another model’s rows to the transport and count nothing dropped on a model change', () => {
    const other = { ...model, id: 'other-model' };
    const next = request({ model: other, messages: loop, stamps: stampsOf(loop) });
    expect([...next.stale]).toEqual([]);
    expect(next.stamp.break).toBe('model');
    expect(next.stamp.dropped).toBeUndefined();
    expect(next.stamp.replayed).toBeUndefined();
  });

  it('should count reasoning a compaction summarised away as dropped', () => {
    const stamps = stampsOf(loop);
    const tail = [user('<summary>Earlier work.</summary>'), ...loop.slice(5)];
    const next = request({ messages: tail, stamps: [undefined, ...stamps.slice(5)], summary: 'summary-1' });
    expect([...next.stale]).toEqual([1]);
    expect(next.stamp).toMatchObject({ break: 'compaction', dropped: 3 });
  });

  it('should distrust every stamp of another codec epoch and call it a release', () => {
    const stamps = stampsOf(loop, { release: 'ui@1' });
    const upgraded = request({ messages: loop, stamps, epoch: 'pi-ai@9.9.9/1', release: 'ui@2' });
    expect([...upgraded.stale]).toEqual([1, 3, 5]);
    expect(upgraded.stamp.break).toBe('definitions');
  });

  it('should strip native reasoning without moving the chain', () => {
    const signed = assistant([thinking('one'), { type: 'text', text: 'A note.' }, call('call-1', 'gemini-signature')]);
    const stripped = withoutNativeReasoning(signed);
    expect(stripped).toMatchObject({ content: [{ type: 'text', text: 'A note.' }, call('call-1')] });
    expect(JSON.stringify(stripped)).not.toContain('ignature');
    const digestOf = (reply: Message): string =>
      stamped({ messages: [user('Make a nut'), reply, result('call-1', 'ok')] }).digest;
    expect(digestOf(stripped)).toBe(digestOf(signed));
    expect(withoutNativeReasoning(user('Make a nut'))).toEqual(user('Make a nut'));
  });
});

describe('readPrefixStamp', () => {
  it('should read back what a row stored and refuse anything else', () => {
    const stamp = { ...stamped({ cleared: 1 }), replayed: 2, break: 'clearing', dropped: 4 } as const;
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
