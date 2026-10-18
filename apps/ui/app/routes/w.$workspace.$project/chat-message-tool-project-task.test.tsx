// @vitest-environment jsdom
import { readUIMessageStream } from 'ai';
import type { UIMessageChunk } from 'ai';
import { jsonValueSchema } from '@taucad/agent-host';
import type { AgentLogEvent } from '@taucad/agent-host';
import { projectAgentHostEvent } from '#services/agent-host-event-projection.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ToolInvocation } from '@taucad/chat';
import type { ProjectTask, ProjectTaskMessage } from '@taucad/agent-host/wire';
import {
  ChatMessageToolProjectTask,
  renderProjectTaskDynamic,
  isProjectTaskToolName,
} from '#routes/w.$workspace.$project/chat-message-tool-project-task.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText, noun }: { readonly errorText: string; readonly noun: string }) => (
    <div role='alert'>
      {noun}: {errorText}
    </div>
  ),
}));
afterEach(cleanup);

const task: ProjectTask = {
  id: 'child',
  projectId: 'project',
  chatId: 'chat',
  parentTaskId: 'parent',
  depth: 1,
  title: 'Inspect bracket',
  prompt: 'Check the clearance',
  provider: { id: 'codex', model: 'model' },
  createdAt: 1,
  closed: false,
  attempts: [
    {
      id: 'attempt',
      number: 1,
      status: 'running',
      source: { revisionId: 'revision', checkoutId: 'checkout' },
      toolGrant: { toolChoice: 'auto' },
      createdAt: 1,
    },
  ],
};
const spawnInput = { requestId: 'spawn', title: task.title, prompt: task.prompt, provider: task.provider };
const message: ProjectTaskMessage = {
  id: 'message',
  sequence: 1,
  projectId: 'project',
  senderTaskId: 'parent',
  recipientTaskId: 'child',
  requestId: 'send',
  text: 'Measure the clearance',
  createdAt: 1,
};
const expand = async (name: RegExp) => userEvent.click(screen.getByRole('button', { name }));

