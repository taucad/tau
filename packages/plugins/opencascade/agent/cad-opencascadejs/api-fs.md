# libcascade — FS

1 top-level symbols. Signatures are verbatim typescript.

FS

  function lookupPath(path: string, opts: any): unknown;

  function getPath(node: unknown): string;

  function isFile(mode: number): boolean;

  function isDir(mode: number): boolean;

  function isLink(mode: number): boolean;

  function isChrdev(mode: number): boolean;

  function isBlkdev(mode: number): boolean;

  function isFIFO(mode: number): boolean;

  function isSocket(mode: number): boolean;

  function major(dev: number): number;

  function minor(dev: number): number;

  function makedev(ma: number, mi: number): number;

  function registerDevice(dev: number, ops: any): void;

  function syncfs(populate: boolean, callback: (e: any) => any): void;
  function syncfs(callback: (e: any) => any, populate?: boolean): void;

  function mount(type: any, opts: any, mountpoint: string): any;

  function unmount(mountpoint: string): void;

  function mkdir(path: string, mode?: number): any;

  function mkdev(path: string, mode?: number, dev?: number): any;

  function symlink(oldpath: string, newpath: string): any;

  function rename(old_path: string, new_path: string): void;

  function rmdir(path: string): void;

  function readdir(path: string): any;

  function unlink(path: string): void;

  function readlink(path: string): string;

  function stat(path: string, dontFollow?: boolean): any;

  function lstat(path: string): any;

  function chmod(path: string, mode: number, dontFollow?: boolean): void;

  function lchmod(path: string, mode: number): void;

  function fchmod(fd: number, mode: number): void;

  function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;

  function lchown(path: string, uid: number, gid: number): void;

  function fchown(fd: number, uid: number, gid: number): void;

  function truncate(path: string, len: number): void;

  function ftruncate(fd: number, len: number): void;

  function utime(path: string, atime: number, mtime: number): void;

  function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): unknown;

  function close(stream: unknown): void;

  function llseek(stream: unknown, offset: number, whence: number): any;

  function read(stream: unknown, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;

  function write(
        stream: unknown,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position?: number,
        canOwn?: boolean,
    ): number;

  function allocate(stream: unknown, offset: number, length: number): void;

  function mmap(
        stream: unknown,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position: number,
        prot: number,
        flags: number,
    ): any;

  function ioctl(stream: unknown, cmd: any, arg: any): any;

  function readFile(path: string, opts: { encoding: 'binary'; flags?: string }): Uint8Array;
  function readFile(path: string, opts: { encoding: 'utf8'; flags?: string }): string;
  function readFile(path: string, opts?: { flags?: string }): Uint8Array;

  function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string }): void;

  function cwd(): string;

  function chdir(path: string): void;

  function init(
        input: null | (() => number | null),
        output: null | ((c: number) => any),
        error: null | ((c: number) => any),
    ): void;

  function createLazyFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
    ): unknown;

  function createPreloadedFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
        onload?: () => void,
        onerror?: () => void,
        dontCreateFile?: boolean,
        canOwn?: boolean,
    ): void;

  function createDataFile(
        parent: string | FSNode,
        name: string,
        data: ArrayBufferView | string,
        canRead: boolean,
        canWrite: boolean,
        canOwn: boolean,
    ): unknown;

  function analyzePath(path: string): unknown;

  Lookup: interface Lookup

    path: string

    node: unknown

  FSStream: unknown

  FSNode: unknown

  ErrnoError: unknown

  ignorePermissions: boolean

  trackingDelegate: any

  tracking: any

  genericErrors: any

  AnalysisResults: interface AnalysisResults

    isRoot: boolean

    exists: boolean

    error: Error

    name: string

    path: any

    object: any

    parentExists: boolean

    parentPath: any

    parentObject: any
