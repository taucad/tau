import type { BundlerFileSystem } from '#package-artifact-cache.js';

export const createTestFileSystem = (initial: Readonly<Record<string, string>> = {}): BundlerFileSystem => {
  const files = new Map(Object.entries(initial));
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const readFile = (async (path: string, encoding?: 'utf8') => {
    const value = files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? value : encoder.encode(value);
  }) as BundlerFileSystem['readFile'];

  return {
    exists: async (path: string) => files.has(path),
    readFile,
    writeFile: async (path: string, data: string | Uint8Array<ArrayBuffer>) => {
      files.set(path, typeof data === 'string' ? data : decoder.decode(data));
    },
    ensureDir: async () => undefined,
  };
};
