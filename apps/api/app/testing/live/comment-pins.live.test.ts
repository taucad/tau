import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveRepeats,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import {
  benchmarkArms,
  benchmarkComments,
  benchmarkContent,
  createBenchmarkProject,
  gradeBenchmark,
} from '#testing/live/comment-pins.benchmark.js';
import type { BenchmarkArm, BenchmarkGrade } from '#testing/live/comment-pins.benchmark.js';

/*
 * Comment pins benchmark (charter W7): the same three comments sent with pins (picture and annotations block) and as
 * plain text with the same picture. Each run edits a one-file model through scripted tools and is graded by its final
 * parameters. Rows go to `TAU_PINS_OUT` (JSONL) and a table is printed per model.
 *
 * Models: `TAU_PINS_MODELS`, comma separated (default `google-gemini-4-hydrogen`); runs per arm: 1 + `TAU_LIVE_REPEATS`.
 */

const models = (process.env['TAU_PINS_MODELS'] ?? 'google-gemini-4-hydrogen')
  .split(',')
  .map((model) => model.trim())
  .filter((model) => model !== '');
const runnable = models.filter((model) => hasLiveCredential(model));
const runs = 1 + liveRepeats;
/** Milliseconds. */
const runTimeout = 300_000;
const outDirectory = process.env['TAU_PINS_OUT'] ?? join(tmpdir(), 'tau-comment-pins-benchmark');

type Row = Readonly<{ model: string; arm: BenchmarkArm; run: number; state: string; toolCalls: number }> &
  BenchmarkGrade;

describe.skipIf(runnable.length === 0)(
  `comment pins benchmark (set ${models.map((model) => liveCredentialName(model)).join(' or ')} in apps/api/.env to run)`,
  () => {
    let gateway: LiveGateway;
    let root: string;

    beforeAll(async () => {
      gateway = await startLiveGateway();
      root = await mkdtemp(join(tmpdir(), 'tau-pins-live-'));
      await mkdir(outDirectory, { recursive: true });
    });

    afterAll(async () => {
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    });

    const runOnce = async (model: string, arm: BenchmarkArm, run: number): Promise<Row> => {
      let project = createBenchmarkProject();
      const snapshot = await runWithRateLimitRetry(async () => {
        project = createBenchmarkProject();
        const chatId = `pins-${arm}-${run}-${Math.random().toString(36).slice(2, 8)}`;
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-1`,
          leaderEpoch: `${chatId}-epoch-1`,
          systemPrompt: liveCadSystemPrompt({ chatId, modelId: model, kernel: 'replicad' }),
          model: liveSessionModel(model),
          toolRegistry: createLiveToolRegistry({ results: project.handle }),
          eventLog: await createNodeEventLog({ filePath: join(root, chatId, 'events.jsonl'), access: 'write' }),
        });
        const timer = setTimeout(() => {
          session.abort();
        }, runTimeout);
        try {
          await session.prompt({ id: `${chatId}-user-1`, role: 'user', content: benchmarkContent(arm) });
          return await session.snapshot();
        } finally {
          clearTimeout(timer);
          await session.close();
        }
      });
      return {
        model,
        arm,
        run,
        state: snapshot.state,
        toolCalls: project.calls(),
        ...gradeBenchmark(project.source()),
      };
    };

    for (const model of runnable) {
      it(`pins against plain text on ${model} (${runs} runs per arm)`, { timeout: 0 }, async () => {
        const rows: Row[] = [];
        const file = join(outDirectory, `${model}.jsonl`);
        for (let run = 1; run <= runs; run++) {
          for (const arm of benchmarkArms) {
            // oxlint-disable-next-line no-await-in-loop -- runs are serial so a rate limit never skews one arm.
            const row = await runOnce(model, arm, run);
            rows.push(row);
            // oxlint-disable-next-line no-await-in-loop -- one row per line, in run order.
            await appendFile(file, `${JSON.stringify(row)}\n`);
          }
        }
        const summary = benchmarkArms.map((arm) => {
          const armRows = rows.filter((row) => row.arm === arm);
          const done = armRows.reduce((total, row) => total + row.done.length, 0);
          return {
            arm,
            allThree: armRows.filter((row) => row.done.length === benchmarkComments.length).length,
            commentsDone: `${done} of ${armRows.length * benchmarkComments.length}`,
            collateral: armRows.reduce((total, row) => total + row.collateral.length, 0),
            unreadable: armRows.filter((row) => row.unreadable).length,
            runs: armRows.length,
          };
        });
        console.table(summary);
        console.log(`[comment-pins] rows in ${file}`);
        // The charter's acceptance: with three pinned comments the agent edits the three named parts.
        const pins = summary.find((row) => row.arm === 'pins')!;
        expect(pins.allThree / pins.runs, JSON.stringify(rows)).toBeGreaterThanOrEqual(0.8);
      });
    }
  },
);
