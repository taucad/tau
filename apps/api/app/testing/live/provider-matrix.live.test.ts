import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type {
  AgentSessionModel,
  HostRunSnapshot,
  HostToolInvocation,
  HostToolResult,
  JsonValue,
  ProviderMessage,
  ToolInputProviderMessage,
} from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { applyParameterOperationInputSchema } from '@taucad/chat/schemas';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCompletionCeiling,
  liveCredentialName,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';

/**
 * Live provider matrix.
 *
 * Every enabled Vertex catalog row plus one current model on each remaining
 * provider wire, each driven through the production path — the agent host's
 * gateway transport, Tau's own LLM gateway in direct mode, the real provider —
 * carrying the production CAD system prompt and the full production toolbelt,
 * which is the exact shape that produced the original Vertex HTTP 400.
 *
 * Rows per model: a text turn; one tool call; two tool calls one after another
 * inside one turn; a tool call on a second user turn; parallel tool calls; a
 * text turn at the reasoning level the catalog declares; and a real
 * `apply_parameter_operation` propose whose arguments must parse under the
 * production input schema.
 *
 * Assertions are on durable outcomes only — the run's lifecycle state, the
 * paired tool-call/tool-result rows of the session log, and whether the final
 * answer carries the distinctive token the scripted tool result handed back —
 * never on a model's prose style.
 */

/** Every enabled Vertex row, derived from the catalog so a new Gemini model joins by being listed. */
const vertexModelIds = Object.values(modelList.vertexai)
  .filter((entry) => isModelListEntryEnabled(entry))
  .map((entry) => entry.id);

/** One current model per remaining provider wire, beside every Vertex row. */
const matrixModelIds: readonly string[] = [
  ...vertexModelIds,
  'anthropic-claude-haiku-4.5',
  'openai-gpt-5.6-luna',
  'xai-grok-4.6',
];

/**
 * Distinctive tokens no model could plausibly guess.
 *
 * An answer that carries one is an answer that actually consumed the scripted
 * tool result (or, for `text`, the prompt), which is what each row asserts
 * instead of anything about the model's prose.
 */
const tokens = {
  text: 'TAU-TEXT-6B3K',
  main: 'TAU-MAIN-2H7P',
  beta: 'TAU-BETA-4K9M',
  gamma: 'TAU-GAMMA-3R6V',
  left: 'TAU-LEFT-8W1D',
  right: 'TAU-RIGHT-5N4T',
} as const;

/**
 * The scripted project the toolbelt reads.
 *
 * `alpha.ts` names its successor rather than carrying a token, so a model that
 * wants `beta.ts`'s token has no way to answer without two calls in sequence.
 */
const scriptedFiles: Readonly<Record<string, string>> = {
  'main.ts': `export const token = '${tokens.main}';\n`,
  'alpha.ts': "// The token you need is in the file beta.ts. Read that file next.\nexport const stage = 'alpha';\n",
  'beta.ts': `export const token = '${tokens.beta}';\n`,
  'gamma.ts': `export const token = '${tokens.gamma}';\n`,
  'left.ts': `export const token = '${tokens.left}';\n`,
  'right.ts': `export const token = '${tokens.right}';\n`,
};

/** Values the parameter propose row hands the model, so nothing about the call is guessed. */
const parameterRequestId = 'live-matrix-propose-1';
const parameterManifestRevision = 'manifest-rev-live-matrix-1';

const isObject = (value: JsonValue): value is Readonly<Record<string, JsonValue>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @returns The file name a path-shaped tool input named, ignoring any rooting the model chose. */
const namedFile = (input: JsonValue): string | undefined => {
  const target = isObject(input) ? input['targetFile'] : undefined;
  return typeof target === 'string' ? target.split('/').findLast((segment) => segment.length > 0) : undefined;
};

const readFileResult = (input: JsonValue): HostToolResult => {
  const file = namedFile(input);
  const content = file === undefined ? undefined : scriptedFiles[file];
  if (content === undefined) {
    return {
      content: {
        success: false,
        errorCode: 'FILE_NOT_FOUND',
        message: `This project has no file named ${file ?? 'that'}.`,
      },
      isError: true,
    };
  }
  return {
    content: {
      success: true,
      content,
      size: content.length,
      contentKind: 'text',
      totalLines: content.split('\n').length,
    },
    isError: false,
  };
};

