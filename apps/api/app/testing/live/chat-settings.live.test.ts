import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostRunSnapshot, HostToolInvocation, HostToolResult } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import {
  createLiveSession,
  createLiveToolRegistry,
  emptyProjectRead,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveChatSettings,
  liveCredentialName,
  liveRepeats,
  liveSessionModel,
  lookingTools,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveChatSettings, LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, finalText, runUsage, toolCalls } from '#testing/live/live-assertions.js';

/**
 * Chat settings said in a note (provider reasoning replay contract, ruling U10; eval evidence under ruling U16).
 *
 * A chat's mode, testing switch and tool mask used to edit the system prompt and the tool list, which cost the
 * provider's prompt cache and withheld the reasoning bound to that prefix on every toggle. They now ride in a state
 * note, with the system prompt and the declared tools held at the defaults. This suite measures whether each model
 * still does what the setting asks, on the production CAD prompt and toolbelt through Tau's own gateway.
 *
 * Every scenario runs in two arms on a fresh chat. `note` is what a browser turn carries today (`liveChatSettings`).
 * `prompt` is what it carried before: the system prompt rendered for the setting and the test tools listed only while
 * testing is on. Turning every tool off has no `prompt` arm: with no tool declared a model could not call one.
 *
 * Tools that look answer that the project is empty; file writes, `evaluate_model` and `test_model` answer success;
 * every other tool, and every call past a budget, ends the check, so a turn costs a handful of steps.
 */

/**
 * One recommended model per provider; `TAU_LIVE_MODEL` (comma-separated) picks others. Google's is Gemini 4 Argon,
 * whose stream can still stall at the provider (`MODEL_STREAM_STALLED`): one of five runs on 2026-11-14.
 */
const modelIds = process.env['TAU_LIVE_MODEL']?.split(',') ?? [
  'anthropic-claude-fable-5.2',
  'openai-gpt-6.1-terra',
  'google-gemini-4-argon',
  'together-kimi-k3.1-pro',
  'xai-grok-4.7',
];

type Arm = 'note' | 'prompt';
type Turn = Readonly<{ settings: LiveChatSettings; prompt: string }>;
type Observed = Readonly<{
  tools: readonly string[];
  /** The paths the turn wrote, in order. */
  paths: readonly string[];
  wrotePlan: boolean;
  wroteModel: boolean;
  wroteChecks: boolean;
  testCalls: number;
  refused: number;
}>;

const buildRequest = 'Make a 20 mm cube with a 5 mm hole through its centre, in main.ts.';

const endsHere: HostToolResult = {
  content: {
    success: false,
    errorCode: 'LIVE_CHECK_ENDS_HERE',
    message: 'This check ends here. Reply with one sentence saying what you did, and stop.',
  },
  isError: true,
};

/** The most tool calls one turn is answered before every further call ends the check. */
const callBudget = 10;

const scriptedResults = (): ((invocation: HostToolInvocation) => HostToolResult) => {
  let calls = 0;
  return (invocation): HostToolResult => {
    calls += 1;
    if (calls > callBudget) {
      return endsHere;
    }
    if (lookingTools.has(invocation.toolName)) {
      return emptyProjectRead;
    }
    switch (invocation.toolName) {
      case toolName.createFile:
      case toolName.editFile:
      case toolName.updateTodos:
      case toolName.testModel: {
        return { content: { success: true }, isError: false };
      }
      case toolName.evaluateModel: {
        return { content: { success: true, status: 'ready', summary: { componentCount: 1 } }, isError: false };
      }
      default: {
        return endsHere;
      }
    }
  };
};

/** What the turn a user message opened did, read from the tool calls after that message and their answers. */
const observe = (snapshot: HostRunSnapshot, userMessageId: string): Observed => {
  const calls = toolCalls(
    snapshot.messages.slice(snapshot.messages.findIndex((message) => message.id === userMessageId)),
  );
  /* The path alone: a plan's text names the files it proposes, and those are not writes. */
  const writes = calls
    .filter((call) => call.toolName === toolName.createFile || call.toolName === toolName.editFile)
    .map((call) => {
      const path = (call.content as { targetFile?: unknown } | undefined)?.targetFile;
      return typeof path === 'string' ? path : '';
    });
  const ids = new Set(calls.map((call) => call.toolCallId));
  return {
    tools: calls.map((call) => call.toolName),
    paths: writes,
    wrotePlan: writes.some((path) => path.endsWith('.plan.md')),
    wroteModel: writes.some((path) => !path.endsWith('.plan.md') && !/\.geospec\.[jt]s$/u.test(path)),
    wroteChecks: writes.some((path) => /\.geospec\.[jt]s$/u.test(path)),
    testCalls: calls.filter((call) => call.toolName === toolName.testModel).length,
    refused: snapshot.messages.filter(
      (message) =>
        message.role === 'tool-output' &&
        ids.has(message.toolCallId) &&
        JSON.stringify(message.content).includes('TOOL_DISABLED'),
    ).length,
  };
};

type Scenario = Readonly<{
  name: string;
  arms: readonly Arm[];
  turns: readonly Turn[];
  /** What the last turn has to have done. */
  holds: (observed: Observed) => boolean;
  expectation: string;
}>;

