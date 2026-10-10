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
  const child = spawn(shell ? `"${cli.command}"` : cli.command, cli.args, { stdio: 'inherit', shell });

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
