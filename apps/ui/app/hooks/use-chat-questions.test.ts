import { renderHook, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  answersPath,
  legacyAnswersPath,
  legacyQuestionsPath,
  questionsPath,
  parseAnswersFile,
  parseQuestionsFile,
} from '@taucad/chat';
import type { FileContentSelection } from '#hooks/use-file-content.js';
import type { useFileManager } from '#hooks/use-file-manager.js';

const files = new Map<string, string>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const manager = mock<ReturnType<typeof useFileManager>>();
vi.mock('#hooks/use-file-manager.js', () => ({ useFileManager: () => manager }));
vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: (path: string) =>
    files.has(path)
      ? { ...mock<FileContentSelection>(), kind: 'text', content: encoder.encode(files.get(path)) }
      : mock<FileContentSelection>({ kind: 'loading' }),
}));
const { useChatQuestions } = await import('#hooks/use-chat-questions.js');
const chatId = 'chat_answers';
const legacyAskId = 'ask_legacy';
const newLegacyAskId = 'ask_new_legacy';
const at = '2026-10-03T00:00:00.000Z';
const legacy = JSON.stringify({
  version: 1,
  asks: [
    {
      id: 'ask_legacy',
      askedAt: at,
      deadline: null,
      resolution: { at, outcome: 'cancelled' },
      source: 'tau',
      questions: [{ id: 'name', question: 'Name?', options: [], allowsText: true }],
    },
  ],
});
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
let lockCalls = 0;
beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
  lockCalls = 0;
  manager.exists.mockImplementation(async (path) => files.has(path));
  manager.readFile.mockImplementation(async (path) => {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error('missing');
    }
    return encoder.encode(value);
  });
  manager.writeFile.mockImplementation(async (path, value) => {
    files.set(path, decoder.decode(value));
  });
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, work: () => Promise<void>) => {
        lockCalls += 1;
        await work();
      },
    },
  });
});
afterEach(() => {
  if (originalLocks) {
    Object.defineProperty(navigator, 'locks', originalLocks);
  } else {
    Reflect.deleteProperty(navigator, 'locks');
  }
});

describe('question answer persistence', () => {
  it('should read legacy records and migrate answers without modifying either legacy file', async () => {
    files.set(legacyQuestionsPath(chatId), legacy);
    const originalAnswers = JSON.stringify({ version: 1, answers: {} });
    files.set(legacyAnswersPath(chatId), originalAnswers);
    const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
    expect(result.current.asks[0]?.id).toBe('ask_legacy');
    await act(async () => {
      await result.current.answer('ask_legacy', 'name', { text: 'Widget' });
    });
    expect(files.get(legacyQuestionsPath(chatId))).toBe(legacy);
    expect(files.get(legacyAnswersPath(chatId))).toBe(originalAnswers);
    expect(parseAnswersFile(files.get(answersPath(chatId))).answers['ask_legacy']?.questions['name']).toMatchObject({
      text: 'Widget',
    });
    expect(lockCalls).toBe(1);
  });

  it('should preserve the current file when reading it fails', async () => {
    files.set(questionsPath(chatId), legacy);
    files.set(answersPath(chatId), JSON.stringify({ version: 2, answers: {} }));
    manager.readFile.mockRejectedValue(new Error('disk unavailable'));
    const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
    await expect(result.current.answer('ask_legacy', 'name', { text: 'Widget' })).rejects.toThrow('disk unavailable');
    expect(manager.writeFile).not.toHaveBeenCalled();
  });
});

it('should refuse a pending legacy ask rather than saving an answer its old host cannot read', async () => {
  const document = parseQuestionsFile(legacy);
  files.set(
    legacyQuestionsPath(chatId),
    JSON.stringify({ ...document, asks: document.asks.map((ask) => ({ ...ask, resolution: undefined })) }),
  );
  const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
  await expect(result.current.answer('ask_legacy', 'name', { text: 'Widget' })).rejects.toThrow('updated host');
  expect(manager.writeFile).not.toHaveBeenCalled();
});

it('should wait for another window writer and preserve its answer when the lock becomes available', async () => {
  files.set(legacyQuestionsPath(chatId), legacy);
  const releaseOtherWindow = Promise.withResolvers<void>();
  const answerQueued = Promise.withResolvers<void>();
  const locks = new Map<string, Promise<unknown>>();
  let requests = 0;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (name: string, work: () => Promise<void>) => {
        const previous = locks.get(name);
        const next = (async () => {
          await previous;
          await work();
        })();
        locks.set(name, next);
        requests += 1;
        if (requests === 2) {
          answerQueued.resolve();
        }
        await next;
      },
    },
  });
  const otherWriter = navigator.locks.request(`tau-question-answers:${answersPath(chatId)}`, async () => {
    await releaseOtherWindow.promise;
    files.set(
      answersPath(chatId),
      JSON.stringify({ version: 2, answers: { other: { questions: { color: { text: 'Blue', at } } } } }),
    );
  });
  const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
  const answer = result.current.answer('ask_legacy', 'name', { text: 'Widget' });
  await answerQueued.promise;
  expect(manager.readFile).not.toHaveBeenCalled();
  releaseOtherWindow.resolve();
  await Promise.all([otherWriter, answer]);
  expect(parseAnswersFile(files.get(answersPath(chatId))).answers).toMatchObject({
    other: { questions: { color: { text: 'Blue' } } },
    [legacyAskId]: { questions: { name: { text: 'Widget' } } },
  });
});

