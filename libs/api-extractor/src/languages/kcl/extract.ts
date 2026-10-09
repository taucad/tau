/**
 * KCL standard-library front-end: the Zoo `kcl-lib` JSON export as an {@link ApiCorpus}.
 *
 * The export is produced upstream by a patched `cargo test` and vendored at
 * `src/generated/kcl/kcl-stdlib-export.json`, so consumers never need the
 * `repos/zoo-modeling-app` checkout. This module only transforms it.
 *
 * Things the previous transform dropped are carried here: the `experimental`
 * flag, the `module` entries, the unit part of `number(Angle)`-style argument
 * types, `deprecated_since`, and the upstream doc-comment examples.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiCorpus } from '#model/api-corpus.js';
import type { ApiEntryDraft } from '#model/api-corpus.js';
import type { ApiCorpus, ApiDocs, ApiLanguageSpecific, ApiParameter } from '#model/api-corpus.types.js';

/**
 * One doc-comment example. `sketch_syntax` is upstream's `ExampleSketchSyntax`:
 * `SketchSolve` uses `sketch(on = …) { … }` blocks, `Legacy` the KCL 1.0
 * `startSketchOn` pipeline deprecated in KCL 2.0.
 * @internal
 */
export type KclExampleExport = {
  readonly code: string;
  readonly sketch_syntax: 'SketchSolve' | 'Legacy' | 'SketchSyntaxAgnostic';
};

/** Fields every documented item of the export shares. @internal */
export type KclItemExport = {
  readonly deprecated: boolean;
  /** The KCL language version the item is deprecated from, e.g. `2.0`. */
  readonly deprecated_since: string | undefined;
  readonly experimental: boolean;
  readonly examples: readonly KclExampleExport[];
};

/** One argument of a `functions[]` record. @internal */
export type KclArgumentExport = {
  readonly name: string;
  readonly type_: string | undefined;
  readonly description: string;
  readonly required: boolean;
};

/** One `functions[]` record of the upstream export. @internal */
export type KclFunctionExport = KclItemExport & {
  readonly name: string;
  readonly qual_name: string;
  readonly module: string;
  readonly summary: string | undefined;
  readonly description: string | undefined;
  readonly fn_signature: string;
  readonly args: readonly KclArgumentExport[];
  readonly return_value?: { readonly type_: string; readonly description: string };
};

/** One `types[]` record of the upstream export. @internal */
export type KclTypeExport = KclItemExport & {
  readonly name: string;
  readonly qual_name: string;
  readonly definition: string | undefined;
  readonly summary: string | undefined;
  readonly description: string | undefined;
};

/** One `constants[]` record of the upstream export. @internal */
export type KclConstantExport = KclItemExport & {
  readonly name: string;
  readonly qual_name: string;
  readonly summary: string | undefined;
  readonly description: string | undefined;
  readonly type_: string | undefined;
  readonly value: string;
};

/** One `modules[]` record of the upstream export — never rendered by the old pipeline. @internal */
export type KclModuleExport = {
  readonly name: string;
  readonly qual_name: string;
  readonly summary: string | undefined;
  readonly description: string | undefined;
  readonly experimental: boolean;
};

/** The vendored `kcl-stdlib-export.json` document. @internal */
export type KclStdlibExport = {
  readonly metadata: { readonly version: string };
  readonly functions: readonly KclFunctionExport[];
  readonly types: readonly KclTypeExport[];
  readonly constants: readonly KclConstantExport[];
  readonly modules: readonly KclModuleExport[];
};

/**
 * The container of a `std::math::abs`-style qualified name, dotted.
 *
 * `qual_name` is the authority rather than the sibling `module` field: the
 * top-level `std` module reports `module: "std::"`, which would leave a
 * trailing separator in every id derived from it.
 */
const containerPath = (qualifiedName: string): string | undefined => {
  const segments = qualifiedName.split('::').filter((segment) => segment !== '');
  segments.pop();
  return segments.length === 0 ? undefined : segments.join('.');
};

/** JSON nulls arrive as `null` at runtime despite the `undefined` types; optional chaining covers both. */
const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text === undefined || text === '' ? undefined : text;
};

type ApiExample = NonNullable<ApiDocs['examples']>[number];

const legacyCaption = 'Legacy sketch syntax (deprecated in KCL 2.0)';

