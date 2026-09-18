/**
 * The materializer against real `git`, over a real lease (AC13, charter W4c).
 *
 * Every fixture here is pushed into a lease and hydrated back out of a manifest,
 * because that is the only directory the materializer is ever handed now: the
 * repository on a volume is gone, and a lease is built, used and disposed
 * inside one request (D9, NI1).
 *
 * Red pin (b): a publication's viewer serves bytes identical to
 * `git show <tag>:<path>` on a **stock clone** of that repository — including a
 * file that is an LFS object, where "identical" means the object's own bytes,
 * not the pointer git hands back without the filter.
 *
 * Red pin (b2): a named version whose entry path is not in the tree is refused,
 * because a manifest that names a file it has no digest for is a publication
 * whose viewer opens nothing.
 *
 * Red pin (c): materialization is derived state (D19). Re-running it for a tag
 * already materialized at that oid does nothing at all; a failure leaves the
 * row alone and the next observation of the mismatch retries it; a tag that
 * moved replaces the version and moves its reference counts.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import { tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import { createMemoryRepositoryStore, seedLease } from '#testing/publication-lease.fixture.js';
import {
  materializePublication,
  materializePublishedTags,
  readPublishedTree,
} from '#api/publications/publication-materializer.js';
import type { MaterializerDependencies } from '#api/publications/publication-materializer.js';
import type { ObjectStorageServiceContract, PutBlobResult } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';

/**
 * The runner the API passes in, as a plain `spawnSync` so the suite exercises
 * real `git` output rather than a stub of it.
 *
 * @param directory - Where the child runs.
 * @param args - Arguments after `git`.
 * @param stdin - Written to the child, when given.
 * @returns The child's stdout.
 */
