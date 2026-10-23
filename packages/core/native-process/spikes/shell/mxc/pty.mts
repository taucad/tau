/**
 * W2 PTY row (D14): a real ConPTY terminal running INTERACTIVE PowerShell (-NoLogo -NoProfile, the
 * D14 Terminal-pane argv), on windows-2025. node-pty on Windows uses ConPTY; the probe spawns the
 * resolved PowerShell as a pty, writes a command, and the verdict is that the harness reads a marker
 * back from the terminal stream (external to any in-shell claim). node-pty / ConPTY absent, or no
 * marker observed, is a typed fail — never a green.
 *
 * This is the Terminal-pane half of D14 ("the same shell interactively ... over ConPTY"); the agent
 * (-Command) half is exercised by the in-MXC probes.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  type Check,
  check,
  isWindows,
  laneIdentity,
  mxcDirectory,
  nonce,
  outDir,
  resolveWindowsShell,
  sleep,
  writeJson,
} from './mxc-lib.mts';

type IPty = {
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  kill: (signal?: string) => void;
};
type NodePty = { spawn: (file: string, args: readonly string[], options: Record<string, unknown>) => IPty };

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const out = outDir();
  const shell = resolveWindowsShell();

  const fail = (reason: string, detail?: unknown): void => {
    checks.push(
      check(
        'pty.conpty.powershell',
        'interactive PowerShell over a ConPTY terminal (marker echoed back)',
        reason,
        false,
        detail,
      ),
    );
    writeJson(join(out, 'pty.receipt.json'), { kind: 'pty', identity: laneIdentity(), shell, checks, verdict: 'fail' });
    // eslint-disable-next-line no-console
    console.log(`[mxc:pty] fail — ${reason}`);
    process.exitCode = 1;
  };

  if (!isWindows) {
    fail(`not a Windows host (${process.platform})`);
    return;
  }
  if (!shell.path) {
    fail('no trusted PowerShell at the D14 fixed paths (shell-missing)');
    return;
  }

  let nodePty: NodePty;
  try {
    const req = createRequire(join(mxcDirectory, 'package.json'));
    nodePty = req('node-pty') as NodePty;
  } catch (error) {
    fail('node-pty not resolvable (ConPTY binding unavailable)', String(error));
    return;
  }

  const marker = `PTY-OK-${nonce()}`;
  let buffer = '';
  let exited = false;
  let term: IPty;
  try {
    // ptyArgv is the D14 Terminal-pane argv (-NoLogo -NoProfile), interactive (no -Command).
    term = nodePty.spawn(shell.path, [...shell.ptyArgv], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: out,
      env: process.env,
      useConpty: true,
    });
  } catch (error) {
    fail('ConPTY spawn of interactive PowerShell failed', String(error));
    return;
  }
  term.onData((data) => (buffer += data));
  term.onExit(() => (exited = true));

  // Drive the interactive session: emit a marker, then exit.
  await sleep(1500);
  term.write(`Write-Output '${marker}'\r`);
  await sleep(1500);
  term.write('exit\r');

  const deadline = Date.now() + 10_000;
  while (!exited && Date.now() < deadline && !buffer.includes(marker)) {
    await sleep(200);
  }
  try {
    term.kill();
  } catch {
    /* already exited */
  }

  const seen = buffer.includes(marker);
  checks.push(
    check(
      'pty.conpty.powershell',
      'interactive PowerShell over a ConPTY terminal (marker echoed back)',
      seen ? 'marker observed' : 'marker NOT observed',
      seen,
      {
        shellKind: shell.kind,
        ptyArgv: shell.ptyArgv,
        bytes: buffer.length,
        tail: buffer.slice(-400),
      },
    ),
  );
  const receipt = { kind: 'pty', identity: laneIdentity(), shell, marker, checks, verdict: seen ? 'pass' : 'fail' };
  writeJson(join(out, 'pty.receipt.json'), receipt);
  // eslint-disable-next-line no-console
  console.log(`[mxc:pty] ${receipt.verdict} — conpty interactive ${shell.kind} marker=${seen}`);
  // The receipt is written synchronously above; exit now so node-pty's ConPTY teardown does not emit
  // its benign conpty_console_list_agent AttachConsole stack trace to the step log (cosmetic noise).
  process.exit(seen ? 0 : 1);
};

await main();
