export type DeclarationImport = { name: string; from: number; to: number; reference?: 'path' | 'types' };

/**
 * Most files in one graph, and most references from one file. A package whose index re-exports each
 * module from its own file needs hundreds: on esm.sh, `lodash-es` with `@types/lodash` is 318 files from
 * a 304-reference index, `date-fns` 258 from 246, `@types/three` 416. The size limits bound memory.
 */
const maxDeclarationFiles = 1024;

/** Load a bounded declaration graph before publishing any of its files. */
export async function loadDeclarationGraph({
  entry,
  imports,
  read,
  resolve,
}: {
  entry: string;
  imports: (text: string) => Promise<DeclarationImport[]>;
  read: (url: string) => Promise<string>;
  resolve: (specifier: string, parent: string, reference?: 'path' | 'types') => Promise<string | undefined>;
}): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const visiting = new Set<string>();
  let totalCharacters = 0;
  const visit = async (url: string): Promise<void> => {
    if (visiting.has(url)) {
      return;
    }
    if (visiting.size >= maxDeclarationFiles) {
      throw new Error(`Declaration graph exceeds ${maxDeclarationFiles} files`);
    }
    visiting.add(url);
    let text = await read(url);
    totalCharacters += text.length;
    if (text.length > 2_000_000 || totalCharacters > 16_000_000) {
      throw new Error('Declaration file exceeds size limit');
    }
    const references = await imports(text);
    if (references.length > maxDeclarationFiles) {
      throw new Error(`Declaration file exceeds ${maxDeclarationFiles} references`);
    }
    const edits = await Promise.all(
      references.map(async (item) => {
        const target = await resolve(item.name, url, item.reference);
        return { ...item, target };
      }),
    );
    // Siblings load together; the caller's `read` bounds the network. A URL joins the shared visiting set
    // before its first await, so cyclic declaration imports still terminate.
    await Promise.all(edits.map(async (item) => (item.target ? visit(item.target) : undefined)));
    for (const item of edits.toSorted((a, b) => b.from - a.from)) {
      if (!item.target) {
        continue;
      }
      const path = declarationPath(item.target);
      const replacement = item.reference ? path : path.replace(/\.d\.(?:ts|mts|cts)$/u, '');
      text = text.slice(0, item.from) + replacement + text.slice(item.to);
      if (item.reference === 'types') {
        const prefix = text.slice(0, item.from);
        text = prefix.replace(/types(\s*=\s*["'])$/u, 'path$1') + text.slice(item.from);
      }
    }
    files.set(declarationPath(url), text);
  };
  await visit(entry);
  return files;
}

/** Stable virtual identity for one fetched declaration URL, including its version and query. */
export function declarationPath(url: string): string {
  return `/node_modules/.tau-types/${[...new TextEncoder().encode(url)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}/index.d.ts`;
}
