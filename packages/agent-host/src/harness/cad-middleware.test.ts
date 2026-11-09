import { describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model } from '@earendil-works/pi-ai';
import {
  createClientContextMiddleware,
  createRecentSkillsMiddleware,
  createTurnContextSnapshot,
  latexDelimiterMiddleware,
  pinnedSkillsBlock,
  skillsUpdateMessageId,
  trimToolResultContext,
} from '#harness/cad-middleware.js';
import { toPiToolContent } from '#harness/tools.js';
import { MessageIdentities, piMessageToProvider, providerMessageToPi } from '#harness/session-record.js';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ModelCallRequest } from '#harness/model-call-middleware.js';

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const assistant = (text: string): AssistantMessage => ({
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: String.raw`reason \(a\)` },
    { type: 'text', text },
  ],
  api: 'openai-responses',
  provider: 'stub',
  model: 'stub',
  usage,
  stopReason: 'stop',
  timestamp: 0,
});

const model: Model<Api> = {
  id: 'stub',
  name: 'stub',
  api: 'openai-responses',
  provider: 'stub',
  baseUrl: '',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 1024,
};
const request = (context: Context): ModelCallRequest => ({ model, context });

/**
 * What the transport sends for a trimmed history: the session serialises each
 * message to its durable envelope (`providerHistory`) and the gateway transport
 * rebuilds pi content from that envelope on every request (`piContextFor`).
 */
const onTheWire = (messages: readonly AgentMessage[]): AgentMessage[] => {
  const identities = new MessageIdentities(() => 'id');
  return trimToolResultContext(messages).map((message) => {
    const provider = piMessageToProvider(message, identities);
    if (provider.role === 'tool-input') {
      throw new TypeError('A tool result never serialises to tool input.');
    }
    return providerMessageToPi(provider, model, identities);
  });
};
const dummyStream = (): AssistantMessageEventStream => createAssistantMessageEventStream();

