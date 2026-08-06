/**
 * Mock factory for FileSystemDirectoryHandle / FileSystemFileHandle.
 *
 * Creates an in-memory handle tree that satisfies the File System Access API
 * contract for testing FileSystemAccessProvider and OPFSProvider without
 * browser APIs.
 */

type DirectoryEntry = { kind: 'directory'; handle: MockDirectoryHandle };
type FileEntry = { kind: 'file'; content: Uint8Array<ArrayBuffer>; lastModified: number };
type Entry = DirectoryEntry | FileEntry;

class MockWritableStream {
  private readonly _chunks: Array<Uint8Array<ArrayBuffer>> = [];
  private readonly _onClose: (data: Uint8Array<ArrayBuffer>) => void;

  public constructor(onClose: (data: Uint8Array<ArrayBuffer>) => void) {
    this._onClose = onClose;
  }

  public async write(data: Uint8Array<ArrayBuffer> | BufferSource): Promise<void> {
    const view = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    this._chunks.push(view);
  }

  public async close(): Promise<void> {
    const totalLength = this._chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this._chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this._onClose(merged);
  }
}

class MockFileHandle {
  public get kind(): 'file' {
    return 'file';
  }

  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  public readonly name: string;
  private readonly _entry: FileEntry;

  public constructor(name: string, entry: FileEntry) {
    this.name = name;
    this._entry = entry;
  }

  public async getFile(): Promise<File> {
    return new File([this._entry.content], this.name, {
      lastModified: this._entry.lastModified,
    });
  }

  public async createWritable(): Promise<MockWritableStream> {
    return new MockWritableStream((data) => {
      this._entry.content = data;
      this._entry.lastModified = Date.now();
    });
  }

  public async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other instanceof MockFileHandle && other._entry === this._entry;
  }
}

class MockDirectoryHandle {
  public get kind(): 'directory' {
    return 'directory';
  }

  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  public readonly name: string;
  private readonly _children: Map<string, Entry>;
  private readonly _identity: Record<string, never>;

  public constructor(name: string, identity: Record<string, never> = {}, children = new Map<string, Entry>()) {
    this.name = name;
    this._identity = identity;
    this._children = children;
  }

  public async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    const existing = this._children.get(name);
    if (existing?.kind === 'file') {
      return new MockFileHandle(name, existing);
    }
    if (existing) {
      throw new DOMException('Is a directory', 'TypeMismatchError');
    }
    if (options?.create) {
      const entry: FileEntry = { kind: 'file', content: new Uint8Array(0), lastModified: Date.now() };
      this._children.set(name, entry);
      return new MockFileHandle(name, entry);
    }
    throw new DOMException(`File not found: ${name}`, 'NotFoundError');
  }

  public async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectoryHandle> {
    const existing = this._children.get(name);
    if (existing?.kind === 'directory') {
      return existing.handle;
    }
    if (existing) {
      throw new DOMException('Is a file', 'TypeMismatchError');
    }
    if (options?.create) {
      const handle = new MockDirectoryHandle(name);
      this._children.set(name, { kind: 'directory', handle });
      return handle;
    }
    throw new DOMException(`Directory not found: ${name}`, 'NotFoundError');
  }

  public async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const entry = this._children.get(name);
    if (!entry) {
      throw new DOMException(`Entry not found: ${name}`, 'NotFoundError');
    }
    if (entry.kind === 'directory' && !options?.recursive && entry.handle._children.size > 0) {
      throw new DOMException(`Directory not empty: ${name}`, 'InvalidModificationError');
    }
    this._children.delete(name);
  }

  public async *entries(): AsyncGenerator<[string, MockFileHandle | MockDirectoryHandle]> {
    for (const [name, entry] of this._children) {
      yield entry.kind === 'file' ? [name, new MockFileHandle(name, entry)] : [name, entry.handle];
    }
  }

  public async isSameEntry(other: FileSystemHandle): Promise<boolean> {
    return other instanceof MockDirectoryHandle && other._identity === this._identity;
  }

  /**
   * Create another JS wrapper for the same in-memory directory entry.
   *
   * @returns A handle wrapper sharing this directory's identity and children.
   */
  public clone(): MockDirectoryHandle {
    return new MockDirectoryHandle(this.name, this._identity, this._children);
  }
}

/**
 * Create a mock `FileSystemDirectoryHandle` root for testing.
 *
 * @returns A root handle that implements the File System Access API
 *          contract using in-memory storage.
 *
 * @example <caption>Mock root for FileSystemAccessProvider</caption>
 * ```typescript
 * const root = createMockRootHandle();
 * const provider = new FileSystemAccessProvider(root as unknown as FileSystemDirectoryHandle);
 * ```
 */
export function createMockRootHandle(): MockDirectoryHandle {
  return new MockDirectoryHandle('root');
}
