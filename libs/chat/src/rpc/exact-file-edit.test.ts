import { describe, expect, it, vi } from 'vitest';
import type { ClientTextMutationFileSystem } from '#rpc/client-text-mutation.js';
import { applyClientTextMutation } from '#rpc/client-text-mutation.js';
import { createExactReplacementPlan } from '#rpc/exact-file-edit.js';
import { editFileInputSchema } from '#schemas/tools/edit-file.tool.schema.js';

const bytes = (content: string): Uint8Array<ArrayBuffer> => new Uint8Array(new TextEncoder().encode(content));
const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
const withBom = (content: string): Uint8Array<ArrayBuffer> => new Uint8Array([...bom, ...bytes(content)]);

const fileSystemFor = (
  initial: Uint8Array<ArrayBuffer>,
  options: {
    conflictOnce?: Uint8Array<ArrayBuffer>;
    conflictTwice?: Uint8Array<ArrayBuffer>;
  } = {},
) => {
  let current = new Uint8Array(initial);
  let writes = 0;
  const writeFileIfUnchanged = vi.fn<ClientTextMutationFileSystem['writeFileIfUnchanged']>(
    async (_path, expected, replacement) => {
      writes += 1;
      if (writes === 1 && options.conflictOnce) {
        current = new Uint8Array(options.conflictOnce);
        return { status: 'conflict', currentBytes: new Uint8Array(current) };
      }
      if (writes === 2 && options.conflictTwice) {
        current = new Uint8Array(options.conflictTwice);
        return { status: 'conflict', currentBytes: new Uint8Array(current) };
      }
      expect(current).toEqual(expected);
      current = new Uint8Array(replacement);
      return { status: 'committed', committedBytes: new Uint8Array(current) };
    },
  );
  const fileSystem = {
    stat: vi.fn<ClientTextMutationFileSystem['stat']>(async () => ({
      size: current.byteLength,
      isDirectory: false,
      createdAt: '',
      modifiedAt: '',
      contentKind: 'text',
      lineCount: 1,
    })),
    readFileBytes: vi.fn(async () => new Uint8Array(current)),
    writeFileIfUnchanged,
  } satisfies ClientTextMutationFileSystem;
  return {
    fileSystem,
    read: () => new Uint8Array(current),
    writeFileIfUnchanged,
  };
};

const apply = async (
  state: ReturnType<typeof fileSystemFor>,
  input: { oldString: string; newString: string; replaceAll?: boolean },
) =>
  applyClientTextMutation({
    targetFile: 'main.scad',
    fileSystem: state.fileSystem,
    plan: createExactReplacementPlan(input),
  });

