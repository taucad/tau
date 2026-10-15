/** Grok's native question extension, projected into the shared question record. */
import { z } from 'zod';
import { askedOptionSchema, resolveAnswers } from '@taucad/chat/schemas/questions';
import type { Ask, AskAnswers } from '@taucad/chat';

/** Validate xAI's extension at the connection boundary. @internal */
export const grokQuestionSchema = z.object({
  sessionId: z.string().min(1),
  toolCallId: z.string().min(1).max(256),
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(2000),
        options: z.array(askedOptionSchema).max(12).default([]),
        multiSelect: z.boolean().nullish(),
      }),
    )
    .min(1)
    .max(12)
    .refine((questions) => new Set(questions.map((question) => question.question)).size === questions.length),
});

/** The validated native request. @internal */
export type GrokQuestionRequest = z.infer<typeof grokQuestionSchema>;
/** Grok accepts answer arrays keyed by the original question text. @internal */
export type GrokQuestionResponse =
  | { outcome: 'cancelled' }
  | { outcome: 'accepted'; answers: Record<string, string[]> };

/**
 * Preserve native questions without adopting answers on the person's behalf.
 * @param request - Validated native request.
 * @param context - Record identity and clock.
 * @returns The shared question record.
 * @internal
 */
export const askOfGrok = (request: GrokQuestionRequest, context: { askId: string; now: number }): Ask => ({
  id: context.askId,
  callId: request.toolCallId,
  askedAt: new Date(context.now).toISOString(),
  deadline: null,
  source: 'acp',
  agentId: 'grok',
  questions: request.questions.map((question, index) => ({
    id: `question_${String(index)}`,
    question: question.question,
    options: question.options,
    allowsText: true,
    ...(question.multiSelect === true ? { isList: true } : {}),
  })),
});

/**
 * Return choices or own words using Grok's native response envelope.
 * @param ask - The recorded questions.
 * @param answers - The person's answer, or cancellation.
 * @returns The native reply.
 * @internal
 */
export const grokQuestionResponseOf = (ask: Ask, answers: AskAnswers | undefined): GrokQuestionResponse => {
  if (answers?.declined) {
    return { outcome: 'cancelled' };
  }
  const resolved = resolveAnswers(ask, answers);
  if (resolved.length === 0) {
    return { outcome: 'cancelled' };
  }
  return {
    outcome: 'accepted',
    answers: Object.fromEntries(
      resolved.flatMap((answer) => {
        const question = ask.questions.find((candidate) => candidate.id === answer.id);
        return question === undefined ? [] : [[question.question, [answer.answer]]];
      }),
    ),
  };
};
