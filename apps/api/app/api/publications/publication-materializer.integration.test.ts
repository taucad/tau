/**
 * The materializer against real `git` (AC13).
 *
 * Red pin (b): a publication's viewer serves bytes identical to
 * `git show <tag>:<path>` on a **stock clone** — including a file that is an
 * LFS object, where "identical" means the object's own bytes, not the pointer
 * git hands back without the filter. The dumb-HTTP leg that turns this
 * repository into a cloneable URL is W11a's, proved by
 * `git.http.integration.test.ts`; what is proved here is the half W8 owns: the
 * bytes the blob store receives are the bytes the tag names.
 *
 * Red pin (b2): a named version whose entry path is not in the tree is refused,
 * because a manifest that names a file it has no digest for is a publication
 * whose viewer opens nothing.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { materializePublication, readPublishedTree } from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import type { ObjectStorageServiceContract } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';

/**
 * The runner the API passes in, as a plain `spawnSync` so the suite exercises
 * real `git` output rather than a stub of it.
 *
 * @param repositoryPath - Where the child runs.
 * @param args - Arguments after `git`.
 * @param stdin - Written to the child, when given.
 * @returns The child's stdout.
 */
const realGit: MaterializerDependencies['git'] = async (repositoryPath, args, stdin) => {
  const result = spawnSync('git', [...args], { cwd: repositoryPath, ...(stdin === undefined ? {} : { input: stdin }) });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${String(result.status)}`);
  }
  return new Uint8Array(result.stdout);
};

const git = (cwd: string, ...args: readonly string[]): string => {
  const result = spawnSync('git', ['-c', 'user.name=Tau', '-c', 'user.email=tau@test.invalid', ...args], { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr)}`);
  }
  return result.stdout.toString('utf8');
};

