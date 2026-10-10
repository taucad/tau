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
 * The table's one-line signatures are shorthand (`r | d`), so {@link signatureOverrides}
 * replaces them with callable forms and {@link languageConstructs} adds the syntax
 * the table cannot hold; generation verifies both against the evaluator's
 * argument binding in `crates/openrscad-eval/src/lib.rs`.
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
import type { ApiCorpus, ApiEntryKind, ApiParameter, ApiSignature } from '#model/api-corpus.types.js';

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

/** Callable forms that replace one table row's shorthand. @internal */
export type OpenscadSignatureOverride = {
  /** Each real alternative form, written as OpenSCAD an author can paste. */
  readonly signatures: readonly string[];
  readonly remarks?: string;
};

const fragments = '$fn, $fa, $fs';

/**
 * Callable signatures for rows whose table text is shorthand (`r | d`, `idx?`, `...`).
 *
 * Provenance: names, defaults and alternative forms follow the public OpenSCAD
 * User Manual, kept only where the OpenRSCAD evaluator binds or reads them, which
 * {@link verifySignatures} enforces against `crates/openrscad-eval/src/lib.rs` on
 * every generation. That is why `polygon` and `import` drop `convexity`, `text`
 * has no per-call `$fn`, and `linear_extrude` gains `v`. Rows the table already
 * writes callably (`sin(deg)`, `hull()`) stay as the table has them.
 *
 * @internal
 */
export const signatureOverrides: ReadonlyMap<string, OpenscadSignatureOverride> = new Map([
  ['cube', { signatures: ['cube(size = [1, 1, 1], center = false)'], remarks: '`size` may be a scalar for a cube.' }],
  ['sphere', { signatures: [`sphere(r = 1, ${fragments})`, `sphere(d, ${fragments})`] }],
  [
    'cylinder',
    {
      signatures: [
        `cylinder(h = 1, r = 1, center = false, ${fragments})`,
        `cylinder(h = 1, r1 = 1, r2 = 1, center = false, ${fragments})`,
        `cylinder(h = 1, d, center = false, ${fragments})`,
        `cylinder(h = 1, d1, d2, center = false, ${fragments})`,
      ],
      remarks: 'Positional order is h, r1, r2, center; pass r, d, d1 and d2 by name.',
    },
  ],
  ['polyhedron', { signatures: ['polyhedron(points, faces, convexity = 1)'] }],
  [
    'square',
    { signatures: ['square(size = [1, 1], center = false)'], remarks: '`size` may be a scalar for a square.' },
  ],
  ['circle', { signatures: [`circle(r = 1, ${fragments})`, `circle(d, ${fragments})`] }],
  ['polygon', { signatures: ['polygon(points, paths)'] }],
  [
    'text',
    {
      signatures: [
        'text(text, size = 10, font = "Liberation Sans", direction = "ltr", language = "en", script = "latin", halign = "left", valign = "baseline", spacing = 1)',
      ],
      remarks: 'Curve resolution follows the ambient $fn, not a per-call one.',
    },
  ],
  ['import', { signatures: ['import(file)'] }],
  ['translate', { signatures: ['translate(v = [0, 0, 0])'] }],
  [
    'rotate',
    {
      signatures: ['rotate(a = [0, 0, 0])', 'rotate(a = 0)', 'rotate(a = 0, v = [0, 0, 1])'],
      remarks: 'A vector rotates about X, then Y, then Z; a scalar about Z; with v, about axis v.',
    },
  ],
  ['scale', { signatures: ['scale(v = [1, 1, 1])', 'scale(v = 1)'] }],
  ['resize', { signatures: ['resize(newsize = [0, 0, 0], auto = false)'], remarks: '`auto` may be per axis.' }],
  ['mirror', { signatures: ['mirror(v = [1, 0, 0])'] }],
  ['multmatrix', { signatures: ['multmatrix(m)'] }],
  [
    'color',
    {
      signatures: ['color(c = "name", alpha = 1)', 'color(c = "#rrggbb", alpha = 1)', 'color(c = [r, g, b, a])'],
      remarks: 'Vector channels run 0 to 1.',
    },
  ],
  ['offset', { signatures: [`offset(r = 1, ${fragments})`, 'offset(delta, chamfer = false)'] }],
  [
    'linear_extrude',
    {
      signatures: ['linear_extrude(height = 100, center = false, twist = 0, slices, scale = 1, v = [0, 0, 1])'],
      remarks: 'Only height is positional. slices defaults to 1, or ceil(|twist| / 15) when twisted.',
    },
  ],
  ['rotate_extrude', { signatures: [`rotate_extrude(angle = 360, start = 0, ${fragments})`] }],
  [
    'for',
    {
      signatures: [
        'for (i = [start : end]) children',
        'for (i = [start : step : end]) children',
        'for (item = [a, b, c]) children',
        'for (i = [0 : 2], j = [0 : 2]) children',
        '[for (i = [start : end]) expression]',
        '[for (i = 0; i < n; i = i + 1) expression]',
      ],
      remarks: 'Ranges include their end. In a list comprehension, for yields one element per value.',
    },
  ],
  ['intersection_for', { signatures: ['intersection_for (i = [start : end]) children'] }],
  [
    'if',
    {
      signatures: [
        'if (condition) children',
        'if (condition) children else children',
        '[for (x = list) if (condition) x]',
      ],
    },
  ],
  [
    'let',
    {
      signatures: [
        'let (name = value) children',
        'y = let (name = value) expression;',
        '[for (i = [start : end]) let (name = value) expression]',
      ],
    },
  ],
  [
    'children',
    {
      signatures: ['children()', 'children(index)', 'children([i, j])', 'children([start : end])'],
      remarks: '$children counts the children passed in.',
    },
  ],
  [
    'echo',
    {
      signatures: ['echo(value, ...)', 'y = echo(value) expression;'],
      remarks: 'A named argument prints as name = value.',
    },
  ],
  ['assert', { signatures: ['assert(condition, message)', 'y = assert(condition, message) expression;'] }],
  ['render', { signatures: ['render()'], remarks: 'A passthrough in OpenRSCAD.' }],
  ['min', { signatures: ['min(a, b, ...)', 'min(values)'] }],
  ['max', { signatures: ['max(a, b, ...)', 'max(values)'] }],
  ['str', { signatures: ['str(value, ...)'] }],
  ['chr', { signatures: ['chr(code, ...)', 'chr(codes)'] }],
  [
    'search',
    {
      signatures: ['search(match_value, string_or_vector, num_returns_per_match, index_col_num)'],
      remarks: 'num_returns_per_match defaults to 1 (0 returns all); index_col_num to 0.',
    },
  ],
  ['parent_module', { signatures: ['parent_module(index)'], remarks: 'index defaults to 1.' }],
]);

