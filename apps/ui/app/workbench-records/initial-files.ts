import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { mintViewRecordId } from '#workbench-records/converters.js';

type CreationFile = { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' };

/** Seed only an absent workbench. Imported and duplicated record bytes stay authoritative. */
export function seedInitialWorkbenchFiles<T extends CreationFile>(
  files: Record<string, T>,
  mainEntryPath: string,
): Record<string, T | CreationFile> {
  if (files[workbenchPaths.layout]) { return files; }
  const viewId = mintViewRecordId();
  const view = workbenchRecords.view.schema.parse({ version: 1, entryPath: mainEntryPath });
  const layout = workbenchRecords.layout.schema.parse({
    version: 1,
    lanes: { chat: true, workbench: true },
    viewer: { kind: 'group', tabs: [{ kind: 'view', view: viewId }] },
    workbench: { kind: 'group', tabs: [] },
  });
  const encode = (value: string): CreationFile => ({ content: new TextEncoder().encode(value) });
  return {
    ...files,
    [workbenchPaths.view(viewId)]: encode(workbenchRecords.view.serialize(view)),
    [workbenchPaths.layout]: encode(workbenchRecords.layout.serialize(layout)),
  };
}
