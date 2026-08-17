/**
 * Mock factory for FileSystemDirectoryHandle / FileSystemFileHandle.
 *
 * Creates an in-memory handle tree that satisfies the File System Access API
 * contract for testing FileSystemAccessProvider and OPFSProvider without
 * browser APIs.
 */

type DirectoryEntry = { kind: 'directory'; handle: MockDirectoryHandle };
type FileEntry = {
  kind: 'file';
  content: Uint8Array<ArrayBuffer>;
  lastModified: number;
  /** OPFS allows one sync access handle per file at a time. */
  syncHandleOpen?: boolean;
};
type Entry = DirectoryEntry | FileEntry;

/**
 * Test-visible knobs for {@link createMockRootHandle}.
 *
 * @public
 */
export type MockRootHandleOptions = {
  /**
   * Expose `createSyncAccessHandle()` on file handles (OPFS-only API).
   * Set `false` to model a browser/test environment without it. Default `true`.
   */
  syncAccess?: boolean;
  /** Called on every write-API acquisition *attempt*, including ones that throw. */
  onAcquireWriteApi?: (api: 'sync' | 'writable') => void;
};

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

class MockSyncAccessHandle {
  private readonly _entry: FileEntry;

  public constructor(entry: FileEntry) {
    this._entry = entry;
    entry.syncHandleOpen = true;
  }

  public getSize(): number {
    return this._entry.content.byteLength;
  }

  public truncate(size: number): void {
    const next = new Uint8Array(size);
    next.set(this._entry.content.subarray(0, Math.min(size, this._entry.content.byteLength)));
    this._entry.content = next;
  }

  public write(data: BufferSource, options?: { at?: number }): number {
    const view = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    const at = options?.at ?? 0;
    if (at + view.byteLength > this._entry.content.byteLength) {
      const grown = new Uint8Array(at + view.byteLength);
      grown.set(this._entry.content);
      this._entry.content = grown;
    }
    this._entry.content.set(view, at);
    this._entry.lastModified = Date.now();
    return view.byteLength;
  }

  // oxlint-disable-next-line no-empty-function -- Mock storage is already coherent; flush has nothing to push.
  public flush(): void {}

  public close(): void {
    this._entry.syncHandleOpen = false;
  }
}

class MockFileHandle {
  public get kind(): 'file' {
    return 'file';
  }

  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  public readonly name: string;
  /**
   * Own property, present only when the mock models OPFS. Providers
   * feature-detect with `typeof handle.createSyncAccessHandle === 'function'`,
   * so absence has to be real absence, not a stubbed method.
   */
  public createSyncAccessHandle?: () => Promise<MockSyncAccessHandle>;
  private readonly _entry: FileEntry;
  private readonly _options: MockRootHandleOptions;

  public constructor(name: string, entry: FileEntry, options: MockRootHandleOptions) {
    this.name = name;
    this._entry = entry;
    this._options = options;
    if (options.syncAccess !== false) {
      this.createSyncAccessHandle = async (): Promise<MockSyncAccessHandle> => {
        options.onAcquireWriteApi?.('sync');
        if (entry.syncHandleOpen === true) {
          throw new DOMException(`Sync access handle already open: ${name}`, 'NoModificationAllowedError');
        }
        return new MockSyncAccessHandle(entry);
      };
    }
  }

  public async getFile(): Promise<File> {
    return new File([this._entry.content], this.name, {
      lastModified: this._entry.lastModified,
    });
  }

  public async createWritable(): Promise<MockWritableStream> {
    this._options.onAcquireWriteApi?.('writable');
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
  private readonly _options: MockRootHandleOptions;

  public constructor(
    name: string,
    options: MockRootHandleOptions = {},
    shared: { identity?: Record<string, never>; children?: Map<string, Entry> } = {},
  ) {
    this.name = name;
    this._options = options;
    this._identity = shared.identity ?? {};
    this._children = shared.children ?? new Map<string, Entry>();
  }

  public async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
    const existing = this._children.get(name);
    if (existing?.kind === 'file') {
      return new MockFileHandle(name, existing, this._options);
    }
    if (existing) {
      throw new DOMException('Is a directory', 'TypeMismatchError');
    }
    if (options?.create) {
      const entry: FileEntry = { kind: 'file', content: new Uint8Array(0), lastModified: Date.now() };
      this._children.set(name, entry);
      return new MockFileHandle(name, entry, this._options);
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
      const handle = new MockDirectoryHandle(name, this._options);
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
      yield entry.kind === 'file' ? [name, new MockFileHandle(name, entry, this._options)] : [name, entry.handle];
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
    return new MockDirectoryHandle(this.name, this._options, { identity: this._identity, children: this._children });
  }
}

/**
 * Create a mock `FileSystemDirectoryHandle` root for testing.
 *
 * @param options - Sync-access-handle availability and write-API observation.
 * @returns A root handle that implements the File System Access API
 *          contract using in-memory storage.
 *
 * @example <caption>Mock root for FileSystemAccessProvider</caption>
 * ```typescript
 * const root = createMockRootHandle();
 * const provider = new FileSystemAccessProvider(root as unknown as FileSystemDirectoryHandle);
 * ```
 */
export function createMockRootHandle(options: MockRootHandleOptions = {}): MockDirectoryHandle {
  return new MockDirectoryHandle('root', options);
}
