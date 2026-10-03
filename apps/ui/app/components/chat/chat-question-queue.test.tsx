// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Ask, AskAnswers } from '@taucad/chat';

const askedAt = Date.parse('2026-10-03T10:00:00.000Z');
let asks: Ask[] = [];
let answers: Record<string, AskAnswers> = {};
let onScreen: ReadonlySet<string> = new Set();
const answer = vi.fn(async () => undefined);

vi.mock('#components/chat/chat-questions-context.js', () => ({
  useOptionalChatQuestions: () => ({
    asks,
    answers,
    now: askedAt + 10_000,
    answer,
    hold: async () => undefined,
    decline: async () => undefined,
  }),
  useOnScreenAskIds: () => onScreen,
  useReportAskOnScreen: () => undefined,
}));
vi.mock('#lib/agent-host-placement.js', () => ({ externalAgentDisplayName: (id: string) => `Agent ${id}` }));

const { ChatQuestionQueue, waitingByUrgency } = await import('#components/chat/chat-question-queue.js');

const askOf = (id: string, header: string, deadlineSeconds: number | undefined): Ask => ({
  id,
  askedAt: new Date(askedAt).toISOString(),
  deadline: deadlineSeconds === undefined ? null : new Date(askedAt + deadlineSeconds * 1000).toISOString(),
  source: 'tau',
  questions: [
    {
      id: 'q',
      header,
      question: `${header}?`,
      options: [{ label: `${header} one` }, { label: `${header} two` }],
      ...(deadlineSeconds === undefined ? {} : { recommended: 0 }),
      allowsText: true,
    },
  ],
});
const answered = (choice: string): AskAnswers => ({
  questions: { q: { choice, at: new Date(askedAt).toISOString() } },
});

const settle = (): void => {
  act(() => {
    vi.advanceTimersByTime(400);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  asks = [];
  answers = {};
  onScreen = new Set();
  answer.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('waitingByUrgency', () => {
  it('puts a blocking form first, then the soonest recommendation', () => {
    const later = askOf('ask_later', 'Later', 200);
    const sooner = askOf('ask_sooner', 'Sooner', 30);
    const blocking = askOf('ask_blocking', 'Blocking', undefined);
    const done = askOf('ask_done', 'Done', 100);

    const order = waitingByUrgency(
      [later, sooner, blocking, done],
      Object.fromEntries([['ask_done', answered('Done one')]]),
      askedAt + 10_000,
    );

    expect(order.map((ask) => ask.id)).toEqual(['ask_blocking', 'ask_sooner', 'ask_later']);
  });
});

describe('ChatQuestionQueue', () => {
  it('stays hidden while every ask has its card on screen', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    onScreen = new Set(['ask_form']);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });

  it('waits for the transcript to mount before showing anything', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    render(<ChatQuestionQueue />);

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });

  it('opens by itself for a question waiting off screen and answers it in place', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    render(<ChatQuestionQueue />);
    settle();

    const trigger = screen.getByRole('button', { name: '1 question waiting · Form' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Questions' });
    fireEvent.click(within(list).getByRole('button', { name: /^B, Form two/u }));

    expect(answer).toHaveBeenCalledWith('ask_form', 'q', { choice: 'Form two' });
  });

  it('keeps answered questions behind Show answered while something waits', () => {
    asks = [askOf('ask_old', 'Old', 120), askOf('ask_new', 'New', 120)];
    answers = Object.fromEntries([['ask_old', answered('Old one')]]);
    render(<ChatQuestionQueue />);
    settle();

    const list = screen.getByRole('list', { name: 'Questions' });
    expect(within(list).queryByText('Old?')).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Show answered (1)' }));
    expect(within(list).getByText('Old?')).toBeVisible();
    fireEvent.click(within(list).getByRole('button', { name: 'Hide answered' }));
    expect(within(list).queryByText('Old?')).not.toBeInTheDocument();
  });

  it('lists answered questions directly when nothing waits, collapsed by default', () => {
    asks = [askOf('ask_old', 'Old', 120)];
    answers = Object.fromEntries([['ask_old', answered('Old one')]]);
    render(<ChatQuestionQueue />);
    settle();

    const trigger = screen.getByRole('button', { name: '1 question answered' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const list = screen.getByRole('list', { name: 'Questions' });
    expect(within(list).getByText('Old?')).toBeVisible();
    expect(within(list).queryByRole('button', { name: /Show answered/u })).not.toBeInTheDocument();
  });

  it('closes again once the question it opened for is answered', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    const { rerender } = render(<ChatQuestionQueue />);
    settle();
    expect(screen.getByRole('button', { name: '1 question waiting · Form' })).toHaveAttribute('aria-expanded', 'true');

    answers = Object.fromEntries([['ask_form', answered('Form two')]]);
    rerender(<ChatQuestionQueue />);

    expect(screen.getByRole('button', { name: '1 question answered' })).toHaveAttribute('aria-expanded', 'false');
  });
});
