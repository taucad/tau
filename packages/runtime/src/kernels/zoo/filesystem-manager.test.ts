import { describe, it, expect } from 'vitest';
import { createMockFileSystem } from '#testing/kernel-testing.utils.js';
import { FileSystemManager } from '#kernels/zoo/filesystem-manager.js';

describe('FileSystemManager', () => {
  it('should resolve relative path and delegate readFile to filesystem', async () => {
    const filesystem = createMockFileSystem();
    const data = new Uint8Array([1, 2, 3]);
    filesystem.mocks.readFile.mockResolvedValue(data);

    const manager = new FileSystemManager(filesystem);
    const result = await manager.readFile('src/main.kcl');

    expect(filesystem.mocks.readFile.mock.calls[0]![0]).toBe('/src/main.kcl');
    expect(result).toBe(data);
  });

  it('should resolve relative path and delegate exists to filesystem', async () => {
    const filesystem = createMockFileSystem();
    filesystem.mocks.exists.mockResolvedValue(true);

    const manager = new FileSystemManager(filesystem);
    const result = await manager.exists('lib/utils.kcl');

    expect(filesystem.mocks.exists.mock.calls[0]![0]).toBe('/lib/utils.kcl');
    expect(result).toBe(true);
  });

  it('should resolve relative path and delegate getAllFiles to filesystem', async () => {
    const filesystem = createMockFileSystem();
    filesystem.mocks.readdir.mockResolvedValue(['a.kcl', 'b.kcl']);

    const manager = new FileSystemManager(filesystem);
    const result = await manager.getAllFiles('src');

    expect(filesystem.mocks.readdir.mock.calls[0]![0]).toBe('/src');
    expect(result).toBe(JSON.stringify(['a.kcl', 'b.kcl']));
  });

  it('should reject getAllFiles when readdir returns multi-segment paths', async () => {
    const filesystem = createMockFileSystem();
    filesystem.mocks.readdir.mockResolvedValue(['bottle/main.kcl']);

    const manager = new FileSystemManager(filesystem);

    await expect(manager.getAllFiles('')).rejects.toThrow(/single-segment/);
  });
});