/**
 * Upstream examples, current syntax only where an entry has both: `Legacy`
 * examples are kept, captioned, only when nothing else shows the call.
 */
const examplesOf = (examples: readonly KclExampleExport[]): ApiExample[] => {
  const current = examples.filter((example) => example.sketch_syntax !== 'Legacy');
  return current.length > 0
    ? current.map((example) => ({ code: example.code }))
    : examples.map((example) => ({ caption: legacyCaption, code: example.code }));
};

const docsOf = (
  summary: string | undefined,
  description: string | undefined,
  examples: readonly ApiExample[],
): ApiDocs | undefined => {
  const summaryText = trimmed(summary);
  const remarks = trimmed(description);
  if (summaryText === undefined && remarks === undefined && examples.length === 0) {
    return undefined;
  }

  return {
    ...(summaryText === undefined ? {} : { summary: summaryText }),
    ...(remarks === undefined ? {} : { remarks }),
    ...(examples.length === 0 ? {} : { examples }),
  };
};

/** `ApiEntry.deprecated`: the KCL version that deprecates the item, else the bare flag. */
const deprecationOf = (source: KclItemExport): { readonly deprecated?: string | true } => {
  const since = trimmed(source.deprecated_since);
  if (since !== undefined) {
    return { deprecated: `Deprecated in KCL ${since}.` };
  }

  return source.deprecated ? { deprecated: true } : {};
};

/** The bare unit of a `number(Angle)`-style type, e.g. `Angle`, `Length`, `_`. */
const bareUnit = (typeText: string | undefined): string | undefined =>
  /^number\((?<unit>[^()]+)\)$/u.exec(typeText ?? '')?.groups?.['unit'];

/**
 * Names the signature marks positional with `@`.
 *
 * The `args[]` records strip the sigil, so the signature text is the only place
 * the caller-visible spelling survives.
 */
const positionalNames = (signature: string): ReadonlySet<string> =>
  new Set([...signature.matchAll(/@(?<name>[A-Za-z_]\w*)/gu)].map((match) => match.groups?.['name'] ?? ''));

const languageSpecific = (
  unitTypes: Readonly<Record<string, string>>,
  experimental: boolean,
): ApiLanguageSpecific | undefined => {
  const hasUnits = Object.keys(unitTypes).length > 0;
  if (!hasUnits && !experimental) {
    return undefined;
  }

  return { language: 'kcl', ...(hasUnits ? { unitTypes } : {}), ...(experimental ? { experimental: true } : {}) };
};

const functionDraft = (source: KclFunctionExport): ApiEntryDraft => {
  const path = containerPath(source.qual_name);
  const docs = docsOf(source.summary, source.description, examplesOf(source.examples));
  const positional = positionalNames(source.fn_signature);
  const unitTypes: Record<string, string> = {};
  const parameters: ApiParameter[] = source.args.map((argument) => {
    const name = positional.has(argument.name) ? `@${argument.name}` : argument.name;
    const typeText = trimmed(argument.type_);
    const unit = bareUnit(typeText);
    if (unit !== undefined) {
      unitTypes[name] = unit;
    }

    const description = trimmed(argument.description);
    return {
      name,
      ...(typeText === undefined ? {} : { type: { text: typeText } }),
      optional: !argument.required,
      ...(description === undefined ? {} : { description }),
    };
  });

  const returnType = trimmed(source.return_value?.type_);
  // KCL documents what a call yields as prose about the return value; the model
  // has no slot on `ApiTypeRef`, so it rides the signature description.
  const returnDescription = trimmed(source.return_value?.description);
  const specific = languageSpecific(unitTypes, source.experimental);

  return {
    name: source.name,
    kind: 'function',
    ...(path === undefined ? {} : { path, category: path }),
    signatures: [
      {
        parameters,
        ...(returnType === undefined ? {} : { returnType: { text: returnType } }),
        text: source.fn_signature,
        ...(returnDescription === undefined ? {} : { description: returnDescription }),
      },
    ],
    ...(docs === undefined ? {} : { docs }),
    ...deprecationOf(source),
    ...(specific === undefined ? {} : { languageSpecific: specific }),
  };
};

