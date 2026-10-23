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
import { spawn } from 'node:child_process';
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

// The read loop is bounded, but node-pty's Windows ConPTY teardown can leave a short-lived console
// helper that INHERITED this process's stdout pipe; it outlives process.exit(), so the Actions step
// never sees EOF and hangs to the job timeout. hardExit force-kills our whole process tree (taskkill
// /T) as a detached, pipe-less child so every helper dies and the step's stdout closes promptly.
const WATCHDOG_MS = 60_000;

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const out = outDir();
  const shell = resolveWindowsShell();
  let buffer = '';
  let term: IPty | undefined;
  let done = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  const hardExit = (code: number): never => {
    if (watchdog) {
      clearTimeout(watchdog);
    }
    try {
      spawn('taskkill', ['/pid', String(process.pid), '/t', '/f'], { detached: true, stdio: 'ignore' }).unref();
    } catch {
      /* taskkill unavailable (non-Windows); fall through to a plain exit */
    }
    process.exit(code);
  };

  const fail = (reason: string, detail?: unknown): void => {
    if (watchdog) {
      clearTimeout(watchdog);
    }
    done = true;
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

  // Backstop: if anything below blocks (ConPTY never yields the marker or never exits), record a
  // TYPED pty-timeout receipt (verdict fail, not a containment finding) and force-exit — never hang.
  watchdog = setTimeout(() => {
    if (!done) {
      done = true;
      const timeoutCheck = check(
        'pty.conpty.powershell',
        'interactive PowerShell over a ConPTY terminal (marker echoed back)',
        'pty-timeout: watchdog expired before marker/exit',
        false,
        { watchdogMs: WATCHDOG_MS, bytes: buffer.length, tail: buffer.slice(-400) },
      );
      writeJson(join(out, 'pty.receipt.json'), {
        kind: 'pty',
        identity: laneIdentity(),
        shell,
        checks: [timeoutCheck],
        verdict: 'fail',
        conclusion:
          'PTY probe exceeded its in-process watchdog and was force-terminated (typed pty-timeout); this is a harness timeout, not a containment finding.',
      });
      // eslint-disable-next-line no-console
      console.log('[mxc:pty] fail — pty-timeout (watchdog expired)');
    }
    try {
      term?.kill();
    } catch {
      /* already gone */
    }
    hardExit(1);
  }, WATCHDOG_MS);
  watchdog.unref();

  let nodePty: NodePty;
  try {
    const req = createRequire(join(mxcDirectory, 'package.json'));
    nodePty = req('node-pty') as NodePty;
  } catch (error) {
    fail('node-pty not resolvable (ConPTY binding unavailable)', String(error));
    return;
  }

  const marker = `PTY-OK-${nonce()}`;
  let exited = false;
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
  done = true;
  const receipt = { kind: 'pty', identity: laneIdentity(), shell, marker, checks, verdict: seen ? 'pass' : 'fail' };
  writeJson(join(out, 'pty.receipt.json'), receipt);
  // eslint-disable-next-line no-console
  console.log(`[mxc:pty] ${receipt.verdict} — conpty interactive ${shell.kind} marker=${seen}`);
  // The receipt is written synchronously above; hardExit now so node-pty's ConPTY console helper
  // cannot keep the step's stdout pipe open (which hung the step to the job timeout) and so its
  // benign conpty_console_list_agent AttachConsole trace never reaches the log.
  hardExit(seen ? 0 : 1);
};

await main();
