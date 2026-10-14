// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { captureDictation, DictationCapture } from '#components/dictation/dictation-capture.js';
import type { transcribeDictation } from '#components/dictation/dictation-client.js';
import type { Ask, AskAnswers } from '@taucad/chat';
import { QuestionCard } from '#components/chat/question-card.js';
import type { QuestionCardProperties } from '#components/chat/question-card.js';

const dictationDependencies = vi.hoisted(() => ({
  status: vi.fn(),
  capture: vi.fn<typeof captureDictation>(),
  transcribe: vi.fn<typeof transcribeDictation>(),
}));
vi.mock('#components/dictation/dictation-capture.js', () => ({ captureDictation: dictationDependencies.capture }));
vi.mock('#components/dictation/dictation-client.js', () => ({
  fetchDictationStatus: dictationDependencies.status,
  transcribeDictation: dictationDependencies.transcribe,
}));
let capture: DictationCapture;
beforeEach(() => {
  vi.clearAllMocks();
  dictationDependencies.status.mockResolvedValue({ available: false });
  capture = { finish: vi.fn().mockResolvedValue(new Blob([])), cancel: vi.fn() };
  dictationDependencies.capture.mockResolvedValue(capture);
  dictationDependencies.transcribe.mockResolvedValue('Use rounded corners.');
});

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
  render(
    <TooltipProvider>
      <QuestionCard {...properties} />
    </TooltipProvider>,
  );
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

describe('question dictation', () => {
  const openReply = async () => {
    dictationDependencies.status.mockResolvedValue({ available: true });
    const properties = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^C, Something else/u }));
    await screen.findByRole('button', { name: 'Dictate' });
    return { user, ...properties };
  };

  it('should append final speech to the current draft and send only after review', async () => {
    const { user, onAnswer, onHold } = await openReply();
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    await user.type(box, 'A seashell.');
    vi.mocked(onHold).mockClear();
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    expect(onHold).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Stop dictation' }));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('A seashell. Use rounded corners.');
    });
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
    expect(onAnswer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('form', { text: 'A seashell. Use rounded corners.' });
  });

  it.each(['', 'A seashell. '])('should finish dictation and send once with draft %j', async (draft) => {
    const response = Promise.withResolvers<string>();
    const { user, onAnswer } = await openReply();
    dictationDependencies.transcribe.mockReturnValue(response.promise);
    if (draft !== '') {
      await user.type(screen.getByRole('textbox', { name: 'Your answer' }), draft);
    }
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    expect(screen.getByRole('button', { name: 'Stop dictation' })).toBeEnabled();
    await user.dblClick(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByRole('status', { name: 'Transcribing' });
    expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'true');
    expect(onAnswer).not.toHaveBeenCalled();
    await act(async () => {
      response.resolve('Use rounded corners.');
    });
    expect(capture.finish).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('form', { text: `${draft}Use rounded corners.` });
  });

  it.each(['empty', 'error'])('should preserve the draft without sending on %s transcription', async (result) => {
    const response = Promise.withResolvers<string>();
    const { user, onAnswer } = await openReply();
    dictationDependencies.transcribe.mockReturnValue(response.promise);
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Keep this.');
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByRole('status', { name: 'Transcribing' });
    await act(async () => {
      if (result === 'empty') {
        response.resolve('  ');
      } else {
        response.reject(new Error('Transcription failed.'));
      }
    });
    expect(screen.getByRole('alert', { name: 'Dictation error' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Keep this.');
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('should cancel pending speech on Escape while preserving typed text', async () => {
    const response = Promise.withResolvers<string>();
    const { user, onAnswer } = await openReply();
    dictationDependencies.transcribe.mockReturnValue(response.promise);
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    await user.type(box, 'Keep this.');
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByRole('status', { name: 'Transcribing' });
    await user.keyboard('{Escape}');
    await act(async () => {
      response.resolve('Discard this.');
    });
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Keep this.');
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
    expect(capture.cancel).toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dictate' })).toBeVisible();
  });

  it('should discard pending transcription when the question is removed', async () => {
    const response = Promise.withResolvers<string>();
    const { user, onAnswer } = await openReply();
    dictationDependencies.transcribe.mockReturnValue(response.promise);
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByRole('status', { name: 'Transcribing' });
    cleanup();
    await act(async () => {
      response.resolve('Too late.');
    });
    expect(dictationDependencies.transcribe.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('should expose microphone errors and leave the draft usable', async () => {
    const { user } = await openReply();
    dictationDependencies.capture.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    await user.type(box, 'Keep this.');
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    expect(await screen.findByRole('alert', { name: 'Dictation error' })).toHaveTextContent(
      'Microphone access was denied',
    );
    expect(box).toHaveValue('Keep this.');
    expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('should offer dictation on text-only questions without opening Something else', async () => {
    dictationDependencies.status.mockResolvedValue({ available: true });
    const properties = renderCard({
      ask: { ...formAsk, questions: [{ ...formAsk.questions[0]!, options: [], recommended: undefined }] },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Dictate' }));
    await user.click(screen.getByRole('button', { name: 'Stop dictation' }));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    await waitFor(() => {
      expect(box).toHaveValue('Use rounded corners.');
    });
    await user.keyboard('{Enter}');
    expect(properties.onAnswer).toHaveBeenCalledWith('form', { text: 'Use rounded corners.' });
  });
  it('should cancel speech when another ask reuses the same question id', async () => {
    dictationDependencies.status.mockResolvedValue({ available: true });
    const response = Promise.withResolvers<string>();
    dictationDependencies.transcribe.mockReturnValue(response.promise);
    const onAnswer = vi.fn();
    const properties: QuestionCardProperties = {
      ask: { ...formAsk, questions: [{ ...formAsk.questions[0]!, options: [], recommended: undefined }] },
      answers: undefined,
      now: askedAt,
      onAnswer,
      onHold: vi.fn(),
      onDecline: vi.fn(),
    };
    const view = render(
      <TooltipProvider>
        <QuestionCard {...properties} />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Dictate' }));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByRole('status', { name: 'Transcribing' });
    view.rerender(
      <TooltipProvider>
        <QuestionCard {...properties} ask={{ ...properties.ask, id: 'different_ask' }} />
      </TooltipProvider>,
    );
    await act(async () => {
      response.resolve('Answer for the old ask.');
    });
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('');
    expect(dictationDependencies.transcribe.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
