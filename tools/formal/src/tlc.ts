import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statfsSync } from 'node:fs';
import path from 'node:path';
import type { Outcome } from '#expected.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory } from '#toolchain.js';

export type JavaRun = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Watchdog in seconds (FM-R15): 300 in the pull-request tier, 900 nightly. */
  readonly timeoutSeconds: number;
};

export type JavaResult = { readonly output: string; readonly seconds: number; readonly killed: boolean };

export type TlcRun = {
  readonly tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>;
  /** Absolute path of the `.tla` module; TLC runs in its directory. */
  readonly module: string;
  readonly config: string;
  readonly metadir: string;
  /** `StateDeque` for trace validation (depth-first), `MemStateQueue` otherwise. */
  readonly queue?: 'MemStateQueue' | 'StateDeque';
  readonly workers?: number;
  readonly extra?: readonly string[];
};

/**
 * TLC as S4 ran it (FM-R6): 1 GB heap, two workers, an in-memory queue, a private metadir and no
 * trace-explorer spec. Never `-cleanup`, which deletes every `./states` directory.
 */
export const tlcCommand = (run: TlcRun): { readonly command: string; readonly args: readonly string[] } => ({
  command: run.tools.java.bin,
  args: [
    '-Xmx1g',
    '-XX:+UseParallelGC',
    `-Dtlc2.tool.queue.IStateQueue=${run.queue ?? 'MemStateQueue'}`,
    '-cp',
    `${run.tools.tlc.jar}${path.delimiter}${run.tools.tlc.community}`,
    'tlc2.TLC',
    '-workers',
    String(run.workers ?? 2),
    '-config',
    run.config,
    '-metadir',
    run.metadir,
    '-noGenerateSpecTE',
    ...(run.extra ?? []),
    path.basename(run.module),
  ],
});

export const sanyCommand = (
  tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>,
  module: string,
): { readonly command: string; readonly args: readonly string[] } => ({
  command: tools.java.bin,
  args: ['-cp', `${tools.tlc.jar}${path.delimiter}${tools.tlc.community}`, 'tla2sany.SANY', path.basename(module)],
});

const lastStateBlock = (output: string): string => {
  const index = output.lastIndexOf('\nState ');
  return index === -1 ? '' : output.slice(index);
};

/** Reads TLC's text; the exit code alone never decides a verdict (FM-R6). */
export const parseTlcOutput = (output: string): Outcome => {
  const property = /Error: (?:Invariant|Temporal property|Action property) (\S+) (?:is|was) violated/.exec(output);
  if (property?.[1]) {
    return { violated: property[1] };
  }
  if (output.includes('Error: Deadlock reached.')) {
    const block = lastStateBlock(output);
    const row = /\/\\ row = (\d+)/.exec(block);
    if (!row) {
      /* TLC prints no ALIAS for an initial state, so a trace spec rejected at its first row shows only
       * its raw variables; `i` is the rows consumed (ChatLog). */
      const consumed = /\/\\ i = (\d+)/.exec(block);
      return consumed ? { rejected: { row: Number(consumed[1]) + 1, rules: [] } } : { violated: 'Deadlock' };
    }
    const broken = /\/\\ broken = {([^}]*)}/.exec(block);
    const rules = (broken?.[1] ?? '')
      .split(',')
      .map((rule) => rule.trim().replaceAll('"', ''))
      .filter(Boolean);
    return { rejected: { row: Number(row[1]), rules } };
  }
  if (/Error: Postcondition \S+ .* is false/.test(output)) {
    const row = /<<"[^"]*(?:rejected at|at row)", (\d+)/.exec(output);
    return { rejected: { row: row ? Number(row[1]) : 0, rules: [] } };
  }
  const error = /^Error: .*$/m.exec(output);
  if (error) {
    return { error: error[0] };
  }
  // A simulation that finished without an error states no "No error" line; its seed line and finish do.
  if (
    output.includes('No error has been found') ||
    (/^Simulation using seed \d+/m.test(output) && /^Finished in /m.test(output))
  ) {
    return 'pass';
  }
  return { error: 'no verdict in TLC output' };
};

/** Prints a counterexample as one line per step with only the variables that changed (S4's trace.py). */
export const compressTrace = (output: string): string[] => {
  const blocks = output.split(/\n(?=State \d+: )/).filter((block) => /^State \d+: /.test(block));
  let previous = new Map<string, string>();
  return blocks.map((block) => {
    const [header = '', ...rest] = block.split('\n');
    const variables = new Map<string, string>();
    let current: string | undefined;
    for (const line of rest) {
      const start = /^\/\\ (\w+) = (.*)$/.exec(line);
      if (start?.[1]) {
        current = start[1];
        variables.set(current, start[2] ?? '');
      } else if (current && line.trim() !== '') {
        variables.set(current, `${variables.get(current) ?? ''} ${line.trim()}`);
      }
    }
    const changed = [...variables]
      .filter(([name, value]) => previous.get(name) !== value)
      .map(([name, value]) => `${name}=${value}`);
    previous = variables;
    const action = /<([^ >]+)/.exec(header)?.[1] ?? header;
    return `${header.split(':')[0] ?? ''} ${action}: ${changed.join('; ')}`;
  });
};

/** At most two JVMs at once (FM-R15). */
const maxJvms = 2;
let running = 0;
const waiting: Array<() => void> = [];

const acquire = async (): Promise<void> => {
  if (running < maxJvms) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
};

const release = (): void => {
  const next = waiting.shift();
  if (next) {
    next();
  } else {
    running -= 1;
  }
};

const minimumFreeBytes = 3 * 1024 ** 3;

