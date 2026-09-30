import { ResourceQueue } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';

const decoder = new TextDecoder();

let provider: MemoryProvider;

const fileSystemFor = (signal?: AbortSignal) =>
  createProviderRpcFileSystem({
    provider: composeView({ filesystem: provider }, { consumer: 'agent', policy: tauPathPolicy }),
    mutations: new ResourceQueue(),
    ...(signal ? { signal } : {}),
  });

type CheckedWrite = NonNullable<ComposedView['writeFileChecked']>;

/**
 * A checkout whose next agent write is preceded by someone else's edit, and
 * which answers `writeFileChecked` the way an authority does: the byte
 * compare and the write are one step, so an edit that lands first is seen.
 */
class RacedProvider extends MemoryProvider {
  public beforeNextWrite: (() => Promise<void>) | undefined;

  public override async writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> {
    await this._race();
    return super.writeFile(path, data);
  }

  public async writeFileChecked(input: Parameters<CheckedWrite>[0]): ReturnType<CheckedWrite> {
    await this._race();
    const conflicts = [];
    for (const { path, expected } of input.preconditions) {
      // oxlint-disable-next-line no-await-in-loop -- A test double over one in-memory file.
      const actual = (await this.exists(path)) ? await this.readFile(path) : null;
      const wanted = typeof expected === 'string' ? new TextEncoder().encode(expected) : expected;
      if (actual === null || wanted === null ? actual !== wanted : decoder.decode(actual) !== decoder.decode(wanted)) {
        conflicts.push({ path, actual });
      }
    }
    if (conflicts.length > 0) {
      return { status: 'conflict', conflicts };
    }
    await super.writeFile(input.path, input.data);
    return { status: 'applied', content: await this.readFile(input.path) };
  }

  private async _race(): Promise<void> {
    const edit = this.beforeNextWrite;
    this.beforeNextWrite = undefined;
    await edit?.();
  }
}

beforeEach(async () => {
  provider = new MemoryProvider();
  await provider.writeFile('main.ts', 'export const main = 1;\n');
});

