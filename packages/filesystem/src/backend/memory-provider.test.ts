import { describe, it, expect } from 'vitest';
import { createMemoryProvider } from '#backend/memory-provider.js';

describe('createMemoryProvider', () => {
  it('should return a provider with id "memory"', async () => {
    const provider = await createMemoryProvider();
    expect(provider.id).toBe('memory');
  });

  it('should have correct capabilities', async () => {
    const provider = await createMemoryProvider();
    expect(provider.capabilities).toEqual({
      persistent: false,
      writable: true,
      quotaBased: false,
    });
  });

  it('should support basic write and read operations', async () => {
    const provider = await createMemoryProvider();
    await provider.writeFile('/test.txt', 'hello memory');
    const content = await provider.readFile('/test.txt', 'utf8');
    expect(content).toBe('hello memory');
  });

  it('should create an independent provider per factory call', async () => {
    const a = await createMemoryProvider();
    const b = await createMemoryProvider();
    await a.writeFile('/only-in-a.txt', 'a');
    expect(await a.exists('/only-in-a.txt')).toBe(true);
    expect(await b.exists('/only-in-a.txt')).toBe(false);
  });

  it('should throw ENOTEMPTY when rmdir is called on a non-empty directory', async () => {
    const provider = await createMemoryProvider();
    await provider.mkdir('/parent');
    await provider.writeFile('/parent/child.txt', 'data');

    await expect(provider.rmdir('/parent')).rejects.toThrow('ENOTEMPTY');
  });

  it('should succeed when rmdir is called on an empty directory', async () => {
    const provider = await createMemoryProvider();
    await provider.mkdir('/empty-dir');

    await expect(provider.rmdir('/empty-dir')).resolves.toBeUndefined();
    expect(await provider.exists('/empty-dir')).toBe(false);
  });

  it('should rename a directory and move every contained file under the new prefix', async () => {
    const provider = await createMemoryProvider();
    await provider.mkdir('/src/utils', { recursive: true });
    await provider.writeFile('/src/index.ts', 'export {}');
    await provider.writeFile('/src/utils/helpers.ts', 'export {}');
    await provider.writeFile('/src/utils/strings.ts', 'export {}');

    await provider.rename('/src', '/lib');

    expect(await provider.exists('/src')).toBe(false);
    expect(await provider.exists('/src/index.ts')).toBe(false);
    expect(await provider.exists('/lib')).toBe(true);
    expect(await provider.exists('/lib/index.ts')).toBe(true);
    expect(await provider.exists('/lib/utils/helpers.ts')).toBe(true);
    expect(await provider.exists('/lib/utils/strings.ts')).toBe(true);
  });

  it('should return entries with stats from readdirWithStats', async () => {
    const provider = await createMemoryProvider();
    await provider.mkdir('/src');
    await provider.writeFile('/src/index.ts', 'export {}');
    await provider.mkdir('/src/utils');

    const entries = await provider.readdirWithStats('/src');
    expect(entries).toHaveLength(2);

    const fileEntry = entries.find((entry) => entry.name === 'index.ts');
    const directoryEntry = entries.find((entry) => entry.name === 'utils');

    expect(fileEntry).toBeDefined();
    expect(fileEntry!.type).toBe('file');
    expect(fileEntry!.size).toBeGreaterThan(0);

    expect(directoryEntry).toBeDefined();
    expect(directoryEntry!.type).toBe('dir');
  });
});
