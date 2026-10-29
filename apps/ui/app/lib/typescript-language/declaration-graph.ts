export type DeclarationImport = { name: string; from: number; to: number; reference?: 'path' | 'types' };

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
    if (visiting.size >= 128) {
      throw new Error('Declaration graph exceeds 128 files');
    }
    visiting.add(url);
    let text = await read(url);
    totalCharacters += text.length;
    if (text.length > 2_000_000 || totalCharacters > 16_000_000) {
      throw new Error('Declaration file exceeds size limit');
    }
    const references = await imports(text);
    if (references.length > 128) {
      throw new Error('Declaration file exceeds 128 references');
    }
    const edits = await Promise.all(
      references.map(async (item) => {
        const target = await resolve(item.name, url, item.reference);
        return { ...item, target };
      }),
    );
    // Discover siblings in order: a shared visiting set terminates cyclic declaration imports.
    for (const item of edits) {
      if (item.target) {
        // oxlint-disable-next-line no-await-in-loop -- graph cycle detection and admission bounds are shared.
        await visit(item.target);
      }
    }
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
