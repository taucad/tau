import { describe, it, expect, vi } from 'vitest';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import type { ContextPayload } from '@taucad/chat';
import {
  createClientContextMiddleware,
  formatSkillsLocations,
  formatSkillsList,
  formatMemoryContents,
  formatSkillsPrompt,
  formatMemoryPrompt,
} from '#api/chat/middleware/client-context.middleware.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

/* eslint-disable @typescript-eslint/naming-convention -- Anthropic API uses snake_case for cache_control */
type ContentBlockWithCacheControl = ContentBlock & {
  cache_control?: { type: string; scope?: string };
};

function makeSystemMessage(text: string): SystemMessage {
  return new SystemMessage({ content: [{ type: 'text', text }] });
}

function make3BlockSystemMessage(): SystemMessage {
  return new SystemMessage({
    content: [
      { type: 'text', text: 'static prompt', cache_control: { type: 'ephemeral', scope: 'global' } },
      { type: 'text', text: 'dynamic prompt' },
    ],
  });
}
/* eslint-enable @typescript-eslint/naming-convention -- Anthropic API uses snake_case for cache_control */

function extractSystemBlocks(handler: ReturnType<typeof vi.fn>): ContentBlockWithCacheControl[] {
  /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn mock.calls is typed as any[][] */
  const passedRequest = handler.mock.calls[0]![0] as { systemMessage: SystemMessage };
  const { content } = passedRequest.systemMessage;
  return Array.isArray(content) ? (content as ContentBlockWithCacheControl[]) : [];
}

function extractSystemText(handler: ReturnType<typeof vi.fn>): string {
  const blocks = extractSystemBlocks(handler);
  return blocks.map((block) => (block.type === 'text' ? (block as unknown as { text: string }).text : '')).join('\n');
}

function extractMessages(handler: ReturnType<typeof vi.fn>): BaseMessage[] {
  /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn mock.calls is typed as any[][] */
  const passedRequest = handler.mock.calls[0]![0] as { messages: BaseMessage[] };
  return passedRequest.messages;
}

// ===================================================================
// Formatting helpers
// ===================================================================

describe('formatSkillsLocations', () => {
  it('should return "None configured" for empty sources', () => {
    expect(formatSkillsLocations([])).toBe('**Skills Sources:** None configured');
  });

  it('should format a single source with higher priority suffix', () => {
    const result = formatSkillsLocations(['.agents/skills/']);
    expect(result).toContain('**Skills Skills**');
    expect(result).toContain('`.agents/skills/`');
    expect(result).toContain('(higher priority)');
  });
});

describe('formatSkillsList', () => {
  it('should format skill entries with name, description, and use_skill activation', () => {
    const skills = [
      { name: 'cad-expert', description: 'CAD modeling help', path: '.agents/skills/cad-expert' },
      { name: 'testing', description: 'Test writing support', path: '.agents/skills/testing' },
    ];

    const result = formatSkillsList(skills, ['.agents/skills/']);

    expect(result).toContain('- **cad-expert**: CAD modeling help');
    expect(result).toContain('→ Activate with `use_skill({ skillName: "cad-expert" })` before applying');
    expect(result).toContain('- **testing**: Test writing support');
    expect(result).toContain('→ Activate with `use_skill({ skillName: "testing" })` before applying');
    expect(result).not.toContain('read_file');
  });

  it('should return placeholder when no skills available', () => {
    const result = formatSkillsList([], ['.agents/skills/']);
    expect(result).toContain('No skills available yet');
    expect(result).toContain('`.agents/skills/`');
  });

  it('should include system create-skill entries with use_skill activation guidance', () => {
    const result = formatSkillsList(
      [
        {
          name: 'create-skill',
          description: 'Create or update Tau agent skills',
          path: '.agents/skills/create-skill',
          source: 'system',
        },
      ],
      ['.agents/skills/'],
    );

    expect(result).toContain('- **create-skill**: Create or update Tau agent skills');
    expect(result).toContain('use_skill({ skillName: "create-skill" })');
    expect(result).not.toContain('read_file');
  });
});

