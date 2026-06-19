import { describe, expect, it } from 'vitest';
import {
  canReadForeignFileTreeDrop,
  collectDropDirectoryPaths,
  ingestFileTreeDataTransfer,
  normalizeDroppedRelativePath,
} from '#routes/projects_.$id/file-tree-drop-ingestion.js';
import type {
  DropFileSystemDirectoryEntry,
  DropFileSystemEntry,
  DropFileSystemFileEntry,
  FileTreeDataTransferItem,
  FileTreeDataTransferItemList,
} from '#routes/projects_.$id/file-tree-drop-ingestion.js';

function createItemList(items: readonly FileTreeDataTransferItem[]): FileTreeDataTransferItemList {
  return {
    length: items.length,
    *[Symbol.iterator]() {
      yield* items;
    },
  };
}

function createFileEntry(name: string, content = name): DropFileSystemFileEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file(resolve) {
      resolve(new File([content], name, { type: 'text/plain' }));
    },
  };
}

function createDirectoryEntry(name: string, children: readonly DropFileSystemEntry[]): DropFileSystemDirectoryEntry {
  let readCount = 0;
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      return {
        readEntries(resolve) {
          readCount++;
          resolve(readCount === 1 ? [...children] : []);
        },
      };
    },
  };
}

function createFailingDirectoryEntry(name: string, error: Error): DropFileSystemDirectoryEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      return {
        readEntries(_resolve, reject) {
          reject(error);
        },
      };
    },
  };
}

function createEntryItem(entry: DropFileSystemEntry | undefined): FileTreeDataTransferItem {
  return {
    kind: 'file',
    webkitGetAsEntry: () => entry,
  };
}

describe('file-tree-drop-ingestion', () => {
  it('should read recursive entries and preserve empty directories', async () => {
    const root = createDirectoryEntry('folder', [
      createDirectoryEntry('empty', []),
      createFileEntry('a.txt', 'a'),
      createDirectoryEntry('nested', [createFileEntry('b.txt', 'b')]),
    ]);

    const result = await ingestFileTreeDataTransfer({
      items: createItemList([createEntryItem(root)]),
      files: [],
    });

    expect(result.type).toBe('entries');
    if (result.type !== 'entries') {
      expect.fail('drop ingestion should produce entries');
    }
    expect(result.directories.map((directory) => directory.relativePath)).toEqual([
      'folder',
      'folder/empty',
      'folder/nested',
    ]);
    expect(result.files.map((file) => file.relativePath)).toEqual(['folder/a.txt', 'folder/nested/b.txt']);
    expect(result.files[0]?.file.name).toBe('a.txt');
    expect(result.files[0]?.file.size).toBe(1);
  });

  it('should fall back to flat DataTransfer files when entry APIs are unavailable', async () => {
    const file = new File(['flat'], 'flat.js', { type: 'text/javascript' });

    const result = await ingestFileTreeDataTransfer({
      items: createItemList([]),
      files: [file],
    });

    expect(result).toMatchObject({
      type: 'entries',
      directories: [],
      warnings: [],
    });
    if (result.type !== 'entries') {
      expect.fail('flat DataTransfer files should produce entries');
    }
    expect(result.files.map((entry) => entry.relativePath)).toEqual(['flat.js']);
  });

  it('should call native DataTransferItem methods with the item receiver', async () => {
    const file = new File(['native'], 'native-like.js', { type: 'text/javascript' });
    const nativeLikeItem: FileTreeDataTransferItem = {
      kind: 'file',
      webkitGetAsEntry(this: FileTreeDataTransferItem) {
        expect(this).toBe(nativeLikeItem);
        return undefined;
      },
      getAsFile(this: FileTreeDataTransferItem) {
        expect(this).toBe(nativeLikeItem);
        return file;
      },
    };

    const result = await ingestFileTreeDataTransfer({
      items: createItemList([nativeLikeItem]),
      files: [],
    });

    if (result.type !== 'entries') {
      expect.fail('native-like DataTransferItem methods should produce entries');
    }
    expect(result.files.map((entry) => entry.relativePath)).toEqual(['native-like.js']);
  });

  it('should preserve webkitRelativePath for flat files when present', async () => {
    const file = new File(['nested'], 'nested.js', { type: 'text/javascript' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'folder/nested.js',
    });

    const result = await ingestFileTreeDataTransfer({
      items: createItemList([]),
      files: [file],
    });

    if (result.type !== 'entries') {
      expect.fail('flat DataTransfer files should produce entries');
    }
    expect(result.files.map((entry) => entry.relativePath)).toEqual(['folder/nested.js']);
  });

  it('should return unsupported when file items cannot be read', async () => {
    const result = await ingestFileTreeDataTransfer({
      items: createItemList([createEntryItem(undefined)]),
      files: [],
    });

    expect(result).toEqual({ type: 'unsupported', reason: 'unreadable-items' });
  });

  it('should return an error result when directory traversal fails', async () => {
    const result = await ingestFileTreeDataTransfer({
      items: createItemList([createEntryItem(createFailingDirectoryEntry('folder', new Error('reader failed')))]),
      files: [],
    });

    expect(result).toMatchObject({
      type: 'error',
      message: 'reader failed',
    });
  });

  it('should return an error result when native item extraction throws', async () => {
    const result = await ingestFileTreeDataTransfer({
      items: createItemList([
        {
          kind: 'file',
          getAsFile() {
            throw new TypeError('Illegal invocation');
          },
        },
      ]),
      files: [],
    });

    expect(result).toMatchObject({
      type: 'error',
      message: 'Illegal invocation',
    });
  });

  it('should collect directory paths with parents before children', () => {
    const directories = collectDropDirectoryPaths({
      targetDirectory: 'public/models',
      directories: [{ kind: 'directory', relativePath: 'folder/empty' }],
      files: [{ kind: 'file', file: new File(['x'], 'x.js'), relativePath: 'folder/nested/x.js' }],
    });

    expect(directories).toEqual([
      'public',
      'public/models',
      'public/models/folder',
      'public/models/folder/empty',
      'public/models/folder/nested',
    ]);
  });

  it('should normalize dropped paths by removing empty segments and whitespace', () => {
    expect(normalizeDroppedRelativePath('/ folder // nested / file.js ')).toBe('folder/nested/file.js');
  });

  it('should identify readable foreign drops without running async ingestion', () => {
    expect(
      canReadForeignFileTreeDrop({
        items: createItemList([createEntryItem(createFileEntry('a.txt'))]),
        files: { length: 0 },
      }),
    ).toBe(true);

    expect(
      canReadForeignFileTreeDrop({
        items: createItemList([]),
        files: { length: 1 },
      }),
    ).toBe(true);
  });
});
