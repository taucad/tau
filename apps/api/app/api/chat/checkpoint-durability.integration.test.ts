// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- LangChain model/test APIs use snake_case fields. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { uiMessageChunkSchema } from 'ai';
import type { UIMessageChunk } from 'ai';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import type { CheckpointTuple, MemorySaver } from '@langchain/langgraph-checkpoint';
import type { ChatUsageCost } from '#api/chat/chat.schema.js';
import { toolName } from '@taucad/chat/constants';
import type { AgentConfigInput } from '@taucad/chat/schemas';
import { createTestApp, createTestModel } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { collectStreamChunks } from '#testing/stream-consumer.js';
import { buildCadAgent } from '#testing/skip-helpers.js';

const scriptedModelId = 'test-checkpoint-durability-model';
/** Milliseconds. */
const abortObservationDelay = 500;

type AbortableCallOptions = {
  signal?: AbortSignal;
};

type PostCadChatOptions = {
  testApp: TestApp;
  chatId: string;
  messageText: string;
  agent: AgentConfigInput;
  signal?: AbortSignal;
};

class ScriptedReadFileModel extends BaseChatModel {
  public readonly calls: BaseMessage[][] = [];

  public constructor(
    private readonly options: {
      toolRounds: number;
      /** Milliseconds. */
      finalDelay?: number;
    },
  ) {
    super({});
  }

  public override _llmType(): string {
    return 'scripted-read-file-checkpoint-model';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  public override bindTools(): this {
    return this;
  }

  public override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    this.calls.push(messages);
    const callNumber = this.calls.length;

    if (callNumber <= this.options.toolRounds) {
      const message = new AIMessage({
        content: '',
        tool_calls: [
          {
            id: `call_read_file_${callNumber}`,
            name: toolName.readFile,
            args: { targetFile: `checkpoint-fixture-${callNumber}.ts` },
            type: 'tool_call',
          },
        ],
      });
      return { generations: [{ text: '', message }] };
    }

    await waitForAbortableDelay({
      duration: this.options.finalDelay ?? 0,
      signal: getAbortSignal(options),
    });

    const message = new AIMessage({ content: 'Checkpoint durability complete.' });
    return { generations: [{ text: 'Checkpoint durability complete.', message }] };
  }
}

const getAbortSignal = (options: unknown): AbortSignal | undefined => {
  const signal = (options as AbortableCallOptions | undefined)?.signal;
  return signal instanceof AbortSignal ? signal : undefined;
};

const waitForAbortableDelay = async (options: {
  /** Milliseconds. */ duration: number;
  signal?: AbortSignal;
}): Promise<void> => {
  const { duration, signal } = options;
  if (duration <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const abortableDelayTimeout = setTimeout(resolve, duration);
    const abort = (): void => {
      clearTimeout(abortableDelayTimeout);
      const reason: unknown = signal?.reason;
      reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener('abort', abort, { once: true });
  });
};

const buildScriptedModelService = (model: ScriptedReadFileModel): CreateTestAppOptions['modelService'] => ({
  models: [createTestModel({ id: scriptedModelId })],
  buildModel() {
    return {
      model,
      support: {
        tools: true,
        toolChoice: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    };
  },
  getProviderId() {
    return 'openai';
  },
  createProviderDiagnosticsContext(options) {
    return {
      ...options,
      verbose: false,
      nextProviderAttemptId: () => 1,
      setLatestModelCallSummary: () => undefined,
      getLatestModelCallSummary: () => undefined,
    };
  },
  getContextWindow() {
    return 200_000;
  },
  getKnowledgeCutoff() {
    return '2026-01-01';
  },
  getModelSupport() {
    return {
      tools: true,
      toolChoice: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
    };
  },
  filterProviderToolNamesForModel({ toolNames }) {
    return [...toolNames];
  },
  getOtelProviderName() {
    return 'test';
  },
  normalizeUsageTokens(_modelId, usage) {
    return usage;
  },
  getModelCost(_modelId, _usage): ChatUsageCost {
    return {
      inputTokensCost: 0,
      outputTokensCost: 0,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0,
    };
  },
});

const buildReadFileAgent = (): AgentConfigInput => ({
  ...buildCadAgent(scriptedModelId, 'replicad'),
  toolChoice: [toolName.readFile],
});

const seedReadFiles = async (options: { testApp: TestApp; count: number }): Promise<void> => {
  const { testApp, count } = options;
  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const fileNumber = index + 1;
      await testApp.memFs.writeFile(
        `/checkpoint-fixture-${fileNumber}.ts`,
        `export const checkpointFixture${fileNumber} = ${fileNumber};\n`,
      );
    }),
  );
};

