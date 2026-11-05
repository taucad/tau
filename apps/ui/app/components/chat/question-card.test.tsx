// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { captureDictation, DictationCapture } from '#components/dictation/dictation-capture.js';
import type { transcribeDictation } from '#components/dictation/dictation-client.js';
import type { Ask, AskAnswers } from '@taucad/chat';
import { toast } from 'sonner';
import { QuestionCard } from '#components/chat/question-card.js';
import { dictationMessages } from '#components/dictation/dictation-errors.js';
import type { QuestionCardProperties } from '#components/chat/question-card.js';

const dictationDependencies = vi.hoisted(() => ({
  status: vi.fn(),
  capture: vi.fn<typeof captureDictation>(),
  transcribe: vi.fn<typeof transcribeDictation>(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
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

const listAsk: Ask = {
  ...formAsk,
  id: 'ask_list',
  source: 'acp',
  agentId: 'grok',
  deadline: null,
  questions: [
    {
      id: 'checks',
      question: 'Which checks should gate the assembly?',
      options: [
        { label: 'Interference', value: 'interference' },
        { label: 'Clearance', value: 'clearance' },
        { label: 'Hole alignment', value: 'holes' },
      ],
      allowsText: true,
      isList: true,
      field: { type: 'array', required: true, minItems: 1, maxItems: 12 },
    },
  ],
};

const at = new Date(askedAt).toISOString();
const sendKey = { key: 'Enter', ctrlKey: true, metaKey: true };
const radio = (name: RegExp | string) => screen.getByRole('radio', { name });

describe('QuestionCard · open single choice', () => {
  it('shows the question in the header, a radio per option, the recommendation, Other and the countdown', () => {
    renderCard({ agentName: 'Codex' });

    const card = screen.getByRole('group', { name: 'Which form should the desk ornament take?' });
    expect(card).toHaveAttribute('data-ask-state', 'open');
    expect(screen.getByText('Codex asks · Form')).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Choose one' })).toBeVisible();
    expect(radio('Twisted ribbon, recommended. Prints without supports.')).not.toBeChecked();
    expect(radio('Faceted gem. Crisp at 0.2 mm layers.')).not.toBeChecked();
    expect(screen.getByText('Recommended')).toBeVisible();
    expect(radio('Other: answer in your own words')).toBeVisible();
    expect(screen.getByText('Recommended in 1:55')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Questions' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('recommended option is used in about 2 minutes');
  });

  it('only selects on choice, holds the wait once, and submits with the button', async () => {
    const user = userEvent.setup();
    const { onAnswer, onHold } = renderCard();
    const submit = screen.getByRole('button', { name: 'Submit' });

    expect(submit).toBeDisabled();
    await user.click(screen.getByText('Faceted gem'));
    expect(radio(/^Faceted gem/u)).toBeChecked();
    expect(onAnswer).not.toHaveBeenCalled();
    await user.click(radio(/^Twisted ribbon/u));
    expect(radio(/^Faceted gem/u)).not.toBeChecked();
    expect(onHold).toHaveBeenCalledOnce();
    await user.click(submit);

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('form', { choice: 'Twisted ribbon' });
  });

  it('submits with the platform send shortcut and moves between options with arrow keys', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    await user.click(radio(/^Twisted ribbon/u));
    await user.keyboard('{ArrowDown}');
    expect(radio(/^Faceted gem/u)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-keyshortcuts');
    fireEvent.keyDown(radio(/^Faceted gem/u), sendKey);

    expect(onAnswer).toHaveBeenCalledWith('form', { choice: 'Faceted gem' });
  });

  it('ignores the send shortcut while nothing is chosen', () => {
    const { onAnswer } = renderCard();

    fireEvent.keyDown(radio(/^Twisted ribbon/u), sendKey);

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('opens the own-words box from Other and never sends it empty', async () => {
    const user = userEvent.setup();
    const { onAnswer, onHold } = renderCard();

    await user.click(radio(/^Other/u));
    const box = screen.getByRole('textbox', { name: 'Your answer' });
    expect(box).toHaveFocus();
    expect(onHold).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.type(box, '   ');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.clear(box);
    await user.type(box, 'A spiral seashell');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('form', { text: 'A spiral seashell' });
  });

  it('sends own words on Enter from the box', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    await user.click(radio(/^Other/u));
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'A spiral seashell{Enter}');

    expect(onAnswer).toHaveBeenCalledWith('form', { text: 'A spiral seashell' });
  });

  it('closes the own-words box on Escape without answering', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    await user.click(radio(/^Other/u));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
    expect(radio(/^Other/u)).not.toBeChecked();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('switches from own words back to an option', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard();

    await user.click(radio(/^Other/u));
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Draft');
    await user.click(radio(/^Faceted gem/u));
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAnswer).toHaveBeenCalledWith('form', { choice: 'Faceted gem' });
  });

  it('shows progress on Submit and locks the options while the answer is written', () => {
    const view = renderCard();
    fireEvent.click(radio(/^Faceted gem/u));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    view.onAnswer = vi.fn();
    cleanup();
    render(
      <TooltipProvider>
        <QuestionCard
          ask={formAsk}
          answers={undefined}
          now={askedAt + 5000}
          isPending
          onAnswer={vi.fn()}
          onHold={vi.fn()}
          onDecline={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    for (const option of screen.getAllByRole('radio')) {
      expect(option).toBeDisabled();
    }
  });

  it('counts down against the extended deadline once held', () => {
    renderCard({ answers: { heldAt: new Date(askedAt + 1000).toISOString(), questions: {} } });

    expect(screen.getByText('Waiting for you · 3:55')).toBeVisible();
  });

  it('shows the ask message under a lone question', () => {
    renderCard({ ask: { ...formAsk, message: 'Pick before I export.' } });

    expect(screen.getByText('Pick before I export.')).toBeVisible();
  });

  it('sends the provider value for a typed single-choice field', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      questions: [
        {
          id: 'mode',
          question: 'Which mode?',
          options: [
            { label: 'Fast', value: 'fast' },
            { label: 'Careful', value: 'careful' },
          ],
          recommended: 1,
          allowsText: false,
          field: { type: 'string', required: true },
        },
      ],
    };
    const { onAnswer } = renderCard({ ask });

    expect(screen.queryByRole('radio', { name: /^Other/u })).not.toBeInTheDocument();
    await user.click(radio(/^Fast/u));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAnswer).toHaveBeenCalledWith('mode', { value: 'fast' });
  });

  it('offers Skip on an optional question and records the skip', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      deadline: null,
      questions: [
        {
          id: 'note',
          question: 'Add a finish?',
          options: [{ label: 'Matte', value: 'matte' }],
          allowsText: false,
          field: { type: 'string', required: false },
        },
      ],
    };
    const { onAnswer, onDecline } = renderCard({ ask });

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onAnswer).toHaveBeenCalledWith('note', { skipped: true });
    expect(onDecline).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('radio', { name: /^Other/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onDecline).toHaveBeenCalled();
  });

  it('keeps dedicated controls for typed fields that are not a choice', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      deadline: null,
      questions: [
        {
          id: 'height',
          question: 'Height in mm?',
          options: [],
          allowsText: false,
          field: { type: 'integer', required: true, minimum: 10 },
        },
      ],
    };
    const { onAnswer } = renderCard({ ask });

    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('spinbutton', { name: 'Your answer' }), '40');
    await user.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(onAnswer).toHaveBeenCalledWith('height', { value: 40 });
  });
});

