/**
 * A stand-in for `tau-windows-sandbox.exe` in orchestration tests: it speaks the framed launch protocol
 * (`windows-sandbox/README.md`) on stdin and stdout and answers `status` and `restore`, but **contains nothing** and
 * runs no shell. It proves the win32 provider's plumbing, ordering, settlement and recovery, never containment.
 *
 * It frames bytes itself rather than importing the provider's codec, so a codec bug cannot hide behind its own mirror.
 *
 * - `TAU_FIXTURE_SCENARIO` picks the behaviour (see {@link afterStart} and the `spec` branch).
 * - `TAU_FIXTURE_LOG` names a file each event is appended to as one JSON line.
 * - `TAU_FIXTURE_GATE` names a file the `gate` scenario waits for before it reports `exit`.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const scenario = process.env['TAU_FIXTURE_SCENARIO'] ?? 'echo';
const logPath = process.env['TAU_FIXTURE_LOG'];
const gatePath = process.env['TAU_FIXTURE_GATE'];
const [command, ...rest] = process.argv.slice(2);

const log = (entry: Record<string, unknown>): void => {
  if (logPath !== undefined) {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  }
};

const frame = (type: number, payload: string | Uint8Array<ArrayBuffer> = ''): void => {
  const bytes = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32LE(bytes.length, 1);
  process.stdout.write(Buffer.concat([header, bytes]));
};

const json = (type: number, value: unknown): void => {
  frame(type, JSON.stringify(value));
};

const leave = (code: number): void => {
  process.stdout.write('', () => {
    // oxlint-disable-next-line unicorn/no-process-exit -- the fixture is its own process.
    process.exit(code);
  });
};

/** Die at once, without reporting `exit` and leaving the journal behind, as a crashed helper does. */
const die = (code: number): void => {
  // oxlint-disable-next-line unicorn/no-process-exit -- the fixture is its own process.
  process.exit(code);
};

const text = (bytes: Uint8Array<ArrayBuffer>): string => Buffer.from(bytes).toString('utf8');

const status = (): void => {
  if (scenario === 'status-unreadable') {
    /* The helper's own answer when it cannot read its install record. */
    process.stderr.write('tau-windows-sandbox status: Access is denied. (os error 5)\n');
    process.stdout.write(JSON.stringify({ installed: false }));
    leave(0);
    return;
  }
  if (scenario === 'status-crash') {
    process.stdout.write('{"accountSid":');
    process.stderr.write('thread main panicked\n');
    leave(3);
    return;
  }
  process.stdout.write(
    scenario === 'installed'
      ? JSON.stringify({
          version: 1,
          account: 'TauSandbox',
          accountSid: 'S-1-5-21-1-2-3-1001',
          group: 'TauSandboxUsers',
          groupSid: 'S-1-5-21-1-2-3-1002',
          proxyPorts: [47_311, 47_312],
          firewallRules: [],
          forUser: 'S-1-5-21-1-2-3-500',
        })
      : JSON.stringify({ installed: false }),
  );
  leave(0);
};

const restore = (): void => {
  const journal = rest[1] ?? '';
  log({ event: 'restore', flag: rest[0], journal });
  if (scenario === 'restore-fails') {
    process.stderr.write('could not write the descriptor back');
    leave(1);
  } else {
    rmSync(journal, { force: true });
    leave(0);
  }
};

