/**
 * Spike S25 driver (native-dependency-resolution charter, D7/D25/W5): runs the probe MCP server under
 * Codex and Claude Code, each driven through one tool call by the loopback mock model, and reports
 * which environment variable names arrive, whether progress notifications flow for a client-supplied
 * `progressToken`, and whether the client sends `notifications/cancelled` when a call outlives its
 * tool timeout.
 *
 * Spike code only. Usage:
 *   node scripts/spikes/s25/run.ts <codex-bin> <claude-bin> <out-dir>
 * Every client starts from a scrubbed environment (PATH, HOME, LANG, USER, SHELL, TERM, TMPDIR plus the
 * scenario's names) with placeholder values; only names are ever written. No credential is used: the
 * model API is the loopback mock, and Claude Code is given the placeholder key `s25-placeholder`.
 * Writes <out-dir>/s25.json and one directory per scenario. Exit codes: 0 ran, 2 usage.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment variable and wire names are the subject of this spike. */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type Environment = Record<string, string>;
type JsonObject = Record<string, unknown>;
type Client = 'codex' | 'claude';
type Scenario = {
  id: string;
  client: Client;
  label: string;
  tool: 'env_names' | 'progress_probe' | 'hang';
  arguments: JsonObject;
  /** Codex `env_vars`; undefined for Claude Code, which has no allowlist field. */
  envVars?: string[];
  /** Per-server tool timeout written into the client's MCP config, in seconds; omitted when undefined. */
  toolTimeoutSec?: number;
  /** Extra parent variables (names and placeholder values) for this scenario. */
  extraEnv?: Environment;
  /** Parent names removed for this scenario. */
  dropEnv?: string[];
  /** Milliseconds before the client is killed. */
  deadline: number;
  /** How the client is driven: headless (`exec` / `-p`), Codex's app-server, or the interactive TUI. */
  mode?: 'headless' | 'app-server' | 'tui';
};

const [codexBin, claudeBin, outDirectory] = process.argv.slice(2);
if (!codexBin || !claudeBin || !outDirectory) {
  process.stderr.write('usage: run.ts <codex-bin> <claude-bin> <out-dir>\n');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const probe = join(here, 'probe-server.ts');
const mock = join(here, 'mock-model.ts');
const appServerDriver = join(here, 'codex-app-server.ts');
const tuiDriver = join(here, 'tui.py');
const tuiSeconds = 30;

/**
 * Removes terminal escape sequences from captured screen bytes.
 *
 * @param screen - Raw pseudo-terminal output.
 * @returns Printable text.
 */
/* eslint-disable no-control-regex -- terminal escape sequences are control characters by definition. */
const stripEscapes = (screen: string): string =>
  screen
    .replaceAll(/\u001B\[[0-9;?]*[A-Za-z]/gu, ' ')
    .replaceAll(/\u001B\][^\u0007]*\u0007/gu, '')
    .replaceAll(/\u001B[()][0-9A-B]/gu, '');
/* eslint-enable no-control-regex -- end of the escape-sequence patterns. */
const caBundle = existsSync('/etc/ssl/certs/ca-certificates.crt')
  ? '/etc/ssl/certs/ca-certificates.crt'
  : '/etc/ssl/cert.pem';

/** The proxy and CA names the plugin manifests are proposed to forward (D9, D25, ACP allowlist). */
const proxyCaNames = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_SYSTEM_CA',
];

/** The `TAU_*` names: the two shipped today plus the seven of D25. */
const tauNames = [
  'TAU_CLI',
  'TAU_HOST_MACHINES',
  'TAU_ACQUISITION',
  'TAU_PAYLOAD_MIRROR',
  'TAU_PAYLOAD_MIRROR_NO_FALLBACK',
  'TAU_PAYLOAD_DIR',
  'TAU_CONFIG_DIR',
  'TAU_PAYLOAD_TARGET',
  'TAU_PAYLOAD_EMULATION',
];

