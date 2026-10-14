/**
 * The installed `tau` bin's surface, checked by `check-pack-install.ts` once `@taucad/cli` is in the
 * consumer application: `export` to a GLB, `check`, `mcp` answering `initialize`, and the typed
 * not-prepared refusal for a `.py` model (charter S24). The bin runs from a project folder outside
 * the application with an empty config directory and home, so nothing a developer machine holds is
 * visible to it.
 *
 * A check the charter has not delivered yet is reported as an expected gap only while the bin prints
 * the output recorded for it in {@link expectedCliGaps}; any other failure is red.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** What one run of the installed `tau` bin produced. */
export type CliOutcome = {
  /** Exit status; `undefined` when the process was killed or never started. */
  readonly status: number | undefined;
  readonly output: string;
};

/**
 * CLI behaviour the charter has not delivered yet, keyed by check, with the substring today's bin
 * prints and the work package that replaces it.
 */
export const expectedCliGaps: Readonly<Record<string, { readonly owner: string; readonly output: string }>> = {
  // `tau check` (exit 0 clean, 1 failed assertions, 2 unusable input) arrives with the CLI headless surface.
  check: { owner: 'W17', output: 'Unknown command check' },
  // Before preparation a `.py` model must refuse with exit 3 naming `tau prepare build123d`; the CLI does
  // not register the build123d kernel yet, so the runtime finds no kernel for the extension.
  'not-prepared': { owner: 'W5', output: 'No kernel handles ".py"' },
};

type CliVerdict = { readonly verdict: 'pass' | 'gap' } | { readonly verdict: 'fail'; readonly message: string };

/**
 * Classify one CLI check: `pass` when `passed` holds, `gap` when the output carries the check's
 * recorded {@link expectedCliGaps} entry, otherwise a failure message.
 */
export const classifyCliOutcome = (
  check: string,
  outcome: CliOutcome,
  passed: (outcome: CliOutcome) => boolean,
): CliVerdict => {
  if (passed(outcome)) {
    return { verdict: 'pass' };
  }
  const gap = expectedCliGaps[check];
  if (gap !== undefined && outcome.output.includes(gap.output)) {
    return { verdict: 'gap' };
  }
  return { verdict: 'fail', message: `tau ${check} exited ${String(outcome.status)}:\n${outcome.output.slice(-4000)}` };
};

/** The refusal a `.py` model gets before its kernel is prepared: exit 3, naming the command that prepares it. */
export const isNotPreparedRefusal = ({ status, output }: CliOutcome): boolean =>
  status === 3 && output.includes('tau prepare build123d');

/** One JSON-RPC `initialize` request, as an MCP client sends it first over stdio. */
export const mcpInitializeRequest = `${JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'tau-check-pack-install', version: '0.0.0' },
  },
})}\n`;

type InitializeResult = { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };

/** Milliseconds `tau mcp` has to answer `initialize`. */
const initializeTimeout = 60_000;

/** Milliseconds `tau mcp` has to exit once stdin closes, before it is terminated. */
const exitGrace = 10_000;

/** Send `initialize` to `tau mcp` over stdio and return the server's answer. */
const mcpInitialize = async (options: {
  readonly bin: string;
  readonly project: string;
  readonly environment: NodeJS.ProcessEnv;
}): Promise<InitializeResult> => {
  const child = spawn(options.bin, ['mcp', `--project=${options.project}`], {
    cwd: options.project,
    env: options.environment,
    stdio: 'pipe',
  });
  let stdout = '';
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = Promise.withResolvers<void>();
  child.once('exit', () => {
    exited.resolve();
  });
  const answer = Promise.withResolvers<string>();
  const timer = setTimeout(() => {
    answer.reject(new Error(`tau mcp did not answer initialize in ${String(initializeTimeout)} ms.\n${stderr}`));
  }, initializeTimeout);
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    const line = stdout.split('\n').find((candidate) => candidate.includes('"id":1'));
    if (line !== undefined) {
      answer.resolve(line);
    }
  });
  child.once('error', answer.reject);
  child.once('exit', (status) => {
    answer.reject(new Error(`tau mcp exited ${String(status)} before answering initialize.\n${stderr}`));
  });
  child.stdin.write(mcpInitializeRequest);
  try {
    const line = await answer.promise;
    const message = JSON.parse(line) as { result?: InitializeResult };
    if (message.result === undefined) {
      throw new Error(`tau mcp answered initialize with an error: ${line}`);
    }
    return message.result;
  } finally {
    clearTimeout(timer);
    child.stdin.end();
    const grace = setTimeout(() => {
      child.kill('SIGTERM');
    }, exitGrace);
    await exited.promise;
    clearTimeout(grace);
  }
};

