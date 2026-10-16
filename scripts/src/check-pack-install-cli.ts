/**
 * The installed `tau` bin's surface, checked by `check-pack-install.ts` once `@taucad/cli` is in the
 * consumer application: `export` to a GLB, `check`, `mcp` answering `initialize` and listing and passing
 * `test_model` on a GeoSpec suite with the GeoSpec engine the CLI installs (audit H-01), and the typed
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

/** What `tools/call` answers: text blocks, the error bit, and any structured content. */
type ToolCallResult = {
  content?: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: { passed?: number; total?: number };
};

/** What one `tau mcp` session answered: `initialize`, the listed tool names, and `test_model` when listed. */
export type McpSessionAnswers = {
  readonly initialized: InitializeResult;
  readonly tools: readonly string[];
  readonly testModel: ToolCallResult | undefined;
};

/**
 * A GeoSpec suite that passes on a 20 x 10 x 4 mm replicad block, and the block, for `test_model` to run
 * through the installed CLI's own GeoSpec engine.
 */
export const geoSpecProjectFiles: Readonly<Record<string, string>> = {
  'block.ts': `import { drawRectangle } from 'replicad';

export default function main() {
  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);
}
`,
  'block.geospec.ts': `import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('20 x 10 x 4 mm block', () => {
  it('has the specified size', async () => {
    const model = await loadModel({ file: 'block.ts', format: 'step' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 10, z: 4 }, tolerance: 0.001 });
  });
});
`,
};

/**
 * Why a `tau mcp` session falls short of a global install's promise, or `undefined` when it keeps it:
 * `test_model` is listed (the CLI brings the GeoSpec engine its host peers) and passes the suite.
 */
export const geoSpecSessionFailure = ({ tools, testModel }: McpSessionAnswers): string | undefined => {
  if (!tools.includes('test_model')) {
    return `tau mcp listed no test_model, so the installed CLI did not resolve the GeoSpec engine; it listed ${tools.join(', ')}.`;
  }
  const { passed, total } = testModel?.structuredContent ?? {};
  if (testModel?.isError === true || passed !== 1 || total !== 1) {
    const text = (testModel?.content ?? []).map((block) => block.text ?? '').join('\n');
    // The text names failing IDs only; the structured result carries each failure's reason.
    const structured =
      testModel?.structuredContent === undefined ? '' : `\n${JSON.stringify(testModel.structuredContent)}`;
    return `tau mcp test_model did not pass the one-requirement suite:\n${`${text}${structured}`.slice(-4000)}`;
  }
  return undefined;
};

/** Milliseconds `tau mcp` has to answer `initialize`. */
const initializeTimeout = 60_000;

/** Milliseconds `tau mcp` has to answer `test_model`, which loads the GeoSpec engine and a kernel first. */
const testModelTimeout = 180_000;

/** Milliseconds `tau mcp` has to exit once stdin closes, before it is terminated. */
const exitGrace = 10_000;

/** Speak one MCP session to `tau mcp` over stdio: `initialize`, `tools/list`, then `test_model` when listed. */
const mcpSession = async (options: {
  readonly bin: string;
  readonly project: string;
  readonly environment: NodeJS.ProcessEnv;
}): Promise<McpSessionAnswers> => {
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
  let exitFailure: Error | undefined;
  child.once('exit', () => {
    exited.resolve();
  });
  // A write after the server exits fails with EPIPE; the exit itself is the failure reported.
  child.stdin.on('error', () => undefined);
  const pending = new Map<number, PromiseWithResolvers<string>>();
  const failAll = (error: Error): void => {
    for (const waiting of pending.values()) {
      waiting.reject(error);
    }
    pending.clear();
  };
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    const lines = stdout.split('\n');
    stdout = lines.pop() ?? '';
    for (const line of lines) {
      let id: unknown;
      try {
        ({ id } = JSON.parse(line) as { id?: unknown });
      } catch {
        // ponytail: the protocol owns stdout; a line that is not JSON answers no request.
        continue;
      }
      if (typeof id === 'number') {
        pending.get(id)?.resolve(line);
        pending.delete(id);
      }
    }
  });
  child.once('error', (error) => {
    exitFailure = error;
    failAll(error);
    // A bin that never started emits no `exit`.
    exited.resolve();
  });
  child.once('exit', (status) => {
    exitFailure = new Error(`tau mcp exited ${String(status)} mid-session.\n${stderr}`);
    failAll(exitFailure);
  });
  const request = async <Result>(id: number, line: string, answerTimeout: number): Promise<Result> => {
    if (exitFailure !== undefined) {
      throw exitFailure;
    }
    const answered = Promise.withResolvers<string>();
    pending.set(id, answered);
    const timer = setTimeout(() => {
      answered.reject(
        new Error(`tau mcp did not answer request ${String(id)} in ${String(answerTimeout)} ms.\n${stderr}`),
      );
    }, answerTimeout);
    child.stdin.write(line);
    try {
      const answer = await answered.promise;
      const message = JSON.parse(answer) as { result?: Result };
      if (message.result === undefined) {
        throw new Error(`tau mcp answered request ${String(id)} with an error: ${answer}`);
      }
      return message.result;
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  };
  const call = (id: number, method: string, params: Record<string, unknown>): string =>
    `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
  try {
    const initialized = await request<InitializeResult>(1, mcpInitializeRequest, initializeTimeout);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const listed = await request<{ tools: ReadonlyArray<{ name: string }> }>(
      2,
      call(2, 'tools/list', {}),
      initializeTimeout,
    );
    const tools = listed.tools.map(({ name }) => name);
    const testModel = tools.includes('test_model')
      ? await request<ToolCallResult>(3, call(3, 'tools/call', { name: 'test_model', arguments: {} }), testModelTimeout)
      : undefined;
    return { initialized, tools, testModel };
  } finally {
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

  for (const [name, text] of Object.entries(geoSpecProjectFiles)) {
    writeFileSync(join(project, name), text);
  }
  const started = performance.now();
  const session = await mcpSession({ bin, project, environment });
  const { initialized } = session;
  console.log(
    `tau mcp: initialize answered by ${initialized.serverInfo?.name ?? 'an unnamed server'} ${initialized.serverInfo?.version ?? ''} (protocol ${initialized.protocolVersion ?? 'unknown'}); listed ${String(session.tools.length)} tools; the session, test_model included, took ${String(Math.round(performance.now() - started))} ms.`,
  );
  const geoSpecFailure = geoSpecSessionFailure(session);
  if (geoSpecFailure !== undefined) {
    throw new Error(geoSpecFailure);
  }

  writeFileSync(join(project, 'main.py'), 'from build123d import Box\n\nresult = Box(10, 20, 30)\n');
  const pythonOutput = join(project, 'python.glb');
  const python = tau('tau export main.py --ext=glb', ['export', 'main.py', '--ext=glb', `--output=${pythonOutput}`]);
  if (existsSync(pythonOutput)) {
    throw new Error('tau export main.py wrote a GLB with an empty config directory.');
  }
  settle('not-prepared', python, isNotPreparedRefusal);
  console.log(`CLI checks passed${gaps.length > 0 ? `; expected gaps: ${gaps.join(', ')}` : ''}.`);
};
