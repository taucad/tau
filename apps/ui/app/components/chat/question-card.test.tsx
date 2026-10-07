// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Ask, AskAnswers } from '@taucad/chat';
import { QuestionCard } from '#components/chat/question-card.js';
import type { QuestionCardProperties } from '#components/chat/question-card.js';

const askedAt = Date.parse('2026-10-03T10:00:00.000Z');

const formAsk: Ask = {
  id: 'ask_form',
  callId: 'call_form',
  askedAt: new Date(askedAt).toISOString(),
  deadline: new Date(askedAt + 120_000).toISOString(),
  source: 'tau',
  questions: [
    {
      id: 'form',
      header: 'Form',
      question: 'Which form should the desk ornament take?',
      options: [
        { label: 'Twisted ribbon', description: 'Prints without supports.' },
        { label: 'Faceted gem', description: 'Crisp at 0.2 mm layers.' },
      ],
      recommended: 0,
      allowsText: true,
    },
  ],
};

const twoQuestions: Ask = {
  ...formAsk,
  id: 'ask_two',
  questions: [
    ...formAsk.questions,
    {
      id: 'size',
      header: 'Size',
      question: 'How tall should it be?',
      options: [{ label: '80 mm' }, { label: '120 mm' }],
      recommended: 0,
      allowsText: true,
    },
  ],
};

const renderCard = (overrides: Partial<QuestionCardProperties> = {}): QuestionCardProperties => {
  const properties: QuestionCardProperties = {
    ask: formAsk,
    answers: undefined,
    now: askedAt + 5000,
    onAnswer: vi.fn(),
    onHold: vi.fn(),
    onDecline: vi.fn(),
    ...overrides,
  };
  render(<QuestionCard {...properties} />);
  return properties;
};

afterEach(() => {
  cleanup();
});

describe('QuestionCard', () => {
  it('letters the options, marks the recommended one and adds an own-words row', () => {
    renderCard();

    expect(
      screen.getByRole('button', { name: 'A, Twisted ribbon, recommended. Prints without supports.' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'B, Faceted gem. Crisp at 0.2 mm layers.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'C, Something else: answer in your own words' })).toBeVisible();
    expect(screen.getByText('Recommended in 1:55')).toBeVisible();
  });

  it('answers with a letter key while focus is inside the card', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    screen.getByRole('button', { name: /^A, Twisted ribbon/u }).focus();
    await user.keyboard('b');

    expect(onAnswer).toHaveBeenCalledWith('form', { choice: 'Faceted gem' });
  });

  it('holds the wait when the person starts writing and sends their words on Enter', async () => {
    const user = userEvent.setup();
    const { onAnswer, onHold } = renderCard();

    await user.click(screen.getByRole('button', { name: /^C, Something else/u }));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    expect(box).toHaveFocus();
    expect(onHold).toHaveBeenCalled();
    await user.type(box, 'A spiral seashell{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('form', { text: 'A spiral seashell' });
  });

  it('closes the own-words box on Escape without answering', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    await user.click(screen.getByRole('button', { name: /^C, Something else/u }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('counts down against the extended deadline once held', () => {
    renderCard({ answers: { heldAt: new Date(askedAt + 1000).toISOString(), questions: {} } });

    expect(screen.getByText('Waiting for you · 3:55')).toBeVisible();
  });

  it('shows one question at a time with the answered ones above it', () => {
    const answers: AskAnswers = { questions: { form: { choice: 'Faceted gem', at: new Date(askedAt).toISOString() } } };
    renderCard({ ask: twoQuestions, answers });

    expect(screen.getByText('Question · Size · 2 of 2')).toBeVisible();
    expect(screen.getByText('How tall should it be?')).toBeVisible();
    expect(screen.getByText('Faceted gem')).toBeVisible();
  });

  it('settles into what the person answered', () => {
    const answers: AskAnswers = {
      questions: { form: { text: 'A spiral seashell', at: new Date(askedAt).toISOString() } },
    };
    renderCard({ answers, agentName: 'Codex' });

    expect(screen.getByRole('group', { name: 'You answered Codex' })).toBeVisible();
    expect(screen.getByText('A spiral seashell')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Something else/u })).not.toBeInTheDocument();
  });

  it('offers an answer after the recommendation was used, and says it arrives as a message', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      resolution: { at: new Date(askedAt + 120_000).toISOString(), outcome: 'defaulted' },
    };
    const { onAnswer } = renderCard({ ask, now: askedAt + 130_000 });

    expect(screen.getByRole('group', { name: 'Recommendation used' })).toBeVisible();
    expect(screen.getByText(/no reply in time/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Answer anyway' }));

    expect(screen.getByText('The work already went ahead; your answer arrives as a message.')).toBeVisible();
    expect(screen.getByRole('button', { name: /^A, Twisted ribbon/u })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /^B, Faceted gem/u }));
    expect(onAnswer).toHaveBeenCalledWith('form', { choice: 'Faceted gem' });
  });

  it('cancels a late answer back to the settled card', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      resolution: { at: new Date(askedAt + 120_000).toISOString(), outcome: 'defaulted' },
    };
    renderCard({ ask, now: askedAt + 130_000 });

    await user.click(screen.getByRole('button', { name: 'Answer anyway' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('group', { name: 'Recommendation used' })).toHaveFocus();
  });

  it('waits without a countdown and offers Decline when nothing is recommended', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      deadline: null,
      source: 'acp',
      agentId: 'claude',
      questions: [
        {
          id: 'retry',
          question: 'Retry with the fallback model?',
          options: [{ label: 'Retry' }, { label: 'Keep' }],
          allowsText: false,
        },
      ],
    };
    const { onDecline } = renderCard({ ask, agentName: 'Claude' });

    expect(screen.getByText('Waiting for you')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Something else/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalled();
  });
});