/** Run every CLI check against the bin installed in `appRoot`, in folders under `temporaryRoot`. */
export const runCliSurface = async (temporaryRoot: string, appRoot: string): Promise<void> => {
  const project = join(temporaryRoot, 'project');
  const home = join(temporaryRoot, 'home');
  const config = join(temporaryRoot, 'config');
  for (const directory of [project, home, config]) {
    mkdirSync(directory);
  }
  const bin = join(appRoot, 'node_modules/.bin/tau');
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    /* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
    HOME: home,
    TAU_CONFIG_DIR: config,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_DATA_HOME: join(home, '.local/share'),
    /* eslint-enable @typescript-eslint/naming-convention -- End of the environment names. */
  };
  const tau = (label: string, arguments_: readonly string[]): CliOutcome => {
    const started = performance.now();
    const result = spawnSync(bin, arguments_, {
      cwd: project,
      env: environment,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    });
    console.log(`${label}: exit ${String(result.status)} in ${String(Math.round(performance.now() - started))} ms`);
    return {
      status: result.status ?? undefined,
      output: `${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
    };
  };
  const gaps: string[] = [];
  const settle = (check: string, outcome: CliOutcome, passed: (outcome: CliOutcome) => boolean): void => {
    const result = classifyCliOutcome(check, outcome, passed);
    if (result.verdict === 'fail') {
      throw new Error(result.message);
    }
    if (result.verdict === 'gap') {
      gaps.push(`${check} (${expectedCliGaps[check]?.owner ?? 'unowned'})`);
      console.log(`tau ${check}: expected gap: ${outcome.output.trim().split('\n').slice(-2).join(' | ')}`);
    }
  };

  writeFileSync(
    join(project, 'main.ts'),
    "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n",
  );
  const output = join(project, 'main.glb');
  const exported = tau('tau export main.ts --ext=glb', ['export', 'main.ts', '--ext=glb', `--output=${output}`]);
  if (exported.status !== 0 || !existsSync(output)) {
    throw new Error(`tau export wrote no GLB (exit ${String(exported.status)}):\n${exported.output.slice(-4000)}`);
  }
  const bytes = readFileSync(output);
  if (bytes.byteLength <= 12 || bytes.subarray(0, 4).toString('latin1') !== 'glTF') {
    throw new Error(`tau export wrote ${String(bytes.byteLength)} bytes that are not a GLB.`);
  }
  console.log(`tau export main.ts --ext=glb: ${String(bytes.byteLength)} bytes of glTF.`);

  settle('check', tau('tau check main.ts', ['check', 'main.ts']), ({ status }) => status === 0);

  const started = performance.now();
  const initialized = await mcpInitialize({ bin, project, environment });
  console.log(
    `tau mcp: initialize answered by ${initialized.serverInfo?.name ?? 'an unnamed server'} ${initialized.serverInfo?.version ?? ''} (protocol ${initialized.protocolVersion ?? 'unknown'}) in ${String(Math.round(performance.now() - started))} ms.`,
  );

  writeFileSync(join(project, 'main.py'), 'from build123d import Box\n\nresult = Box(10, 20, 30)\n');
  const pythonOutput = join(project, 'python.glb');
  const python = tau('tau export main.py --ext=glb', ['export', 'main.py', '--ext=glb', `--output=${pythonOutput}`]);
  if (existsSync(pythonOutput)) {
    throw new Error('tau export main.py wrote a GLB with an empty config directory.');
  }
  settle('not-prepared', python, isNotPreparedRefusal);
  console.log(`CLI checks passed${gaps.length > 0 ? `; expected gaps: ${gaps.join(', ')}` : ''}.`);
};
