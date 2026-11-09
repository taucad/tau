/**
 * Within-run prompt-prefix identity (chat latency and prompt cache program, W1.4 items 3 and 5).
 *
 * One run, many steps: every step's request must reproduce the previous step's request byte for byte through the
 * previous step's last message (I1 within a run). Outside compaction nothing may rewrite history. The scripted
 * Anthropic replies drive the real session, middleware stack, gateway transport and codec; only `fetch` and the tool
 * registry are fakes.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import { fixtureTools, recordingFetch, stepBoundaries } from '#harness/prefix-identity.fixture.js';
import type { CapturedBody, ScriptedReply } from '#harness/prefix-identity.fixture.js';
import { createAgentSession } from '#harness/session.js';
import type { CreateAgentSessionOptions } from '#harness/session.js';
import { createCachedSystemPromptBlocks, createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import type { HostToolResult, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

/* A small synthetic image payload: identity is about bytes, not pictures. */
const fakePng = Buffer.from('synthetic-image-bytes-'.repeat(64)).toString('base64');

const toolRegistry: ToolRegistry = {
  list: () => fixtureTools,
  invoke: async (invocation): Promise<HostToolResult> => {
    if (invocation.toolName === 'screenshot') {
      return { content: { images: [{ view: 'iso', dataUrl: `data:image/png;base64,${fakePng}` }] }, isError: false };
    }
    if (invocation.toolName === 'edit_file') {
      return { content: { errorCode: 'EDIT_TARGET_NOT_FOUND', message: 'oldString not found' }, isError: true };
    }
    return {
      content: { success: true, path: 'main.scad', content: 'module nut() {}', lineCount: 1 },
      isError: false,
    };
  },
};

const staticPrompt = 'STATIC '.repeat(400).trim();
const dynamicPrompt = 'Model: anthropic-claude-haiku-4.5';
const screenshot: ScriptedReply = { tool: 'screenshot', input: {} };
const readFile: ScriptedReply = { tool: 'read_file', input: { targetFile: 'main.scad' } };
const done: ScriptedReply = { text: 'Done.' };
const failingEdit: ScriptedReply = {
  tool: 'edit_file',
  input: { targetFile: 'main.scad', oldString: 'cube', newString: 'sphere' },
};

type Run = Readonly<{ bodies: readonly CapturedBody[]; requests: readonly ModelStreamRequest[] }>;

/** Run one turn over the real stack and capture every request it made. */
const runSteps = async (
  replies: readonly ScriptedReply[],
  overrides: Partial<CreateAgentSessionOptions> = {},
): Promise<Run> => {
  const bodies: CapturedBody[] = [];
  const requests: ModelStreamRequest[] = [];
  const gateway = createGatewayModelTransport({
    baseUrl: 'https://gateway.example',
    fetch: recordingFetch(replies, bodies),
  });
  const transport: ModelTransport = {
    funding: gateway.funding,
    stream: (request) => {
      requests.push(request);
      return gateway.stream(request);
    },
  };
  let ids = 0;
  const session = await createAgentSession({
    chatId: 'chat-t1-run',
    runId: 'run-1',
    leaderEpoch: 'epoch-1',
    systemPrompt: `${staticPrompt}\n\n${dynamicPrompt}`,
    systemPromptBlocks: createCachedSystemPromptBlocks({ staticPrompt, dynamicPrompt }),
    model: { id: 'anthropic-claude-haiku-4.5', contextWindow: 200_000, maxTokens: 8192, providerKind: 'anthropic' },
    modelTransport: transport,
    toolRegistry,
    eventLog: await createMemoryEventLogFile().open(),
    createId: () => {
      ids += 1;
      return `id-${String(ids)}`;
    },
    now: () => new Date(1_700_000_000_000 + ids * 1000),
    ...overrides,
  });
  const outcome = await session.prompt({ id: 'user-1', role: 'user', content: 'Inspect the nut' });
  await session.close();
  expect(outcome.outcome, JSON.stringify(outcome.failure)).toBe('completed');
  return { bodies, requests };
};

const imageBlocks = (body: CapturedBody): number => (JSON.stringify(body).match(/"type":"image"/gu) ?? []).length;

/** Every step boundary that breaks identity, with where it broke. */
const brokenSteps = (bodies: readonly CapturedBody[]) =>
  stepBoundaries(bodies)
    .map((verdict, index) => ({ step: index + 1, ...verdict }))
    .filter((verdict) => !verdict.identicalThroughHistory)
    .map(({ step, divergence, bytesLost }) => ({ step, divergence, bytesLost }));

describe('I1 request prefix identity within one run', () => {
  it('should keep an older screenshot byte for byte once a newer one is captured', async () => {
    const script = [screenshot, ...Array.from({ length: 6 }, () => readFile), screenshot, done];
    const run = await runSteps(script);
    expect(run.bodies).toHaveLength(script.length);
    const broken = brokenSteps(run.bodies);
    expect(broken, JSON.stringify(broken)).toEqual([]);
    /* Both captures reach the model as images: the first was never rewritten. */
    expect(imageBlocks(run.bodies.at(-1)!)).toBe(2);
  });

  it('should still send text in place of images to a model that takes none, on every step alike', async () => {
    const script = [screenshot, readFile, screenshot, done];
    const run = await runSteps(script, { allowImageBlocks: false });
    const broken = brokenSteps(run.bodies);
    expect(broken, JSON.stringify(broken)).toEqual([]);
    expect(imageBlocks(run.bodies.at(-1)!)).toBe(0);
  });

  it('should keep a safeguard nudge in the run once it fires, so the next step reuses the step that carried it', async () => {
    /* Two identical failing edits earn a nudge on the third request; the fourth request must still carry it. */
    const run = await runSteps([failingEdit, failingEdit, failingEdit, done], {
      safeguardThresholds: { identicalErrorNudge: 2, identicalErrorTerminate: 10 },
    });
    const nudged = run.requests.map(
      (request) => request.messages.filter((message) => message.id.startsWith('tau:safeguard:')).length,
    );
    expect(nudged).toEqual([0, 0, 1, 1]);
    const broken = brokenSteps(run.bodies);
    expect(broken, JSON.stringify(broken)).toEqual([]);
  });
});
