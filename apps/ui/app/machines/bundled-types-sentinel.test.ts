// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { populateBundledTypesMount } from '@taucad/filesystem/bundled-types-mount';
import type { BundledTypesPayload } from '@taucad/filesystem/bundled-types-mount';
import { bundledTypesSentinelPath, ensureBundledTypesMount } from '#machines/bundled-types-sentinel.js';

const payload: BundledTypesPayload = [
  { packageName: '@taucad/replicad', content: 'export declare const a: 1;', files: { 'sub.d.ts': 'export {};' } },
  { packageName: '@taucad/kcl', content: 'export declare const b: 2;' },
];

type PackageReplacement = {
  readonly packageDirectory: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly content: string }>;
};

/**
 * Mount double at the real mutation boundary: population runs through the
 * actual `populateBundledTypesMount`, so package-name and path validation are
 * exercised rather than imitated.
 */
const createMount = () => {
  const files = new Map<string, string>();
  const fileService = {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return content;
    }),
    replaceBundledTypePackages: vi.fn(async (packages: readonly PackageReplacement[]) => {
      for (const replacement of packages) {
        // Map iteration tolerates deletion of the current key.
        for (const path of files.keys()) {
          if (path.startsWith(`${replacement.packageDirectory}/`)) {
            files.delete(path);
          }
        }
        for (const file of replacement.files) {
          files.set(file.path, file.content);
        }
      }
    }),
  };
  const populate = vi.fn(async (entries: BundledTypesPayload) =>
    populateBundledTypesMount(fileService as unknown as Parameters<typeof populateBundledTypesMount>[0], entries),
  );
  return { files, fileService, populate };
};

describe('ensureBundledTypesMount', () => {
  it('populates and stamps a mount that has never been populated', async () => {
    const { files, fileService, populate } = createMount();

    await expect(ensureBundledTypesMount(fileService, payload, { populate })).resolves.toBe('populated');
    expect(files.get(bundledTypesSentinelPath)).toBeTypeOf('string');
    expect(files.get('/node_modules/@taucad/kcl/index.d.ts')).toBe('export declare const b: 2;');
  });

  it('writes the declarations exactly as an unstamped boot would, then stamps separately', async () => {
    const { fileService, populate } = createMount();

    await ensureBundledTypesMount(fileService, payload, { populate });

    expect(populate).toHaveBeenCalledTimes(2);
    // The declaration write is byte-identical to the pre-sentinel call.
    expect(populate.mock.calls[0]![0]).toEqual(payload);
    expect(populate.mock.calls[1]![0].at(-1)?.files?.['stamp.txt']).toBeTypeOf('string');
  });

  it('keeps the declarations when only the stamp write fails', async () => {
    const { files, fileService } = createMount();
    const populate = vi.fn(async (entries: BundledTypesPayload) => {
      if (entries.some((entry) => entry.packageName === 'tau-bundled-types')) {
        throw new TypeError('mount refused the stamp');
      }
      files.set(`/node_modules/${entries[0]!.packageName}/index.d.ts`, entries[0]!.content);
    });

    await expect(ensureBundledTypesMount(fileService, payload, { populate })).resolves.toBe('populated');
    expect(files.get('/node_modules/@taucad/replicad/index.d.ts')).toBe('export declare const a: 1;');
    expect(files.has(bundledTypesSentinelPath)).toBe(false);
  });

  it('skips the rewrite on a second boot with the same payload', async () => {
    const mount = createMount();
    await ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate });
    mount.populate.mockClear();
    mount.fileService.replaceBundledTypePackages.mockClear();

    await expect(ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate })).resolves.toBe(
      'skipped',
    );
    expect(mount.populate).not.toHaveBeenCalled();
    expect(mount.fileService.replaceBundledTypePackages).not.toHaveBeenCalled();
  });

  it('repopulates and restamps when the bundled payload changed', async () => {
    const mount = createMount();
    await ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate });
    const stale = mount.files.get(bundledTypesSentinelPath);
    mount.populate.mockClear();

    const changed: BundledTypesPayload = [{ ...payload[0]!, content: 'export declare const a: 2;' }, payload[1]!];
    await expect(ensureBundledTypesMount(mount.fileService, changed, { populate: mount.populate })).resolves.toBe(
      'populated',
    );
    expect(mount.files.get(bundledTypesSentinelPath)).not.toBe(stale);
    expect(mount.files.get('/node_modules/@taucad/replicad/index.d.ts')).toBe('export declare const a: 2;');
  });

  it('populates when the stamp is unreadable rather than trusting a blank mount', async () => {
    const { fileService, populate } = createMount();
    fileService.readFile.mockRejectedValue(new Error('storage error'));

    await expect(ensureBundledTypesMount(fileService, payload, { populate })).resolves.toBe('populated');
  });

  it('leaves no stamp behind when population fails', async () => {
    const { files, fileService } = createMount();

    await expect(
      ensureBundledTypesMount(fileService, payload, {
        populate: async () => {
          throw new Error('quota exceeded');
        },
      }),
    ).rejects.toThrow('quota exceeded');
    expect(files.has(bundledTypesSentinelPath)).toBe(false);
  });

  // W7: the warm boot is one small read and a string compare — the 11.9 MiB
  // payload must not be hashed at all when the build identity matches.
  it('skips the payload hash when the build identity matches', async () => {
    const mount = createMount();
    await ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-1' });
    mount.populate.mockClear();
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');

    await expect(
      ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-1' }),
    ).resolves.toBe('skipped');

    expect(digest).not.toHaveBeenCalled();
    expect(mount.populate).not.toHaveBeenCalled();
    digest.mockRestore();
  });

  it('repopulates when a new build changes the payload', async () => {
    const mount = createMount();
    await ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-1' });
    mount.populate.mockClear();

    const changed: BundledTypesPayload = [{ ...payload[0]!, content: 'export declare const a: 3;' }, payload[1]!];
    await expect(
      ensureBundledTypesMount(mount.fileService, changed, { populate: mount.populate, buildIdentity: 'build-2' }),
    ).resolves.toBe('populated');
    expect(mount.files.get('/node_modules/@taucad/replicad/index.d.ts')).toBe('export declare const a: 3;');
  });

  // The hash still earns its place on a miss: a rebuild whose declarations did
  // not change restamps instead of rewriting 11.9 MiB.
  it('restamps without rewriting declarations when a new build carries the same payload', async () => {
    const mount = createMount();
    await ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-1' });
    mount.populate.mockClear();
    mount.fileService.replaceBundledTypePackages.mockClear();

    await expect(
      ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-2' }),
    ).resolves.toBe('skipped');
    expect(mount.populate).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ packageName: 'tau-bundled-types' }),
    ]);

    // And the restamp makes the next boot a pure identity hit.
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest');
    await expect(
      ensureBundledTypesMount(mount.fileService, payload, { populate: mount.populate, buildIdentity: 'build-2' }),
    ).resolves.toBe('skipped');
    expect(digest).not.toHaveBeenCalled();
    digest.mockRestore();
  });

  it('distinguishes payloads that only differ in field boundaries', async () => {
    const first = createMount();
    await ensureBundledTypesMount(first.fileService, [{ packageName: 'ab', content: 'c' }], {
      populate: first.populate,
    });

    const second = createMount();
    await ensureBundledTypesMount(second.fileService, [{ packageName: 'a', content: 'bc' }], {
      populate: second.populate,
    });

    expect(second.files.get(bundledTypesSentinelPath)).not.toBe(first.files.get(bundledTypesSentinelPath));
  });
});
