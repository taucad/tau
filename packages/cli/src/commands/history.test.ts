/**
 * `tau history` and `tau version` over a real project directory and a real `git`.
 *
 * The claim is headless parity (S13, AC5): what the verb prints is what the
 * port holds, not a second reading of the graph. The suite runs where `git`
 * resolves and is skipped where it does not, exactly as the port's own
 * conformance rows are.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { openProjectRevisions, requireRevisionToolchain } from '@taucad/host';
import type * as HostModule from '@taucad/host';
import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exitCodes } from '#output.js';

const execute = promisify(execFile);
const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');

/**
 * Run the real `tau` entry the way a person types it, never rejecting, so a refusal reports its output.
 *
 * @param args - The words after `tau`.
 * @returns What it printed and its exit code.
 */
const runTau = async (args: readonly string[]): Promise<Readonly<{ stdout: string; stderr: string; code: number }>> => {
  try {
    const { stdout, stderr } = await execute(process.execPath, ['--import', 'tsx', binPath, ...args], {
      cwd: repoRoot,
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', code: failure.code ?? 1 };
  }
};

/* I7: pre-release, no alias. `tau revisions` is gone, and `tau` says so as it says it of any word it does not know. */
describe('tau revisions', () => {
  it('exits with the unknown-command usage error', async () => {
    const run = await runTau(['revisions', 'log']);
    expect(run.code).toBe(exitCodes.usage);
    expect(run.stderr).toMatch(/Unknown command `?revisions`?/u);
    expect(run.stdout).toBe('');
  }, 60_000);
});
/* The fixture's commits must not pick up the operator's own git configuration.
 * Environment names, not identifiers: assigned rather than spelled as keys. */
const seedEnvironment: NodeJS.ProcessEnv = { ...process.env };
seedEnvironment['GIT_CONFIG_GLOBAL'] = '/dev/null';
seedEnvironment['GIT_CONFIG_SYSTEM'] = '/dev/null';
/* The same `git` + `git lfs` probe the command refuses on, so a machine without
 * `git-lfs` skips these rows instead of failing them with that refusal. */
const gitToolchainOnPath = await requireRevisionToolchain().then(
  () => true,
  () => false,
);

describe.runIf(gitToolchainOnPath)('historyCommand', () => {
  let project: string;
  let config: string;
  let stdout: string[];

  const captureStdout = (): void => {
    vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array<ArrayBuffer>,
      ...rest: readonly unknown[]
    ): boolean => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const callback = rest.at(-1);
      if (typeof callback === 'function') {
        (callback as () => void)();
      }
      return true;
    }) as typeof process.stdout.write);
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    project = await mkdtemp(join(tmpdir(), 'tau-cli-revisions-'));
    config = await mkdtemp(join(tmpdir(), 'tau-cli-revisions-config-'));
    process.env['TAU_CONFIG_DIR'] = config;
    stdout = [];
    captureStdout();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env['TAU_CONFIG_DIR'];
    await Promise.all([rm(project, { recursive: true, force: true }), rm(config, { recursive: true, force: true })]);
  });

  /**
   * Two revisions on `main`, recorded with stock `git`.
   *
   * Deliberately not through Tau's own writer: a project a person cloned, or one
   * `jj`/`git` wrote, is the same project to these verbs, and this is the
   * cheapest place to keep that true.
   */
  const seed = async (): Promise<void> => {
    await execute('git', ['init', '--quiet', '--initial-branch=main', project]);
    for (const [index, content] of ['one', 'two'].entries()) {
      // oxlint-disable-next-line no-await-in-loop -- a chain is ordered by construction.
      await writeFile(join(project, 'part.ts'), `${content}\n`);
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await execute('git', ['-C', project, 'add', 'part.ts']);
      // oxlint-disable-next-line no-await-in-loop -- ditto.
      await execute(
        'git',
        [
          '-C',
          project,
          '-c',
          'user.name=ada',
          '-c',
          'user.email=ada@tau.invalid',
          'commit',
          '--quiet',
          '-m',
          `Revision ${String(index + 1)}`,
        ],
        { env: seedEnvironment },
      );
    }
  };

  const importCommand = async () => {
    const { historyCommand } = await import('#commands/history.js');
    return historyCommand;
  };

  const importVersionCommand = async () => {
    const { versionCommand } = await import('#commands/history.js');
    return versionCommand;
  };

  it('lists what the port holds by short id and title, with no number on an entry (M11)', async () => {
    await seed();
    await runCommand(await importCommand(), { rawArgs: ['log', '--project', project] });
    const printed = stdout.join('');
    expect(printed).not.toMatch(/\bRev \d/u);
    expect(printed).toContain('main');

    const revisions = await openProjectRevisions({ workspaceRoot: project });
    try {
      const rows = await revisions.log();
      expect(printed.trim().split('\n')).toHaveLength(rows.length);
      for (const row of rows) {
        expect(printed).toContain(row.summary);
        expect(printed).toContain(row.revisionId.slice(0, 7));
      }
    } finally {
      await revisions.close();
    }
  }, 60_000);

  it('says where the project is in the words a person reads', async () => {
    await seed();
    await runCommand(await importCommand(), { rawArgs: ['describe', '--project', project] });
    const printed = stdout.join('');
    expect(printed.split('\n')[0]).toBe('main');
    for (const jargon of ['checkout', 'worktree', 'lease', 'HEAD', 'Rev ', 'revision']) {
      expect(printed).not.toContain(jargon);
    }
  }, 60_000);

  it('refuses a directory that has no history, with the code a script reads', async () => {
    const outcome = await runCommand(await importCommand(), { rawArgs: ['log', '--project', project] }).then(
      () => undefined,
      (error: unknown) => error as { readonly code?: string; readonly exit?: number },
    );
    expect(outcome?.code).toBe('NO_HISTORY');
    expect(outcome?.exit).toBe(exitCodes.refused);
  }, 60_000);

  /* Was red (P2): a project Tau did not write has no provenance trailer, and the
   * reader dated every one of its revisions to the Unix epoch. The commit itself
   * carries the date git shows. */
  it('dates a revision it did not write by the revision itself, not the epoch', async () => {
    await seed();
    const revisions = await openProjectRevisions({ workspaceRoot: project });
    try {
      const rows = await revisions.log();
      expect(rows[0]?.createdAt).toBeGreaterThan(Date.UTC(2020, 0, 1));
    } finally {
      await revisions.close();
    }
  }, 60_000);

  it('names the files one revision changed', async () => {
    await seed();
    const revisions = await openProjectRevisions({ workspaceRoot: project });
    const rows = await revisions.log();
    await revisions.close();
    await runCommand(await importCommand(), {
      rawArgs: ['diff', rows[1]!.revisionId, rows[0]!.revisionId, '--project', project],
    });
    expect(stdout.join('')).toContain('part.ts');
  }, 60_000);

  it('saves the project’s files as the entry the log then lists first', async () => {
    await seed();
    await writeFile(join(project, 'bracket.ts'), 'export const bracket = 3;\n');
    await runCommand(await importCommand(), { rawArgs: ['save', '--project', project] });

    const revisions = await openProjectRevisions({ workspaceRoot: project });
    try {
      const [latest] = await revisions.log();
      expect(latest?.revisionNumber).toBe(3);
      expect(stdout.join('')).toBe('Saved on main. Saved on this device.\n');
      expect(await revisions.diff(undefined, latest?.revisionId ?? '')).toContainEqual(
        expect.objectContaining({ path: 'bracket.ts' }),
      );
    } finally {
      await revisions.close();
    }
  }, 60_000);

  /*
   * A1: a save with a token records the token's account, under its no-reply
   * address, and never the account's email, the OS login name or an address
   * from the environment. A token the API refuses names no one: the save is
   * this device's pseudonym.
   */
  describe('who a save records', () => {
    const accountEmail = 'account-email-a1@example.invalid';
    const environmentEmail = 'environment-email-a1@example.invalid';
    let server: Server;
    let accepted: boolean;

    beforeEach(async () => {
      accepted = true;
      server = createServer((request, response) => {
        if (request.url === '/v1/auth/get-session' && request.headers.authorization === 'Bearer tok-a1') {
          response.writeHead(accepted ? 200 : 401, { 'content-type': 'application/json' });
          response.end(
            accepted
              ? JSON.stringify({
                  user: { id: 'usr_cli_a1', email: accountEmail, name: 'Terminal Person' },
                  session: { expiresAt: '2099-01-01T00:00:00.000Z' },
                })
              : 'null',
          );
          return;
        }
        response.writeHead(404).end();
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      const { port } = server.address() as AddressInfo;
      process.env['TAU_API_URL'] = `http://127.0.0.1:${String(port)}`;
      process.env['TAU_AUTH_TOKEN'] = 'tok-a1';
      process.env['EMAIL'] = environmentEmail;
      process.env['GIT_AUTHOR_EMAIL'] = environmentEmail;
    });

    afterEach(async () => {
      delete process.env['TAU_API_URL'];
      delete process.env['TAU_AUTH_TOKEN'];
      delete process.env['EMAIL'];
      delete process.env['GIT_AUTHOR_EMAIL'];
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    });

    const savedAuthor = async (): Promise<string> => {
      await seed();
      await writeFile(join(project, 'bracket.ts'), 'export const bracket = 3;\n');
      await runCommand(await importCommand(), { rawArgs: ['save', '--project', project] });
      expect(stdout.join('')).toMatch(/^Saved on main\./u);
      const { stdout: commit } = await execute('git', ['-C', project, 'cat-file', 'commit', 'refs/heads/main']);
      for (const forbidden of [accountEmail, environmentEmail, userInfo().username]) {
        expect(commit).not.toContain(`<${forbidden}`);
        expect(commit).not.toContain(`${forbidden}>`);
      }
      const { stdout: address } = await execute('git', ['-C', project, 'log', '-1', '--format=%ae', 'refs/heads/main']);
      return address.trim();
    };

    it('records the account the token belongs to', async () => {
      expect(await savedAuthor()).toBe('usr_cli_a1@users.noreply.tau.new');
    }, 60_000);

    it('records this device’s pseudonym when the API does not accept the token', async () => {
      accepted = false;
      expect(await savedAuthor()).toMatch(/^anon:[\da-f]{8}@users\.noreply\.tau\.new$/u);
    }, 60_000);

    /* K1: a version names the account that made it, as a save does, and never Tau or an address. */
    it('records the account the token belongs to as a version’s tagger', async () => {
      await seed();
      await runCommand(await importVersionCommand(), { rawArgs: ['create', 'Ready for print', '--project', project] });

      const { stdout: tag } = await execute('git', ['-C', project, 'cat-file', 'tag', 'refs/tags/v2']);
      const tagger = /^tagger .*<(?<address>[^>]+)>/mu.exec(tag)?.groups?.['address'];
      expect(tagger).toBe('usr_cli_a1@users.noreply.tau.new');
      for (const forbidden of [accountEmail, environmentEmail, userInfo().username]) {
        expect(tag).not.toContain(`<${forbidden}`);
      }
    }, 60_000);

    /*
     * B5: `log --provenance` prints what each entry's trailer recorded — its
     * ids, identity, capture and leg — and never an address, whether the
     * account's, the environment's or the OS login's.
     */
    it('prints each entry’s recorded provenance, and no address (B5)', async () => {
      await savedAuthor();
      accepted = false;
      await writeFile(join(project, 'lid.ts'), 'export const lid = 1;\n');
      await runCommand(await importCommand(), { rawArgs: ['save', '--project', project] });
      stdout.length = 0;

      await runCommand(await importCommand(), { rawArgs: ['log', '--provenance', '--project', project] });
      const printed = stdout.join('');
      for (const forbidden of [accountEmail, environmentEmail, '@users.noreply', `<${userInfo().username}`]) {
        expect(printed).not.toContain(forbidden);
      }
      /* Object ids, times and the pseudonym's hash differ per run; the shape between them does not. */
      const oids = new Map<string, string>();
      const stable = printed
        .replaceAll(/\b[\da-f]{40}\b/gu, (oid) => {
          oids.set(oid, oids.get(oid) ?? `<oid ${String(oids.size + 1)}>`);
          return oids.get(oid)!;
        })
        .replaceAll(/^ {4} {2}[\da-f]{7} {2}\d{4}-\d\d-\d\d \d\d:\d\d/gmu, '<short id>  <time>')
        .replaceAll(/anon:[\da-f]{8}/gu, 'anon:<hash>');
      expect(stable).toMatchInlineSnapshot(`
        "<short id>  <time>  main  anon:<hash>  Saved changes (save)
          id        <oid 1>
          tree      <oid 2>
          parent    <oid 3>
          source    user
          identity  user anon:<hash> (anonymous)
          capture   save
          via       cli
        <short id>  <time>  main  usr_cli_a1  Saved changes (save)
          id        <oid 3>
          tree      <oid 4>
          parent    <oid 5>
          source    user
          identity  user usr_cli_a1
          capture   save
          via       cli
        <short id>  <time>  main  ada  Revision 2
          id        <oid 5>
          tree      <oid 6>
          parent    <oid 7>
          source    import
          identity  not recorded
          capture   not recorded
          via       not recorded
        <short id>  <time>  main  ada  Revision 1
          id        <oid 7>
          tree      <oid 8>
          parent    none
          source    import
          identity  not recorded
          capture   not recorded
          via       not recorded
        "
      `);
    }, 60_000);

    it('carries the same provenance on each JSON row, without an address (B5)', async () => {
      await savedAuthor();
      stdout.length = 0;

      await runCommand(await importCommand(), {
        rawArgs: ['log', '--provenance', '--json', '--limit', '1', '--project', project],
      });
      const printed = stdout.join('');
      expect(printed).not.toContain(accountEmail);
      const record = JSON.parse(printed) as { entries: ReadonlyArray<Record<string, unknown>> };
      /* M11: an entry carries no per-branch number in JSON either. */
      expect(record.entries[0]).not.toHaveProperty('revisionNumber');
      expect(record).toMatchObject({
        kind: 'history',
        entries: [
          {
            provenance: {
              identity: { kind: 'user', id: 'usr_cli_a1' },
              capture: 'save',
              via: 'cli',
              source: 'user',
            },
          },
        ],
      });
    }, 60_000);
  });

  it('says there is nothing new to save, and mints nothing, when the files are the last entry', async () => {
    await seed();
    const command = await importCommand();
    await writeFile(join(project, 'bracket.ts'), 'export const bracket = 3;\n');
    await runCommand(command, { rawArgs: ['save', '--project', project] });
    stdout.length = 0;

    await runCommand(command, { rawArgs: ['save', '--project', project, '--json'] });
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      kind: 'history-save',
      ok: true,
      status: 'unchanged',
      line: 'main',
    });
  }, 60_000);

  it('refuses a save the host refused, in the host’s words and with the code a script reads', async () => {
    await seed();
    const reason = 'Something else changed this project first. Try again.';
    vi.resetModules();
    vi.doMock('@taucad/host', async (importOriginal) => {
      const host = await importOriginal<typeof HostModule>();
      return {
        ...host,
        openProjectRevisions: async (options: Parameters<typeof host.openProjectRevisions>[0]) => ({
          ...(await host.openProjectRevisions(options)),
          save: async () => ({ status: 'refused', reason }) as const,
        }),
      };
    });
    try {
      const outcome = await runCommand(await importCommand(), { rawArgs: ['save', '--project', project] }).then(
        () => undefined,
        (error: unknown) => error as { readonly code?: string; readonly exit?: number; readonly message?: string },
      );
      expect(outcome).toMatchObject({ code: 'SAVE_REFUSED', exit: exitCodes.refused, message: reason });
    } finally {
      vi.doUnmock('@taucad/host');
      vi.resetModules();
    }
  }, 60_000);

  it('creates a version named with spaces, lists it by its number and renames it keeping that number', async () => {
    await seed();
    const version = await importVersionCommand();

    await runCommand(version, { rawArgs: ['create', 'Ready for print', '--project', project] });
    expect(stdout.join('')).toMatch(/^Created V2 · Ready for print at [\da-f]{7}\. Saved on this device\.\n$/u);
    stdout.length = 0;

    await runCommand(version, { rawArgs: ['rename', 'V2', 'Fit check', '--project', project] });
    expect(stdout.join('')).toBe('Renamed V2 to Fit check. Saved on this device.\n');
    stdout.length = 0;

    /* By its current name too. */
    await runCommand(version, { rawArgs: ['rename', 'Fit check', 'Fit check, final', '--project', project] });
    expect(stdout.join('')).toBe('Renamed V2 to Fit check, final. Saved on this device.\n');
    stdout.length = 0;

    await runCommand(version, { rawArgs: ['list', '--project', project] });
    expect(stdout.join('')).toMatch(/^V2 {4}[\da-f]{7} {2}Fit check, final\n$/u);
    stdout.length = 0;

    /* The history row a version names leads with its number. */
    await runCommand(await importCommand(), { rawArgs: ['log', '--limit', '1', '--project', project] });
    expect(stdout.join('')).toMatch(/^V2 {4}[\da-f]{7} {2}\S+ \S+ {2}main {2}ada {2}Fit check, final\n$/u);

    /* The ref is the number, so git itself sees one tag, `v2`. */
    const tags = await execute('git', ['tag', '--list'], { cwd: project });
    expect(tags.stdout).toBe('v2\n');
  }, 60_000);

  /*
   * K1: a version and a rename are backed up before the verb exits, as a save
   * is. Left to the next push from any host, a rename made elsewhere in the
   * meantime would win. The remote is a bare repository on disk, which native
   * git speaks to as it speaks to the Tau Hosted Remote.
   */
  it('backs up a version and its rename before exiting, as a save does', async () => {
    await seed();
    const bare = await mkdtemp(join(tmpdir(), 'tau-cli-revisions-remote-'));
    try {
      await execute('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
      await execute('git', ['-C', project, 'remote', 'add', 'tau', bare]);
      const version = await importVersionCommand();
      const remoteVersionName = async (): Promise<string> => {
        const { stdout: tag } = await execute('git', ['-C', bare, 'cat-file', 'tag', 'refs/tags/v2']);
        return tag;
      };

      await runCommand(version, { rawArgs: ['create', 'Ready for print', '--project', project] });
      expect(stdout.join('')).toMatch(/^Created V2 · Ready for print at [\da-f]{7}\. Backed up\.\n$/u);
      expect(await remoteVersionName()).toContain('Ready for print');
      stdout.length = 0;

      await runCommand(version, { rawArgs: ['rename', 'V2', 'Fit check', '--json', '--project', project] });
      expect(JSON.parse(stdout.join(''))).toMatchObject({
        kind: 'version',
        ok: true,
        version: { number: 2, name: 'Fit check' },
        renamedFrom: 'Ready for print',
        backup: 'backedUp',
      });
      const renamed = await remoteVersionName();
      expect(renamed).toContain('Fit check');
      expect(renamed).not.toContain('Ready for print');
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  }, 60_000);

  it('offers no way to remove a version: versions are permanent (Q13)', async () => {
    const version = await importVersionCommand();
    const subCommands = (await (typeof version.subCommands === 'function'
      ? version.subCommands()
      : version.subCommands)) as Record<string, unknown>;
    expect(Object.keys(subCommands).toSorted()).toEqual(['create', 'list', 'rename']);
  });
});
