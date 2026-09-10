# libcascade — FS

1 top-level symbols. Signatures are verbatim typescript.

// Emscripten virtual filesystem
FS

// Resolve a path to its filesystem node, optionally following symlinks
function lookupPath(path: string, opts: any): unknown;
// path: The absolute or relative path to resolve
// opts: Lookup options (e.g

// Get the absolute path for a filesystem node
function getPath(node: unknown): string;
// node: The filesystem node

// Check whether the mode bits indicate a regular file
function isFile(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a directory
function isDir(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a symbolic link
function isLink(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a character device
function isChrdev(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a block device
function isBlkdev(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a FIFO (named pipe)
function isFIFO(mode: number): boolean;
// mode: The st_mode value from `stat`

// Check whether the mode bits indicate a socket
function isSocket(mode: number): boolean;
// mode: The st_mode value from `stat`

// Extract the major device number from a device identifier
function major(dev: number): number;
// dev: The combined device identifier

// Extract the minor device number from a device identifier
function minor(dev: number): number;
// dev: The combined device identifier

// Combine major and minor numbers into a device identifier
function makedev(ma: number, mi: number): number;
// ma: The major device number
// mi: The minor device number

// Register a device driver for the given device identifier
function registerDevice(dev: number, ops: any): void;
// dev: The combined device identifier
// ops: Device operation callbacks (read, write, etc.)

// Persist or restore the virtual filesystem to/from a backing store
function syncfs(populate: boolean, callback: (e: any) => any): void;
function syncfs(callback: (e: any) => any, populate?: boolean): void;
// populate: When `true`, loads data from the backing store into memory
// callback: Called on completion with an optional error

// Mount a filesystem type at the given mountpoint
function mount(type: any, opts: any, mountpoint: string): any;
// type: The filesystem type (e.g
// opts: Mount options passed to the filesystem driver
// mountpoint: The path at which to mount

// Unmount the filesystem at the given mountpoint
function unmount(mountpoint: string): void;
// mountpoint: The path to unmount

// Create a directory in the virtual filesystem
function mkdir(path: string, mode?: number): any;
// path: The directory path to create
// mode: Optional POSIX permission bits (default `0o777`)

// Create a device node in the virtual filesystem
function mkdev(path: string, mode?: number, dev?: number): any;
// path: The path for the device node
// mode: Optional POSIX permission bits
// dev: Optional device identifier (from `makedev`)

// Create a symbolic link
function symlink(oldpath: string, newpath: string): any;
// oldpath: The target path the symlink points to
// newpath: The path of the symlink itself

// Rename (move) a file or directory
function rename(old_path: string, new_path: string): void;
// old_path: The current path
// new_path: The new path

// Remove an empty directory
function rmdir(path: string): void;
// path: The directory to remove

// List entries in a directory
function readdir(path: string): any;
// path: The directory path

// Remove a file
function unlink(path: string): void;
// path: The file to remove

// Read the target of a symbolic link
function readlink(path: string): string;
// path: The symlink path

// Get file status (size, mode, timestamps, etc.)
function stat(path: string, dontFollow?: boolean): any;
// path: The file path
// dontFollow: When `true`, returns the symlink's own status instead of the target's

// Like `stat`, but always returns the symlink's own status
function lstat(path: string): any;
// path: The file path

// Change file permission bits
function chmod(path: string, mode: number, dontFollow?: boolean): void;
// path: The file path
// mode: The new POSIX permission bits
// dontFollow: When `true`, changes the symlink itself rather than its target

// Change permission bits of a symbolic link itself
function lchmod(path: string, mode: number): void;
// path: The symlink path
// mode: The new POSIX permission bits

// Change permission bits of an open file descriptor
function fchmod(fd: number, mode: number): void;
// fd: The file descriptor
// mode: The new POSIX permission bits

// Change file ownership
function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;
// path: The file path
// uid: The new user ID
// gid: The new group ID
// dontFollow: When `true`, changes the symlink itself rather than its target

// Change ownership of a symbolic link itself
function lchown(path: string, uid: number, gid: number): void;
// path: The symlink path
// uid: The new user ID
// gid: The new group ID

// Change ownership of an open file descriptor
function fchown(fd: number, uid: number, gid: number): void;
// fd: The file descriptor
// uid: The new user ID
// gid: The new group ID

// Truncate a file to a specified length
function truncate(path: string, len: number): void;
// path: The file path
// len: The new length in bytes

// Truncate an open file descriptor to a specified length
function ftruncate(fd: number, len: number): void;
// fd: The file descriptor
// len: The new length in bytes

// Update access and modification timestamps of a file
function utime(path: string, atime: number, mtime: number): void;
// path: The file path
// atime: The new access time (seconds since epoch)
// mtime: The new modification time (seconds since epoch)

// Open a file and return a stream handle
function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): unknown;
// path: The file path
// flags: POSIX open flags as a string (e.g
// mode: Optional permission bits for newly created files
// fd_start: Optional starting file descriptor number
// fd_end: Optional ending file descriptor number

// Close an open file stream
function close(stream: unknown): void;
// stream: The stream to close

// Reposition the read/write offset of a stream
function llseek(stream: unknown, offset: number, whence: number): any;
// stream: The open file stream
// offset: The byte offset
// whence: The reference point (`0` = start, `1` = current, `2` = end)

// Read bytes from a stream into a buffer
function read(stream: unknown, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;
// stream: The open file stream
// buffer: The destination buffer
// offset: The byte offset within `buffer` to start writing
// length: Maximum number of bytes to read
// position: Optional absolute file offset to read from

// Write bytes from a buffer to a stream
function write(
stream: unknown,
buffer: ArrayBufferView,
offset: number,
length: number,
position?: number,
canOwn?: boolean,
): number;
// stream: The open file stream
// buffer: The source buffer
// offset: The byte offset within `buffer` to start reading
// length: Number of bytes to write
// position: Optional absolute file offset to write at
// canOwn: When `true`, Emscripten may take ownership of the buffer

// Pre-allocate storage for a file region
function allocate(stream: unknown, offset: number, length: number): void;
// stream: The open file stream
// offset: Starting byte offset
// length: Number of bytes to allocate

// Memory-map a region of a file
function mmap(
stream: unknown,
buffer: ArrayBufferView,
offset: number,
length: number,
position: number,
prot: number,
flags: number,
): any;
// stream: The open file stream
// buffer: The target buffer view
// offset: Byte offset in the buffer
// length: Length of the mapping in bytes
// position: Byte offset in the file
// prot: Memory protection flags
// flags: Mapping flags

// Perform a device-specific I/O control operation
function ioctl(stream: unknown, cmd: any, arg: any): any;
// stream: The open file stream
// cmd: The ioctl command
// arg: The command argument

// Read an entire file as a `Uint8Array` (binary mode)
function readFile(path: string, opts: { encoding: 'binary'; flags?: string }): Uint8Array;
function readFile(path: string, opts: { encoding: 'utf8'; flags?: string }): string;
function readFile(path: string, opts?: { flags?: string }): Uint8Array;
// path: The file path
// opts: Options with `encoding

// Write data to a file, creating it if it does not exist
function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string }): void;
// path: The file path
// data: The content to write (string or binary buffer)
// opts: Optional flags

// Get the current working directory
function cwd(): string;

// Change the current working directory
function chdir(path: string): void;
// path: The directory to switch to

// Initialize the standard I/O streams (stdin, stdout, stderr)
function init(
input: null | (() => number | null),
output: null | ((c: number) => any),
error: null | ((c: number) => any),
): void;
// input: Callback supplying characters for stdin, or `null` for default
// output: Callback receiving characters from stdout, or `null` for default
// error: Callback receiving characters from stderr, or `null` for default

// Create a file that is lazily fetched from a URL on first read
function createLazyFile(
parent: string | FSNode,
name: string,
url: string,
canRead: boolean,
canWrite: boolean,
): unknown;
// parent: The parent directory path or node
// name: The filename
// url: The URL to fetch the content from
// canRead: Whether the file is readable
// canWrite: Whether the file is writable

// Create a file that is preloaded (fetched and stored) before the program runs
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
// parent: The parent directory path or node
// name: The filename
// url: The URL to fetch the content from
// canRead: Whether the file is readable
// canWrite: Whether the file is writable
// onload: Optional callback on successful load
// onerror: Optional callback on load failure
// dontCreateFile: When `true`, skips creating the file node
// canOwn: When `true`, the runtime may take ownership of the data

// Create a file from in-memory data
function createDataFile(
parent: string | FSNode,
name: string,
data: ArrayBufferView | string,
canRead: boolean,
canWrite: boolean,
canOwn: boolean,
): unknown;
// parent: The parent directory path or node
// name: The filename
// data: The file contents
// canRead: Whether the file is readable
// canWrite: Whether the file is writable
// canOwn: When `true`, the runtime may take ownership of the data

// Analyze a path to determine existence, parent information, and errors
function analyzePath(path: string): unknown;
// path: The path to analyze

// Result of a path lookup containing the resolved node
Lookup: interface Lookup

    path: string

    node: unknown

// Opaque handle to an open file stream
FSStream: unknown

// Opaque handle to a filesystem node (file, directory, or device)
FSNode: unknown

// Error thrown by FS operations with an Emscripten errno code
ErrnoError: unknown

// When `true`, permission checks are bypassed for all FS operations
ignorePermissions: boolean

trackingDelegate: any

tracking: any

genericErrors: any

// Result of analyzing a filesystem path for existence and parent resolution
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
