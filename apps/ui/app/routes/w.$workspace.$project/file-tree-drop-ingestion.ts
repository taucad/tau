import { getFileTreeParentDirectory, joinFileTreePath } from '#routes/w.$workspace.$project/file-tree-targets.js';

export type DroppedFile = {
  readonly kind: 'file';
  readonly file: File;
  readonly relativePath: string;
};

export type DroppedDirectory = {
  readonly kind: 'directory';
  readonly relativePath: string;
};

export type DropIngestionResult =
  | {
      readonly type: 'entries';
      readonly files: readonly DroppedFile[];
      readonly directories: readonly DroppedDirectory[];
      readonly warnings: readonly string[];
    }
  | { readonly type: 'empty'; readonly reason: 'no-items' | 'no-files-or-directories' }
  | { readonly type: 'unsupported'; readonly reason: 'recursive-folder-drop-unavailable' | 'unreadable-items' }
  | { readonly type: 'error'; readonly message: string; readonly cause?: unknown };

export type DropFileSystemEntry = {
  readonly name: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
};

export type DropFileSystemFileEntry = DropFileSystemEntry & {
  readonly isFile: true;
  readonly isDirectory: false;
  readonly file: (success: (file: File) => void, error: (error: unknown) => void) => void;
};

export type DropFileSystemDirectoryReader = {
  readonly readEntries: (success: (entries: DropFileSystemEntry[]) => void, error: (error: unknown) => void) => void;
};

export type DropFileSystemDirectoryEntry = DropFileSystemEntry & {
  readonly isFile: false;
  readonly isDirectory: true;
  readonly createReader: () => DropFileSystemDirectoryReader;
};

export type FileTreeDataTransferItem = {
  readonly kind: string;
  readonly getAsFile?: () => unknown;
  readonly webkitGetAsEntry?: () => unknown;
};

export type FileTreeDataTransferItemList = {
  readonly [index: number]: FileTreeDataTransferItem | undefined;
  readonly [Symbol.iterator]?: () => IterableIterator<FileTreeDataTransferItem>;
  readonly length: number;
  readonly item?: (index: number) => unknown;
};

export type FileTreeDataTransferFiles = Iterable<File> | ArrayLike<File>;

type ProcessedEntry = {
  readonly files: DroppedFile[];
  readonly directories: DroppedDirectory[];
};

type ExtractedDropItems = {
  readonly entries: DropFileSystemEntry[];
  readonly directFiles: File[];
  readonly fileItemCount: number;
  readonly warnings: string[];
};

export function canReadForeignFileTreeDrop(dataTransfer: {
  readonly items: FileTreeDataTransferItemList;
  readonly files: { readonly length: number };
}): boolean {
  if (dataTransfer.files.length > 0) {
    return true;
  }

  for (const item of toDropItemArray(dataTransfer.items)) {
    if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
      return true;
    }
  }

  return false;
}

export async function ingestFileTreeDataTransfer(options: {
  readonly items: FileTreeDataTransferItemList | undefined;
  readonly files?: FileTreeDataTransferFiles | undefined;
}): Promise<DropIngestionResult> {
  const { items } = options;
  const fallbackFiles = toFileArray(options.files);
  if ((items?.length ?? 0) === 0 && fallbackFiles.length === 0) {
    return { type: 'empty', reason: 'no-items' };
  }

  try {
    const extracted = extractDropItems(items);
    const warnings = [...extracted.warnings];
    const processed: ProcessedEntry = { files: [], directories: [] };
    for (const entry of extracted.entries) {
      // oxlint-disable-next-line no-await-in-loop -- Directory entry readers are callback-driven and must be drained per entry.
      const entryResult = await processDropFileSystemEntry(entry, '');
      processed.files.push(...entryResult.files);
      processed.directories.push(...entryResult.directories);
    }

    const flatFiles =
      extracted.entries.length > 0 || extracted.directFiles.length > 0 ? extracted.directFiles : fallbackFiles;
    for (const file of flatFiles) {
      const relativePath = getFileRelativePath(file);
      if (!relativePath) {
        warnings.push(`Dropped file '${file.name}' did not include a usable path.`);
        continue;
      }
      processed.files.push({ kind: 'file', file, relativePath });
    }

    if (processed.files.length > 0 || processed.directories.length > 0) {
      return {
        type: 'entries',
        files: processed.files,
        directories: processed.directories,
        warnings,
      };
    }

    if (extracted.fileItemCount > 0) {
      return {
        type: 'unsupported',
        reason: warnings.length > 0 ? 'unreadable-items' : 'recursive-folder-drop-unavailable',
      };
    }

    return { type: 'empty', reason: 'no-files-or-directories' };
  } catch (error) {
    return {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      cause: error,
    };
  }
}