const gitBytes = (cwd: string, ...args: readonly string[]): Uint8Array<ArrayBuffer> => {
  const result = spawnSync('git', args as string[], { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr)}`);
  }
  return new Uint8Array(result.stdout);
};

/** One project's repository, with one named version holding the given files. */
const seed = (files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>, tag = 'v1'): string => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'tau-materializer-'));
  git(repositoryPath, 'init', '--initial-branch=main', '.');
  for (const [relativePath, bytes] of files) {
    mkdirSync(dirname(join(repositoryPath, relativePath)), { recursive: true });
    writeFileSync(join(repositoryPath, relativePath), bytes);
  }
  git(repositoryPath, 'add', '-A');
  git(repositoryPath, 'commit', '-m', 'seed');
  git(repositoryPath, 'tag', '-a', tag, '-m', 'named');
  return repositoryPath;
};

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Storage that remembers every blob it was given, keyed as the CDN keys it. */
const createRecordingStorage = (
  lfsObjects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> = new Map(),
): Readonly<{ dependencies: MaterializerDependencies; written: Map<string, Uint8Array<ArrayBuffer>> }> => {
  const written = new Map<string, Uint8Array<ArrayBuffer>>();
  const storage: ObjectStorageServiceContract = {
    putBlob: vi.fn(async (args) => {
      written.set(`${args.namespace}/${args.key}`, new Uint8Array(Buffer.from(args.body as Uint8Array<ArrayBuffer>)));
      return { etag: 'etag', alreadyExisted: false };
    }),
    getBlob: vi.fn(async (args: Parameters<ObjectStorageServiceContract['getBlob']>[0]) => {
      const stored = lfsObjects.get(args.key) ?? written.get(`${args.namespace}/${args.key}`);
      if (stored === undefined) {
        throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      }
      return { body: Readable.from([Buffer.from(stored)]), contentType: 'application/octet-stream', etag: 'etag' };
    }),
    headBlob: vi.fn(async () => undefined),
    deleteBlob: vi.fn(async () => undefined),
    presignGet: vi.fn(async () => 'https://example.invalid/get'),
    presignPut: vi.fn(async () => 'https://example.invalid/put'),
    createMultipartUpload: vi.fn(async () => 'upload-id'),
    presignUploadPart: vi.fn(async () => 'https://example.invalid/part'),
    completeMultipartUpload: vi.fn(async () => undefined),
    abortMultipartUpload: vi.fn(async () => undefined),
    publicUrl: vi.fn(() => 'https://example.invalid/public'),
    headProbeObject: vi.fn(async () => undefined),
    headPrivateBucket: vi.fn(async () => true),
  };
  return {
    written,
    dependencies: {
      storage: storage as unknown as MaterializerDependencies['storage'],
      databaseService: {} as unknown as MaterializerDependencies['databaseService'],
      git: realGit,
    },
  };
};

describe('publication materializer against real git', () => {
  it('b: serves bytes identical to `git show <tag>:<path>` on a stock clone', async () => {
    const source = utf8('export const bracket = () => {};\n');
    const repositoryPath = seed(new Map([['main.ts', source]]));
    const { dependencies, written } = createRecordingStorage();

    const materialized = await materializePublication(dependencies, {
      publicationId: 'pub_clone',
      projectId: 'proj_clone',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });

    /* A stock clone of the repository, with no Tau anywhere in it. */
    const cloneParent = mkdtempSync(join(tmpdir(), 'tau-materializer-clone-'));
    git(cloneParent, 'clone', '--quiet', repositoryPath, 'clone');
    const clonePath = join(cloneParent, 'clone');
    const fromClone = gitBytes(clonePath, 'show', 'refs/tags/v1:main.ts');

    const served = written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(fromClone))}`);
    expect(served).toStrictEqual(fromClone);
    expect(served).toStrictEqual(source);
    /* And the manifest the viewer reads names exactly that digest. */
    const manifest = JSON.parse(new TextDecoder().decode(written.get(`derivatives/${materialized.manifestKey}`))) as {
      files: Record<string, string>;
    };
    expect(manifest.files['main.ts']).toBe(`sha256:${sha256HexFromBytes(fromClone)}`);
    /* The manifest is keyed by the revision the tag resolves to, so a
       re-publish writes a new object instead of overwriting a live one. */
    expect(materialized.manifestKey).toContain(git(clonePath, 'rev-parse', 'refs/tags/v1^{commit}').trim());
  });

  it('b: resolves an LFS pointer to the object bytes, not the pointer', async () => {
    const objectBytes = utf8(`ISO-10303-21;\n${'X'.repeat(4096)}\nEND-ISO-10303-21;\n`);
    const oid = sha256HexFromBytes(objectBytes);
    const pointer = utf8(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(objectBytes.byteLength)}\n`,
    );
    const repositoryPath = seed(
      new Map([
        ['main.ts', utf8('// entry\n')],
        ['part.step', pointer],
      ]),
    );
    const { dependencies, written } = createRecordingStorage(
      new Map([[gitLfsObjectKey('proj_lfs', oid), objectBytes]]),
    );

    await materializePublication(dependencies, {
      publicationId: 'pub_lfs',
      projectId: 'proj_lfs',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });

    const served = written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(objectBytes))}`);
    expect(served).toStrictEqual(objectBytes);
    /* The pointer itself is never what a viewer gets. */
    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(pointer))}`)).toBeUndefined();
  });

  it('b: refuses a pointer whose object never finished uploading', async () => {
    const oid = 'c'.repeat(64);
    const pointer = utf8(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 10\n`);
    const repositoryPath = seed(
      new Map([
        ['main.ts', utf8('// entry\n')],
        ['part.step', pointer],
      ]),
    );
    const { dependencies } = createRecordingStorage();

    await expect(
      readPublishedTree(dependencies, { repositoryPath, projectId: 'proj_missing', tag: 'v1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('b2: refuses a named version whose entry path is not in the tree', async () => {
    const repositoryPath = seed(new Map([['other.ts', utf8('// not the entry\n')]]));
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(dependencies, {
        publicationId: 'pub_entry',
        projectId: 'proj_entry',
        repositoryPath,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('b2: refuses a thumbnail whose bytes are not WebP', async () => {
    const repositoryPath = seed(
      new Map([
        ['main.ts', utf8('// entry\n')],
        ['thumbnail.webp', utf8('not-webp-at-all')],
      ]),
    );
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(dependencies, {
        publicationId: 'pub_thumb',
        projectId: 'proj_thumb',
        repositoryPath,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      }),
    ).rejects.toThrow();
  });

  /* R7: a name that never reached the remote is a sentence, not git's stderr. */
  it('R7: refuses a name the remote never received with the crafted 404', async () => {
    const repositoryPath = seed(new Map([['main.ts', utf8('// one\n')]]));
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(dependencies, {
        publicationId: 'pub_missing',
        projectId: 'proj_missing',
        repositoryPath,
        tag: 'v9',
        visibility: 'public',
        entryPath: 'main.ts',
      }),
    ).rejects.toMatchObject({
      response: { code: 'NOT_FOUND', message: 'This project has no version named v9 in the cloud.' },
    });
  });

  /* R5: the ceilings are decided from the sizes `ls-tree -l` reported, so a
     tree that cannot fit is refused before its bytes are read into memory. */
  it('R5: refuses an oversized tree before running cat-file', async () => {
    const repositoryPath = seed(new Map([['main.ts', utf8('// one\n')]]));
    const { dependencies } = createRecordingStorage();
    const commands: string[] = [];
    const oversized: MaterializerDependencies = {
      ...dependencies,
      git: async (cwd, args, stdin) => {
        commands.push(args[0] ?? '');
        const output = await realGit(cwd, args, stdin);
        if (args[0] !== 'ls-tree') {
          return output;
        }
        /* The listing says the blob is 60 MiB. Writing a real 60 MiB fixture
           would assert the same thing and cost the disk. */
        const listed = new TextDecoder().decode(output);
        return new TextEncoder().encode(listed.replace(/ {2,}\d+\t/u, `  ${String(60 * 1024 * 1024)}\t`));
      },
    };

    await expect(
      readPublishedTree(oversized, { repositoryPath, projectId: 'proj_big', tag: 'v1' }),
    ).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
    expect(commands).not.toContain('cat-file');
  });

  /* R5: a `missing` object truncated the tree silently; it is now a refusal. */
  it('R5: refuses a tree whose object the repository does not have', async () => {
    const repositoryPath = seed(
      new Map([
        ['main.ts', utf8('// one\n')],
        ['lib.ts', utf8('// two\n')],
      ]),
    );
    const { dependencies } = createRecordingStorage();
    const absent = '0'.repeat(40);
    const truncating: MaterializerDependencies = {
      ...dependencies,
      git: async (cwd, args, stdin) => {
        /* One listed object is replaced by an id the repository cannot have,
           which is what a corrupt or partially-received tree looks like. */
        if (args[0] === 'ls-tree') {
          const listed = new TextDecoder().decode(await realGit(cwd, args, stdin));
          return new TextEncoder().encode(listed.replace(/[\da-f]{40}/u, absent));
        }
        return realGit(cwd, args, stdin);
      },
    };

    await expect(
      readPublishedTree(truncating, { repositoryPath, projectId: 'proj_missing_object', tag: 'v1' }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  it('c: re-materializing the same revision writes the same blobs and the same manifest key', async () => {
    const repositoryPath = seed(new Map([['main.ts', utf8('// entry\n')]]));
    const first = createRecordingStorage();
    const second = createRecordingStorage();

    const before = await materializePublication(first.dependencies, {
      publicationId: 'pub_same',
      projectId: 'proj_same',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });
    const after = await materializePublication(second.dependencies, {
      publicationId: 'pub_same',
      projectId: 'proj_same',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });

    expect(after.manifestKey).toBe(before.manifestKey);
    expect([...second.written.keys()].filter((key) => key.startsWith('blobs/'))).toStrictEqual(
      [...first.written.keys()].filter((key) => key.startsWith('blobs/')),
    );
    expect(after.blobRefs).toStrictEqual(before.blobRefs);
  });

  it('c: moving the name to a new revision changes the manifest key and nothing else about the path', async () => {
    const repositoryPath = seed(new Map([['main.ts', utf8('// one\n')]]));
    const { dependencies, written } = createRecordingStorage();

    const first = await materializePublication(dependencies, {
      publicationId: 'pub_move',
      projectId: 'proj_move',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });

    writeFileSync(join(repositoryPath, 'main.ts'), utf8('// two\n'));
    git(repositoryPath, 'add', '-A');
    git(repositoryPath, 'commit', '-m', 'second');
    git(repositoryPath, 'tag', '-f', '-a', 'v1', '-m', 'moved');

    const second = await materializePublication(dependencies, {
      publicationId: 'pub_move',
      projectId: 'proj_move',
      repositoryPath,
      tag: 'v1',
      visibility: 'public',
      entryPath: 'main.ts',
    });

    expect(second.manifestKey).not.toBe(first.manifestKey);
    /* Both revisions' bytes are in the store under their own digests; the CDN
       path is a function of the digest, so no URL changed shape. */
    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(utf8('// one\n')))}`)).toStrictEqual(
      utf8('// one\n'),
    );
    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(utf8('// two\n')))}`)).toStrictEqual(
      utf8('// two\n'),
    );
    expect(readFileSync(join(repositoryPath, 'main.ts'))).toStrictEqual(Buffer.from(utf8('// two\n')));
  });
});
