import type { DeclarationImport } from '#lib/typescript-language/declaration-graph.js';
import { loadDeclarationGraph, declarationPath } from '#lib/typescript-language/declaration-graph.js';

type Imports = (text: string) => Promise<DeclarationImport[]>;

function typeTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => typeTarget(entry)).find((target) => target !== undefined);
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  for (const condition of ['types', 'import', 'default', 'require']) {
    if (condition in value) {
      const target = typeTarget(Reflect.get(value, condition));
      if (target) {
        return target;
      }
    }
  }
  return undefined;
}

/** Resolve the requested declaration export without substituting an unrelated package root. */
export function declarationEntry(manifest: Record<string, unknown>, subpath: string): string | undefined {
  const { exports } = manifest;
  if (exports !== undefined) {
    if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
      const key = subpath ? `.${subpath}` : '.';
      const exact: unknown = Reflect.get(exports, key);
      if (exact !== undefined) {
        return typeTarget(exact);
      }
      for (const pattern of Object.keys(exports)
        .filter((key) => key.includes('*'))
        .sort((a, b) => b.length - a.length)) {
        const [prefix, suffix = ''] = pattern.split('*');
        if (prefix && key.startsWith(prefix) && key.endsWith(suffix)) {
          return typeTarget(Reflect.get(exports, pattern))?.replace(
            '*',
            key.slice(prefix.length, key.length - suffix.length),
          );
        }
      }
      if (Object.keys(exports).some((key) => key.startsWith('.'))) {
        return undefined;
      }
    }
    return subpath ? undefined : typeTarget(exports);
  }
  return subpath ? `.${subpath}` : (typeTarget(manifest['types'] ?? manifest['typings']) ?? './index.d.ts');
}

/** Preserve the complete installed declaration graph selected by the lockfile and package exports. */
export async function installedDeclarations({
  packageName,
  subpath,
  manifest,
  read,
  imports,
}: {
  packageName: string;
  subpath: string;
  manifest: Record<string, unknown>;
  read: (path: string) => Promise<string | undefined>;
  imports: Imports;
}): Promise<{ uri: string; files: Map<string, string> } | undefined> {
  const target = declarationEntry(manifest, subpath);
  if (!target) {
    return undefined;
  }
  const cache = new Map<string, string>();
  const resolve = async (name: string, parent: string, reference?: 'path' | 'types'): Promise<string | undefined> => {
    if (reference === 'types') {
      return undefined;
    }
    if (reference === 'path' && !name.startsWith('/')) {
      name = `./${name}`;
    }
    if (!name.startsWith('.') && !name.startsWith('/')) {
      return undefined;
    }
    const url = new URL(name, parent);
    if (url.protocol !== 'file:' || !url.pathname.startsWith(`/node_modules/${packageName}/`)) {
      throw new Error('Declaration path escapes installed package');
    }
    const base = url.pathname;
    const paths = /\.d\.(?:ts|mts|cts)$/u.test(base)
      ? [base]
      : [
          base
            .replace(/\.(?:mjs|mts)$/u, '.d.mts')
            .replace(/\.(?:cjs|cts)$/u, '.d.cts')
            .replace(/\.(?:js|ts)$/u, '.d.ts'),
          `${base}.d.ts`,
          `${base}/index.d.ts`,
        ];
    for (const path of new Set(paths)) {
      // oxlint-disable-next-line no-await-in-loop -- respect TypeScript declaration suffix preference.
      const text = await read(path.slice(1));
      if (text !== undefined) {
        const key = `file://${path}`;
        cache.set(key, text);
        return key;
      }
    }
    throw new Error(`Missing installed declaration: ${base}`);
  };
  const entry = await resolve(
    target.startsWith('.') ? target : `./${target}`,
    `file:///node_modules/${packageName}/package.json`,
  );
  if (!entry) {
    return undefined;
  }
  const files = await loadDeclarationGraph({
    entry,
    imports,
    read: async (url) => cache.get(url)!,
    resolve,
  });
  return { uri: `file://${declarationPath(entry)}`, files };
}