/** Names that must never arrive under an allowlist: credentials and unlisted CA spellings. */
const decoyNames = [
  'TAU_HOST_AGENT_TOKEN',
  'S25_DECOY_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'CURL_CA_BUNDLE',
  'REQUESTS_CA_BUNDLE',
  'PIP_CERT',
  'GIT_SSL_CAINFO',
  'CARGO_HTTP_CAINFO',
  'AWS_CA_BUNDLE',
  'NPM_CONFIG_CAFILE',
  'BUNDLE_SSL_CA_CERT',
  'OPENAI_API_KEY',
  'NODE_OPTIONS',
];

const shippedCodexEnvVariables = ['TAU_CLI', 'TAU_HOST_MACHINES'];
const proposedCodexEnvVariables = [...tauNames, ...proxyCaNames];

/**
 * Placeholder value for a test variable; never a real secret.
 *
 * @param name - Variable name.
 * @returns A harmless value of the right shape.
 */
const placeholder = (name: string): string => {
  if (/^(?:https?_proxy|HTTPS?_PROXY)$/u.test(name)) {
    return 'http://127.0.0.1:9';
  }

  if (/^no_proxy$/iu.test(name)) {
    return '127.0.0.1,localhost';
  }

  if (name === 'SSL_CERT_DIR') {
    return dirname(caBundle);
  }

  if (/CERT|CA_BUNDLE|CAINFO|CAFILE/u.test(name)) {
    return caBundle;
  }

  if (name === 'NODE_USE_SYSTEM_CA') {
    return '1';
  }

  if (name === 'NODE_OPTIONS') {
    return '--no-warnings';
  }

  return `s25-placeholder-${name.toLowerCase()}`;
};

/**
 * The scrubbed parent environment a client starts from.
 *
 * @param home - Per-scenario HOME.
 * @param extra - Scenario-specific names.
 * @returns The environment.
 */