describe('QuestionCard · open multi choice', () => {
  it('shows a checkbox per option and sends every ticked value in option order', async () => {
    const user = userEvent.setup();
    const { onAnswer, onHold } = renderCard({ ask: listAsk, agentName: 'Grok' });

    expect(screen.getByRole('group', { name: 'Choose any' })).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Hole alignment' }));
    await user.click(screen.getByRole('checkbox', { name: 'Interference' }));
    await user.click(screen.getByRole('checkbox', { name: 'Clearance' }));
    await user.click(screen.getByRole('checkbox', { name: 'Clearance' }));
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    expect(onHold).toHaveBeenCalledOnce();
    expect(onAnswer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onAnswer).toHaveBeenCalledExactlyOnceWith('checks', { value: ['interference', 'holes'] });
  });

  it('respects the minimum number of picks', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...listAsk,
      questions: [
        { ...listAsk.questions[0]!, allowsText: false, field: { type: 'array', required: true, minItems: 2 } },
      ],
    };
    renderCard({ ask });

    await user.click(screen.getByRole('checkbox', { name: 'Interference' }));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Clearance' }));
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });

  it('treats Other as its own answer: ticking it clears the boxes, and a box clears it', async () => {
    const user = userEvent.setup();
    const { onAnswer } = renderCard({ ask: listAsk });

    await user.click(screen.getByRole('checkbox', { name: 'Interference' }));
    await user.click(screen.getByRole('checkbox', { name: /^Other/u }));
    expect(screen.getByRole('checkbox', { name: 'Interference' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Strap slot clears the props');
    fireEvent.keyDown(screen.getByRole('checkbox', { name: /^Other/u }), sendKey);
    expect(onAnswer).toHaveBeenCalledWith('checks', { text: 'Strap slot clears the props' });

    await user.click(screen.getByRole('checkbox', { name: /^Other/u }));
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
  });
});

describe('QuestionCard · several questions', () => {
  it('pages one question at a time: Next until the last, then Submit', () => {
    renderCard({ ask: twoQuestions });

    expect(screen.getByRole('navigation', { name: 'Questions' })).toHaveTextContent('1 of 2');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous question' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled();
  });

  it('moves to the next unanswered question once the record has the answer, with focus on its options', async () => {
    const user = userEvent.setup();
    const properties: QuestionCardProperties = {
      ask: twoQuestions,
      answers: undefined,
      now: askedAt + 5000,
      onAnswer: vi.fn(),
      onHold: vi.fn(),
      onDecline: vi.fn(),
    };
    const view = render(
      <TooltipProvider>
        <QuestionCard {...properties} />
      </TooltipProvider>,
    );
    await user.click(radio(/^Faceted gem/u));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(properties.onAnswer).toHaveBeenCalledWith('form', { choice: 'Faceted gem' });
    view.rerender(
      <TooltipProvider>
        <QuestionCard {...properties} answers={{ questions: { form: { choice: 'Faceted gem', at } } }} />
      </TooltipProvider>,
    );

    expect(screen.getByText('How tall should it be?')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Questions' })).toHaveTextContent('2 of 2');
    expect(screen.getByText('Question · Size')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(radio(/^80 mm/u)).toHaveFocus();
  });

  it('goes back to an answered question with its answer chosen, and forward again', async () => {
    const user = userEvent.setup();
    renderCard({ ask: twoQuestions, answers: { questions: { form: { choice: 'Faceted gem', at } } } });

    await user.click(screen.getByRole('button', { name: 'Previous question' }));
    expect(screen.getByText('Which form should the desk ornament take?')).toBeVisible();
    expect(radio(/^Faceted gem/u)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next question' }));

    expect(screen.getByText('How tall should it be?')).toBeVisible();
  });

  it('restores own words when revisiting an answer given in text', async () => {
    const user = userEvent.setup();
    renderCard({ ask: twoQuestions, answers: { questions: { form: { text: 'A seashell', at } } } });

    await user.click(screen.getByRole('button', { name: 'Previous question' }));

    expect(radio(/^Other/u)).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('A seashell');
  });
});

describe('QuestionCard · settled', () => {
  it('lists each question with the answer beneath it', () => {
    const answers: AskAnswers = { questions: { form: { text: 'A spiral seashell', at } } };
    renderCard({ answers, agentName: 'Codex' });

    const card = screen.getByRole('group', { name: 'You answered Codex' });
    expect(card).toHaveAttribute('data-ask-state', 'settled');
    expect(screen.getByRole('term')).toHaveTextContent('Which form should the desk ornament take?');
    expect(screen.getByRole('definition')).toHaveTextContent('A spiral seashell');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('summarises several questions, including a list answer', () => {
    const ask: Ask = {
      ...listAsk,
      questions: [...listAsk.questions, { ...twoQuestions.questions[1]!, field: undefined }],
    };
    const answers: AskAnswers = {
      questions: { checks: { value: ['interference', 'holes'], at }, size: { choice: '120 mm', at } },
    };
    renderCard({ ask, answers });

    const definitions = screen.getAllByRole('definition');
    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toHaveTextContent(/interference.*holes/u);
    expect(definitions[1]).toHaveTextContent('120 mm');
  });

  it('marks the recommendation used after no reply and offers an answer that arrives as a message', async () => {
    const user = userEvent.setup();
    const ask: Ask = {
      ...formAsk,
      resolution: { at: new Date(askedAt + 120_000).toISOString(), outcome: 'defaulted' },
    };
    const { onAnswer } = renderCard({ ask, now: askedAt + 130_000 });

    expect(screen.getByRole('group', { name: 'Recommendation used' })).toBeVisible();
    expect(screen.getByRole('definition')).toHaveTextContent('Twisted ribbon · recommended, no reply in time');
    await user.click(screen.getByRole('button', { name: 'Answer anyway' }));

    expect(screen.getByText('The work already went ahead; your answer arrives as a message.')).toBeVisible();
    expect(screen.queryByText(/Recommended in/u)).not.toBeInTheDocument();
    expect(radio(/^Twisted ribbon/u)).toHaveFocus();
    await user.click(radio(/^Faceted gem/u));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
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

  it('records a declined form', () => {
    renderCard({ answers: { declined: true, questions: {} }, agentName: 'Claude' });

    expect(screen.getByRole('group', { name: 'You declined Claude' })).toBeVisible();
    expect(screen.getByRole('definition')).toHaveTextContent('Declined');
    expect(screen.queryByRole('button', { name: 'Answer anyway' })).not.toBeInTheDocument();
  });

  it('says when the agent stopped before an answer, and still offers one', () => {
    const ask: Ask = { ...formAsk, resolution: { at: new Date(askedAt + 1000).toISOString(), outcome: 'cancelled' } };
    renderCard({ ask, now: askedAt + 2000 });

    expect(screen.getByRole('group', { name: 'Stopped before an answer' })).toBeVisible();
    expect(screen.getByRole('definition')).toHaveTextContent('No answer');
    expect(screen.getByRole('button', { name: 'Answer anyway' })).toBeVisible();
  });

  it('shows an explicit skip as Skipped', () => {
    const ask: Ask = {
      ...formAsk,
      questions: [{ ...formAsk.questions[0]!, recommended: undefined, field: { type: 'string', required: false } }],
    };
    renderCard({ ask, answers: { questions: { form: { skipped: true, at } } } });

    expect(screen.getByRole('definition')).toHaveTextContent('Skipped');
  });

  it('takes focus when the last answer lands from inside the card', async () => {
    const user = userEvent.setup();
    const properties: QuestionCardProperties = {
      ask: formAsk,
      answers: undefined,
      now: askedAt + 5000,
      onAnswer: vi.fn(),
      onHold: vi.fn(),
      onDecline: vi.fn(),
    };
    const view = render(
      <TooltipProvider>
        <QuestionCard {...properties} />
      </TooltipProvider>,
    );
    await user.click(radio(/^Faceted gem/u));
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    view.rerender(
      <TooltipProvider>
        <QuestionCard {...properties} answers={{ questions: { form: { choice: 'Faceted gem', at } } }} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('group', { name: 'You answered' })).toHaveFocus();
  });
});

describe('question dictation', () => {
  const openReply = async () => {
    dictationDependencies.status.mockResolvedValue({ available: true });
    const properties = renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Other: answer in your own words' }));
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
    // The draft stays in view beside the expanded microphone and its cancel button.
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('A seashell.');
    expect(screen.getByRole('button', { name: 'Cancel dictation' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Microphone waveform' })).toBeInTheDocument();
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

  it('should keep keyboard focus on the dictation control as the microphone expands and folds back', async () => {
    const { user } = await openReply();
    screen.getByRole('button', { name: 'Dictate' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop dictation' })).toHaveFocus();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Use rounded corners.');
    });
    // The answer takes focus back for review once the transcript lands.
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Dictate' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel dictation' }));
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveFocus();
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
    // Empty speech ends quietly; a failure shows as a toast, never inside the answer.
    if (result === 'empty') {
      expect(toast.error).not.toHaveBeenCalled();
    } else {
      expect(toast.error).toHaveBeenCalledWith(dictationMessages.transcriptionFailed, { id: 'dictation-error' });
    }
    expect(screen.queryByRole('alert')).toBeNull();
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
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(dictationMessages.microphoneDenied, { id: 'dictation-error' });
    });
    expect(box).toHaveValue('Keep this.');
    expect(screen.getByRole('button', { name: 'Send answer' })).toHaveAttribute('aria-disabled', 'false');
  });

  it('should offer dictation on text-only questions without choosing Other', async () => {
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

const retryAsk = (isTyped: boolean): Ask => ({
  ...formAsk,
  deadline: null,
  questions: [
    {
      id: 'retry',
      question: 'Retry?',
      options: [{ label: 'Retry', value: 'retry' }],
      allowsText: false,
      ...(isTyped ? { field: { type: 'string', required: true } } : {}),
    },
  ],
});

it.each([false, true])('should clear declined action identity before a subsequent typed=%s answer', (isTyped) => {
  const props: QuestionCardProperties = {
    ask: retryAsk(isTyped),
    now: askedAt,
    answers: undefined,
    onAnswer: vi.fn(),
    onHold: vi.fn(),
    onDecline: vi.fn(),
  };
  const view = render(<QuestionCard {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  view.rerender(<QuestionCard {...props} isPending />);
  expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-busy', 'true');
  view.rerender(<QuestionCard {...props} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  expect(props.onAnswer).toHaveBeenCalledWith('retry', isTyped ? { value: 'retry' } : { choice: 'Retry' });
  view.rerender(<QuestionCard {...props} isPending />);
  expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-busy', 'true');
});

it.each([false, true])('should clear typed=%s answer progress when a later decline is pending', (isTyped) => {
  const props: QuestionCardProperties = {
    ask: retryAsk(isTyped),
    now: askedAt,
    answers: undefined,
    onAnswer: vi.fn(),
    onHold: vi.fn(),
    onDecline: vi.fn(),
  };
  const view = render(<QuestionCard {...props} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  view.rerender(<QuestionCard {...props} isPending />);
  expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-busy', 'true');
  view.rerender(<QuestionCard {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
  view.rerender(<QuestionCard {...props} isPending />);
  expect(screen.getByRole('button', { name: 'Decline' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-busy', 'false');
});
