/**
 * File reading utilities for processing files, folders, and directory entries
 * from the browser File API and FileSystem API.
 */

import { classify } from '@taucad/filesystem/path-registry';
import { joinRelativePath } from '@taucad/utils/path';

export type FileData = {
  filename: string;
  content: Uint8Array<ArrayBuffer>;
};

export type FileMap = Map<string, FileData>;

/**
 * Whether an import leaves this path behind.
 *
 * An import carries a working tree. It does not carry the bytes a host
 * regenerates (`cache`), and it does not carry the repository that came with the
 * tree (`control-plane`): under D29/ND23 the new project's own repository lives
 * at `.git` inside the very same filesystem as its working tree, so those bytes
 * would not sit beside the store — they would be written over it, before it is
 * initialized.
 *
 * The one place that question is asked. The disk machine asks it at the top of
 * its funnel, so the repository never reaches the main-file picker; this module
 * asks it again at the project-create boundary, which is where the archive route
 * arrives with no machine in front of it.
 *
 * The control plane matches at any depth, so a vendored `vendor/dep/.git` is
 * dropped with the project's own: git never tracks one, and neither do we.
 *
 * @param path - Project-relative path from the imported tree.
 * @returns Whether the import drops it.
 * @public
 */
export const isExcludedImportPath = (path: string): boolean => {
  const { class: storageClass } = classify(path);
  return storageClass === 'cache' || storageClass === 'control-plane';
};

/**
 * Convert imported files into the project-create payload, omitting what the
 * path registry says an import does not carry.
 */
export function createImportedProjectFiles(
  files: FileMap,
  mainFile: string,
): Record<string, { content: Uint8Array<ArrayBuffer> }> {
  if (isExcludedImportPath(mainFile)) {
    throw new Error(
      "That file belongs to a repository or a cache, so it can't be the main file. Choose a design file.",
    );
  }

  const projectFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
  for (const [path, file] of files) {
    if (!isExcludedImportPath(path)) {
      projectFiles[path] = { content: file.content };
    }
  }

  if (!Object.hasOwn(projectFiles, mainFile)) {
    throw new Error(`The selected main file "${mainFile}" is not present in the imported files.`);
  }

  return projectFiles;
}

/**
 * A file an import will read, by reference, with its path in the source.
 */
export type ImportFileReference = Readonly<{ file: File; path: string }>;

const fileOfEntry = async (entry: FileSystemFileEntry): Promise<File> =>
  new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });

const childrenOf = async (directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  /* `readEntries` answers in batches until one is empty. */
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- batches are read one after another.
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      return children;
    }
    children.push(...batch);
  }
};

/**
 * The files a drop carries, with their paths, without reading a byte of them
 * (charter D12: the import worker reads them, on the compute worker).
 *
 * The entries are taken from the drop synchronously, before the first await,
 * because a `DataTransferItemList` is only readable during its event; the
 * folders are walked afterwards.
 *
 * @param items - The drop's items.
 * @returns Each file and its path.
 */
export async function listDataTransfer(items: DataTransferItemList): Promise<ImportFileReference[]> {
  const roots: FileSystemEntry[] = [];
  for (const item of items) {
    const entry = item.kind === 'file' ? item.webkitGetAsEntry() : null;
    if (entry) {
      roots.push(entry);
    }
  }
  const files: ImportFileReference[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    const path = prefix ? joinRelativePath(prefix, entry.name) : entry.name;
    if (entry.isFile) {
      files.push({ file: await fileOfEntry(entry as FileSystemFileEntry), path });
      return;
    }
    if (entry.isDirectory) {
      for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) {
        // oxlint-disable-next-line no-await-in-loop -- a folder is walked one child after another.
        await walk(child, path);
      }
    }
  };
  for (const root of roots) {
    // oxlint-disable-next-line no-await-in-loop -- each dropped root is walked in turn.
    await walk(root, '');
  }
  return files;
}

/**
 * The files of an `<input>` pick, with their paths: a folder pick's
 * `webkitRelativePath`, else the file's name.
 *
 * @param fileList - The picked files.
 * @returns Each file and its path.
 */
export const listFileList = (fileList: FileList | readonly File[]): ImportFileReference[] =>
  [...fileList].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

/**
 * Check if a file is a ZIP archive based on extension or MIME type.
 */
export function isZipFile(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase();

  return extension === 'zip' || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}
