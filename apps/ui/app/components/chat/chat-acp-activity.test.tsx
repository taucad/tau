// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AcpActivityData } from '@taucad/chat';
import { ChatAcpActivity } from '#components/chat/chat-acp-activity.js';

let isDebug = false;
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => isDebug }));

const session: AcpActivityData = {
  type: 'acp-activity',
  id: 'session-state',
  agentId: 'grok',
};

beforeEach(() => {
  isDebug = false;
});

describe('ACP activity presentation', () => {
  it('should omit an empty session and retain honest retry and compaction outcomes', () => {
    const { container, rerender } = render(<ChatAcpActivity data={session} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ChatAcpActivity
        data={{ ...session, activity: { kind: 'retry', status: 'running', label: 'Retrying in 2 seconds' } }}
      />,
    );
    expect(screen.getByRole('status', { name: 'Agent activity' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Agent activity' })).toMatchTextContent('Retrying in 2 seconds');
    rerender(
      <ChatAcpActivity
        data={{ ...session, activity: { kind: 'compaction', status: 'completed', label: 'Context compacted' } }}
      />,
    );
    expect(screen.getByRole('status', { name: 'Agent activity' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText(/Retrying/u)).toBeNull();
    rerender(
      <ChatAcpActivity
        data={{ ...session, activity: { kind: 'compaction', status: 'failed', label: 'Context compaction failed' } }}
      />,
    );
    expect(screen.getByRole('alert', { name: 'Agent activity' })).toMatchTextContent('Context compaction failed');
  });

  it('should preserve keyboard disclosure and focus when delegated work completes', async () => {
    const task: NonNullable<AcpActivityData['subagents']>[number] = {
      id: 'child-1',
      description: 'Check cube dimensions',
      status: 'running',
      toolCalls: 0,
    };
    const { rerender } = render(<ChatAcpActivity data={{ ...session, subagents: [task] }} />);
    const trigger = screen.getByRole('button', { name: 'Check cube dimensions Working' });
    const user = userEvent.setup();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('0 tool calls')).toBeInTheDocument();
    rerender(
      <ChatAcpActivity
        data={{
          ...session,
          subagents: [
            { ...task, status: 'completed', toolCalls: 2, duration: 1250, output: 'The cube measures 20 mm.' },
          ],
        }}
      />,
    );
    const completed = screen.getByRole('button', { name: 'Check cube dimensions Completed' });
    expect(completed).toBe(trigger);
    expect(completed).toHaveFocus();
    expect(completed).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('The cube measures 20 mm.')).toBeInTheDocument();
    expect(screen.getByText('2 tool calls · 1.25 s')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(completed).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('The cube measures 20 mm.')).toBeNull();
  });

  it('should keep failed and unobserved task consequences visible outside their disclosures', () => {
    render(
      <ChatAcpActivity
        data={{
          ...session,
          subagents: [
            { id: 'failed', description: 'Inspect the model', status: 'failed', error: 'private diagnostic' },
            { id: 'background', description: 'Review dimensions', status: 'unobserved' },
            { id: 'cancelled', description: 'Check the mesh', status: 'cancelled' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('alert')).toMatchTextContent('The delegated task failed');
    expect(screen.getByRole('button', { name: 'Review dimensions No longer observed' })).toBeInTheDocument();
    expect(screen.getByText('This turn ended before the task reported a result.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the mesh Stopped' })).toBeInTheDocument();
    expect(screen.queryByText('private diagnostic')).toBeNull();
    expect(screen.getAllByRole('status').map((status) => status.getAttribute('aria-busy'))).toEqual([
      'false',
      'false',
      'false',
    ]);
  });

  it('should render provider text inertly and expose diagnostic details only in Debug', async () => {
    const data: AcpActivityData = {
      ...session,
      activity: { kind: 'retry', status: 'running', label: 'Retrying\u202E', detail: 'private retry diagnostic' },
      subagents: [
        {
          id: 'child',
          description: '<script>bad()</script>\u202E',
          status: 'completed',
          output: '<img src=x onerror=bad()>\u202E',
          error: 'private child diagnostic',
        },
      ],
      servedModel: 'grok-4.7\u202E',
    };
    const { container, rerender } = render(<ChatAcpActivity data={data} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '<script>bad()</script> Completed' }));
    expect(screen.getByText('<img src=x onerror=bad()>')).toBeInTheDocument();
    expect(container.querySelector('script, img')).toBeNull();
    expect(container.textContent).not.toContain('\u202E');
    expect(screen.getByText('Model used: grok-4.7')).toBeInTheDocument();
    expect(screen.queryByText(/private/u)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activity details' })).toBeNull();
    isDebug = true;
    rerender(<ChatAcpActivity data={data} />);
    await user.click(screen.getByRole('button', { name: 'Activity details' }));
    expect(screen.getByText('private retry diagnostic')).toBeInTheDocument();
    expect(screen.getByText('private child diagnostic')).toBeInTheDocument();
    isDebug = false;
    rerender(<ChatAcpActivity data={data} />);
    expect(screen.queryByText(/private/u)).toBeNull();
  });
});
