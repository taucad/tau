import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAskQuestions } from '#rpc/handlers/handle-ask-questions.js';
import type { QuestionRecordFileSystem } from '#rpc/handlers/handle-ask-questions.js';
import {
  answersPath,
  askStatus,
  parseAnswersFile,
  parseQuestionsFile,
  questionsPath,
  serializeAnswersFile,
} from '#schemas/questions.schema.js';
import type { AnswersFile, AskAnswers } from '#schemas/questions.schema.js';
import type { AskQuestionsRpcInput } from '#schemas/rpc.schema.js';

const chatId = 'chat_1';

const memoryFileSystem = (): QuestionRecordFileSystem & { files: Map<string, string> } => {
  const files = new Map<string, string>();
  return {
    files,
    exists: async (path) => files.has(path),
    readFile: async (path) => {
      const text = files.get(path);
      if (text === undefined) {
        throw new Error(`ENOENT ${path}`);
      }
      return text;
    },
    writeFile: async (path, content) => {
      files.set(path, content);
    },
  };
};

const input = (waitSeconds?: number): AskQuestionsRpcInput => ({
  chatId,
  toolCallId: 'call_1',
  ...(waitSeconds === undefined ? {} : { waitSeconds }),
  questions: [
    {
      id: 'seeds',
      header: 'Seeds',
      question: 'Restore the evidence rows, or drop the rebuilt seeds?',
      options: [
        { label: 'Paste rows', description: 'You paste five lines; the test stays.' },
        { label: 'Drop seeds', description: 'Remove the five seeds.' },
      ],
    },
    {
      id: 'publish',
      header: 'Publish',
      question: 'How should the fork publish?',
      options: [
        { label: 'npm token', description: 'CI publishes.' },
        { label: 'From your Mac', description: 'You run one command.' },
      ],
    },
  ],
});

const askIdOf = (fileSystem: { files: Map<string, string> }): string => {
  const [ask] = parseQuestionsFile(fileSystem.files.get(questionsPath(chatId))).asks;
  if (!ask) {
    throw new Error('no ask recorded');
  }
  return ask.id;
};

const answer = (fileSystem: { files: Map<string, string> }, askAnswers: AskAnswers): void => {
  const file: AnswersFile = { version: 1, answers: { [askIdOf(fileSystem)]: askAnswers } };
  fileSystem.files.set(answersPath(chatId), serializeAnswersFile(file));
};

const at = new Date('2026-10-03T00:00:00.000Z').toISOString();

describe('handleAskQuestions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('records the ask and returns the person’s answers as soon as every question is answered', async () => {
    const fileSystem = memoryFileSystem();
    const pending = handleAskQuestions(input(), fileSystem);
    await vi.advanceTimersByTimeAsync(600);

    const [ask] = parseQuestionsFile(fileSystem.files.get(questionsPath(chatId))).asks;
    expect(ask).toMatchObject({ callId: 'call_1', source: 'tau', deadline: '2026-10-03T00:02:00.000Z' });
    expect(ask?.questions[0]).toMatchObject({ recommended: 0, allowsText: true });

    answer(fileSystem, { questions: { seeds: { choice: 'Drop seeds', at }, publish: { text: 'Use OIDC', at } } });
    await vi.advanceTimersByTimeAsync(600);

    await expect(pending).resolves.toEqual({
      success: true,
      status: 'answered',
      path: questionsPath(chatId),
      answers: [
        { id: 'seeds', answer: 'Drop seeds', source: 'person' },
        { id: 'publish', answer: 'Use OIDC', source: 'person', text: true },
      ],
    });
    const settled = parseQuestionsFile(fileSystem.files.get(questionsPath(chatId))).asks[0];
    expect(settled?.resolution?.outcome).toBe('answered');
  });

  it('adopts the recommended option for questions still unanswered at the deadline', async () => {
    const fileSystem = memoryFileSystem();
    const pending = handleAskQuestions(input(10), fileSystem);
    await vi.advanceTimersByTimeAsync(600);
    answer(fileSystem, { questions: { publish: { choice: 'From your Mac', at } } });
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await pending;
    expect(result).toMatchObject({
      success: true,
      status: 'partial',
      answers: [
        { id: 'seeds', answer: 'Paste rows', source: 'recommended' },
        { id: 'publish', answer: 'From your Mac', source: 'person' },
      ],
    });
    expect(result.success && result.note).toContain('"seeds"');
  });

  it('keeps waiting to the cap once the person starts answering', async () => {
    const fileSystem = memoryFileSystem();
    const pending = handleAskQuestions(input(10), fileSystem);
    await vi.advanceTimersByTimeAsync(600);
    answer(fileSystem, { heldAt: at, questions: {} });
    await vi.advanceTimersByTimeAsync(30_000);

    const stillWaiting = Symbol('waiting');
    await expect(Promise.race([pending, Promise.resolve(stillWaiting)])).resolves.toBe(stillWaiting);

    answer(fileSystem, {
      heldAt: at,
      questions: { seeds: { choice: 'Paste rows', at }, publish: { choice: 'npm token', at } },
    });
    await vi.advanceTimersByTimeAsync(600);
    await expect(pending).resolves.toMatchObject({ status: 'answered' });
  });

  it('returns the recommendations at once for a zero wait and leaves the ask answerable', async () => {
    const fileSystem = memoryFileSystem();
    const result = await handleAskQuestions(input(0), fileSystem);

    expect(result).toMatchObject({ status: 'defaulted' });
    const [ask] = parseQuestionsFile(fileSystem.files.get(questionsPath(chatId))).asks;
    expect(ask && askStatus(ask, undefined, Date.now())).toEqual({ kind: 'defaulted' });
  });

  it('records a cancelled wait and rethrows the abort', async () => {
    const fileSystem = memoryFileSystem();
    const controller = new AbortController();
    const pending = handleAskQuestions(input(), fileSystem, controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(600);
    controller.abort(new Error('stopped'));
    await rejected;

    const [ask] = parseQuestionsFile(fileSystem.files.get(questionsPath(chatId))).asks;
    expect(ask?.resolution?.outcome).toBe('cancelled');
    expect(ask && askStatus(ask, parseAnswersFile(undefined).answers[ask.id], Date.now())).toEqual({
      kind: 'cancelled',
    });
  });
});