describe('task tool transcript cards', () => {
  it('should disclose typed spawn input and the actual attempt state without claiming completion', async () => {
    const part: ToolInvocation<'task_spawn'> = {
      toolCallId: 'spawn',
      state: 'output-available',
      input: spawnInput,
      output: task,
    };
    render(<ChatMessageToolProjectTask name='task_spawn' part={part} />);
    await expand(/Created Inspect bracket/u);
    expect(screen.getByText('Check the clearance')).toBeVisible();
    expect(screen.getByText('Agent: codex · model')).toBeVisible();
    expect(screen.getByText('Attempt 1: running')).toBeVisible();
    expect(screen.queryByText(/completed/u)).not.toBeInTheDocument();
  });
  it('should show pending input while spawn is being admitted', async () => {
    render(<ChatMessageToolProjectTask name='task_spawn' part={{ state: 'input-available', input: spawnInput }} />);
    await expand(/Starting Inspect bracket/u);
    expect(screen.getByText('Check the clearance')).toBeVisible();
    expect(screen.queryByText(/Attempt 1/u)).not.toBeInTheDocument();
  });
  it('should name a recorded message without claiming delivery', async () => {
    render(
      <ChatMessageToolProjectTask
        name='task_send'
        part={{
          state: 'output-available',
          input: { requestId: 'send', taskId: 'child', text: message.text },
          output: message,
        }}
      />,
    );
    await expand(/Recorded task message/u);
    expect(screen.getByText('Returned from parent to child.')).toBeVisible();
    expect(screen.getByText(/does not confirm delivery/u)).toBeVisible();
  });
  it.each(['task_read', 'task_wait'] as const)(
    'should render %s snapshot statuses and mailbox pagination',
    async (name) => {
      render(
        <ChatMessageToolProjectTask
          name={name}
          part={{
            state: 'output-available',
            input: {},
            output: { tasks: [task], messages: [message], cursor: 2, nextCursor: 1, hasMore: true },
          }}
        />,
      );
      await expand(/tasks and messages|task updates/u);
      expect(screen.getByText('Inspect bracket · running')).toBeVisible();
      expect(screen.getByText('Returned from parent to child: Measure the clearance')).toBeVisible();
      expect(screen.getByText(/More messages available/u)).toBeVisible();
    },
  );
  it.each(['task_cancel', 'task_resume'] as const)('should preserve the actual %s outcome status', async (name) => {
    const status = name === 'task_cancel' ? 'cancelling' : 'running';
    const output: ProjectTask = {
      ...task,
      attempts: [{ ...task.attempts[0]!, number: name === 'task_cancel' ? 1 : 2, status }],
    };
    render(
      <ChatMessageToolProjectTask
        name={name}
        part={{ state: 'output-available', input: { taskId: 'child', requestId: 'action' }, output }}
      />,
    );
    await expand(/Inspect bracket/u);
    expect(screen.getByText(name === 'task_cancel' ? 'Attempt 1: cancelling' : 'Attempt 2: running')).toBeVisible();
  });
  it('should show refusal errors and denied calls through the existing error card', () => {
    render(
      <ChatMessageToolProjectTask
        name='task_spawn'
        part={{ state: 'output-error', input: spawnInput, errorText: 'TASK_CAPACITY: Too many active children' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('TASK_CAPACITY: Too many active children');
    cleanup();
    render(<ChatMessageToolProjectTask name='task_cancel' part={{ state: 'output-denied', input: {} }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('denied');
  });
  it('should refuse to present a mismatched result as success', async () => {
    render(
      <ChatMessageToolProjectTask
        name='task_spawn'
        part={{ state: 'output-available', input: spawnInput, output: message }}
      />,
    );
    await expand(/Could not verify Inspect bracket/u);
    expect(screen.getByText(/does not match the task result format/u)).toBeVisible();
  });
  it.each(['task_spawn', 'task_read', 'task_send', 'task_wait', 'task_cancel', 'task_resume'] as const)(
    'should render normalized ACP %s durable rows through the real UI stream converter',
    async (name) => {
      // Captured envelope fields are asserted from real Codex MCP wrappers by
      // packages/host/src/acp/session-projection.test.ts; UI consumes that owner output.
      const input =
        name === 'task_spawn'
          ? spawnInput
          : name === 'task_send'
            ? { taskId: 'child', requestId: 'send', text: message.text }
            : name === 'task_read' || name === 'task_wait'
              ? {}
              : { taskId: 'child', requestId: 'action' };
      const output =
        name === 'task_send'
          ? message
          : name === 'task_read' || name === 'task_wait'
            ? { tasks: [task], messages: [message], cursor: 1, nextCursor: 1, hasMore: false }
            : task;
      const metadata = {
        tauInternal: { kind: 'external-tool', origin: 'external', agentId: 'codex', presentation: 'tau-mcp' },
      };
      const base = {
        version: 1,
        leaderEpoch: 'leader',
        sequence: 1,
        recordedAt: '2026-10-13T00:00:00.000Z',
        runId: 'run',
      } as const;
      const events: AgentLogEvent[] = [
        {
          ...base,
          type: 'message.appended',
          message: {
            id: 'input',
            role: 'tool-input',
            toolCallId: 'call',
            toolName: name,
            call: { toolCallId: 'call', nativeName: name, kind: 'execute', status: 'pending' },
            content: jsonValueSchema.parse(input),
            metadata,
          },
        },
        {
          ...base,
          sequence: 2,
          type: 'message.appended',
          message: {
            id: 'output',
            role: 'tool-output',
            toolCallId: 'call',
            toolName: name,
            call: { toolCallId: 'call', nativeName: name, kind: 'execute', status: 'completed' },
            content: jsonValueSchema.parse(output),
            isError: false,
            metadata,
          },
        },
      ];
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const event of events) {
            for (const chunk of projectAgentHostEvent(event)) {
              controller.enqueue(chunk);
            }
          }
          controller.close();
        },
      });
      let last;
      for await (const rendered of readUIMessageStream({ stream })) {
        last = rendered;
      }
      const part = last?.parts.find((candidate) => candidate.type === 'dynamic-tool');
      expect(part?.toolMetadata?.['tau']).toMatchObject({ presentation: 'tau-mcp', nativeName: name });
      expect(part).toBeDefined();
      if (part === undefined) {
        throw new Error('ACP task projection did not produce a dynamic tool part');
      }
      render(renderProjectTaskDynamic({ part }));
      await userEvent.click(screen.getByRole('button'));
      if (name === 'task_send') {
        expect(screen.getByText('Returned from parent to child.')).toBeVisible();
      } else if (name === 'task_read' || name === 'task_wait') {
        expect(screen.getByText('Inspect bracket · running')).toBeVisible();
      } else {
        expect(screen.getByText('Attempt 1: running')).toBeVisible();
      }
    },
  );
  it('should render ACP Tau MCP task calls through the same card and preserve preliminary progress', async () => {
    const part = {
      type: 'dynamic-tool',
      toolName: 'mcp__tau__task_spawn',
      toolCallId: 'acp-spawn',
      state: 'output-available',
      input: spawnInput,
      output: task,
      toolMetadata: { tau: { presentation: 'tau-mcp', nativeName: 'task_spawn' } },
    } as const;
    render(renderProjectTaskDynamic({ part }));
    await expand(/Created Inspect bracket/u);
    expect(screen.getByText('Attempt 1: running')).toBeVisible();
    cleanup();
    render(renderProjectTaskDynamic({ part: { ...part, preliminary: true } }));
    expect(screen.getByRole('button', { name: /Starting Inspect bracket/u })).toBeVisible();
    expect(screen.queryByText(/Attempt 1/u)).not.toBeInTheDocument();
  });
  it('should leave unrelated external calls to their existing renderer', () => {
    render(
      renderProjectTaskDynamic({
        part: { type: 'dynamic-tool', toolName: 'exec', toolCallId: 'external', state: 'input-available', input: {} },
      }),
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('should leave a foreign external tool named task_spawn with its external renderer', () => {
    render(
      renderProjectTaskDynamic({
        part: {
          type: 'dynamic-tool',
          toolName: 'task_spawn',
          toolCallId: 'external',
          state: 'output-available',
          input: spawnInput,
          output: task,
          toolMetadata: { tau: { origin: 'external', agentId: 'foreign' } },
        },
      }),
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('should recognize exactly the canonical task tool names', () => {
    expect(isProjectTaskToolName('task_spawn')).toBe(true);
    expect(isProjectTaskToolName('task_resume')).toBe(true);
    expect(isProjectTaskToolName('toString')).toBe(false);
    expect(isProjectTaskToolName(undefined)).toBe(false);
  });
});
