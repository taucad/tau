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
  'provenance',
  'archive',
  'contents',
]);

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
          // The file manager probes the mounted root for its tree row during startup.
          // Its existence is known before declarations are installed.
          if (property !== 'stat' || args[0] !== '') {
            await ready();
          }
          return (value as (...inputs: unknown[]) => unknown).apply(target, args);
        };
      },
    });
}
