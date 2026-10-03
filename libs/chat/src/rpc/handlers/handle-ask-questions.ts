import { randomUuid } from '@taucad/utils/id';
import { assertRootedPath } from '@taucad/utils/path';
import type { AskQuestionsRpcInput, AskQuestionsRpcResult } from '#schemas/rpc.schema.js';
import {
  askQuestionsDefaultWaitSeconds,
  answersPath,
  askOutcomeOf,
  effectiveDeadline,
  parseAnswersFile,
  parseQuestionsFile,
  questionsPath,
  resolveAnswers,
  serializeQuestionsFile,
} from '#schemas/questions.schema.js';
import type { Ask, AskAnswers, AskOutcome } from '#schemas/questions.schema.js';
import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { toRpcError } from '#rpc/rpc-error.js';

/** The filesystem calls the question record needs. @public */
export type QuestionRecordFileSystem = Pick<RpcFileSystem, 'readFile' | 'writeFile' | 'exists'>;

/** Milliseconds between rereads of the person's answers while an ask waits. */
const pollInterval = 500;

/* ponytail: in-process lock per record path; asks from one chat come from one host process. */
const recordLocks = new Map<string, Promise<unknown>>();

const withRecordLock = async <T>(path: string, work: () => Promise<T>): Promise<T> => {
  const previous = recordLocks.get(path);
  const queued = (async (): Promise<T> => {
    try {
      await previous;
    } catch {
      /* The previous writer reported its own failure. */
    }
    return work();
  })();
  recordLocks.set(path, queued);
  return queued;
};

const readOptional = async (fileSystem: QuestionRecordFileSystem, path: string): Promise<string | undefined> =>
  (await fileSystem.exists(path)) ? fileSystem.readFile(path) : undefined;

/**
 * Mint an ask id.
 *
 * @returns A fresh `ask_…` id.
 * @public
 */
export const createAskId = (): string => `ask_${randomUuid().replaceAll('-', '').slice(0, 16)}`;

/**
 * Append one ask to the chat's `questions.yaml`.
 *
 * @param fileSystem - The record filesystem (the host is the record's only writer).
 * @param chatId - The owning chat.
 * @param ask - The ask to record.
 * @returns The record path.
 * @public
 */
export const recordAsk = async (fileSystem: QuestionRecordFileSystem, chatId: string, ask: Ask): Promise<string> => {
  const path = assertRootedPath(questionsPath(chatId));
  await withRecordLock(path, async () => {
    const file = parseQuestionsFile(await readOptional(fileSystem, path));
    await fileSystem.writeFile(path, serializeQuestionsFile({ ...file, asks: [...file.asks, ask] }));
  });
  return path;
};

/**
 * Record how an ask's wait ended, so the person's client knows a later answer must travel as a message.
 *
 * @param fileSystem - The record filesystem.
 * @param settlement - The chat, the ask and how its wait ended.
 * @public
 */
export const settleAsk = async (
  fileSystem: QuestionRecordFileSystem,
  { chatId, askId, outcome }: Readonly<{ chatId: string; askId: string; outcome: AskOutcome }>,
): Promise<void> => {
  const path = assertRootedPath(questionsPath(chatId));
  await withRecordLock(path, async () => {
    const file = parseQuestionsFile(await readOptional(fileSystem, path));
    const at = new Date().toISOString();
    const asks = file.asks.map((ask) => (ask.id === askId ? { ...ask, resolution: { at, outcome } } : ask));
    await fileSystem.writeFile(path, serializeQuestionsFile({ ...file, asks }));
  });
};

/**
 * Read what the person has done with one ask so far.
 *
 * @param fileSystem - Any view that can read the chat directory.
 * @param chatId - The owning chat.
 * @param askId - The ask.
 * @returns Its answers, or `undefined` before the person touched it.
 * @public
 */
export const readAskAnswers = async (
  fileSystem: QuestionRecordFileSystem,
  chatId: string,
  askId: string,
): Promise<AskAnswers | undefined> =>
  parseAnswersFile(await readOptional(fileSystem, assertRootedPath(answersPath(chatId)))).answers[askId];

const sleep = async (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted(): void {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });

/**
 * Wait until the person answers every question or declines, or the ask's deadline passes.
 *
 * Polls `answers.yaml`, which only the person's client writes. A person who has
 * started answering holds the deadline to the cap ({@link effectiveDeadline}).
 *
 * @param fileSystem - Any view that can read the chat directory.
 * @param wait - The chat, the recorded ask, and a signal that cancels the wait (the turn stopped).
 * @returns The person's answers when the wait ended.
 * @public
 */
export const waitForAnswers = async (
  fileSystem: QuestionRecordFileSystem,
  { chatId, ask, signal }: Readonly<{ chatId: string; ask: Ask; signal?: AbortSignal | undefined }>,
): Promise<AskAnswers | undefined> => {
  for (;;) {
    signal?.throwIfAborted();
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling is sequential by design
    const answers = await readAskAnswers(fileSystem, chatId, ask.id);
    const complete =
      answers?.declined === true || ask.questions.every((question) => answers?.questions[question.id] !== undefined);
    const deadline = effectiveDeadline(ask, answers);
    if (complete || (deadline !== undefined && Date.now() >= deadline)) {
      return answers;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling is sequential by design
    await sleep(
      Math.min(pollInterval, deadline === undefined ? pollInterval : Math.max(0, deadline - Date.now())),
      signal,
    );
  }
};

/**
 * Ask the person 1–3 questions, wait a bounded time, and answer with their choices or the recommended defaults.
 *
 * The questions go to `.tau/chats/<chatId>/questions.yaml`; the person's client
 * writes `answers.yaml`. Each file has one writer, so neither can lose the
 * other's update. A cancelled turn records `cancelled` and rethrows; the ask
 * stays answerable and a later answer travels as a message.
 *
 * @param input - The chat, its questions and the wait.
 * @param fileSystem - The host's record filesystem.
 * @param signal - Cancels the wait.
 * @returns The answers, or a typed refusal.
 * @public
 */
export async function handleAskQuestions(
  input: AskQuestionsRpcInput,
  fileSystem: QuestionRecordFileSystem,
  signal?: AbortSignal,
): Promise<AskQuestionsRpcResult> {
  const waitSeconds = input.waitSeconds ?? askQuestionsDefaultWaitSeconds;
  const askedAt = Date.now();
  const ask: Ask = {
    id: createAskId(),
    ...(input.toolCallId === undefined ? {} : { callId: input.toolCallId }),
    askedAt: new Date(askedAt).toISOString(),
    deadline: new Date(askedAt + waitSeconds * 1000).toISOString(),
    source: 'tau',
    questions: input.questions.map((question) => ({
      id: question.id,
      header: question.header,
      question: question.question,
      options: question.options,
      recommended: 0,
      allowsText: true,
    })),
  };
  let path: string;
  try {
    path = await recordAsk(fileSystem, input.chatId, ask);
  } catch (error) {
    return toRpcError(error);
  }
  let answers: AskAnswers | undefined;
  try {
    answers = waitSeconds === 0 ? undefined : await waitForAnswers(fileSystem, { chatId: input.chatId, ask, signal });
  } catch (error) {
    if (signal?.aborted) {
      try {
        await settleAsk(fileSystem, { chatId: input.chatId, askId: ask.id, outcome: 'cancelled' });
      } catch {
        /* The abort is the outcome the caller sees. */
      }
      throw error;
    }
    return toRpcError(error);
  }
  const resolved = resolveAnswers(ask, answers);
  const defaulted = resolved.filter((answer) => answer.source === 'recommended');
  const outcome = askOutcomeOf(ask, answers);
  /* Every Tau question has a default, so nothing ends declined or unanswered. */
  const status = outcome === 'answered' || outcome === 'partial' ? outcome : 'defaulted';
  try {
    await settleAsk(fileSystem, { chatId: input.chatId, askId: ask.id, outcome: status });
  } catch (error) {
    return toRpcError(error);
  }
  return {
    success: true,
    status,
    path,
    answers: resolved,
    ...(defaulted.length === 0
      ? {}
      : {
          note:
            `No reply in time for ${defaulted.map((answer) => `"${answer.id}"`).join(', ')}: proceed with the recommended ` +
            'option and say once which you assumed. The question stays open; if the person answers later, their answer ' +
            'arrives as a message — adapt then. Do not ask it again.',
        }),
  };
}
