/**
 * One spike supervisor: one immutable sandbox profile for its whole life (blueprint D6).
 *
 * Reads a {@link SupervisorJob} as JSON on stdin, initializes the pinned sandbox runtime once with
 * that profile, runs each command as `bash --noprofile --norc -c <command>` inside it with closed
 * stdin, and prints one JSON result per line. A timeout cancels the command the way the product
 * would: the POSIX process group gets TERM then KILL; on Windows the `srt-win` broker is killed and
 * its kill-on-close job reaps the sandboxed tree. Nothing ever runs outside the sandbox: a failed
 * initialization prints an error result for every run and exits nonzero.
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { text } from 'node:stream/consumers';

import { SandboxManager } from '@anthropic-ai/sandbox-runtime';

import type { SupervisorJob, SupervisorResult, SupervisorRun } from './lib.mts';
import { isWindows, sleep } from './lib.mts';

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

const job = JSON.parse(await text(process.stdin)) as SupervisorJob;
const profile = job.profile as Parameters<typeof SandboxManager.initialize>[0];

const filesystem = profile.filesystem as { allowWrite: string[] };
const [home, temporary] = [filesystem.allowWrite[1]!, filesystem.allowWrite[2]!];

/** The spawn vector for one run: SRT's wrapper around a Bash that reads no startup files. */
const vector = async (run: SupervisorRun): Promise<{ argv: string[]; env: NodeJS.ProcessEnv }> => {
  if (isWindows) {
    const wrapped = await SandboxManager.wrapWithSandboxArgv(
      run.command,
      { exe: job.bash, args: ['--noprofile', '--norc', '-c'] },
      undefined,
      undefined,
      run.cwd,
      { commandId: run.id },
    );
    // `srt-win exec` overlays exactly its `--env` pairs on the sandbox user's fresh profile; the
    // private HOME/TEMP and synthetic probe values ride the same overlay, before the `--`.
    const separator = wrapped.argv.indexOf('--');
    const extra = Object.entries({ HOME: home, TMP: temporary, TEMP: temporary, ...run.env }).flatMap(
      ([key, value]) => ['--env', `${key}=${value}`],
    );
    wrapped.argv.splice(separator, 0, ...extra);
    return wrapped;
  }
  const assignments = Object.entries({ HOME: home, TMPDIR: temporary, ...run.env })
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(' ');
  const inner = `${assignments} exec ${quote(job.bash)} --noprofile --norc -c ${quote(run.command)}`;
  const wrapped = await SandboxManager.wrapWithSandboxArgv(inner, '/bin/sh', undefined, undefined, run.cwd, {
    commandId: run.id,
  });
  return {
    argv: wrapped.argv,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', HOME: home, TMPDIR: temporary },
  };
};

const execute = async (run: SupervisorRun): Promise<SupervisorResult> => {
  const started = Date.now();
  const { argv, env } = await vector(run);
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd: run.cwd,
    env,
    shell: false,
    detached: !isWindows,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end();
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout = (stdout + chunk).slice(-65_536)));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-65_536)));
  let timedOut = false;
  const cancel = async (): Promise<void> => {
    timedOut = true;
    if (isWindows) {
      child.kill('SIGKILL');
      return;
    }
    try {
      process.kill(-child.pid!, 'SIGTERM');
      await sleep(1000);
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      // The group already exited.
    }
  };
  const timer = setTimeout(() => void cancel(), run.timeoutMs ?? 60_000);
  const [exitCode, signal] = await new Promise<[number | null, string | null]>((resolveExit) => {
    child.once('error', (error) => {
      stderr += `\nspawn error: ${error.message}`;
      resolveExit([null, null]);
    });
    // `exit`, not `close`: an escaped descendant may hold the pipes open, which is itself evidence.
    child.once('exit', (code, exitSignal) => resolveExit([code, exitSignal]));
  });
  clearTimeout(timer);
  await sleep(300);
  child.stdout.destroy();
  child.stderr.destroy();
  return { id: run.id, exitCode, signal, stdout, stderr, durationMs: Date.now() - started, timedOut, argv0: argv[0] };
};

try {
  await SandboxManager.initialize(profile);
} catch (error) {
  for (const run of job.runs) {
    const result: SupervisorResult = {
      id: run.id,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      timedOut: false,
      error: `sandbox initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
  process.exit(2);
}

if (job.readyFile) {
  writeFileSync(job.readyFile, JSON.stringify({ pid: process.pid }));
}
for (const run of job.runs) {
  let result: SupervisorResult;
  try {
    result = await execute(run);
  } catch (error) {
    result = {
      id: run.id,
      exitCode: null,
      signal: null,
      stdout: '',
      stderr: '',
      durationMs: 0,
      timedOut: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (job.holdUntil) {
  const deadline = Date.now() + 120_000;
  while (!existsSync(job.holdUntil) && Date.now() < deadline) {
    await sleep(100);
  }
}
await SandboxManager.reset();
process.exit(0);