function extractDropItems(items: FileTreeDataTransferItemList | undefined): ExtractedDropItems {
  const entries: DropFileSystemEntry[] = [];
  const directFiles: File[] = [];
  let fileItemCount = 0;
  const warnings: string[] = [];

  if (items === undefined) {
    return { entries, directFiles, fileItemCount, warnings };
  }

  for (const item of toDropItemArray(items)) {
    if (item.kind !== 'file') {
      continue;
    }

    fileItemCount++;
    const entryCandidate = item.webkitGetAsEntry?.();
    if (isDropFileSystemEntry(entryCandidate)) {
      entries.push(entryCandidate);
      continue;
    }

    const fileCandidate = item.getAsFile?.();
    if (fileCandidate instanceof File) {
      directFiles.push(fileCandidate);
      continue;
    }

    warnings.push('A dropped item could not be read.');
  }

  return { entries, directFiles, fileItemCount, warnings };
}

function toDropItemArray(items: FileTreeDataTransferItemList): FileTreeDataTransferItem[] {
  if (isIterableDropItemCollection(items)) {
    return [...items];
  }

  return Array.from({ length: items.length }, (_, index) => items.item?.(index) ?? items[index]).filter(
    (item): item is FileTreeDataTransferItem => isFileTreeDataTransferItem(item),
  );
}

export function collectDropDirectoryPaths(options: {
  readonly targetDirectory: string;
  readonly files: readonly DroppedFile[];
  readonly directories: readonly DroppedDirectory[];
}): string[] {
  const directories = new Set<string>();
  const addWithAncestors = (path: string): void => {
    const normalized = normalizeDroppedRelativePath(path);
    if (!normalized) {
      return;
    }

    let current = '';
    for (const part of normalized.split('/')) {
      current = joinFileTreePath(current, part);
      directories.add(current);
    }
  };

  for (const directory of options.directories) {
    addWithAncestors(joinFileTreePath(options.targetDirectory, directory.relativePath));
  }

  for (const file of options.files) {
    const parentPath = getFileTreeParentDirectory(file.relativePath);
    if (parentPath) {
      addWithAncestors(joinFileTreePath(options.targetDirectory, parentPath));
    }
  }

  return [...directories].sort((a, b) => {
    const depthDifference = a.split('/').length - b.split('/').length;
    return depthDifference === 0 ? a.localeCompare(b) : depthDifference;
  });
}

export function normalizeDroppedRelativePath(path: string): string {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

async function processDropFileSystemEntry(entry: DropFileSystemEntry, basePath: string): Promise<ProcessedEntry> {
  if (entry.isFile) {
    const fileEntry = entry as DropFileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    const relativePath = normalizeDroppedRelativePath(joinFileTreePath(basePath, entry.name));
    return {
      files: relativePath ? [{ kind: 'file', file, relativePath }] : [],
      directories: [],
    };
  }

  if (entry.isDirectory) {
    const directoryEntry = entry as DropFileSystemDirectoryEntry;
    const directoryPath = normalizeDroppedRelativePath(joinFileTreePath(basePath, entry.name));
    const children = await readAllDirectoryEntries(directoryEntry.createReader());
    const result: ProcessedEntry = {
      files: [],
      directories: directoryPath ? [{ kind: 'directory', relativePath: directoryPath }] : [],
    };

    for (const child of children) {
      // oxlint-disable-next-line no-await-in-loop -- Directory traversal is intentionally ordered for deterministic import paths.
      const childResult = await processDropFileSystemEntry(child, directoryPath);
      result.files.push(...childResult.files);
      result.directories.push(...childResult.directories);
    }

    return result;
  }

  return { files: [], directories: [] };
}

async function readAllDirectoryEntries(directoryReader: DropFileSystemDirectoryReader): Promise<DropFileSystemEntry[]> {
  const entries: DropFileSystemEntry[] = [];
  let batch: DropFileSystemEntry[];
  do {
    // oxlint-disable-next-line no-await-in-loop -- FileSystemDirectoryReader requires repeated sequential reads until empty.
    batch = await new Promise<DropFileSystemEntry[]>((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);

  return entries;
}

function getFileRelativePath(file: File): string {
  return normalizeDroppedRelativePath(file.webkitRelativePath || file.name);
}

function toFileArray(files: FileTreeDataTransferFiles | undefined): File[] {
  if (files === undefined) {
    return [];
  }

  if (isIterableFileCollection(files)) {
    return [...files];
  }

  return Array.from({ length: files.length }, (_, index) => files[index]).filter(
    (file): file is File => file !== undefined,
  );
}

function isDropFileSystemEntry(candidate: unknown): candidate is DropFileSystemEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  const entry = candidate as Partial<DropFileSystemEntry>;
  return typeof entry.name === 'string' && typeof entry.isFile === 'boolean' && typeof entry.isDirectory === 'boolean';
}

function isFileTreeDataTransferItem(candidate: unknown): candidate is FileTreeDataTransferItem {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  return typeof (candidate as Partial<FileTreeDataTransferItem>).kind === 'string';
}

function isIterableFileCollection(files: FileTreeDataTransferFiles): files is Iterable<File> {
  return typeof (files as { readonly [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

function isIterableDropItemCollection(
  items: FileTreeDataTransferItemList,
): items is FileTreeDataTransferItemList & Iterable<FileTreeDataTransferItem> {
  return typeof items[Symbol.iterator] === 'function';
}
