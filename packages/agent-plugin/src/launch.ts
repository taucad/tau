/**
 * The plugin's MCP server entry: `node dist/launch.mjs` in both hosts' configs.
 *
 * Starts the resolved Tau CLI's `mcp` command on this process's own stdio, so the
 * protocol runs between the host and the CLI untouched. Nothing here writes to
 * stdout, and the process ends with the CLI's exit code, or with the preflight's
 * when `npx` would fail to fetch it.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { notOnPath, preflight, startable, versionOf } from '#preflight.js';
import { resolveTauCli } from '#resolve-tau-cli.js';
import type { TauCliCommand } from '#resolve-tau-cli.js';

/** The proxy variables Node's `fetch` reads under `NODE_USE_ENV_PROXY=1`. */
const proxyVariables = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const;

const launch = (): void => {
  let cli: TauCliCommand;
  try {
    cli = resolveTauCli({
      env: process.env,
      platform: process.platform,
      pluginRoot: fileURLToPath(new URL('..', import.meta.url)),
      execPath: process.execPath,
      fileExists: existsSync,
      readFile: (path) => readFileSync(path, 'utf8'),
      versionOf,
    });
  } catch (error) {
    process.stderr.write(`tau: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  /* Only `npx` depends on this Node.js, npm and npm's cache: checking them first turns a host's
   * 30 s timeout into one line. */
  const failure = cli.source === 'npx' ? preflight().failure : undefined;
  if (failure) {
    process.stderr.write(failure.message);
    process.exitCode = failure.code;
    return;
  }

  const { command, args, cliVersion, pluginVersion, ...launched } = cli;
  /* The viewer page ships in the plugin (blueprint D2); the environment, not a
   * flag, names it so a CLI that predates the viewer ignores it. */
  const viewerPage = fileURLToPath(new URL('../dist-app/app.html', import.meta.url));
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (existsSync(viewerPage)) {
    env['TAU_VIEWER_PAGE'] = viewerPage;
  }
  /* Node's fetch honours a proxy only when told so at start (D9): `tau mcp` prepares native kernels with it. */
  if (proxyVariables.some((name) => (process.env[name] ?? '') !== '') && env['NODE_USE_ENV_PROXY'] === undefined) {
    env['NODE_USE_ENV_PROXY'] = '1';
  }
  /* Which CLI this is and why, for `tau mcp` to report: `source`, `path`, `cli`, `plugin`, `node` and `skipped`. */
  env['TAU_LAUNCH'] = JSON.stringify({
    ...launched,
    cli: cliVersion,
    plugin: pluginVersion,
    node: process.versions.node,
  });
  const cannotStart = (error: Error): void => {
    process.stderr.write(`tau: cannot start ${command}: ${error.message}\n`);
    process.exitCode = 1;
  };
  /* Arguments after the launcher reach `tau mcp`: a Claude Desktop config names `--project` there. Windows starts
   * a `.cmd` shim (npx.cmd, an npm-installed tau.cmd) through `cmd.exe`, each argument escaped for it. */
  const start = startable(command, [...args, ...process.argv.slice(2)]);
  if (start === undefined) {
    cannotStart(notOnPath(command));
    return;
  }
  try {
    const child = spawn(start.file, start.args, {
      stdio: 'inherit',
      windowsVerbatimArguments: start.windowsVerbatimArguments,
      env,
    });

    /* Stopping is the CLI's to do; the launcher waits for it and exits with its code. POSIX hosts signal the
     * launcher alone, so it passes the signal on. Windows delivers no SIGTERM a process can handle, and Ctrl+C
     * reaches every process on the console, the CLI included; `child.kill` there would end only `cmd.exe` and
     * orphan the CLI on the host's pipes. A Windows host stops the server by closing its stdin, which the CLI
     * reads as the end of the session. */
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        if (process.platform !== 'win32') {
          child.kill(signal);
        }
      });
    }
    child.once('error', cannotStart);
    child.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  } catch (error) {
    /* `spawn` throws, rather than emits, a failure such as E2BIG (an argument or variable past the system's
     * limit): the same one line, not a stack. */
    cannotStart(error as Error);
  }
};

launch();