/**
 * Deterministic outcomes for the real toolbelt.
 *
 * The listing is production; only the results are scripted, so a live turn
 * chooses what the model sees without standing up a CAD runtime.
 */
const scriptedResults = (invocation: HostToolInvocation): HostToolResult => {
  if (invocation.toolName === toolName.readFile) {
    return readFileResult(invocation.input);
  }
  if (invocation.toolName === toolName.applyParameterOperation) {
    const requested = isObject(invocation.input) ? invocation.input['requestId'] : undefined;
    return {
      content: {
        success: true,
        outcome: {
          status: 'committed',
          requestId: typeof requested === 'string' ? requested : parameterRequestId,
          revision: { manifestRevision: parameterManifestRevision },
          write: 'applied',
        },
      },
      isError: false,
    };
  }
  return {
    content: {
      success: false,
      errorCode: 'TOOL_UNAVAILABLE',
      message: `${invocation.toolName} is not available in this project; follow the instruction exactly.`,
    },
    isError: true,
  };
};

/**
 * Attempts one row spends on an upstream rate limit before reporting it.
 *
 * Vertex's shared project quota squeezed a whole minute of this matrix on
 * 2026-09-19 and exhausted the helper's default three attempts, so a row buys
 * more headroom rather than running turns in parallel.
 */
const rateLimitAttempts = 5;

/**
 * The cheapest reasoning configuration that keeps thinking enabled.
 *
 * Every row but the declared-level one runs here: the matrix is about wire
 * correctness, not about reasoning depth, and Anthropic's floor is its minimum
 * thinking budget rather than an effort word.
 */
const economyReasoning = (model: AgentSessionModel): AgentSessionModel['reasoning'] => {
  if (model.reasoning === undefined) {
    return undefined;
  }
  return model.providerKind === 'anthropic' ? { budgetTokens: 1024 } : { ...model.reasoning, effort: 'low' };
};

let started: { readonly gateway: LiveGateway; readonly root: string } | undefined;

/** @returns The one in-process gateway and scratch root this file's live turns share, booted on first use. */
const live = async (): Promise<{ readonly gateway: LiveGateway; readonly root: string }> => {
  started ??= {
    gateway: await startLiveGateway(),
    root: await mkdtemp(join(tmpdir(), 'tau-api-live-matrix-')),
  };
  return started;
};

afterAll(async () => {
  if (!started) {
    return;
  }
  await started.gateway.close();
  await rm(started.root, { recursive: true, force: true });
});

type LiveThreadOptions = {
  readonly modelId: string;
  /** Distinguishes this row's chat, and therefore its event log, from every other. */
  readonly slug: string;
  /** One user turn each, in order; a turn is only sent when the previous one completed. */
  readonly prompts: readonly string[];
  readonly reasoning?: AgentSessionModel['reasoning'] | undefined;
  readonly maxTokens?: number | undefined;
};

/**
 * Run one live thread and return the session log it produced.
 *
 * Each user turn opens its own session on the same durable event log, because a
 * session is terminal once its run ends — the same replay the browser performs
 * when a chat continues. The whole thread is the retry unit: a failed run is
 * terminal, so a rate-limited attempt is replaced by a fresh chat rather than
 * resumed.
 *
 * @param options - The model row, this row's chat slug, its prompts and any reasoning override.
 * @returns The snapshot of the last run that was started.
 */
