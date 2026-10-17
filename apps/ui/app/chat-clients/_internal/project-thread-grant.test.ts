import { describe, expect, it } from 'vitest';
import type { AgentChannelAdmissionConfig } from '@taucad/agent-host/wire';
import { projectThreadGrant } from '#chat-clients/_internal/project-thread-grant.js';

describe('Project threads admission', () => {
  it('should restrict new Tau turns while preserving existing grants and task controls', () => {
    const admitted: AgentChannelAdmissionConfig = {
      systemPrompt: 'Inherited instructions',
      toolChoice: 'auto',
      allowedTools: ['task_spawn', 'task_send', 'task_cancel', 'read_file'],
    };
    const disabled = projectThreadGrant(admitted, false);
    expect(disabled.allowedTools).toEqual(['task_send', 'task_cancel', 'read_file']);
    expect(disabled.systemPrompt).toBe(admitted.systemPrompt);
    expect(admitted.allowedTools).toContain('task_spawn');
    expect(projectThreadGrant(admitted, true)).toBe(admitted);
    expect(projectThreadGrant(disabled, true).allowedTools).not.toContain('task_spawn');
  });

  it('should restrict Codex delegation without replacing its execution or inherited context', () => {
    const admitted: AgentChannelAdmissionConfig = {
      agent: { kind: 'acp', id: 'codex' },
      systemPrompt: 'Inherited instructions',
      toolChoice: 'auto',
    };
    const disabled = projectThreadGrant(admitted, false);
    expect(disabled.agent).toEqual(admitted.agent);
    expect(disabled.systemPrompt).toBe(admitted.systemPrompt);
    expect(disabled.allowedTools).not.toContain('task_spawn');
    expect(disabled.allowedTools).toEqual(
      expect.arrayContaining(['task_read', 'task_send', 'task_cancel', 'task_resume']),
    );
    expect(admitted.allowedTools).toBeUndefined();
    expect(projectThreadGrant(admitted, true)).toBe(admitted);
  });

  it('should never broaden an explicit restrictive grant when disabled', () => {
    const admitted: AgentChannelAdmissionConfig = {
      systemPrompt: '',
      toolChoice: 'none',
      allowedTools: [],
    };
    expect(projectThreadGrant(admitted, false)).toEqual(admitted);
  });
});
