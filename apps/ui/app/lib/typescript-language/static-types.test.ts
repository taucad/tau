import { describe, expect, it, vi } from 'vitest';
import { readStaticTypePackage } from '#lib/typescript-language/static-types.js';

describe('readStaticTypePackage', () => {
  it('retains nested and scoped declaration paths plus the package manifest from the composed mount', async () => {
    const files = new Map([
      ['/node_modules/@taucad/geo/package.json', '{"name":"@taucad/geo","types":"dist/main.d.ts"}'],
      ['/node_modules/@taucad/geo/dist/main.d.ts', 'export declare const shape: object;'],
      ['/node_modules/@taucad/geo/dist/extra.d.ts', 'export declare const extra: number;'],
    ]);
    async function readFile(path: string, options: 'utf8'): Promise<string>;
    async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    async function readFile(path: string, options?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const content = files.get(path) ?? '';
      return options === 'utf8' ? content : new TextEncoder().encode(content);
    }
    const reader = {
      readdir: vi.fn(async (path: string) => {
        if (path === '/node_modules/@taucad/geo') {
          return ['dist', 'package.json'];
        }
        return path.endsWith('/dist') ? ['main.d.ts', 'extra.d.ts'] : [];
      }),
      readFile,
    };
    const definitions = await readStaticTypePackage(reader, '@taucad/geo');
    expect(definitions).toEqual([
      {
        packageName: '@taucad/geo',
        filePath: 'file:///node_modules/@taucad/geo/dist/main.d.ts',
        content: 'export declare const shape: object;',
        packageJsonContent: '{"name":"@taucad/geo","types":"dist/main.d.ts"}',
      },
      {
        packageName: '@taucad/geo',
        filePath: 'file:///node_modules/@taucad/geo/dist/extra.d.ts',
        content: 'export declare const extra: number;',
        packageJsonContent: '{"name":"@taucad/geo","types":"dist/main.d.ts"}',
      },
    ]);
  });

  it('rejects names that could escape the dependency mount', async () => {
    const reader = { readdir: vi.fn(), readFile: vi.fn() };
    expect(await readStaticTypePackage(reader, '../outside')).toEqual([]);
    expect(reader.readdir).not.toHaveBeenCalled();
  });
});
