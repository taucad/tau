/**
 * `node <plugin folder>/dist/doctor.mjs [--json]`: why a host has no Tau tools, one line per check.
 *
 * Checks, in order: Node.js, npm and its cache (the launcher's own preflight), each host and the plugin's state
 * in it, which Tau CLI the launcher would run, the npm registry, a live `initialize` through the launcher and the
 * skills. Each line is `ok`, `warn` or `fail`, a check name and its detail; `next` lines hold the commands to run.
 * The exit code is the first failure's: 2 Node.js, 3 npm's cache, 4 npm, 5 the server, 6 the plugin is disabled.
 * Imports nothing but Node.js, so it runs from any installed plugin folder.
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { probeServer } from '#doctor-probe.js';
import { nodeFailure, npmPreflight, versionOf } from '#preflight.js';
import type { PreflightFailure } from '#preflight.js';
import { resolveTauCli } from '#resolve-tau-cli.js';
import type { TauCliCommand } from '#resolve-tau-cli.js';

type Status = 'ok' | 'warn' | 'fail';

/** One check's verdict: its detail line and, for a failure, the exit code it stands for. */
type Check = { readonly status: Status; readonly detail: string; readonly code?: number };

const windows = process.platform === 'win32';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const json = process.argv.includes('--json');
const next: string[] = [];
let exitCode = 0;

/**
 * Record a check: print its line (unless `--json`) and keep the first failure's exit code.
 *
 * @param name - The check's fixed name.
 * @param check - Its verdict.
 * @returns The same verdict, for the JSON report.
 */
const report = <T extends Check>(name: string, check: T): T => {
  if (check.status === 'fail' && exitCode === 0) {
    exitCode = check.code ?? 1;
  }
  if (!json) {
    process.stdout.write(`${check.status.padEnd(6)}${name.padEnd(10)}${check.detail}\n`);
  }
  return check;
};

/**
 * Run a command to completion with nothing on its standard input.
 *
 * @param command - The executable, found on `PATH`.
 * @param args - Its arguments.
 * @param killTimeout - Milliseconds before it is killed.
 * @returns Whether it exited 0, and what it printed, trimmed.
 */
const run = (
  command: string,
  args: readonly string[],
  killTimeout: number,
): { readonly ok: boolean; readonly stdout: string; readonly stderr: string } => {
  /* Windows starts the hosts' and npm's `.cmd` shims only through a shell. */
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: killTimeout,
    shell: windows,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /* A command that could not start (not on `PATH`) has no output at all, whatever the types say. */
  if (result.error !== undefined) {
    return { ok: false, stdout: '', stderr: result.error.message };
  }
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};

/**
 * A preflight failure as a check: its line without the `tau: ` prefix, and its fix as a `next` line.
 *
 * @param failure - The launcher's failure.
 * @returns The failed check.
 */
const failed = (failure: PreflightFailure): Check => {
  const [detail = '', fix] = failure.message
    .trim()
    .replace(/^tau: /u, '')
    .split('; ');
  if (fix) {
    next.push(fix.replace(/^run: /u, ''));
  }
  return { status: 'fail', detail, code: failure.code };
};

const pluginVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string }).version;
if (!json) {
  process.stdout.write(`tau doctor: plugin ${pluginVersion ?? '(no version)'} at ${root}\n`);
}

const tooOld = nodeFailure();
const nodeVerdict: Pick<Check, 'status' | 'code'> = tooOld ? failed(tooOld) : { status: 'ok' };
const node = report('node', {
  ...nodeVerdict,
  detail: `v${process.versions.node} (needs 24+)`,
  version: process.versions.node,
});

const npmFound = npmPreflight();
const npm = report(
  'npm',
  npmFound.failure
    ? failed(npmFound.failure)
    : {
        status: npmFound.cache ? 'ok' : 'warn',
        detail: `${npmFound.npm} (needs 11+), ${npmFound.cache ? `cache ${npmFound.cache} writable` : 'npm does not print its cache folder, so it was not checked'}`,
        version: npmFound.npm,
        cache: npmFound.cache,
      },
);

