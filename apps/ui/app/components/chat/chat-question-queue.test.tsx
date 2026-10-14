// @vitest-environment jsdom
import { createRef } from 'react';
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

  it('opens by itself for a question waiting off screen and answers it in place', async () => {
    asks = [askOf('ask_form', 'Form', 120)];
    render(<ChatQuestionQueue />);
    settle();

    const trigger = screen.getByRole('button', { name: '1 question waiting · Form' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Questions' });
    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: /^B, Form two/u }));
    });

    expect(answer).toHaveBeenCalledWith('ask_form', 'q', { choice: 'Form two' });
  });

  it('should keep an unsuccessful answer available for retry', async () => {
    asks = [askOf('ask_retry', 'Form', 120)];
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answer.mockRejectedValueOnce(new Error('write failed'));
    try {
      render(<ChatQuestionQueue />);
      settle();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^B, Form two/u }));
      });
      expect(screen.getByRole('alert')).toMatchTextContent('Your response was not saved. Try again.');
      expect(screen.getByRole('button', { name: /^B, Form two/u })).not.toBeDisabled();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^B, Form two/u }));
      });
      expect(answer).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      log.mockRestore();
    }
  });

  it('should omit answered asks while another question waits', () => {
    asks = [askOf('ask_old', 'Old', 120), askOf('ask_new', 'New', 120)];
    answers = Object.fromEntries([['ask_old', answered('Old one')]]);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.getByRole('button', { name: '1 question waiting · New' })).toBeVisible();
    expect(screen.queryByText('Old?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show answered/u })).not.toBeInTheDocument();
  });

  it('should hide the tray when every ask is answered', () => {
    asks = [askOf('ask_old', 'Old', 120)];
    answers = Object.fromEntries([['ask_old', answered('Old one')]]);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });

  it('should count individual unanswered questions across asks', () => {
    const form = askOf('ask_form', 'Scope', 120);
    const kinematics = askOf('unused', 'Kinematics', 120).questions.map((question) => ({
      ...question,
      id: 'kinematics',
    }));
    asks = [{ ...form, questions: [...form.questions, ...kinematics] }, askOf('ask_other', 'Material', 120)];
    const { rerender } = render(<ChatQuestionQueue />);
    settle();

    expect(screen.getByRole('button', { name: '3 questions waiting · Scope' })).toBeVisible();
    answers = Object.fromEntries([['ask_form', answered('Scope one')]]);
    rerender(<ChatQuestionQueue />);

    expect(screen.getByRole('button', { name: '2 questions waiting · Kinematics' })).toBeVisible();
    expect(screen.queryByText('Scope one')).not.toBeInTheDocument();
    expect(screen.getByText('Kinematics?')).toBeVisible();
  });

  it('should stay hidden when only settled asks are off screen', () => {
    asks = [askOf('ask_old', 'Old', 120), askOf('ask_new', 'New', 120)];
    answers = Object.fromEntries([['ask_old', answered('Old one')]]);
    onScreen = new Set(['ask_new']);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });

  it('should count and render only asks whose transcript cards are off screen', () => {
    asks = [askOf('ask_visible', 'Visible', 120), askOf('ask_hidden', 'Hidden', 120)];
    onScreen = new Set(['ask_visible']);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.getByRole('button', { name: '1 question waiting · Hidden' })).toBeVisible();
    expect(screen.getByText('Hidden?')).toBeVisible();
    expect(screen.queryByText('Visible?')).not.toBeInTheDocument();
  });

  it('should hide settled asks that were defaulted, declined or cancelled', () => {
    asks = [
      askOf('ask_defaulted', 'Defaulted', 0),
      askOf('ask_declined', 'Declined', undefined),
      {
        ...askOf('ask_cancelled', 'Cancelled', undefined),
        resolution: { outcome: 'cancelled', at: new Date(askedAt).toISOString() },
      },
    ];
    answers = Object.fromEntries([['ask_declined', { questions: {}, declined: true }]]);
    render(<ChatQuestionQueue />);
    settle();

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });

  it('should return focus when an answered tray disappears', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    const composerRef = createRef<HTMLTextAreaElement>();
    const focusComposer = (): void => {
      composerRef.current?.focus();
    };
    const view = (
      <>
        <ChatQuestionQueue onDismissFocus={focusComposer} />
        <textarea ref={composerRef} aria-label='Composer' />
      </>
    );
    const { rerender } = render(view);
    settle();
    screen.getByRole('button', { name: /^B, Form two/u }).focus();

    answers = Object.fromEntries([['ask_form', answered('Form two')]]);
    rerender(
      <>
        <ChatQuestionQueue onDismissFocus={focusComposer} />
        <textarea ref={composerRef} aria-label='Composer' />
      </>,
    );

    expect(screen.getByRole('textbox', { name: 'Composer' })).toHaveFocus();
  });

  it('should disappear once the last waiting question is answered', () => {
    asks = [askOf('ask_form', 'Form', 120)];
    const { rerender } = render(<ChatQuestionQueue />);
    settle();
    expect(screen.getByRole('button', { name: '1 question waiting · Form' })).toHaveAttribute('aria-expanded', 'true');

    answers = Object.fromEntries([['ask_form', answered('Form two')]]);
    rerender(<ChatQuestionQueue />);

    expect(screen.queryByRole('button', { name: /question/u })).not.toBeInTheDocument();
  });
});