/** One language construct the table cannot hold because it is syntax, not a builtin. @internal */
export type OpenscadLanguageConstruct = {
  readonly name: string;
  /** `module` for statement syntax, `function` for expression syntax, `constant` for a special variable. */
  readonly kind: 'module' | 'function' | 'constant';
  readonly signatures?: readonly string[];
  readonly summary: string;
  readonly remarks?: string;
};

const syntaxSourcePath = 'crates/openrscad-syntax/src/ast.rs';

/**
 * Declarations, imports, comprehensions and modifiers, as the OpenRSCAD parser's
 * AST (`crates/openrscad-syntax/src/ast.rs`) accepts them and the public OpenSCAD
 * User Manual describes them.
 *
 * @internal
 */
export const languageConstructs: readonly OpenscadLanguageConstruct[] = [
  {
    name: 'module',
    kind: 'module',
    signatures: ['module name(param, option = default) { children(); }'],
    summary: 'Declare a module, instantiated as a statement with optional children.',
  },
  {
    name: 'function',
    kind: 'function',
    signatures: ['function name(param, option = default) = expression;', 'f = function (x) expression;'],
    summary: 'Declare a function, or bind a function literal to a variable.',
    remarks: 'Call either form as name(...) or f(...).',
  },
  {
    name: 'include',
    kind: 'module',
    signatures: ['include <path/file.scad>'],
    summary: 'Splice a file in place, running its top-level statements and assignments.',
  },
  {
    name: 'use',
    kind: 'module',
    signatures: ['use <path/file.scad>'],
    summary: 'Import only the modules and functions a file declares; its top-level statements do not run.',
  },
  {
    name: 'each',
    kind: 'function',
    signatures: ['[each list, item]', '[for (list = lists) each list]'],
    summary: 'Splice a list or range into the enclosing list.',
  },
  { name: '$children', kind: 'constant', summary: 'Number of children passed to the current module.' },
  {
    name: '#',
    kind: 'module',
    signatures: ['#cube(10);'],
    summary: 'Highlight a subtree in the preview; it still renders.',
  },
  {
    name: '%',
    kind: 'module',
    signatures: ['%cube(10);'],
    summary: 'Show a subtree as a transparent background, excluded from the result.',
  },
  { name: '!', kind: 'module', signatures: ['!cube(10);'], summary: 'Render only this subtree.' },
  { name: '*', kind: 'module', signatures: ['*cube(10);'], summary: 'Disable a subtree.' },
];

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