describe('ToolResultTrimmer', () => {
  it('should preserve run qualification and retained evidence references through provider replay', () => {
    const content = {
      failures: [],
      passes: [{ requirement: 'individual pass' }],
      passed: 1,
      total: 2,
      runStatus: 'inconclusive',
      lineageStatus: 'mixed',
      accounting: { selected: 2, completed: 1, notRun: 1, discoveryComplete: false },
      tests: [
        { id: 'spec:0', status: 'passed' },
        { id: 'spec:1', status: 'not-run' },
      ],
      fullResult: {
        path: '.tau/artifacts/call-1__geospec-json/result.json',
        sha256: 'a'.repeat(64),
        byteLength: 1024,
        mimeType: 'application/json',
      },
      omittedPasses: 3,
      omittedLineage: 1,
    };
    const [sent] = onTheWire([
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'test_model',
        content: [{ type: 'text', text: JSON.stringify(content) }],
        details: { content, isError: false, substituted: false },
        isError: false,
        timestamp: 0,
      },
    ]);
    const text = sent?.role === 'toolResult' && sent.content[0]?.type === 'text' ? sent.content[0].text : '';
    const { passes, ...expected } = content;
    expect(passes).toHaveLength(1);
    expect(JSON.parse(text)).toStrictEqual(expected);
  });
  it('keeps test failures and total while dropping redundant pass payloads', () => {
    const content = { failures: [{ targetFile: 'main.ts', message: 'bad' }], passes: [{ huge: 'x' }], total: 2 };
    const [trimmed] = trimToolResultContext([
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'test_model',
        content: [{ type: 'text', text: JSON.stringify(content) }],
        details: { content, isError: false, substituted: false },
        isError: false,
        timestamp: 0,
      },
    ]);

    expect(trimmed?.role === 'toolResult' ? trimmed.content : undefined).toEqual([
      { type: 'text', text: '{"failures":[{"targetFile":"main.ts","message":"bad"}],"total":2}' },
    ]);
  });

  it('keeps the source revision a trimmed verdict was computed from (R4)', () => {
    const sourceRevision = { entry: 'main.ts', files: { 'main.ts': `sha256:${'a'.repeat(64)}` } };
    const content = {
      status: 'error',
      kernelIssues: [{ code: 'RUNTIME', message: 'boom', severity: 'error' }],
      sourceRevision,
    };
    const [trimmed] = trimToolResultContext([
      {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'evaluate_model',
        content: [{ type: 'text', text: JSON.stringify(content) }],
        details: { content, isError: false, substituted: false },
        isError: false,
        timestamp: 0,
      },
    ]);

    const text = trimmed?.role === 'toolResult' && trimmed.content[0]?.type === 'text' ? trimmed.content[0].text : '';
    expect(JSON.parse(text)).toMatchObject({ status: 'error', sourceRevision });
  });

  it('should keep every capture whole, whichever is newest, and send text instead only to a model without images', () => {
    // Built the way the tool records it, so the trimmer sees what pi sees.
    const capture = (toolCallId: string, view: string): AgentMessage => {
      const content = { success: true, images: [{ view, dataUrl: 'data:image/webp;base64,AAAA' }] };
      return {
        role: 'toolResult',
        toolCallId,
        toolName: 'screenshot',
        content: toPiToolContent(content),
        details: { content, isError: false, substituted: false },
        isError: false,
        timestamp: 0,
      };
    };
    const captures = [capture('call-1', 'top'), capture('call-2', 'isometric')];

    const [older, newest] = trimToolResultContext(captures);

    // Untouched: `toPiToolContent` already built the blocks, and a newer capture never rewrites an older one (I1).
    expect(older).toBe(captures[0]);
    expect(newest).toBe(captures[1]);

    // A model that cannot take images loses both, on every step alike, which is the point of the gate.
    const textOnly = trimToolResultContext(captures, { allowImageBlocks: false });
    expect(
      textOnly.every(
        (message) => message.role === 'toolResult' && message.content.every((block) => block.type === 'text'),
      ),
    ).toBe(true);
    expect(textOnly[0]?.role === 'toolResult' ? textOnly[0].content.at(-1) : undefined).toEqual({
      type: 'text',
      text: '[screenshot image omitted: this model takes no image input]',
    });
  });

  describe('on the wire', () => {
    const capture = (toolCallId: string): AgentMessage => {
      const content = { success: true, images: [{ view: 'top', dataUrl: 'data:image/webp;base64,AAAA' }] };
      return {
        role: 'toolResult',
        toolCallId,
        toolName: 'screenshot',
        content: toPiToolContent(content),
        details: { content, isError: false, substituted: false },
        isError: false,
        timestamp: 0,
      };
    };
    const imageCount = (message: AgentMessage | undefined): number =>
      message?.role === 'toolResult' ? message.content.filter((block) => block.type === 'image').length : -1;

    it('should send every capture as image blocks', () => {
      const [older, newest] = onTheWire([capture('call-1'), capture('call-2')]);

      expect(imageCount(older)).toBe(1);
      expect(imageCount(newest)).toBe(1);
    });

    it('should send the trimmed structured result, not the durable one', () => {
      const content = { failures: [{ targetFile: 'main.ts', message: 'bad' }], passes: [{ huge: 'x' }], total: 2 };
      const [sent] = onTheWire([
        {
          role: 'toolResult',
          toolCallId: 'call-1',
          toolName: 'test_model',
          content: [{ type: 'text', text: JSON.stringify(content) }],
          details: { content, isError: false, substituted: false },
          isError: false,
          timestamp: 0,
        },
      ]);

      expect(sent?.role === 'toolResult' ? sent.content : undefined).toEqual([
        { type: 'text', text: '{"failures":[{"targetFile":"main.ts","message":"bad"}],"total":2}' },
      ]);
    });

    it('should leave an already trimmed history as it is', () => {
      const once = trimToolResultContext([capture('call-1'), capture('call-2')]);

      expect(trimToolResultContext(once)).toEqual(once);
    });
  });
});