const liveThread = async (options: LiveThreadOptions): Promise<HostRunSnapshot> =>
  runWithRateLimitRetry(
    async () => {
      const { gateway, root } = await live();
      const { reasoning: declared, ...identity } = liveSessionModel(options.modelId);
      const reasoning = options.reasoning ?? economyReasoning({ ...identity, reasoning: declared });
      const model: AgentSessionModel = {
        ...identity,
        maxTokens: options.maxTokens ?? liveCompletionCeiling(options.modelId),
        ...(reasoning === undefined ? {} : { reasoning }),
      };
      const chatId = `${options.slug}-${randomUUID().slice(0, 8)}`;
      const filePath = join(root, chatId, 'events.jsonl');
      const toolRegistry = createLiveToolRegistry({ results: scriptedResults });
      const systemPrompt = liveCadSystemPrompt({ chatId, modelId: options.modelId });
      let snapshot: HostRunSnapshot | undefined;
      /* oxlint-disable no-await-in-loop -- user turns are sequential by definition; turn two needs turn one's answer. */
      for (const [index, prompt] of options.prompts.entries()) {
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-${String(index + 1)}`,
          leaderEpoch: `${chatId}-epoch-1`,
          systemPrompt,
          model,
          toolRegistry,
          eventLog: await createNodeEventLog({ filePath }),
        });
        try {
          await session.prompt({ id: `${chatId}-user-${String(index + 1)}`, role: 'user', content: prompt });
          snapshot = await session.snapshot();
        } finally {
          await session.close();
        }
        if (snapshot.state !== 'completed') {
          break;
        }
      }
      /* oxlint-enable no-await-in-loop -- End sequential turns. */
      if (!snapshot) {
        throw new Error('A live thread needs at least one prompt.');
      }
      return snapshot;
    },
    { attempts: rateLimitAttempts },
  );

/** @returns The provider's own refusal when there was one, so a failing row reports why. */
const refusal = (snapshot: HostRunSnapshot): string => JSON.stringify(snapshot.failure ?? snapshot.messages.slice(-2));

const expectCompleted = (snapshot: HostRunSnapshot): void => {
  expect(snapshot.state, refusal(snapshot)).toBe('completed');
};

const textOf = (message: ProviderMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .flatMap((block) =>
            block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
              ? [block['text']]
              : [],
          )
          .join('')
      : '';

const lastAssistant = (snapshot: HostRunSnapshot): ProviderMessage | undefined =>
  snapshot.messages.findLast((message) => message.role === 'assistant');

/** @returns The final answer's text, which is where a consumed tool result has to show up. */
const finalText = (snapshot: HostRunSnapshot): string => {
  const assistant = lastAssistant(snapshot);
  if (!assistant) {
    expect.fail(`the thread produced no assistant message: ${refusal(snapshot)}`);
  }
  return textOf(assistant);
};

const toolCalls = (snapshot: HostRunSnapshot, name?: string): readonly ToolInputProviderMessage[] =>
  snapshot.messages.filter(
    (message): message is ToolInputProviderMessage =>
      message.role === 'tool-input' && (name === undefined || message.toolName === name),
  );

/** Every tool call the model made was dispatched and answered; nothing was left open. */
const expectPairedToolMessages = (snapshot: HostRunSnapshot): void => {
  const results = new Set(
    snapshot.messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])),
  );
  expect(
    toolCalls(snapshot)
      .map((call) => call.toolCallId)
      .filter((id) => !results.has(id)),
  ).toEqual([]);
  expect(toolCalls(snapshot).length).toBeGreaterThan(0);
};

/** @returns Index of the first message satisfying the predicate, or -1. */
const indexOf = (snapshot: HostRunSnapshot, predicate: (message: ProviderMessage) => boolean): number =>
  snapshot.messages.findIndex((message) => predicate(message));

const describeModel = (modelId: string): void => {
  describe.skipIf(!hasLiveCredential(modelId))(
    `live provider matrix: ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
    () => {
      it('should answer a text turn with assistant text and non-zero usage', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-text`,
          prompts: [`Reply with the token ${tokens.text} and nothing else. Do not call any tool.`],
        });

        expectCompleted(snapshot);
        expect(finalText(snapshot)).toContain(tokens.text);
        const usage = lastAssistant(snapshot)?.metadata?.usage;
        expect(usage?.input).toBeGreaterThan(0);
        expect(usage?.output).toBeGreaterThan(0);
      });

      it('should call one tool and answer from its result', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-single-tool`,
          prompts: [
            `Call ${toolName.readFile} on main.ts, then reply with the exact token that file contains and nothing else.`,
          ],
        });

        expectCompleted(snapshot);
        expectPairedToolMessages(snapshot);
        expect(toolCalls(snapshot, toolName.readFile).map((call) => namedFile(call.content))).toContain('main.ts');
        expect(finalText(snapshot)).toContain(tokens.main);
      });

      it('should call two tools one after another within a single turn', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-sequential-tools`,
          prompts: [
            `Call ${toolName.readFile} on alpha.ts. Its contents name a second file; call ${toolName.readFile} on that second file too, then reply with the exact token the second file contains and nothing else.`,
          ],
        });

        expectCompleted(snapshot);
        expectPairedToolMessages(snapshot);
        const firstResult = indexOf(snapshot, (message) => message.role === 'tool-output');
        const secondCall = indexOf(
          snapshot,
          (message) => message.role === 'tool-input' && namedFile(message.content) === 'beta.ts',
        );
        expect(secondCall, `beta.ts was never read: ${refusal(snapshot)}`).toBeGreaterThan(-1);
        expect(secondCall, 'the second call did not follow the first result').toBeGreaterThan(firstResult);
        expect(finalText(snapshot)).toContain(tokens.beta);
      });

      it('should call a tool on a second user turn that follows a turn with tools', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-second-turn`,
          prompts: [
            `Call ${toolName.readFile} on main.ts, then reply with the exact token that file contains and nothing else.`,
            `Now call ${toolName.readFile} on gamma.ts and reply with the exact token that file contains and nothing else.`,
          ],
        });

        expectCompleted(snapshot);
        expectPairedToolMessages(snapshot);
        const read = toolCalls(snapshot, toolName.readFile).map((call) => namedFile(call.content));
        expect(read).toContain('main.ts');
        expect(read).toContain('gamma.ts');
        expect(finalText(snapshot)).toContain(tokens.gamma);
      });

      it('should consume both results when asked for two independent reads at once', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-parallel-tools`,
          prompts: [
            `You must call ${toolName.readFile} twice, once for left.ts and once for right.ts, issuing both calls in the same step. You do not know either file's contents until the results come back, so do not answer before you have called the tool. Then reply with both exact tokens separated by a space and nothing else.`,
          ],
        });

        expectCompleted(snapshot);
        expectPairedToolMessages(snapshot);
        const read = toolCalls(snapshot, toolName.readFile).map((call) => namedFile(call.content));
        expect(read).toContain('left.ts');
        expect(read).toContain('right.ts');
        expect(finalText(snapshot)).toContain(tokens.left);
        expect(finalText(snapshot)).toContain(tokens.right);
        // A model is free to serialize the two reads; the matrix records which it did.
        const parallel = snapshot.messages.some(
          (message, index) => message.role === 'tool-input' && snapshot.messages[index + 1]?.role === 'tool-input',
        );
        console.info(`${modelId}: two independent reads were issued ${parallel ? 'in parallel' : 'sequentially'}.`);
      });

      it("should complete a text turn at the catalog row's declared reasoning level", async () => {
        const declared = liveSessionModel(modelId).reasoning;
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-declared-reasoning`,
          prompts: [`Reply with the token ${tokens.text} and nothing else. Do not call any tool.`],
          ...(declared === undefined ? {} : { reasoning: declared }),
        });

        expect(snapshot.state, `${JSON.stringify(declared)} was refused: ${refusal(snapshot)}`).toBe('completed');
        expect(snapshot.failure).toBeUndefined();
      });

      it('should call apply_parameter_operation with arguments the production schema accepts', async () => {
        const snapshot = await liveThread({
          modelId,
          slug: `${modelId}-parameter-propose`,
          prompts: [
            `Call ${toolName.applyParameterOperation} exactly once with these exact values: action "propose", targetFile "main.ts", requestId "${parameterRequestId}", expected {"manifestRevision": "${parameterManifestRevision}"}, pressure "final", operation {"kind": "native-value", "group": "main", "parameterId": "width", "resource": "main.ts", "pointer": "/width", "value": 42}. Then reply with the outcome status its result reports and nothing else.`,
          ],
        });

        expectCompleted(snapshot);
        expectPairedToolMessages(snapshot);
        const [call] = toolCalls(snapshot, toolName.applyParameterOperation);
        if (!call) {
          expect.fail(`${toolName.applyParameterOperation} was never called: ${refusal(snapshot)}`);
        }
        const parsed = applyParameterOperationInputSchema.safeParse(call.content);
        expect(parsed.success, JSON.stringify({ input: call.content, error: parsed.error?.issues })).toBe(true);
        expect(parsed.data?.action).toBe('propose');
        expect(finalText(snapshot).toLowerCase()).toContain('committed');
      });
    },
  );
};

for (const modelId of matrixModelIds) {
  describeModel(modelId);
}
