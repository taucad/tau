import { describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model } from '@earendil-works/pi-ai';
import {
  createClientContextMiddleware,
  createRecentSkillsMiddleware,
  latexDelimiterMiddleware,
  trimToolResultContext,
} from '#harness/cad-middleware.js';
import { toPiToolContent } from '#harness/tools.js';
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
const dummyStream = (): AssistantMessageEventStream => createAssistantMessageEventStream();

describe('ToolResultTrimmer', () => {
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

  it('keeps the newest capture whole and replaces older image blocks with a placeholder', () => {
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

    expect(older?.role === 'toolResult' ? older.content : undefined).toEqual([
      captures[0]!.role === 'toolResult' ? captures[0]!.content[0] : undefined,
      { type: 'text', text: '[screenshot image - previously captured]' },
    ]);
    // Untouched: `toPiToolContent` already built the blocks this used to rebuild.
    expect(newest).toBe(captures[1]);

    // A model that cannot take images loses both, which is the point of the gate.
    const textOnly = trimToolResultContext(captures, { allowImageBlocks: false });
    expect(
      textOnly.every(
        (message) => message.role === 'toolResult' && message.content.every((block) => block.type === 'text'),
      ),
    ).toBe(true);
  });
});

describe('LatexDelimiterNormalizer', () => {
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