describe('LatexDelimiterNormalizer', () => {
  it('returns the same assistant object when no delimiter changes', async () => {
    const upstream = dummyStream();
    const message: AssistantMessage = {
      ...assistant('plain text'),
      content: [
        { type: 'thinking', thinking: 'plain reasoning' },
        { type: 'text', text: 'plain text' },
      ],
    };
    const transformed = await latexDelimiterMiddleware(request({ messages: [] }), async () => upstream);
    upstream.push({ type: 'start', partial: message });
    upstream.push({ type: 'done', reason: 'stop', message });

    expect(await transformed.result()).toBe(message);
  });

  it('rewrites final text and thinking while preserving code spans', async () => {
    const upstream = dummyStream();
    const transformed = await latexDelimiterMiddleware(request({ messages: [] }), async () => upstream);
    upstream.push({ type: 'start', partial: assistant('') });
    upstream.push({ type: 'done', reason: 'stop', message: assistant('\\(x\\) and `\\(code\\)`') });

    const final = await transformed.result();

    expect(final.content).toEqual([
      { type: 'thinking', thinking: 'reason $a$' },
      { type: 'text', text: '$x$ and `\\(code\\)`' },
    ]);
  });
});

describe('ClientContext', () => {
  it('adds the skills catalogue to pi systemPrompt and prepends memory ephemerally', async () => {
    let seen: Context | undefined;
    const middleware = createClientContextMiddleware({
      skills: [{ name: 'brep', description: 'Build native BRep geometry' }],
      memory: { 'AGENTS.md': 'Use millimetres.' },
    });
    await middleware(request({ systemPrompt: 'static', messages: [] }), async ({ context }) => {
      seen = context;
      return dummyStream();
    });

    expect(seen?.systemPrompt).toContain('**brep**');
    expect(seen?.systemPrompt).toContain('**How to Use Skills (Progressive Disclosure):**');
    expect(seen?.messages[0]?.role).toBe('user');
    expect(JSON.stringify(seen?.messages[0]?.content)).toContain('Use millimetres.');
    expect(JSON.stringify(seen?.messages[0]?.content)).toContain('<memory_guidelines>');
  });
});

describe('RecentSkills', () => {
  it('evicts stale fingerprints and restores exact current skill content after compaction', async () => {
    const remove = vi.fn(async () => undefined);
    let seen: Context | undefined;
    const middleware = createRecentSkillsMiddleware({
      chatId: 'chat-1',
      store: {
        load: async () => [
          { skillName: 'fresh', resourceUri: 'skill://fresh', fingerprint: 'a', content: 'fresh body' },
          { skillName: 'stale', resourceUri: 'skill://stale', fingerprint: 'old', content: 'stale body' },
        ],
        remove,
      },
      currentSkills: [
        { name: 'fresh', description: 'fresh', fingerprint: 'a' },
        { name: 'stale', description: 'stale', fingerprint: 'new' },
      ],
      includeContent: () => true,
    });
    await middleware(request({ messages: [] }), async ({ context }) => {
      seen = context;
      return dummyStream();
    });

    expect(JSON.stringify(seen?.messages)).toContain('fresh body');
    expect(JSON.stringify(seen?.messages)).not.toContain('stale body');
    expect(remove).toHaveBeenCalledWith('chat-1', 'stale');
  });

  it('evicts stored content when the current listing has no comparable fingerprint', async () => {
    const remove = vi.fn(async () => undefined);
    const middleware = createRecentSkillsMiddleware({
      chatId: 'chat-1',
      store: {
        load: async () => [{ skillName: 'unversioned', resourceUri: 'skill://old', content: 'stale body' }],
        remove,
      },
      currentSkills: [{ name: 'unversioned', description: 'current listing' }],
      includeContent: () => true,
    });
    let seen: Context | undefined;
    await middleware(request({ messages: [] }), async ({ context }) => {
      seen = context;
      return dummyStream();
    });

    expect(seen?.messages).toEqual([]);
    expect(remove).toHaveBeenCalledWith('chat-1', 'unversioned');
  });
});

