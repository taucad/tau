import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostRunSnapshot, HostToolInvocation, HostToolResult, JsonValue } from '@taucad/agent-host';
import { todoListPath, updateTodosInputSchema } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { handleWriteTodos } from '@taucad/chat/rpc';
import type { RpcFileSystem } from '@taucad/chat/rpc';
import {
  createLiveSession,
  createLiveToolRegistry,
  emptyProjectRead,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveRepeats,
  liveSessionModel,
  lookingTools,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, runUsage, textOf, toolCalls } from '#testing/live/live-assertions.js';

/**
 * The task list on a live Haiku turn (the `task-tracking` EVAL of
 * `cad-agent.prompt.ts`; deploy-cut charter W7, finding P2).
 *
 * The production CAD prompt and toolbelt, Tau's own gateway and the real
 * `update_todos` handler over an in-memory file. A multi-step request must get
 * its task list before the first change to the project, and the list must be
 * read as the person's progress on that request, not as a project of its own:
 * the staging run behind P2 called it "the tscircuit project" and went looking
 * for its chat id.
 *
 * Reading tools answer that the project holds nothing yet; the first tool that
 * would change the project ends the turn, so the check stops before modelling.
 */

const modelId = 'anthropic-claude-haiku-5.5';

const stopHere: HostToolResult = {
  content: {
    success: false,
    errorCode: 'LIVE_CHECK_ENDS_HERE',
    message: 'This check ends before modelling. Reply with your one-sentence plan and stop.',
  },
  isError: true,
};

describe.skipIf(!hasLiveCredential(modelId))(
  `task list on ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
  { repeats: liveRepeats },
  () => {
    let gateway: LiveGateway;
    let root: string;

    beforeAll(async () => {
      gateway = await startLiveGateway();
      root = await mkdtemp(join(tmpdir(), 'tau-api-live-todos-'));
    });

    afterAll(async () => {
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    });

    const turn = async (chatId: string, prompt: string): Promise<HostRunSnapshot> =>
      runWithRateLimitRetry(async () => {
        const files = new Map<string, string>();
        const fileSystem = {
          writeFile: async (path: string, content: string) => {
            files.set(path, content);
          },
        } as unknown as RpcFileSystem;
        const results = async (invocation: HostToolInvocation): Promise<HostToolResult> => {
          if (invocation.toolName === toolName.updateTodos) {
            const output = await handleWriteTodos(updateTodosInputSchema.parse(invocation.input), fileSystem);
            return { content: output as unknown as JsonValue, isError: !output.success };
          }
          return lookingTools.has(invocation.toolName) ? emptyProjectRead : stopHere;
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

    it('writes the task list for a multi-step request before changing the project, as that request', async () => {
      const chatId = `todos-multi-step-${randomUUID().slice(0, 8)}`;
      const snapshot = await turn(
        chatId,
        'Build a wall-mounted headphone hook in main.ts: a mounting plate with two countersunk screw holes, a curved arm, and a lip at the end so the headphones cannot slide off. Then check it renders and export it as an STL.',
      );
      const lists = toolCalls(snapshot.messages, toolName.updateTodos);
      const firstWritten = lists[0] === undefined ? undefined : updateTodosInputSchema.safeParse(lists[0].content).data;
      console.log(
        `[todos-live] metric ${JSON.stringify({
          row: 'todos-multi-step',
          modelId,
          path: todoListPath(chatId),
          items: firstWritten?.items.map((item) => item.title) ?? null,
          tools: toolCalls(snapshot.messages).map((call) => call.toolName),
          ...runUsage(snapshot),
        })}`,
      );

      expectCompleted(snapshot);
      expect(lists.length, 'the agent should keep a task list for this request').toBeGreaterThanOrEqual(1);

      const firstList = snapshot.messages.indexOf(lists[0]!);
      const firstChange = snapshot.messages.findIndex(
        (message) =>
          message.role === 'tool-input' &&
          message.toolName !== toolName.updateTodos &&
          !lookingTools.has(message.toolName),
      );
      expect(firstChange === -1 || firstList < firstChange, 'the list comes before the first change').toBe(true);

      const written = updateTodosInputSchema.parse(lists[0]?.content);
      expect(written.chatId, 'the list belongs to this chat').toBe(chatId);
      expect(written.items.length).toBeGreaterThanOrEqual(3);
      expect(written.items.filter((item) => item.status === 'in_progress').length).toBeLessThanOrEqual(1);

      // P2: the list is the person's progress on this request, not a project with its own name or id.
      for (const item of written.items) {
        const shown = `${item.title} ${item.note ?? ''}`;
        expect(shown, 'an item names the request, not the list').not.toMatch(/todo|task list|\.tau\//iu);
        expect(shown).not.toContain(chatId);
      }
      for (const message of snapshot.messages.filter((row) => row.role === 'assistant')) {
        expect(textOf(message), 'the reply never surfaces the chat id').not.toContain(chatId);
      }
    });
  },
);
