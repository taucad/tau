// @vitest-environment node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createGenerator } from 'fumadocs-typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsApiDirectory = path.resolve(__dirname, '../../../content/docs/runtime/api');

const generator = createGenerator({
  tsconfigPath: path.resolve(__dirname, '../../../../../tsconfig.docs.json'),
  /*
   * Bypass on-disk cache: the cache key is keyed on the props-file path/name/content
   * (not the underlying type source), so a fresh runtime-source edit would otherwise
   * be masked by a stale cache hit and let regressions slip through this guard.
   */
  cache: false,
});

type AutoTypeTableInvocation = {
  mdxFile: string;
  propsPath: string;
  name: string;
};

const matcher = /<auto-type-table\s+path=(["'])(?<path>[^"']+)\1\s+name=(["'])(?<name>[^"']+)\3/g;

const collectAutoTypeTableInvocations = async (): Promise<AutoTypeTableInvocation[]> => {
  const entries = await readdir(docsApiDirectory);
  const mdxFiles = entries.filter((file) => file.endsWith('.mdx'));
  const perFile = await Promise.all(
    mdxFiles.map(async (mdxFile) => {
      const content = await readFile(path.join(docsApiDirectory, mdxFile), 'utf8');
      return [...content.matchAll(matcher)].map((match) => ({
        mdxFile,
        propsPath: path.resolve(docsApiDirectory, match.groups!['path']!),
        name: match.groups!['name']!,
      }));
    }),
  );
  return perFile.flat();
};

const collectLeaksAndErrors = async (
  invocations: AutoTypeTableInvocation[],
): Promise<{
  leaks: Array<{ source: string; entry: string }>;
  errors: Array<{ source: string; error: string }>;
}> => {
  const results = await Promise.all(
    invocations.map(async ({ mdxFile, propsPath, name }) => {
      const source = `${mdxFile} → ${name}`;
      try {
        const documents = await generator.generateTypeTable({
          path: propsPath,
          name,
        });
        const leaks = documents
          .flatMap((document) => document.entries)
          .filter((entry) => entry.name.includes('@'))
          .map((entry) => ({ source, entry: entry.name }));
        return { leaks, error: undefined };
      } catch (error) {
        return {
          leaks: [],
          error: {
            source,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );
  return {
    leaks: results.flatMap((result) => result.leaks),
    errors: results.flatMap((result) => (result.error ? [result.error] : [])),
  };
};

/*
 * Regression net for the `unique symbol` brand leak that broke
 * `pnpm nx dev ui` with a JSX parse failure when fumadocs expanded
 * the opaque `RuntimeFileSystem` brand into its symbol-keyed property
 * (rendered as `__@___runtimeFileSystemBrand@1090` — the literal `@`
 * characters break rolldown's parser).
 *
 * Every brand member added to a publicly exported type must be marked
 * `@internal` so fumadocs-typescript filters it out before serialization
 * (`fumadocs-typescript` v5+ resolves `@internal` without a transform shim).
 */
describe('auto-type-table brand safety', () => {
  // Ts-morph project boot + ~30 type-table introspections without cache.
  it('does not leak unique-symbol brand keys into generated entry names', { timeout: 60_000 }, async () => {
    const invocations = await collectAutoTypeTableInvocations();
    expect(invocations.length, 'expected to find <auto-type-table> usages').toBeGreaterThan(0);

    const { leaks, errors } = await collectLeaksAndErrors(invocations);
    expect({ leaks, errors }).toEqual({ leaks: [], errors: [] });
  });
});
