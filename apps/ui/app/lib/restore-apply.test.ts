import { describe, it, expect, vi } from 'vitest';
import { applyRestorePlan } from '#lib/restore-apply.js';
import type { RestoreFileManager } from '#lib/restore-apply.js';
import type { RestorePlan } from '#lib/file-restore-timeline.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

const makePlan = (over: Partial<RestorePlan> = {}): RestorePlan => ({
  write: over.write ?? new Map<string, string>(),
  remove: over.remove ?? new Set<string>(),
  unrecoverable: over.unrecoverable ?? new Set<string>(),
});

const makeClient = (existsMap: Record<string, boolean> = {}) => {
  const writeFiles = vi.fn<RestoreFileManager['writeFiles']>().mockResolvedValue();
  const deleteFile = vi.fn<RestoreFileManager['deleteFile']>().mockResolvedValue();
  const exists = vi.fn<RestoreFileManager['exists']>().mockImplementation(async (p) => existsMap[p] ?? true);
  const client: RestoreFileManager = { writeFiles, deleteFile, exists };
  return { client, writeFiles, deleteFile, exists };
};

describe('applyRestorePlan', () => {
  it('T-APPLY-WRITE: writes the whole plan in a single batch, text-encoded', async () => {
    const { client, writeFiles } = makeClient();
    await applyRestorePlan(
      makePlan({
        write: new Map([
          ['a.ts', 'A'],
          ['b.ts', 'B'],
        ]),
      }),
      client,
    );

    expect(writeFiles).toHaveBeenCalledTimes(1);
    const files = writeFiles.mock.calls[0]![0];
    expect(Object.keys(files).sort()).toEqual(['a.ts', 'b.ts']);
    expect(decodeTextFile(files['a.ts']!.content)).toBe('A');
    expect(decodeTextFile(files['b.ts']!.content)).toBe('B');
  });

  it('T-APPLY-WRITE: issues no write call for an empty write set', async () => {
    const { client, writeFiles } = makeClient();
    await applyRestorePlan(makePlan(), client);
    expect(writeFiles).not.toHaveBeenCalled();
  });

  it('T-APPLY-PARENTDIR: writes a path under a not-yet-existing directory without any createDirectory step', async () => {
    const { client, writeFiles } = makeClient();
    await applyRestorePlan(makePlan({ write: new Map([['deep/nested/a.ts', 'X']]) }), client);
    // RestoreFileManager exposes no mkdir/createDirectory — the backend auto-creates parents.
    expect(Object.keys(writeFiles.mock.calls[0]![0])).toContain('deep/nested/a.ts');
  });

  it('T-APPLY-DELETE: deletes only existing paths, with source machine', async () => {
    const { client, deleteFile } = makeClient({
      'gone.ts': true,
      'missing.ts': false,
    });
    await applyRestorePlan(makePlan({ remove: new Set(['gone.ts', 'missing.ts']) }), client);

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('gone.ts', { source: 'machine' });
  });

  it('T-APPLY-DELETE: is idempotent — re-applying after the file is gone deletes nothing', async () => {
    const { client, deleteFile } = makeClient({ 'gone.ts': false });
    await applyRestorePlan(makePlan({ remove: new Set(['gone.ts']) }), client);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('T-APPLY-SCOPE / T-APPLY-ERROR: a rejecting write propagates and aborts the apply', async () => {
    const { client, writeFiles, deleteFile } = makeClient();
    writeFiles.mockRejectedValue(new Error('WorkspaceScopeViolationError'));

    await expect(
      applyRestorePlan(
        makePlan({
          write: new Map([['x.ts', '1']]),
          remove: new Set(['y.ts']),
        }),
        client,
      ),
    ).rejects.toThrow('WorkspaceScopeViolationError');
    expect(deleteFile).not.toHaveBeenCalled(); // Aborted before deletes
  });

  it('T-APPLY-UNRECOVERABLE / T-APPLY-UNTOUCHED: never writes or deletes unrecoverable or plan-absent paths', async () => {
    const { client, writeFiles, deleteFile } = makeClient();
    await applyRestorePlan(
      makePlan({
        write: new Map([['a.ts', '1']]),
        unrecoverable: new Set(['u.ts']),
      }),
      client,
    );

    expect(Object.keys(writeFiles.mock.calls[0]![0])).toEqual(['a.ts']); // Only plan.write
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
