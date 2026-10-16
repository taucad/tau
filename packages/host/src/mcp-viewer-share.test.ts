import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseProjectManifestBytes } from '@taucad/project-core';
import { shareArtifactCodec } from '@taucad/project-core/share-artifact';
import type { TauMcpViewerFailure } from '@taucad/mcp';

import { createDirectShare, createOpenInTauLink, githubRepositoryOf } from '#mcp-viewer-share.js';
import type { GitRunner, McpViewerDirectShare, SourceSnapshotter } from '#mcp-viewer-share.js';

const run = promisify(execFile);

const git = async (cwd: string, ...args: string[]): Promise<void> => {
  await run('git', ['-c', 'user.name=Tau', '-c', 'user.email=tau@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
  });
};

describe('githubRepositoryOf', () => {
  it.each([
    ['https://github.com/taucad/tau.git', 'taucad/tau'],
    ['https://github.com/taucad/tau', 'taucad/tau'],
    ['git@github.com:taucad/tau.git', 'taucad/tau'],
    ['ssh://git@github.com/taucad/tau.git', 'taucad/tau'],
    ['https://GitHub.com/taucad/tau/', 'taucad/tau'],
  ])('should read %s as %s', (remote, repository) => {
    expect(githubRepositoryOf(remote)).toBe(repository);
  });

  it.each([
    'https://gitlab.com/taucad/tau.git',
    'git@gitlab.com:taucad/tau.git',
    'https://github.com/taucad',
    'https://github.com/taucad/tau/tree/main',
    'file:///srv/tau.git',
    '../tau',
  ])('should refuse %s', (remote) => {
    expect(githubRepositoryOf(remote)).toBeUndefined();
  });
});

