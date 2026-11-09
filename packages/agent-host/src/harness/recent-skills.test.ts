import { describe, expect, it, vi } from 'vitest';

import type { AgentLogEvent, ProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { foldRecentSkills, maxRecentSkills } from '#harness/recent-skills.js';
import { createAgentSession } from '#harness/session.js';

/* Regression review R2: skills loaded with use_skill must survive compaction, folded from the chat's own event log. */

const appended = (message: ProviderMessage, sequence: number): AgentLogEvent => ({
  version: 1,
  leaderEpoch: 'epoch',
  sequence,
  recordedAt: '2026-11-08T00:00:00.000Z',
  runId: 'run-1',
  type: 'message.appended',
  message,
});

const skillOutput = (
  id: string,
  skillName: string,
  { content = `# ${skillName}`, isError = false }: { readonly content?: string; readonly isError?: boolean } = {},
): ProviderMessage => ({
  id,
  role: 'tool-output',
  toolCallId: `call-${id}`,
  toolName: 'use_skill',
  isError,
  content: isError
    ? { errorCode: 'SKILL_NOT_FOUND', message: 'Unknown skill' }
    : {
        skillName,
        resourceUri: `skill://${skillName}`,
        skillPath: `.tau/skills/${skillName}/SKILL.md`,
        source: 'project',
        fingerprint: `fp-${skillName}`,
        frontmatter: {},
        content,
        supportingFiles: [],
      },
});

describe('foldRecentSkills', () => {
  it('should return activated skills newest first, one per name, with their instructions', () => {
    const skills = foldRecentSkills([
      appended(skillOutput('a', 'gears', { content: 'old gears' }), 0),
      appended(skillOutput('b', 'fasteners'), 1),
      appended(skillOutput('c', 'gears', { content: 'new gears' }), 2),
    ]);

    expect(skills).toEqual([
      {
        skillName: 'gears',
        resourceUri: 'skill://gears',
        skillPath: '.tau/skills/gears/SKILL.md',
        source: 'project',
        fingerprint: 'fp-gears',
        content: 'new gears',
      },
      expect.objectContaining({ skillName: 'fasteners' }),
    ]);
  });

  it('should ignore failed activations and other tools', () => {
    const skills = foldRecentSkills([
      appended(skillOutput('a', 'missing', { isError: true }), 0),
      appended(
        {
          id: 'r',
          role: 'tool-output',
          toolCallId: 'r',
          toolName: 'read_file',
          isError: false,
          content: { skillName: 'x', resourceUri: 'y' },
        },
        1,
      ),
    ]);

    expect(skills).toEqual([]);
  });

  it('should read a result stored as JSON text', () => {
    const output = skillOutput('a', 'gears');
    const skills = foldRecentSkills([
      appended({ ...output, content: JSON.stringify(output.content) } as ProviderMessage, 0),
    ]);

    expect(skills.map((skill) => skill.skillName)).toEqual(['gears']);
  });

  it('should keep at most the most recent eight', () => {
    const events = Array.from({ length: maxRecentSkills + 3 }, (_, index) =>
      appended(skillOutput(`s${String(index)}`, `skill-${String(index)}`), index),
    );

    const skills = foldRecentSkills(events);

    expect(skills).toHaveLength(maxRecentSkills);
    expect(skills[0]?.skillName).toBe(`skill-${String(maxRecentSkills + 2)}`);
  });
});

class RecordingTransport implements ModelTransport {
  public readonly funding = { type: 'unfunded' } as const;
  public readonly requests: ModelStreamRequest[] = [];

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    yield { type: 'text-delta', text: 'ok' };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

const skillOutputFor = (toolCallId: string): ProviderMessage => {
  const output = skillOutput('o1', 'gears');
  return output.role === 'tool-output' ? { ...output, toolCallId } : output;
};

describe('recent skills in a session with no host-supplied store', () => {
  it('should tell the model which skills this chat already activated', async () => {
    const file = createMemoryEventLogFile();
    const log = await file.open();
    const history: ProviderMessage[] = [
      { id: 'u1', role: 'user', content: 'Use the gears skill' },
      {
        id: 'a1',
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call-g', name: 'use_skill', arguments: { skillName: 'gears' } }],
        metadata: { stopReason: 'toolUse' },
      },
      { id: 'i1', role: 'tool-input', toolCallId: 'call-g', toolName: 'use_skill', content: { skillName: 'gears' } },
      skillOutputFor('call-g'),
      { id: 'a2', role: 'assistant', content: [{ type: 'text', text: 'Loaded.' }], metadata: { stopReason: 'stop' } },
    ];
    for (const [sequence, message] of history.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- the log appends in order.
      await log.append(appended(message, sequence));
    }
    await log.close();
    const transport = new RecordingTransport();
    const session = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-2',
      leaderEpoch: 'epoch-2',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
      modelTransport: transport,
      toolRegistry: { list: () => [], invoke: vi.fn() },
      eventLog: await file.open(),
    });

    await session.prompt({ id: 'u2', role: 'user', content: 'Now make the gear.' });
    await session.close();

    const sent = JSON.stringify(transport.requests[0]?.messages ?? []);
    expect(sent).toContain('<recently_used_skills>');
    expect(sent).toContain('gears (resource=skill://gears');
  });
});
