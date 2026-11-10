import { mkdir, mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostRunSnapshot, ToolRegistry } from '@taucad/agent-host';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type { BindingKernelRow } from '#testing/live/kernel-routing.binding.js';
import { kernelRoutingDevelopmentCases, kernelRoutingRoutingCases } from '#testing/live/kernel-routing.cases.js';
import type { KernelRoutingCase } from '#testing/live/kernel-routing.cases.js';
import { gradeKernelRoutingCase, stratumOf, summarizeKernelRoutingRun } from '#testing/live/kernel-routing.grader.js';
import type { KernelRoutingObservation } from '#testing/live/kernel-routing.grader.js';
import {
  buildFixture,
  createRoutingToolHandler,
  kernelTextFor,
  observePromptOnly,
  observeRun,
  perturbedProfile,
  projectReminder,
  promptOnlySystemPrompt,
  withKernelText,
} from '#testing/live/kernel-routing.runner.js';
import type { KernelRoutingArm, RoutingRunResult } from '#testing/live/kernel-routing.runner.js';
import { runUsage, textOf } from '#testing/live/live-assertions.js';
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

/**
 * AKS-S1, the kernel routing spike (blueprint Appendix E). Runs the development corpus through the production CAD
 * prompt and toolbelt on Tau's own gateway, with the per-turn kernel text each arm sends, and writes one JSONL row per
 * case plus a summary against the development thresholds to `TAU_KR_OUT`. The run records; it asserts only that every
 * case produced an observation, because AKS-S1's thresholds decide a design ruling (D1), not a build.
 *
 * Credential: `ANTHROPIC_API_KEY` in `apps/api/.env`, or `TAU_TEST_ANTHROPIC_API_KEY` in a cloud agent session (`vitest.live.config.ts`).
 *
 * Environment:
 * - `TAU_KR_MODELS`: comma-separated catalog ids (default Sonnet 5.5, Opus 5.5 and Haiku 5.5).
 * - `TAU_KR_ARMS`: `in-turn,pointer,template,prompt-only` (default all; the pointer arm runs on Sonnet only).
 * - `TAU_KR_LIMIT`: run only the first N cases of each arm (the 10-case smoke sets the caps).
 * - `TAU_KR_CASES`: comma-separated case ids to run.
 * - `TAU_KR_CONCURRENCY`: parallel turns (default 4). `TAU_KR_MAX_USD`: stop scheduling past this spend.
 * - `TAU_KR_OUT`: output directory (default `<tmpdir>/tau-kernel-routing-runs/<time>`).
 */

const gateModel = 'anthropic-claude-sonnet-5.5';
const models = (process.env['TAU_KR_MODELS'] ?? `${gateModel},anthropic-claude-opus-5.5,anthropic-claude-haiku-5.5`)
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const arms = (process.env['TAU_KR_ARMS'] ?? 'in-turn,pointer,template,prompt-only')
  .split(',')
  .map((arm) => arm.trim())
  .filter(Boolean) as KernelRoutingArm[];
const limit = Number(process.env['TAU_KR_LIMIT'] ?? '0');
const onlyCases = new Set((process.env['TAU_KR_CASES'] ?? '').split(',').filter(Boolean));
const concurrency = Math.max(1, Number(process.env['TAU_KR_CONCURRENCY'] ?? '4'));
const maxUsd = Number(process.env['TAU_KR_MAX_USD'] ?? 'Infinity');
/** Milliseconds. */
const caseTimeout = Number(process.env['TAU_KR_CASE_TIMEOUT_MS'] ?? '360000');
const outDirectory = resolve(
  process.env['TAU_KR_OUT'] ?? join(tmpdir(), 'tau-kernel-routing-runs', new Date().toISOString()),
);

/** Twenty routing cases spread over the families, for the pointer subset. */
const pointerCases = kernelRoutingRoutingCases.filter((_, index) => index % 5 < 2);
/** The routing cases replicad cannot serve: the fallback-template arm. */
const templateCases = kernelRoutingRoutingCases.filter((testCase) => stratumOf(testCase) === 'N');
/** Creation-time cases: the prompt-only alternative names a kernel before any project exists. */
const promptOnlyCases = kernelRoutingDevelopmentCases.filter(
  (testCase) => testCase.fixture.kind === 'entry-less' && testCase.preference === 'auto',
);

