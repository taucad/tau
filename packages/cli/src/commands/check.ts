/**
 * `tau check` — evaluate a model without exporting it (charter D29, spike S11).
 *
 * The verb CI and scripts lack: `tau export` without the artifact. It loads the CLI runtime exactly as `export` does,
 * opens the document once and stops at `document.evaluation()`. Parameters come from the `described` event, because
 * an evaluation carries none. The project is rooted at the nearest `tau.json`, so a model that imports a sibling
 * module above its own folder resolves (S11 F2). Native kernels are composed from the payload store's receipts and
 * nothing is downloaded (I5): an unprepared `.py` or `.cs` model is refused with `KERNEL_NOT_PREPARED` naming
 * `tau prepare <kernel>`.
 *
 * Exit codes: 0 the model evaluates, 1 the model fails, 2 an unusable request, 3 the runtime declined it (no kernel,
 * not prepared, unsupported target).
 *
 * @module
 */
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { createNodeClient } from '@taucad/runtime/node';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { defineCommand } from 'citty';

import { parseJsonObject } from '#commands/export.js';
import { composeNativeKernels } from '#native-kernels.js';
import { cliError, createOutput, emit, exitCodes, sanitize } from '#output.js';
import { loadCliRuntime } from '#runtime-options.js';
import { authorizeCliZooProxy, cliZooProxyUrl } from '#zoo-proxy.js';

/** Issue codes for a well-formed request the runtime declined, as `tau export` classifies them. */
const refusedCodes = new Set(['KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING', 'KERNEL_NOT_PREPARED']);

/** Milliseconds one evaluation may take before `check` gives up on it. */
const evaluationTimeout = 600_000;

/** What the document's `described` event reports, as `check` reads it. */
type DescribedModel = Readonly<{
  success: boolean;
  kernelId: string | undefined;
  issues: readonly KernelIssue[];
  parameters?: unknown;
}>;

/** One issue as the `check` record carries it. */
export type CheckIssue = Readonly<{ code: string; severity: string; message: string }>;

/** What `tau check --json` prints: the same shape MCP `evaluate_model` answers. */
export type CheckRecord = Readonly<{
  kind: 'evaluation';
  ok: boolean;
  status: 'ok' | 'error' | 'refused';
  input: string;
  project: string;
  kernel: string | undefined;
  issues: readonly CheckIssue[];
  parameters: unknown;
  views: readonly string[];
  exports: readonly string[];
}>;

/**
 * The project a model belongs to: the nearest folder at or above it holding a `tau.json`, else the model's own folder.
 *
 * @internal
 * @param inputPath - Absolute path of the model.
 * @returns The absolute project root.
 */
export const projectRootOf = (inputPath: string): string => {
  for (let current = dirname(inputPath); ; current = dirname(current)) {
    if (existsSync(resolve(current, 'tau.json'))) {
      return current;
    }
    if (dirname(current) === current) {
      return dirname(inputPath);
    }
  }
};

/**
 * Classify one evaluation's issues into the `check` status.
 *
 * @internal
 * @param success - Whether the evaluation succeeded.
 * @param issues - Every issue the description and evaluation reported.
 * @returns `ok` with no error issue, `refused` when the runtime declined, otherwise `error`.
 */
export const checkStatus = (success: boolean, issues: readonly KernelIssue[]): CheckRecord['status'] => {
  if (success && !issues.some((issue) => issue.severity === 'error')) {
    return 'ok';
  }
  return issues.some((issue) => refusedCodes.has(issue.code)) ? 'refused' : 'error';
};

const exitFor: Readonly<Record<CheckRecord['status'], number>> = {
  ok: exitCodes.ok,
  error: exitCodes.error,
  refused: exitCodes.refused,
};

/**
 * `tau check` command.
 *
 * @example <caption>Check a model in CI</caption>
 * ```bash
 * tau check main.ts
 * tau check main.ts --params='{"width":40}' --json
 * ```
 */