describe('createProviderRpcFileSystem', () => {
  it('should expose an exact owned byte reader through the existing rooted view', async () => {
    const original = Uint8Array.from([0, 255, 239, 187, 191]);
    await provider.writeFile('part.glb', original);
    const read = await fileSystemFor().readBinaryFile('part.glb');
    expect(read).toEqual(original);
    read[1] = 0;
    expect(await provider.readFile('part.glb')).toEqual(original);
    await expect(fileSystemFor().readBinaryFile('../foreign.glb')).rejects.toThrow();
  });

  it('should refuse oversized byte reads before asking the provider for content', async () => {
    await provider.writeFile('part.glb', Uint8Array.from([0, 255]));
    const metadata = await provider.stat('part.glb');
    vi.spyOn(provider, 'stat').mockResolvedValue({ ...metadata, size: 256 * 1024 * 1024 + 1 });
    const read = vi.spyOn(provider, 'readFile');
    await expect(fileSystemFor().readBinaryFile('part.glb')).rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' });
    expect(read).not.toHaveBeenCalled();
  });
  it('reads and writes text through the provider', async () => {
    const fileSystem = fileSystemFor();

    expect(await fileSystem.readFile('main.ts')).toBe('export const main = 1;\n');
    await fileSystem.writeFile('notes.md', '# notes\n');
    expect(await fileSystem.readFile('notes.md')).toBe('# notes\n');
    expect(await fileSystem.exists('notes.md')).toBe(true);
    expect(await fileSystem.exists('absent.md')).toBe(false);
  });

  it('appends to a missing file as if it were empty', async () => {
    const fileSystem = fileSystemFor();

    await fileSystem.appendFile('log.txt', 'first\n');
    await fileSystem.appendFile('log.txt', 'second\n');
    expect(await fileSystem.readFile('log.txt')).toBe('first\nsecond\n');
  });

  /* Rule 16 / VI11: the fence is the composed view both launchers build — the
   * Node host over a `NodeFsProvider`, the browser worker over its relayed
   * provider — and an unfenced provider cannot construct this filesystem at all
   * (it does not answer `provenance`). These cases prove the refusals survive
   * the RPC adapter. */
  it('refuses every write under Tau\u2019s own control metadata and still serves the read', async () => {
    await provider.mkdir('.tau/chats/chat-1', { recursive: true });
    await provider.writeFile('.tau/chats/chat-1/events.jsonl', '{"type":"run.lifecycle"}\n');
    const fileSystem = fileSystemFor();

    await expect(fileSystem.writeFile('.tau/chats/chat-1/events.jsonl', 'forged\n')).rejects.toMatchObject({
      code: 'EROFS',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* The append-only transcript is the most attractive target for the one
     * mutation a fence forgets, so it is guarded too (3-review S5). */
    await expect(fileSystem.appendFile('.tau/chats/chat-1/events.jsonl', 'forged\n')).rejects.toMatchObject({
      code: 'EROFS',
    });
    /* A turn's lease is a *record*: the agent may read the account of its own
     * run and may never write it (the retired `.tau/workspaces` claim file was
     * hidden; `.tau/runs` is read-only, W3d). */
    await expect(fileSystem.writeFile('.tau/runs/trun-1.json', '{}')).rejects.toMatchObject({
      code: 'EROFS',
    });
    /* The browser port's object store is revision evidence (RC6 S5 gate 15):
     * an agent that could write it could forge the account of its own turn. */
    await expect(fileSystem.writeFile('.git/objects/ab/cdef', 'forged')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* The engine stores are the same evidence on a disk host (8-review S3). */
    await expect(fileSystem.writeFile('.jj/repo/store/forged', 'forged')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    await expect(fileSystem.writeFile('.git/refs/heads/main', 'forged')).rejects.toMatchObject({
      code: 'EPERM',
      reason: 'WORKSPACE_MASKED_PATH',
    });
    /* Reads stay open: an agent may read back the account of its own turn. */
    expect(await fileSystem.readFile('.tau/chats/chat-1/events.jsonl')).toBe('{"type":"run.lifecycle"}\n');
    expect(await provider.readFile('.tau/chats/chat-1/events.jsonl', 'utf8')).toBe('{"type":"run.lifecycle"}\n');
  });

  it('writes binary bytes verbatim', async () => {
    const fileSystem = fileSystemFor();

    await fileSystem.writeBinaryFile('blob.bin', new Uint8Array([1, 2, 3]));
    expect([...(await provider.readFile('blob.bin'))]).toStrictEqual([1, 2, 3]);
  });

  it('reports text stat metadata the RPC layer needs', async () => {
    const stat = await fileSystemFor().stat('main.ts');

    /* The provider counts the trailing newline's empty line, so a one-statement
     * file is two lines; the RPC layer passes that count through unchanged. */
    expect(stat).toMatchObject({ isDirectory: false, contentKind: 'text', lineCount: 2 });
    expect(new Date(stat.modifiedAt).getTime()).toBeGreaterThan(0);
  });

  it('reports malformed UTF-8 distinctly from an I/O failure', async () => {
    await provider.writeFile('views/bad.json', new Uint8Array([0xc3, 0x28]));
    await expect(fileSystemFor().readFile('views/bad.json')).rejects.toMatchObject({ code: 'INVALID_TEXT_ENCODING' });
    await expect(fileSystemFor().readFile('views/missing.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves a UTF-8 BOM in text reads so checked expected bytes remain exact', async () => {
    const content = '\uFEFF{"version":1}';
    await provider.writeFile('views/bom.json', new TextEncoder().encode(content));
    await expect(fileSystemFor().readFile('views/bom.json')).resolves.toBe(content);
  });

  it('lists a directory as typed entries with basenames only', async () => {
    await provider.writeFile('src/a.ts', 'a\n');
    await provider.mkdir('src/nested', { recursive: true });

    const entries = await fileSystemFor().readdir('src');
    expect(entries.map((entry) => entry.name).toSorted()).toStrictEqual(['a.ts', 'nested']);
    expect(entries.find((entry) => entry.name === 'nested')).toMatchObject({ type: 'dir' });
    expect(entries.find((entry) => entry.name === 'a.ts')).toMatchObject({ type: 'file', contentKind: 'text' });
  });

  it('edits a file by exact replacement and reports the occurrence count', async () => {
    const fileSystem = fileSystemFor();

    const result = await fileSystem.editFile('main.ts', 'main = 1', 'main = 2');
    expect(result.occurrences).toBe(1);
    expect(await fileSystem.readFile('main.ts')).toBe('export const main = 2;\n');
  });

  it('refuses an edit whose old string is not present', async () => {
    await expect(fileSystemFor().editFile('main.ts', 'nope', 'yes')).rejects.toThrow();
  });

  it('deletes a file, and surfaces ENOTEMPTY rather than deleting a subtree', async () => {
    const fileSystem = fileSystemFor();
    await provider.writeFile('doomed/child.ts', 'x\n');

    await fileSystem.deleteFile('main.ts');
    expect(await provider.exists('main.ts')).toBe(false);

    await expect(fileSystem.deleteFile('doomed')).rejects.toThrow();
    expect(await provider.exists('doomed/child.ts')).toBe(true);
  });

  it('checks bytes for write and delete, returning applied, unchanged and conflict', async () => {
    const fileSystem = fileSystemFor();
    const before = await provider.readFile('main.ts');
    expect(
      await fileSystem.writeFileChecked({
        path: 'main.ts',
        data: before,
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).toMatchObject({ status: 'unchanged' });
    expect(
      await fileSystem.writeFileChecked({
        path: 'main.ts',
        data: 'next',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(
      await fileSystem.deleteFileChecked({
        path: 'main.ts',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).toMatchObject({ status: 'conflict' });
    expect(
      await fileSystem.deleteFileChecked({
        path: 'main.ts',
        preconditions: [{ path: 'main.ts', expected: 'next' }],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(
      await fileSystem.deleteFileChecked({
        path: 'main.ts',
        preconditions: [{ path: 'main.ts', expected: null }],
      }),
    ).toMatchObject({ status: 'unchanged' });
  });

  it('does not fall back after a genuine provider error', async () => {
    Object.assign(provider, {
      writeFileChecked: async () => {
        throw Object.assign(new Error('disk failed'), { code: 'EIO' });
      },
    });
    const before = await provider.readFile('main.ts');
    await expect(
      fileSystemFor().writeFileChecked({
        path: 'main.ts',
        data: 'wrong',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).rejects.toMatchObject({ code: 'EIO' });
    expect(await provider.readFile('main.ts')).toEqual(before);
  });

  it('falls back only when both checked provider methods explicitly refuse support', async () => {
    const unsupported = () => {
      throw Object.assign(new Error('no authority'), { code: 'CHECKED_WRITE_UNSUPPORTED' });
    };
    const writeFileChecked = vi.fn(unsupported);
    const deleteFileChecked = vi.fn(() => {
      throw Object.assign(new Error('no authority'), {
        code: 'CHECKED_WRITE_UNSUPPORTED',
        applicationState: 'known-not-applied',
      });
    });
    Object.assign(provider, { writeFileChecked, deleteFileChecked });
    const fileSystem = fileSystemFor();
    const before = await provider.readFile('main.ts');
    expect(
      await fileSystem.writeFileChecked({
        path: 'main.ts',
        data: 'next',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).toMatchObject({ status: 'applied' });
    expect(
      await fileSystem.deleteFileChecked({ path: 'main.ts', preconditions: [{ path: 'main.ts', expected: 'next' }] }),
    ).toMatchObject({ status: 'applied' });
    expect(writeFileChecked).toHaveBeenCalledOnce();
    expect(deleteFileChecked).toHaveBeenCalledOnce();
    expect(await provider.exists('main.ts')).toBe(false);
  });

  it('keeps a genuine checked-delete error and preserves the original bytes', async () => {
    Object.assign(provider, {
      deleteFileChecked: async () => {
        throw Object.assign(new Error('disk failed'), { code: 'EIO' });
      },
    });
    const before = await provider.readFile('main.ts');
    await expect(
      fileSystemFor().deleteFileChecked({ path: 'main.ts', preconditions: [{ path: 'main.ts', expected: before }] }),
    ).rejects.toMatchObject({ code: 'EIO' });
    expect(await provider.readFile('main.ts')).toEqual(before);
  });

  it('does not retry an unsupported checked mutation whose application may already have occurred', async () => {
    const uncertain = Object.assign(new Error('native outcome unknown'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'potentially-applied',
    });
    const writeFile = vi.spyOn(provider, 'writeFile');
    const unlink = vi.spyOn(provider, 'unlink');
    Object.assign(provider, {
      writeFileChecked: async () => {
        throw uncertain;
      },
      deleteFileChecked: async () => {
        throw uncertain;
      },
    });
    const before = await provider.readFile('main.ts');
    const fileSystem = fileSystemFor();

    await expect(
      fileSystem.writeFileChecked({
        path: 'main.ts',
        data: 'next',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).rejects.toBe(uncertain);
    await expect(
      fileSystem.deleteFileChecked({
        path: 'main.ts',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).rejects.toBe(uncertain);
    expect(writeFile).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
    expect(await provider.readFile('main.ts')).toEqual(before);
  });

  it('rejects checked mutations at the mask and an aborted invocation before writing', async () => {
    const fileSystem = fileSystemFor();
    await expect(
      fileSystem.writeFileChecked({
        path: '.tau/chats/log.jsonl',
        data: 'x',
        preconditions: [{ path: '.tau/chats/log.jsonl', expected: null }],
      }),
    ).rejects.toMatchObject({ code: 'EROFS' });
    await expect(
      fileSystem.deleteFileChecked({ path: 'tau.json', preconditions: [{ path: 'tau.json', expected: null }] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    const before = await provider.readFile('main.ts');
    await expect(
      fileSystemFor(controller.signal).deleteFileChecked({
        path: 'main.ts',
        preconditions: [{ path: 'main.ts', expected: before }],
      }),
    ).rejects.toThrow('stopped');
    expect(await provider.readFile('main.ts')).toEqual(before);
  });

  it('refuses oversized checked requests before provider dispatch', async () => {
    const checked = vi.fn(async () => ({ status: 'applied', content: new Uint8Array() }) as const);
    Object.assign(provider, { writeFileChecked: checked, deleteFileChecked: checked });
    const fileSystem = fileSystemFor();
    const preconditions = Array.from({ length: 33 }, () => ({ path: 'main.ts', expected: 'same' }));
    await expect(fileSystem.writeFileChecked({ path: 'main.ts', data: 'x', preconditions })).rejects.toThrow('1-32');
    await expect(fileSystem.deleteFileChecked({ path: 'main.ts', preconditions })).rejects.toThrow('1-32');
    expect(checked).not.toHaveBeenCalled();
  });

  it('refuses a mutation once its invocation is aborted', async () => {
    const controller = new AbortController();
    const fileSystem = fileSystemFor(controller.signal);
    controller.abort(new Error('cancelled mid-run'));

    await expect(fileSystem.writeFile('late.md', 'x')).rejects.toThrow('cancelled mid-run');
    /* Reads are not gated: the abort only has to stop the tool from writing. */
    expect(decoder.decode(await provider.readFile('main.ts'))).toBe('export const main = 1;\n');
  });

  /* L4 D-103 / W0.18: the per-path queue fences the agent's own calls only. A
   * person's edit reaches the checkout by another route, so it can land after
   * the agent's last read and before its write; the write must then be
   * refused on the bytes it would replace, never applied over them. */
  it('answers an edit that lands between the agent\u2019s read and write as a conflict, never overwriting it', async () => {
    const raced = new RacedProvider();
    await raced.writeFile('main.ts', 'export const main = 1;\n');
    raced.beforeNextWrite = async () => raced.writeFile('main.ts', 'export const main = 3;\n');
    const fileSystem = createProviderRpcFileSystem({
      provider: composeView({ filesystem: raced }, { consumer: 'agent', policy: tauPathPolicy }),
      mutations: new ResourceQueue(),
    });

    await expect(fileSystem.editFile('main.ts', 'main = 1', 'main = 2')).rejects.toMatchObject({
      code: 'EDIT_CONFLICT',
    });
    expect(decoder.decode(await raced.readFile('main.ts'))).toBe('export const main = 3;\n');
  });

  it('falls back to the queued compare when the view\u2019s checked write is unsupported', async () => {
    class UncheckedProvider extends MemoryProvider {
      public async writeFileChecked(): ReturnType<CheckedWrite> {
        throw Object.assign(new Error('no authority'), {
          code: 'CHECKED_WRITE_UNSUPPORTED',
          applicationState: 'known-not-applied',
        });
      }
    }
    const unchecked = new UncheckedProvider();
    await unchecked.writeFile('main.ts', 'export const main = 1;\n');
    const fileSystem = createProviderRpcFileSystem({
      provider: composeView({ filesystem: unchecked }, { consumer: 'agent', policy: tauPathPolicy }),
      mutations: new ResourceQueue(),
    });

    await fileSystem.editFile('main.ts', 'main = 1', 'main = 2');
    expect(decoder.decode(await unchecked.readFile('main.ts'))).toBe('export const main = 2;\n');
  });

  /* The incident this guards: asked for a second model, an agent added
   * `assets.<name>` to the manifest and the project became unreachable. The
   * model now reads the defect as a tool error and can correct itself. */
  describe('tau.json', () => {
    const manifest = projectToManifest({
      id: 'proj_0123456789ABCDEFGHIJK',
      name: 'Relief',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    });
    const text = (value: unknown): string => `${JSON.stringify(value, undefined, 2)}\n`;

    beforeEach(async () => {
      await provider.writeFile('tau.json', serializeProjectManifest(manifest));
    });

    it('accepts a valid edit that keeps the project identity', async () => {
      const fileSystem = fileSystemFor();

      await fileSystem.writeFile('tau.json', text({ ...manifest, name: 'Renamed' }));
      await fileSystem.editFile('tau.json', '"Renamed"', '"Renamed again"');

      expect(JSON.parse(await fileSystem.readFile('tau.json'))).toMatchObject({ name: 'Renamed again' });
    });

    it('refuses writes and edits that would break the manifest, naming the defect', async () => {
      const fileSystem = fileSystemFor();
      const before = decoder.decode(await provider.readFile('tau.json'));
      const secondAsset = text({ ...manifest, assets: { ...manifest.assets, second: { entryPath: 'second.cs' } } });

      await expect(fileSystem.writeFile('tau.json', secondAsset)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest types asymmetric matchers as `any`. */
        message: expect.stringContaining('assets: Unrecognized key: "second"'),
      });
      await expect(fileSystem.editFile('tau.json', '"main.ts"\n', '"main.ts", "extra": 1\n')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(
        fileSystem.writeFile('tau.json', text({ ...manifest, id: 'proj_zzzzzzzzzzzzzzzzzzzzz' })),
      ).rejects.toThrow(`tau.json must keep the project id ${manifest.id}.`);
      await expect(fileSystem.deleteFile('tau.json')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      expect(decoder.decode(await provider.readFile('tau.json'))).toBe(before);
    });
  });
});
