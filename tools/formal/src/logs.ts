import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Outcome } from '#expected.js';
import { describeOutcome } from '#expected.js';
import { sanitizeLog } from '#sanitize.js';
import { runTlcCase } from '#tlc.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory, locateTools, missingTools } from '#toolchain.js';

/** Validates one sanitized log, with `waived` rules unchecked; the default runs `ChatLog.tla` through TLC. */
export type LogValidator = (
  sanitized: string,
  waived?: readonly string[],
) => Promise<{ readonly outcome: Outcome; readonly seconds: number }>;

export type LogVerdict = {
  readonly accepted: boolean;
  readonly verdict: string;
  /** Set when the log is rejected only by listed known-defect rules: it passes, and names them. */
  readonly knownDefect?: string;
  readonly seconds: number;
};

/** A rule a captured log may break until the named work package lands (FM-R3 lifecycle, as for configs). */
export type KnownLogDefect = {
  readonly rule: string;
  readonly kind: 'defect';
  readonly fixedBy: string;
  readonly ref?: string;
};

export type LogsOptions = {
  /** The Nx project whose captured logs are validated, e.g. `ui-e2e`. */
  readonly project: string;
  readonly validate?: LogValidator;
  readonly tools?: LocatedTools;
  readonly log?: (line: string) => void;
};

export const capturedLogDirectory = (context: FormalContext, project: string): string =>
  path.join(context.root, 'out/test-results/chat-logs', project);

export const verdictsFile = (context: FormalContext, project: string): string =>
  path.join(context.root, 'out/reports/formal/logs', project, 'verdicts.json');

const chatLogSpecs = (context: FormalContext): string => path.join(context.root, 'packages/agent-host/specs');

/** Per project, the rules a captured log may break today, each a known defect a named work package fixes. */
export const knownLogDefectsFile = (context: FormalContext): string =>
  path.join(chatLogSpecs(context), 'known-log-defects.json');

const knownLogDefects = (context: FormalContext, project: string): readonly KnownLogDefect[] => {
  const file = knownLogDefectsFile(context);
  if (!existsSync(file)) {
    return [];
  }
  const registry = JSON.parse(readFileSync(file, 'utf8')) as Readonly<Record<string, readonly KnownLogDefect[]>>;
  return registry[project] ?? [];
};

/** The listed defects a rejection is made of, or `undefined` when any of its rules is not listed. */
const knownDefectsOf = (
  outcome: Outcome,
  defects: readonly KnownLogDefect[],
): readonly KnownLogDefect[] | undefined => {
  if (typeof outcome === 'string' || !('rejected' in outcome) || outcome.rejected.rules.length === 0) {
    return undefined;
  }
  const matched = outcome.rejected.rules.map((rule) => defects.find((defect) => defect.rule === rule));
  return matched.every((defect) => defect !== undefined) ? matched : undefined;
};

const tlcValidator =
  (context: FormalContext, tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>): LogValidator =>
  async (sanitized, waived = []) => {
    const { outcome, result } = await runTlcCase(context, {
      tools,
      directory: chatLogSpecs(context),
      module: 'ChatLog.tla',
      config: 'ChatLog.validate.cfg',
      env: { ...context.env, ...Object.fromEntries(waived.map((rule) => [`FORMAL_WAIVE_${rule}`, '1'])) },
      timeoutSeconds: 300,
      traceFile: sanitized,
    });
    return { outcome, seconds: result.seconds };
  };

/**
 * `formal logs <project>`: sanitize (FM-R8) and validate every captured `events.jsonl` copy under
 * `out/test-results/chat-logs/<project>/` against `ChatLog.tla`, and write `verdicts.json` naming each.
 * Any prefix of a legal log is legal, so a retried or failed test's partial log still passes.
 */
