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
  within,
} from '#shell/shell-grant.js';
import type { ShellGrantHost } from '#shell/shell-grant.js';

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
  const terminalPlan = async () =>
    compileShellFilesystem({
      checkout,
      checkoutProtected: await projectProtected(checkout, { readableGit: true }),
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
    const checkoutProtected = await projectProtected(checkout, { readableGit: true });
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
});
