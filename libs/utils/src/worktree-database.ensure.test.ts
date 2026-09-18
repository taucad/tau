import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ensureWorktreeDatabase } from '#worktree-database.utils.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

const url = 'postgresql://dev_user:dev_password@localhost:5432/tau_dev';
const fork = 'tau_dev_tau_chat_admission_closeout';
const staging = `${fork}_forking`;

type Call = readonly string[];

/** Script the container: `answers` is consulted per docker call in order. */
const scriptDocker = (answers: ReadonlyArray<string | Error>): Call[] => {
  const calls: Call[] = [];
  let index = 0;
  vi.mocked(execFileSync).mockImplementation(((file: string, args: readonly string[]) => {
    if (file === 'git') {
      return '/repo/.git/worktrees/tau-chat-admission-closeout\n/repo/.git\n';
    }
    calls.push(args);
    const answer = answers[index++] ?? '';
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }) as typeof execFileSync);
  return calls;
};

const sql = (call: Call): string => call.at(-1) ?? '';

describe('ensureWorktreeDatabase', () => {
  it('restores into a staging name and renames it in one step', () => {
    const calls = scriptDocker(['', '', '', '']);
    expect(ensureWorktreeDatabase(url)).toBe(`postgresql://dev_user:dev_password@localhost:5432/${fork}`);
    const [exists, create, restore, rename] = calls;
    expect(sql(exists!)).toContain(`datname = '${fork}'`);
    expect(create).toEqual(['exec', 'tau-postgres', 'createdb', '-U', 'dev_user', staging]);
    expect(sql(restore!)).toMatch(new RegExp(String.raw`pg_dump -U dev_user tau_dev \| psql .* -d ${staging}$`, 'u'));
    expect(sql(rename!)).toBe(`ALTER DATABASE "${staging}" RENAME TO "${fork}"`);
    expect(calls.some((call) => call.includes('createdb') && call.includes(fork))).toBe(false);
  });

  it('waits for the other starter when the staging name is taken', () => {
    const calls = scriptDocker(['', new Error('database "…_forking" already exists'), '', '1']);
    expect(ensureWorktreeDatabase(url)).toBe(`postgresql://dev_user:dev_password@localhost:5432/${fork}`);
    expect(calls.filter((call) => sql(call).includes(`datname = '${fork}'`))).toHaveLength(3);
    expect(calls.some((call) => sql(call).includes('pg_dump'))).toBe(false);
  });

  it('drops the staging database when the restore fails', () => {
    scriptDocker(['', '', new Error('psql: ERROR'), '']);
    expect(() => ensureWorktreeDatabase(url)).toThrow(/Forking database "tau_dev"/u);
    expect(
      vi
        .mocked(execFileSync)
        .mock.calls.some(([, args]) => (args as string[]).includes('dropdb') && (args as string[]).includes(staging)),
    ).toBe(true);
  });
});
