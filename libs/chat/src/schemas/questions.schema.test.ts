import { describe, expect, it } from 'vitest';
import {
  askStatus,
  isQuestionAnswerValid,
  effectiveDeadline,
  parseAnswersFile,
  parseQuestionsFile,
  resolveAnswers,
  serializeAnswersFile,
  serializeQuestionsFile,
} from '#schemas/questions.schema.js';
import type { AnswersFile, Ask, AskedQuestion } from '#schemas/questions.schema.js';

const ask: Ask = {
  id: 'ask_1',
  askedAt: '2026-10-03T00:00:00.000Z',
  deadline: '2026-10-03T00:02:00.000Z',
  source: 'tau',
  questions: [
    {
      id: 'seeds',
      header: 'Seeds',
      question: 'Restore or drop?',
      options: [{ label: 'Paste rows' }, { label: 'Drop seeds' }],
      recommended: 0,
      allowsText: true,
    },
  ],
};
const t0 = Date.parse(ask.askedAt);
const at = ask.askedAt;

describe('questions record', () => {
  it('round-trips both files, reads missing text as empty, and refuses malformed records', () => {
    expect(parseQuestionsFile(serializeQuestionsFile({ version: 1, asks: [ask] })).asks).toEqual([ask]);
    const answers: AnswersFile = {
      version: 1,
      answers: { [ask.id]: { questions: { seeds: { text: 'Neither', at } } } },
    };
    expect(parseAnswersFile(serializeAnswersFile(answers))).toEqual({ ...answers, version: 2 });
    expect(parseQuestionsFile(undefined).asks).toEqual([]);
    expect(() => parseAnswersFile('version: 2')).toThrow('Invalid answers.yaml');
  });

  it('holds the deadline to the cap once the person starts answering', () => {
    expect(effectiveDeadline(ask, undefined)).toBe(t0 + 120_000);
    expect(effectiveDeadline(ask, { heldAt: at, questions: {} })).toBe(t0 + 240_000);
    expect(effectiveDeadline({ ...ask, deadline: null }, undefined)).toBeUndefined();
  });

  it('derives open, defaulted, answered, cancelled and declined', () => {
    expect(askStatus(ask, undefined, t0 + 1000)).toEqual({ kind: 'open', remaining: 119_000, held: false });
    expect(askStatus(ask, undefined, t0 + 120_000)).toEqual({ kind: 'defaulted' });
    expect(askStatus(ask, { questions: { seeds: { choice: 'Drop seeds', at } } }, t0 + 999_999)).toEqual({
      kind: 'answered',
    });
    expect(askStatus({ ...ask, resolution: { at, outcome: 'cancelled' } }, undefined, t0)).toEqual({
      kind: 'cancelled',
    });
    expect(askStatus(ask, { declined: true, questions: {} }, t0)).toEqual({ kind: 'declined' });
  });

  it('falls back to the recommended option and skips questions without a default', () => {
    expect(resolveAnswers(ask, undefined)).toEqual([{ id: 'seeds', answer: 'Paste rows', source: 'recommended' }]);
    const noDefault: Ask = { ...ask, questions: [{ ...ask.questions[0]!, recommended: undefined }] };
    expect(resolveAnswers(noDefault, undefined)).toEqual([]);
  });
});

describe('typed question records', () => {
  it('should preserve typed answers and write the new record version', () => {
    const input =
      'version: 2\nanswers:\n  ask_1:\n    questions:\n      seeds:\n        value: [red, blue]\n        at: "2026-10-03T00:00:00.000Z"\n';
    expect(parseAnswersFile(input).answers['ask_1']?.questions['seeds']).toEqual({ value: ['red', 'blue'], at });
    expect(serializeAnswersFile(parseAnswersFile(input))).toContain('version: 2');
  });

  it('should refuse an unsupported record version without replacing it with an empty record', () => {
    expect(() => parseAnswersFile('version: 99\nanswers: {}')).toThrow('Unsupported answers.yaml version');
    expect(() => parseQuestionsFile('version: 99\nasks: []')).toThrow('Unsupported questions.yaml version');
  });

  it('should not accept an unknown legacy choice as a completed answer', () => {
    const answers = { questions: { seeds: { choice: 'Injected choice', at } } };
    expect(askStatus(ask, answers, t0).kind).toBe('open');
    expect(resolveAnswers(ask, answers)).toEqual([]);
  });
});

it('should reject blank own words before they can corrupt the answer record', () => {
  const question = {
    ...ask.questions[0]!,
    field: { type: 'array', required: true },
  } satisfies AskedQuestion;
  expect(isQuestionAnswerValid(question, { text: '' })).toBe(false);
  expect(isQuestionAnswerValid(question, { text: '  ' })).toBe(false);
});

it('should preserve the exact recommended value when choice labels repeat', () => {
  const typed: Ask = {
    ...ask,
    questions: [
      {
        ...ask.questions[0]!,
        options: [
          { label: 'Same', value: 'first' },
          { label: 'Same', value: 'second' },
        ],
        recommended: 1,
        field: { type: 'string', required: true },
      },
    ],
  };
  expect(resolveAnswers(typed, undefined)).toEqual([
    { id: typed.questions[0]!.id, answer: 'Same', value: 'second', source: 'recommended' },
  ]);
});

it('should not adopt a recommended selection that violates required array bounds', () => {
  const typed: Ask = {
    ...ask,
    questions: [
      {
        ...ask.questions[0]!,
        options: [
          { label: 'One', value: 'one' },
          { label: 'Two', value: 'two' },
        ],
        recommended: 0,
        field: { type: 'array', required: true, minItems: 2 },
      },
    ],
  };
  expect(resolveAnswers(typed, undefined)).toEqual([]);
});