/** Only call forms (`cube(...)`) carry parameters; syntax templates (`for (...) children`) do not. */
const signatureOf = (name: string, text: string): ApiSignature => ({
  parameters: text.startsWith(`${name}(`) ? parseParameters(text) : [],
  text,
});

const builtinDraft = (builtin: OpenscadBuiltin): ApiEntryDraft => {
  const kind = kindOf(builtin);
  const override = signatureOverrides.get(builtin.name);

  return {
    name: builtin.name,
    kind,
    ...(builtin.category === undefined ? {} : { category: builtin.category }),
    ...(kind === 'constant'
      ? {}
      : {
          signatures: (override?.signatures ?? [builtin.signature]).map((text) => signatureOf(builtin.name, text)),
        }),
    docs: { summary: builtin.doc, ...(override?.remarks === undefined ? {} : { remarks: override.remarks }) },
    source: { file: builtinsSourcePath, line: builtin.line },
    languageSpecific: { language: 'openscad', isModule: builtin.isModule },
  };
};

const constructDraft = (construct: OpenscadLanguageConstruct): ApiEntryDraft => ({
  name: construct.name,
  kind: construct.kind,
  category: 'Language',
  ...(construct.signatures === undefined
    ? {}
    : { signatures: construct.signatures.map((text) => signatureOf(construct.name, text)) }),
  docs: { summary: construct.summary, ...(construct.remarks === undefined ? {} : { remarks: construct.remarks }) },
  source: { file: syntaxSourcePath },
  languageSpecific: { language: 'openscad', isModule: construct.kind === 'module' },
});

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
): ApiCorpus => {
  const names = new Set(builtins.map((builtin) => builtin.name));
  const stale = [...signatureOverrides.keys()].filter((name) => !names.has(name));
  const shadowed = languageConstructs.filter((construct) => names.has(construct.name)).map(({ name }) => name);
  if (stale.length > 0 || shadowed.length > 0) {
    throw new Error(
      `OpenSCAD signature table out of step with ${builtinsSourcePath}: overrides without a row [${stale.join(', ')}], constructs that are now rows [${shadowed.join(', ')}]`,
    );
  }

  return createApiCorpus(
    {
      language: 'openscad',
      packageName: 'openrscad',
      packageVersion: metadata.packageVersion,
      extractor: 'openrscad-lsp BUILTINS table + evaluator-verified signatures',
      extractionDate: metadata.extractionDate ?? new Date().toISOString(),
    },
    [
      ...builtins.map((builtin) => builtinDraft(builtin)),
      ...languageConstructs.map((construct) => constructDraft(construct)),
    ],
  );
};

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

/** From `marker` to the next sibling `fn` in the same `impl`. */
const rustFunctionBody = (source: string, marker: string): string => {
  const start = source.indexOf(marker);
  if (start === -1) {
    return '';
  }

  const end = source.indexOf('\n    fn ', start + 1);
  return source.slice(start, end === -1 ? undefined : end);
};

/**
 * The argument names one builtin module reads, or `undefined` when it binds none.
 *
 * Follows the `dispatch_module` arm to its handler (`self.b_cube(…)`, a
 * `TransformKind::*` branch of `transform`, or the arm itself) and collects
 * `bind_named(&[…])` names, `.get("…")` reads and, through `frag_spec`, the
 * per-call `$fn`, `$fa` and `$fs`.
 */
