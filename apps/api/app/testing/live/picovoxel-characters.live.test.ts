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
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, runUsage, toolCalls } from '#testing/live/live-assertions.js';
import { runL2Task } from '#testing/live/kernel-routing-l2.js';
import type { L2Verdict } from '#testing/live/kernel-routing-l2.js';
import type { L2Task } from '#testing/live/kernel-routing-l2.tasks.js';

/**
 * AKS-1d's spike (automatic kernel selection blueprint): ten stylised-character prompts on PicoVoxel. The acceptance
 * is a single watertight body per prompt. It uses the L2 instrument: one full turn on the `tau mcp` host tool registry,
 * then a GeoSpec oracle the agent never sees. The oracle checks only one connected, watertight piece of a plausible
 * size, never the character's likeness. The line `[picovoxel-characters] metric` carries each verdict and its spend.
 * It is reported, not gated.
 */

const modelId = process.env['TAU_LIVE_MODEL'] ?? 'anthropic-claude-sonnet-5.5';

const prompts: ReadonlyArray<readonly [id: string, prompt: string]> = [
  ['owl', 'A stylised cartoon owl figurine, about 60 mm tall, with big eyes and folded wings, as one printable body.'],
  ['cat', 'A chunky stylised sitting cat, about 50 mm tall, with a curled tail, smooth and blobby, one solid body.'],
  ['robot', 'A cute rounded robot toy, about 70 mm tall, with a big head, stubby arms and legs, all one piece.'],
  ['snowman', 'A stylised snowman ornament about 80 mm tall: three blended spheres, a carrot nose and a hat.'],
  ['dino', 'A chibi dinosaur figure, about 60 mm long, with a big head, small arms and a thick tail, printable as one body.'],
  ['bunny', 'A soft stylised bunny, about 55 mm tall, with long ears and a round body, blended smoothly into one solid.'],
  ['penguin', 'A round cartoon penguin, about 50 mm tall, with flippers and feet blended into the body.'],
  ['ghost', 'A friendly cartoon ghost keychain charm, about 40 mm tall, with a wavy hem, eye holes and a loop on top.'],
  ['frog', 'A stylised frog sitting on its haunches, about 45 mm wide, with bulging eyes, smooth organic shape, one body.'],
  ['astronaut', 'A chibi astronaut figurine about 70 mm tall with a big round helmet and a backpack, all one solid.'],
];

/** One connected, watertight body, 5 mm to 200 mm on every axis. */
const characterOracle: L2Task['oracle'] = {
  boundingBox: {
    size: {
      x: { greaterThanOrEqual: 5, lessThanOrEqual: 200 },
      y: { greaterThanOrEqual: 5, lessThanOrEqual: 200 },
      z: { greaterThanOrEqual: 5, lessThanOrEqual: 200 },
    },
    tolerance: 0,
  },
  singlePiece: true,
  watertight: true,
};

/* The spike never proves the oracle against these; the L2 runner test does that for the instrument. */
const unused = { path: 'main.ts', source: '', kernel: 'picovoxel' } as const;

const tasks: readonly L2Task[] = prompts.map(([id, prompt]) => ({
  id: `aks-1d-${id}`,
  family: 'U7',
  prompt,
  acceptable: ['picovoxel'],
  oracle: characterOracle,
  reference: unused,
  wrong: unused,
}));

describe.skipIf(!hasLiveCredential(modelId))(
  `AKS-1d stylised characters on PicoVoxel with ${modelId} (set ${liveCredentialName(modelId)} to run)`,
  () => {
    let gateway: LiveGateway;
    let logs: string;
    const verdicts: L2Verdict[] = [];

    beforeAll(async () => {
      gateway = await startLiveGateway();
      logs = await mkdtemp(join(tmpdir(), 'tau-api-live-aks-1d-'));
    });

    afterAll(async () => {
      const passed = verdicts.filter(({ passed: ok }) => ok).length;
      console.log(`[picovoxel-characters] summary ${JSON.stringify({ modelId, passed, of: verdicts.length })}`);
      await gateway.close();
      await rm(logs, { recursive: true, force: true });
    });

    it.each(tasks.map((task) => [task.id, task] as const))('runs %s to a GeoSpec verdict', async (_id, task) => {
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
                kernel: 'picovoxel',
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
        `[picovoxel-characters] metric ${JSON.stringify({
          ...verdict,
          modelId,
          tools: snapshot === undefined ? [] : toolCalls(snapshot.messages).map((call) => call.toolName),
          ...(snapshot === undefined ? {} : runUsage(snapshot)),
        })}`,
      );
      expect(snapshot, 'the turn ran').toBeDefined();
      expectCompleted(snapshot!);
    });
  },
);
