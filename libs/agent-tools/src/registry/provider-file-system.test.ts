import { ResourceQueue } from '@taucad/filesystem';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { beforeEach, describe, expect, it } from 'vitest';

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
});