describe('formatMemoryContents', () => {
  it('should format memory file contents with path headers', () => {
    const agentsKey = '.tau/AGENTS.md';
    const contents = { [agentsKey]: '# Project Rules\n\nPrefer early returns.' };
    const result = formatMemoryContents(contents, [agentsKey]);

    expect(result).toContain('.tau/AGENTS.md');
    expect(result).toContain('Prefer early returns.');
  });

  it('should return "(No memory loaded)" for empty contents', () => {
    expect(formatMemoryContents({}, [])).toBe('(No memory loaded)');
  });
});

describe('formatSkillsPrompt', () => {
  it('should produce a complete skills system prompt section', () => {
    const skills = [{ name: 'my-skill', description: 'Does things', path: '.agents/skills/my-skill' }];
    const result = formatSkillsPrompt(skills, ['.agents/skills/']);

    expect(result).toContain('## Skills System');
    expect(result).toContain('- **my-skill**: Does things');
    expect(result).toContain('Progressive Disclosure');
    expect(result).toContain('use_skill');
    expect(result).not.toContain('read_file');
  });
});

describe('formatMemoryPrompt', () => {
  it('should wrap memory contents in agent_memory and memory_guidelines tags', () => {
    const agentsKey = '.tau/AGENTS.md';
    const result = formatMemoryPrompt({ [agentsKey]: 'Content here' }, [agentsKey]);

    expect(result).toContain('<agent_memory>');
    expect(result).toContain('Content here');
    expect(result).toContain('</agent_memory>');
    expect(result).toContain('<memory_guidelines>');
    expect(result).toContain('</memory_guidelines>');
  });
});

// ===================================================================
// Middleware integration
// ===================================================================