describe('TurnContextSnapshot skills pin', () => {
  const blocks = [
    { type: 'text', text: 'static', cacheControl: { type: 'ephemeral' } },
    { type: 'text', text: 'dynamic' },
  ] as const;
  const brep = { name: 'brep', description: 'Build native BRep geometry', fingerprint: 'a' };
  const gears = { name: 'gears', description: 'Involute gears', fingerprint: 'b' };
  type Snapshot = Awaited<ReturnType<typeof createTurnContextSnapshot>>;
  /** The turn after `previous`, whose request history carries every earlier context's messages. */
  const snapshot = async (
    skills: ReadonlyArray<typeof brep> | undefined,
    ...previous: readonly Snapshot[]
  ): Promise<Snapshot> => {
    const carried = previous
      .flatMap((context) => context.initialMessages)
      .findLast((message) => message.id === skillsUpdateMessageId);
    return createTurnContextSnapshot({
      chatId: 'chat-1',
      systemPrompt: 'static\n\ndynamic',
      systemPromptBlocks: blocks,
      clientContext: skills === undefined ? undefined : { skills },
      previousContext: previous.at(-1),
      carriedSkillsNote: typeof carried?.content === 'string' ? carried.content : undefined,
    });
  };

  it("should keep the first turn's skills block byte for byte when the catalog changes, and note the change", async () => {
    const first = await snapshot([brep]);
    const second = await snapshot([brep, gears], first);
    expect(second.systemPromptBlocks).toEqual(first.systemPromptBlocks);
    expect(second.systemPrompt).toBe(first.systemPrompt);
    const note = second.initialMessages.find((message) => message.id === skillsUpdateMessageId);
    expect(note?.content).toContain('**gears**');
    expect(second.postCompactionMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(true);
  });

  it('should keep a chat that began without a catalog free of a skills block, and carry the catalog as a note', async () => {
    const first = await snapshot(undefined);
    const second = await snapshot([brep], first);
    expect(pinnedSkillsBlock(first)).toBeUndefined();
    expect(second.systemPromptBlocks).toEqual(first.systemPromptBlocks);
    expect(second.initialMessages.find((message) => message.id === skillsUpdateMessageId)?.content).toContain(
      '**brep**',
    );
  });

  it('should add no note while the catalog matches the pinned block', async () => {
    const first = await snapshot([brep]);
    const second = await snapshot([brep], first);
    expect(second.systemPromptBlocks).toEqual(first.systemPromptBlocks);
    expect(second.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(false);
  });

  it('should note a catalog change once: the turn after it carries no note of its own', async () => {
    const first = await snapshot([brep]);
    const second = await snapshot([brep, gears], first);
    const third = await snapshot([brep, gears], first, second);
    expect(second.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(true);
    expect(third.systemPromptBlocks).toEqual(first.systemPromptBlocks);
    expect(third.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(false);
    expect(third.postCompactionMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(false);
  });

  it('should note a reversion to the pinned catalog once', async () => {
    const first = await snapshot([brep]);
    const second = await snapshot([brep, gears], first);
    const third = await snapshot([brep], first, second);
    const fourth = await snapshot([brep], first, second, third);
    const note = third.initialMessages.find((message) => message.id === skillsUpdateMessageId);
    expect(note?.content).toContain('**brep**');
    expect(note?.content).not.toContain('**gears**');
    expect(fourth.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(false);
  });

  it('should carry the catalog of a chat that began without one as a note once, not on every turn', async () => {
    const first = await snapshot(undefined);
    const second = await snapshot([brep], first);
    const third = await snapshot([brep], first, second);
    expect(second.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(true);
    expect(third.initialMessages.some((message) => message.id === skillsUpdateMessageId)).toBe(false);
  });

  it('should pin the catalog in string-prompt form too', async () => {
    const first = await createTurnContextSnapshot({
      chatId: 'chat-1',
      systemPrompt: 'static',
      clientContext: { skills: [brep] },
    });
    const second = await createTurnContextSnapshot({
      chatId: 'chat-1',
      systemPrompt: 'static',
      clientContext: { skills: [gears] },
      previousContext: first,
    });
    expect(pinnedSkillsBlock(first)).toContain('**brep**');
    expect(second.systemPrompt).toBe(first.systemPrompt);
    expect(second.initialMessages.find((message) => message.id === skillsUpdateMessageId)?.content).toContain(
      '**gears**',
    );
  });
});
