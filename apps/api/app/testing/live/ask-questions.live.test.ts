import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostRunSnapshot, HostToolInvocation, HostToolResult, JsonValue } from '@taucad/agent-host';
import {
  answersPath,
  askQuestionsInputSchema,
  parseQuestionsFile,
  questionsPath,
  serializeAnswersFile,
} from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { handleAskQuestions } from '@taucad/chat/rpc';
import type { QuestionRecordFileSystem } from '@taucad/chat/rpc';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, toolCalls } from '#testing/live/live-assertions.js';

/**
 * Agent questions on a live Haiku turn (agent questions blueprint W5).
 *
 * The production CAD prompt and toolbelt, Tau's own gateway, the real
 * `ask_questions` handler over an in-memory chat record, and a simulated person
 * who answers the second option a moment after the card appears. Two rows: a
 * request whose form is an open choice must be settled with one question before
 * any file is written; a precise request must be built without asking.
 *
 * Every other tool answers with a fixed refusal so the turn ends after the
 * decision instead of modelling for real.
 */

const modelId = 'anthropic-claude-haiku-5.5';

const memoryRecord = (): QuestionRecordFileSystem & { readonly files: Map<string, string> } => {
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

/** Answers every open ask's questions with their second option, as a person clicking B would. */
const answerWithSecondOption = (record: ReturnType<typeof memoryRecord>, chatId: string): void => {
  const { asks } = parseQuestionsFile(record.files.get(questionsPath(chatId)));
  const at = new Date().toISOString();
  const answers = Object.fromEntries(
    asks.map((ask) => [
      ask.id,
      {
        questions: Object.fromEntries(
          ask.questions.map((question) => [question.id, { choice: question.options[1]?.label ?? 'B', at }]),
        ),
      },
    ]),
  );
  record.files.set(answersPath(chatId), serializeAnswersFile({ version: 1, answers }));
};

const stopHere: HostToolResult = {
  content: {
    success: false,
    errorCode: 'LIVE_CHECK_ENDS_HERE',
    message: 'This check ends before modelling. Reply with your one-sentence plan and stop.',
  },
  isError: true,
};

describe.skipIf(!hasLiveCredential(modelId))(
  `agent questions on ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
  () => {
    let gateway: LiveGateway;
    let root: string;

    beforeAll(async () => {
      gateway = await startLiveGateway();
      root = await mkdtemp(join(tmpdir(), 'tau-api-live-questions-'));
    });

    afterAll(async () => {
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    });

    const turn = async (slug: string, prompt: string): Promise<HostRunSnapshot> =>
      runWithRateLimitRetry(async () => {
        const chatId = `${slug}-${randomUUID().slice(0, 8)}`;
        const record = memoryRecord();
        const results = async (invocation: HostToolInvocation): Promise<HostToolResult> => {
          if (invocation.toolName !== toolName.askQuestions) {
            return stopHere;
          }
          const parsed = askQuestionsInputSchema.parse(invocation.input);
          const person = setTimeout(() => {
            answerWithSecondOption(record, chatId);
          }, 1500);
          try {
            const output = await handleAskQuestions(
              { ...parsed, toolCallId: invocation.toolCallId },
              record,
              invocation.signal,
            );
            return { content: output as unknown as JsonValue, isError: false };
          } finally {
            clearTimeout(person);
          }
        };
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-1`,
          leaderEpoch: `${chatId}-epoch-1`,
          systemPrompt: liveCadSystemPrompt({ chatId, modelId }),
          model: liveSessionModel(modelId),
          toolRegistry: createLiveToolRegistry({ results }),
          eventLog: await createNodeEventLog({ filePath: join(root, chatId, 'events.jsonl'), access: 'write' }),
        });
        try {
          await session.prompt({ id: `${chatId}-user-1`, role: 'user', content: prompt });
          return await session.snapshot();
        } finally {
          await session.close();
        }
      });

    it('settles an open choice of form with one question before writing anything', async () => {
      const snapshot = await turn(
        'questions-open-form',
        'Design an interesting desk ornament I can 3D print on my printer. I have not decided what it should look like.',
      );

      expectCompleted(snapshot);
      const asks = toolCalls(snapshot.messages, toolName.askQuestions);
      expect(asks.length, 'the agent should ask once about the form').toBeGreaterThanOrEqual(1);
      const [first] = asks;
      const input = askQuestionsInputSchema.parse(first?.content);
      expect(input.questions.length).toBeGreaterThanOrEqual(1);
      expect(input.questions.length).toBeLessThanOrEqual(3);
      for (const question of input.questions) {
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(question.options.length).toBeLessThanOrEqual(4);
      }
      const firstAsk = snapshot.messages.findIndex(
        (message) => message.role === 'tool-input' && message.toolName === toolName.askQuestions,
      );
      const firstWrite = snapshot.messages.findIndex(
        (message) => message.role === 'tool-input' && message.toolName === toolName.editFile,
      );
      expect(firstWrite === -1 || firstAsk < firstWrite, 'the question comes before any file is written').toBe(true);
      const answered = snapshot.messages.find(
        (message) => message.role === 'tool-output' && message.toolName === toolName.askQuestions,
      );
      expect(JSON.stringify(answered?.content)).toContain('"source":"person"');
      console.log(`[questions-live] ${modelId} asked: ${JSON.stringify(input.questions)}`);
    });

    it('builds a precise request without asking', async () => {
      const snapshot = await turn(
        'questions-precise',
        'Create a 20 mm cube with a 6 mm centered cylindrical hole through it, in main.ts.',
      );

      expectCompleted(snapshot);
      expect(toolCalls(snapshot.messages, toolName.askQuestions)).toEqual([]);
    });
  },
);