/** Refuses to start a JVM with less than 3 GiB free (FM-R15; S1 filled the disk). */
export const checkFreeDisk = (directory: string): void => {
  const stats = statfsSync(directory);
  const free = stats.bavail * stats.bsize;
  if (free < minimumFreeBytes) {
    throw new Error(`only ${(free / 1024 ** 3).toFixed(1)} GiB free under ${directory}; formal runs need 3 GiB`);
  }
};

export const runJava = async (run: JavaRun): Promise<JavaResult> => {
  await acquire();
  const started = performance.now();
  try {
    return await new Promise<JavaResult>((resolve, reject) => {
      const child = spawn(run.command, [...run.args], { cwd: run.cwd, env: run.env ?? process.env });
      const chunks: string[] = [];
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => chunks.push(chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => chunks.push(chunk));
      let killed = false;
      const watchdog = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
      }, run.timeoutSeconds * 1000);
      child.on('error', reject);
      child.on('close', () => {
        clearTimeout(watchdog);
        resolve({ output: chunks.join(''), seconds: (performance.now() - started) / 1000, killed });
      });
    });
  } finally {
    release();
  }
};

/** A fresh metadir under the cache, removed after the run: TLC never writes `states/` at the workspace root. */
export const withMetadir = async <T>(
  context: FormalContext,
  label: string,
  body: (metadir: string) => Promise<T>,
): Promise<T> => {
  mkdirSync(path.join(cacheDirectory(context), 'tlc'), { recursive: true });
  const metadir = mkdtempSync(path.join(cacheDirectory(context), 'tlc', `${label}-`));
  try {
    return await body(metadir);
  } finally {
    rmSync(metadir, { recursive: true, force: true });
  }
};

export type TlcCase = {
  readonly tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>;
  /** Directory holding the module and its configuration; TLC runs there. */
  readonly directory: string;
  readonly module: string;
  readonly config: string;
  readonly env: NodeJS.ProcessEnv;
  readonly timeoutSeconds: number;
  /** For trace specs: the sanitized trace, exported as FORMAL_TRACE and checked depth-first. */
  readonly traceFile?: string;
  readonly workers?: number;
  readonly extra?: readonly string[];
};

/** One bounded TLC run and its parsed outcome. */
export const runTlcCase = async (
  context: FormalContext,
  run: TlcCase,
): Promise<{ readonly outcome: Outcome; readonly result: JavaResult }> =>
  withMetadir(context, path.basename(run.config, '.cfg'), async (metadir) => {
    checkFreeDisk(context.root);
    const command = tlcCommand({
      tools: run.tools,
      module: path.join(run.directory, run.module),
      config: run.config,
      metadir,
      ...(run.traceFile ? { queue: 'StateDeque' } : {}),
      ...(run.extra ? { extra: run.extra } : {}),
      ...(run.workers ? { workers: run.workers } : {}),
    });
    const result = await runJava({
      ...command,
      cwd: run.directory,
      env: run.traceFile ? { ...run.env, FORMAL_TRACE: run.traceFile } : run.env, // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      timeoutSeconds: run.timeoutSeconds,
    });
    return {
      outcome: result.killed ? { error: `watchdog after ${run.timeoutSeconds}s` } : parseTlcOutput(result.output),
      result,
    };
  });

type ApalacheTools = Required<Pick<LocatedTools, 'java' | 'apalache'>>;

/**
 * Apalache as S4 ran it (§3.4): a 1.5 GB heap and every output, run directory and temporary file
 * under `outDirectory`. `args` start with the subcommand, as `expected.json` records them.
 */
export const apalacheCommand = (
  tools: ApalacheTools,
  { args, outDirectory }: { readonly args: readonly string[]; readonly outDirectory: string },
): { readonly command: string; readonly args: readonly string[] } => {
  const [subcommand = 'check', ...rest] = args;
  return {
    command: tools.java.bin,
    args: [
      // Java 23+ warns on Apalache's use of sun.misc.Unsafe unless it is allowed; 21 rejects the flag.
      ...(tools.java.major >= 23 ? ['--sun-misc-unsafe-memory-access=allow'] : []),
      '-Xmx1500m',
      '-XX:+UseG1GC',
      `-Djava.io.tmpdir=${outDirectory}`,
      '-jar',
      tools.apalache.jar,
      subcommand,
      `--out-dir=${outDirectory}`,
      `--run-dir=${outDirectory}/run`,
      ...rest,
    ],
  };
};

/** Apalache's verdict line: `NoError` or `Error`; anything else is an error, never a pass. */
export const parseApalacheOutput = (output: string): Outcome => {
  const outcome = /The outcome is: (\w+)/.exec(output)?.[1];
  return outcome === 'NoError' || outcome === 'Error'
    ? outcome
    : { error: outcome ? `Apalache outcome ${outcome}` : 'no outcome in Apalache output' };
};

/** One bounded Apalache run in `directory`, with its scratch in a fresh cache directory. */
export const runApalacheCase = async (
  context: FormalContext,
  run: {
    readonly tools: ApalacheTools;
    readonly directory: string;
    readonly args: readonly string[];
    readonly timeoutSeconds: number;
  },
): Promise<{ readonly outcome: Outcome; readonly result: JavaResult }> =>
  withMetadir(context, 'apalache', async (outDirectory) => {
    checkFreeDisk(context.root);
    const result = await runJava({
      ...apalacheCommand(run.tools, { args: run.args, outDirectory }),
      cwd: run.directory,
      timeoutSeconds: run.timeoutSeconds,
    });
    return {
      outcome: result.killed ? { error: `watchdog after ${run.timeoutSeconds}s` } : parseApalacheOutput(result.output),
      result,
    };
  });
