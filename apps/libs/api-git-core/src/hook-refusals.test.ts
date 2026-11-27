import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { countedHookRefusalCodes, readHookRefusal } from '#hook-refusals.js';
import { hookRefusalCodes, preReceiveHookScript, retiredAuthorshipRefusals } from '#git.constants.js';
import { holdsHistory } from '#worker/storage-git.service.js';

const pkt = (payload: string | Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return Buffer.concat([Buffer.from((body.length + 4).toString(16).padStart(4, '0'), 'latin1'), body]);
};
const band = (number: 1 | 2, payload: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  pkt(Buffer.concat([Buffer.from([number]), typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload]));
const flush = Buffer.from('0000', 'latin1');

/**
 * A receive-pack response over `side-band-64k`, as git answers a push: the hook's stderr on band 2 (cut into the
 * given chunks), then the report-status as pkt-lines inside band 1.
 */
const response = (messages: readonly string[], status: readonly string[]): Uint8Array<ArrayBuffer> => {
  const report = Buffer.concat([...status.map((line) => pkt(`${line}\n`)), flush]);
  const bytes = Buffer.concat([...messages.map((chunk) => band(2, chunk)), band(1, report), flush]);
  return new Uint8Array(bytes);
};
const declined = ['unpack ok', 'ng refs/heads/main pre-receive hook declined'];

describe('readHookRefusal', () => {
  it('reads nothing from an accepted push, a flush-only probe, or a ref git itself refused', () => {
    expect(readHookRefusal(response([], ['unpack ok', 'ok refs/heads/main']))).toBeUndefined();
    expect(readHookRefusal(new Uint8Array(Buffer.from('0000')))).toBeUndefined();
    expect(readHookRefusal(response([], ['unpack ok', 'ng refs/heads/main failed to update ref']))).toBeUndefined();
  });

  it('reads each code line with its count, in the order the hook ranked them, and whether any is terminal', () => {
    const refusal = readHookRefusal(
      response(
        [
          'Tau-Code: GIT_PUSH_REF_NOT_PUSHABLE 2\nTau-Code: GIT_PUSH_NOT_FAST_FORWARD 1\n',
          'Tau: refused commit history on refs/remotes/x — host-local refs never leave a host.\nTau: nothing was written.\n',
        ],
        declined,
      ),
    );
    expect(refusal).toEqual({
      codes: [
        { code: 'GIT_PUSH_REF_NOT_PUSHABLE', count: 2 },
        { code: 'GIT_PUSH_NOT_FAST_FORWARD', count: 1 },
      ],
      terminal: true,
    });
  });

  it('reads a code line git cut across two side-band packets', () => {
    const refusal = readHookRefusal(response(['Tau-Code: GIT_PUSH_FI', 'LE_TOO_LARGE 1\nTau: refused…\n'], declined));
    expect(refusal?.codes).toEqual([{ code: 'GIT_PUSH_FILE_TOO_LARGE', count: 1 }]);
  });

  it('files quota, number-taken and a check that could not finish as not terminal', () => {
    for (const code of ['GIT_PUSH_QUOTA', 'GIT_PUSH_VERSION_NUMBER_TAKEN', 'GIT_PUSH_CHECK_FAILED']) {
      expect(readHookRefusal(response([`Tau-Code: ${code} 1\n`], declined))?.terminal, code).toBe(false);
    }
  });

  it('counts a code this build does not declare as other', () => {
    expect(readHookRefusal(response(['Tau-Code: GIT_PUSH_FROM_THE_FUTURE 1\n'], declined))?.codes).toEqual([
      { code: 'other', count: 1 },
    ]);
  });

  /* A tau-storage rolled back below WP2a prints the retired sentences with no code: `backup-retired-code` reads them. */
  it('counts an uncoded retired sentence under its retired code, and terminal', () => {
    const refusal = readHookRefusal(
      response(
        [
          `Tau: refused commit f063a0558c6f — ${retiredAuthorshipRefusals.GIT_PUSH_RECORD_UNREADABLE}\n`,
          `Tau: refused commit 85e6f95fc756 — ${retiredAuthorshipRefusals.GIT_PUSH_RECORD_UNREADABLE}\nTau: nothing was written.\n`,
        ],
        declined,
      ),
    );
    expect(refusal).toEqual({ codes: [{ code: 'GIT_PUSH_RECORD_UNREADABLE', count: 2 }], terminal: true });
  });

  it('counts a refusal with no code and no known sentence as unknown', () => {
    expect(readHookRefusal(response(['something went wrong\n'], declined))).toEqual({
      codes: [{ code: 'unknown', count: 1 }],
      terminal: false,
    });
    expect(readHookRefusal(response([], declined))?.codes).toEqual([{ code: 'unknown', count: 1 }]);
  });

  it("classifies git's own unpack failures: a pack over the bound, and anything else", () => {
    expect(
      readHookRefusal(
        response(
          ['fatal: pack exceeds maximum allowed size\n'],
          ['unpack index-pack abnormal exit', 'ng refs/heads/main unpacker error'],
        ),
      ),
    ).toEqual({ codes: [{ code: 'GIT_PUSH_TOO_LARGE', count: 1 }], terminal: true });
    expect(
      readHookRefusal(
        response(
          ['error: object 1234: badTree\n'],
          ['unpack index-pack abnormal exit', 'ng refs/heads/main unpacker error'],
        ),
      ),
    ).toEqual({ codes: [{ code: 'GIT_PUSH_OBJECT_INVALID', count: 1 }], terminal: true });
  });

  it('counts under exactly the hook codes, the retired four, git receive codes, unknown and other', () => {
    expect(countedHookRefusalCodes).toEqual([
      ...Object.keys(hookRefusalCodes),
      ...Object.keys(retiredAuthorshipRefusals),
      'GIT_PUSH_TOO_LARGE',
      'GIT_PUSH_OBJECT_INVALID',
      'unknown',
      'other',
    ]);
  });
});

/* R3-1: a first backup is one whose manifest held no branch and no tag, whatever record refs landed before it. */
describe('holdsHistory', () => {
  it('counts branches and tags as history, and record refs as none', () => {
    expect(holdsHistory({})).toBe(false);
    expect(holdsHistory({ 'refs/tau/ops/device-a': {}, 'refs/tau/chats/chat_1': {} })).toBe(false);
    expect(holdsHistory({ 'refs/tau/ops/device-a': {}, 'refs/heads/main': {} })).toBe(true);
    expect(holdsHistory({ 'refs/tags/v2': {} })).toBe(true);
  });
});

/** The installed hook's own output, read back the way tau-api reads a push it refused. */
describe('readHookRefusal over the installed hook', () => {
  let directory: string;
  let hook: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'tau-hook-refusals-'));
    hook = path.join(directory, 'pre-receive');
    await writeFile(hook, preReceiveHookScript, 'utf8');
    await chmod(hook, 0o755);
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const run = async (lines: string, environment: Record<string, string>): Promise<string> =>
    new Promise((resolve) => {
      const child = spawn('sh', [hook], {
        cwd: directory,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
        env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', ...environment } as unknown as NodeJS.ProcessEnv,
      });
      const stderr: Array<Uint8Array<ArrayBuffer>> = [];
      child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => stderr.push(chunk));
      child.stdin.on('error', () => undefined);
      child.stdin.end(lines);
      child.on('close', () => {
        resolve(Buffer.concat(stderr).toString('utf8'));
      });
    });

  it('reads the admission refusal and the host-local refusal under their codes', async () => {
    const notAdmitted = await run(`${'0'.repeat(40)} ${'1'.repeat(40)} refs/heads/main\n`, {});
    expect(readHookRefusal(response([notAdmitted], declined))).toEqual({
      codes: [{ code: 'GIT_PUSH_NOT_ADMITTED', count: 1 }],
      terminal: true,
    });
    const hostLocal = await run(`${'0'.repeat(40)} ${'1'.repeat(40)} refs/remotes/origin/main\n`, {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- process environment name
      TAU_GIT_PUSH_ADMITTED: '1',
    });
    expect(readHookRefusal(response([hostLocal], declined))?.codes).toEqual([
      { code: 'GIT_PUSH_REF_NOT_PUSHABLE', count: 1 },
    ]);
  });
});
