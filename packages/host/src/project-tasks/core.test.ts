import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRegistry, TurnPlacementPort } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';

import { createProjectTaskComposition } from '#project-tasks/core.js';
import type { ProjectTaskFiles } from '#project-tasks/core.js';

describe('project task placement grant', () => {
  it('should install authenticated task tools on a browser candidate grant', async () => {
    const files = mock<ProjectTaskFiles>();
    const registry = mock<ToolRegistry>();
    registry.list.mockReturnValue([]);
    const placement = mock<TurnPlacementPort>();
    placement.admit.mockResolvedValue({
      requestId: 'admit-child',
      status: 'applied',
      placement: { checkoutId: 'candidate', mode: 'candidate', root: '/candidate', tools: registry },
    });
    const core = createProjectTaskComposition({
      projectId: 'project',
      filesystem: files,
      systemPrompt: 'You are Tau.',
      createCandidate: async () => ({ checkoutId: 'candidate', checkoutRoot: '/candidate' }),
    });
    const granted = await core.wrapPlacement(placement).admit({
      requestId: 'admit-child',
      key: { chatId: 'child', turnId: 'turn', runId: 'child-run', attempt: 1 },
    });
    expect(granted.status).toBe('applied');
    if (granted.status === 'refused') {
      throw new Error('Unexpected refusal.');
    }
    expect(granted.placement.tools.list().map(({ name }) => name)).toContain(toolName.taskSpawn);
    expect(
      await granted.placement.tools.invoke({
        toolName: toolName.taskSpawn,
        toolCallId: 'call-forged',
        input: {},
        runId: 'forged-run',
        signal: new AbortController().signal,
      }),
    ).toEqual({
      isError: true,
      content: { errorCode: 'TOOL_NOT_ALLOWED', message: 'This tool is outside the admitted parent grant.' },
    });
    expect(registry.invoke).not.toHaveBeenCalled();
  });
});
