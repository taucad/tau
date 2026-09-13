import type { UIMessage, UIMessageChunk } from 'ai';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { extractUsageData } from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import type { ModelBenchmarkCase, FlatModel, ModelRunOutcome, GraderCheck } from '#benchmarks/model-benchmark-suite.js';
import { createGeometryRenderer, validateGeometry } from '#benchmarks/model-benchmark-geometry.js';
import type { GeometryValidationResult } from '#benchmarks/model-benchmark-geometry.js';

// =============================================================================
// Types
// =============================================================================

export type TranscriptSummary = {
  stepCount: number;
  textContent: string;
  reasoningContent?: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    state: string;
    output?: string;
  }>;
  errors: string[];
  chunkTypeSequence: string[];
};

export type ModelBenchmarkResult = {
  modelId: string;
  modelName: string;
  provider: string;
  caseName: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  score: number;
  checks: GraderCheck[];
  error?: string;
  durationMs: number;
  timeToFirstToken?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  cost?: {
    inputTokensCost: number;
    outputTokensCost: number;
    totalCost: number;
  };
  toolCalls: string[];
  fileCreated: boolean;
  filesCreated: Record<string, string>;
  transcript: {
    summary: TranscriptSummary;
  };
  geometryValidation?: GeometryValidationResult;
  glbData?: Uint8Array<ArrayBuffer>;
};

export type ModelBenchmarkRunResult = {
  timestamp: string;
  results: ModelBenchmarkResult[];
  totalDurationMs: number;
  totalCost: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errored: number;
    meanScore: number;
  };
  geometrySummary?: {
    attempted: number;
    rendered: number;
    renderFailed: number;
    geometryPassed: number;
    geometryFailed: number;
  };
};

export type ProgressInfo = {
  current: number;
  total: number;
  model: string;
  caseName: string;
};

export type ProgressCallback = (info: ProgressInfo) => void;

export type GeometryProgressInfo = {
  current: number;
  total: number;
  modelId: string;
  caseName: string;
};

export type RunOptions = {
  onProgress?: ProgressCallback;
  onGeometryProgress?: (info: GeometryProgressInfo) => void;
  /** Per-benchmark request timeout. Milliseconds. */
  benchmarkTimeout?: number;
  concurrency?: number;
  skipGeometry?: boolean;
};

// =============================================================================
// Helpers
// =============================================================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '…';
}

type ExtractedToolCall = {
  name: string;
  args: Record<string, unknown>;
  output?: string;
};

/**
 * Extracts tool calls from the raw SSE chunks.
 * Static tool parts in reconstructed messages lose their args/input data,
 * so we parse directly from `tool-input-available` and `tool-output-available` chunks.
 */
function extractToolCallsFromChunks(chunks: UIMessageChunk[]): ExtractedToolCall[] {
  const toolCallMap = new Map<string, ExtractedToolCall>();

  for (const chunk of chunks) {
    if (chunk.type === 'tool-input-available' && 'toolCallId' in chunk && 'toolName' in chunk) {
      const id = String(chunk.toolCallId);
      const rawChunk = chunk as Record<string, unknown>;
      const rawInput = rawChunk['input'] ?? rawChunk['args'] ?? {};
      const args = rawInput as Record<string, unknown>;
      toolCallMap.set(id, { name: String(chunk.toolName), args });
    }

    if (chunk.type === 'tool-output-available' && 'toolCallId' in chunk) {
      const id = String(chunk.toolCallId);
      const existing = toolCallMap.get(id);
      if (existing && 'output' in chunk && chunk.output !== undefined) {
        existing.output = truncate(JSON.stringify(chunk.output), 500);
      }
    }
  }

  return [...toolCallMap.values()];
}

