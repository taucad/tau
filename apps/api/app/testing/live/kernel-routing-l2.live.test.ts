import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostRunSnapshot } from '@taucad/agent-host';
import { tauMcpKernelProfile } from '@taucad/chat/prompts';
import {
  createLiveSession,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveRepeats,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, runUsage, toolCalls } from '#testing/live/live-assertions.js';
import { runL2Task } from '#testing/live/kernel-routing-l2.js';
import type { L2Verdict } from '#testing/live/kernel-routing-l2.js';
import { l2Tasks } from '#testing/live/kernel-routing-l2.tasks.js';

/**
 * L2 of the automatic kernel selection eval (blueprint AKS-3b, Appendix E): does the kernel a turn chooses then
 * succeed? Each task is one full Auto turn on an entry-less folder, on the host tool registry `tau mcp` builds, with
 * the production CAD prompt rendered for the `tau mcp` kernels; a GeoSpec oracle the agent never sees judges what it
 * left. The L2 pass rate is reported, never gated here (D9); the line `[kernel-routing-l2] metric` carries each task's
 * kernel, acceptability, verdict and spend.
 *
 * The instrument itself is proved without a model in `kernel-routing-l2.runner.test.ts`.
 */

/** The catalog row under test; `TAU_LIVE_MODEL` picks another, such as `anthropic-claude-opus-5.5`. */
const modelId = process.env['TAU_LIVE_MODEL'] ?? 'anthropic-claude-sonnet-5.5';

describe.skipIf(!hasLiveCredential(modelId))(
  `kernel routing L2 on ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
  { repeats: liveRepeats },
  () => {
    let gateway: LiveGateway;
    let logs: string;
    const verdicts: L2Verdict[] = [];

    beforeAll(async () => {
      gateway = await startLiveGateway();
      logs = await mkdtemp(join(tmpdir(), 'tau-api-live-l2-'));
    });

    afterAll(async () => {
      const passed = verdicts.filter(({ passed: ok }) => ok).length;
      console.log(`[kernel-routing-l2] summary ${JSON.stringify({ modelId, passed, of: verdicts.length })}`);
      await gateway.close();
      await rm(logs, { recursive: true, force: true });
    });

    it.each(l2Tasks.map((task) => [task.id, task] as const))('runs %s to a GeoSpec verdict', async (_id, task) => {
      const chatId = `${task.id}-${Date.now().toString(36)}`;
      let snapshot: HostRunSnapshot | undefined;
      const verdict = await runL2Task({
        task,
        agent: async ({ registry }) => {
          snapshot = await runWithRateLimitRetry(async () => {
            const session = await createLiveSession({
              gateway,
              chatId,
              runId: `${chatId}-run-1`,
              leaderEpoch: `${chatId}-epoch-1`,
              systemPrompt: liveCadSystemPrompt({
                kernel: 'auto',
                kernelProfile: tauMcpKernelProfile,
                chatId,
                modelId,
                testingEnabled: true,
              }),
              model: liveSessionModel(modelId),
              toolRegistry: registry,
              eventLog: await createNodeEventLog({ filePath: join(logs, chatId, 'events.jsonl'), access: 'write' }),
            });
            try {
              await session.prompt({ id: `${chatId}-user-1`, role: 'user', content: task.prompt });
              return await session.snapshot();
            } finally {
              await session.close();
            }
          });
        },
      });
      verdicts.push(verdict);
      console.log(
        `[kernel-routing-l2] metric ${JSON.stringify({
          ...verdict,
          modelId,
          family: task.family,
          tools: snapshot === undefined ? [] : toolCalls(snapshot.messages).map((call) => call.toolName),
          ...(snapshot === undefined ? {} : runUsage(snapshot)),
        })}`,
      );

      expect(snapshot, 'the turn ran').toBeDefined();
      expectCompleted(snapshot!);
    });
  },
);
