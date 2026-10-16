import '#styles/global.css';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { AcpActivityData } from '@taucad/chat';
import { ChatAcpActivity } from '#components/chat/chat-acp-activity.js';

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));

const data: AcpActivityData = { type: 'acp-activity', id: 'turn-observations', agentId: 'grok' };
const evidence = '../../../../../out/research/grok-acp-parity';

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
  document.documentElement.style.fontSize = '';
});

it('should replace retry progress with honest compaction outcomes in Chromium', async () => {
  await page.viewport(640, 480);
  const { rerender } = render(
    <ChatAcpActivity data={{ ...data, activity: { kind: 'retry', status: 'running', label: 'Retrying' } }} />,
  );
  expect(screen.getByRole('status', { name: 'Agent activity' }).getAttribute('aria-busy')).toBe('true');
  await page.screenshot({ path: `${evidence}/activity-retrying.png` });
  rerender(
    <ChatAcpActivity
      data={{ ...data, activity: { kind: 'compaction', status: 'running', label: 'Compacting context' } }}
    />,
  );
  expect(screen.queryByText('Retrying')).toBeNull();
  expect(screen.getByRole('status', { name: 'Agent activity' }).textContent).toBe('Compacting context');
  rerender(
    <ChatAcpActivity
      data={{
        ...data,
        servedModel: 'Grok 4.7 Fast',
        activity: { kind: 'compaction', status: 'completed', label: 'Context compacted' },
      }}
    />,
  );
  expect(screen.getByRole('status', { name: 'Agent activity' }).getAttribute('aria-busy')).toBe('false');
  expect(screen.getByText('Model used: Grok 4.7 Fast')).toBeTruthy();
  await page.screenshot({ path: `${evidence}/activity-compacted.png` });
  rerender(
    <ChatAcpActivity
      data={{ ...data, activity: { kind: 'compaction', status: 'failed', label: 'Context compaction failed' } }}
    />,
  );
  expect(screen.getByRole('alert', { name: 'Agent activity' }).textContent).toBe('Context compaction failed');
  await page.screenshot({ path: `${evidence}/activity-compaction-failed.png` });
});

it('should preserve keyboard focus and an open delegated task across progress and completion', async () => {
  await page.viewport(640, 480);
  const task: NonNullable<AcpActivityData['subagents']>[number] = {
    id: 'child-one',
    description: 'Check cube dimensions',
    status: 'running',
    toolCalls: 0,
  };
  const { rerender } = render(<ChatAcpActivity data={{ ...data, subagents: [task] }} />);
  await userEvent.tab();
  const trigger = screen.getByRole('button', { name: 'Check cube dimensions Working' });
  expect(document.activeElement).toBe(trigger);
  await userEvent.keyboard('{Enter}');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  rerender(<ChatAcpActivity data={{ ...data, subagents: [{ ...task, toolCalls: 1, turns: 1 }] }} />);
  expect(document.activeElement).toBe(trigger);
  expect(screen.getByText('1 tool calls · 1 turns')).toBeTruthy();
  await page.screenshot({ path: `${evidence}/activity-delegated-running.png` });
  rerender(
    <ChatAcpActivity
      data={{
        ...data,
        servedModel: 'Grok 4.7',
        subagents: [{ ...task, status: 'completed', toolCalls: 2, output: 'The cube measures 20 mm.' }],
      }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Check cube dimensions Completed' })).toBe(trigger);
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('The cube measures 20 mm.')).toBeTruthy();
  await page.screenshot({ path: `${evidence}/activity-delegated-completed.png` });
  await userEvent.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await expect.poll(() => screen.queryByText('The cube measures 20 mm.')).toBeNull();
});

it.each([false, true])(
  'should keep child outcomes readable in a narrow dark pane with enlarged text=%s',
  async (enlarged) => {
    await page.viewport(320, 900);
    document.documentElement.className = 'dark';
    document.documentElement.style.fontSize = enlarged ? '200%' : '';
    render(
      <section aria-label='Agent progress' className='w-full p-4'>
        <ChatAcpActivity
          data={{
            ...data,
            servedModel: 'Grok 4.7 Fast',
            subagents: [
              {
                id: 'failed',
                description: 'Inspect the complete bracket geometry and verify every mounting surface',
                status: 'failed',
              },
              { id: 'unknown', description: 'Review dimensional accuracy', status: 'unobserved' },
            ],
          }}
        />
      </section>,
    );
    const region = screen.getByRole('region', { name: 'Agent progress' });
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
    expect(screen.getByRole('alert').textContent).toContain('The delegated task failed');
    const unobserved = screen.getByRole('status', { name: 'No longer observed' });
    expect(unobserved.getAttribute('aria-busy')).toBe('false');
    const unobservedTrigger = screen.getByRole('button', { name: /Review dimensional accuracy/u });
    expect(unobserved.getBoundingClientRect().right).toBeLessThanOrEqual(
      unobservedTrigger.getBoundingClientRect().right,
    );
    for (const status of screen.getAllByRole('status')) {
      expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth);
    }
    expect(screen.getByText('This turn ended before the task reported a result.')).toBeTruthy();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /Inspect the complete bracket/u }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    await expect
      .poll(() => {
        const description = screen.getByText(
          'Inspect the complete bracket geometry and verify every mounting surface',
          {
            selector: 'p',
          },
        );
        return screen.getByRole('alert').getBoundingClientRect().top >= description.getBoundingClientRect().bottom;
      })
      .toBe(true);
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
    await page.screenshot({ path: `${evidence}/activity-narrow${enlarged ? '-enlarged' : ''}.png` });
  },
);