function buildTranscriptSummary(chunks: UIMessageChunk[], message: UIMessage): TranscriptSummary {
  const chunkTypeSequence = chunks.map((c) => c.type);

  const textParts = message.parts.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text');
  const textContent = textParts.map((p) => p.text).join('\n');

  const reasoningParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: 'reasoning' }> => p.type === 'reasoning',
  );
  const reasoningContent = reasoningParts.length > 0 ? reasoningParts.map((p) => p.text).join('\n') : undefined;

  const toolCalls = extractToolCallsFromChunks(chunks).map((tc) => ({
    name: tc.name,
    args: tc.args,
    state: 'completed',
    output: tc.output,
  }));

  const errors: string[] = [];
  for (const chunk of chunks) {
    if (chunk.type === 'error' && 'errorText' in chunk && typeof chunk.errorText === 'string') {
      errors.push(chunk.errorText);
    }
  }

  const finishSteps = chunks.filter((c) => c.type === 'finish-step');

  return { stepCount: finishSteps.length, textContent, reasoningContent, toolCalls, errors, chunkTypeSequence };
}

function extractOutcome(chunks: UIMessageChunk[]): ModelRunOutcome {
  const toolCalls = extractToolCallsFromChunks(chunks);

  const filesCreated: Record<string, string> = {};
  for (const tc of toolCalls) {
    if (
      tc.name === 'create_file' &&
      typeof tc.args['targetFile'] === 'string' &&
      typeof tc.args['content'] === 'string'
    ) {
      filesCreated[tc.args['targetFile']] = tc.args['content'];
    }
  }

  const errorChunks = chunks.filter((c) => c.type === 'error');
  const error =
    errorChunks.length > 0
      ? errorChunks
          .map((c) => ('errorText' in c && typeof c.errorText === 'string' ? c.errorText : JSON.stringify(c)))
          .join('; ')
      : undefined;

  return { toolCalls, filesCreated, error };
}

