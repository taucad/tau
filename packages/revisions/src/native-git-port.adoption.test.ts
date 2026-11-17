/**
 * A repository the person made, opened by the native port (rules 4, 5 and 13).
 *
 * `tau serve` with no `--workspace` opened whatever checkout it was started in.
 * The open appended Tau's block to the person's ignore file, wrote an
 * attributes file that put every image on LFS, and installed LFS filters in
 * their config; the close revision then converted their images to pointers,
 * dropped tracked paths Tau reserves, and committed onto the branches of
 * worktrees the person made. An adopted repository now keeps all of that.
 */

import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { lfsObjectPath, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { generatedGitattributesContent, generatedGitattributesPath, generatedIgnorePath } from '#workspace-config.js';
import { recordedBy } from '#test/identity.js';
import { shellWord, writeShellExecutable } from '#test/script-executable.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

/** A repository the person made: their own ignore file, an image stored as plain bytes, one commit. */
const personRepository = async (
  files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>> = {},
): Promise<Readonly<{ root: string; project: string }>> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revisions-adopted-'));
  roots.push(root);
  const project = join(root, 'project');
  await mkdir(project);
  git(project, ['init', '--quiet', '--initial-branch=main']);
  const contents = {
    [generatedIgnorePath]: 'dist/\n.env\n',
    'part.scad': 'cube(1);\n',
    'photo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
    ...files,
  };
  for (const [path, content] of Object.entries(contents)) {
    // oxlint-disable-next-line no-await-in-loop -- parents first, in the record's own order.
    await mkdir(join(project, path, '..'), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await writeFile(join(project, path), content);
  }
  git(project, ['add', '--all']);
  git(project, ['commit', '--quiet', '-m', 'Mine']);
  return { root, project };
};

describe.runIf(gitToolchainOnPath)('an adopted repository', () => {
  it('should leave the ignore file, attributes and config as the person wrote them', async () => {
    const { project } = await personRepository();
    const config = await readFile(join(project, '.git', 'config'), 'utf8');
    const port = createNativeGitRevisionPort({ repositoryPath: project });

    await port.init({ author });

    expect(await readFile(join(project, generatedIgnorePath), 'utf8')).toBe('dist/\n.env\n');
    expect(await readdir(project)).not.toContain(generatedGitattributesPath);
    expect(await readFile(join(project, '.git', 'config'), 'utf8')).toBe(config);
    expect(await readFile(join(project, '.git', 'info', 'exclude'), 'utf8')).toContain('/.tau/*');
    expect(git(project, ['status', '--porcelain'])).toBe('');
  });

  it('should store large files as captured rather than as pointers', async () => {
    const { project } = await personRepository();
    const port = createNativeGitRevisionPort({ repositoryPath: project });
    await port.init({ author });
    const image = new Uint8Array(2 * 1024 * 1024).fill(7);

    const receipt = await port.writeRevision({
      parents: [revisionId(git(project, ['rev-parse', 'HEAD']))],
      tree: new ImmutableRevisionTree([
        [generatedIgnorePath, 'dist/\n.env\n'],
        ['part.scad', 'cube(1);\n'],
        ['photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
        ['scan.stl', image],
      ]),
      provenance: { source: 'user', ...recordedBy('ada'), createdAt: Date.UTC(2026, 9, 13) },
      summary: { generated: 'Adopted' },
    });

    /* No attributes file names them, so they are blobs: the tree's own rule (D16). */
    expect(git(project, ['rev-parse', `${receipt.commitId}:photo.png`])).toBe(
      git(project, ['rev-parse', 'HEAD:photo.png']),
    );
    expect(git(project, ['cat-file', '-s', `${receipt.commitId}:scan.stl`])).toBe(String(image.byteLength));
  });

  it("should list the untracked paths the person's own Git ignores", async () => {
    const { project } = await personRepository();
    const port = createNativeGitRevisionPort({ repositoryPath: project });
    await port.init({ author });
    await mkdir(join(project, 'dist'));
    await writeFile(join(project, 'dist', 'bundle.js'), 'built\n');
    await writeFile(join(project, '.env'), 'SECRET=1\n');
    await writeFile(join(project, 'notes.txt'), 'mine\n');

    const ignored = await port.ignoredPaths?.();
    expect(ignored?.toSorted()).toStrictEqual(['.env', 'dist/']);
  });

  it("should answer a store Tau created with what its own ignore rules exclude, the person's lines included", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-created-'));
    roots.push(root);
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const ignore = await readFile(join(root, generatedIgnorePath), 'utf8');
    await writeFile(join(root, generatedIgnorePath), `${ignore}*.secret\n`);
    await writeFile(join(root, 'key.secret'), 'x\n');
    await writeFile(join(root, 'notes.txt'), 'mine\n');

    expect(await port.ignoredPaths?.()).toStrictEqual(['key.secret']);
    const descriptor = await port.describe();
    expect(descriptor.largeObjects).toBe(true);
    expect(descriptor).not.toHaveProperty('largeObjectRule');
    expect(await readFile(join(root, generatedIgnorePath), 'utf8')).toContain('# BEGIN Tau generated');
    /* The attributes file arrives with the first revision that records something (A4), never at open. */
    expect(await readdir(root)).not.toContain(generatedGitattributesPath);
    expect(await readFile(join(root, '.git', 'info', 'exclude'), 'utf8')).toContain('# BEGIN Tau generated');
  });

  describe('refusal', () => {
    const cases: ReadonlyArray<
      Readonly<{ name: string; arrange: (project: string) => Promise<void>; reason: RegExp }>
    > = [
      {
        name: 'a tracked symbolic link',
        arrange: async (project) => symlink('part.scad', join(project, 'link.scad')),
        reason: /link\.scad is a link or a nested repository/u,
      },
      {
        name: 'a tracked path Tau reserves',
        arrange: async (project) => {
          await mkdir(join(project, '.tau', 'chats'), { recursive: true });
          await writeFile(join(project, '.tau', 'chats', 'old.json'), '{}\n');
        },
        reason: /\.tau\/chats\/old\.json is a path Tau reserves/u,
      },
    ];

    for (const { name, arrange, reason } of cases) {
      it(`should refuse ${name} and write nothing`, async () => {
        const { project } = await personRepository({ 'models/keep.txt': 'kept\n' });
        await arrange(project);
        git(project, ['add', '--all']);
        git(project, ['commit', '--quiet', '-m', 'More']);
        const port = createNativeGitRevisionPort({ repositoryPath: project });

        const refusal = await port.init({ author }).then(
          () => expect.fail('the open should have been refused'),
          (error: unknown) => error,
        );
        expect(refusal).toMatchObject({ code: 'INVALID_REPOSITORY' });
        expect(refusal instanceof Error ? refusal.message : '').toMatch(reason);
        expect(await readFile(join(project, '.git', 'info', 'exclude'), 'utf8')).not.toContain('Tau generated');
        expect(git(project, ['status', '--porcelain'])).toBe('');
      });
    }
  });

  describe('with its own large-file attributes (D16)', () => {
    const stlAttributes = '*.stl filter=lfs diff=lfs merge=lfs -text\n';
    const provenance = { source: 'user', ...recordedBy('ada'), createdAt: Date.UTC(2026, 10, 7) } as const;

    it('should open it, and leave its attributes, ignore file and config as written', async () => {
      const { project } = await personRepository({ 'models/.gitattributes': stlAttributes });
      const config = await readFile(join(project, '.git', 'config'), 'utf8');
      const port = createNativeGitRevisionPort({ repositoryPath: project });

      await port.init({ author });

      expect(await readFile(join(project, 'models', '.gitattributes'), 'utf8')).toBe(stlAttributes);
      expect(await readdir(project)).not.toContain(generatedGitattributesPath);
      expect(await readFile(join(project, generatedIgnorePath), 'utf8')).toBe('dist/\n.env\n');
      expect(await readFile(join(project, '.git', 'config'), 'utf8')).toBe(config);
      expect(await port.describe()).toMatchObject({ largeObjects: true, keepsLargeObjectFiles: true });
    });

    it("should store exactly the paths its attributes name as pointers, and never write Tau's block", async () => {
      const { project } = await personRepository({ 'models/.gitattributes': stlAttributes });
      const port = createNativeGitRevisionPort({ repositoryPath: project });
      await port.init({ author });
      const scan = new Uint8Array(4096).fill(3);
      const unnamed = new Uint8Array(2 * 1024 * 1024).fill(5);

      const receipt = await port.writeRevision({
        parents: [revisionId(git(project, ['rev-parse', 'HEAD']))],
        tree: new ImmutableRevisionTree([
          [generatedIgnorePath, 'dist/\n.env\n'],
          ['models/.gitattributes', stlAttributes],
          ['models/scan.stl', scan],
          ['scan.stl', unnamed],
          ['part.scad', 'cube(1);\n'],
          ['photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
        ]),
        provenance,
        summary: { generated: 'Adopted with LFS' },
      });

      const pointer = readLfsPointer(
        new TextEncoder().encode(git(project, ['cat-file', 'blob', `${receipt.commitId}:models/scan.stl`]) + '\n'),
      );
      expect(pointer).toStrictEqual(lfsPointerFor(scan).pointer);
      expect(await readFile(join(project, '.git', lfsObjectPath(pointer!.oid)))).toStrictEqual(Buffer.from(scan));
      // Outside the directory its attributes cover, and never by Tau's size threshold or families.
      expect(git(project, ['cat-file', '-s', `${receipt.commitId}:scan.stl`])).toBe(String(unnamed.byteLength));
      expect(git(project, ['rev-parse', `${receipt.commitId}:photo.png`])).toBe(
        git(project, ['rev-parse', 'HEAD:photo.png']),
      );
      expect(git(project, ['cat-file', 'blob', `${receipt.commitId}:models/.gitattributes`])).toBe(
        stlAttributes.trimEnd(),
      );
      expect(git(project, ['ls-tree', '--name-only', receipt.commitId])).not.toContain(generatedGitattributesPath);
    });

    it('should keep a pointer its own Git recorded unchanged', async () => {
      const content = new Uint8Array(512).fill(9);
      const { bytes } = lfsPointerFor(content);
      const { project } = await personRepository({
        '.gitattributes': stlAttributes,
        'scan.stl': bytes,
      });
      const port = createNativeGitRevisionPort({ repositoryPath: project });
      await port.init({ author });
      const head = revisionId(git(project, ['rev-parse', 'HEAD']));
      const tree = await port.readTree(head, { largeObjects: 'local' });

      const receipt = await port.writeRevision({
        parents: [head],
        tree: tree!,
        provenance,
        summary: { generated: 'Same' },
      });

      expect(git(project, ['rev-parse', `${receipt.commitId}^{tree}`])).toBe(
        git(project, ['rev-parse', 'HEAD^{tree}']),
      );
    });
  });

  describe('an entry unchanged from the parent keeps its representation (rule 13)', () => {
    const psdAttributes = '*.psd filter=lfs diff=lfs merge=lfs -text\n';
    const provenance = { source: 'user', ...recordedBy('ada'), createdAt: Date.UTC(2026, 10, 8) } as const;
    const blobOf = (project: string, rev: string, path: string): string =>
      git(project, ['rev-parse', `${rev}:${path}`]);

    it('keeps a blob a blob after `git lfs track`, and makes only new and changed content a pointer', async () => {
      const art = new Uint8Array(3000).fill(4);
      const { project } = await personRepository({ 'art.psd': art, 'old.psd': new Uint8Array(100).fill(1) });
      const port = createNativeGitRevisionPort({ repositoryPath: project });
      await port.init({ author });
      const head = revisionId(git(project, ['rev-parse', 'HEAD']));
      const fresh = new Uint8Array(200).fill(6);
      const edited = new Uint8Array(100).fill(2);

      const receipt = await port.writeRevision({
        parents: [head],
        tree: new ImmutableRevisionTree([
          [generatedIgnorePath, 'dist/\n.env\n'],
          ['.gitattributes', psdAttributes],
          ['part.scad', 'cube(1);\n'],
          ['photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
          ['art.psd', art],
          ['old.psd', edited],
          ['new.psd', fresh],
        ]),
        provenance,
        summary: { generated: 'Tracked' },
      });

      expect(blobOf(project, receipt.commitId, 'art.psd')).toBe(blobOf(project, 'HEAD', 'art.psd'));
      const pointerAt = (path: string) =>
        readLfsPointer(
          new TextEncoder().encode(git(project, ['cat-file', 'blob', `${receipt.commitId}:${path}`]) + '\n'),
        );
      expect(pointerAt('old.psd')).toStrictEqual(lfsPointerFor(edited).pointer);
      expect(pointerAt('new.psd')).toStrictEqual(lfsPointerFor(fresh).pointer);
    });

    it('keeps a pointer a pointer when the attributes no longer name it, and makes changed content a blob', async () => {
      const scan = new Uint8Array(700).fill(9);
      const mesh = new Uint8Array(500).fill(8);
      const { project } = await personRepository({
        '.gitattributes': '*.stl filter=lfs diff=lfs merge=lfs -text\n',
        'scan.stl': lfsPointerFor(scan).bytes,
        'mesh.stl': lfsPointerFor(mesh).bytes,
      });
      const port = createNativeGitRevisionPort({ repositoryPath: project });
      await port.init({ author });
      const head = revisionId(git(project, ['rev-parse', 'HEAD']));
      const remeshed = new Uint8Array(500).fill(7);

      const receipt = await port.writeRevision({
        parents: [head],
        tree: new ImmutableRevisionTree([
          [generatedIgnorePath, 'dist/\n.env\n'],
          ['part.scad', 'cube(1);\n'],
          ['photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
          ['scan.stl', scan],
          ['mesh.stl', remeshed],
        ]),
        provenance,
        summary: { generated: 'Untracked' },
      });

      expect(blobOf(project, receipt.commitId, 'scan.stl')).toBe(blobOf(project, 'HEAD', 'scan.stl'));
      expect(git(project, ['cat-file', '-s', `${receipt.commitId}:mesh.stl`])).toBe(String(remeshed.byteLength));
    });
  });

  it('should not list a worktree the person made as one of its checkouts', async () => {
    const { root, project } = await personRepository();
    git(project, ['worktree', 'add', '--quiet', '-b', 'side', join(root, 'mine')]);
    const port = createNativeGitRevisionPort({
      repositoryPath: project,
      checkouts: { projectId: 'adopted', directory: join(root, 'checkouts') },
    });
    await port.init({ author });

    const before = await port.listCheckouts!();
    const added = await port.addCheckout!({
      branch: 'agent/one',
      from: revisionId(git(project, ['rev-parse', 'HEAD'])),
    });
    const after = await port.listCheckouts!();

    expect(before.map(({ kind }) => kind)).toStrictEqual(['live']);
    expect(after.map(({ id, kind }) => ({ id, kind }))).toStrictEqual([
      { id: 'live', kind: 'live' },
      { id: added.id, kind: 'linked' },
    ]);
  });
});

/*
 * Two opens of one fresh store at once: a caller's `init` and the effects'
 * `ensureStore`, which the large-object resume reaches on a timer as the root
 * starts. Each used to run `git init` and `git lfs install --local`, and the
 * loser of `.git/config.lock` failed with "could not lock config file".
 */
describe.runIf(gitToolchainOnPath)('opening a fresh store from two places at once', () => {
  it('creates the store once and answers every open', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one fresh repository per attempt.
      const root = await mkdtemp(join(tmpdir(), 'tau-revisions-concurrent-init-'));
      roots.push(root);
      const project = join(root, 'project');
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await mkdir(project);
      const port = createNativeGitRevisionPort({ repositoryPath: project });
      // oxlint-disable-next-line no-await-in-loop -- the opens race each other, not the attempts.
      await expect(
        Promise.all([port.init({ author }), port.init({ author }), port.init({ author })]),
      ).resolves.toHaveLength(3);
      expect(git(project, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/main');
      // oxlint-disable-next-line no-await-in-loop -- see above.
      expect(await readdir(join(project, '.git'))).not.toContain('config.lock');
    }
  }, 120_000);
});

/*
 * Git LFS writes its hooks under `core.hooksPath`, which every command pins to
 * `/dev/null`. Git for Windows' git-lfs read that against the checkout and
 * planted `dev/null/pre-push` and three more inside the project: an untracked
 * folder every cut then saw as unsaved work.
 */
describe.runIf(gitToolchainOnPath)('a store this port creates', () => {
  it("configures git-lfs's filters and writes nothing in the project but its ignore file", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-new-store-'));
    roots.push(root);
    const port = createNativeGitRevisionPort({ repositoryPath: root });

    await port.init({ author });

    const entries = await readdir(root);
    expect(entries.toSorted()).toStrictEqual(['.git', generatedIgnorePath]);
    expect(await readFile(join(root, '.git', 'config'), 'utf8')).toContain('[filter "lfs"]');
    expect(git(root, ['status', '--porcelain', '--untracked-files=all'])).toBe(`?? ${generatedIgnorePath}`);
  });

  /* `git lfs install --local --skip-repo` is one git-lfs process and the eight to thirteen Git processes it starts,
   * which on a host where a process takes seconds is a store's whole open (L4 run 44058328613). A `git` that logs
   * each subcommand, the first argument that is neither an option nor an option's value, then runs the real one. */
  const countingGit = async (
    root: string,
  ): Promise<Readonly<{ executable: string; verbs: () => Promise<string[]> }>> => {
    const log = join(root, 'commands.log');
    const executable = await writeShellExecutable(join(root, 'git-counting'), [
      'verb=',
      'skip=0',
      'for argument in "$@"; do',
      '  if [ "$skip" = 1 ]; then skip=0; continue; fi',
      '  case "$argument" in',
      '    -C|-c) skip=1 ;;',
      '    -*) ;;',
      '    *) verb="$argument"; break ;;',
      '  esac',
      'done',
      `echo "$verb" >> ${shellWord(log)}`,
      'exec git "$@"',
    ]);
    return {
      executable,
      verbs: async () => {
        const logged = await readFile(log, 'utf8').catch(() => '');
        return logged.split('\n').filter((verb) => verb !== '');
      },
    };
  };
  /* Sorted: which order git-lfs writes them in differs between its versions, and Git reads them by name. */
  const lfsKeys = (repository: string): string =>
    git(repository, ['config', '--local', '--get-regexp', String.raw`^(lfs|filter\.lfs)\.`])
      .split('\n')
      .toSorted()
      .join('\n');

  it("writes git-lfs's own filter keys itself when the host found git-lfs, and starts no git-lfs to do it", async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-filters-'));
    roots.push(root);
    const reference = join(root, 'reference');
    await mkdir(reference);
    git(reference, ['init', '--quiet']);
    git(reference, ['lfs', 'install', '--local', '--skip-repo']);
    const project = join(root, 'project');
    await mkdir(project);
    const counting = await countingGit(root);
    const port = createNativeGitRevisionPort({
      repositoryPath: project,
      gitExecutable: counting.executable,
      gitLfsInstalled: async () => true,
    });

    await port.init({ author });

    expect(await counting.verbs()).not.toContain('lfs');
    expect(lfsKeys(project)).toBe(lfsKeys(reference));
    await expect(lstat(join(project, '.git', 'config.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reopens a store that holds the filters without starting git-lfs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-filters-'));
    roots.push(root);
    const project = join(root, 'project');
    await mkdir(project);
    await createNativeGitRevisionPort({ repositoryPath: project }).init({ author });
    const configured = lfsKeys(project);
    const counting = await countingGit(root);

    await createNativeGitRevisionPort({ repositoryPath: project, gitExecutable: counting.executable }).init({ author });

    expect(configured).toContain('filter.lfs.process git-lfs filter-process');
    expect(await counting.verbs()).not.toContain('lfs');
    expect(lfsKeys(project)).toBe(configured);
  });

  it('leaves a filter somebody changed to git-lfs, which keeps their value', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-filters-'));
    roots.push(root);
    const project = join(root, 'project');
    await mkdir(project);
    await createNativeGitRevisionPort({ repositoryPath: project }).init({ author });
    git(project, ['config', '--local', 'filter.lfs.required', 'false']);
    const counting = await countingGit(root);

    await createNativeGitRevisionPort({
      repositoryPath: project,
      gitExecutable: counting.executable,
      gitLfsInstalled: async () => true,
    }).init({ author });

    expect(await counting.verbs()).toContain('lfs');
    expect(git(project, ['config', '--local', 'filter.lfs.required'])).toBe('false');
  });

  /* Git-lfs installs its four hooks under `core.hooksPath` whenever its filter runs, as a linked checkout over a
   * tracked large file does: into an empty directory it writes them and Git then runs them, under `/dev/null` on
   * Windows it planted `dev/null/*` in the project, and with the device path `\\.\NUL` a packaged Windows turn
   * was admitted and never placed (L4 bisect runs 44036295222 and 44036299558, against 44036304364). */
  const lfsHookNames = new Set(['post-checkout', 'post-commit', 'post-merge', 'pre-push']);
  const hookFilesUnder = async (directory: string): Promise<string[]> => {
    const paths = await readdir(directory, { recursive: true });
    return paths.filter((path) => lfsHookNames.has(path.split(/[\\/]/u).at(-1) ?? '')).toSorted();
  };
  /** A store whose own hooks directory holds a hook that leaves `marker` behind if Git ever runs it. */
  const storeWithLargeFile = async (
    gitLfsInstalled?: () => Promise<boolean>,
  ): Promise<{
    root: string;
    marker: string;
    port: ReturnType<typeof createNativeGitRevisionPort>;
    head: RevisionId;
  }> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-hooks-'));
    roots.push(root);
    const project = join(root, 'project');
    await mkdir(project);
    const marker = join(root, 'hook-ran');
    const port = createNativeGitRevisionPort({
      repositoryPath: project,
      checkouts: { projectId: 'hooks', directory: join(root, 'checkouts') },
      ...(gitLfsInstalled === undefined ? {} : { gitLfsInstalled }),
    });
    await port.init({ author });
    await mkdir(join(project, '.git', 'hooks'), { recursive: true });
    await writeFile(
      join(project, '.git', 'hooks', 'post-checkout'),
      `#!/bin/sh\ntouch "${marker.replaceAll('\\', '/')}"\n`,
      { mode: 0o755 },
    );
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        [generatedGitattributesPath, generatedGitattributesContent(undefined)],
        ['part.scad', 'cube(1);\n'],
        ['scan.stl', new Uint8Array(4096).fill(3)],
      ]),
      provenance: { source: 'user', ...recordedBy('ada'), createdAt: Date.UTC(2026, 10, 17) },
      summary: { generated: 'Large file' },
    });
    return { root, marker, port, head: revisionId(receipt.commitId) };
  };

  it("pins every command's hooks to an empty file in its store, so a linked checkout over a large file runs and gains no hook", async () => {
    const { root, marker, port, head } = await storeWithLargeFile();

    const linked = await port.addCheckout!({ branch: 'agent/one', from: head });

    expect(readLfsPointer(new Uint8Array(await readFile(join(linked.root, 'scan.stl'))))).toBeDefined();
    expect(await hookFilesUnder(join(root, 'checkouts'))).toStrictEqual([]);
    expect(await hookFilesUnder(join(root, 'project'))).toStrictEqual([join('.git', 'hooks', 'post-checkout')]);
    await expect(lstat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    const hooksFile = await lstat(join(root, 'project', '.git', 'tau-hooks-disabled'));
    expect(hooksFile.isFile()).toBe(true);
    expect(hooksFile.size).toBe(0);
  });

  it('gains no hook either when the filters are ones the port wrote itself', async () => {
    const { root, marker, port, head } = await storeWithLargeFile(async () => true);

    const linked = await port.addCheckout!({ branch: 'agent/one', from: head });

    expect(readLfsPointer(new Uint8Array(await readFile(join(linked.root, 'scan.stl'))))).toBeDefined();
    expect(await hookFilesUnder(join(root, 'checkouts'))).toStrictEqual([]);
    expect(await hookFilesUnder(join(root, 'project'))).toStrictEqual([join('.git', 'hooks', 'post-checkout')]);
    await expect(lstat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('replaces a hooks directory left at that path, which git-lfs would fill and Git would run', async () => {
    const { root, marker, port, head } = await storeWithLargeFile();
    const hooksPath = join(root, 'project', '.git', 'tau-hooks-disabled');
    await rm(hooksPath);
    await mkdir(hooksPath);
    await writeFile(join(hooksPath, 'post-checkout'), `#!/bin/sh\ntouch "${marker.replaceAll('\\', '/')}"\n`, {
      mode: 0o755,
    });

    await port.init({ author });
    await port.addCheckout!({ branch: 'agent/one', from: head });

    const replaced = await lstat(hooksPath);
    expect(replaced.isFile()).toBe(true);
    await expect(lstat(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe.runIf(gitToolchainOnPath)('a folder with its own setup files and no repository', () => {
  const folder = async (files: Readonly<Record<string, string>>): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-folder-'));
    roots.push(root);
    await Promise.all(Object.entries(files).map(async ([path, content]) => writeFile(join(root, path), content)));
    return root;
  };
  const sessionOf = async (root: string) => {
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });
    const ignored = await port.ignoredPaths?.();
    return {
      ignored: ignored?.toSorted(),
      config: await readFile(join(root, '.git', 'config'), 'utf8'),
    };
  };

  it("is the person's in the session that made the store and in every session after it", async () => {
    const root = await folder({ [generatedIgnorePath]: 'dist/\n', [generatedGitattributesPath]: '*.psd filter=lfs\n' });
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist', 'out.js'), 'built\n');

    const first = await sessionOf(root);
    const second = await sessionOf(root);

    expect(first).toStrictEqual(second);
    expect(first.ignored).toStrictEqual(['dist/']);
    expect(first.config).not.toContain('[filter "lfs"]');
    expect(await readFile(join(root, generatedIgnorePath), 'utf8')).toBe('dist/\n');
    expect(await readFile(join(root, generatedGitattributesPath), 'utf8')).toBe('*.psd filter=lfs\n');
  });

  it("is the person's in both sessions when its own ignore file has no Tau block, and init writes nothing (A4)", async () => {
    const root = await folder({ [generatedIgnorePath]: 'dist/\n' });
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist', 'out.js'), 'built\n');

    const first = await sessionOf(root);
    const second = await sessionOf(root);

    expect(first).toStrictEqual(second);
    expect(first.ignored).toStrictEqual(['dist/']);
    expect(first.config).not.toContain('[filter "lfs"]');
    expect(await readFile(join(root, generatedIgnorePath), 'utf8')).toBe('dist/\n');
    expect(await readdir(root)).not.toContain(generatedGitattributesPath);
  });

  it('configures the LFS filters again on an open whose store lost them', async () => {
    const root = await folder({});
    await sessionOf(root);
    git(root, ['config', '--local', '--remove-section', 'filter.lfs']);

    const reopened = await sessionOf(root);

    expect(reopened.config).toContain('[filter "lfs"]');
  });
});

describe.runIf(gitToolchainOnPath)("the repository's core.ignoreCase", () => {
  it('is read from the store init made', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-ignorecase-'));
    roots.push(root);
    const port = createNativeGitRevisionPort({ repositoryPath: root });

    await port.init({ author });
    /* What `git init` records on a case-insensitive disk, written by hand on this one. */
    git(root, ['config', 'core.ignoreCase', 'true']);
    const after = await port.describe();

    expect(after.ignoreCase).toBe(true);
  });
});
