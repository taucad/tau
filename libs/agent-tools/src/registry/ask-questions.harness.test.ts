import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createTauAgentHost } from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { JsonObject } from '@taucad/agent-host';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import { answersPath, parseQuestionsFile, questionsPath, serializeAnswersFile } from '@taucad/chat';

import { createChatToolRegistry } from '#registry/tool-registry.js';
import { placementOver, scriptedTransport } from '#registry/tau-host.fixture.js';

/** A project filesystem that remembers what the tools write. */
const memoryFileSystem = (files: Map<string, string>): RpcFileSystem => ({
  readFile: async (path) => {
    const content = files.get(path);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return content;
  },
  readBinaryFile: async (path) => {
    const content = files.get(path);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return new TextEncoder().encode(content);
  },
  writeFile: async (path, content) => {
    files.set(path, content);
  },
  writeFileChecked: async () => {
    throw new Error('No checked authority in this fixture.');
  },
  deleteFileChecked: async () => {
    throw new Error('No checked authority in this fixture.');
  },
  writeBinaryFile: async () => undefined,
  deleteFile: async (path) => {
    files.delete(path);
  },
  readdir: async () => [],
  exists: async (path) => files.has(path),
  appendFile: async () => undefined,
  editFile: async () => {
    throw new Error('edit_file is not part of this fixture.');
  },
  stat: async () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  },
});

const chatId = 'chat_questions';
const question = {
  id: 'wall-material',
  header: 'Material',
  question: 'Print the enclosure in PETG or PLA?',
  options: [
    { label: 'PETG', description: 'Tougher and heat resistant; slower to print.' },
    { label: 'PLA', description: 'Faster and crisper; softens near 60 °C.' },
  ],
};

const createIds = (prefix: string) => {
  let next = 0;
  return () => `${prefix}-${String(next++)}`;
};

/** Answers the first recorded ask once it appears, as the person's client would. */
const answerWhenAsked = (files: Map<string, string>, choice: string): (() => void) => {
  const timer = setInterval(() => {
    const [ask] = parseQuestionsFile(files.get(questionsPath(chatId))).asks;
    if (ask === undefined) {
      return;
    }
    files.set(
      answersPath(chatId),
      serializeAnswersFile({
        version: 1,
        answers: { [ask.id]: { questions: { [question.id]: { choice, at: new Date().toISOString() } } } },
      }),
    );
    clearInterval(timer);
  }, 50);
  return () => {
    clearInterval(timer);
  };
};

describe('ask_questions through createTauAgentHost', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  const run = async (input: JsonObject, files: Map<string, string>) => {
    directory = await mkdtemp(join(tmpdir(), 'tau-ask-questions-'));
    const transport = scriptedTransport([
      { text: 'One decision first.', toolCalls: [{ id: 'call-ask-1', name: 'ask_questions', input }] },
      { text: 'Going with that.' },
    ]);
    let tick = 0;
    const toolRegistry = createChatToolRegistry({
      fileSystemFor: () => memoryFileSystem(files),
      testingEnabled: false,
    });
    const host = createTauAgentHost({
      systemPrompt: 'You are the questions fixture.',
      model: { id: 'scripted-questions-model', contextWindow: 200_000 },
      modelTransport: transport,
      toolRegistry,
      placement: placementOver(toolRegistry),
      openEventLog: async () =>
        createNodeEventLog({ filePath: join(directory ?? '', 'events.jsonl'), access: 'write' }),
      createId: createIds('message'),
      createLeaderEpoch: createIds('epoch'),
      now: () => new Date(Date.UTC(2026, 9, 3, 0, 0, tick++)),
    });
    try {
      await host.admit({
        chatId,
        runId: 'run-questions',
        trigger: 'submit',
        message: { id: 'turn-questions', role: 'user', content: 'Design an enclosure for my printer.' },
      });
      const snapshot = await host.snapshot(chatId);
      return { snapshot, transport };
    } finally {
      await host.close();
    }
  };

  it('should wait for the person, record the ask with its trusted call id and return their answer', async () => {
    const files = new Map<string, string>();
    const stop = answerWhenAsked(files, 'PLA');
    try {
      const { snapshot, transport } = await run({ chatId, questions: [question], waitSeconds: 30 }, files);

      expect(snapshot.state).toBe('completed');
      expect(snapshot.messages.find((message) => message.role === 'tool-output')).toMatchObject({
        toolCallId: 'call-ask-1',
        toolName: 'ask_questions',
        isError: false,
        content: {
          success: true,
          status: 'answered',
          path: questionsPath(chatId),
          answers: [{ id: 'wall-material', answer: 'PLA', source: 'person' }],
        },
      });
      const [ask] = parseQuestionsFile(files.get(questionsPath(chatId))).asks;
      expect(ask).toMatchObject({ callId: 'call-ask-1', resolution: { outcome: 'answered' } });
      expect(transport.requests[0]?.tools.map((tool) => tool.name)).toContain('ask_questions');
    } finally {
      stop();
    }
  });

  it('should continue at once on the recommendation for a zero wait', async () => {
    const files = new Map<string, string>();
    const { snapshot } = await run({ chatId, questions: [question], waitSeconds: 0 }, files);

    expect(snapshot.state).toBe('completed');
    expect(snapshot.messages.find((message) => message.role === 'tool-output')).toMatchObject({
      isError: false,
      content: { status: 'defaulted', answers: [{ id: 'wall-material', answer: 'PETG', source: 'recommended' }] },
    });
  });
});