function computeUsage(chunks: UIMessageChunk[]): ModelBenchmarkResult['usage'] | undefined {
  const usageData = extractUsageData(chunks);
  if (usageData.length === 0) {
    return undefined;
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;

  for (const u of usageData) {
    inputTokens += Number(u['inputTokens']) || 0;
    outputTokens += Number(u['outputTokens']) || 0;
    reasoningTokens += Number(u['reasoningTokens']) || 0;
    cacheReadTokens += Number(u['cacheReadTokens']) || 0;
    cacheWriteTokens += Number(u['cacheWriteTokens']) || 0;
  }

  return { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens };
}

function computeCost(usage: ModelBenchmarkResult['usage'], model: FlatModel): ModelBenchmarkResult['cost'] | undefined {
  if (!usage) {
    return undefined;
  }
  const { cost } = model.details;
  const inputTokensCost = (usage.inputTokens / 1_000_000) * cost.inputTokens;
  const outputTokensCost = (usage.outputTokens / 1_000_000) * cost.outputTokens;
  const totalCost = inputTokensCost + outputTokensCost;
  return { inputTokensCost, outputTokensCost, totalCost };
}

function makeEmptyTranscript(): TranscriptSummary {
  return { stepCount: 0, textContent: '', toolCalls: [], errors: [], chunkTypeSequence: [] };
}

type ErrorResultOptions = {
  model: FlatModel;
  benchmarkCase: ModelBenchmarkCase;
  errorMessage: string;
  durationMs: number;
};

function makeErrorResult({ model, benchmarkCase, errorMessage, durationMs }: ErrorResultOptions): ModelBenchmarkResult {
  return {
    modelId: model.id,
    modelName: model.name,
    provider: model.providerId,
    caseName: benchmarkCase.name,
    category: benchmarkCase.category,
    status: 'error',
    score: 0,
    checks: [],
    error: errorMessage,
    durationMs,
    toolCalls: [],
    fileCreated: false,
    filesCreated: {},
    transcript: { summary: { ...makeEmptyTranscript(), errors: [errorMessage] } },
  };
}

// =============================================================================
// Runner
// =============================================================================

type SingleBenchmarkOptions = {
  testApp: TestApp;
  model: FlatModel;
  benchmarkCase: ModelBenchmarkCase;
  /** Milliseconds. */
  benchmarkTimeout: number;
};

async function runSingleBenchmark({
  testApp,
  model,
  benchmarkCase,
  benchmarkTimeout,
}: SingleBenchmarkOptions): Promise<ModelBenchmarkResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `benchmark-${model.id}-${benchmarkCase.name}-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [{ type: 'text', text: benchmarkCase.prompt }],
            metadata: { createdAt: Date.now() },
          },
        ],
        agent: {
          profile: 'cad',
          model: model.id,
          kernel: 'openscad',
          mode: 'agent',
          toolChoice: 'auto',
          testingEnabled: true,
        },
      }),
      signal: AbortSignal.timeout(benchmarkTimeout),
    });

    if (!response.ok) {
      return makeErrorResult({
        model,
        benchmarkCase,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
        durationMs: Date.now() - startTime,
      });
    }

    const chunks = await collectStreamChunks(response);

    let message: UIMessage;
    try {
      message = await collectFinalMessage(chunks);
    } catch {
      const chunkTypes = chunks.map((c) => c.type);
      const errorChunks = chunks.filter((c) => c.type === 'error');
      const errorDetails = errorChunks
        .map((c) => ('errorText' in c && typeof c.errorText === 'string' ? c.errorText : JSON.stringify(c)))
        .join('; ');

      const diagnostic = errorDetails
        ? `Stream error: ${errorDetails}`
        : chunks.length === 0
          ? 'Empty response stream (0 chunks received)'
          : `No message from ${chunks.length} chunks [${[...new Set(chunkTypes)].join(', ')}]`;

      return makeErrorResult({ model, benchmarkCase, errorMessage: diagnostic, durationMs: Date.now() - startTime });
    }

    const outcome = extractOutcome(chunks);
    const graderResult = benchmarkCase.grader(outcome);
    const usage = computeUsage(chunks);
    const cost = computeCost(usage, model);
    const summary = buildTranscriptSummary(chunks, message);
    const durationMs = Date.now() - startTime;

    return {
      modelId: model.id,
      modelName: model.name,
      provider: model.providerId,
      caseName: benchmarkCase.name,
      category: benchmarkCase.category,
      status: graderResult.passed ? 'passed' : 'failed',
      score: graderResult.score,
      checks: graderResult.checks,
      error: outcome.error,
      durationMs,
      usage,
      cost,
      toolCalls: outcome.toolCalls.map((tc) => tc.name),
      fileCreated: Object.keys(outcome.filesCreated).length > 0,
      filesCreated: outcome.filesCreated,
      transcript: { summary },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return makeErrorResult({ model, benchmarkCase, errorMessage, durationMs });
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Generic type parameter convention
async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  handler: (item: TItem) => Promise<TResult>,
  limit: number,
): Promise<TResult[]> {
  const results: TResult[] = [];
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      if (item !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential execution is intentional for concurrency-limited pool
        results[currentIndex] = await handler(item);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function runGeometryPhase(
  results: ModelBenchmarkResult[],
  caseMap: Map<string, ModelBenchmarkCase>,
  options?: RunOptions,
): Promise<ModelBenchmarkRunResult['geometrySummary']> {
  const geometryTargets = results.filter((r) => {
    if (r.status === 'skipped' || r.status === 'error') {
      return false;
    }
    const benchmarkCase = caseMap.get(r.caseName);
    return benchmarkCase?.geometryExpectations && findMainFile(r.filesCreated);
  });

  if (geometryTargets.length === 0) {
    return undefined;
  }

  const client = createGeometryRenderer();
  let attempted = 0;
  let rendered = 0;
  let renderFailed = 0;
  let geometryPassed = 0;
  let geometryFailed = 0;

  try {
    for (const result of geometryTargets) {
      attempted++;
      options?.onGeometryProgress?.({
        current: attempted,
        total: geometryTargets.length,
        modelId: result.modelId,
        caseName: result.caseName,
      });

      const benchmarkCase = caseMap.get(result.caseName)!;
      const mainFile = findMainFile(result.filesCreated)!;
      // oxlint-disable-next-line no-await-in-loop -- Sequential geometry validation with shared runtime client
      const validation = await validateGeometry({
        client,
        files: result.filesCreated,
        mainFile,
        expectations: benchmarkCase.geometryExpectations!,
      });

      applyGeometryResult(result, validation);

      rendered += validation.renderSuccess ? 1 : 0;
      renderFailed += validation.renderSuccess ? 0 : 1;

      const allPassed = validation.checks.every((c) => c.passed);
      geometryPassed += allPassed ? 1 : 0;
      geometryFailed += allPassed ? 0 : 1;
    }
  } finally {
    client.terminate();
  }

  return { attempted, rendered, renderFailed, geometryPassed, geometryFailed };
}

export type BenchmarkRunInput = {
  models: FlatModel[];
  cases: ModelBenchmarkCase[];
  skippedModels: FlatModel[];
  options?: RunOptions;
};

export async function runModelBenchmarks({
  models,
  cases,
  skippedModels,
  options,
}: BenchmarkRunInput): Promise<ModelBenchmarkRunResult> {
  const benchmarkTimeout = options?.benchmarkTimeout ?? 180_000;
  const concurrency = options?.concurrency ?? Infinity;
  const skipGeometry = options?.skipGeometry ?? false;
  const runStart = Date.now();
  const results: ModelBenchmarkResult[] = [];

  const testApp = await createTestApp();

  try {
    for (const skippedModel of skippedModels) {
      for (const benchmarkCase of cases) {
        results.push({
          modelId: skippedModel.id,
          modelName: skippedModel.name,
          provider: skippedModel.providerId,
          caseName: benchmarkCase.name,
          category: benchmarkCase.category,
          status: 'skipped',
          score: 0,
          checks: [],
          error: `API key not available for provider: ${skippedModel.providerId}`,
          durationMs: 0,
          toolCalls: [],
          fileCreated: false,
          filesCreated: {},
          transcript: { summary: makeEmptyTranscript() },
        });
      }
    }

    const tasks: Array<{ model: FlatModel; benchmarkCase: ModelBenchmarkCase }> = [];
    for (const model of models) {
      for (const benchmarkCase of cases) {
        tasks.push({ model, benchmarkCase });
      }
    }

    let completed = 0;
    const totalActive = tasks.length;

    const runTask = async (task: {
      model: FlatModel;
      benchmarkCase: ModelBenchmarkCase;
    }): Promise<ModelBenchmarkResult> => {
      options?.onProgress?.({
        current: completed + 1,
        total: totalActive,
        model: task.model.id,
        caseName: task.benchmarkCase.name,
      });
      const result = await runSingleBenchmark({
        testApp,
        model: task.model,
        benchmarkCase: task.benchmarkCase,
        benchmarkTimeout,
      });
      completed++;
      return result;
    };

    const activeResults: ModelBenchmarkResult[] =
      concurrency === Infinity || concurrency >= totalActive
        ? await Promise.all(tasks.map(async (task) => runTask(task)))
        : await runWithConcurrency(tasks, runTask, concurrency);

    results.push(...activeResults);
  } finally {
    await testApp.app.close();
  }

  // Phase 2: Geometry validation
  const caseMap = new Map(cases.map((c) => [c.name, c]));
  const geometrySummary = skipGeometry ? undefined : await runGeometryPhase(results, caseMap, options);

  const totalDurationMs = Date.now() - runStart;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errored = results.filter((r) => r.status === 'error').length;
  const scoredResults = results.filter((r) => r.status === 'passed' || r.status === 'failed');
  const meanScore =
    scoredResults.length > 0 ? scoredResults.reduce((sum, r) => sum + r.score, 0) / scoredResults.length : 0;
  const totalCost = results.reduce((sum, r) => sum + (r.cost?.totalCost ?? 0), 0);

  return {
    timestamp: new Date().toISOString(),
    results,
    totalDurationMs,
    totalCost,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
      errored,
      meanScore,
    },
    geometrySummary,
  };
}

function applyGeometryResult(result: ModelBenchmarkResult, validation: GeometryValidationResult): void {
  result.geometryValidation = validation;
  result.glbData = validation.glb;

  const allChecks = [...result.checks, ...validation.checks];
  const passedCount = allChecks.filter((c) => c.passed).length;
  const score = allChecks.length > 0 ? passedCount / allChecks.length : 0;

  result.checks = allChecks;
  result.score = score;
  result.status = score >= 0.8 ? 'passed' : 'failed';
}

function findMainFile(filesCreated: Record<string, string>): string | undefined {
  const candidates = ['main.scad', 'main.ts'];
  for (const candidate of candidates) {
    for (const filePath of Object.keys(filesCreated)) {
      if (filePath.replace(/^\//, '') === candidate) {
        return filePath;
      }
    }
  }
  return undefined;
}