const plan: LiveChatSettings = { mode: 'plan' };
const scenarios: readonly Scenario[] = [
  {
    name: 'plan mode from the first turn',
    arms: ['note', 'prompt'],
    turns: [{ settings: plan, prompt: buildRequest }],
    holds: (observed) => !observed.wroteModel && !observed.wroteChecks,
    expectation: 'the agent plans and writes no model or check file',
  },
  {
    name: 'plan mode turned on mid-chat',
    arms: ['note', 'prompt'],
    turns: [
      {
        settings: {},
        prompt: 'In one sentence and without calling a tool: what will you need from me to model a part?',
      },
      { settings: plan, prompt: buildRequest },
    ],
    holds: (observed) => !observed.wroteModel && !observed.wroteChecks,
    expectation: 'the agent plans and writes no model or check file',
  },
  {
    name: 'agent mode restored after a plan',
    arms: ['note', 'prompt'],
    turns: [
      { settings: plan, prompt: buildRequest },
      { settings: {}, prompt: 'The plan is approved. Build it now.' },
    ],
    /* Test-first is the workflow, so the first file the agent builds may be the model's checks. */
    holds: (observed) => observed.wroteModel || observed.wroteChecks,
    expectation: 'the agent starts building once the chat is back in agent mode',
  },
  {
    name: 'testing off',
    arms: ['note', 'prompt'],
    turns: [{ settings: { testingEnabled: false }, prompt: buildRequest }],
    holds: (observed) => observed.wroteModel && !observed.wroteChecks && observed.testCalls === 0,
    expectation: 'the agent writes the model, no check file, and never calls test_model',
  },
  {
    name: 'every tool off',
    arms: ['note'],
    turns: [{ settings: { toolChoice: 'none' }, prompt: buildRequest }],
    holds: (observed) => observed.tools.length === 0,
    expectation: 'the agent answers without calling a tool',
  },
];

for (const modelId of modelIds) {
  describe.skipIf(!hasLiveCredential(modelId))(
    `chat settings on ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
    { repeats: liveRepeats },
    () => {
      let gateway: LiveGateway;
      let root: string;

      beforeAll(async () => {
        gateway = await startLiveGateway();
        root = await mkdtemp(join(tmpdir(), 'tau-api-live-settings-'));
      });

      afterAll(async () => {
        await gateway.close();
        await rm(root, { recursive: true, force: true });
      });

      /** One turn of a chat, in one arm; every turn opens its own session on the chat's log, as a browser turn does. */
      const runTurn = async (
        chat: Readonly<{ chatId: string; filePath: string; arm: Arm }>,
        index: number,
        turn: Turn,
      ): Promise<HostRunSnapshot> => {
        const { chatId, arm } = chat;
        const testingEnabled = turn.settings.testingEnabled ?? true;
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-${String(index)}`,
          leaderEpoch: `${chatId}-epoch-1`,
          model: liveSessionModel(modelId),
          eventLog: await createNodeEventLog({ filePath: chat.filePath, access: 'write' }),
          ...(arm === 'note'
            ? {
                ...liveChatSettings({ chatId, modelId, ...turn.settings }),
                toolRegistry: createLiveToolRegistry({ results: scriptedResults(), testingEnabled: true }),
              }
            : {
                systemPrompt: liveCadSystemPrompt({ chatId, modelId, mode: turn.settings.mode, testingEnabled }),
                toolRegistry: createLiveToolRegistry({ results: scriptedResults(), testingEnabled }),
              }),
        });
        try {
          await session.prompt({ id: `${chatId}-user-${String(index)}`, role: 'user', content: turn.prompt });
          return await session.snapshot();
        } finally {
          await session.close();
        }
      };

      /** Run a scenario's turns on a fresh chat; the retry unit is the chat, since a run is terminal once it fails. */
      const run = async (
        scenario: Scenario,
        arm: Arm,
      ): Promise<Readonly<{ snapshot: HostRunSnapshot; observed: Observed; costUsd: number }>> => {
        let last = '';
        const snapshot = await runWithRateLimitRetry(async () => {
          const chatId = `settings-${randomUUID().slice(0, 8)}`;
          const chat = { chatId, filePath: join(root, chatId, 'events.jsonl'), arm };
          last = `${chatId}-user-${String(scenario.turns.length)}`;
          let turned: HostRunSnapshot | undefined;
          for (const [index, turn] of scenario.turns.entries()) {
            // oxlint-disable-next-line no-await-in-loop -- turns are sequential by nature.
            turned = await runTurn(chat, index + 1, turn);
            if (turned.state !== 'completed') {
              break;
            }
          }
          return turned!;
        });
        return { snapshot, observed: observe(snapshot, last), costUsd: runUsage(snapshot).costUsd };
      };

      for (const scenario of scenarios) {
        it.each(scenario.arms)(`${scenario.name}, said in the %s`, async (arm) => {
          const { snapshot, observed, costUsd } = await run(scenario, arm);
          const pass = snapshot.state === 'completed' && scenario.holds(observed);
          console.log(
            `[settings-live] metric ${JSON.stringify({
              modelId,
              scenario: scenario.name,
              arm,
              pass,
              ...observed,
              costUsd,
              /* What the agent said when it did not do what the setting asks: the reason is usually in it. */
              ...(pass || snapshot.state !== 'completed' ? {} : { said: finalText(snapshot).slice(0, 400) }),
            })}`,
          );
          expectCompleted(snapshot);
          expect(scenario.holds(observed), `${scenario.expectation}: ${JSON.stringify(observed)}`).toBe(true);
        });
      }
    },
  );
}