it('should retain new legacy asks after a v2 record exists with v2 precedence on overlapping IDs', () => {
  const old = parseQuestionsFile(legacy).asks[0]!;
  files.set(
    legacyQuestionsPath(chatId),
    JSON.stringify({ version: 1, asks: [old, { ...old, id: 'ask_new_legacy', resolution: undefined }] }),
  );
  files.set(
    questionsPath(chatId),
    JSON.stringify({ version: 2, asks: [{ ...old, answerVersion: 2, message: 'Current version' }] }),
  );
  files.set(
    legacyAnswersPath(chatId),
    JSON.stringify({
      version: 1,
      answers: {
        [newLegacyAskId]: { questions: { name: { text: 'Legacy answer', at } } },
        [legacyAskId]: { questions: { name: { text: 'Old answer', at: '2026-10-03T00:03:00.000Z' } } },
      },
    }),
  );
  files.set(
    answersPath(chatId),
    JSON.stringify({ version: 2, answers: { [legacyAskId]: { questions: { name: { text: 'Current answer', at } } } } }),
  );
  const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
  expect(result.current.asks.map((ask) => ask.id)).toEqual(['ask_legacy', 'ask_new_legacy']);
  expect(result.current.asks[0]?.message).toBe('Current version');
  expect(result.current.answers).toMatchObject({
    [newLegacyAskId]: { questions: { name: { text: 'Legacy answer' } } },
    [legacyAskId]: { questions: { name: { text: 'Current answer' } } },
  });
});

it.each(['hold', 'decline'] as const)('should refuse %s for pending legacy and unknown asks', async (action) => {
  const document = parseQuestionsFile(legacy);
  files.set(
    legacyQuestionsPath(chatId),
    JSON.stringify({ ...document, asks: document.asks.map((ask) => ({ ...ask, resolution: undefined })) }),
  );
  const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
  await expect(result.current[action]('ask_legacy')).rejects.toThrow('updated host');
  await expect(result.current[action]('ask_unknown')).rejects.toThrow();
  expect(manager.writeFile).not.toHaveBeenCalled();
});

it('should reconcile a copied legacy ask with later settlement and answers without losing newer v2 edits', async () => {
  const old = parseQuestionsFile(legacy).asks[0]!;
  const later = '2026-10-03T00:01:00.000Z';
  const newest = '2026-10-03T00:02:00.000Z';
  files.set(questionsPath(chatId), JSON.stringify({ version: 2, asks: [{ ...old, resolution: undefined }] }));
  files.set(
    legacyQuestionsPath(chatId),
    JSON.stringify({ version: 1, asks: [{ ...old, resolution: { at: later, outcome: 'answered' } }] }),
  );
  files.set(
    legacyAnswersPath(chatId),
    JSON.stringify({
      version: 1,
      answers: {
        [legacyAskId]: {
          questions: {
            name: { text: 'Legacy latest', at: later },
            color: { text: 'Blue', at: later },
            size: { text: 'Old size', at },
          },
        },
      },
    }),
  );
  files.set(
    answersPath(chatId),
    JSON.stringify({
      version: 2,
      answers: {
        [legacyAskId]: { questions: { name: { text: 'Copied old', at }, size: { text: 'New size', at: newest } } },
      },
    }),
  );
  const { result, rerender } = renderHook(() => useChatQuestions(chatId, async () => undefined));
  expect(result.current.asks[0]?.resolution).toEqual({ at: later, outcome: 'answered' });
  expect(result.current.answers[legacyAskId]?.questions).toMatchObject({
    name: { text: 'Legacy latest' },
    color: { text: 'Blue' },
    size: { text: 'New size' },
  });
  await act(async () => {
    await result.current.answer(legacyAskId, 'name', { text: 'Updated here' });
  });
  expect(parseAnswersFile(files.get(answersPath(chatId))).answers[legacyAskId]?.questions).toMatchObject({
    name: { text: 'Updated here' },
    color: { text: 'Blue' },
    size: { text: 'New size' },
  });
  files.set(
    questionsPath(chatId),
    JSON.stringify({ version: 2, asks: [{ ...old, resolution: { at: newest, outcome: 'cancelled' } }] }),
  );
  rerender();
  expect(result.current.asks[0]?.resolution).toEqual({ at: newest, outcome: 'cancelled' });
});

it.each([legacyAnswersPath(chatId), answersPath(chatId)])(
  'should refuse unknown answer versions in %s before any write',
  async (path) => {
    files.set(legacyQuestionsPath(chatId), legacy);
    files.set(answersPath(chatId), JSON.stringify({ version: 2, answers: {} }));
    const { result } = renderHook(() => useChatQuestions(chatId, async () => undefined));
    files.set(path, JSON.stringify({ version: 99, answers: {} }));
    await expect(result.current.answer(legacyAskId, 'name', { text: 'Widget' })).rejects.toThrow('Unsupported');
    expect(manager.writeFile).not.toHaveBeenCalled();
  },
);
