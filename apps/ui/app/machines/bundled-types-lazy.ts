/** Reads of the derived dependency mount wait for its first complete installation. */
const readMethods = new Set([
  'readFile',
  'readdir',
  'readdirEntries',
  'readdirWithStats',
  'stat',
  'lstat',
  'exists',
  'getFileMode',
  'search',
  'statTree',
  'pendingPaths',
  'provenance',
  'archive',
  'contents',
]);

/** The mount root before the first installation creates its backing directory. */
const emptyRoot = Object.freeze({ type: 'dir', size: 0, mtimeMs: 0 });

const isMissing = (error: unknown): boolean => (error as { readonly code?: unknown } | undefined)?.code === 'ENOENT';

/** Share one installation across every rooted dependency connection. */
export function createLazyBundledTypesReads(install: () => Promise<void>) {
  let installed: Promise<void> | undefined;
  const ready = async (): Promise<void> => {
    installed ??= (async () => {
      try {
        await install();
      } catch (error) {
        installed = undefined;
        throw error;
      }
    })();
    await installed;
  };
  // oxlint-disable-next-line typescript/no-restricted-types -- A Proxy accepts any object surface, including a provider without an index signature.
  return <T extends object>(surface: T): T =>
    new Proxy(surface, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (typeof property !== 'string' || !readMethods.has(property) || typeof value !== 'function') {
          return value;
        }
        return async (...args: unknown[]): Promise<unknown> => {
          const read = async (): Promise<unknown> => (value as (...inputs: unknown[]) => unknown).apply(target, args);
          if (property !== 'stat' || args[0] !== '') {
            await ready();
            return read();
          }
          // The file manager probes the mounted root for its tree row during startup.
          // The mount exists before declarations are installed, but its backing directory
          // is created by the first installation, so until then the root is an empty directory.
          try {
            return await read();
          } catch (error) {
            if (isMissing(error)) {
              return emptyRoot;
            }
            throw error;
          }
        };
      },
    });
}