const realGit: MaterializerDependencies['git'] = async (directory, args, stdin) => {
  const result = spawnSync('git', [...args], {
    cwd: directory,
    ...(stdin === undefined ? {} : { input: stdin }),
  });
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

/** One project's working repository, with one named version holding the files. */
const seed = (files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>, tag = 'v1'): string => {
  const source = mkdtempSync(join(tmpdir(), 'tau-materializer-'));
  git(source, 'init', '--initial-branch=main', '.');
  for (const [relativePath, bytes] of files) {
    mkdirSync(dirname(join(source, relativePath)), { recursive: true });
    writeFileSync(join(source, relativePath), bytes);
  }
  git(source, 'add', '-A');
  git(source, 'commit', '-m', 'seed');
  git(source, 'tag', '-a', tag, '-m', 'named');
  return source;
};

const leases: RepositoryLease[] = [];

afterAll(async () => {
  await Promise.all(leases.map(async (lease) => lease.dispose()));
});

/** The lease a request would be handed for this project, disposed at the end. */
const leaseFor = async (source: string, projectId: string): Promise<RepositoryLease> => {
  const store = createMemoryRepositoryStore();
  const lease = await seedLease({ store, ownerId: 'user_w4c', projectId, source });
  leases.push(lease);
  return lease;
};

/** A lease and the store behind it, for a fixture that pushes twice. */
const openRepository = async (
  source: string,
  projectId: string,
): Promise<{ store: ReturnType<typeof createMemoryRepositoryStore>; lease: RepositoryLease }> => {
  const store = createMemoryRepositoryStore();
  const lease = await seedLease({ store, ownerId: 'user_w4c', projectId, source });
  leases.push(lease);
  return { store, lease };
};

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/**
 * The open transaction the materializer takes its reference counts in.
 *
 * @param onReference - Runs as each count is taken, for the collector race.
 * @returns The writer, and the counts it recorded.
 */
const writerStub = (
  onReference?: (payload: Record<string, unknown>) => void,
): MaterializerDependencies['databaseService']['database'] & { taken: Array<Record<string, unknown>> } => {
  const taken: Array<Record<string, unknown>> = [];
  const writer = {
    taken,
    insert: vi.fn(() => ({
      values: vi.fn((payload: Record<string, unknown>) => {
        taken.push(payload);
        onReference?.(payload);
        return { onConflictDoUpdate: vi.fn(async () => undefined) };
      }),
    })),
  };
  return writer as unknown as MaterializerDependencies['databaseService']['database'] & {
    taken: Array<Record<string, unknown>>;
  };
};

/** Storage that remembers every blob it was given, keyed as the CDN keys it. */
const createRecordingStorage = (
  lfsObjects: ReadonlyMap<string, Uint8Array<ArrayBuffer>> = new Map(),
  options: { readonly failWrites?: boolean; readonly failReads?: boolean } = {},
): Readonly<{
  dependencies: MaterializerDependencies;
  written: Map<string, Uint8Array<ArrayBuffer>>;
  read: string[];
}> => {
  const written = new Map<string, Uint8Array<ArrayBuffer>>();
  const read: string[] = [];
  const storage: ObjectStorageServiceContract = {
    putBlob: vi.fn(async (args): Promise<PutBlobResult> => {
      if (options.failWrites === true) {
        throw new Error('object storage is unavailable');
      }
      written.set(`${args.namespace}/${args.key}`, new Uint8Array(Buffer.from(args.body as Uint8Array<ArrayBuffer>)));
      return { lost: false, etag: 'etag', alreadyExisted: false };
    }),
    deleteBlobs: vi.fn(async () => ({ deleted: 0 })),
    listObjects: vi.fn(async function* listObjectsStub() {
      yield* [];
    }),
    getBlob: vi.fn(async (args: Parameters<ObjectStorageServiceContract['getBlob']>[0]) => {
      read.push(`${args.namespace}/${args.key}`);
      if (options.failReads === true) {
        /* A store that is there but cannot answer: not a missing object. */
        throw Object.assign(new Error('object storage timed out'), { name: 'TimeoutError' });
      }
      const stored = lfsObjects.get(`${args.namespace}/${args.key}`) ?? written.get(`${args.namespace}/${args.key}`);
      if (stored === undefined) {
        throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      }
      return {
        body: Readable.from([Buffer.from(stored)]),
        contentType: 'application/octet-stream',
        etag: 'etag',
      };
    }),
    /* The bytes the bucket already holds, which is what the publish path skips
       re-uploading — and what a collector can remove underneath it. */
    headBlob: vi.fn(async (args: Parameters<ObjectStorageServiceContract['headBlob']>[0]) =>
      written.has(`${args.namespace}/${args.key}`) || lfsObjects.has(`${args.namespace}/${args.key}`)
        ? { contentType: 'application/octet-stream', size: 0, etag: 'etag', cacheControl: '' }
        : undefined,
    ),
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
    read,
    dependencies: {
      storage: storage as unknown as MaterializerDependencies['storage'],
      databaseService: {} as unknown as MaterializerDependencies['databaseService'],
      git: realGit,
      /* The LFS endpoint's order, over whichever key this fixture seeded: the
         tenant one every upload lands at, then the pre-D24 one (W4b). */
      resolveLfsObject: async ({ ownerId, projectId, oid }) => {
        const candidates = [
          { namespace: 'tenants', key: tenantLfsObjectKey(ownerId, projectId, oid), tier: 'private' },
          { namespace: 'blobs', key: gitLfsObjectKey(projectId, oid), tier: 'private' },
        ] as const;
        return candidates.find((candidate) => lfsObjects.has(`${candidate.namespace}/${candidate.key}`));
      },
    },
  };
};

/** One publication row, in the shape the push path reads back. */
type PublicationFixture = {
  id: string;
  projectId: string;
  tag: string;
  visibility: string;
  entryPath: string;
  manifestKey: string;
  revisionId: string;
};

/**
 * The database the push path writes through, with its statements recorded.
 *
 * @param rows - The publications this project already has.
 * @returns The dependency, plus what each statement carried.
 */
const createPublicationDatabase = (
  rows: PublicationFixture[],
): Readonly<{
  databaseService: MaterializerDependencies['databaseService'];
  increments: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  decrements: number;
}> => {
  const increments: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const counters = { decrements: 0 };

  /** One open transaction's statements, which only a commit makes visible. */
  const openTransaction = (): {
    readonly handle: { execute: unknown; select: unknown; insert: unknown; update: unknown };
    commit(): void;
  } => {
    const staged: { increments: Array<Record<string, unknown>>; updates: Array<Record<string, unknown>> } = {
      increments: [],
      updates: [],
    };
    return {
      handle: {
        /* The project advisory lock the materializer takes (review F2). */
        execute: vi.fn(async () => undefined),
        /* The re-read under that lock, which one caller always wins. */
        select: vi.fn(() => ({
          from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => rows) })) })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn((payload: Record<string, unknown>) => {
            staged.increments.push(payload);
            return { onConflictDoUpdate: vi.fn(async () => undefined) };
          }),
        })),
        update: vi.fn(() => ({
          set: vi.fn((payload: Record<string, unknown>) => {
            staged.updates.push(payload);
            /* The compare-and-swap moved this row: one caller, so it always
               matches the manifest key it was read at. */
            return { where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'moved' }]) })) };
          }),
        })),
      },
      commit: () => {
        increments.push(...staged.increments);
        updates.push(...staged.updates);
        /* What a later read would see, once the transaction committed. */
        for (const payload of staged.updates) {
          for (const row of rows) {
            Object.assign(row, payload);
          }
        }
      },
    };
  };

  const database = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => rows) })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            counters.decrements += 1;
            return [{ sha256: 'decremented' }];
          }),
        })),
      })),
    })),
    transaction: vi.fn(async <T>(callback: (inner: unknown) => Promise<T>): Promise<T> => {
      const open = openTransaction();
      /* A throw rolls back: nothing this callback staged is ever visible. */
      const result = await callback(open.handle);
      open.commit();
      return result;
    }),
  };

  return {
    databaseService: { database } as unknown as MaterializerDependencies['databaseService'],
    increments,
    updates,
    get decrements(): number {
      return counters.decrements;
    },
  };
};