describe('createOpenInTauLink', () => {
  let repository: string;
  let project: string;

  beforeEach(async () => {
    repository = await mkdtemp(join(tmpdir(), 'tau-viewer-share-'));
    project = join(repository, 'models', 'bracket');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'main.ts'), 'export default () => undefined;\n');
    await git(repository, 'init', '--quiet', '--initial-branch=main');
    await git(repository, 'add', '.');
    await git(repository, 'commit', '--quiet', '-m', 'bracket');
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  const track = async (remote: string): Promise<void> => {
    await git(repository, 'remote', 'add', 'origin', remote);
    await git(repository, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    await git(repository, 'branch', '--set-upstream-to=origin/main', 'main');
  };

  it('should open the tracked branch, the project folder and the shown entry from GitHub', async () => {
    await track('git@github.com:taucad/brackets.git');

    const link = await createOpenInTauLink({
      root: project,
      entryPath: 'main.ts',
      origin: 'https://tau.example/x',
    });

    expect(link).toEqual({
      url: 'https://tau.example/import/https://github.com/taucad/brackets?ref=main&path=models%2Fbracket&main=main.ts',
      repository: 'taucad/brackets',
      ref: 'main',
      path: 'models/bracket',
      mainFile: 'main.ts',
      hasLocalChanges: false,
    });
  });

  it('should say when the checkout has edits or commits GitHub does not have', async () => {
    await track('https://github.com/taucad/brackets.git');
    await writeFile(join(project, 'main.ts'), 'export default () => 1;\n');

    const edited = await createOpenInTauLink({
      root: project,
      entryPath: 'main.ts',
    });
    expect(edited).toMatchObject({ hasLocalChanges: true });
    expect('url' in edited && edited.url).toBe(
      'https://tau.new/import/https://github.com/taucad/brackets?ref=main&path=models%2Fbracket&main=main.ts',
    );

    await git(repository, 'commit', '--quiet', '-am', 'edit');
    await expect(createOpenInTauLink({ root: project, entryPath: 'main.ts' })).resolves.toMatchObject({
      hasLocalChanges: true,
    });
  });

  it('should leave out the folder at the repository root', async () => {
    await track('https://github.com/taucad/brackets');

    const link = await createOpenInTauLink({
      root: repository,
      entryPath: 'models/bracket/main.ts',
    });

    expect(link).toMatchObject({
      path: '',
      url: 'https://tau.new/import/https://github.com/taucad/brackets?ref=main&main=models%2Fbracket%2Fmain.ts',
    });
  });

  it('should refuse a branch that tracks nothing', async () => {
    await expect(createOpenInTauLink({ root: project, entryPath: 'main.ts' })).resolves.toMatchObject({
      errorCode: 'NO_UPSTREAM',
    });
  });

  it('should refuse a repository that is not on GitHub', async () => {
    await track('https://gitlab.com/taucad/brackets.git');

    await expect(createOpenInTauLink({ root: project, entryPath: 'main.ts' })).resolves.toMatchObject({
      errorCode: 'NOT_ON_GITHUB',
    });
  });

  it('should refuse a folder outside git', async () => {
    const failing: GitRunner = async () => undefined;

    await expect(
      createOpenInTauLink({
        root: project,
        entryPath: 'main.ts',
        git: failing,
      }),
    ).resolves.toMatchObject({
      errorCode: 'NOT_A_REPOSITORY',
    });
  });
});

describe('createDirectShare', () => {
  let project: string;
  const manifest = {
    $schema: 'https://tau.new/schemas/tau-schema-v1.json',
    id: 'proj_abcdefghijklmnopqrstu',
    name: 'Bracket',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  };
  const write = async (path: string, content: string): Promise<void> => {
    await mkdir(join(project, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(project, ...path.split('/')), content);
  };
  const expectDirect = (answer: McpViewerDirectShare | TauMcpViewerFailure): McpViewerDirectShare => {
    if ('errorCode' in answer) {
      throw new Error(answer.message);
    }
    return answer;
  };
  const opened = async (
    answer: McpViewerDirectShare | TauMcpViewerFailure,
  ): Promise<Readonly<Record<string, string>>> => {
    const { files } = await shareArtifactCodec.openPlain(expectDirect(answer).encodedArchive);
    return Object.fromEntries(files.map(({ path, content }) => [path, new TextDecoder().decode(content)]));
  };
  const mainOf = (files: Readonly<Record<string, string>>): string | undefined => {
    const parsed = parseProjectManifestBytes(new TextEncoder().encode(files['tau.json']));
    return parsed.success ? parsed.data.assets.main.entryPath : undefined;
  };

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tau-viewer-direct-'));
    await write('tau.json', JSON.stringify(manifest));
    await write('main.ts', 'export default 1;\n');
    await write('parts/lid.ts', 'export const lid = 2;\n');
    await write('.tau/parameters/parts/lid.ts.json', '{"activeGroup":"default","groups":{}}');
    await write('.tau/artifacts/lid.glb', 'glb');
    await write('node_modules/x/index.js', 'module');
    await write('secret.log', 'ignored');
    await write('.gitignore', '*.log\n');
    await git(project, 'init', '--quiet', '--initial-branch=main');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('should pack every file git does not ignore, with tau.json naming the shown entry and its parameters', async () => {
    const answer = await createDirectShare({
      root: project,
      entryPath: 'parts/lid.ts',
      origin: 'https://tau.example/x',
    });
    const files = await opened(answer);

    expect(Object.keys(files).sort()).toEqual([
      '.gitignore',
      '.tau/parameters/parts/lid.ts.json',
      'main.ts',
      'parts/lid.ts',
      'tau.json',
    ]);
    expect(mainOf(files)).toBe('parts/lid.ts');
    expect(expectDirect(answer)).toMatchObject({
      kind: 'direct',
      origin: 'https://tau.example',
      entryPath: 'parts/lid.ts',
      closure: 'project-files',
      fileCount: 5,
      warnings: [],
    });
  });

  it('should walk the folder outside git and carry a new tau.json when it has none', async () => {
    await rm(join(project, 'tau.json'));
    const outsideGit: GitRunner = async () => undefined;

    const answer = await createDirectShare({ root: project, entryPath: 'main.ts', git: outsideGit });
    const files = await opened(answer);

    expect(Object.keys(files)).toContain('secret.log');
    expect(Object.keys(files)).not.toContain('node_modules/x/index.js');
    expect(mainOf(files)).toBe('main.ts');
    expect(expectDirect(answer).warnings).toEqual([expect.objectContaining({ code: 'MANIFEST_MISSING' })]);
  });

  it('should pack the runtime closure when the host has one', async () => {
    const content = new TextEncoder().encode('export default 1;\n');
    const snapshotSource = vi.fn<SourceSnapshotter>(async () => ({
      entryPath: 'main.ts',
      files: [
        { path: 'main.ts', content, sha256: 'main', role: 'entry' },
        { path: 'tau.json', content: new TextEncoder().encode('{}'), sha256: 'stale', role: 'additional' },
      ],
      unresolvedPaths: ['missing.ts'],
    }));

    const answer = await createDirectShare({ root: project, entryPath: 'main.ts', snapshotSource });
    const files = await opened(answer);

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'tau.json']);
    expect(mainOf(files)).toBe('main.ts');
    expect(expectDirect(answer)).toMatchObject({
      closure: 'runtime',
      warnings: [{ code: 'UNRESOLVED_DEPENDENCY', message: 'The runtime could not resolve missing.ts.' }],
    });
    const [call] = snapshotSource.mock.calls[0] ?? [];
    expect(call).toMatchObject({ root: project, entryPath: 'main.ts' });
    expect(call?.additionalPaths).toContainEqual({ path: 'tau.json', required: false });
  });

  it('should pass on a closure the runtime could not collect', async () => {
    const snapshotSource: SourceSnapshotter = async () => ({ errorCode: 'SNAPSHOT_FAILED', message: 'No kernel.' });

    await expect(createDirectShare({ root: project, entryPath: 'main.ts', snapshotSource })).resolves.toEqual({
      errorCode: 'SNAPSHOT_FAILED',
      message: 'No kernel.',
    });
  });

  it('should refuse an entry that is not a project file, and a project with too many files', async () => {
    await expect(createDirectShare({ root: project, entryPath: 'gone.ts' })).resolves.toMatchObject({
      errorCode: 'NOT_FOUND',
    });
    await expect(createDirectShare({ root: project, entryPath: '../outside.ts' })).resolves.toMatchObject({
      errorCode: 'SHARE_ARTIFACT_INVALID',
    });
    await Promise.all(Array.from({ length: 200 }, async (_, index) => write(`many/${String(index)}.ts`, '1')));
    await expect(createDirectShare({ root: project, entryPath: 'main.ts' })).resolves.toMatchObject({
      errorCode: 'SHARE_ARTIFACT_LIMIT',
    });
  });
});