const launch = (): void => {
  let buffered = Buffer.alloc(0);
  let journal: string | undefined;
  let stdio: 'pipes' | 'terminal' = 'pipes';
  let ended = false;
  let specSeen = false;

  const finish = (exit: Record<string, unknown>): void => {
    if (ended) {
      return;
    }
    ended = true;
    if (journal !== undefined) {
      rmSync(journal, { force: true });
    }
    json(0x85, exit);
    leave(0);
  };

  /** What the shell does once the start barrier opens. */
  const afterStart = (): void => {
    if (scenario === 'refuse-after-start') {
      /* The runner could not start the shell: the helper restores, logs why and refuses, never `started`. */
      ended = true;
      if (journal !== undefined) {
        rmSync(journal, { force: true });
      }
      process.stderr.write('tau-windows-sandbox runner error: spawn: CreateProcessAsUserW (error 87)\n');
      json(0x86, {
        status: 'sandbox-unavailable',
        message: 'the shell could not be started',
        diagnostic: 'spawn: CreateProcessAsUserW (error 87)',
      });
      leave(0);
      return;
    }
    if (scenario === 'output-before-started') {
      frame(0x82, 'too soon');
      return;
    }
    json(0x87, { shellPid: process.pid });
    switch (scenario) {
      case 'echo': {
        frame(0x82, 'hello\n');
        frame(0x83, 'warn\n');
        finish({ exitCode: 0 });
        break;
      }
      case 'gate': {
        frame(0x82, 'waiting\n');
        const timer = setInterval(() => {
          if (gatePath !== undefined && existsSync(gatePath)) {
            clearInterval(timer);
            finish({ exitCode: 3 });
          }
        }, 10);
        break;
      }
      case 'cleanup-failed': {
        ended = true;
        json(0x88, { message: 'the job still has a process' });
        leave(0);
        break;
      }
      case 'crash': {
        ended = true;
        die(9);
        break;
      }
      case 'garbage': {
        frame(0x7f, 'nonsense');
        break;
      }
      case 'terminal': {
        frame(0x84, 'PS> ');
        break;
      }
      default: {
        /* `hang` and `ignore-terminate`: run until told otherwise. */
        break;
      }
    }
  };

  const handle = (type: number, payload: Uint8Array<ArrayBuffer>): void => {
    log({ event: 'frame', type });
    if (!specSeen) {
      if (type !== 0x01) {
        process.stderr.write('the first frame must be the spec');
        leave(2);
        return;
      }
      specSeen = true;
      const spec = JSON.parse(text(payload)) as {
        journal: string;
        stdio: { kind: 'pipes' | 'terminal' };
      };
      log({ event: 'spec', spec });
      stdio = spec.stdio.kind;
      switch (scenario) {
        case 'refuse-unsupported': {
          json(0x86, {
            status: 'unsupported',
            requirement: 'filesystem-mask',
            message: 'a denied path cannot be masked',
          });
          ended = true;
          leave(0);
          return;
        }
        case 'busy': {
          json(0x86, {
            status: 'sandbox-unavailable',
            requirement: 'exclusive-launch',
            message: 'another sandboxed launch kept its folder permissions locked for over 120 seconds',
          });
          ended = true;
          leave(0);
          return;
        }
        case 'refuse-unavailable': {
          json(0x86, {
            status: 'sandbox-unavailable',
            message: 'the sandbox account is not set up',
            diagnostic: 'install.json missing',
          });
          ended = true;
          leave(0);
          return;
        }
        case 'die-before-ready': {
          ended = true;
          process.stderr.write('boom: the runner could not be created');
          leave(3);
          return;
        }
        case 'never-ready': {
          return;
        }
        case 'early-output': {
          frame(0x82, 'too soon');
          return;
        }
        default: {
          /* Journal the descriptors it is about to change, as the real helper does before any ACL change. */
          journal = spec.journal;
          writeFileSync(journal, JSON.stringify({ entries: [] }));
          json(0x81, {
            launcherPid: process.pid,
            runnerPid: process.pid,
            capabilitySid: 'S-1-5-21-11-22-33-44',
            journal: scenario === 'wrong-journal' ? `${spec.journal}.elsewhere` : spec.journal,
          });
        }
      }
      return;
    }
    switch (type) {
      case 0x02: {
        const record = journal === undefined ? undefined : journal.replace(/\.acl\.json$/u, '.json');
        log({
          event: 'start',
          custody:
            record !== undefined && existsSync(record) ? (JSON.parse(readFileSync(record, 'utf8')) as unknown) : null,
        });
        afterStart();
        break;
      }
      case 0x03: {
        const typed = text(payload);
        log({ event: 'input', text: typed });
        if (stdio === 'terminal') {
          frame(0x84, payload);
          if (typed.includes('exit')) {
            finish({ exitCode: 0 });
          }
        }
        break;
      }
      case 0x04: {
        const size = JSON.parse(text(payload)) as {
          columns: number;
          rows: number;
        };
        log({ event: 'resize', size });
        frame(0x84, `resized ${String(size.columns)}x${String(size.rows)}`);
        break;
      }
      case 0x05: {
        log({ event: 'terminate' });
        if (scenario !== 'ignore-terminate') {
          finish({ signal: 'SIGKILL' });
        }
        break;
      }
      default: {
        process.stderr.write(`unknown host frame ${String(type)}`);
        leave(2);
      }
    }
  };

  process.stdin.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 5) {
      const type = buffered.readUInt8(0);
      const length = buffered.readUInt32LE(1);
      if (buffered.length < 5 + length) {
        break;
      }
      const payload = buffered.subarray(5, 5 + length);
      buffered = buffered.subarray(5 + length);
      handle(type, payload);
    }
  });
  process.stdin.on('end', () => {
    log({ event: 'stdin-closed' });
    /* Closing stdin is the same as terminate. */
    if (scenario !== 'ignore-terminate' && !ended) {
      if (specSeen && journal !== undefined) {
        finish({ signal: 'SIGKILL' });
      } else {
        leave(0);
      }
    }
  });
};

switch (command) {
  case 'status': {
    status();
    break;
  }
  case 'restore': {
    restore();
    break;
  }
  case 'launch': {
    launch();
    break;
  }
  default: {
    process.stderr.write(`unknown subcommand ${String(command)}`);
    leave(2);
  }
}