describe('createClientContextMiddleware', () => {
  it('should pass through unmodified when payload is undefined', async () => {
    const middleware = createClientContextMiddleware(undefined);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const originalMessage = makeSystemMessage('Base prompt');
    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: originalMessage, messages: [], state: {} }, handler);

    expect(handler).toHaveBeenCalledOnce();
    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn mock.calls is typed as any[][] */
    const passedRequest = handler.mock.calls[0]![0] as { systemMessage: SystemMessage };
    expect(passedRequest.systemMessage).toBe(originalMessage);
  });

  it('should pass through unmodified when payload has empty skills and no memory', async () => {
    const payload: ContextPayload = { skills: [], memory: undefined };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const originalMessage = makeSystemMessage('Base prompt');
    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: originalMessage, messages: [], state: {} }, handler);

    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vi.fn mock.calls is typed as any[][] */
    const passedRequest = handler.mock.calls[0]![0] as { systemMessage: SystemMessage };
    expect(passedRequest.systemMessage).toBe(originalMessage);
  });

  // ===================================================================
  // Skills as Block 2 with workspace cache_control
  // ===================================================================

  it('should insert skills as Block 2 between static and dynamic blocks', async () => {
    const payload: ContextPayload = {
      skills: [{ name: 'test-skill', description: 'For testing', path: '.agents/skills/test-skill' }],
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: make3BlockSystemMessage(), messages: [], state: {} }, handler);

    const blocks = extractSystemBlocks(handler);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!['text']).toBe('static prompt');
    expect(blocks[1]!['text']).toContain('## Skills System');
    expect(blocks[2]!['text']).toBe('dynamic prompt');
  });

  it('should add workspace cache_control to skills block (Block 2)', async () => {
    const payload: ContextPayload = {
      skills: [{ name: 'test-skill', description: 'For testing', path: '.agents/skills/test-skill' }],
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: make3BlockSystemMessage(), messages: [], state: {} }, handler);

    const blocks = extractSystemBlocks(handler);
    expect(blocks[1]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1]!.cache_control).not.toHaveProperty('scope');
  });

  it('should preserve Block 1 global scope after skills insertion', async () => {
    const payload: ContextPayload = {
      skills: [{ name: 's', description: 'd', path: 'p' }],
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: make3BlockSystemMessage(), messages: [], state: {} }, handler);

    const blocks = extractSystemBlocks(handler);
    expect(blocks[0]!.cache_control).toEqual({ type: 'ephemeral', scope: 'global' });
  });

  // ===================================================================
  // Memory as HumanMessage (not SystemMessage)
  // ===================================================================

  it('should inject memory as a HumanMessage prepended to messages', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      memory: { [agentsKey]: '# Rules\n\nUse early returns.' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });
    const existingMessages = [new HumanMessage('user question')];

    await wrapModelCall({ systemMessage: makeSystemMessage('Base'), messages: existingMessages, state: {} }, handler);

    const messages = extractMessages(handler);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[1]).toBeInstanceOf(HumanMessage);
  });

  it('should wrap memory in <system-reminder> tags', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      memory: { [agentsKey]: 'Use early returns.' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: makeSystemMessage('Base'), messages: [], state: {} }, handler);

    const messages = extractMessages(handler);
    const memoryMessage = messages[0]!;
    expect(typeof memoryMessage.content).toBe('string');
    expect(memoryMessage.content as string).toContain('<system-reminder>');
    expect(memoryMessage.content as string).toContain('</system-reminder>');
  });

  it('should include "may or may not be relevant" caveat in memory message', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      memory: { [agentsKey]: 'Content' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: makeSystemMessage('Base'), messages: [], state: {} }, handler);

    const messages = extractMessages(handler);
    expect(messages[0]!.content as string).toContain('may or may not be relevant');
  });

  it('should NOT inject memory into the system message', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      memory: { [agentsKey]: 'Memory content unique string' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: makeSystemMessage('Base'), messages: [], state: {} }, handler);

    const fullText = extractSystemText(handler);
    expect(fullText).not.toContain('Memory content unique string');
  });

  it('should handle both skills and memory together', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      skills: [{ name: 'dual', description: 'Both present', path: '.agents/skills/dual' }],
      memory: { [agentsKey]: 'Memory content' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall(
      { systemMessage: make3BlockSystemMessage(), messages: [new HumanMessage('test')], state: {} },
      handler,
    );

    const fullText = extractSystemText(handler);
    expect(fullText).toContain('## Skills System');
    expect(fullText).toContain('- **dual**: Both present');
    expect(fullText).not.toContain('<agent_memory>');

    const messages = extractMessages(handler);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[0]!.content as string).toContain('<agent_memory>');
    expect(messages[0]!.content as string).toContain('Memory content');
  });

  // Verify the implementation matches claude-code's `prependUserContext`
  // shape so memory injection survives Anthropic prompt-cache invalidation:
  // a HumanMessage prepended to the user-message channel (NOT a SystemMessage
  // edit), wrapped in `<system-reminder>` with the "may or may not be
  // relevant" caveat, and the static system prompt left untouched.
  it('should ship the claude-code prependUserContext shape', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const memoryBody = 'Use early returns. Prefer composition over inheritance.';
    const payload: ContextPayload = {
      memory: { [agentsKey]: memoryBody },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });
    const originalSystem = makeSystemMessage('Static base prompt');
    const originalUser = new HumanMessage('user question');

    await wrapModelCall({ systemMessage: originalSystem, messages: [originalUser], state: {} }, handler);

    const messages = extractMessages(handler);
    expect(messages).toHaveLength(2);

    const memoryMessage = messages[0]!;
    expect(memoryMessage).toBeInstanceOf(HumanMessage);

    const memoryContent = memoryMessage.content as string;
    expect(memoryContent.startsWith('<system-reminder>')).toBe(true);
    expect(memoryContent.trimEnd().endsWith('</system-reminder>')).toBe(true);
    expect(memoryContent).toContain('IMPORTANT');
    expect(memoryContent).toContain('may or may not be relevant');
    expect(memoryContent).toContain('<agent_memory>');
    expect(memoryContent).toContain(agentsKey);
    expect(memoryContent).toContain(memoryBody);
    expect(memoryContent).toContain('<memory_guidelines>');

    expect(messages[1]).toBe(originalUser);

    const systemText = extractSystemText(handler);
    expect(systemText).toBe('Static base prompt');
    expect(systemText).not.toContain('<agent_memory>');
    expect(systemText).not.toContain(memoryBody);
  });

  it('should call handler exactly once', async () => {
    const agentsKey = '.tau/AGENTS.md';
    const payload: ContextPayload = {
      skills: [{ name: 's', description: 'd', path: 'p' }],
      memory: { [agentsKey]: 'content' },
    };
    const middleware = createClientContextMiddleware(payload);
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);

    const handler = vi.fn().mockResolvedValue({ content: 'response' });

    await wrapModelCall({ systemMessage: makeSystemMessage('Base'), messages: [], state: {} }, handler);

    expect(handler).toHaveBeenCalledOnce();
  });
});