/** The tag refs a push moved, in the shape the git service passes them. */
const movedTag = (lease: RepositoryLease, tag = 'v1'): ReadonlyArray<{ ref: string; oid: string }> => [
  { ref: `refs/tags/${tag}`, oid: git(lease.directory, 'rev-parse', `refs/tags/${tag}`).trim() },
];

describe('publication materializer against real git', () => {
  /* Red pin b. */
  it('should serve every file byte-identical to a stock clone of the lease', async () => {
    const source = utf8('export const bracket = () => {};\n');
    /* Not text: a blob whose bytes any decode-and-re-encode step would change. */
    const thumbnail = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 1, 0xfe, 0xff]);
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', source],
          ['thumbnail.webp', thumbnail],
        ]),
      ),
      'proj_clone',
    );
    const { dependencies, written } = createRecordingStorage();

    const materialized = await materializePublication(
      dependencies,
      {
        publicationId: 'pub_clone',
        projectId: 'proj_clone',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );

    /* A stock clone of the repository the lease holds, with no Tau in it. */
    const cloneParent = mkdtempSync(join(tmpdir(), 'tau-materializer-clone-'));
    git(cloneParent, 'clone', '--quiet', lease.directory, 'clone');
    const clonePath = join(cloneParent, 'clone');

    const manifest = JSON.parse(new TextDecoder().decode(written.get(`derivatives/${materialized.manifestKey}`))) as {
      files: Record<string, string>;
    };
    const cloned = git(clonePath, 'ls-tree', '-r', '--name-only', 'refs/tags/v1')
      .split('\n')
      .filter((line) => line !== '');

    /* The file list is the tag's file list, and every one of them is served as
       the bytes the clone hands back. */
    expect(Object.keys(manifest.files).sort()).toStrictEqual([...cloned].sort());
    for (const relativePath of cloned) {
      const fromClone = gitBytes(clonePath, 'show', `refs/tags/v1:${relativePath}`);
      expect(manifest.files[relativePath]).toBe(`sha256:${sha256HexFromBytes(fromClone)}`);
      expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(fromClone))}`)).toStrictEqual(fromClone);
    }
    /* The manifest is keyed by the revision the tag resolves to, so a
       re-publish writes a new object instead of overwriting a live one. */
    expect(materialized.manifestKey).toContain(git(clonePath, 'rev-parse', 'refs/tags/v1^{commit}').trim());
  });

  it('should preserve unreadable parameter record bytes as authored publication data', async () => {
    const parameterBytes = utf8(
      '{"recordVersion":2,"activeGroup":"alternate","groups":{"alternate":{"values":{"exact":"1.2300"}}}}',
    );
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['.tau/parameters/main.ts.json', parameterBytes],
        ]),
      ),
      'proj_parameter_bytes',
    );
    const { dependencies, written } = createRecordingStorage();

    await materializePublication(
      dependencies,
      {
        publicationId: 'pub_parameter_bytes',
        projectId: 'proj_parameter_bytes',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );

    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(parameterBytes))}`)).toStrictEqual(
      parameterBytes,
    );
  });

  /* Red pin b. */
  it('should serve an LFS pointer as the object bytes, not the pointer', async () => {
    const objectBytes = utf8(`ISO-10303-21;\n${'X'.repeat(4096)}\nEND-ISO-10303-21;\n`);
    const oid = sha256HexFromBytes(objectBytes);
    const pointer = utf8(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(objectBytes.byteLength)}\n`,
    );
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['part.step', pointer],
        ]),
      ),
      'proj_lfs',
    );
    /* Where every upload lands since D24; the resolver looks here first. */
    const { dependencies, written } = createRecordingStorage(
      new Map([[`tenants/${tenantLfsObjectKey('user_w4c', 'proj_lfs', oid)}`, objectBytes]]),
    );

    await materializePublication(
      dependencies,
      {
        publicationId: 'pub_lfs',
        projectId: 'proj_lfs',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );

    const served = written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(objectBytes))}`);
    expect(served).toStrictEqual(objectBytes);
    /* The pointer itself is never what a viewer gets. */
    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(pointer))}`)).toBeUndefined();
  });

  /* Red pin b, for a project whose objects predate D24's tenant prefix. */
  it('should serve an LFS object still held at the legacy key', async () => {
    const objectBytes = utf8(`ISO-10303-21;\n${'Y'.repeat(2048)}\nEND-ISO-10303-21;\n`);
    const oid = sha256HexFromBytes(objectBytes);
    const pointer = utf8(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(objectBytes.byteLength)}\n`,
    );
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['part.step', pointer],
        ]),
      ),
      'proj_lfs_legacy',
    );
    /* Only the pre-D24 key, which is what a project the relocation has not
       reached yet still has. */
    const { dependencies, written } = createRecordingStorage(
      new Map([[`blobs/${gitLfsObjectKey('proj_lfs_legacy', oid)}`, objectBytes]]),
    );

    await materializePublication(
      dependencies,
      {
        publicationId: 'pub_lfs_legacy',
        projectId: 'proj_lfs_legacy',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );

    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(objectBytes))}`)).toStrictEqual(objectBytes);
  });

  /* Red pin b. */
  it('should refuse a pointer whose object never finished uploading', async () => {
    const oid = 'c'.repeat(64);
    const pointer = utf8(`version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize 10\n`);
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['part.step', pointer],
        ]),
      ),
      'proj_missing',
    );
    const { dependencies } = createRecordingStorage();

    await expect(
      readPublishedTree(dependencies, {
        ownerId: 'user_w4c',
        directory: lease.directory,
        projectId: 'proj_missing',
        tag: 'v1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  /* Review N3. */
  it('should report a storage failure during an LFS read as itself', async () => {
    const objectBytes = utf8(`ISO-10303-21;\n${'Z'.repeat(1024)}\nEND-ISO-10303-21;\n`);
    const oid = sha256HexFromBytes(objectBytes);
    const pointer = utf8(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(objectBytes.byteLength)}\n`,
    );
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['part.step', pointer],
        ]),
      ),
      'proj_lfs_outage',
    );
    /* The object is exactly where the resolver says it is; reading it is what
       fails, so telling the publisher to push again would be a lie. */
    const { dependencies } = createRecordingStorage(
      new Map([[`tenants/${tenantLfsObjectKey('user_w4c', 'proj_lfs_outage', oid)}`, objectBytes]]),
      { failReads: true },
    );

    const failure = await readPublishedTree(dependencies, {
      ownerId: 'user_w4c',
      directory: lease.directory,
      projectId: 'proj_lfs_outage',
      tag: 'v1',
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).not.toBeInstanceOf(NotFoundException);
    expect(failure).toMatchObject({ message: 'object storage timed out' });
  });

  /* Red pin b2. */
  it('should refuse a named version whose entry path is not in the tree', async () => {
    const lease = await leaseFor(seed(new Map([['other.ts', utf8('// not the entry\n')]])), 'proj_entry');
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(
        dependencies,
        {
          publicationId: 'pub_entry',
          projectId: 'proj_entry',
          ownerId: 'user_w4c',
          directory: lease.directory,
          tag: 'v1',
          visibility: 'public',
          entryPath: 'main.ts',
        },
        writerStub(),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  /* Red pin b2. */
  it('should refuse a thumbnail whose bytes are not WebP', async () => {
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// entry\n')],
          ['thumbnail.webp', utf8('not-webp-at-all')],
        ]),
      ),
      'proj_thumb',
    );
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(
        dependencies,
        {
          publicationId: 'pub_thumb',
          projectId: 'proj_thumb',
          ownerId: 'user_w4c',
          directory: lease.directory,
          tag: 'v1',
          visibility: 'public',
          entryPath: 'main.ts',
        },
        writerStub(),
      ),
    ).rejects.toThrow();
  });

  /* R7: a name that never reached the remote is a sentence, not git's stderr. */
  /* Review R7. */
  it('should refuse a name the remote never received with the crafted 404', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// one\n')]])), 'proj_absent');
    const { dependencies } = createRecordingStorage();

    await expect(
      materializePublication(
        dependencies,
        {
          publicationId: 'pub_missing',
          projectId: 'proj_absent',
          ownerId: 'user_w4c',
          directory: lease.directory,
          tag: 'v9',
          visibility: 'public',
          entryPath: 'main.ts',
        },
        writerStub(),
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'NOT_FOUND',
        message: 'This project has no version named v9 in the cloud.',
      },
    });
  });

  /* R5: the ceilings are decided from the sizes `ls-tree -l` reported, so a
     tree that cannot fit is refused before its bytes are read into memory. */
  /* Review R5. */
  it('should refuse an oversized tree before running cat-file', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// one\n')]])), 'proj_big');
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
      readPublishedTree(oversized, {
        ownerId: 'user_w4c',
        directory: lease.directory,
        projectId: 'proj_big',
        tag: 'v1',
      }),
    ).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
    expect(commands).not.toContain('cat-file');
  });

  /* R5: a `missing` object truncated the tree silently; it is now a refusal. */
  /* Review R5. */
  it('should refuse a tree whose object the repository does not have', async () => {
    const lease = await leaseFor(
      seed(
        new Map([
          ['main.ts', utf8('// one\n')],
          ['lib.ts', utf8('// two\n')],
        ]),
      ),
      'proj_missing_object',
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
      readPublishedTree(truncating, {
        ownerId: 'user_w4c',
        directory: lease.directory,
        projectId: 'proj_missing_object',
        tag: 'v1',
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });

  /* Red pin c. */
  it('should write the same blobs and the same manifest key when the revision is unchanged', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// entry\n')]])), 'proj_same');
    const first = createRecordingStorage();
    const second = createRecordingStorage();

    const before = await materializePublication(
      first.dependencies,
      {
        publicationId: 'pub_same',
        projectId: 'proj_same',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );
    const after = await materializePublication(
      second.dependencies,
      {
        publicationId: 'pub_same',
        projectId: 'proj_same',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writerStub(),
    );

    expect(after.manifestKey).toBe(before.manifestKey);
    expect([...second.written.keys()].filter((key) => key.startsWith('blobs/'))).toStrictEqual(
      [...first.written.keys()].filter((key) => key.startsWith('blobs/')),
    );
    expect(after.blobRefs).toStrictEqual(before.blobRefs);
  });

  /* D10: the fence W6's collector is safe against. The collector deletes a
     `blob_ref` row at refcount 0 and then the bytes it named, so a publish that
     skipped the upload because the bytes were there and only counted the
     reference afterwards could end up pointing at nothing. */
  it('should re-put a blob a collector removed while this version was taking its reference', async () => {
    const entry = utf8('// entry\n');
    const lease = await leaseFor(seed(new Map([['main.ts', entry]])), 'proj_collector');
    const { dependencies, written } = createRecordingStorage();
    const key = `blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(entry))}`;
    /* The bytes are in the bucket already, at refcount 0: a superseded version
       referenced them and gave its count back. */
    written.set(key, entry);

    const writer = writerStub(() => {
      /* The collector, arriving in the only window that matters: the row is
         gone and the bytes with it. */
      written.delete(key);
    });

    const materialized = await materializePublication(
      dependencies,
      {
        publicationId: 'pub_collector',
        projectId: 'proj_collector',
        ownerId: 'user_w4c',
        directory: lease.directory,
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
      },
      writer,
    );

    /* The reference was taken before a blob was looked at, and the missing
       bytes were written back, so the version this publish serves is whole. */
    expect(writer.taken).toStrictEqual([
      { sha256: sha256HexFromBytes(entry), sizeBytes: BigInt(entry.byteLength), refcount: 1 },
    ]);
    expect(written.get(key)).toStrictEqual(entry);
    expect(materialized.fileCount).toBe(1);
  });
});

describe('materializing the tags a push moved', () => {
  it('should materialize a published tag from the lease and record the revision it served', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// entry\n')]])), 'proj_push');
    const { dependencies, written } = createRecordingStorage();
    const database = createPublicationDatabase([
      {
        id: 'pub_push',
        projectId: 'proj_push',
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
        manifestKey: '',
        revisionId: '',
      },
    ]);

    const materialized = await materializePublishedTags(
      { ...dependencies, databaseService: database.databaseService },
      { projectId: 'proj_push', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
    );

    const revision = git(lease.directory, 'rev-parse', 'refs/tags/v1^{commit}').trim();
    expect(materialized).toStrictEqual([
      {
        publicationId: 'pub_push',
        tag: 'v1',
        oid: movedTag(lease)[0]?.oid,
        revisionId: revision,
        manifestKey: `publications/pub_push/${revision}.json`,
      },
    ]);
    expect(written.get(`blobs/${blobKeyFromSha256Hex(sha256HexFromBytes(utf8('// entry\n')))}`)).toStrictEqual(
      utf8('// entry\n'),
    );
    expect(database.increments).toHaveLength(1);
  });

  it('should do nothing for a tag already materialized at that oid', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// entry\n')]])), 'proj_noop');
    const rows: PublicationFixture[] = [
      {
        id: 'pub_noop',
        projectId: 'proj_noop',
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
        manifestKey: '',
        revisionId: '',
      },
    ];
    const first = createRecordingStorage();
    const firstDatabase = createPublicationDatabase(rows);
    await materializePublishedTags(
      { ...first.dependencies, databaseService: firstDatabase.databaseService },
      { projectId: 'proj_noop', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
    );

    /* The same push observed a second time — which is exactly what a
       derived-generation mismatch hands back after a crash. */
    const second = createRecordingStorage();
    const secondDatabase = createPublicationDatabase(rows);
    const again = await materializePublishedTags(
      { ...second.dependencies, databaseService: secondDatabase.databaseService },
      { projectId: 'proj_noop', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
    );

    expect(again).toStrictEqual([]);
    expect([...second.written.keys()]).toStrictEqual([]);
    expect(secondDatabase.increments).toStrictEqual([]);
    expect(secondDatabase.decrements).toBe(0);
  });

  it('should leave the row alone when storage fails, and materialize on the retry', async () => {
    const lease = await leaseFor(seed(new Map([['main.ts', utf8('// entry\n')]])), 'proj_retry');
    const rows: PublicationFixture[] = [
      {
        id: 'pub_retry',
        projectId: 'proj_retry',
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
        manifestKey: '',
        revisionId: '',
      },
    ];
    const failing = createRecordingStorage(new Map(), { failWrites: true });
    const failedDatabase = createPublicationDatabase(rows);

    await expect(
      materializePublishedTags(
        { ...failing.dependencies, databaseService: failedDatabase.databaseService },
        { projectId: 'proj_retry', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
      ),
    ).rejects.toThrow(AggregateError);
    expect(failedDatabase.increments).toStrictEqual([]);
    expect(rows[0]?.manifestKey).toBe('');

    /* The next observation of the mismatch is the retry; there is no queue. */
    const working = createRecordingStorage();
    const retryDatabase = createPublicationDatabase(rows);
    const materialized = await materializePublishedTags(
      { ...working.dependencies, databaseService: retryDatabase.databaseService },
      { projectId: 'proj_retry', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
    );

    const revision = git(lease.directory, 'rev-parse', 'refs/tags/v1^{commit}').trim();
    expect(materialized.map((version) => version.revisionId)).toStrictEqual([revision]);
    expect(rows[0]?.manifestKey).toBe(`publications/pub_retry/${revision}.json`);
  });

  it('should replace the version and move its reference counts when the tag moves', async () => {
    const source = seed(new Map([['main.ts', utf8('// one\n')]]));
    const { store, lease } = await openRepository(source, 'proj_move');
    const rows: PublicationFixture[] = [
      {
        id: 'pub_move',
        projectId: 'proj_move',
        tag: 'v1',
        visibility: 'public',
        entryPath: 'main.ts',
        manifestKey: '',
        revisionId: '',
      },
    ];
    const first = createRecordingStorage();
    const firstDatabase = createPublicationDatabase(rows);
    await materializePublishedTags(
      { ...first.dependencies, databaseService: firstDatabase.databaseService },
      { projectId: 'proj_move', ownerId: 'user_w4c', directory: lease.directory, tags: movedTag(lease) },
    );
    const firstKey = rows[0]?.manifestKey;

    /* The name moves to a new commit and is pushed again, which is the second
       generation the next lease hydrates. */
    writeFileSync(join(source, 'main.ts'), utf8('// two\n'));
    git(source, 'add', '-A');
    git(source, 'commit', '-m', 'second');
    git(source, 'tag', '-f', '-a', 'v1', '-m', 'moved');
    const moved = await seedLease({ store, ownerId: 'user_w4c', projectId: 'proj_move', source });
    leases.push(moved);

    const second = createRecordingStorage();
    /* The superseded manifest is what the release path reads its digests from. */
    second.written.set(
      `derivatives/${String(firstKey)}`,
      first.written.get(`derivatives/${String(firstKey)}`) ?? utf8(''),
    );
    const secondDatabase = createPublicationDatabase(rows);
    const materialized = await materializePublishedTags(
      { ...second.dependencies, databaseService: secondDatabase.databaseService },
      { projectId: 'proj_move', ownerId: 'user_w4c', directory: moved.directory, tags: movedTag(moved) },
    );

    expect(materialized).toHaveLength(1);
    expect(rows[0]?.manifestKey).not.toBe(firstKey);
    /* The new blob is counted once, and the superseded manifest's one file is
       given back — the discipline W6's collector deletes zero-count rows on. */
    expect(secondDatabase.increments).toStrictEqual([
      {
        sha256: sha256HexFromBytes(utf8('// two\n')),
        sizeBytes: BigInt(utf8('// two\n').byteLength),
        refcount: 1,
      },
    ]);
    expect(secondDatabase.decrements).toBe(1);
    expect(second.read).toContain(`derivatives/${String(firstKey)}`);
  });
});
