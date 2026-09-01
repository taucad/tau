import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const docsContentRoot = path.resolve(import.meta.dirname, '../../../content/docs');

const listMdxFiles = async (directory: string, relativeDirectory = ''): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return listMdxFiles(absolutePath, relativePath);
      }
      if (entry.isFile() && entry.name.endsWith('.mdx')) {
        return [relativePath];
      }
      return [];
    }),
  );

  return files.flat();
};

describe('docs content imports', () => {
  it('does not import app alias modules from MDX content', async () => {
    const mdxFiles = await listMdxFiles(docsContentRoot);
    const appAliasImports: string[] = [];

    await Promise.all(
      mdxFiles.map(async (mdxFile) => {
        const content = await readFile(path.join(docsContentRoot, mdxFile), 'utf8');
        const matches = content.matchAll(/^\s*import\s.+?\sfrom\s+['"]#[^'"]+['"];?\s*$/gmu);

        for (const match of matches) {
          appAliasImports.push(`${mdxFile}: ${match[0].trim()}`);
        }
      }),
    );

    expect(appAliasImports).toEqual([]);
  });
});
