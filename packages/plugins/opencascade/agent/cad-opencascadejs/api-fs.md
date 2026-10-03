# libcascade — FS

1 top-level symbols. Signatures are verbatim typescript.

FS

  // FS.lookupPath (function)
  function lookupPath(path: string, opts: any): unknown;

  // FS.getPath (function)
  function getPath(node: unknown): string;

  // FS.isFile (function)
  function isFile(mode: number): boolean;

  // FS.isDir (function)
  function isDir(mode: number): boolean;

  // FS.isLink (function)
  function isLink(mode: number): boolean;

  // FS.isChrdev (function)
  function isChrdev(mode: number): boolean;

  // FS.isBlkdev (function)
  function isBlkdev(mode: number): boolean;

  // FS.isFIFO (function)
  function isFIFO(mode: number): boolean;

  // FS.isSocket (function)
  function isSocket(mode: number): boolean;

  // FS.major (function)
  function major(dev: number): number;

  // FS.minor (function)
  function minor(dev: number): number;

  // FS.makedev (function)
  function makedev(ma: number, mi: number): number;

  // FS.registerDevice (function)
  function registerDevice(dev: number, ops: any): void;

  // FS.syncfs (function)
  function syncfs(populate: boolean, callback: (e: any) => any): void;
  function syncfs(callback: (e: any) => any, populate?: boolean): void;

  // FS.mount (function)
  function mount(type: any, opts: any, mountpoint: string): any;

  // FS.unmount (function)
  function unmount(mountpoint: string): void;

  // FS.mkdir (function)
  function mkdir(path: string, mode?: number): any;

  // FS.mkdev (function)
  function mkdev(path: string, mode?: number, dev?: number): any;

  // FS.symlink (function)
  function symlink(oldpath: string, newpath: string): any;

  // FS.rename (function)
  function rename(old_path: string, new_path: string): void;

  // FS.rmdir (function)
  function rmdir(path: string): void;

  // FS.readdir (function)
  function readdir(path: string): any;

  // FS.unlink (function)
  function unlink(path: string): void;

  // FS.readlink (function)
  function readlink(path: string): string;

  // FS.stat (function)
  function stat(path: string, dontFollow?: boolean): any;

  // FS.lstat (function)
  function lstat(path: string): any;

  // FS.chmod (function)
  function chmod(path: string, mode: number, dontFollow?: boolean): void;

  // FS.lchmod (function)
  function lchmod(path: string, mode: number): void;

  // FS.fchmod (function)
  function fchmod(fd: number, mode: number): void;

  // FS.chown (function)
  function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;

  // FS.lchown (function)
  function lchown(path: string, uid: number, gid: number): void;

  // FS.fchown (function)
  function fchown(fd: number, uid: number, gid: number): void;

  // FS.truncate (function)
  function truncate(path: string, len: number): void;

  // FS.ftruncate (function)
  function ftruncate(fd: number, len: number): void;

  // FS.utime (function)
  function utime(path: string, atime: number, mtime: number): void;

  // FS.open (function)
  function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): unknown;

  // FS.close (function)
  function close(stream: unknown): void;

  // FS.llseek (function)
  function llseek(stream: unknown, offset: number, whence: number): any;

  // FS.read (function)
  function read(stream: unknown, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;

  // FS.write (function)
  function write(
        stream: unknown,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position?: number,
        canOwn?: boolean,
    ): number;

  // FS.allocate (function)
  function allocate(stream: unknown, offset: number, length: number): void;

  // FS.mmap (function)
  function mmap(
        stream: unknown,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position: number,
        prot: number,
        flags: number,
    ): any;

  // FS.ioctl (function)
  function ioctl(stream: unknown, cmd: any, arg: any): any;

  // FS.readFile (function)
  function readFile(path: string, opts: { encoding: 'binary'; flags?: string }): Uint8Array;
  function readFile(path: string, opts: { encoding: 'utf8'; flags?: string }): string;
  function readFile(path: string, opts?: { flags?: string }): Uint8Array;

  // FS.writeFile (function)
  function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string }): void;

  // FS.cwd (function)
  function cwd(): string;

  // FS.chdir (function)
  function chdir(path: string): void;

  // FS.init (function)
  function init(
        input: null | (() => number | null),
        output: null | ((c: number) => any),
        error: null | ((c: number) => any),
    ): void;

  // FS.createLazyFile (function)
  function createLazyFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
    ): unknown;

  // FS.createPreloadedFile (function)
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

  // FS.createDataFile (function)
  function createDataFile(
        parent: string | FSNode,
        name: string,
        data: ArrayBufferView | string,
        canRead: boolean,
        canWrite: boolean,
        canOwn: boolean,
    ): unknown;

  // FS.analyzePath (function)
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
