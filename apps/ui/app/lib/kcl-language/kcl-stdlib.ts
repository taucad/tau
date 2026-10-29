import type { kclStdlibExport } from '@taucad/api-extractor/kcl-stdlib';
import type { KclParameter } from '#lib/kcl-language/kcl-bindings.js';

type KclStdlibExport = typeof kclStdlibExport;

/** A standard library declaration at its line in the generated, read-only module source. */
export type KclStdlibEntry = Readonly<{
  name: string;
  /** Qualified module, such as `std::sketch`. */
  module: string;
  kind: 'function' | 'constant' | 'type';
  line: number;
  column: number;
  parameters?: readonly KclParameter[];
  returnType?: string;
}>;

/**
 * The KCL standard library as read-only declaration sources. The WASM server exposes neither its
 * module sources nor go-to-definition, so this is built from the vendored stdlib export, which
 * carries the same signatures and doc comments the hover shows.
 */
export type KclStdlib = Readonly<{
  version: string;
  source(module: string): string | undefined;
  /** A function or constant, by name alone or within one module. */
  lookup(name: string, module?: string): KclStdlibEntry | undefined;
  lookupType(name: string): KclStdlibEntry | undefined;
  hasModule(module: string): boolean;
}>;

function moduleOf(qualifiedName: string): string {
  return qualifiedName.split('::').slice(0, -1).join('::') || 'std';
}

function documentationComment(...parts: ReadonlyArray<string | undefined>): string[] {
  const text = parts.filter((part): part is string => Boolean(part?.trim())).join('\n\n');
  return text ? text.split('\n').map((line) => (line ? `/// ${line}` : '///')) : [];
}

/** Lay out each module as KCL source, recording where every declaration lands. */
export function buildKclStdlib(exported: KclStdlibExport): KclStdlib {
  const modules = new Map<string, string[]>();
  const entries: KclStdlibEntry[] = [];
  const lines = (module: string): string[] => {
    let existing = modules.get(module);
    if (!existing) {
      const summary = exported.modules.find((candidate) => candidate.qual_name === module)?.summary;
      existing = [`// ${module}: KCL standard library ${exported.metadata.version} (read-only)`, ''];
      existing.push(...documentationComment(summary));
      if (summary) {
        existing.push('');
      }
      modules.set(module, existing);
    }
    return existing;
  };
  const declare = (
    entry: Omit<KclStdlibEntry, 'line' | 'column'>,
    text: Readonly<{
      documentation: readonly string[];
      prefix: string;
      declaration: string;
    }>,
  ): void => {
    const target = lines(entry.module);
    target.push(...text.documentation);
    entries.push({
      ...entry,
      line: target.length + 1,
      column: text.prefix.length + 1,
    });
    target.push(...`${text.prefix}${text.declaration}`.split('\n'), '');
  };
  for (const type of exported.types) {
    const module = moduleOf(type.qual_name);
    declare(
      { name: type.name, module, kind: 'type' },
      {
        documentation: documentationComment(type.summary, type.description),
        prefix: 'export type ',
        declaration: type.definition?.replace(/^type /u, '') ?? type.name,
      },
    );
  }
  for (const constant of exported.constants) {
    const module = moduleOf(constant.qual_name);
    const type = constant.type_ ? `: ${constant.type_}` : '';
    const value = constant.value ? ` = ${constant.value}` : '';
    declare(
      { name: constant.name, module, kind: 'constant' },
      {
        documentation: documentationComment(constant.summary, constant.description),
        prefix: 'export ',
        declaration: `${constant.name}${type}${value}`,
      },
    );
  }
  for (const definition of exported.functions) {
    declare(
      {
        name: definition.name,
        module: definition.module,
        kind: 'function',
        returnType: definition.return_value?.type_,
        parameters: definition.args.map((argument) => ({
          name: argument.name,
          labeled: !definition.fn_signature.includes(`@${argument.name}`),
          optional: !argument.required,
          type: argument.type_,
        })),
      },
      {
        documentation: documentationComment(definition.summary, definition.description),
        prefix: 'export fn ',
        declaration: definition.fn_signature,
      },
    );
  }
  const sources = new Map([...modules].map(([module, text]) => [module, text.join('\n')]));
  return {
    version: exported.metadata.version,
    source: (module) => sources.get(module),
    hasModule: (module) => sources.has(module),
    lookup(name, module) {
      const candidates = entries.filter((entry) => entry.kind !== 'type' && entry.name === name);
      return module === undefined ? candidates[0] : candidates.find((entry) => entry.module === module);
    },
    lookupType: (name) => entries.find((entry) => entry.kind === 'type' && entry.name === name),
  };
}

let loading: Promise<KclStdlib> | undefined;

/** Load the standard library declarations once, on first use, outside the editor's startup chunk. */
export async function loadKclStdlib(): Promise<KclStdlib> {
  loading ??= (async (): Promise<KclStdlib> => {
    try {
      const { kclStdlibExport } = await import('@taucad/api-extractor/kcl-stdlib');
      return buildKclStdlib(kclStdlibExport);
    } catch (error) {
      // A failed chunk load is retried on the next request instead of being cached.
      loading = undefined;
      throw error;
    }
  })();
  return loading;
}
