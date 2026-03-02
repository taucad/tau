import type { KernelFileSystem } from '@taucad/kernels';
import type { RpcFileSystem } from '@taucad/chat/rpc';

/**
 * Adapts a KernelFileSystem (e.g. fromMemoryFS()) to the RpcFileSystem interface.
 */
export function createHeadlessRpcFileSystem(fs: KernelFileSystem): RpcFileSystem {
  return {
    async readFile(path: string): Promise<string> {
      return fs.readFile(path, 'utf8');
    },
    async writeFile(path: string, content: string): Promise<void> {
      await fs.writeFile(path, content);
    },
    async writeBinaryFile(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
      await fs.writeFile(path, new Uint8Array(data.buffer));
    },
    async deleteFile(path: string): Promise<void> {
      await fs.unlink(path);
    },
    async readdir(path: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
      const names = await fs.readdir(path);
      const entries: Array<{ name: string; type: 'file' | 'directory'; size: number }> = [];

      for (const name of names) {
        const fullPath = path ? `${path}/${name}` : name;
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential stat calls
          const info = await fs.stat(fullPath);
          entries.push({
            name,
            type: info.type === 'dir' ? 'directory' : 'file',
            size: info.size,
          });
        } catch {
          entries.push({ name, type: 'file', size: 0 });
        }
      }

      return entries;
    },
    async exists(path: string): Promise<boolean> {
      return fs.exists(path);
    },
  };
}