const evaluatorModuleParameters = (evaluatorSource: string, name: string): ReadonlySet<string> | undefined => {
  const dispatch = rustFunctionBody(evaluatorSource, 'fn dispatch_module');
  const armStart = dispatch.indexOf(`"${name}" =>`);
  if (armStart === -1) {
    return undefined;
  }

  const rest = dispatch.slice(armStart + name.length + 2);
  const armEnd = rest.search(/\n\s*(?:"[^"]+"|_)\s*=>/u);
  const arm = armEnd === -1 ? rest : rest.slice(0, armEnd);
  const handler = /self\.(?<method>b_\w+)\(/u.exec(arm)?.groups?.['method'];
  const transform = /TransformKind::(?<variant>\w+)/u.exec(arm)?.groups?.['variant'];
  let body = arm;
  if (handler !== undefined) {
    body = rustFunctionBody(evaluatorSource, `fn ${handler}(`);
  } else if (transform !== undefined) {
    const transformBody = rustFunctionBody(evaluatorSource, 'fn transform(');
    const branch = transformBody.slice(transformBody.indexOf(`TransformKind::${transform} =>`));
    const next = branch.indexOf('TransformKind::', 1);
    body = next === -1 ? branch : branch.slice(0, next);
  }

  if (!body.includes('bind_named(')) {
    return undefined;
  }

  const bound = [...body.matchAll(/bind_named\(\s*&\[(?<list>[^\]]*)\]/gu)].flatMap((match) =>
    [...(match.groups?.['list'] ?? '').matchAll(/"(?<name>[^"]+)"/gu)].map((item) => item.groups?.['name'] ?? ''),
  );
  const read = [...body.matchAll(/\.get\("(?<name>[^"]+)"\)/gu)].map((match) => match.groups?.['name'] ?? '');
  const special = body.includes('frag_spec(') ? ['$fn', '$fa', '$fs'] : [];
  return new Set([...bound, ...read, ...special]);
};

/**
 * Check every module signature in a corpus against the evaluator.
 *
 * A module that binds names must read every parameter its signatures show; one
 * that binds none (`children`, `echo`, `render`) may only show positional
 * labels, so a defaulted or `$` parameter there is an invention.
 *
 * @param evaluatorSource - Contents of `crates/openrscad-eval/src/lib.rs`.
 * @param corpus - From {@link buildOpenscadCorpus}.
 * @returns One line per parameter the evaluator would ignore; empty when every signature holds.
 * @internal
 */
export const verifySignatures = (evaluatorSource: string, corpus: ApiCorpus): string[] =>
  corpus.entries
    .filter((entry) => entry.kind === 'module' && entry.source?.file === builtinsSourcePath)
    .flatMap((entry) => {
      const accepted = evaluatorModuleParameters(evaluatorSource, entry.name);
      return (entry.signatures ?? []).flatMap((signature) =>
        signature.parameters
          .filter((parameter) =>
            accepted === undefined
              ? parameter.defaultValue !== undefined || parameter.name.startsWith('$')
              : !accepted.has(parameter.name),
          )
          .map((parameter) => `${entry.name}: ${parameter.name} in \`${signature.text}\``),
      );
    });

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

  const evaluatorSource = readFileSync(`${openrscadCheckoutRoot}crates/openrscad-eval/src/lib.rs`, 'utf8');
  const divergence = crossCheckDispatch(evaluatorSource, builtins);
  console.log(`Declared but not dispatched (${divergence.tableOnly.length}): ${divergence.tableOnly.join(', ')}`);
  console.log(
    `Dispatched but not declared (${divergence.implementationOnly.length}): ${divergence.implementationOnly.join(', ')}`,
  );

  const version = workspaceVersion(readFileSync(`${openrscadCheckoutRoot}Cargo.toml`, 'utf8'));
  // Reuse the committed timestamp when nothing else changed, so regeneration is
  // a no-op diff rather than timestamp-only churn.
  const previous = existsSync(openscadCorpusPath) ? loadOpenscadCorpus() : undefined;
  const candidate = buildOpenscadCorpus(builtins, { packageVersion: version });
  const unverified = verifySignatures(evaluatorSource, candidate);
  if (unverified.length > 0) {
    throw new Error(`Signatures show parameters the OpenRSCAD evaluator ignores:\n  ${unverified.join('\n  ')}`);
  }
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