const postCadChat = async (options: PostCadChatOptions): Promise<Response> => {
  const { testApp, chatId, messageText, agent, signal } = options;
  return fetch(`${testApp.baseUrl}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      id: chatId,
      messages: [
        {
          id: `${chatId}_user`,
          role: 'user',
          parts: [{ type: 'text', text: messageText }],
        },
      ],
      agent,
    }),
  });
};

const listThreadCheckpoints = async (checkpointer: MemorySaver, threadId: string): Promise<CheckpointTuple[]> => {
  const checkpoints: CheckpointTuple[] = [];
  for await (const checkpoint of checkpointer.list({ configurable: { thread_id: threadId } })) {
    checkpoints.push(checkpoint);
  }
  return checkpoints;
};

const countMemorySaverWriteBuckets = (checkpointer: MemorySaver, threadId: string): number =>
  Object.entries(checkpointer.writes).filter(([key, writes]) => {
    const parsed = JSON.parse(key) as [string, string, string];
    return parsed[0] === threadId && Object.keys(writes).length > 0;
  }).length;

const getCheckpointMessages = (checkpoint: CheckpointTuple | undefined): unknown[] => {
  const messages = checkpoint?.checkpoint.channel_values['messages'];
  if (!Array.isArray(messages)) {
    throw new Error('Expected checkpoint messages');
  }
  return messages;
};

const expectNoErrorChunks = (chunks: readonly UIMessageChunk[]): void => {
  const errorChunk = chunks.find((chunk) => chunk.type === 'error');
  expect(errorChunk).toBeUndefined();
};

const parseUiMessageChunkStream = (stream: ReadableStream<Uint8Array<ArrayBuffer>>): ReadableStream<UIMessageChunk> =>
  parseJsonEventStream({
    stream,
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions, typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-assignment -- AI SDK schema type mismatch mirrors existing stream consumers.
    schema: uiMessageChunkSchema as any,
  }).pipeThrough(
    new TransformStream<{ success: boolean; value?: unknown; error?: unknown }, UIMessageChunk>({
      transform(parsed, controller) {
        if (!parsed.success) {
          throw parsed.error;
        }
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- chunk validated by AI SDK schema in parseJsonEventStream
        controller.enqueue(parsed.value as UIMessageChunk);
      },
    }),
  );

const readUntilToolOutput = async (options: {
  reader: ReadableStreamDefaultReader<UIMessageChunk>;
  /** Milliseconds. */
  readTimeout: number;
}): Promise<UIMessageChunk[]> => {
  const { reader, readTimeout } = options;
  const deadline = performance.now() + readTimeout;
  const chunks: UIMessageChunk[] = [];

  while (performance.now() < deadline) {
    const remaining = Math.max(0, deadline - performance.now());
    // oxlint-disable-next-line no-await-in-loop -- ReadableStream reads are sequential by contract.
    const result = await Promise.race([
      reader.read(),
      new Promise<{ timedOut: true }>((resolve) => {
        setTimeout(() => {
          resolve({ timedOut: true });
        }, remaining);
      }),
    ]);

    if ('timedOut' in result) {
      break;
    }
    if (result.done) {
      break;
    }

    chunks.push(result.value);
    if (result.value.type === 'error') {
      throw new Error(`Unexpected error chunk before abort: ${JSON.stringify(result.value)}`);
    }
    if (result.value.type === 'tool-output-available') {
      return chunks;
    }
  }

  throw new Error(
    `Timed out waiting for tool output. Observed chunks: ${chunks.map((chunk) => chunk.type).join(', ')}`,
  );
};

const delay = async (duration: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
};

type CrashRecord = {
  kind: 'put' | 'putWrites';
};

const crashProbeScript = `
import { appendFile } from 'node:fs/promises';
import { Annotation, StateGraph, START } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';

const recordFile = process.env.RECORD_FILE;
if (!recordFile) {
  throw new Error('RECORD_FILE is required');
}

const appendRecord = async (record) => {
  await appendFile(recordFile, JSON.stringify(record) + '\\n', 'utf8');
};

class RecordingSaver extends MemorySaver {
  async put(config, checkpoint, metadata) {
    await appendRecord({ kind: 'put', checkpointId: checkpoint.id, metadata });
    return super.put(config, checkpoint, metadata);
  }

  async putWrites(config, writes, taskId) {
    await appendRecord({ kind: 'putWrites', taskId, channels: writes.map(([channel]) => channel) });
    return super.putWrites(config, writes, taskId);
  }
}

const State = Annotation.Root({
  value: Annotation({
    default: () => 0,
    reducer: (left, right) => left + right,
  }),
});

const graph = new StateGraph(State)
  .addNode('first', async () => ({ value: 1 }))
  .addNode('slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return { value: 100 };
  })
  .addEdge(START, 'first')
  .addEdge('first', 'slow')
  .compile({ checkpointer: new RecordingSaver() });

const stream = await graph.stream(
  { value: 1 },
  { configurable: { thread_id: 'hard-crash-thread' }, durability: 'exit' },
);

await stream.next();
console.log('__FIRST_VALUE__');
setInterval(() => undefined, 1000);
`;

const readCrashRecords = async (recordFile: string): Promise<CrashRecord[]> => {
  try {
    const raw = await readFile(recordFile, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CrashRecord);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const waitForCrashProbeReady = async (child: ChildProcess): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const crashProbeReadinessTimeout = setTimeout(() => {
      reject(new Error('Timed out waiting for hard-crash probe readiness'));
    }, 10_000);
    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('__FIRST_VALUE__')) {
        clearTimeout(crashProbeReadinessTimeout);
        resolve();
      }
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('exit', (code, signal) => {
      clearTimeout(crashProbeReadinessTimeout);
      reject(
        new Error(
          `Hard-crash probe exited before readiness: code=${String(code)} signal=${String(signal)} stderr=${stderr}`,
        ),
      );
    });
  });
};

describe('LangGraph checkpoint durability', () => {
  it('persists only the exit checkpoint for a completed multi-step CAD chat turn', async () => {
    const model = new ScriptedReadFileModel({ toolRounds: 3 });
    const testApp = await createTestApp({ modelService: buildScriptedModelService(model) });
    const chatId = `checkpoint_complete_${Date.now()}`;

    try {
      await seedReadFiles({ testApp, count: 3 });
      const response = await postCadChat({
        testApp,
        chatId,
        messageText: 'Read all checkpoint fixtures, then summarize.',
        agent: buildReadFileAgent(),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
      const chunks = await collectStreamChunks(response);
      expectNoErrorChunks(chunks);

      const checkpoints = await listThreadCheckpoints(testApp.checkpointer, chatId);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.metadata?.source).toBe('loop');
      expect(countMemorySaverWriteBuckets(testApp.checkpointer, chatId)).toBe(0);
      expect(model.calls).toHaveLength(4);
    } finally {
      await testApp.app.close();
    }
  });

  it('persists one interrupted checkpoint when the client aborts a CAD chat stream', async () => {
    const model = new ScriptedReadFileModel({ toolRounds: 1, finalDelay: 30_000 });
    const testApp = await createTestApp({ modelService: buildScriptedModelService(model) });
    const chatId = `checkpoint_abort_${Date.now()}`;
    const abortController = new AbortController();

    try {
      await seedReadFiles({ testApp, count: 1 });
      const response = await postCadChat({
        testApp,
        chatId,
        messageText: 'Read the checkpoint fixture, then keep writing until stopped.',
        agent: buildReadFileAgent(),
        signal: abortController.signal,
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
      expect(response.body, 'Expected a streaming response body').not.toBeNull();

      const reader = parseUiMessageChunkStream(response.body!).getReader();
      const chunksBeforeAbort = await readUntilToolOutput({ reader, readTimeout: 10_000 });
      expect(chunksBeforeAbort.some((chunk) => chunk.type === 'tool-output-available')).toBe(true);

      abortController.abort();
      await reader.cancel().catch(() => undefined);
      await delay(abortObservationDelay);

      const checkpoints = await listThreadCheckpoints(testApp.checkpointer, chatId);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.metadata?.source).toBe('loop');
      const checkpointMessages = getCheckpointMessages(checkpoints[0]);
      const checkpointPayload = JSON.stringify(checkpointMessages);
      expect(checkpointPayload).toContain('checkpointFixture1');
      expect(checkpointPayload).not.toContain('Checkpoint durability complete.');
      expect(countMemorySaverWriteBuckets(testApp.checkpointer, chatId)).toBe(0);
    } finally {
      abortController.abort();
      await testApp.app.close();
    }
  });

  it('documents that hard process death before graph exit writes no exit checkpoint', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'tau-checkpoint-crash-'));
    const recordFile = path.join(temporaryDirectory, 'records.jsonl');
    const child: ChildProcess = spawn(process.execPath, ['--input-type=module', '--eval', crashProbeScript], {
      cwd: process.cwd(),
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        ),
        RECORD_FILE: recordFile,
      } as unknown as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForCrashProbeReady(child);
      child.kill('SIGKILL');
      await new Promise<void>((resolve) => {
        child.once('close', () => {
          resolve();
        });
      });

      const records = await readCrashRecords(recordFile);
      expect(records).toEqual([]);
    } finally {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
