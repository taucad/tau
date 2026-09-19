/**
 * OpenSCAD front-end: the OpenRSCAD LSP `BUILTINS` table as an {@link ApiCorpus}.
 *
 * The one permitted source is `repos/openrscad/crates/openrscad-lsp/src/builtins.rs`,
 * which is reconstructed from public OpenSCAD documentation and scoped to what
 * the OpenRSCAD engine implements. `apps/ui/app/lib/openscad-language/openscad-builtins.ts`
 * is Google LLC GPL2+ and must never be read, copied or derived from here.
 *
 * `repos/openrscad` is an optional checkout, so generation parses the table and
 * writes `src/generated/openscad/openscad-corpus.json`; consumers read that
 * committed corpus and never need the checkout.
 *
 * Regenerate with `tsx src/languages/openscad/extract.ts` from `libs/api-extractor`.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApiCorpus } from '#model/api-corpus.js';
import type { ApiEntryDraft } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntryKind, ApiParameter } from '#model/api-corpus.types.js';

/** One row of the `BUILTINS` table. @internal */
export type OpenscadBuiltin = {
  readonly name: string;
  /** `true` for statement-level modules (`cube(...)`), `false` for expression-level functions. */
  readonly isModule: boolean;
  /** The one-line signature the table carries, e.g. `cube(size, center=false)`. */
  readonly signature: string;
  readonly doc: string;
  /** The `// ---- 3D primitives ----` section the row sits under. */
  readonly category?: string;
  /** 1-based line of the row in `builtins.rs`. */
  readonly line: number;
};

/** Names the engine dispatches but the table omits, and the reverse. @internal */
export type OpenscadDivergence = {
  /** Declared in `BUILTINS`, dispatched by neither `dispatch_module` nor `builtin_fn`. */
  readonly tableOnly: readonly string[];
  /** Dispatched by the engine, absent from `BUILTINS`. */
  readonly implementationOnly: readonly string[];
};

const builtinsSourcePath = 'crates/openrscad-lsp/src/builtins.rs';

/**
 * A `b!` row, or a section comment. Section comments carry the category for the
 * rows that follow, so both are matched in one pass to keep source order.
 */
const rustString = String.raw`"((?:[^"\\]|\\.)*)"`;
const tableToken = new RegExp(
  String.raw`\/\/\s*-{4}\s*(?<category>[^\n]*?)\s*-{4}|b!\(\s*(?<name>${rustString})\s*,\s*(?<kind>module|function)\s*,\s*(?<signature>${rustString})\s*,\s*(?<doc>${rustString})\s*,?\s*\)`,
  'gu',
);

/** A Rust string literal's value: the table escapes `\"` inside signatures such as `color(c | \"name\", alpha=1)`. */
const rustStringValue = (literal: string | undefined): string =>
  (literal ?? '').slice(1, -1).replaceAll(/\\(?<escaped>.)/gu, '$<escaped>');

/**
 * Read the `BUILTINS` table out of `builtins.rs`.
 *
 * @param source - Contents of `crates/openrscad-lsp/src/builtins.rs`.
 * @returns Every row in declaration order.
 * @throws When no row parses, which means the upstream macro shape changed.
 * @internal
 */
export const parseBuiltins = (source: string): OpenscadBuiltin[] => {
  const builtins: OpenscadBuiltin[] = [];
  let category: string | undefined;

  for (const match of source.matchAll(tableToken)) {
    const { category: section, name, kind, signature, doc } = match.groups ?? {};
    if (section !== undefined) {
      category = section;
      continue;
    }

    builtins.push({
      name: rustStringValue(name),
      isModule: kind === 'module',
      signature: rustStringValue(signature),
      doc: rustStringValue(doc),
      ...(category === undefined ? {} : { category }),
      line: source.slice(0, match.index).split('\n').length,
    });
  }

  if (builtins.length === 0) {
    throw new Error(`No BUILTINS rows parsed from ${builtinsSourcePath}; the b! macro shape changed upstream`);
  }

  return builtins;
};

/** Split on commas that are not inside brackets. */
const splitArguments = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '[' || character === '(') {
      depth += 1;
    } else if (character === ']' || character === ')') {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
};

/**
 * Parameters of a one-line table signature.
 *
 * ponytail: the table writes alternatives as `r | d` and OpenSCAD has no
 * parameter types, so an alternative stays one parameter under its source
 * spelling. `ApiSignature.text` is the display authority; upgrade this only if
 * a consumer needs to address `r` and `d` separately.
 */
