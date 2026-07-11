import type { FileWriteSource } from '@taucad/fs-client/file-write-source';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import type { RestorePlan } from '#lib/file-restore-timeline.js';

/**
 * The slice of the `FileManagerClient` that `applyRestorePlan` needs. Kept
 * minimal so the apply path is testable against a fake client.
 */
export type RestoreFileManager = {
  writeFiles: (files: Record<string, { content: Uint8Array<ArrayBuffer> }>) => Promise<void>;
  deleteFile: (path: string, options: { source: FileWriteSource }) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
};

/**
 * Reconcile the filesystem to a `RestorePlan` (R6). Writes go through the
 * **batch** `writeFiles` (one worker round-trip, one `batchWritten` event, a
 * consistent editor view, auto-created parent dirs) and are inherently
 * `source: 'machine'`. Deletes have no batch primitive, so they loop, guarded
 * by `exists` to stay idempotent (re-applying the same plan after a partial
 * failure is safe — `materializeAt` is a pure function of the cutoff). Paths in
 * `plan.unrecoverable` are left untouched and surfaced to the user by the
 * caller; paths absent from the plan are never touched (R3).
 */
export async function applyRestorePlan(plan: RestorePlan, client: RestoreFileManager): Promise<void> {
  if (plan.write.size > 0) {
    const files: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
    for (const [path, content] of plan.write) {
      files[path] = { content: encodeTextFile(content) };
    }
    await client.writeFiles(files);
  }

  // Deletes are independent (each path is only ever in one set), so run them in
  // parallel; the `exists` guard keeps re-applying the same plan idempotent.
  await Promise.all(
    [...plan.remove].map(async (path) => {
      if (await client.exists(path)) {
        await client.deleteFile(path, { source: 'machine' });
      }
    }),
  );
}
