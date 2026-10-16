import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  answersPath,
  askStatus,
  parseAnswersFile,
  parseQuestionsFile,
  questionsPath,
  legacyQuestionsPath,
  legacyAnswersPath,
  serializeAnswersFile,
  questionValueText,
  isQuestionAnswerValid,
} from '@taucad/chat';
import type { AnswersFile, Ask, AskAnswers, QuestionReply } from '@taucad/chat';
import { useFileContent } from '#hooks/use-file-content.js';
import { useFileManager } from '#hooks/use-file-manager.js';

/** The chat's questions and the person's answers, live from `.tau/chats/<chatId>/`. @public */
export type ChatQuestions = {
  /** Every recorded ask, oldest first. */
  readonly asks: readonly Ask[];
  readonly answers: Readonly<Record<string, AskAnswers>>;
  /** Epoch milliseconds, ticking once a second while an ask counts down. */
  readonly now: number;
  readonly recordFailure?: string | undefined;
  readonly answer: (askId: string, questionId: string, reply: QuestionReply) => Promise<void>;
  readonly hold: (askId: string) => Promise<void>;
  readonly decline: (askId: string) => Promise<void>;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/* Serialize local submissions before the shared Web Lock coordinates windows. */
const answerWrites = new Map<string, Promise<unknown>>();

const textOf = (content: ReturnType<typeof useFileContent>): string | undefined =>
  content.kind === 'text' ? decoder.decode(content.content) : undefined;

/* A migrated copy must not hide a later settlement written by its legacy owner. */
const mergeQuestionHistory = (legacy: readonly Ask[], current: readonly Ask[]): Ask[] => {
  const merged = new Map(legacy.map((ask) => [ask.id, ask]));
  for (const ask of current) {
    const previous = merged.get(ask.id);
    if (
      ask.answerVersion === 2 ||
      previous === undefined ||
      Date.parse(ask.resolution?.at ?? ask.askedAt) >= Date.parse(previous.resolution?.at ?? previous.askedAt)
    ) {
      merged.set(ask.id, ask);
    }
  }
  return [...merged.values()].sort((left, right) => left.askedAt.localeCompare(right.askedAt));
};

/* Legacy answer copies reconcile per question; native v2 asks never adopt v1 answers. */
const mergeAnswerHistory = (
  legacy: AnswersFile['answers'],
  current: AnswersFile['answers'],
  asks: readonly Ask[],
): AnswersFile['answers'] => {
  const owners = new Map(asks.map((ask) => [ask.id, ask.answerVersion]));
  const merged: AnswersFile['answers'] = { ...current };
  for (const [askId, previous] of Object.entries(legacy)) {
    if (owners.get(askId) === 2) {
      continue;
    }
    const latest = current[askId];
    if (latest === undefined) {
      merged[askId] = previous;
      continue;
    }
    const questions = { ...previous.questions, ...latest.questions };
    for (const [questionId, answer] of Object.entries(previous.questions)) {
      const currentAnswer = latest.questions[questionId];
      if (currentAnswer === undefined || Date.parse(answer.at) > Date.parse(currentAnswer.at)) {
        questions[questionId] = answer;
      }
    }
    merged[askId] = { ...previous, ...latest, questions };
  }
  return merged;
};

/** Resolve a known ask whose host can consume this version, or a settled historical ask. */
const editableAsk = (asks: readonly Ask[], askId: string): Ask => {
  const ask = asks.find((candidate) => candidate.id === askId);
  if (ask === undefined) {
    throw new Error('This question is no longer available.');
  }
  if (ask.answerVersion !== 2 && ask.resolution === undefined) {
    throw new Error('This question needs an updated host. Resume the chat to request it again.');
  }
  return ask;
};

/**
 * The message a late answer travels as, once the agent already moved on.
 *
 * @param ask - The ask answered.
 * @param questionId - The question.
 * @param reply - The person's answer.
 * @returns Plain text the agent reads as the person's message.
 */
const lateAnswerMessage = (ask: Ask, questionId: string, reply: QuestionReply): string => {
  const question = ask.questions.find((candidate) => candidate.id === questionId);
  const answer =
    'choice' in reply
      ? reply.choice
      : 'text' in reply
        ? reply.text
        : 'value' in reply
          ? questionValueText(reply.value)
          : 'Skipped';
  const assumed = question?.recommended === undefined ? undefined : question.options[question.recommended]?.label;
  return [
    `Answer to your earlier question "${question?.question ?? questionId}": ${answer}.`,
    assumed === undefined || assumed === answer
      ? ''
      : ` You went ahead with "${assumed}"; adjust if this changes the work.`,
  ].join('');
};

/**
 * Read the chat's question record and answer it.
 *
 * The host writes `questions.v2.yaml`; UI clients coordinate writes to
 * `answers.v2.yaml` (agent questions blueprint D3). An answer to an ask the agent
 * already moved past is also delivered as a message (D5).
 *
 * @param chatId - The chat.
 * @param deliver - Sends a late answer to the agent.
 * @returns The record and the person's actions on it.
 * @public
 */
export function useChatQuestions(chatId: string, deliver: (text: string) => Promise<void>): ChatQuestions {
  const { readFile, writeFile, exists } = useFileManager();
  const questionsContent = useFileContent(questionsPath(chatId));
  const answersContent = useFileContent(answersPath(chatId));
  const legacyQuestionsContent = useFileContent(legacyQuestionsPath(chatId));
  const legacyAnswersContent = useFileContent(legacyAnswersPath(chatId));
  const records = useMemo<Pick<ChatQuestions, 'asks' | 'answers' | 'recordFailure'>>(() => {
    try {
      const legacyAsks = parseQuestionsFile(textOf(legacyQuestionsContent)).asks;
      const currentAsks = parseQuestionsFile(textOf(questionsContent)).asks;
      const mergedAsks = mergeQuestionHistory(legacyAsks, currentAsks);
      return {
        asks: mergedAsks,
        answers: mergeAnswerHistory(
          parseAnswersFile(textOf(legacyAnswersContent)).answers,
          parseAnswersFile(textOf(answersContent)).answers,
          mergedAsks,
        ),
        recordFailure: undefined,
      };
    } catch {
      return {
        asks: [],
        answers: {},
        recordFailure: 'Questions could not be read. Update Tau or restore the question record.',
      };
    }
  }, [questionsContent, legacyQuestionsContent, answersContent, legacyAnswersContent]);
  const { asks, answers, recordFailure } = records;
  const [now, setNow] = useState(() => Date.now());
  const isCounting = asks.some((ask) => {
    const status = askStatus(ask, answers[ask.id], now);
    return status.kind === 'open' && status.remaining !== undefined;
  });

  useEffect(() => {
    if (!isCounting) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [isCounting]);

  const mutate = useCallback(
    async (change: (file: AnswersFile) => AnswersFile): Promise<void> => {
      const path = answersPath(chatId);
      const previous = answerWrites.get(path);
      const queued = (async (): Promise<void> => {
        try {
          await previous;
        } catch {
          /* The previous write reported its own failure. */
        }
        const write = async (): Promise<void> => {
          const legacyPath = legacyAnswersPath(chatId);
          const legacy = parseAnswersFile(
            (await exists(legacyPath)) ? decoder.decode(await readFile(legacyPath)) : undefined,
          );
          const current = parseAnswersFile((await exists(path)) ? decoder.decode(await readFile(path)) : undefined);
          const file: AnswersFile = { version: 2, answers: mergeAnswerHistory(legacy.answers, current.answers, asks) };
          await writeFile(path, encoder.encode(serializeAnswersFile(change(file))), { source: 'user' });
        };
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- Older webviews may lack Web Locks despite the DOM declaration.
        if (navigator.locks === undefined) {
          throw new Error(
            'This browser cannot safely coordinate question answers across windows. Use a current browser.',
          );
        }
        await navigator.locks.request(`tau-question-answers:${path}`, write);
      })();
      answerWrites.set(path, queued);
      await queued;
    },
    [chatId, readFile, writeFile, exists, asks],
  );

  const answer = useCallback(
    async (askId: string, questionId: string, reply: QuestionReply): Promise<void> => {
      const ask = editableAsk(asks, askId);
      const at = new Date().toISOString();
      const question = ask.questions.find((candidate) => candidate.id === questionId);
      if (question === undefined || !isQuestionAnswerValid(question, { ...reply, at })) {
        throw new Error('The answer does not match the current question.');
      }
      await mutate((file) => {
        const current = file.answers[askId] ?? { questions: {} };
        return {
          ...file,
          answers: {
            ...file.answers,
            // Answering one question means the person is here: the rest wait for them too.
            [askId]: {
              ...current,
              heldAt: current.heldAt ?? at,
              questions: { ...current.questions, [questionId]: { ...reply, at } },
            },
          },
        };
      });
      const status = askStatus(ask, answers[askId], Date.now());
      if (status.kind === 'defaulted' || status.kind === 'cancelled') {
        await deliver(lateAnswerMessage(ask, questionId, reply));
      }
    },
    [answers, asks, deliver, mutate],
  );

  const hold = useCallback(
    async (askId: string): Promise<void> => {
      editableAsk(asks, askId);
      if (answers[askId]?.heldAt !== undefined) {
        return;
      }
      const at = new Date().toISOString();
      await mutate((file) => ({
        ...file,
        answers: { ...file.answers, [askId]: { ...(file.answers[askId] ?? { questions: {} }), heldAt: at } },
      }));
    },
    [answers, asks, mutate],
  );

  const decline = useCallback(
    async (askId: string): Promise<void> => {
      editableAsk(asks, askId);
      await mutate((file) => ({
        ...file,
        answers: { ...file.answers, [askId]: { ...(file.answers[askId] ?? { questions: {} }), declined: true } },
      }));
    },
    [asks, mutate],
  );

  return { asks, answers, now, answer, hold, decline, recordFailure };
}