const parseParameters = (signature: string): ApiParameter[] => {
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  if (open === -1 || close < open) {
    return [];
  }

  return splitArguments(signature.slice(open + 1, close)).map((part) => {
    if (part === '...') {
      return { name: '...', optional: true, variadic: true };
    }

    const equals = part.indexOf('=');
    if (equals === -1) {
      return { name: part, optional: part.startsWith('$') };
    }

    return { name: part.slice(0, equals).trim(), optional: true, defaultValue: part.slice(equals + 1).trim() };
  });
};

/**
 * OpenSCAD's special variables are listed in the table as functions so the LSP
 * offers them as completions, but they are values: `$fn` is read, never called.
 */
const kindOf = (builtin: OpenscadBuiltin): ApiEntryKind => {
  if (builtin.isModule) {
    return 'module';
  }

  return builtin.name.startsWith('$') ? 'constant' : 'function';
};

const builtinDraft = (builtin: OpenscadBuiltin): ApiEntryDraft => {
  const kind = kindOf(builtin);

  return {
    name: builtin.name,
    kind,
    ...(builtin.category === undefined ? {} : { category: builtin.category }),
    ...(kind === 'constant'
      ? {}
      : { signatures: [{ parameters: parseParameters(builtin.signature), text: builtin.signature }] }),
    docs: { summary: builtin.doc },
    source: { file: builtinsSourcePath, line: builtin.line },
    languageSpecific: { language: 'openscad', isModule: builtin.isModule },
  };
};

/**
 * Build the OpenSCAD corpus from parsed table rows.
 *
 * @param builtins - Rows from {@link parseBuiltins}.
 * @param metadata - `packageVersion` is the openrscad workspace version; `extractionDate` defaults to now.
 * @returns The corpus written to `src/generated/openscad/openscad-corpus.json`.
 * @internal
 */
export const buildOpenscadCorpus = (
  builtins: readonly OpenscadBuiltin[],
  metadata: { readonly packageVersion: string; readonly extractionDate?: string },
): ApiCorpus =>
  createApiCorpus(
    {
      language: 'openscad',
      packageName: 'openrscad',
      packageVersion: metadata.packageVersion,
      extractor: 'openrscad-lsp BUILTINS table',
      extractionDate: metadata.extractionDate ?? new Date().toISOString(),
    },
    builtins.map((builtin) => builtinDraft(builtin)),
  );