const casesFor = (arm: KernelRoutingArm): readonly KernelRoutingCase[] => {
  const base =
    arm === 'pointer'
      ? pointerCases
      : arm === 'template'
        ? templateCases
        : arm === 'prompt-only'
          ? promptOnlyCases
          : kernelRoutingDevelopmentCases;
  const selected = onlyCases.size > 0 ? base.filter(({ id }) => onlyCases.has(id)) : base;
  return limit > 0 ? selected.slice(0, limit) : selected;
};

const workspaceRuntimeModule = ['@taucad', 'tau-examples', 'runtime'].join('/');

const loadKernelRows = async (): Promise<readonly BindingKernelRow[]> => {
  const loaded = (await import(workspaceRuntimeModule)) as {
    readonly workspaceRuntime?: AnyRuntimeDefinition;
  };
  if (!loaded.workspaceRuntime) {
    throw new Error(`${workspaceRuntimeModule} exports no workspaceRuntime.`);
  }
  const resolved = await resolveRuntimeDefinition(loaded.workspaceRuntime, undefined);
  return resolved.kernels;
};

type CaseRow = RoutingRunResult & {
  readonly arm: KernelRoutingArm;
  readonly modelId: string;
  readonly pass: boolean;
  readonly reason: string;
  readonly preferredHit?: boolean;
  readonly costUsd: number;
  readonly outputTokens: number;
  readonly steps: number;
  readonly ms: number;
};

const pool = async <T>(items: readonly T[], width: number, work: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T;
      // oxlint-disable-next-line no-await-in-loop -- each lane runs its cases one after another
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => lane()));
};

const emptyRegistry: ToolRegistry = {
  list: () => [],
  invoke: async () => ({
    content: { errorCode: 'NO_TOOLS', message: 'No tools in this call.' },
    isError: true,
  }),
};

const runnable = models.filter((modelId) => hasLiveCredential(modelId));