export const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description: 'Evaluate a CAD file without exporting it; exit 0 ok, 1 model error, 3 refused',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Input CAD file path (e.g. main.ts)',
      required: true,
    },
    params: {
      type: 'string',
      description: 'JSON-encoded parameters for the model (e.g. \'{"width":100}\')',
      required: false,
    },
    project: {
      type: 'string',
      description: 'Project root the model resolves imports from (defaults to the nearest folder with a tau.json)',
      required: false,
    },
    plugin: {
      type: 'string',
      description: 'Default-invoked plugin package or path installed in the invoking project (repeatable)',
      required: false,
      multiple: true,
    },
    config: {
      type: 'string',
      description: 'Configuration module exporting an invoked "plugins" array',
      required: false,
    },
    json: {
      type: 'boolean',
      description: 'Write one versioned JSON evaluation record to stdout',
      required: false,
    },
  },
  async run({ args }) {
    const output = await createOutput();
    const parameters = parseJsonObject('--params', args.params) ?? {};
    const inputPath = resolve(args.file);
    try {
      await stat(inputPath);
    } catch {
      throw cliError(
        'INPUT_NOT_FOUND',
        `Input file not found: ${inputPath}. Check the path, or run the command from the project that contains it.`,
        exitCodes.refused,
      );
    }
    const projectRoot = args.project === undefined ? projectRootOf(inputPath) : resolve(args.project);
    const sourcePath = relative(projectRoot, inputPath);
    if (sourcePath.startsWith('..') || resolve(projectRoot, sourcePath) !== inputPath) {
      throw cliError('INPUT_OUTSIDE_PROJECT', `${inputPath} is outside the project ${projectRoot}.`, exitCodes.usage);
    }

    // The native kernels from the payload store's receipts; nothing is downloaded.
    const native = await composeNativeKernels();
    authorizeCliZooProxy(process.env);
    const runtime = await loadCliRuntime({
      projectRoot: process.cwd(),
      plugin: args.plugin,
      config: args.config,
      ...(native.build123d === undefined ? {} : { build123d: native.build123d }),
      ...(native.picogk === undefined ? {} : { picogk: native.picogk }),
      unavailableKernels: native.unavailable,
      zooProxyUrl: cliZooProxyUrl(process.env),
    });
    const client = await createNodeClient({ runtime, projectPath: projectRoot });
    client.on('log', (entry) => {
      const level = entry.level as 'info' | 'warn' | 'error' | 'debug';
      if (level in output) {
        output[level](sanitize(entry.message));
      }
    });
    const stopped = new AbortController();
    const onSignal = (signal: NodeJS.Signals): void => {
      stopped.abort(signal);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    const document = client.open({
      source: { path: sourcePath.split(sep).join('/') },
      parameters,
      watch: false,
    });
    let description: DescribedModel | undefined;
    document.on('described', (value) => {
      description = value;
    });
    let record: CheckRecord;
    try {
      const evaluationDeadline = AbortSignal.timeout(evaluationTimeout);
      let outcome: Awaited<ReturnType<typeof document.evaluation>>;
      try {
        outcome = await document.evaluation({ signal: AbortSignal.any([stopped.signal, evaluationDeadline]) });
      } catch (error) {
        if (stopped.signal.aborted) {
          const signal = stopped.signal.reason as NodeJS.Signals;
          throw cliError(
            'CHECK_CANCELLED',
            `Check cancelled by ${signal}`,
            signal === 'SIGINT' ? exitCodes.interrupted : exitCodes.terminated,
          );
        }
        if (evaluationDeadline.aborted) {
          throw cliError(
            'EVALUATION_TIMEOUT',
            `The model did not evaluate within ${String(evaluationTimeout / 1000)} s.`,
            exitCodes.error,
          );
        }
        throw error;
      }
      const evaluation = outcome.superseded ? undefined : outcome.evaluation;
      /* The description's issues come first: an unprepared kernel refuses there, before evaluating. */
      const seen = new Set<string>();
      const issues = [...(description?.issues ?? []), ...(evaluation?.issues ?? [])].filter((issue) => {
        const key = `${issue.code}\u0000${issue.message}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      const status = checkStatus(evaluation?.success === true, issues);
      record = {
        kind: 'evaluation',
        ok: status === 'ok',
        status,
        input: inputPath,
        project: projectRoot,
        kernel: description?.kernelId,
        issues: issues.map(({ code, severity, message }) => ({ code, severity, message: sanitize(message) })),
        parameters: description?.success === true ? description.parameters : undefined,
        views: evaluation?.success === true ? evaluation.views.map((view) => view.id) : [],
        exports: evaluation?.success === true ? evaluation.exports.map((offer) => offer.id) : [],
      };
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      try {
        document.close();
      } finally {
        await client.shutdown();
      }
    }

    if (args.json) {
      await emit(record);
    }
    if (record.status === 'ok') {
      for (const issue of record.issues) {
        output.warn(issue.message);
      }
      output.success(
        `${relative(process.cwd(), inputPath) || inputPath} evaluates${record.kernel === undefined ? '' : ` (${record.kernel})`}`,
      );
      return;
    }
    /* Exactly one record on stdout: the evaluation is the result, a refusal included, so the failure is reported
     * here rather than thrown, which would add bin.ts's outcome record after it. */
    const messages = record.issues.map((issue) => issue.message).join('\n  ') || 'the model did not evaluate';
    process.stderr.write(`Check ${record.status === 'refused' ? 'refused' : 'failed'}:\n  ${messages}\n`);
    process.exitCode = exitFor[record.status];
  },
});
