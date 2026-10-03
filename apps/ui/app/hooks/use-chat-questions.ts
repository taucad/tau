import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  answersPath,
  askStatus,
  parseAnswersFile,
  parseQuestionsFile,
  questionsPath,
  serializeAnswersFile,
} from '@taucad/chat';
import type { AnswersFile, Ask, AskAnswers } from '@taucad/chat';
import type { QuestionReply } from '#components/chat/question-card.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { useFileManager } from '#hooks/use-file-manager.js';

/** The chat's questions and the person's answers, live from `.tau/chats/<chatId>/`. @public */
export type ChatQuestions = {
  /** Every recorded ask, oldest first. */
  readonly asks: readonly Ask[];
  readonly answers: Readonly<Record<string, AskAnswers>>;
  /** Epoch milliseconds, ticking once a second while an ask counts down. */
  readonly now: number;
  readonly answer: (askId: string, questionId: string, reply: QuestionReply) => Promise<void>;
  readonly hold: (askId: string) => Promise<void>;
  readonly decline: (askId: string) => Promise<void>;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/* ponytail: one in-process queue per answers file; this tab is its only writer. */
const answerWrites = new Map<string, Promise<unknown>>();

const textOf = (content: ReturnType<typeof useFileContent>): string | undefined =>
  content.kind === 'text' ? decoder.decode(content.content) : undefined;

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
  const answer = 'choice' in reply ? reply.choice : reply.text;
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
 * The host writes `questions.yaml`; this client is the only writer of
 * `answers.yaml` (agent questions blueprint D3). An answer to an ask the agent
 * already moved past is also delivered as a message (D5).
 *
 * @param chatId - The chat.
 * @param deliver - Sends a late answer to the agent.
 * @returns The record and the person's actions on it.
 * @public
 */
export function useChatQuestions(chatId: string, deliver: (text: string) => Promise<void>): ChatQuestions {
  const { readFile, writeFile } = useFileManager();
  const questionsContent = useFileContent(questionsPath(chatId));
  const answersContent = useFileContent(answersPath(chatId));
  const asks = useMemo(() => parseQuestionsFile(textOf(questionsContent)).asks, [questionsContent]);
  const answers = useMemo(() => parseAnswersFile(textOf(answersContent)).answers, [answersContent]);
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
        let text: string | undefined;
        try {
          text = decoder.decode(await readFile(path));
        } catch {
          text = undefined;
        }
        await writeFile(path, encoder.encode(serializeAnswersFile(change(parseAnswersFile(text)))), { source: 'user' });
      })();
      answerWrites.set(path, queued);
      await queued;
    },
    [chatId, readFile, writeFile],
  );

  const answer = useCallback(
    async (askId: string, questionId: string, reply: QuestionReply): Promise<void> => {
      const ask = asks.find((candidate) => candidate.id === askId);
      const at = new Date().toISOString();
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
      if (ask === undefined) {
        return;
      }
      const status = askStatus(ask, answers[askId], Date.now());
      if (status.kind === 'defaulted' || status.kind === 'cancelled') {
        await deliver(lateAnswerMessage(ask, questionId, reply));
      }
    },
    [answers, asks, deliver, mutate],
  );

  const hold = useCallback(
    async (askId: string): Promise<void> => {
      if (answers[askId]?.heldAt !== undefined) {
        return;
      }
      const at = new Date().toISOString();
      await mutate((file) => ({
        ...file,
        answers: { ...file.answers, [askId]: { ...(file.answers[askId] ?? { questions: {} }), heldAt: at } },
      }));
    },
    [answers, mutate],
  );

  const decline = useCallback(
    async (askId: string): Promise<void> => {
      await mutate((file) => ({
        ...file,
        answers: { ...file.answers, [askId]: { ...(file.answers[askId] ?? { questions: {} }), declined: true } },
      }));
    },
    [mutate],
  );

  return { asks, answers, now, answer, hold, decline };
}