describe('deterministic exact file edit', () => {
  it('applies one exact match literally', async () => {
    const state = fileSystemFor(bytes('price = "$&";\n'));

    await expect(apply(state, { oldString: '"$&"', newString: '"$`"' })).resolves.toMatchObject({
      ok: true,
      occurrences: 1,
    });
    expect(new TextDecoder().decode(state.read())).toBe('price = "$`";\n');
  });

  it('rejects an ambiguous first matching tier without writing', async () => {
    const state = fileSystemFor(bytes('cube();\ncube();\n'));

    await expect(apply(state, { oldString: 'cube();', newString: 'sphere();' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'AMBIGUOUS_MATCH',
    });
    expect(state.writeFileIfUnchanged).not.toHaveBeenCalled();
    expect(new TextDecoder().decode(state.read())).toBe('cube();\ncube();\n');
  });

  it('maps a folded match back to the original span and preserves BOM and CRLF', async () => {
    const state = fileSystemFor(withBom('const label = “left — right”; \t\r\nnext();\r\n'));

    await expect(
      apply(state, {
        oldString: 'const label = "left - right";\nnext();',
        newString: 'const label = "done";\nnext();',
      }),
    ).resolves.toMatchObject({ ok: true, occurrences: 1 });
    expect(state.read().slice(0, 3)).toEqual(bom);
    expect(new TextDecoder().decode(state.read().slice(3))).toBe('const label = "done";\r\nnext();\r\n');
  });

  it('rejects split surrogate edit text before matching or encoding', async () => {
    const splitEmoji = fileSystemFor(bytes('label = "😀";\n'));
    await expect(apply(splitEmoji, { oldString: '\uD83D', newString: 'X' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_ERROR',
    });
    expect(splitEmoji.writeFileIfUnchanged).not.toHaveBeenCalled();

    const invalidReplacement = fileSystemFor(bytes('label = "old";\n'));
    await expect(apply(invalidReplacement, { oldString: 'old', newString: '\uDE00' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'VALIDATION_ERROR',
    });
    expect(invalidReplacement.writeFileIfUnchanged).not.toHaveBeenCalled();

    expect(
      editFileInputSchema.safeParse({ targetFile: 'main.ts', oldString: '\uD83D', newString: 'valid' }).success,
    ).toBe(false);
    expect(
      editFileInputSchema.safeParse({ targetFile: 'main.ts', oldString: 'valid', newString: '\uDE00' }).success,
    ).toBe(false);
  });

  it('preserves consecutive and embedded U+FEFF bytes', async () => {
    const consecutiveBytes = withBom('\uFEFFcube();\n');
    const consecutive = fileSystemFor(consecutiveBytes);

    await expect(apply(consecutive, { oldString: 'cube();', newString: 'cube();' })).resolves.toMatchObject({
      ok: true,
      occurrences: 1,
    });
    expect(consecutive.read()).toEqual(consecutiveBytes);

    const embedded = fileSystemFor(withBom('before\uFEFFcube();\uFEFFafter\n'));
    await expect(apply(embedded, { oldString: 'cube();', newString: 'sphere();' })).resolves.toMatchObject({
      ok: true,
      occurrences: 1,
    });
    expect(embedded.read()).toEqual(withBom('before\uFEFFsphere();\uFEFFafter\n'));
  });

  it('normalizes replacement newlines from each matched span in a mixed-EOL file', async () => {
    const state = fileSystemFor(bytes('a = 1;\r\nb = 1;\nc = 1;\r\n'));

    await expect(
      apply(state, { oldString: ' = 1;', newString: ' = 2;\nnext();', replaceAll: true }),
    ).resolves.toMatchObject({ ok: true, occurrences: 3 });
    expect(new TextDecoder().decode(state.read())).toBe('a = 2;\r\nnext();\r\nb = 2;\nnext();\nc = 2;\r\nnext();\r\n');
  });

  it('treats bare CR as a line ending and never trims U+FEFF as whitespace', async () => {
    const bareCr = fileSystemFor(bytes('first\rconst label = “old”; \t\rnext\r'));
    await expect(
      apply(bareCr, {
        oldString: 'const label = "old";\nnext',
        newString: 'const label = "new";\nnext',
      }),
    ).resolves.toMatchObject({ ok: true, occurrences: 1 });
    expect(new TextDecoder().decode(bareCr.read())).toBe('first\rconst label = "new";\rnext\r');

    const byteOrderMarkSentinel = fileSystemFor(bytes('const label = “old”;\uFEFF\nafter\n'));
    await expect(
      apply(byteOrderMarkSentinel, { oldString: 'const label = "old";', newString: 'const label = "new";' }),
    ).resolves.toMatchObject({ ok: true, occurrences: 1 });
    expect(new TextDecoder().decode(byteOrderMarkSentinel.read())).toBe('const label = "new";\uFEFF\nafter\n');
  });

  it('applies replaceAll spans right-to-left', async () => {
    const state = fileSystemFor(bytes('aaaa'));

    await expect(apply(state, { oldString: 'aa', newString: 'b', replaceAll: true })).resolves.toMatchObject({
      ok: true,
      occurrences: 2,
    });
    expect(new TextDecoder().decode(state.read())).toBe('bb');
  });

  it('returns CONTEXT_NOT_FOUND without writing when neither tier matches', async () => {
    const state = fileSystemFor(bytes('cube();\n'));

    await expect(apply(state, { oldString: 'sphere();', newString: 'cube();' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'CONTEXT_NOT_FOUND',
    });
    expect(state.writeFileIfUnchanged).not.toHaveBeenCalled();
  });

  it('replans once on stale bytes and returns EDIT_CONFLICT on a second conflict', async () => {
    const recovered = fileSystemFor(bytes('cube();\n'), {
      conflictOnce: bytes('// external\ncube();\n'),
    });
    await expect(apply(recovered, { oldString: 'cube();', newString: 'sphere();' })).resolves.toMatchObject({
      ok: true,
      staleRecovered: true,
    });
    expect(new TextDecoder().decode(recovered.read())).toBe('// external\nsphere();\n');

    const conflicted = fileSystemFor(bytes('cube();\n'), {
      conflictOnce: bytes('// first\ncube();\n'),
      conflictTwice: bytes('// second\ncube();\n'),
    });
    await expect(apply(conflicted, { oldString: 'cube();', newString: 'sphere();' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'EDIT_CONFLICT',
    });
  });

  it('rejects unsupported and invalid encodings with typed errors', async () => {
    const utf16 = fileSystemFor(new Uint8Array([0xff, 0xfe, 0x61, 0x00]));
    await expect(apply(utf16, { oldString: 'a', newString: 'b' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'UNSUPPORTED_TEXT_ENCODING',
    });

    const invalidUtf8 = fileSystemFor(new Uint8Array([0xc3, 0x28]));
    await expect(apply(invalidUtf8, { oldString: 'a', newString: 'b' })).resolves.toMatchObject({
      ok: false,
      errorCode: 'INVALID_TEXT_ENCODING',
    });
  });
});
