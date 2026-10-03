import { describe, expect, it } from 'vitest';
import {
  askStatus,
  effectiveDeadline,
  parseAnswersFile,
  parseQuestionsFile,
  resolveAnswers,
  serializeAnswersFile,
  serializeQuestionsFile,
} from '#schemas/questions.schema.js';
import type { AnswersFile, Ask } from '#schemas/questions.schema.js';

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
  it('round-trips both files and reads missing or malformed text as empty', () => {
    expect(parseQuestionsFile(serializeQuestionsFile({ version: 1, asks: [ask] })).asks).toEqual([ask]);
    const answers: AnswersFile = {
      version: 1,
      answers: { [ask.id]: { questions: { seeds: { text: 'Neither', at } } } },
    };
    expect(parseAnswersFile(serializeAnswersFile(answers))).toEqual(answers);
    expect(parseQuestionsFile(undefined).asks).toEqual([]);
    expect(parseAnswersFile('version: 2').answers).toEqual({});
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
