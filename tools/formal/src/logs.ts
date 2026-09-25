import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Outcome } from '#expected.js';
import { describeOutcome } from '#expected.js';
import { sanitizeLog } from '#sanitize.js';
import { runTlcCase } from '#tlc.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory, locateTools, missingTools } from '#toolchain.js';

/** Validates one sanitized log; the default runs `ChatLog.tla` through TLC. */
export type LogValidator = (sanitized: string) => Promise<{ readonly outcome: Outcome; readonly seconds: number }>;

export type LogVerdict = { readonly accepted: boolean; readonly verdict: string; readonly seconds: number };

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

const tlcValidator =
  (context: FormalContext, tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>): LogValidator =>
  async (sanitized) => {
    const { outcome, result } = await runTlcCase(context, {
      tools,
      directory: chatLogSpecs(context),
      module: 'ChatLog.tla',
      config: 'ChatLog.validate.cfg',
      env: context.env,
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
  await Promise.all(
    files.map(async (file) => {
      const sanitized = path.join(cacheDirectory(context), 'captured', options.project, file);
      sanitizeLog(path.join(directory, file), sanitized);
      const { outcome, seconds } = validate
        ? await validate(sanitized)
        : { outcome: { error: 'no validator' }, seconds: 0 };
      verdicts[file] = {
        accepted: outcome === 'pass',
        verdict: describeOutcome(outcome),
        seconds: Math.round(seconds * 100) / 100,
      };
      log(`${outcome === 'pass' ? 'ok  ' : 'FAIL'} ${options.project}/${file}: ${describeOutcome(outcome)}`);
    }),
  );
  const output = verdictsFile(context, options.project);
  mkdirSync(path.dirname(output), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(verdicts).sort(([left], [right]) => left.localeCompare(right)));
  writeFileSync(output, `${JSON.stringify(sorted, undefined, 2)}\n`);
  const rejected = Object.values(verdicts).filter((verdict) => !verdict.accepted).length;
  log(
    `${options.project}:formal:logs: ${files.length} logs, ${rejected} rejected; ${path.relative(context.root, output)}`,
  );
  return rejected === 0 ? 0 : 1;
};
