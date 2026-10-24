import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseProjectManifestBytes } from '@taucad/project-core';
import { shareArtifactCodec } from '@taucad/project-core/share-artifact';
import type { TauMcpViewerFailure } from '@taucad/mcp';

import { createDirectShare } from '#mcp-viewer-share.js';
import type { McpViewerDirectShare, SourceSnapshotter, SourceSnapshotFile } from '#mcp-viewer-share.js';

describe('createDirectShare', () => {
  let project: string;
  const manifest = {
    $schema: 'https://tau.new/schemas/tau-v1.json',
    name: 'Bracket',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  };
  const write = async (path: string, content: string): Promise<void> => {
    await mkdir(join(project, ...path.split('/').slice(0, -1)), {
      recursive: true,
    });
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
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  /** The runtime's closure of an entry: the entry's own file, as `snapshotSource` reads it from the project. */
  const closureOf = (paths: readonly string[] = []): SourceSnapshotter =>
    vi.fn<SourceSnapshotter>(async ({ entryPath }) => ({
      entryPath,
      files: [entryPath, ...paths].map(
        (path): SourceSnapshotFile => ({
          path,
          content: new TextEncoder().encode(path),
          sha256: path,
          role: path === entryPath ? 'entry' : 'kernel-dependency',
        }),
      ),
      unresolvedPaths: [],
    }));

  it("should pack the closure with tau.json naming the shown entry, and the entry's parameters", async () => {
    const answer = await createDirectShare({
      root: project,
      entryPath: 'parts/lid.ts',
      origin: 'https://tau.example/x',
      snapshotSource: closureOf(['main.ts', 'node_modules/x/index.js', '.tau/artifacts/lid.glb']),
    });
    const files = await opened(answer);

    expect(Object.keys(files).sort()).toEqual([
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
      closure: 'runtime',
      fileCount: 4,
      warnings: [],
    });
  });

  it('should carry a new tau.json when the folder has none', async () => {
    await rm(join(project, 'tau.json'));

    const answer = await createDirectShare({
      root: project,
      entryPath: 'main.ts',
      snapshotSource: closureOf(),
    });

    expect(mainOf(await opened(answer))).toBe('main.ts');
    expect(expectDirect(answer).warnings).toEqual([expect.objectContaining({ code: 'MANIFEST_MISSING' })]);
  });

  it('should leave out the files the collector writes, and report what the runtime could not resolve', async () => {
    const content = new TextEncoder().encode('export default 1;\n');
    const snapshotSource = vi.fn<SourceSnapshotter>(async () => ({
      entryPath: 'main.ts',
      files: [
        { path: 'main.ts', content, sha256: 'main', role: 'entry' },
        {
          path: 'tau.json',
          content: new TextEncoder().encode('{}'),
          sha256: 'stale',
          role: 'additional',
        },
      ],
      unresolvedPaths: ['missing.ts'],
    }));

    const answer = await createDirectShare({
      root: project,
      entryPath: 'main.ts',
      snapshotSource,
    });
    const files = await opened(answer);

    expect(Object.keys(files).sort()).toEqual(['main.ts', 'tau.json']);
    expect(mainOf(files)).toBe('main.ts');
    expect(expectDirect(answer)).toMatchObject({
      warnings: [
        {
          code: 'UNRESOLVED_DEPENDENCY',
          message: 'The runtime could not resolve missing.ts.',
        },
      ],
    });
    const [call] = snapshotSource.mock.calls[0] ?? [];
    expect(call).toMatchObject({ root: project, entryPath: 'main.ts' });
    expect(call?.additionalPaths).toContainEqual({
      path: 'tau.json',
      required: false,
    });
  });

  it('should pass on a closure the runtime could not collect', async () => {
    const snapshotSource: SourceSnapshotter = async () => ({
      errorCode: 'SNAPSHOT_FAILED',
      message: 'No kernel.',
    });

    await expect(
      createDirectShare({
        root: project,
        entryPath: 'main.ts',
        snapshotSource,
      }),
    ).resolves.toEqual({
      errorCode: 'SNAPSHOT_FAILED',
      message: 'No kernel.',
    });
  });

  it('should refuse an entry a shared project cannot start from', async () => {
    const snapshotSource = closureOf();
    await expect(
      createDirectShare({
        root: project,
        entryPath: '../outside.ts',
        snapshotSource,
      }),
    ).resolves.toMatchObject({ errorCode: 'SHARE_ARTIFACT_INVALID' });
    await expect(
      createDirectShare({
        root: project,
        entryPath: '.tau/artifacts/lid.glb',
        snapshotSource,
      }),
    ).resolves.toMatchObject({ errorCode: 'SHARE_ARTIFACT_INVALID' });
    expect(snapshotSource).not.toHaveBeenCalled();
  });
});
