import { describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { InMemoryStore } from '@langchain/langgraph';
import { createRecentSkillsMiddleware } from '#api/chat/middleware/recent-skills.middleware.js';
import { recentSkillsIndexKey, recentSkillsRootNamespace } from '#api/chat/recent-skills-namespace.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

describe('createRecentSkillsMiddleware', () => {
  it('should re-inject recent skill metadata without duplicating full skill bodies on normal turns', async () => {
    const chatId = 'chat-recent-skill-test';
    const namespace = [...recentSkillsRootNamespace, chatId];
    const store = new InMemoryStore();
    await store.put(namespace, recentSkillsIndexKey, { names: ['woodworking'] });
    await store.put(namespace, 'woodworking', {
      skillName: 'woodworking',
      resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
      skillPath: '.agents/skills/woodworking/SKILL.md',
      source: 'user',
      fingerprint: 'woodhash',
      content: '# Woodworking',
    });

    const middleware = createRecentSkillsMiddleware();
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);
    const handler = vi.fn().mockResolvedValue({ content: 'ok' });
    const originalMessage = new HumanMessage('continue');

    await wrapModelCall(
      {
        messages: [originalMessage],
        runtime: { store, context: { chatId } },
      },
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: HumanMessage[] };
    const resumeMessage = passedRequest.messages[0]!;
    expect(resumeMessage).toBeInstanceOf(HumanMessage);
    expect(resumeMessage.content).toContain('<recently_used_skills>');
    expect(resumeMessage.content).toContain('woodworking');
    expect(resumeMessage.content).toContain('resource=file:.agents/skills/woodworking/SKILL.md');
    expect(resumeMessage.content).toContain('path=.agents/skills/woodworking/SKILL.md');
    expect(resumeMessage.content).toContain('fingerprint=woodhash');
    expect(resumeMessage.content).toContain('This is metadata only; call use_skill again');
    expect(resumeMessage.content).not.toContain('# Woodworking');
    expect(passedRequest.messages[1]).toBe(originalMessage);
  });

  it('should re-inject exact previously invoked skill content after compaction', async () => {
    const chatId = 'chat-recent-skill-compacted';
    const namespace = [...recentSkillsRootNamespace, chatId];
    const store = new InMemoryStore();
    await store.put(namespace, recentSkillsIndexKey, { names: ['woodworking'] });
    await store.put(namespace, 'woodworking', {
      skillName: 'woodworking',
      resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
      skillPath: '.agents/skills/woodworking/SKILL.md',
      source: 'user',
      fingerprint: 'woodhash',
      content: '# Woodworking',
    });

    const middleware = createRecentSkillsMiddleware();
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);
    const handler = vi.fn().mockResolvedValue({ content: 'ok' });

    await wrapModelCall(
      {
        messages: [new HumanMessage('continue')],
        runtime: { store, context: { chatId, skillContentRestoreNeeded: true } },
      },
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: HumanMessage[] };
    expect(passedRequest.messages[0]!.content).toContain('Preserve these exact previously-invoked instructions');
    expect(passedRequest.messages[0]!.content).toContain('# Woodworking');
  });
});
