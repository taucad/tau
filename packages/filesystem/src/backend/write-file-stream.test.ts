/**
 * `writeFileStream` (W6.3): a file written from a stream lands whole or not
 * at all, through each provider's own staging, and a stream that fails part
 * way leaves the path as it was and nothing staged behind (I1).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { NodeFsProvider } from '#backend/node/provider.js';
import { OPFSProvider, opfsStagingDirectory } from '#backend/opfs-provider.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';
import type { MockRootHandleOptions } from '#testing/mock-handle-factory.js';
import type { FileSystemProvider } from '#types.js';

const encoder = new TextEncoder();

/** A stream of these chunks, erroring after `failAfter` of them when given. */
const streamOf = (chunks: readonly string[], failAfter?: number): ReadableStream<Uint8Array<ArrayBuffer>> => {
  let at = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (failAfter !== undefined && at === failAfter) {
        controller.error(new Error('the source failed'));
        return;
      }
      const chunk = chunks[at];
      at += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunk));
    },
  });
};

/** The contract every provider keeps, whatever it stages through. */
const contract = (open: () => Promise<FileSystemProvider>): void => {
  it('should write every chunk, in order, creating missing parents', async () => {
    const provider = await open();
    await provider.writeFileStream!('nested/dir/model.stl', streamOf(['solid ', 'part', '\nendsolid']));
    await expect(provider.readFile('nested/dir/model.stl', 'utf8')).resolves.toBe('solid part\nendsolid');
  });

  it('should replace an existing file only once the stream ends', async () => {
    const provider = await open();
    await provider.writeFile('model.stl', 'old bytes');
    await provider.writeFileStream!('model.stl', streamOf(['new ', 'bytes']));
    await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('new bytes');
  });

  it('should leave an existing file as it was when the stream fails part way', async () => {
    const provider = await open();
    await provider.writeFile('model.stl', 'old bytes');
    await expect(provider.writeFileStream!('model.stl', streamOf(['new ', 'by', 'tes'], 2))).rejects.toThrow(
      'the source failed',
    );
    await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('old bytes');
  });

  it('should create nothing when the stream of a new file fails part way', async () => {
    const provider = await open();
    await expect(provider.writeFileStream!('fresh/model.stl', streamOf(['new ', 'bytes'], 1))).rejects.toThrow(
      'the source failed',
    );
    await expect(provider.exists('fresh/model.stl')).resolves.toBe(false);
  });

  it('should refuse a directory at the path', async () => {
    const provider = await open();
    await provider.mkdir('folder', { recursive: true });
    await expect(provider.writeFileStream!('folder', streamOf(['x']))).rejects.toMatchObject({ code: 'EISDIR' });
  });
};

describe('writeFileStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('MemoryProvider (gathers, then writes once)', () => {
    contract(async () => new MemoryProvider());
  });

  describe('FileSystemAccessProvider (the writable stream’s swap file)', () => {
    contract(
      async () =>
        new FileSystemAccessProvider(
          createMockRootHandle({ syncAccess: false }) as unknown as FileSystemDirectoryHandle,
        ),
    );
  });

  describe('OPFSProvider (staged through a sync handle, then moved)', () => {
    const mounted: Array<{ root: ReturnType<typeof createMockRootHandle>; moved: string[] }> = [];
    const mount = async (options?: MockRootHandleOptions): Promise<OPFSProvider> => {
      const moved: string[] = [];
      const root = createMockRootHandle({
        nativeMove: true,
        ...options,
        onMove: (from, to) => moved.push(`${from} to ${to}`),
      });
      vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn().mockResolvedValue(root) } });
      mounted.push({ root, moved });
      const provider = new OPFSProvider({ uncommitted: false });
      await provider.initialize();
      return provider;
    };
    const stagedLeft = async (root: ReturnType<typeof createMockRootHandle>): Promise<string[]> => {
      const names: string[] = [];
      const staging = await (root as unknown as FileSystemDirectoryHandle).getDirectoryHandle(opfsStagingDirectory, {
        create: true,
      });
      for await (const [owner, handle] of (
        staging as unknown as { entries(): AsyncIterable<[string, FileSystemDirectoryHandle]> }
      ).entries()) {
        for await (const [name] of (handle as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) {
          names.push(`${owner}/${name}`);
        }
      }
      return names;
    };

    contract(async () => mount());

    it('should publish with one native move from the staging directory', async () => {
      const provider = await mount();
      const { root, moved } = mounted.at(-1)!;
      await provider.writeFileStream('out/model.stl', streamOf(['a', 'b', 'c']));

      expect(moved).toHaveLength(1);
      expect(moved[0]).toMatch(/ to model\.stl$/u);
      await expect(stagedLeft(root)).resolves.toEqual([]);
    });

    it('should remove its staged file when the stream fails, and keep the target as it was', async () => {
      const provider = await mount();
      const { root, moved } = mounted.at(-1)!;
      await provider.writeFile('model.stl', 'old bytes');
      await expect(provider.writeFileStream('model.stl', streamOf(['new'], 1))).rejects.toThrow('the source failed');

      expect(moved).toEqual([]);
      await expect(stagedLeft(root)).resolves.toEqual([]);
      await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('old bytes');
    });

    it('should fall back to the writable stream where the engine has no native move', async () => {
      const provider = await mount({ nativeMove: false });
      await provider.writeFileStream('model.stl', streamOf(['swap ', 'file']));
      await expect(provider.readFile('model.stl', 'utf8')).resolves.toBe('swap file');
      expect(mounted.at(-1)?.moved).toEqual([]);
    });
  });

  describe('NodeFsProvider (temp sibling, synced and renamed)', () => {
    const roots: string[] = [];
    afterEach(() => {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    });
    const open = async (): Promise<NodeFsProvider> => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-node-stream-')));
      roots.push(root);
      return new NodeFsProvider(root);
    };

    contract(open);

    it('should leave no temp sibling behind when the stream fails part way', async () => {
      const provider = await open();
      const root = roots.at(-1)!;
      writeFileSync(join(root, 'model.stl'), 'old bytes');
      await expect(provider.writeFileStream('model.stl', streamOf(['new', 'er'], 1))).rejects.toThrow(
        'the source failed',
      );

      expect(readdirSync(root)).toEqual(['model.stl']);
      expect(readFileSync(join(root, 'model.stl'), 'utf8')).toBe('old bytes');
    });

    it('should write a stream larger than one read chunk and verify it whole', async () => {
      const provider = await open();
      const chunk = 'x'.repeat(256 * 1024);
      await provider.writeFileStream('large.bin', streamOf(Array.from({ length: 6 }, () => chunk)));
      expect(readFileSync(join(roots.at(-1)!, 'large.bin')).byteLength).toBe(6 * chunk.length);
    });
  });
});
