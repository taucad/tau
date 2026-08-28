import { init, parse } from 'es-module-lexer';

/** Compiler-neutral source kinds understood by Tau bundler adapters. @public */
export type BundlerSourceIntent = 'script' | 'json' | 'text' | 'binary' | 'base64' | 'dataurl' | 'file';

const queryIntents = new Map<string, BundlerSourceIntent>([
  ['?raw', 'text'],
  ['?text', 'text'],
  ['?binary', 'binary'],
  ['?base64', 'base64'],
  ['?dataurl', 'dataurl'],
  ['?file', 'file'],
]);

/**
 * Split a supported Tau asset suffix from an import specifier.
 * @param specifier - Raw module specifier.
 * @returns Clean specifier plus canonical suffix and intent.
 * @public
 */
export const splitAssetSpecifier = (
  specifier: string,
): {
  specifier: string;
  suffix: string;
  intent?: BundlerSourceIntent;
} => {
  for (const [suffix, intent] of queryIntents) {
    if (specifier.endsWith(suffix)) {
      return { specifier: specifier.slice(0, -suffix.length), suffix, intent };
    }
  }
  return { specifier, suffix: '' };
};

/**
 * Resolve query or import-attribute asset intent without compiler-specific loader names.
 * @param suffix - Canonical query suffix, if any.
 * @param attributes - Static import attributes supplied by the compiler.
 * @returns Compiler-neutral asset intent.
 * @public
 */
export const resolveAssetIntent = (
  suffix: string,
  attributes?: Readonly<Record<string, string>>,
): BundlerSourceIntent | undefined => {
  const queryIntent = queryIntents.get(suffix);
  if (queryIntent !== undefined) {
    return queryIntent;
  }
  if (attributes?.['type'] === 'text') {
    return 'text';
  }
  if (attributes?.['type'] === 'bytes') {
    return 'binary';
  }
  return undefined;
};

/** One static import-attribute rewrite performed for Rolldown compatibility. @public */
export type AssetImportAttributeRewrite = {
  readonly specifier: string;
  readonly suffix: '?text' | '?binary';
  readonly statementStart: number;
  readonly statementEnd: number;
};

/** Result of normalizing supported static asset import attributes. @public */
export type NormalizedAssetImports = {
  readonly code: string;
  readonly rewrites: readonly AssetImportAttributeRewrite[];
};

/**
 * Rewrite static `with { type: 'text' | 'bytes' }` imports to Tau asset suffixes.
 * Statement length and newline positions are preserved so compiler diagnostics stay aligned.
 * Unsupported or compound attributes are left for the compiler to diagnose.
 *
 * @param source - Module source to normalize.
 * @returns Source plus applied rewrites.
 * @public
 */
export const normalizeAssetImportAttributes = async (source: string): Promise<NormalizedAssetImports> => {
  await init;
  const [imports] = parse(source);
  const rewrites: AssetImportAttributeRewrite[] = [];
  let code = source;

  for (const record of imports.toReversed()) {
    if (record.d !== -1 || record.a === -1 || record.at?.length !== 1) {
      continue;
    }
    const [attribute] = record.at;
    if (attribute?.[0] !== 'type' || (attribute[1] !== 'text' && attribute[1] !== 'bytes')) {
      continue;
    }

    const suffix = attribute[1] === 'text' ? '?text' : '?binary';
    const statement = source.slice(record.ss, record.se);
    const quote = source[record.e];
    if ((quote !== "'" && quote !== '"') || record.n === undefined) {
      continue;
    }
    const terminal = statement.trimEnd().endsWith(';') ? ';' : '';
    const replacementStart = source.slice(record.ss, record.s);
    const fixed = `${replacementStart}${record.n}${suffix}${quote}`;
    const padding = statement.length - fixed.length - terminal.length;
    if (padding < 0) {
      continue;
    }

    const replacement = `${fixed}${' '.repeat(padding)}${terminal}`;
    code = `${code.slice(0, record.ss)}${replacement}${code.slice(record.se)}`;
    rewrites.unshift({ specifier: record.n, suffix, statementStart: record.ss, statementEnd: record.se });
  }

  return { code, rewrites };
};
