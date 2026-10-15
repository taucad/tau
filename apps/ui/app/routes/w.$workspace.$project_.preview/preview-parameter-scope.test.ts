import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileStat } from '@taucad/types';
import { readPreviewParameterRecords } from '#routes/w.$workspace.$project_.preview/preview-parameter-scope.js';

describe('temporary Preview parameter seed', () => {
  it('reads only parameter sidecars, including nested model paths', async () => {
    const source = mock<Parameters<typeof readPreviewParameterRecords>[0]>();
    const bytes = new TextEncoder().encode('{"activeGroup":"default","groups":{"default":{"values":{"angle":12}}}}');
    source.exists.mockResolvedValue(true);
    source.readdir.mockImplementation(async (path) => (path === '.tau/parameters' ? ['nested'] : ['main.ts.json']));
    source.stat.mockImplementation(async (path) => mock<FileStat>({ type: path.endsWith('nested') ? 'dir' : 'file' }));
    source.readFile.mockResolvedValue(bytes);
    expect(await readPreviewParameterRecords(source)).toEqual({
      '.tau/parameters/nested/main.ts.json': { content: bytes },
    });
    expect(source.readFile).toHaveBeenCalledExactlyOnceWith('.tau/parameters/nested/main.ts.json');
    expect(source.exists).toHaveBeenCalledExactlyOnceWith('.tau/parameters');
  });
  it('starts empty when no saved parameter records exist', async () => {
    const source = mock<Parameters<typeof readPreviewParameterRecords>[0]>();
    source.exists.mockResolvedValue(false);
    expect(await readPreviewParameterRecords(source)).toEqual({});
    expect(source.readdir).not.toHaveBeenCalled();
  });
  it('surfaces unreadable saved records instead of replacing them with defaults', async () => {
    const source = mock<Parameters<typeof readPreviewParameterRecords>[0]>();
    source.exists.mockRejectedValue(new Error('Project disconnected'));
    await expect(readPreviewParameterRecords(source)).rejects.toThrow('Project disconnected');
  });
});
