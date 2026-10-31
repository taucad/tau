/**
 * W2 S2 interactive PTY driver: Git for Windows Bash inside a ConPTY, run INSIDE the fallback's
 * write-restricted token as the non-admin sandbox user.
 *
 * Why not PowerShell: in runs 40023733988..40030269086, cmd.exe started as the sandbox user inside
 * the token but pwsh stalled during startup on both rows, so the earlier s2-pty.ps1 child never
 * produced a receipt. This driver is plain Node (no .NET), uses node-pty's ConPTY binding as the
 * PTY master, and drives real Bash through it.
 *
 * Launched by fallback.ps1 (the orchestrator) as:
 *   node s2-bash-pty.mts <receiptPath> <bashPath> <scratchDir>
 * The driver is the PTY master, so every check below is decided from the terminal output stream it
 * reads, never from a Bash exit code. Markers are split in the typed command (`"MK_"X`) so the echo
 * of the typed line can never satisfy a wait; only Bash's own output can. Likewise `"S""Z_..._E""ND"`.
 *
 * Checks (all gated):
 *   s2.bash.start         Bash started in the pseudoconsole and answered a marker
 *   s2.tty.attached       `test -t 0 && test -t 1` inside Bash
 *   s2.pty.resize         after resize(100x40), `stty size` reports "40 100"
 *   s2.ctrlc.interrupt    0x03 interrupts a foreground `sleep 30`; `$?` is 130 well under 30s
 *   s2.jobcontrol         `sleep 300 &` is listed Running by `jobs`, `kill %1` ends it (wait -> 143)
 *   s2.unicode.utf8RoundTrip  typed UTF-8 is echoed back intact and written to a file Bash owns
 * Ctrl-Z (SIGTSTP) suspension is recorded as informational evidence only.
 *
 * Synthetic only, no secrets. The receipt is written synchronously before exit.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Verdict = 'pass' | 'fail' | 'info';
type Check = { id: string; expect: string; observed: string; verdict: Verdict; detail?: unknown };
type Pty = {
  onData: (cb: (d: string) => void) => void;
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void;
  write: (d: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};
type NodePty = { spawn: (file: string, args: string[], opts: Record<string, unknown>) => Pty };

const [receiptPath = '', bashPath = '', scratch = ''] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const checks: Check[] = [];
const add = (id: string, expect: string, observed: string, ok: boolean, detail?: unknown): void => {
  checks.push({ id, expect, observed, verdict: ok ? 'pass' : 'fail', detail });
};
const info = (id: string, expect: string, observed: string, detail?: unknown): void => {
  checks.push({ id, expect, observed, verdict: 'info', detail });
};

// Breadcrumb first: separates "node never started" from "node started, Bash stalled".
try {
  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, 'driver-started.txt'), 'STARTED');
} catch {
  // the receipt still records what happened
}

let transcript = '';
let exitInfo: { exitCode: number; signal?: number } | undefined;
const identity: Record<string, unknown> = { nodeUser: userInfo().username, bashPath };

function finish(): never {
  const required = checks.filter((c) => c.verdict !== 'info');
  const verdict = required.length > 0 && required.every((c) => c.verdict === 'pass') ? 'pass' : 'fail';
  const receipt = {
    kind: 's2-bash-pty-in-token',
    identity,
    conclusion: `S2 Bash-in-ConPTY inside the write-restricted token: ${checks
      .filter((c) => c.verdict !== 'info')
      .map((c) => `${c.id}=${c.verdict}`)
      .join(' ')} verdict=${verdict}`,
    checks,
    bashExit: exitInfo ?? null,
    transcriptTail: transcript.slice(-4000),
    verdict,
  };
  try {
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    writeFileSync(join(scratch, 's2-bash-transcript.txt'), transcript);
  } catch {
    // nothing more can be recorded
  }
  process.exit(verdict === 'pass' ? 0 : 1);
}

// Hard bound: the orchestrator kills at 180s; always write a receipt well before that.
setTimeout(() => {
  add('s2.driver.watchdog', 'driver finished within 150s', 'watchdog fired', false);
  finish();
}, 150_000).unref();

const sleep = async (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let nodePty: NodePty;
try {
  nodePty = createRequire(join(here, 'package.json'))('node-pty') as NodePty;
} catch (error) {
  add('s2.nodepty.load', 'node-pty ConPTY binding loads as the sandbox user', String(error), false);
  finish();
}

let term: Pty;
try {
  term = nodePty.spawn(bashPath, ['--noprofile', '--norc', '-i'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 25,
    cwd: scratch,
    env: {
      ...process.env,
      HOME: scratch,
      TEMP: scratch,
      TMP: scratch,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PS1: '$ ',
      CHERE_INVOKING: '1',
    },
  });
} catch (error) {
  add('s2.bash.start', 'Bash spawned inside a ConPTY pseudoconsole', `spawn threw: ${String(error)}`, false);
  finish();
}
term.onData((d) => {
  transcript += d;
});
term.onExit((e) => {
  exitInfo = e;
});

/** Wait until `re` matches output produced after `from`; returns the match or undefined on timeout. */
const waitFor = async (re: RegExp, from: number, ms: number): Promise<RegExpMatchArray | undefined> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = transcript.slice(from).match(re);
    if (m) {
      return m;
    }
    if (exitInfo) {
      return undefined;
    }
    await sleep(100);
  }
  return undefined;
};
/** Type one line and wait for its marker in the output that follows; undefined on timeout. */
const run = async (line: string, re: RegExp, ms = 15_000): Promise<RegExpMatchArray | undefined> => {
  const from = transcript.length;
  term.write(`${line}\r`);
  return waitFor(re, from, ms);
};