export const validateCapturedLogs = async (context: FormalContext, options: LogsOptions): Promise<number> => {
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const directory = capturedLogDirectory(context, options.project);
  const files = existsSync(directory)
    ? readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((entry) => entry.endsWith('.jsonl'))
        .sort()
    : [];
  // Under CI the suites ran just before this step, so an empty capture means the hook broke,
  // and a gate that passes on nothing would hide it.
  if (files.length === 0 && context.env['CI']) {
    log(
      `FAIL ${options.project}:formal:logs: captured no chat log under ${path.relative(context.root, directory)}; check the suites' capture hook`,
    );
    return 1;
  }
  const tools = options.tools ?? locateTools(context);
  const skipped =
    options.validate !== undefined || files.length === 0
      ? undefined
      : missingTools(context, { tools, needed: ['java', 'tlc'], target: `${options.project}:formal:logs` }, log);
  if (skipped !== undefined) {
    return skipped;
  }
  const validate =
    options.validate ??
    (tools.java && tools.tlc ? tlcValidator(context, { java: tools.java, tlc: tools.tlc }) : undefined);
  if (!validate && files.length > 0) {
    return 1;
  }
  const verdicts: Record<string, LogVerdict> = {};
  const defects = knownLogDefects(context, options.project);
  const occurred = new Set<string>();
  await Promise.all(
    files.map(async (file) => {
      const sanitized = path.join(cacheDirectory(context), 'captured', options.project, file);
      sanitizeLog(path.join(directory, file), sanitized);
      if (!validate) {
        return;
      }
      const first = await validate(sanitized);
      let { outcome, seconds } = first;
      /* TLC stops at the first rejected row, so a rejection made only of listed defect rules is rerun with those rules
       * waived; the log is accepted only if a rerun passes to the end. Each rerun waives at least one more rule. */
      const waived: string[] = [];
      let known = knownDefectsOf(outcome, defects);
      while (known?.some((defect) => !waived.includes(defect.rule))) {
        waived.push(...known.map((defect) => defect.rule).filter((rule) => !waived.includes(rule)));
        // oxlint-disable-next-line no-await-in-loop -- each rerun depends on the last one's rejection.
        const rerun = await validate(sanitized, waived);
        ({ outcome } = rerun);
        seconds += rerun.seconds;
        known = knownDefectsOf(outcome, defects);
      }
      const accepted = outcome === 'pass';
      const knownDefect =
        accepted && waived.length > 0
          ? defects
              .filter((defect) => waived.includes(defect.rule))
              .map((defect) => `${defect.rule} (fixed by ${defect.fixedBy})`)
              .join(', ')
          : undefined;
      if (knownDefect !== undefined) {
        for (const rule of waived) {
          occurred.add(rule);
        }
      }
      const verdict =
        waived.length === 0 || accepted
          ? describeOutcome(first.outcome)
          : `${describeOutcome(outcome)} (with ${waived.join(', ')} waived)`;
      verdicts[file] = {
        accepted,
        verdict,
        ...(knownDefect === undefined ? {} : { knownDefect }),
        seconds: Math.round(seconds * 100) / 100,
      };
      log(
        `${accepted ? 'ok  ' : 'FAIL'} ${options.project}/${file}: ${verdict}${knownDefect ? `; known defect ${knownDefect}` : ''}`,
      );
    }),
  );
  const output = verdictsFile(context, options.project);
  mkdirSync(path.dirname(output), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(verdicts).sort(([left], [right]) => left.localeCompare(right)));
  writeFileSync(output, `${JSON.stringify(sorted, undefined, 2)}\n`);
  const rejected = Object.values(verdicts).filter((verdict) => !verdict.accepted).length;
  const knownCount = Object.values(verdicts).filter((verdict) => verdict.knownDefect !== undefined).length;
  // A listed defect no captured log shows any more is fixed or unexercised: its entry must flip, as a config's would.
  const vanished = files.length === 0 ? [] : defects.filter((defect) => !occurred.has(defect.rule));
  for (const defect of vanished) {
    log(
      `FAIL ${options.project}:formal:logs: the known defect ${defect.rule} no longer occurs (${defect.fixedBy} landed?); flip its entry in ${path.relative(context.root, knownLogDefectsFile(context))}`,
    );
  }
  log(
    `${options.project}:formal:logs: ${files.length} logs, ${rejected} rejected, ${knownCount} known defect${knownCount === 1 ? '' : 's'}; ${path.relative(context.root, output)}`,
  );
  return rejected === 0 && vanished.length === 0 ? 0 : 1;
};
