// @vitest-environment node
/**
 * The grant compiler's plan for the read-only git view (blueprint E1): the view and the real object store open
 * read-only, and the rest of the real `.git` stays denied. The provider's enforcement is the shell qualification's job.
 */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  compileShellFilesystem,
  projectProtected,
  protectedPaths,
  resolveShellAccess,
  terminalGitAccess,
  terminalGitStorePolicy,
  within,
} from '#shell/shell-grant.js';
import type { ShellGrantHost, TerminalGitAccess } from '#shell/shell-grant.js';

let base = '';
let checkout = '';
let session = '';
let host: ShellGrantHost;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-shell-grant-')));
  checkout = join(base, 'project');
  session = join(base, 'sessions', 'tau-shell-1');
  for (const directory of [
    join(checkout, '.git', 'objects', 'pack'),
    join(checkout, '.git', 'refs', 'tau', 'chats'),
    join(checkout, '.tau', 'chats'),
    join(session, 'git'),
    join(session, 'home'),
    join(session, 'tmp'),
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- fixture setup.
    await mkdir(directory, { recursive: true });
  }
  await writeFile(join(checkout, '.git', 'config'), '[core]\n');
  host = {
    platform: process.platform,
    home: join(base, 'home'),
    environment: {},
    appDataRoots: [join(base, 'app-data')],
    projectRoots: [checkout],
  };
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const plan = async (git?: Readonly<{ directory: string; objects: string }>) =>
  compileShellFilesystem({
    checkout,
    checkoutProtected: await projectProtected(checkout),
    session: [join(session, 'home'), join(session, 'tmp')],
    toolchain: [],
    access: { read: [], write: [], domains: [] },
    host,
    git,
  });

describe('compileShellFilesystem with a git view', () => {
  it('should open the view and the real object store read-only and keep the real .git denied', async () => {
    const objects = join(checkout, '.git', 'objects');
    const view = join(session, 'git');
    const filesystem = await plan({ directory: view, objects });

    expect(filesystem.readOnly).toStrictEqual(expect.arrayContaining([view, objects]));
    expect(filesystem.denied).toContain(join(checkout, '.git'));
    expect(filesystem.writable.filter((path) => within(host.platform, path, join(checkout, '.git')))).toStrictEqual([]);
    expect(filesystem.writable.filter((path) => within(host.platform, view, path))).toStrictEqual([]);
    expect(filesystem.readable).not.toContain(objects);
    /* Nothing else of the real `.git` is named readable. */
    expect(
      [...filesystem.readable, ...filesystem.readOnly].filter(
        (path) => within(host.platform, path, join(checkout, '.git')) && path !== objects,
      ),
    ).toStrictEqual([]);
  });

  it('should leave the object store denied with no view', async () => {
    const filesystem = await plan();

    expect(filesystem.readOnly.filter((path) => within(host.platform, path, join(checkout, '.git')))).toStrictEqual([]);
    expect(filesystem.denied).toContain(join(checkout, '.git'));
  });

  it('should still drop a record under a denied path', async () => {
    const filesystem = await compileShellFilesystem({
      checkout,
      checkoutProtected: {
        readOnly: [join(checkout, '.git', 'objects', 'info'), join(checkout, '.tau', 'chats')],
        denied: [join(checkout, '.git')],
        directories: [],
      },
      session: [join(session, 'home'), join(session, 'tmp')],
      toolchain: [],
      access: { read: [], write: [], domains: [] },
      host,
    });

    expect(filesystem.readOnly).toStrictEqual([join(checkout, '.tau', 'chats')]);
  });
});

describe('projectProtected for the Terminal, which reads the real git store', () => {
  const terminalPlan = async (terminalGit: TerminalGitAccess = 'read') =>
    compileShellFilesystem({
      checkout,
      checkoutProtected: await projectProtected(checkout, { terminalGit }),
      session: [join(session, 'home'), join(session, 'tmp')],
      toolchain: [],
      access: { read: [], write: [], domains: [] },
      host,
    });

  beforeEach(async () => {
    for (const directory of ['vendor/lib/.git', '.hg', '.svn', '.jj', '.tau-staging', 'vendor/other/.hg']) {
      // oxlint-disable-next-line no-await-in-loop -- fixture setup.
      await mkdir(join(checkout, ...directory.split('/')), { recursive: true });
    }
  });

  it('should classify the checkout and nested .git as read-only, never denied, and leave the agent launch denying them', async () => {
    const terminal = await terminalPlan();
    const store = join(checkout, '.git');
    const nested = join(checkout, 'vendor', 'lib', '.git');

    expect(terminal.denied).not.toContain(store);
    expect(terminal.denied).not.toContain(nested);
    expect(terminal.readOnly).toStrictEqual(expect.arrayContaining([store, nested]));
    expect(terminal.writable.filter((path) => within(host.platform, path, store))).toStrictEqual([]);

    const agent = await plan();
    expect(agent.denied).toStrictEqual(expect.arrayContaining([store, nested]));
    expect(agent.readOnly).not.toContain(store);
    expect(agent.readOnly).not.toContain(nested);
  });

  it('should keep every other control path, Tau binding and staging denied', async () => {
    const terminal = await terminalPlan();

    expect(terminal.denied).toStrictEqual(
      expect.arrayContaining([
        join(checkout, '.hg'),
        join(checkout, '.svn'),
        join(checkout, '.jj'),
        join(checkout, '.tau-staging'),
        join(checkout, '.tau', 'binding.json'),
        join(checkout, 'vendor', 'other', '.hg'),
      ]),
    );
    expect(terminal.readOnly).not.toContain(join(checkout, '.hg'));
  });

  it('should keep a .git that is a link denied, so it cannot open what it names', async () => {
    const linked = join(checkout, 'vendor', 'linked');
    await mkdir(linked, { recursive: true });
    await symlink(join(base, 'home'), join(linked, '.git'));
    const terminal = await terminalPlan();

    expect(terminal.denied).toContain(join(linked, '.git'));
    expect(terminal.readOnly).not.toContain(join(linked, '.git'));
  });

  it('should still refuse a grant that names a version-control directory', async () => {
    const supplier = join(base, 'supplier');
    await mkdir(join(supplier, '.git'), { recursive: true });
    const checkoutProtected = await projectProtected(checkout, { terminalGit: 'write' });
    for (const folder of [join(checkout, '.git'), join(supplier, '.git'), join(checkout, 'vendor', 'lib', '.git')]) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal per folder.
      const answer = await resolveShellAccess(
        { reason: 'Terminal access the person allowed', write: [folder] },
        host,
        protectedPaths(checkoutProtected),
      );
      expect(answer, folder).toMatchObject({ status: 'refused' });
    }
  });

  it('should open the store for writing only where the sandbox protects an absent name without creating it', () => {
    expect(terminalGitAccess('darwin')).toBe('write');
    expect(terminalGitAccess('linux')).toBe('read');
    expect(terminalGitAccess('win32')).toBe('read');
  });

  it('should open a Linux store for writing only when the store guard can start', () => {
    expect(terminalGitAccess('linux', true)).toBe('write');
    expect(terminalGitAccess('linux', false)).toBe('read');
    expect(terminalGitAccess('win32', true)).toBe('read');
  });

  it('should hand each writable store to the provider guard whole, with the policy names, instead of listing them', async () => {
    const checkoutProtected = await projectProtected(checkout, { terminalGit: 'write', guardStores: true });
    const store = join(checkout, '.git');
    const nested = join(checkout, 'vendor', 'lib', '.git');

    expect(checkoutProtected.guarded).toStrictEqual(expect.arrayContaining([store, nested]));
    expect(checkoutProtected.readOnly.filter((path) => within(host.platform, path, store))).toStrictEqual([]);
    expect(checkoutProtected.denied).not.toContain(store);
    expect(protectedPaths(checkoutProtected)).toStrictEqual(expect.arrayContaining([store, nested]));

    const filesystem = await compileShellFilesystem({
      checkout,
      checkoutProtected,
      session: [join(session, 'home'), join(session, 'tmp')],
      toolchain: [],
      access: { read: [], write: [], domains: [] },
      host,
    });
    expect(filesystem.guardedStores?.stores).toStrictEqual(expect.arrayContaining([store, nested]));
    expect(filesystem.guardedStores?.protect).toStrictEqual(terminalGitStorePolicy.map(({ name }) => name));
    expect(filesystem.readOnly).not.toContain(store);
    expect(filesystem.denied).not.toContain(store);
  });

  it('should keep a store read-only and unguarded when the Terminal only reads it', async () => {
    const checkoutProtected = await projectProtected(checkout, { terminalGit: 'read', guardStores: true });

    expect(checkoutProtected.guarded).toBeUndefined();
    expect(checkoutProtected.readOnly).toContain(join(checkout, '.git'));
  });

  it('should leave a writable store open except every spelling of the names through which git runs a program or follows another address', async () => {
    await mkdir(join(checkout, '.git', 'hooks'), { recursive: true });
    await mkdir(join(checkout, 'vendor', 'lib', '.git', 'Hooks'), { recursive: true });
    const terminal = await terminalPlan('write');
    const store = join(checkout, '.git');
    const nested = join(checkout, 'vendor', 'lib', '.git');
    /*
     * Each policy name, its ASCII caseless glob, and a glob for every way of writing its `s`, `k` and `fi` with the
     * character a case-folding volume reads as them: U+017F, U+212A and U+FB01, each outside any bracket.
     */
    const executable = (directory: string): string[] =>
      [
        'config',
        '[cC][oO][nN][fF][iI][gG]',
        '[cC][oO][nN]\uFB01[gG]',
        'hooks',
        '[hH][oO][oO][kK][sS]',
        '[hH][oO][oO][kK]\u017F',
        '[hH][oO][oO]\u212A[sS]',
        '[hH][oO][oO]\u212A\u017F',
        'commondir',
        '[cC][oO][mM][mM][oO][nN][dD][iI][rR]',
        'config.worktree',
        '[cC][oO][nN][fF][iI][gG].[wW][oO][rR][kK][tT][rR][eE][eE]',
        '[cC][oO][nN][fF][iI][gG].[wW][oO][rR]\u212A[tT][rR][eE][eE]',
        '[cC][oO][nN]\uFB01[gG].[wW][oO][rR][kK][tT][rR][eE][eE]',
        '[cC][oO][nN]\uFB01[gG].[wW][oO][rR]\u212A[tT][rR][eE][eE]',
        'worktrees',
        '[wW][oO][rR][kK][tT][rR][eE][eE][sS]',
        '[wW][oO][rR][kK][tT][rR][eE][eE]\u017F',
        '[wW][oO][rR]\u212A[tT][rR][eE][eE][sS]',
        '[wW][oO][rR]\u212A[tT][rR][eE][eE]\u017F',
        'modules',
        '[mM][oO][dD][uU][lL][eE][sS]',
        '[mM][oO][dD][uU][lL][eE]\u017F',
        'remotes',
        '[rR][eE][mM][oO][tT][eE][sS]',
        '[rR][eE][mM][oO][tT][eE]\u017F',
        'branches',
        '[bB][rR][aA][nN][cC][hH][eE][sS]',
        '[bB][rR][aA][nN][cC][hH][eE]\u017F',
      ].map((name) => join(directory, name));

    expect(terminal.denied.filter((path) => within(host.platform, path, store))).toStrictEqual([]);
    expect(terminal.denied.filter((path) => within(host.platform, path, nested))).toStrictEqual([]);
    expect(
      terminal.readOnly
        .filter((path) => within(host.platform, path, store) && !within(host.platform, path, nested))
        .toSorted(),
    ).toStrictEqual(executable(store).toSorted());
    /* A nested store's existing spelling is kept as it is, beside the canonical one. */
    expect(terminal.readOnly.filter((path) => within(host.platform, path, nested)).toSorted()).toStrictEqual(
      [...executable(nested), join(nested, 'Hooks')].toSorted(),
    );
    expect(terminal.readOnly).not.toContain(store);
    expect(terminal.directories).toStrictEqual(
      expect.arrayContaining([
        join(store, 'hooks'),
        join(store, 'worktrees'),
        join(store, 'modules'),
        join(store, 'remotes'),
        join(store, 'branches'),
        join(store, '[rR][eE][mM][oO][tT][eE]\u017F'),
        join(nested, 'Hooks'),
      ]),
    );
    expect(terminal.directories).not.toContain(join(store, 'config'));
    for (const path of [
      'objects',
      'refs',
      'index',
      'HEAD',
      'logs',
      'lfs',
      'MERGE_HEAD',
      'config.lock',
      'info',
      'rebase-merge',
      'sequencer',
    ]) {
      expect(terminal.readOnly, path).not.toContain(join(store, path));
    }
    /* Every other control path stays denied, as for a read-only store. */
    expect(terminal.denied).toStrictEqual(
      expect.arrayContaining([
        join(checkout, '.hg'),
        join(checkout, '.tau', 'binding.json'),
        join(checkout, '.tau-staging'),
      ]),
    );

    const agent = await plan();
    expect(agent.denied).toStrictEqual(expect.arrayContaining([store, nested]));
  });

  it('should keep an existing entry that a case-folding volume reads as a policy name read-only under its own spelling', async () => {
    const store = join(checkout, '.git');
    /* `remote` + U+017F and `ho` + `o` + U+212A + `s`: each folds onto a policy name, so git outside finds it. */
    for (const name of ['remote\u017F', 'hoo\u212As']) {
      // oxlint-disable-next-line no-await-in-loop -- fixture setup.
      await mkdir(join(store, name));
    }
    await writeFile(join(store, 'con\uFB01g.worktree'), '');
    /* Names that fold onto nothing in the policy stay writable. */
    await mkdir(join(store, 'remote'));
    await writeFile(join(store, 'configs'), '');
    const terminal = await terminalPlan('write');

    for (const name of ['remote\u017F', 'hoo\u212As', 'con\uFB01g.worktree']) {
      expect(terminal.readOnly, name).toContain(join(store, name));
    }
    expect(terminal.directories).toStrictEqual(
      expect.arrayContaining([join(store, 'remote\u017F'), join(store, 'hoo\u212As')]),
    );
    for (const name of ['remote', 'configs']) {
      expect(terminal.readOnly, name).not.toContain(join(store, name));
    }
  });

  it('should keep a .git pointer file, an absent .git and a store whose path reads as a glob read-only whole', async () => {
    const pointer = join(checkout, 'vendor', 'pointer');
    await mkdir(pointer, { recursive: true });
    await writeFile(join(pointer, '.git'), 'gitdir: ../../.git/worktrees/pointer\n');
    const globbed = join(checkout, 'vendor', 'lib[1]', '.git');
    await mkdir(globbed, { recursive: true });
    await rm(join(checkout, '.git'), { recursive: true, force: true });
    const terminal = await terminalPlan('write');

    for (const path of [join(checkout, '.git'), join(pointer, '.git'), globbed]) {
      expect(terminal.readOnly, path).toContain(path);
      expect(terminal.denied, path).not.toContain(path);
    }
    expect(terminal.readOnly.filter((path) => within(host.platform, path, globbed))).toStrictEqual([globbed]);
  });
});