/** Names of the string arms of one `match name { … }` block in the evaluator. */
const dispatchedNames = (evaluatorSource: string, functionName: string): string[] => {
  const start = evaluatorSource.indexOf(`fn ${functionName}`);
  if (start === -1) {
    return [];
  }

  const open = evaluatorSource.indexOf('{', evaluatorSource.indexOf('match name {', start));
  let depth = 0;
  let end = open;
  for (let index = open; index < evaluatorSource.length; index += 1) {
    const character = evaluatorSource[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  return [...evaluatorSource.slice(open, end).matchAll(/^\s*(?<arm>(?:"[^"]+"\s*\|\s*)*"[^"]+")\s*=>/gmu)].flatMap(
    (match) =>
      [...(match.groups?.['arm'] ?? '').matchAll(/"(?<name>[^"]+)"/gu)].map((name) => name.groups?.['name'] ?? ''),
  );
};

/**
 * Compare the curated table against what the evaluator actually dispatches.
 *
 * R4 asks for the cross-check, not for reconciliation: divergence is reported
 * and left in place, because both sides are legitimate (control-flow keywords
 * and special variables never reach a dispatch table, and an engine builtin may
 * genuinely be missing from the curated docs).
 *
 * @param evaluatorSource - Contents of `crates/openrscad-eval/src/lib.rs`.
 * @param builtins - Rows from {@link parseBuiltins}.
 * @returns The names each side has and the other lacks.
 * @internal
 */
export const crossCheckDispatch = (
  evaluatorSource: string,
  builtins: readonly OpenscadBuiltin[],
): OpenscadDivergence => {
  const dispatched = new Set([
    ...dispatchedNames(evaluatorSource, 'dispatch_module'),
    ...dispatchedNames(evaluatorSource, 'builtin_fn'),
  ]);
  const declared = new Set(builtins.map((builtin) => builtin.name));

  return {
    tableOnly: builtins.filter((builtin) => !dispatched.has(builtin.name)).map((builtin) => builtin.name),
    implementationOnly: [...dispatched].filter((name) => !declared.has(name)),
  };
};

/** The committed corpus. Tracked, so consumers never need the checkout. @internal */
export const openscadCorpusPath: string = fileURLToPath(
  new URL('../../generated/openscad/openscad-corpus.json', import.meta.url),
);

/**
 * Read the committed OpenSCAD corpus.
 *
 * @returns The corpus generated from the OpenRSCAD builtins table.
 * @internal
 *
 * @example <caption>List the modules OpenSCAD exposes</caption>
 * ```typescript
 * import { loadOpenscadCorpus } from '#languages/openscad/extract.js';
 *
 * const modules = loadOpenscadCorpus().entries.filter((entry) => entry.kind === 'module');
 * ```
 */
export const loadOpenscadCorpus = (): ApiCorpus => JSON.parse(readFileSync(openscadCorpusPath, 'utf8')) as ApiCorpus;

/** Root of the optional `repos/openrscad` checkout. @internal */
export const openrscadCheckoutRoot: string = fileURLToPath(new URL('../../../../../repos/openrscad/', import.meta.url));

/**
 * Read the builtins table from a checkout.
 *
 * @param root - Checkout root; defaults to `repos/openrscad`.
 * @returns Contents of `crates/openrscad-lsp/src/builtins.rs`.
 * @throws With clone instructions when the optional checkout is absent.
 * @internal
 */
export const readBuiltinsSource = (root: string = openrscadCheckoutRoot): string => {
  const path = `${root}${builtinsSourcePath}`;
  if (!existsSync(path)) {
    throw new Error(
      [
        `OpenRSCAD builtins table not found at ${path}.`,
        'repos/openrscad is an optional checkout; clone it, then re-run this extractor:',
        '  pnpm repos:clone   # or: git clone https://github.com/taucad/openrscad repos/openrscad',
        'Consumers are unaffected: src/generated/openscad/openscad-corpus.json is committed.',
      ].join('\n'),
    );
  }

  return readFileSync(path, 'utf8');
};

const workspaceVersion = (cargoToml: string): string =>
  /^version\s*=\s*"(?<version>[^"]+)"/mu.exec(cargoToml)?.groups?.['version'] ?? '0.0.0';

const generate = (): void => {
  const builtins = parseBuiltins(readBuiltinsSource());
  console.log(`Parsed ${builtins.length} builtins from ${builtinsSourcePath}`);

  const evaluatorPath = `${openrscadCheckoutRoot}crates/openrscad-eval/src/lib.rs`;
  if (existsSync(evaluatorPath)) {
    const divergence = crossCheckDispatch(readFileSync(evaluatorPath, 'utf8'), builtins);
    console.log(`Declared but not dispatched (${divergence.tableOnly.length}): ${divergence.tableOnly.join(', ')}`);
    console.log(
      `Dispatched but not declared (${divergence.implementationOnly.length}): ${divergence.implementationOnly.join(', ')}`,
    );
  }

  const version = workspaceVersion(readFileSync(`${openrscadCheckoutRoot}Cargo.toml`, 'utf8'));
  // Reuse the committed timestamp when nothing else changed, so regeneration is
  // a no-op diff rather than timestamp-only churn.
  const previous = existsSync(openscadCorpusPath) ? loadOpenscadCorpus() : undefined;
  const candidate = buildOpenscadCorpus(builtins, { packageVersion: version });
  const unchanged =
    previous !== undefined &&
    JSON.stringify(previous.entries) === JSON.stringify(candidate.entries) &&
    JSON.stringify({ ...previous.metadata, extractionDate: '' }) ===
      JSON.stringify({ ...candidate.metadata, extractionDate: '' });
  const settled = unchanged
    ? buildOpenscadCorpus(builtins, { packageVersion: version, extractionDate: previous.metadata.extractionDate })
    : candidate;

  mkdirSync(fileURLToPath(new URL('../../generated/openscad/', import.meta.url)), { recursive: true });
  writeFileSync(openscadCorpusPath, `${JSON.stringify(settled, null, 2)}\n`);
  console.log(
    `Wrote ${settled.metadata.totalEntries} entries to ${openscadCorpusPath}: ${Object.entries(
      settled.metadata.breakdown,
    )
      .map(([kind, count]) => `${count} ${kind}`)
      .join(', ')}`,
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    generate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
