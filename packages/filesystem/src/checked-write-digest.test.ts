import { describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '@taucad/utils/hash';
import type { CheckedFileWrite, CheckedFileWriteResult } from '@taucad/types';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { createWorkspaceFileService, encoder } from '#testing/workspace-service-harness.js';
import type { FileSystemProvider } from '#types.js';
import { isDigestPrecondition } from '#checked-write-precondition.js';

const mebibyte = 1024 * 1024;

const digest = async (text: string | Uint8Array<ArrayBuffer>): Promise<string> =>
  sha256Bytes(typeof text === 'string' ? encoder.encode(text) : text);

/** A memory root whose provider brings its own checked write, as the desktop provider does. */
const createNativeCheckedService = async (): Promise<{
  service: WorkspaceFileService;
  provider: FileSystemProvider;
  nativeChecked: ReturnType<typeof vi.fn>;
}> => {
  const providerRegistry = new ProviderRegistry({ databasePrefix: `tau-digest-native-${String(Math.random())}` });
  const memory = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:0' });
  const nativeChecked = vi.fn(async (input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult> => {
    const found = await Promise.all(
      input.preconditions.map(async (precondition) => ({
        precondition,
        actual: await memory.readFile(precondition.path).catch(() => null),
      })),
    );
    for (const { precondition, actual } of found) {
      const expected =
        typeof precondition.expected === 'string' ? encoder.encode(precondition.expected) : precondition.expected;
      const same =
        actual === null || expected === null
          ? actual === expected
          : actual.byteLength === expected.byteLength && actual.every((byte, index) => byte === expected[index]);
      if (!same) {
        return { status: 'conflict', conflicts: [{ path: precondition.path, actual }] };
      }
    }
    const data = typeof input.data === 'string' ? encoder.encode(input.data) : input.data;
    await memory.writeFile(input.path, data);
    return { status: 'applied', content: data };
  });
  const provider = new Proxy(memory, {
    get: (target, property, receiver) => {
      if (property === 'writeFileChecked') {
        return nativeChecked;
      }
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
    },
  });
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:0' });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  return { service, provider, nativeChecked };
};

describe('checked writes with a digest precondition (D17)', () => {
  it('should recognise a digest precondition by its field', () => {
    expect(isDigestPrecondition({ path: 'a', expectedSha256: 'f'.repeat(64) })).toBe(true);
    expect(isDigestPrecondition({ path: 'a', expected: null })).toBe(false);
  });

  it('should apply when the file still hashes to the digest and answer the digest of what it wrote', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'loaded');

    const result = await service.writeFileChecked({
      path: '/doc.ts',
      data: 'edited',
      preconditions: [{ path: '/doc.ts', expectedSha256: await digest('loaded') }],
    });

    expect(result).toEqual({ status: 'applied', content: encoder.encode('edited'), sha256: await digest('edited') });
    await expect(service.readFile('/doc.ts', 'utf8')).resolves.toBe('edited');
  });

  it('should refuse a stale digest with the bytes and digest it found, writing nothing', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'theirs');

    const result = await service.writeFileChecked({
      path: '/doc.ts',
      data: 'mine',
      preconditions: [{ path: '/doc.ts', expectedSha256: await digest('loaded') }],
    });

    expect(result).toEqual({
      status: 'conflict',
      conflicts: [{ path: '/doc.ts', actual: encoder.encode('theirs'), sha256: await digest('theirs') }],
    });
    await expect(service.readFile('/doc.ts', 'utf8')).resolves.toBe('theirs');
  });

  it('should refuse a digest when the file is absent', async () => {
    const { service } = await createWorkspaceFileService();

    const result = await service.writeFileChecked({
      path: '/gone.ts',
      data: 'mine',
      preconditions: [{ path: '/gone.ts', expectedSha256: await digest('loaded') }],
    });

    expect(result).toEqual({ status: 'conflict', conflicts: [{ path: '/gone.ts', actual: null }] });
    await expect(service.exists('/gone.ts')).resolves.toBe(false);
  });

  it('should answer unchanged, with the digest, when the write repeats the file', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'same');

    const result = await service.writeFileChecked({
      path: '/doc.ts',
      data: 'same',
      preconditions: [{ path: '/doc.ts', expectedSha256: await digest('same') }],
    });

    expect(result).toEqual({ status: 'unchanged', content: encoder.encode('same'), sha256: await digest('same') });
  });

  it('should check a file past the byte ceiling by its digest, where a byte precondition is refused', async () => {
    const { service } = await createWorkspaceFileService();
    const loaded = new Uint8Array(6 * mebibyte).fill(0x61);
    const edited = new Uint8Array(6 * mebibyte).fill(0x62);
    await service.writeFile('/large.txt', loaded);

    await expect(
      service.writeFileChecked({
        path: '/large.txt',
        data: edited,
        preconditions: [{ path: '/large.txt', expected: loaded }],
      }),
    ).rejects.toThrow(TypeError);
    const result = await service.writeFileChecked({
      path: '/large.txt',
      data: edited,
      preconditions: [{ path: '/large.txt', expectedSha256: await digest(loaded) }],
    });

    expect(result.status === 'applied' ? result.sha256 : result.status).toBe(await digest(edited));
    expect(await digest(await service.readFile('/large.txt'))).toBe(await digest(edited));
  });

  it('should create a file past the byte ceiling against absence, and refuse it where the file exists', async () => {
    const { service } = await createWorkspaceFileService();
    const large = new Uint8Array(9 * mebibyte).fill(0x63);

    const created = await service.writeFileChecked({
      path: '/new.bin',
      data: large,
      preconditions: [{ path: '/new.bin', expected: null }],
    });
    const again = await service.writeFileChecked({
      path: '/new.bin',
      data: new Uint8Array(9 * mebibyte).fill(0x64),
      preconditions: [{ path: '/new.bin', expected: null }],
    });

    expect(created.status).toBe('applied');
    expect(again.status).toBe('conflict');
    expect(await digest(await service.readFile('/new.bin'))).toBe(await digest(large));
  });

  it('should refuse a malformed digest before any read', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'loaded');

    await expect(
      service.writeFileChecked({
        path: '/doc.ts',
        data: 'mine',
        preconditions: [{ path: '/doc.ts', expectedSha256: 'SHA256:NOT-HEX' }],
      }),
    ).rejects.toThrow('is not a lowercase SHA-256');
    await expect(service.readFile('/doc.ts', 'utf8')).resolves.toBe('loaded');
  });

  it('should refuse a digest and bytes that name the same path', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'loaded');

    await expect(
      service.writeFileChecked({
        path: '/doc.ts',
        data: 'mine',
        preconditions: [
          { path: '/doc.ts', expectedSha256: await digest('loaded') },
          { path: '/doc.ts', expected: 'loaded' },
        ],
      }),
    ).rejects.toThrow('aliases disagree');
  });

  it('should hand a provider that checks its own writes the bytes the digest resolved to', async () => {
    const { service, nativeChecked } = await createNativeCheckedService();
    await service.writeFile('/doc.ts', 'loaded');

    const result = await service.writeFileChecked({
      path: '/doc.ts',
      data: 'edited',
      preconditions: [{ path: '/doc.ts', expectedSha256: await digest('loaded') }],
    });

    expect(result).toEqual({ status: 'applied', content: encoder.encode('edited'), sha256: await digest('edited') });
    expect(nativeChecked).toHaveBeenCalledOnce();
    expect(nativeChecked.mock.calls[0]![0]).toMatchObject({ preconditions: [{ expected: encoder.encode('loaded') }] });
  });

  it('should compare a large file itself when the bytes would pass the provider check bound', async () => {
    const { service, nativeChecked } = await createNativeCheckedService();
    const loaded = new Uint8Array(6 * mebibyte).fill(0x61);
    const edited = new Uint8Array(6 * mebibyte).fill(0x62);
    await service.writeFile('/large.txt', loaded);

    const result = await service.writeFileChecked({
      path: '/large.txt',
      data: edited,
      preconditions: [{ path: '/large.txt', expectedSha256: await digest(loaded) }],
    });

    expect(result.status === 'applied' ? result.sha256 : result.status).toBe(await digest(edited));
    expect(nativeChecked).not.toHaveBeenCalled();
    expect(await digest(await service.readFile('/large.txt'))).toBe(await digest(edited));
  });

  it('should leave byte-precondition results without a digest', async () => {
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'loaded');

    const result = await service.writeFileChecked({
      path: '/doc.ts',
      data: 'edited',
      preconditions: [{ path: '/doc.ts', expected: 'loaded' }],
    });

    expect(result).toEqual({ status: 'applied', content: encoder.encode('edited') });
  });
});

describe('a composed view over a digest-checked root', () => {
  it('should route a digest precondition to the root and refuse it where the root has none', async () => {
    const { composeView } = await import('#composed-view.js');
    const { tauPathPolicy } = await import('#path-registry.js');
    const { service } = await createWorkspaceFileService();
    await service.writeFile('/doc.ts', 'loaded');
    const rooted = service.createRootedFileSystem('/');
    const view = composeView({ filesystem: rooted }, { consumer: 'user', policy: tauPathPolicy });

    await expect(
      view.writeFileChecked!({
        path: 'doc.ts',
        data: 'edited',
        preconditions: [{ path: 'doc.ts', expectedSha256: await digest('loaded') }],
      }),
    ).resolves.toMatchObject({ status: 'applied', sha256: await digest('edited') });

    const { writeFileCheckedDigest: _omitted, ...withoutDigest } = rooted;
    const bare = composeView({ filesystem: withoutDigest }, { consumer: 'user', policy: tauPathPolicy });
    await expect(
      bare.writeFileChecked!({
        path: 'doc.ts',
        data: 'again',
        preconditions: [{ path: 'doc.ts', expectedSha256: await digest('edited') }],
      }),
    ).rejects.toMatchObject({ code: 'ENOTSUP' });
  });
});