const main = async (): Promise<void> => {
  const ready = await run('echo "RDY_"$((40+2))', /RDY_42/, 30_000);
  add(
    's2.bash.start',
    'Bash started inside the pseudoconsole and answered a marker',
    ready ? 'answered RDY_42' : `no answer (exit=${JSON.stringify(exitInfo ?? null)})`,
    Boolean(ready),
    { exit: exitInfo ?? null, firstOutput: transcript.slice(0, 600) },
  );
  if (!ready) {
    return;
  }

  const who = await run('echo "W""HO_$(whoami)_E""ND"; echo "B""V_${BASH_VERSION}_E""ND"', /BV_([^\r\n]*)_END/);
  identity['bashWhoami'] = /WHO_([^\r\n]*?)_END/.exec(transcript)?.[1] ?? null;
  identity['bashVersion'] = who?.[1] ?? null;

  const tty = await run('if test -t 0 && test -t 1; then echo "TTY_"YES; else echo "TTY_"NO; fi; tty', /TTY_(YES|NO)/);
  add(
    's2.tty.attached',
    'stdin and stdout of the interactive Bash are a terminal (test -t 0/1)',
    tty?.[0] ?? 'no answer',
    tty?.[1] === 'YES',
  );

  term.resize(100, 40);
  await sleep(700);
  const size = await run('echo "S""Z_$(stty size)_E""ND"', /SZ_([^\r\n]*)_END/);
  add(
    's2.pty.resize',
    'after resize(100 cols, 40 rows), stty size reports "40 100"',
    size?.[1] ?? 'no answer',
    size?.[1]?.trim() === '40 100',
  );

  const ccFrom = transcript.length;
  const ccStart = Date.now();
  term.write('sleep 30\r');
  await sleep(1500);
  term.write('\x03');
  await sleep(300);
  term.write('echo "C""C_$?_E""ND"\r');
  const cc = await waitFor(/CC_(\d+)_END/, ccFrom, 20_000);
  const ccMs = Date.now() - ccStart;
  add(
    's2.ctrlc.interrupt',
    '0x03 interrupts a foreground `sleep 30`; $? is 130 and the prompt returns in under 10s',
    `rc=${cc?.[1] ?? 'none'} elapsedMs=${ccMs}`,
    cc?.[1] === '130' && ccMs < 10_000,
    { elapsedMs: ccMs },
  );

  const jobsOut = await run('sleep 300 & jobs -l; echo "JB_"DONE', /JB_DONE/);
  const listed = Boolean(jobsOut) && /\[1\][^\r\n]*Running[^\r\n]*sleep 300/.test(transcript.slice(-2000));
  const killed = await run('kill %1; wait %1; echo "K""L_$?_E""ND"', /KL_(\d+)_END/);
  add(
    's2.jobcontrol',
    'background job: `sleep 300 &` listed Running by `jobs`, `kill %1` terminates it (wait -> 143)',
    `listedRunning=${listed} waitRc=${killed?.[1] ?? 'none'}`,
    listed && killed?.[1] === '143',
  );

  // Ctrl-Z: informational (POSIX suspension inside MSYS2; not gated).
  const zFrom = transcript.length;
  term.write('sleep 30\r');
  await sleep(1500);
  term.write('\x1a');
  await sleep(500);
  term.write('jobs; echo "SZZ_"DONE\r');
  const z = await waitFor(/SZZ_DONE/, zFrom, 10_000);
  const stopped = Boolean(z) && /Stopped/.test(transcript.slice(zFrom));
  info(
    's2.jobcontrol.suspend',
    'Ctrl-Z suspends a foreground `sleep 30` (jobs shows Stopped); informational',
    `stopped=${stopped}`,
  );
  await run('kill -9 %1 2>/dev/null; echo "ZK_"DONE', /ZK_DONE/, 5000);

  const sample = 'café ✓ 日本 😀';
  const u8 = await run(
    `printf '%s' '${sample}' > "$HOME/u8.txt"; echo "U""8_$(cat "$HOME/u8.txt")_E""ND"`,
    /U8_([^\r\n]*)_END/,
  );
  let fileBytes = '';
  try {
    fileBytes = readFileSync(join(scratch, 'u8.txt')).toString('hex');
  } catch {
    // stays empty
  }
  const wantBytes = Buffer.from(sample, 'utf8').toString('hex');
  add(
    's2.unicode.utf8RoundTrip',
    'typed UTF-8 (accented, CJK, emoji) echoes back intact through the pty and lands as exact UTF-8 bytes in a file Bash wrote',
    `echoed=${u8?.[1] === sample} fileBytesMatch=${fileBytes === wantBytes}`,
    u8?.[1] === sample && fileBytes === wantBytes,
    { echoed: u8?.[1] ?? null, fileBytes, wantBytes },
  );

  term.write('exit\r');
  await sleep(1500);
};

await main();
try {
  term!.kill();
} catch {
  // already gone
}
finish();
