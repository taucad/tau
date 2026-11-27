/**
 * A stand-in for `tau-windows-sandbox.exe` in the native adapter's orchestration tests: it speaks the framed launch
 * protocol (`windows-sandbox/README.md`, native launches) and answers `restore`, but **contains nothing** and runs no
 * worker. Its "worker" echoes standard input to standard output. It proves the adapter's plumbing, ordering and
 * recovery, never containment.
 *
 * It frames bytes itself rather than importing the protocol codec, so a codec bug cannot hide behind its own mirror.
 *
 * - `TAU_FIXTURE_SCENARIO`: `echo` (default), `refuse`, `crash` (journals, then dies after `started`), `cleanup-failed`,
 *   `garbage` (an unknown frame after `started`), `stale` (refuses as an app update's stale runner copy does).
 * - `TAU_FIXTURE_LOG`: a file each event is appended to as one JSON line.
 */
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';

const scenario = process.env['TAU_FIXTURE_SCENARIO'] ?? 'echo';
const logPath = process.env['TAU_FIXTURE_LOG'];
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

if (command === 'restore') {
  const journal = rest[1] ?? '';
  log({ event: 'restore', flag: rest[0], journal });
  rmSync(journal, { force: true });
  leave(0);
} else if (command === 'launch') {
  let buffered = Buffer.alloc(0);
  let journal = '';
  let started = false;
  let ended = false;

  const finish = (exit: Record<string, unknown>): void => {
    if (ended) {
      return;
    }
    ended = true;
    rmSync(journal, { force: true });
    json(0x85, exit);
    leave(0);
  };

  const handle = (type: number, payload: Uint8Array<ArrayBuffer>): void => {
    log({ event: 'frame', type, ...(type === 0x03 ? { input: Buffer.from(payload).toString('utf8') } : {}) });
    switch (type) {
      case 0x01: {
        const spec = JSON.parse(Buffer.from(payload).toString('utf8')) as { journal: string };
        log({ event: 'spec', spec });
        journal = spec.journal;
        if (scenario === 'refuse') {
          ended = true;
          json(0x86, { status: 'sandbox-unavailable', message: 'the executable digest does not match' });
          leave(0);
          return;
        }
        if (scenario === 'stale') {
          ended = true;
          json(0x86, { status: 'sandbox-unavailable', message: 'the sandbox runner needs repair (run setup again)' });
          leave(0);
          return;
        }
        writeFileSync(journal, '{}');
        json(0x81, { launcherPid: process.pid, runnerPid: process.pid, capabilitySid: 'S-1-5-21-1-2-3-4', journal });
        return;
      }
      case 0x02: {
        started = true;
        json(0x87, { shellPid: process.pid });
        if (scenario === 'crash') {
          // oxlint-disable-next-line unicorn/no-process-exit -- dies without reporting exit, leaving the journal.
          process.exit(9);
        }
        if (scenario === 'garbage') {
          frame(0x7f, 'nonsense');
          return;
        }
        if (scenario === 'cleanup-failed') {
          ended = true;
          json(0x88, { message: 'the job still has a process' });
          leave(0);
        }
        return;
      }
      case 0x03: {
        if (started) {
          frame(0x82, payload);
        }
        return;
      }
      case 0x06: {
        frame(0x83, 'stdin closed\n');
        finish({ exitCode: 0 });
        return;
      }
      case 0x05: {
        finish({ exitCode: 1 });
        return;
      }
      default: {
        process.stderr.write(`unexpected frame 0x${type.toString(16)}`);
        leave(2);
      }
    }
  };

  process.stdin.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 5) {
      const length = buffered.readUInt32LE(1);
      if (buffered.length < 5 + length) {
        break;
      }
      const type = buffered.readUInt8(0);
      const payload = new Uint8Array(buffered.subarray(5, 5 + length));
      buffered = buffered.subarray(5 + length);
      handle(type, payload);
    }
  });
  process.stdin.on('end', () => {
    // A closed control channel ends the job, as the real helper's kill-on-close does.
    finish({ exitCode: 1 });
  });
} else {
  process.stderr.write(`unknown command ${String(command)}`);
  leave(2);
}
