/**
 * The installed `tau` bin's surface, checked by `check-pack-install.ts` once `@taucad/cli` is in the
 * consumer application (charter W17, the CLI closure in the pack-install oracle): `export` to a GLB, `check`
 * with one evaluation record, `test` passing a GeoSpec suite and `mcp` answering `initialize` and listing and
 * passing `test_model` on it with the GeoSpec engine the CLI installs (audit H-01), `serve --smoke-test` serving
 * locally with no relay, the typed not-prepared refusal for a `.py` model on `export` and `check` (charter
 * S24), and the ACP adapters it stages in
 * `dist-acp`: present at their pins, without a vendor binary anywhere in the install, and able to
 * answer `initialize` (Claude also `session/new`, against a stub `claude`) through the installed
 * `@taucad/host`. The bin runs from a project folder outside the application with an empty config
 * directory and home, so nothing a developer machine holds is visible to it.
 */

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** What one run of the installed `tau` bin produced. */
export type CliOutcome = {
  /** Exit status; `undefined` when the process was killed or never started. */
  readonly status: number | undefined;
  readonly output: string;
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
export type ToolCallResult = {
  content?: ReadonlyArray<{ type: string; text?: string }>;
  isError?: boolean;
  structuredContent?: { passed?: number; total?: number; status?: string };
};

/** What one `tau mcp` session answered: `initialize`, the listed tool names, and the one tool call when listed. */
export type McpSessionAnswers = {
  readonly initialized: InitializeResult;
  readonly tools: readonly string[];
  readonly called: ToolCallResult | undefined;
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
export const geoSpecSessionFailure = ({ tools, called: testModel }: McpSessionAnswers): string | undefined => {
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

/** Milliseconds `tau mcp` has to answer the tool call, which may load the GeoSpec engine and a kernel first. */
const toolCallTimeout = 180_000;

/** Milliseconds `tau mcp` has to exit once stdin closes, before it is terminated. */
const exitGrace = 10_000;

/**
 * Speak one MCP session over stdio to `tau mcp` or a launcher that starts it: `initialize`, `tools/list`, then
 * one tool call when that tool is listed.
 * @param options - The command and its arguments, the project folder it runs in, its environment and the call.
 * @returns What the server answered.
 */
export const mcpSession = async (options: {
  readonly command: string;
  readonly args: readonly string[];
  readonly project: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly call: { readonly name: string; readonly arguments: Record<string, unknown> };
}): Promise<McpSessionAnswers> => {
  const child = spawn(options.command, options.args, {
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
    const called = tools.includes(options.call.name)
      ? await request<ToolCallResult>(3, call(3, 'tools/call', options.call), toolCallTimeout)
      : undefined;
    return { initialized, tools, called };
  } finally {
    child.stdin.end();
    const grace = setTimeout(() => {
      child.kill('SIGTERM');
    }, exitGrace);
    await exited.promise;
    clearTimeout(grace);
  }
};

/** Vendor CLI payloads the ACP adapters' optional dependencies install; the CLI stages none of them. */
const vendorPayload = /^(?:@openai\/codex-|@anthropic-ai\/claude-agent-sdk-)/u;

/**
 * Every installed package under `modulesRoot`, nested ones included, whose name is a vendor CLI payload.
 *
 * @param modulesRoot - A `node_modules` directory to walk.
 * @returns The payload directories found.
 */
export const vendorPayloads = (modulesRoot: string): string[] => {
  const found: string[] = [];
  const visit = (modules: string): void => {
    const entries = existsSync(modules) ? readdirSync(modules, { withFileTypes: true }) : [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory() && !candidate.name.startsWith('.'))) {
      const names = entry.name.startsWith('@')
        ? readdirSync(join(modules, entry.name), { withFileTypes: true })
            .filter((candidate) => candidate.isDirectory())
            .map((candidate) => `${entry.name}/${candidate.name}`)
        : [entry.name];
      for (const name of names) {
        if (vendorPayload.test(name)) {
          found.push(join(modules, name));
        }
        visit(join(modules, name, 'node_modules'));
      }
    }
  };
  visit(modulesRoot);
  return found;
};

/**
 * The probe the installed application runs: resolve the staged adapters through the installed
 * `@taucad/host` exactly as `tau serve` does, then `initialize` each, and open one Claude session.
 */
const acpProbeSource = (stagedManifest: string, path: string): string => `
import { resolveAcpAdapters, spawnAcpAdapter } from '@taucad/host';

const environment = { PATH: ${JSON.stringify(path)}, HOME: process.cwd(), CLAUDE_CONFIG_DIR: process.cwd(), CODEX_HOME: process.cwd() };
const { agents, refused } = resolveAcpAdapters({ resolveFrom: ${JSON.stringify(pathToFileURL(stagedManifest).href)}, environment });
const results = { refused, agents: [] };
for (const adapter of agents.filter((agent) => agent.modulePath !== undefined)) {
  /* As after the host's own probe: an adapter whose CLI is not installed is never started. */
  if (adapter.executablePath === undefined) {
    results.agents.push({ id: adapter.id, modulePath: adapter.modulePath, skipped: true });
    continue;
  }
  const running = spawnAcpAdapter({ adapter, cwd: process.cwd(), environment });
  const writer = running.stream.writable.getWriter();
  const reader = running.stream.readable.getReader();
  const timer = setTimeout(() => running.signal('SIGKILL'), 60_000);
  const request = async (id, method, params) => {
    await writer.write({ jsonrpc: '2.0', id, method, params });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { error: 'exited: ' + running.stderr() };
      if ('id' in value && value.id === id) return 'error' in value ? { error: value.error } : value.result;
    }
  };
  const initialized = await request(1, 'initialize', { protocolVersion: 1, clientCapabilities: { fs: {}, terminal: false } });
  const session = adapter.id === 'claude'
    ? await request(2, 'session/new', { cwd: process.cwd(), mcpServers: [] })
    : undefined;
  clearTimeout(timer);
  running.signal('SIGKILL');
  results.agents.push({ id: adapter.id, modulePath: adapter.modulePath, executablePath: adapter.executablePath, initialized, session, stderr: running.stderr() });
}
process.stdout.write(JSON.stringify(results));
`;

/**
 * Whether `path` lies inside `root`, comparing real paths: on macOS the OS temporary directory
 * `/var/folders/…` resolves to `/private/var/folders/…`, and Node reports modules by real path.
 *
 * @param root - An existing directory.
 * @param path - An existing file or directory.
 * @returns True when `path` is `root` or below it.
 */
export const isWithinRealPath = (root: string, path: string): boolean => {
  const fromRoot = relative(realpathSync(root), realpathSync(path));
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
};

/**
 * Check the ACP adapters the CLI stages in `dist-acp`.
 *
 * @param temporaryRoot - Scratch directory for the stub `claude` and the probe's own home.
 * @param appRoot - The consumer application `@taucad/cli` is installed in.
 */
export const checkStagedAcpAdapters = (temporaryRoot: string, appRoot: string): void => {
  const cliRoot = join(appRoot, 'node_modules/@taucad/cli');
  const stagedManifest = join(cliRoot, 'dist-acp/package.json');
  if (!existsSync(stagedManifest)) {
    throw new Error(`@taucad/cli ships no staged ACP adapters at ${stagedManifest}.`);
  }
  const pins = (JSON.parse(readFileSync(stagedManifest, 'utf8')) as { dependencies?: Record<string, string> })
    .dependencies;
  if (pins === undefined || Object.keys(pins).length === 0) {
    throw new Error('dist-acp/package.json pins no ACP adapter.');
  }
  for (const [name, version] of Object.entries(pins)) {
    const manifest = join(cliRoot, 'dist-acp/node_modules', name, 'package.json');
    const staged = existsSync(manifest) ? (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: string }) : {};
    if (staged.version !== version) {
      throw new Error(`dist-acp stages ${name} at ${String(staged.version)}, not its pin ${version}.`);
    }
  }
  /* The patched Codex adapter, not the registry copy: Tau's skill root must stay out of its sandbox roots. */
  const codex = readFileSync(
    join(cliRoot, 'dist-acp/node_modules/@agentclientprotocol/codex-acp/dist/index.js'),
    'utf8',
  );
  if (!codex.includes('const sessionRoots = [projectPath];')) {
    throw new Error('dist-acp stages a Codex ACP adapter without the workspace patch.');
  }
  const payloads = vendorPayloads(join(appRoot, 'node_modules'));
  if (payloads.length > 0) {
    throw new Error(`The CLI install carries vendor CLI payloads it never runs:\n${payloads.join('\n')}`);
  }

  const probeRoot = join(temporaryRoot, 'acp');
  const stubs = join(probeRoot, 'bin');
  const calls = join(probeRoot, 'claude-calls.log');
  mkdirSync(stubs, { recursive: true });
  /* A POSIX stub records how the adapter starts `claude`; a `codex` already on PATH is used as is. */
  if (process.platform !== 'win32') {
    writeFileSync(join(stubs, 'claude'), `#!/bin/sh\necho "$@" >> '${calls}'\necho '2.1.301 (stub)'\n`);
    chmodSync(join(stubs, 'claude'), 0o755);
  }
  const probe = join(appRoot, 'acp-probe.mjs');
  writeFileSync(
    probe,
    acpProbeSource(stagedManifest, [stubs, dirname(process.execPath), process.env['PATH'] ?? ''].join(delimiter)),
  );
  const result = spawnSync(process.execPath, [probe], {
    cwd: probeRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(`The ACP probe exited ${String(result.status)}:\n${result.error?.message ?? ''}${result.stderr}`);
  }
  const probed = JSON.parse(result.stdout) as {
    readonly refused: readonly unknown[];
    readonly agents: ReadonlyArray<{
      readonly id: string;
      readonly modulePath: string;
      readonly skipped?: true;
      readonly initialized?: { readonly protocolVersion?: number; readonly error?: unknown };
      readonly stderr?: string;
    }>;
  };
  if (probed.refused.length > 0) {
    throw new Error(`The installed host refused staged adapters: ${JSON.stringify(probed.refused)}`);
  }
  for (const agent of probed.agents) {
    if (!isWithinRealPath(join(cliRoot, 'dist-acp'), agent.modulePath)) {
      throw new Error(`${agent.id} resolved outside dist-acp: ${agent.modulePath}`);
    }
    if (agent.skipped === true) {
      console.log(`dist-acp: ${agent.id} resolves; its CLI is not on PATH, so it is not started.`);
    } else if (agent.initialized?.protocolVersion !== 1) {
      throw new Error(`${agent.id} did not initialize: ${JSON.stringify(agent.initialized)}\n${agent.stderr ?? ''}`);
    }
  }
  if (probed.agents.length !== Object.keys(pins).length) {
    throw new Error(
      `The installed host resolved ${String(probed.agents.length)} of ${String(Object.keys(pins).length)} staged adapters.`,
    );
  }
  if (process.platform !== 'win32') {
    const claude = probed.agents.find((agent) => agent.id === 'claude');
    const started = existsSync(calls) ? readFileSync(calls, 'utf8') : '';
    if (!started.includes('--output-format stream-json') || claude?.stderr?.includes('native binary not found')) {
      throw new Error(`Claude's session did not start the user's claude:\n${started}\n${claude?.stderr ?? ''}`);
    }
  }
  console.log(`dist-acp: ${Object.keys(pins).join(', ')} at their pins, with no vendor payload in the install.`);
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
  const tau = (label: string, arguments_: readonly string[]): CliOutcome & { readonly stdout: string } => {
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
      stdout: result.stdout,
    };
  };
  /** The one JSON record a `--json` run printed, or a failure naming what it printed instead. */
  const recordOf = (label: string, outcome: CliOutcome, stdout: string): Record<string, unknown> => {
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length !== 1) {
      throw new Error(
        `${label} printed ${String(lines.length)} stdout lines, not one record:\n${outcome.output.slice(-4000)}`,
      );
    }
    return JSON.parse(lines[0]!) as Record<string, unknown>;
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

  const checked = tau('tau check main.ts --json', ['check', 'main.ts', '--json']);
  const evaluation = recordOf('tau check main.ts', checked, checked.stdout);
  if (checked.status !== 0 || evaluation['kind'] !== 'evaluation' || evaluation['status'] !== 'ok') {
    throw new Error(
      `tau check main.ts did not evaluate (exit ${String(checked.status)}):\n${checked.output.slice(-4000)}`,
    );
  }

  for (const [name, text] of Object.entries(geoSpecProjectFiles)) {
    writeFileSync(join(project, name), text);
  }
  const started = performance.now();
  const session = await mcpSession({
    command: bin,
    args: ['mcp', `--project=${project}`],
    project,
    environment,
    call: { name: 'test_model', arguments: {} },
  });
  const { initialized } = session;
  console.log(
    `tau mcp: initialize answered by ${initialized.serverInfo?.name ?? 'an unnamed server'} ${initialized.serverInfo?.version ?? ''} (protocol ${initialized.protocolVersion ?? 'unknown'}); listed ${String(session.tools.length)} tools; the session, test_model included, took ${String(Math.round(performance.now() - started))} ms.`,
  );
  const geoSpecFailure = geoSpecSessionFailure(session);
  if (geoSpecFailure !== undefined) {
    throw new Error(geoSpecFailure);
  }

  const tested = tau('tau test --json', ['test', '--json']);
  const testRecord = recordOf('tau test', tested, tested.stdout);
  if (tested.status !== 0 || testRecord['status'] !== 'passed' || testRecord['passed'] !== 1) {
    throw new Error(
      `tau test did not pass the one-requirement suite (exit ${String(tested.status)}):\n${tested.output.slice(-4000)}`,
    );
  }
  console.log('tau test: the one-requirement GeoSpec suite passed.');

  const served = tau('tau serve --smoke-test --json', [
    'serve',
    project,
    '--smoke-test',
    '--json',
    '--port=0',
    '--no-external-agents',
  ]);
  const serveRecord = recordOf('tau serve', served, served.stdout);
  if (served.status !== 0 || serveRecord['kind'] !== 'serve' || serveRecord['relay'] !== null) {
    throw new Error(`tau serve did not serve locally (exit ${String(served.status)}):\n${served.output.slice(-4000)}`);
  }
  console.log(`tau serve: served ${String(serveRecord['url'])} with no relay; the descriptor answered.`);

  checkStagedAcpAdapters(temporaryRoot, appRoot);

  writeFileSync(join(project, 'main.py'), 'from build123d import Box\n\nresult = Box(10, 20, 30)\n');
  const pythonOutput = join(project, 'python.glb');
  const python = tau('tau export main.py --ext=glb', ['export', 'main.py', '--ext=glb', `--output=${pythonOutput}`]);
  if (existsSync(pythonOutput)) {
    throw new Error('tau export main.py wrote a GLB with an empty config directory.');
  }
  if (!isNotPreparedRefusal(python)) {
    throw new Error(`tau export main.py did not refuse naming tau prepare build123d:\n${python.output.slice(-4000)}`);
  }
  const pythonCheck = tau('tau check main.py --json', ['check', 'main.py', '--json']);
  if (
    !isNotPreparedRefusal(pythonCheck) ||
    recordOf('tau check main.py', pythonCheck, pythonCheck.stdout)['status'] !== 'refused'
  ) {
    throw new Error(
      `tau check main.py did not refuse naming tau prepare build123d:\n${pythonCheck.output.slice(-4000)}`,
    );
  }
  console.log('CLI checks passed.');
};
