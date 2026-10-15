import { describe, expect, it } from 'vitest';
import { askOfGrok, grokQuestionResponseOf, grokQuestionSchema } from '#acp/grok-questions.js';

const request = {
  sessionId: 's1',
  toolCallId: 'call-1',
  questions: [
    { question: 'Which material?', options: [{ label: 'PLA (Recommended)' }, { label: 'PETG' }], multiSelect: null },
  ],
};
const now = Date.parse('2026-10-14T00:00:00Z');
const at = new Date(now).toISOString();
const questionId = 'question_0';

describe('Grok native questions', () => {
  it('should preserve choices and own words with native array replies', () => {
    const ask = askOfGrok(grokQuestionSchema.parse(request), { askId: 'ask_1', now });
    expect(ask).toMatchObject({ callId: 'call-1', agentId: 'grok', source: 'acp', deadline: null });
    expect(grokQuestionResponseOf(ask, { questions: { [questionId]: { choice: 'PETG', at } } })).toEqual({
      outcome: 'accepted',
      answers: { 'Which material?': ['PETG'] },
    });
    expect(grokQuestionResponseOf(ask, { questions: { [questionId]: { text: 'Nylon instead', at } } })).toEqual({
      outcome: 'accepted',
      answers: { 'Which material?': ['Nylon instead'] },
    });
    expect(grokQuestionResponseOf(ask, undefined)).toEqual({ outcome: 'cancelled' });
    expect(grokQuestionResponseOf(ask, { declined: true, questions: {} })).toEqual({ outcome: 'cancelled' });
  });

  it('should refuse malformed, empty, and ambiguous question requests', () => {
    for (const invalid of [
      {},
      { ...request, sessionId: '' },
      { ...request, questions: [] },
      { ...request, questions: [...request.questions, ...request.questions] },
      { ...request, questions: [{ question: 'Bad', options: [{ label: 42 }] }] },
    ]) {
      expect(grokQuestionSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

it('should preserve every multi-select choice in Grok native response arrays', () => {
  const ask = askOfGrok(
    grokQuestionSchema.parse({
      ...request,
      questions: [{ question: 'Materials?', multiSelect: true, options: [{ label: 'PLA' }, { label: 'PETG' }] }],
    }),
    { askId: 'ask_multi', now },
  );
  expect(grokQuestionResponseOf(ask, { questions: { [questionId]: { value: ['PLA', 'PETG'], at } } })).toEqual({
    outcome: 'accepted',
    answers: { 'Materials?': ['PLA', 'PETG'] },
  });
});
