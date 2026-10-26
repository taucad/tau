import '#styles/global.css';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { Ask } from '@taucad/chat';
import { chatComposerTrayClassName } from '#components/chat/chat-input-styles.js';
import type { ChatMessageQueueProps } from '#components/chat/chat-message-queue-view.js';
import { ChatMessageQueueView } from '#components/chat/chat-message-queue-view.js';

let hasTasks = true;
let asks: Ask[] = [];
let recordFailure: string | undefined;
const onScreen = new Set<string>();
const answers = {};
vi.mock('#hooks/use-chat.js', () => ({ useChatContext: () => ({ activeChatId: 'tray-audit' }) }));
vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: () =>
    hasTasks
      ? {
          kind: 'text',
          content: new TextEncoder().encode(
            'version: 1\nitems:\n  - id: engine\n    title: Decompose V12 engine into subassemblies\n    status: in_progress\n',
          ),
        }
      : { kind: 'loading' },
}));
vi.mock('#components/chat/chat-questions-context.js', () => ({
  useOptionalChatQuestions: () => ({
    asks,
    answers,
    recordFailure,
    now: 0,
    answer: async () => undefined,
    hold: async () => undefined,
    decline: async () => undefined,
  }),
  useOnScreenAskIds: () => onScreen,
  useReportAskOnScreen: () => undefined,
}));
vi.mock('#lib/agent-host-placement.js', () => ({ externalAgentDisplayName: (id: string) => id }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
const { ChatTodoList } = await import('#components/chat/chat-todo-list.js');
const { ChatQuestionQueue } = await import('#components/chat/chat-question-queue.js');
const ask: Ask = {
  id: 'mount',
  source: 'tau',
  answerVersion: 2,
  askedAt: new Date(0).toISOString(),
  deadline: null,
  questions: [
    {
      id: 'mount',
      header: 'Mounting',
      question: 'How should the engine mount?',
      options: [{ label: 'Bolts' }, { label: 'Clamps' }],
      allowsText: true,
    },
  ],
};
const items = ['one', 'two'].map<ChatMessageQueueProps['items'][number]>((id) => ({
  id,
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: `Update the engine task ${id}` }] },
}));

beforeEach(() => {
  hasTasks = true;
  asks = [ask];
  recordFailure = undefined;
  localStorage.removeItem('tau:chat-todo-collapsed:tray-audit');
});
afterEach(() => {
  cleanup();
  document.documentElement.className = '';
});

function Tray({
  width,
  hasQueued = true,
  error,
}: {
  readonly width: number;
  readonly hasQueued?: boolean;
  readonly error?: string;
}): React.JSX.Element {
  return (
    <div style={{ width }} className='bg-background p-2 text-foreground'>
      <section aria-label='Composer adornments' className={chatComposerTrayClassName}>
        <ChatTodoList />
        <ChatMessageQueueView
          items={hasQueued ? items : []}
          error={error}
          onEdit={async () => undefined}
          onSteer={async () => undefined}
          onMove={async () => undefined}
          onRetry={() => undefined}
        />
        <ChatQuestionQueue />
      </section>
    </div>
  );
}

function expectDividers(tray: HTMLElement): void {
  const sections = [...tray.children];
  for (const [index, section] of sections.entries()) {
    const style = getComputedStyle(section);
    expect(style.borderTopWidth).toBe('0px');
    expect(style.borderBottomWidth).toBe(index < sections.length - 1 ? '1px' : '0px');
  }
}

it.each(
  [false, true].flatMap((tasks) =>
    [false, true].flatMap((messages) => [false, true].map((questions) => ({ tasks, messages, questions }))),
  ),
)(
  'should separate visible sections with tasks=$tasks messages=$messages questions=$questions',
  async ({ tasks, messages, questions }) => {
    hasTasks = tasks;
    asks = questions ? [ask] : [];
    render(<Tray width={320} hasQueued={messages} />);
    if (questions) {
      await screen.findByRole('button', { name: /question waiting/u });
    }
    const tray = screen.getByLabelText('Composer adornments');
    const count = Number(tasks) + Number(messages) + Number(questions);
    expect(tray.children).toHaveLength(count);
    expectDividers(tray);
    expect(getComputedStyle(tray).display).toBe(count === 0 ? 'none' : 'flex');
  },
);

it.each([
  { width: 280, theme: '' },
  { width: 400, theme: '' },
  { width: 280, theme: 'dark' },
  { width: 400, theme: 'dark' },
])('should align adornment glyphs at $width px in theme $theme', async ({ width, theme }) => {
  await page.viewport(640, 800);
  document.documentElement.className = theme;
  render(<Tray width={width} />);
  const tasks = screen.getByRole('button', { name: /Tasks:/u });
  const questions = await screen.findByRole('button', { name: /question waiting/u });
  await waitFor(() => {
    expect(questions).toHaveAttribute('aria-expanded', 'true');
  });
  await userEvent.click(questions);
  const handle = screen.getByRole('button', { name: 'Reorder queued message 1' });
  const options = screen.getByRole('button', { name: 'Options for queued message 1' });
  const center = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  };
  for (const header of [tasks, questions]) {
    const icons = header.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    expect(center(icons[0]!).x).toBeCloseTo(center(handle).x);
    expect(center(icons[1]!).x).toBeCloseTo(center(options).x);
    for (const icon of icons) {
      expect(center(icon).y).toBeCloseTo(center(header).y);
    }
  }
  for (const name of ['Send now', 'Delete queued message 1', 'Options for queued message 1']) {
    const control = screen.getAllByRole('button', { name })[0]!;
    expect(center(control).y).toBeCloseTo(center(handle).y);
  }
  const tray = screen.getByRole('region', { name: 'Composer adornments' });
  expect(tray.scrollWidth).toBeLessThanOrEqual(tray.clientWidth);
  expectDividers(tray);
  await page.screenshot({
    element: tray.parentElement!,
    path: `../../../../../out/test-results/message-queue/tray-${theme || 'light'}-${String(width)}.png`,
  });
  await userEvent.click(tasks);
  await userEvent.click(questions);
  expectDividers(tray);
  expect(getComputedStyle(screen.getByRole('list', { name: 'Tasks' })).borderTopWidth).toBe('1px');
  expect(getComputedStyle(screen.getByRole('list', { name: 'Questions' })).borderTopWidth).toBe('1px');
  await page.screenshot({
    element: tray.parentElement!,
    path: `../../../../../out/test-results/message-queue/tray-expanded-${theme || 'light'}-${String(width)}.png`,
  });
});

it('should separate queue and question errors without a divider above an empty queue', async () => {
  recordFailure = 'Questions could not be loaded';
  const { rerender } = render(<Tray width={320} error='Messages could not be loaded' />);
  expectDividers(screen.getByRole('region', { name: 'Composer adornments' }));
  await page.screenshot({
    element: screen.getByLabelText('Composer adornments'),
    path: '../../../../../out/test-results/message-queue/tray-errors.png',
  });
  const error = screen.getByText('Messages could not be loaded').closest('[role=alert]')!;
  expect(getComputedStyle(error).borderTopWidth).toBe('1px');
  rerender(<Tray width={320} hasQueued={false} error='Messages could not be loaded' />);
  expect(getComputedStyle(error).borderTopWidth).toBe('0px');
  expectDividers(screen.getByRole('region', { name: 'Composer adornments' }));
});