const typeDraft = (source: KclTypeExport): ApiEntryDraft => {
  const definition = trimmed(source.definition);
  const path = containerPath(source.qual_name);
  const docs = docsOf(source.summary, source.description, examplesOf(source.examples));
  const specific = languageSpecific({}, source.experimental);

  return {
    name: source.name,
    kind: 'type',
    ...(path === undefined ? {} : { path, category: path }),
    ...(definition === undefined ? {} : { type: { text: definition } }),
    ...(docs === undefined ? {} : { docs }),
    ...deprecationOf(source),
    ...(specific === undefined ? {} : { languageSpecific: specific }),
  };
};

const constantDraft = (source: KclConstantExport): ApiEntryDraft => {
  const path = containerPath(source.qual_name);
  const typeText = trimmed(source.type_);
  const value = trimmed(source.value);
  // The model has no constant-value field; the literal is display prose, and
  // an example block is how the old markdown rendered it.
  const docs = docsOf(source.summary, source.description, [
    ...(value === undefined ? [] : [{ caption: 'Value', code: `${source.name} = ${value}` }]),
    ...examplesOf(source.examples),
  ]);
  const specific = languageSpecific({}, source.experimental);

  return {
    name: source.name,
    kind: 'constant',
    ...(path === undefined ? {} : { path, category: path }),
    ...(typeText === undefined ? {} : { type: { text: typeText } }),
    ...(docs === undefined ? {} : { docs }),
    ...deprecationOf(source),
    ...(specific === undefined ? {} : { languageSpecific: specific }),
  };
};

const moduleDraft = (source: KclModuleExport): ApiEntryDraft => {
  const path = containerPath(source.qual_name);
  const docs = docsOf(source.summary, source.description, []);
  const specific = languageSpecific({}, source.experimental);

  return {
    name: source.name,
    kind: 'module',
    ...(path === undefined ? {} : { path }),
    category: path === undefined ? source.name : `${path}.${source.name}`,
    ...(docs === undefined ? {} : { docs }),
    ...(specific === undefined ? {} : { languageSpecific: specific }),
  };
};

/**
 * Turn the vendored KCL export into a corpus.
 *
 * @param stdlib - The parsed `kcl-stdlib-export.json` document.
 * @param options - `extractionDate` pins the metadata timestamp; it defaults to now.
 * @returns One corpus holding every function, type, constant and module the export declares.
 * @internal
 *
 * @example <caption>Build a corpus from an export already in memory</caption>
 * ```typescript
 * import { buildKclCorpus } from '#languages/kcl/extract.js';
 *
 * declare const stdlib: KclStdlibExport;
 * const corpus = buildKclCorpus(stdlib, { extractionDate: '2026-09-10T00:00:00.000Z' });
 * ```
 */
export const buildKclCorpus = (
  stdlib: KclStdlibExport,
  options: { readonly extractionDate?: string } = {},
): ApiCorpus =>
  createApiCorpus(
    {
      language: 'kcl',
      packageName: 'kcl-std',
      packageVersion: stdlib.metadata.version,
      extractor: 'kcl-lib stdlib JSON export',
      extractionDate: options.extractionDate ?? new Date().toISOString(),
    },
    [
      ...stdlib.functions.map((source) => functionDraft(source)),
      ...stdlib.types.map((source) => typeDraft(source)),
      ...stdlib.constants.map((source) => constantDraft(source)),
      ...stdlib.modules.map((source) => moduleDraft(source)),
    ],
  );

/** The vendored export this front-end reads. Tracked, so no checkout is required. @internal */
export const kclStdlibExportPath: string = fileURLToPath(
  new URL('../../generated/kcl/kcl-stdlib-export.json', import.meta.url),
);

/**
 * Read the vendored export and build its corpus.
 *
 * @param options - `extractionDate` pins the metadata timestamp; it defaults to now.
 * @returns The KCL standard-library corpus.
 * @internal
 *
 * @example <caption>Count the KCL surface</caption>
 * ```typescript
 * import { loadKclCorpus } from '#languages/kcl/extract.js';
 *
 * const corpus = loadKclCorpus();
 * console.log(corpus.metadata.totalEntries, corpus.metadata.breakdown);
 * ```
 */
export const loadKclCorpus = (options: { readonly extractionDate?: string } = {}): ApiCorpus =>
  buildKclCorpus(JSON.parse(readFileSync(kclStdlibExportPath, 'utf8')) as KclStdlibExport, options);