describe.skipIf(runnable.length === 0)(
  `kernel routing spike AKS-S1 (set ${liveCredentialName(gateModel)} in apps/api/.env to run)`,
  () => {
    let gateway: LiveGateway;
    let root: string;
    let kernels: readonly BindingKernelRow[];
    const spend = { usd: 0 };

    beforeAll(async () => {
      gateway = await startLiveGateway();
      root = await mkdtemp(join(tmpdir(), 'tau-api-live-kernel-routing-'));
      kernels = await loadKernelRows();
      await mkdir(outDirectory, { recursive: true });
    });

    afterAll(async () => {
      await gateway.close();
      await rm(root, { recursive: true, force: true });
    });

    const inTurn = async (testCase: KernelRoutingCase, arm: KernelRoutingArm, modelId: string) => {
      let record: ReturnType<typeof createRoutingToolHandler>['record'] | undefined;
      const snapshot = await runWithRateLimitRetry(async () => {
        const chatId = `kr-${testCase.id}-${Math.random().toString(36).slice(2, 8)}`;
        const project = buildFixture(testCase, arm);
        let stop = (): void => undefined;
        const handler = createRoutingToolHandler({
          project,
          kernels,
          profile: perturbedProfile(testCase),
          stop: () => {
            stop();
          },
        });
        record = handler.record;
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-1`,
          leaderEpoch: `${chatId}-epoch-1`,
          systemPrompt: withKernelText(
            liveCadSystemPrompt({ chatId, modelId, kernel: 'replicad' }),
            kernelTextFor(testCase, arm),
          ),
          model: liveSessionModel(modelId),
          toolRegistry: createLiveToolRegistry({ results: handler.handle }),
          eventLog: await createNodeEventLog({
            filePath: join(root, chatId, 'events.jsonl'),
            access: 'write',
          }),
        });
        // Abort after the tool result is recorded, so the stop costs no further model call.
        stop = () => {
          setTimeout(() => {
            session.abort();
          }, 50);
        };
        const timer = setTimeout(() => {
          session.abort();
        }, caseTimeout);
        try {
          await session.prompt({
            id: `${chatId}-user-1`,
            role: 'user',
            content: `${projectReminder(project)}${testCase.prompt}`,
          });
          return await session.snapshot();
        } finally {
          clearTimeout(timer);
          await session.close();
        }
      });
      if (!record) {
        throw new Error(`No run record for ${testCase.id}.`);
      }
      return {
        result: observeRun({ caseId: testCase.id, record, snapshot }),
        snapshot,
      };
    };

    const promptOnly = async (testCase: KernelRoutingCase, modelId: string) => {
      const snapshot: HostRunSnapshot = await runWithRateLimitRetry(async () => {
        const chatId = `kr-po-${testCase.id}-${Math.random().toString(36).slice(2, 8)}`;
        const session = await createLiveSession({
          gateway,
          chatId,
          runId: `${chatId}-run-1`,
          leaderEpoch: `${chatId}-epoch-1`,
          systemPrompt: promptOnlySystemPrompt(testCase),
          model: liveSessionModel(modelId),
          toolRegistry: emptyRegistry,
          eventLog: await createNodeEventLog({
            filePath: join(root, chatId, 'events.jsonl'),
            access: 'write',
          }),
        });
        try {
          await session.prompt({
            id: `${chatId}-user-1`,
            role: 'user',
            content: testCase.prompt,
          });
          return await session.snapshot();
        } finally {
          await session.close();
        }
      });
      const text = snapshot.messages
        .filter((message) => message.role === 'assistant')
        .map((message) => textOf(message))
        .join('\n');
      const observation = observePromptOnly(testCase.id, text);
      const result: RoutingRunResult = {
        observation,
        askedInText: observation.asked,
        finalText: text,
        tools: [],
        state: snapshot.state,
        ...(snapshot.failure === undefined ? {} : { failure: JSON.stringify(snapshot.failure) }),
      };
      return { result, snapshot };
    };

    for (const modelId of runnable) {
      for (const arm of arms) {
        if (arm === 'pointer' && modelId !== gateModel) {
          continue;
        }
        const cases = casesFor(arm);
        it(`${arm} on ${modelId} (${cases.length} cases)`, { timeout: 0 }, async () => {
          const file = join(outDirectory, `${arm}.${modelId}.jsonl`);
          await writeFile(file, '');
          const rows: CaseRow[] = [];
          const skipped: string[] = [];
          await pool(cases, arm === 'prompt-only' ? concurrency * 2 : concurrency, async (testCase) => {
            if (spend.usd >= maxUsd) {
              skipped.push(testCase.id);
              return;
            }
            const started = Date.now();
            const { result, snapshot } =
              arm === 'prompt-only' ? await promptOnly(testCase, modelId) : await inTurn(testCase, arm, modelId);
            const usage = runUsage(snapshot);
            spend.usd += usage.costUsd;
            const grade = gradeKernelRoutingCase(testCase, result.observation);
            const row: CaseRow = {
              ...result,
              arm,
              modelId,
              pass: grade.pass,
              reason: grade.reason,
              ...(grade.preferredHit === undefined ? {} : { preferredHit: grade.preferredHit }),
              costUsd: usage.costUsd,
              outputTokens: usage.outputTokens,
              steps: usage.steps,
              ms: Date.now() - started,
            };
            rows.push(row);
            await appendFile(file, `${JSON.stringify(row)}\n`);
            console.log(
              `[kernel-routing] ${arm} ${modelId} ${testCase.id}: ${grade.pass ? 'pass' : 'FAIL'} (${grade.reason}) $${usage.costUsd.toFixed(3)} ${Math.round(row.ms / 1000)}s`,
            );
          });
          const covered = cases.filter(({ id }) =>
            // A run the provider failed before any write is an infrastructure miss, listed in failedRuns, not a grade.
            rows.some(
              (row) => row.observation.caseId === id && (row.state !== 'failed' || row.bindingKind !== undefined),
            ),
          );
          const observations: KernelRoutingObservation[] = covered.map(
            ({ id }) => rows.find((row) => row.observation.caseId === id)!.observation,
          );
          const durations = rows.map(({ ms }) => ms).sort((left, right) => left - right);
          const summary = {
            arm,
            modelId,
            cases: cases.length,
            run: rows.length,
            skipped,
            passed: rows.filter(({ pass }) => pass).length,
            costUsd: rows.reduce((total, { costUsd }) => total + costUsd, 0),
            p50Duration: durations[Math.floor(durations.length / 2)] ?? 0,
            p95Duration: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0,
            failedRuns: rows
              .filter(({ state }) => state === 'failed')
              .map(({ observation, failure }) => ({
                caseId: observation.caseId,
                failure,
              })),
            ...summarizeKernelRoutingRun(covered, observations),
          };
          await writeFile(
            join(outDirectory, `${arm}.${modelId}.summary.json`),
            `${JSON.stringify(summary, undefined, 2)}\n`,
          );
          console.log(`[kernel-routing] summary ${JSON.stringify(summary)}`);
          expect(rows.length + skipped.length).toBe(cases.length);
        });
      }
    }
  },
);
