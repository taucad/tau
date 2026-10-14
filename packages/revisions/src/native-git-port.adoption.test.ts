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
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';
import { generatedGitattributesPath, generatedIgnorePath } from '#workspace-config.js';

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
      provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 9, 13) },
      summary: { generated: 'Adopted' },
    });

    const descriptor = await port.describe();
    expect(descriptor.largeObjects).toBe(false);
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

  it('should answer no ignored paths for a store Tau created', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revisions-created-'));
    roots.push(root);
    const port = createNativeGitRevisionPort({ repositoryPath: root });
    await port.init({ author });

    expect(await port.ignoredPaths?.()).toBeUndefined();
    const descriptor = await port.describe();
    expect(descriptor.largeObjects).toBe(true);
    expect(await readFile(join(root, generatedIgnorePath), 'utf8')).toContain('# BEGIN Tau generated');
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
      {
        name: 'large files kept outside Git',
        arrange: async (project) =>
          writeFile(join(project, 'models', '.gitattributes'), '*.stl filter=lfs diff=lfs merge=lfs -text\n'),
        reason: /stores large files outside Git/u,
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