/** A `tau@<catalog>` plugin as a host lists it. */
type HostPlugin = { readonly id: string; readonly version?: string; readonly enabled: boolean; readonly state: string };

/** How a host lists its plugins, and the commands that enable or install Tau there. */
type HostSpec = {
  readonly plugins: (listed: unknown) => readonly HostPlugin[];
  readonly enable: (id: string) => string;
  readonly install: string;
};

const hostSpecs: Readonly<Record<'claude' | 'codex', HostSpec>> = {
  claude: {
    plugins: (listed) =>
      (listed as ReadonlyArray<{ id: string; version?: string; enabled?: boolean; scope?: string }>).map((entry) => ({
        id: entry.id,
        version: entry.version,
        enabled: entry.enabled === true,
        state: `${entry.enabled === true ? 'enabled' : 'disabled'} (${entry.scope ?? 'unknown'} scope)`,
      })),
    enable: (id) => `claude plugin enable ${id}`,
    install: 'claude plugin install tau --marketplace taucad/marketplace',
  },
  codex: {
    plugins: (listed) =>
      (
        (
          listed as {
            installed?: ReadonlyArray<{ pluginId: string; version?: string; installed?: boolean; enabled?: boolean }>;
          }
        ).installed ?? []
      )
        .filter((entry) => entry.installed !== false)
        .map((entry) => ({
          id: entry.pluginId,
          version: entry.version,
          enabled: entry.enabled === true,
          state: `installed, ${entry.enabled === true ? 'enabled' : 'disabled'}`,
        })),
    enable: (id) => `set enabled = true under [plugins."${id}"] in ~/.codex/config.toml`,
    install: 'codex plugin marketplace add taucad/marketplace && codex plugin add tau@taucad',
  },
};

/**
 * Whether a host is on `PATH` and has Tau enabled: a missing host or plugin is a warning, a disabled one fails.
 *
 * @param host - The host's command.
 * @param spec - How it lists plugins.
 * @returns The host's check, with its version and Tau plugins.
 */
const hostCheck = (host: string, spec: HostSpec): Check & { version?: string; plugins?: readonly HostPlugin[] } => {
  const version = run(host, ['--version'], 20_000);
  if (!version.ok) {
    return { status: 'warn', detail: 'not on PATH' };
  }
  /* `2.1.303 (Claude Code)` and `codex-cli 0.163.0`: the token that starts with a digit. */
  const hostVersion = version.stdout.split(/\s+/u).find((token) => /^\d/u.test(token)) ?? version.stdout;
  let plugins: readonly HostPlugin[];
  try {
    plugins = spec
      .plugins(JSON.parse(run(host, ['plugin', 'list', '--json'], 20_000).stdout))
      .filter((entry) => entry.id.startsWith('tau@'));
  } catch {
    return { status: 'warn', detail: `${hostVersion}; \`${host} plugin list --json\` failed`, version: hostVersion };
  }
  if (plugins.length === 0) {
    next.push(spec.install);
    return { status: 'warn', detail: `${hostVersion}; tau is not installed`, version: hostVersion, plugins };
  }
  const detail = `${hostVersion}; ${plugins.map((entry) => `${entry.id} ${entry.version ?? ''} ${entry.state}`).join(', ')}`;
  if (plugins.some((entry) => entry.enabled)) {
    return { status: 'ok', detail, version: hostVersion, plugins };
  }
  next.push(spec.enable(plugins[0]!.id));
  return { status: 'fail', detail, code: 6, version: hostVersion, plugins };
};

const hosts = {
  claude: report('claude', hostCheck('claude', hostSpecs.claude)),
  codex: report('codex', hostCheck('codex', hostSpecs.codex)),
};

