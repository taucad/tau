/**
 * The plugin's MCP server entry: `node dist/launch.mjs` in both hosts' configs.
 *
 * Starts the resolved Tau CLI's `mcp` command on this process's own stdio, so the
 * protocol runs between the host and the CLI untouched. Nothing here writes to
 * stdout, and the process ends with the CLI's exit code.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveTauCli } from '#resolve-tau-cli.js';
import type { TauCliCommand } from '#resolve-tau-cli.js';

const requiredNodeMajor = 24;

/** The proxy variables Node's `fetch` reads under `NODE_USE_ENV_PROXY=1`. */
const proxyVariables = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const;

const launch = (): void => {
  if (Number.parseInt(process.versions.node, 10) < requiredNodeMajor) {
    process.stderr.write(
      `tau: Node.js ${process.versions.node} started this plugin; the Tau CLI requires Node.js ${requiredNodeMajor} or later.\n`,
    );
  }

  let cli: TauCliCommand;
  try {
    cli = resolveTauCli({
      env: process.env,
      platform: process.platform,
      pluginRoot: fileURLToPath(new URL('..', import.meta.url)),
      execPath: process.execPath,
      fileExists: existsSync,
      readFile: (path) => readFileSync(path, 'utf8'),
    });
  } catch (error) {
    process.stderr.write(`tau: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  /* Windows runs `.cmd` shims (npx.cmd, an npm-installed tau.cmd) only through a shell. */
  const shell = process.platform === 'win32' && /\.(?:bat|cmd)$/iu.test(cli.command);
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
  /* Arguments after the launcher reach `tau mcp`: a Claude Desktop config names `--project` there. */
  const args = [...cli.args, ...process.argv.slice(2)];
  const child = spawn(shell ? `"${cli.command}"` : cli.command, args, { stdio: 'inherit', shell, env });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
  child.once('error', (error) => {
    process.stderr.write(`tau: cannot start ${cli.command}: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
};

launch();
