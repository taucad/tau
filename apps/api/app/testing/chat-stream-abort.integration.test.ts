import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { uiMessageChunkSchema } from 'ai';
import type { UIMessageChunk } from 'ai';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

type AbortProbeModel = {
  modelId: string;
  label: string;
};

type UnhandledRejectionRecord = {
  name: string | undefined;
  message: string;
};

const abortProbeModels = [
  { modelId: 'google-gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { modelId: 'anthropic-claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { modelId: 'openai-gpt-5.5', label: 'GPT-5.5' },
] as const satisfies readonly AbortProbeModel[];

/** Milliseconds. */
const abortAfterPostToolTextTimeout = 30_000;
/** Milliseconds. */
const postAbortObservation = 3000;
const abortProbeFile = 'abort-probe.txt';

const delay = async (duration: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });
};

const timeOutRead = async (duration: number): Promise<{ readTimedOut: true }> => {
  await delay(duration);
  return { readTimedOut: true };
};

const serializeUnhandledReason = (reason: unknown): UnhandledRejectionRecord => {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
    };
  }

  return {
    name: undefined,
    message: typeof reason === 'string' ? reason : JSON.stringify(reason),
  };
};

const captureUnhandledRejections = (): {
  records: UnhandledRejectionRecord[];
  stop: () => void;
} => {
  const records: UnhandledRejectionRecord[] = [];
  const listener = (reason: unknown): void => {
    records.push(serializeUnhandledReason(reason));
  };

  process.on('unhandledRejection', listener);

  return {
    records,
    stop: () => {
      process.off('unhandledRejection', listener);
    },
  };
};

const parseUiMessageChunkStream = (stream: ReadableStream<Uint8Array<ArrayBuffer>>): ReadableStream<UIMessageChunk> =>
  parseJsonEventStream({
    stream,
    // oxlint-disable-next-line typescript-eslint/consistent-type-assertions, typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-assignment -- AI SDK schema type mismatch mirrors the test stream consumers.
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

const readUntilPostToolText = async (options: {
  reader: ReadableStreamDefaultReader<UIMessageChunk>;
  modelId: string;
  /** Milliseconds. */
  postToolTextTimeout: number;
}): Promise<UIMessageChunk[]> => {
  const { reader, modelId, postToolTextTimeout } = options;
  const deadline = performance.now() + postToolTextTimeout;
  const chunks: UIMessageChunk[] = [];
  let sawToolOutput = false;

  while (performance.now() < deadline) {
    const remaining = Math.max(0, deadline - performance.now());
    // oxlint-disable-next-line no-await-in-loop -- ReadableStream reads are sequential by contract.
    const result = await Promise.race([reader.read(), timeOutRead(remaining)]);

    if ('readTimedOut' in result) {
      break;
    }

    if (result.done) {
      break;
    }

    const chunk = result.value;
    chunks.push(chunk);

    if (chunk.type === 'error') {
      const message =
        'errorText' in chunk && typeof chunk.errorText === 'string' ? chunk.errorText : JSON.stringify(chunk);
      throw new Error(
        `${modelId} emitted an error chunk before the abort probe could observe post-tool text: ${message}`,
      );
    }

    if (chunk.type === 'tool-output-available') {
      sawToolOutput = true;
      continue;
    }

    if (sawToolOutput && (chunk.type === 'text-start' || chunk.type === 'text-delta')) {
      return chunks;
    }
  }

  const observedTypes = chunks.map((chunk) => chunk.type).join(', ');
  throw new Error(`${modelId} timed out waiting for post-tool text before aborting. Observed chunks: ${observedTypes}`);
};

describe('Chat stream client abort', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe.each(abortProbeModels)('$label', ({ modelId, label }) => {
    const providerEnvVariable = providerEnvForModelId(modelId);

    it.skipIf(providerEnvVariable === undefined || requiresEnv(providerEnvVariable))(
      `should not emit unhandled rejections when the client aborts a ${label} stream after read_file text`,
      async () => {
        const probeNonce = `abort-probe-${modelId.replaceAll(/[^\da-z]+/gi, '_')}-${Date.now()}`;
        await testApp.memFs.writeFile(
          abortProbeFile,
          `Abort probe fixture for ${label}. Hidden nonce: ${probeNonce}. The assistant should read this before streaming text.`,
        );

        const fetchAbortController = new AbortController();
        const unhandled = captureUnhandledRejections();

        try {
          const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: fetchAbortController.signal,
            body: JSON.stringify({
              id: `chat_abort_probe_${modelId.replaceAll(/[^\da-z]+/gi, '_')}_${Date.now()}`,
              messages: [
                {
                  id: 'msg_abort_probe',
                  role: 'user',
                  parts: [
                    {
                      type: 'text',
                      text: [
                        `Your first action must be to call the read_file tool exactly once for ${abortProbeFile}.`,
                        'The file contains a hidden nonce that is not present in this request; you must read it before answering.',
                        'After the tool result arrives, do not call any more tools.',
                        'Begin streaming with "Read confirmation:" followed by the hidden nonce, then continue with at least eight paragraphs about why responsive cancellation matters in a CAD agent.',
                      ].join(' '),
                    },
                  ],
                  metadata: { model: modelId, kernel: 'replicad' },
                },
              ],
              agent: {
                ...buildCadAgent(modelId, 'replicad'),
                toolChoice: ['read_file'],
              },
            }),
          });

          expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
          expect(response.body, 'Expected an SSE response body before aborting').not.toBeNull();

          const chunkStream = parseUiMessageChunkStream(response.body!);
          const reader = chunkStream.getReader();
          const chunksBeforeAbort = await readUntilPostToolText({
            reader,
            modelId,
            postToolTextTimeout: abortAfterPostToolTextTimeout,
          });

          expect(chunksBeforeAbort.some((chunk) => chunk.type === 'tool-output-available')).toBe(true);
          expect(chunksBeforeAbort.some((chunk) => chunk.type === 'text-start' || chunk.type === 'text-delta')).toBe(
            true,
          );

          fetchAbortController.abort();
          await reader.cancel().catch(() => undefined);
          await delay(postAbortObservation);

          expect(unhandled.records).toEqual([]);
        } finally {
          fetchAbortController.abort();
          unhandled.stop();
        }
      },
      120_000,
    );
  });
});