let resolved: TauCliCommand | undefined;
let cli: Check & Record<string, unknown>;
try {
  resolved = resolveTauCli({
    env: process.env,
    platform: process.platform,
    pluginRoot: root,
    execPath: process.execPath,
    fileExists: existsSync,
    readFile: (path) => readFileSync(path, 'utf8'),
    versionOf,
  });
  const { command, args, ...facts } = resolved;
  const skipped = resolved.skipped
    .map((entry) => `installed tau ${entry.version ?? 'of unknown version'} at ${entry.path} skipped`)
    .join('; ');
  const install = `npm install -g @taucad/cli@${resolved.pluginVersion}`;
  if (resolved.source === 'npx') {
    next.push(install);
    cli = {
      status: 'warn',
      detail: `${skipped ? `${skipped} (plugin ${resolved.pluginVersion})` : 'no installed tau'}; npx will run, and its first start can take minutes`,
      ...facts,
    };
  } else {
    const ran = {
      explicit: `TAU_CLI ${resolved.path} ${resolved.cliVersion ?? '(no version)'}`,
      workspace: 'the checkout build (.dev/cli.json)',
      installed: `installed tau ${resolved.cliVersion} at ${resolved.path}`,
    }[resolved.source];
    cli = { status: 'ok', detail: skipped ? `${ran}; ${skipped}` : ran, ...facts };
  }
} catch (error) {
  cli = { status: 'fail', detail: error instanceof Error ? error.message : String(error), code: 5 };
}
report('cli', cli);

let registry: Check & { version?: string };
if (npm.status === 'fail') {
  registry = { status: 'warn', detail: 'not checked: npm failed' };
} else {
  const started = Date.now();
  /* Shows npm's own words for a private registry, an expired token or no network, which the hosts reduce to one line. */
  const viewed = run(windows ? 'npm.cmd' : 'npm', ['view', '@taucad/agent-plugin@beta', 'version'], 60_000);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  registry = viewed.ok
    ? {
        status: viewed.stdout === pluginVersion ? 'ok' : 'warn',
        detail: `@taucad/agent-plugin@beta = ${viewed.stdout} (npm view, ${seconds} s)${viewed.stdout === pluginVersion ? '' : `; this plugin is ${pluginVersion}`}`,
        version: viewed.stdout,
      }
    : {
        status: 'warn',
        detail: `npm view @taucad/agent-plugin@beta failed after ${seconds} s: ${viewed.stderr === '' ? 'no output' : viewed.stderr.split('\n').slice(0, 2).join(' ')}`,
      };
}
report('registry', registry);

const probe = await probeServer(root);
const problems = [
  ...(probe.error ? [/^tau: .*$/mu.exec(probe.error)?.[0] ?? probe.error.split('\n')[0]] : []),
  ...(probe.missingTools?.length ? [`missing ${probe.missingTools.join(', ')}`] : []),
  ...(probe.error !== undefined || probe.viewer !== undefined ? [] : ['no ui://tau/ viewer resource']),
];
const server = report('server', {
  ...probe,
  ...(problems.length > 0
    ? { status: 'fail' as Status, detail: problems.join('; '), code: 5 }
    : {
        status: 'ok' as Status,
        detail: `initialize ${((probe.initializeDuration ?? 0) / 1000).toFixed(1)} s; ${probe.serverInfo?.name} ${probe.serverInfo?.version}; ${String(probe.tools?.length)} tools; viewer resource ${probe.viewer}`,
      }),
});

const skillsFolder = join(root, 'skills');
const names = existsSync(skillsFolder)
  ? readdirSync(skillsFolder)
      .filter((name) => existsSync(join(skillsFolder, name, 'SKILL.md')))
      .toSorted()
  : [];
const skills = report('skills', {
  status: names.includes('tau') ? 'ok' : 'warn',
  detail: `${String(names.length)}: ${names.join(', ')}`,
  names,
});

if (server.status === 'ok') {
  const serving = /^Tau CLI \S+/u.exec(probe.identity ?? '')?.[0] ?? `Tau CLI ${pluginVersion}`;
  next.push(
    `start a new chat (in Claude Code /mcp and /reload-plugins, in Codex a new thread); the Tau tools are present when the server instructions contain "${serving}"`,
  );
}

if (json) {
  process.stdout.write(
    `${JSON.stringify({ plugin: { version: pluginVersion, root }, node, npm, hosts, cli, registry, server, skills, next }, null, 2)}\n`,
  );
} else {
  for (const line of next) {
    process.stdout.write(`next  ${line}\n`);
  }
}
process.exitCode = exitCode;
