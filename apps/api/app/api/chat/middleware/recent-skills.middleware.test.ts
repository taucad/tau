import { describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { InMemoryStore } from '@langchain/langgraph';
import type { ContextPayload } from '@taucad/chat';
import { createRecentSkillsMiddleware } from '#api/chat/middleware/recent-skills.middleware.js';
import { recentSkillsIndexKey, recentSkillsRootNamespace } from '#api/chat/recent-skills-namespace.js';
import { resolveMiddlewareHook } from '#testing/middleware-testing.utils.js';

function contextPayloadWith(skills: ReadonlyArray<{ name: string; fingerprint?: string }>): ContextPayload {
  return {
    skills: skills.map((skill) => ({
      name: skill.name,
      description: `${skill.name} skill`,
      ...(skill.fingerprint !== undefined && { fingerprint: skill.fingerprint }),
    })),
  };
}

async function seedStore(
  chatId: string,
  skills: ReadonlyArray<{ name: string; fingerprint: string; content: string }>,
): Promise<{ store: InMemoryStore; namespace: string[] }> {
  const namespace = [...recentSkillsRootNamespace, chatId];
  const store = new InMemoryStore();
  await store.put(namespace, recentSkillsIndexKey, { names: skills.map((skill) => skill.name) });
  await Promise.all(
    skills.map(async (skill) =>
      store.put(namespace, skill.name, {
        skillName: skill.name,
        resourceUri: `file:.agents/skills/${skill.name}/SKILL.md`,
        skillPath: `.agents/skills/${skill.name}/SKILL.md`,
        source: 'user',
        fingerprint: skill.fingerprint,
        content: skill.content,
      }),
    ),
  );
  return { store, namespace };
}

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

  it('should re-inject content and keep the entry when the fingerprint still matches', async () => {
    const chatId = 'chat-fp-match';
    const { store, namespace } = await seedStore(chatId, [
      { name: 'woodworking', fingerprint: 'woodhash', content: '# Woodworking' },
    ]);

    const middleware = createRecentSkillsMiddleware(
      contextPayloadWith([{ name: 'woodworking', fingerprint: 'woodhash' }]),
    );
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
    expect(await store.get(namespace, 'woodworking')).not.toBeNull();
    const indexAfter = await store.get(namespace, recentSkillsIndexKey);
    expect(indexAfter?.value).toEqual({ names: ['woodworking'] });
  });

  it('should evict an edited skill and keep a still-fresh sibling', async () => {
    const chatId = 'chat-fp-edited';
    const { store, namespace } = await seedStore(chatId, [
      { name: 'woodworking', fingerprint: 'woodhash', content: '# Woodworking' },
      { name: 'welding', fingerprint: 'weldhash-old', content: '# Welding' },
    ]);

    const middleware = createRecentSkillsMiddleware(
      contextPayloadWith([
        { name: 'woodworking', fingerprint: 'woodhash' },
        { name: 'welding', fingerprint: 'weldhash-new' },
      ]),
    );
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
    expect(passedRequest.messages[0]!.content).toContain('# Woodworking');
    expect(passedRequest.messages[0]!.content).not.toContain('welding');
    expect(await store.get(namespace, 'welding')).toBeNull();
    expect(await store.get(namespace, 'woodworking')).not.toBeNull();
    const indexAfter = await store.get(namespace, recentSkillsIndexKey);
    expect(indexAfter?.value).toEqual({ names: ['woodworking'] });
  });

  it('should evict a skill that is absent from the current listing', async () => {
    const chatId = 'chat-fp-absent';
    const { store, namespace } = await seedStore(chatId, [
      { name: 'woodworking', fingerprint: 'woodhash', content: '# Woodworking' },
    ]);

    const middleware = createRecentSkillsMiddleware(
      contextPayloadWith([{ name: 'metalworking', fingerprint: 'metalhash' }]),
    );
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);
    const handler = vi.fn().mockResolvedValue({ content: 'ok' });
    const original = new HumanMessage('continue');

    await wrapModelCall(
      {
        messages: [original],
        runtime: { store, context: { chatId, skillContentRestoreNeeded: true } },
      },
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: HumanMessage[] };
    expect(passedRequest.messages[0]).toBe(original);
    expect(await store.get(namespace, 'woodworking')).toBeNull();
    const indexAfter = await store.get(namespace, recentSkillsIndexKey);
    expect(indexAfter?.value).toEqual({ names: [] });
  });

  it('should evict conservatively when the listing entry has no fingerprint', async () => {
    const chatId = 'chat-fp-missing';
    const { store, namespace } = await seedStore(chatId, [
      { name: 'woodworking', fingerprint: 'woodhash', content: '# Woodworking' },
    ]);

    const middleware = createRecentSkillsMiddleware(contextPayloadWith([{ name: 'woodworking' }]));
    const wrapModelCall = resolveMiddlewareHook(middleware.wrapModelCall);
    const handler = vi.fn().mockResolvedValue({ content: 'ok' });
    const original = new HumanMessage('continue');

    await wrapModelCall(
      {
        messages: [original],
        runtime: { store, context: { chatId, skillContentRestoreNeeded: true } },
      },
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: HumanMessage[] };
    expect(passedRequest.messages[0]).toBe(original);
    expect(await store.get(namespace, 'woodworking')).toBeNull();
  });
});
