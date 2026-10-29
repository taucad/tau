/**
 * THROWAWAY DIAGNOSTIC. Not a conformance target, not a product path, never imported by shipped code.
 *
 * Mounts the private Linux projection bridge over an empty mountpoint as the invoking (unprivileged) user and
 * serves one read-only file, so a caller can then test reading it directly and through a `bwrap` bind. It answers
 * the kernel from this process only; it supplies no inode store, no classifier and no mutation authority, and it
 * refuses every mutating operation with EROFS.
 *
 * Usage: node shell-projection-guest-probe.mjs <bridge .node> <absolute empty mountpoint>
 * Prints `PROBE-MOUNTED` on stdout once the mount is live, then serves until SIGTERM/SIGINT.
 * Exit: 0 clean shutdown; 1 the mount or the bridge load failed (the reason is printed as `PROBE-MOUNT-ERROR:`).
 */
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';

const EROFS = 30;
const ENOENT = 2;
const ENOSYS = 38;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

const [binary, mountpoint] = process.argv.slice(2);
if (!binary || !mountpoint) {
  process.stderr.write('PROBE-MOUNT-ERROR: usage: shell-projection-guest-probe.mjs <bridge> <mountpoint>\n');
  process.exit(1);
}

/** The one file this probe projects. Its bytes exist only here; nothing on disk backs the mount. */
const fileName = 'probe.txt';
const fileBytes = new TextEncoder().encode('tau-projection-probe-ok\n');
const rootInode = 1n;
const fileInode = 2n;
const rootEntry = { inode: rootInode, mode: S_IFDIR | 0o755, size: 4096, links: 2 };
const fileEntry = { inode: fileInode, mode: S_IFREG | 0o444, size: fileBytes.length, links: 1 };

let binding;
try {
  binding = createRequire(import.meta.url)(realpathSync(binary));
} catch (error) {
  process.stderr.write(`PROBE-MOUNT-ERROR: cannot load the bridge: ${error?.message ?? error}\n`);
  process.exit(1);
}

try {
  const identity = binding.libraryIdentity();
  process.stdout.write(`PROBE-LIBRARY: ${identity.path} version ${identity.version}\n`);
} catch (error) {
  process.stderr.write(`PROBE-MOUNT-ERROR: libraryIdentity failed: ${error?.message ?? error}\n`);
  process.exit(1);
}

/** Answer one kernel request. Reads and lookups are served; everything that would mutate is refused. */
const answer = (request) => {
  switch (request.operation) {
    case 'lookup':
      return request.inode === rootInode && request.name === fileName ? { entry: fileEntry } : { error: ENOENT };
    case 'getattr':
      if (request.inode === rootInode) return { entry: rootEntry };
      if (request.inode === fileInode) return { entry: fileEntry };
      return { error: ENOENT };
    case 'open':
      if (request.inode === rootInode || request.inode === fileInode) return { handle: request.inode };
      return { error: ENOENT };
    case 'read': {
      if (request.inode !== fileInode) return { error: ENOENT };
      const start = Math.min(request.offset, fileBytes.length);
      const end = Math.min(start + request.length, fileBytes.length);
      return { bytes: fileBytes.subarray(start, end) };
    }
    case 'readdir': {
      if (request.inode !== rootInode) return { error: ENOENT };
      const rows = [{ name: fileName, inode: fileInode, mode: fileEntry.mode }];
      return { entries: rows.slice(request.offset) };
    }
    case 'readlink':
      return { error: ENOSYS };
    default:
      // Every mutating operation, and anything this probe does not model, is refused rather than guessed at.
      return { error: EROFS };
  }
};

let mount;
const serve = (request) => {
  // `lifetime` and `interrupt` carry no reply; a lifetime batch is accounting this probe simply discards.
  if (request.operation === 'lifetime' || request.operation === 'interrupt') return;
  try {
    binding.reply(mount, request.id, answer(request));
  } catch (error) {
    process.stderr.write(`PROBE-REPLY-ERROR: ${request.operation}: ${error?.message ?? error}\n`);
    binding.reply(mount, request.id, { error: EROFS });
  }
};

try {
  mount = binding.mount(realpathSync(mountpoint), serve, () => {
    process.stderr.write('PROBE-MOUNT-FAILED: the bridge reported the mount failed while serving.\n');
    process.exitCode = 1;
  });
} catch (error) {
  // libfuse and fusermount3 write the actual cause to this process's stderr; the thrown message is generic.
  process.stderr.write(`PROBE-MOUNT-ERROR: ${error?.message ?? error}\n`);
  process.exit(1);
}

process.stdout.write(`PROBE-MOUNTED: ${mountpoint}\n`);
// Keep the event loop alive for the threadsafe callback; the caller stops this process when it is done reading.
const held = setInterval(() => {}, 1000);
const shutdown = () => {
  clearInterval(held);
  try {
    binding.close(mount);
  } catch (error) {
    process.stderr.write(`PROBE-CLOSE-ERROR: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
  process.stdout.write('PROBE-UNMOUNTED\n');
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
