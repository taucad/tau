// @vitest-environment node
/**
 * The grant compiler's plan for the read-only git view (blueprint E1): the view and the real object store open
 * read-only, and the rest of the real `.git` stays denied. The provider's enforcement is the shell qualification's job.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { compileShellFilesystem, projectProtected, within } from '#shell/shell-grant.js';
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