const parentEnv = (home: string, extra: Environment, drop: string[] = []): Environment => {
  const env: Environment = {
    PATH: `${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    HOME: home,
    LANG: 'C.UTF-8',
    USER: 's25',
    SHELL: '/bin/bash',
    TERM: 'dumb',
    TMPDIR: join(home, 'tmp'),
  };
  for (const name of [...proxyCaNames, ...tauNames, ...decoyNames]) {
    env[name] = placeholder(name);
  }

  return { ...Object.fromEntries(Object.entries(env).filter(([name]) => !drop.includes(name))), ...extra };
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readJsonl = (path: string): JsonObject[] =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as JsonObject)
    : [];

/**
 * Runs a command until it exits or the deadline passes.
 *
 * @param command - Executable.
 * @param args - Arguments.
 * @param options - Working directory, environment and deadline.
 * @returns Exit status, whether the deadline killed it, and combined output.
 */
const run = async (
  command: string,
  args: string[],
  options: { cwd: string; env: Environment; deadline: number },
): Promise<{ exit: number | undefined; killed: boolean; ms: number; output: string; stdout: string }> => {
  const startedAt = Date.now();
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    output += chunk;
  });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    child.kill('SIGKILL');
  }, options.deadline);
  const exit = await new Promise<number | undefined>((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });
  clearTimeout(timer);
  return { exit, killed, ms: Date.now() - startedAt, output, stdout };
};

/**
 * Runs one scenario and returns its observations.
 *
 * @param scenario - The scenario.
 * @returns Observations; names only.
 */
const runScenario = async (scenario: Scenario): Promise<JsonObject> => {
  const directory = join(outDirectory, scenario.id);
  const home = join(directory, 'home');
  const work = join(directory, 'work');
  for (const path of [home, join(home, 'tmp'), work]) {
    mkdirSync(path, { recursive: true });
  }

  const probeLog = join(directory, 'probe.jsonl');
  const modelLog = join(directory, 'model.jsonl');
  const portFile = join(directory, 'port');
  const mockProcess = spawn(
    process.execPath,
    [mock, portFile, modelLog, scenario.tool, JSON.stringify(scenario.arguments)],
    {
      stdio: 'ignore',
    },
  );
  for (let attempt = 0; attempt < 50 && !existsSync(portFile); attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- polling for the mock's port file.
    await sleep(100);
  }

  const port = readFileSync(portFile, 'utf8').trim();
  const base = `http://127.0.0.1:${port}`;
  const env = parentEnv(home, scenario.extraEnv ?? {}, scenario.dropEnv);
  const prompt = `Call the ${scenario.tool} tool.`;
  let result: Awaited<ReturnType<typeof run>>;
  let manifest: JsonObject;

  if (scenario.client === 'codex') {
    const codexHome = join(directory, 'codex-home');
    mkdirSync(codexHome, { recursive: true });
    const toml = [
      'model = "mock-model"',
      'model_provider = "mock"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      '[model_providers.mock]',
      'name = "mock"',
      `base_url = "${base}/v1"`,
      'wire_api = "responses"',
      '[mcp_servers.probe]',
      `command = ${JSON.stringify(process.execPath)}`,
      `args = ${JSON.stringify([probe, probeLog])}`,
      `env_vars = ${JSON.stringify(scenario.envVars ?? [])}`,
      'startup_timeout_sec = 60',
      ...(scenario.toolTimeoutSec === undefined ? [] : [`tool_timeout_sec = ${scenario.toolTimeoutSec}`]),
      'default_tools_approval_mode = "approve"',
      '',
    ].join('\n');
    writeFileSync(
      join(codexHome, 'config.toml'),
      `${toml}[projects.${JSON.stringify(work)}]\ntrust_level = "trusted"\n`,
    );
    manifest = { env_vars: scenario.envVars ?? [], tool_timeout_sec: scenario.toolTimeoutSec };
    const codexEnv = { ...env, CODEX_HOME: codexHome, RUST_LOG: 'codex_rmcp_client=info' };
    if (scenario.mode === 'app-server') {
      result = await run(process.execPath, [appServerDriver, codexBin, work, String(scenario.deadline - 5000)], {
        cwd: work,
        env: codexEnv,
        deadline: scenario.deadline,
      });
    } else if (scenario.mode === 'tui') {
      result = await run(
        'python3',
        ['-I', tuiDriver, 'codex', codexBin, work, join(directory, 'screen.bin'), String(tuiSeconds)],
        {
          cwd: work,
          env: { ...codexEnv, TERM: 'xterm-256color' },
          deadline: scenario.deadline,
        },
      );
    } else {
      result = await run(codexBin, ['exec', '--json', '--skip-git-repo-check', prompt], {
        cwd: work,
        env: codexEnv,
        deadline: scenario.deadline,
      });
    }
  } else {
    const config = {
      mcpServers: {
        probe: {
          command: process.execPath,
          args: [probe, probeLog],
          ...(scenario.toolTimeoutSec === undefined ? {} : { timeout: scenario.toolTimeoutSec * 1000 }),
        },
      },
    };
    const configPath = join(directory, 'mcp.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    manifest = scenario.toolTimeoutSec === undefined ? {} : { timeout: scenario.toolTimeoutSec * 1000 };
    const claudeConfigDirectory = join(home, '.claude');
    const claudeEnv = {
      ...env,
      ANTHROPIC_BASE_URL: base,
      ANTHROPIC_API_KEY: 's25-placeholder',
      CLAUDE_CONFIG_DIR: claudeConfigDirectory,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
    };
    const common = [
      '--mcp-config',
      configPath,
      '--strict-mcp-config',
      '--allowedTools',
      'mcp__probe',
      '--model',
      'claude-sonnet-4-5',
    ];
    if (scenario.mode === 'tui') {
      /* Pre-answer the first-run screens: onboarding, the placeholder key and folder trust. */
      mkdirSync(claudeConfigDirectory, { recursive: true });
      writeFileSync(
        join(claudeConfigDirectory, '.claude.json'),
        JSON.stringify({
          hasCompletedOnboarding: true,
          theme: 'dark',
          customApiKeyResponses: { approved: ['s25-placeholder'], rejected: [] },
          projects: { [work]: { hasTrustDialogAccepted: true, allowedTools: [] } },
        }),
      );
      result = await run(
        'python3',
        ['-I', tuiDriver, 'claude', claudeBin, work, join(directory, 'screen.bin'), String(tuiSeconds), ...common],
        {
          cwd: work,
          env: { ...claudeEnv, TERM: 'xterm-256color' },
          deadline: scenario.deadline,
        },
      );
    } else {
      result = await run(
        claudeBin,
        [
          '-p',
          prompt,
          ...common,
          '--output-format',
          'stream-json',
          '--verbose',
          '--debug-file',
          join(directory, 'claude-debug.log'),
        ],
        { cwd: work, env: claudeEnv, deadline: scenario.deadline },
      );
    }
  }

  /* Give a late cancellation a moment to land in the probe log before reading it. */
  await sleep(500);
  mockProcess.kill('SIGTERM');
  writeFileSync(join(directory, 'client-output.txt'), result.output);

  const debugPath = join(directory, 'claude-debug.log');
  const clientLog =
    scenario.client === 'codex' ? result.output : existsSync(debugPath) ? readFileSync(debugPath, 'utf8') : '';
  const screenPath = join(directory, 'screen.bin');
  const screen = existsSync(screenPath) ? stripEscapes(readFileSync(screenPath, 'latin1')) : '';
  const appServer =
    scenario.mode === 'app-server'
      ? ((): unknown => {
          try {
            return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '') as unknown;
          } catch {
            return null;
          }
        })()
      : undefined;
  const events = readJsonl(probeLog);
  const start = events.find((event) => event['event'] === 'start');
  const arrived = (start?.['envNames'] as string[] | undefined) ?? [];
  const parentNames = Object.keys(
    scenario.client === 'codex'
      ? { ...env, CODEX_HOME: '', RUST_LOG: '' }
      : {
          ...env,
          ANTHROPIC_BASE_URL: '',
          ANTHROPIC_API_KEY: '',
          CLAUDE_CONFIG_DIR: '',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '',
          DISABLE_AUTOUPDATER: '',
        },
  );
  const listed = scenario.envVars ?? parentNames;
  const expected = listed.filter((name) => parentNames.includes(name)).sort();
  const call = events.find((event) => event['event'] === 'call');
  const callAt = typeof call?.['t'] === 'number' ? call['t'] : null;
  const progressSent = events
    .filter((event) => event['event'] === 'progress-sent')
    .map((event) => event['progress'] as number);
  const cancelled = events.filter(
    (event) => event['event'] === 'recv' && event['method'] === 'notifications/cancelled',
  );
  const closed = events.find((event) => event['event'] === 'stdin-closed' || event['event'] === 'signal');
  const modelEvents = readJsonl(modelLog);
  const initialize = events.find((event) => event['event'] === 'recv' && event['method'] === 'initialize');

  return {
    id: scenario.id,
    client: scenario.client,
    label: scenario.label,
    mode: scenario.mode ?? 'headless',
    manifest,
    exit: result.exit,
    killedAtDeadline: result.killed,
    clientDuration: result.ms,
    clientInfo: initialize?.['clientInfo'] ?? null,
    serverStarted: start !== undefined,
    env: {
      arrived,
      missingListed: expected.filter((name) => !arrived.includes(name)),
      unlistedArrived: arrived.filter((name) => !expected.includes(name)),
      decoysArrived: decoyNames.filter((name) => arrived.includes(name)),
      proxyCaArrived: proxyCaNames.filter((name) => arrived.includes(name)),
      tauArrived: tauNames.filter((name) => arrived.includes(name)),
    },
    call: call
      ? {
          name: call['name'],
          hasProgressToken: call['hasProgressToken'],
          progressTokenType: typeof call['progressToken'],
        }
      : null,
    progress: {
      sent: progressSent,
      monotonic: progressSent.every((value, index) => index === 0 || value > (progressSent[index - 1] ?? 0)),
      resultSent: events.some((event) => event['event'] === 'result-sent'),
      modelSawToolResult: modelEvents.some((event) => event['toolResultSeen'] === true),
      progressTextInClientStdout: /step \d of \d/u.test(result.stdout),
      clientLogProgressLines: clientLog.split('\n').filter((line) => /step \d of \d/u.test(line)).length,
      tuiProgressFrames:
        scenario.mode === 'tui'
          ? [...screen.matchAll(/step \d+ of \d+(?: \(\d+%\))?/gu)].map((match) => match[0])
          : null,
      tuiStepWords:
        scenario.mode === 'tui'
          ? [...screen.matchAll(/\b(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliet)\b/gu)]
              .map((match) => match[0])
              .filter((word, index, all) => all.indexOf(word) === index)
          : null,
      tuiPercentages:
        scenario.mode === 'tui'
          ? [...screen.matchAll(/\((\d+)%\)/gu)]
              .map((match) => Number(match[1]))
              .filter((value, index, all) => all.indexOf(value) === index)
          : null,
      tuiToolLines:
        scenario.mode === 'tui'
          ? [...screen.matchAll(/Call(?:ing|ed) probe[^\n]{0,40}/gu)].map((match) => match[0])
          : null,
      appServer: appServer ?? null,
      clientLogProgressSample: (clientLog.split('\n').find((line) => /step \d of \d/u.test(line)) ?? '')
        .replace(/^.*?(MCP server progress notification|\[DEBUG\]|\[INFO\])/u, '$1')
        .slice(0, 200),
    },
    cancellation: {
      cancelledNotifications: cancelled.map((event) => ({
        msAfterCall: callAt === null ? null : (event['t'] as number) - callAt,
        requestIdMatchesCall: String(event['requestId']) === String(call?.['id']),
        reason: event['reason'] ?? null,
      })),
      serverClosedMsAfterCall: closed && callAt !== null ? (closed['t'] as number) - callAt : null,
      serverCloseKind: closed?.['event'] ?? null,
      clientOutputMentionsTimeout: /timed? ?out|timeout/iu.test(result.output),
    },
    modelRequests: modelEvents.length,
  };
};

const timeoutSec = 5;
const scenarios: Scenario[] = [
  {
    id: 'codex-env-shipped',
    client: 'codex',
    label: 'Codex, shipped codex.json env_vars',
    tool: 'env_names',
    arguments: {},
    envVars: shippedCodexEnvVariables,
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'codex-env-proposed',
    client: 'codex',
    label: 'Codex, proposed env_vars (TAU_* + proxy/CA)',
    tool: 'env_names',
    arguments: {},
    envVars: proposedCodexEnvVariables,
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'codex-progress',
    client: 'codex',
    label: 'Codex, progress_probe 5 steps',
    tool: 'progress_probe',
    arguments: { steps: 5, interval: 300 },
    envVars: proposedCodexEnvVariables,
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'codex-timeout',
    client: 'codex',
    label: `Codex, hang with tool_timeout_sec=${timeoutSec}`,
    tool: 'hang',
    arguments: { limit: 120_000 },
    envVars: proposedCodexEnvVariables,
    toolTimeoutSec: timeoutSec,
    deadline: 90_000,
  },
  {
    id: 'codex-ca-only-ssl-cert-file',
    client: 'codex',
    label: 'Codex, env_vars [TAU_CLI], parent CA = SSL_CERT_FILE only',
    tool: 'env_names',
    arguments: {},
    envVars: ['TAU_CLI'],
    toolTimeoutSec: 900,
    dropEnv: [
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_DIR',
      'CURL_CA_BUNDLE',
      'REQUESTS_CA_BUNDLE',
      'PIP_CERT',
      'GIT_SSL_CAINFO',
      'CARGO_HTTP_CAINFO',
      'AWS_CA_BUNDLE',
      'NPM_CONFIG_CAFILE',
      'BUNDLE_SSL_CA_CERT',
    ],
    deadline: 90_000,
  },
  {
    id: 'codex-ca-none',
    client: 'codex',
    label: 'Codex, env_vars [TAU_CLI], no CA variable in the parent',
    tool: 'env_names',
    arguments: {},
    envVars: ['TAU_CLI'],
    toolTimeoutSec: 900,
    dropEnv: [
      'SSL_CERT_FILE',
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_DIR',
      'CURL_CA_BUNDLE',
      'REQUESTS_CA_BUNDLE',
      'PIP_CERT',
      'GIT_SSL_CAINFO',
      'CARGO_HTTP_CAINFO',
      'AWS_CA_BUNDLE',
      'NPM_CONFIG_CAFILE',
      'BUNDLE_SSL_CA_CERT',
    ],
    deadline: 90_000,
  },
  {
    id: 'claude-env',
    client: 'claude',
    label: 'Claude Code, claude.json shape (no env field)',
    tool: 'env_names',
    arguments: {},
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'claude-progress',
    client: 'claude',
    label: 'Claude Code, progress_probe 5 steps',
    tool: 'progress_probe',
    arguments: { steps: 5, interval: 300 },
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'claude-timeout-config',
    client: 'claude',
    label: `Claude Code, hang with server timeout=${timeoutSec * 1000} ms`,
    tool: 'hang',
    arguments: { limit: 120_000 },
    toolTimeoutSec: timeoutSec,
    deadline: 90_000,
  },
  {
    id: 'codex-app-server-progress',
    client: 'codex',
    mode: 'app-server',
    label: 'Codex app-server (the UI surface), progress_probe 5 steps',
    tool: 'progress_probe',
    arguments: { steps: 5, interval: 300 },
    envVars: proposedCodexEnvVariables,
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'codex-tui-progress',
    client: 'codex',
    mode: 'tui',
    label: 'Codex TUI under a pty, progress_probe 10 steps',
    tool: 'progress_probe',
    arguments: { steps: 10, interval: 800 },
    envVars: proposedCodexEnvVariables,
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'claude-tui-progress',
    client: 'claude',
    mode: 'tui',
    label: 'Claude Code TUI under a pty, progress_probe 10 steps',
    tool: 'progress_probe',
    arguments: { steps: 10, interval: 800 },
    toolTimeoutSec: 900,
    deadline: 90_000,
  },
  {
    id: 'claude-timeout-env',
    client: 'claude',
    label: `Claude Code, hang with MCP_TOOL_TIMEOUT=${timeoutSec * 1000} and no server timeout`,
    tool: 'hang',
    arguments: { limit: 120_000 },
    extraEnv: { MCP_TOOL_TIMEOUT: String(timeoutSec * 1000) },
    deadline: 90_000,
  },
];

const only = process.env['S25_ONLY'];
const results: JsonObject[] = [];
for (const scenario of scenarios.filter((entry) => !only || only.split(',').includes(entry.id))) {
  process.stderr.write(`s25: ${scenario.id}\n`);
  // eslint-disable-next-line no-await-in-loop -- scenarios share loopback ports and run one at a time.
  results.push(await runScenario(scenario));
}

writeFileSync(
  join(outDirectory, 's25.json'),
  `${JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, proxyCaNames, tauNames, decoyNames, results }, null, 2)}\n`,
);

/* One line per scenario for the job summary; names and counts only. */
for (const entry of results) {
  const env = entry['env'] as JsonObject;
  const progress = entry['progress'] as JsonObject;
  const cancellation = entry['cancellation'] as JsonObject;
  const cancels = cancellation['cancelledNotifications'] as JsonObject[];
  process.stdout.write(
    [
      entry['id'],
      `exit=${String(entry['exit'])}`,
      `token=${JSON.stringify((entry['call'] as JsonObject | undefined)?.['hasProgressToken'] ?? 'no-call')}`,
      `missingListed=${JSON.stringify(env['missingListed'])}`,
      `unlistedArrived=${JSON.stringify(env['unlistedArrived'])}`,
      `decoysArrived=${JSON.stringify(env['decoysArrived'])}`,
      `progressSent=${JSON.stringify(progress['sent'])}`,
      `clientLogProgressLines=${String(progress['clientLogProgressLines'])}`,
      ...(entry['mode'] === 'tui' ? [`tuiPercentages=${JSON.stringify(progress['tuiPercentages'])}`] : []),
      ...(entry['mode'] === 'app-server'
        ? [
            `appServerProgress=${JSON.stringify(((progress['appServer'] ?? {}) as JsonObject)['progressMessages'] ?? null)}`,
          ]
        : []),
      `cancelled=${cancels.length === 0 ? 'absent' : JSON.stringify(cancels)}`,
    ].join(' '),
  );
  process.stdout.write('\n');
}
