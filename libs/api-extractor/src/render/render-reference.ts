/**
 * The three tier renderers, over {@link ApiCorpus}.
 *
 * Lifted from `generateCompactMarkdown` (`extract-kcl-api.ts:386-450`), which
 * produced exactly the right shape — `// summary` above a raw signature — for
 * exactly one language and one hardcoded set of category names. What changed:
 * the input is neutral, the grouping axis is a parameter, and the title is not
 * baked in.
 *
 * @module
 */

import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';
import type { ShardPlanEntry } from '#render/shard-plan.js';

/** How many words an index line may spend describing a symbol. */
const indexSummaryWords = 10;

const firstSentence = (text: string): string => {
  const trimmed = text.replaceAll(/\s+/gu, ' ').trim();
  const stop = trimmed.search(/[.:;]\s|[.:;]$/u);
  return (stop === -1 ? trimmed : trimmed.slice(0, stop)).trimEnd();
};

/** A short purpose for an index line: first sentence, capped at ten words. */
const indexSummary = (entry: ApiEntry): string => {
  const source = entry.docs?.summary ?? '';
  if (source === '') {
    return '';
  }
  const words = firstSentence(source).split(' ').filter(Boolean);
  return words.length <= indexSummaryWords ? words.join(' ') : `${words.slice(0, indexSummaryWords).join(' ')}…`;
};

const memberCount = (entry: ApiEntry): number => (entry.members ?? []).length;

type IndexLine = {
  readonly text: string;
  /** Display name and kind: what a reader distinguishes a line by. */
  readonly key: string;
  readonly id: string;
};

/** One entry's index lines: the symbol, then each of its members indented. */
const indexLines = (
  entry: ApiEntry,
  context: { readonly parent?: string; readonly depth?: number; readonly parentCategory?: string } = {},
): readonly IndexLine[] => {
  const { parent = '', depth = 0, parentCategory } = context;
  const summary = indexSummary(entry);
  const members = memberCount(entry);
  const suffix = `${members === 0 ? '' : ` [${members} members]`}${entry.category === undefined || entry.category === parentCategory ? '' : ` [category: ${entry.category}]`}`;
  const path = entry.path ?? (parent === '' ? undefined : parent);
  const name = path === undefined ? entry.name : `${path}.${entry.name}`;
  const lines: IndexLine[] = [
    {
      text: `${'  '.repeat(depth)}${name} (${entry.kind})${suffix}${summary === '' ? '' : ` — ${summary}`}`,
      key: `${name} (${entry.kind})`,
      id: entry.id,
    },
  ];
  for (const member of entry.members ?? []) {
    lines.push(...indexLines(member, { parent: name, depth: depth + 1, parentCategory: entry.category }));
  }
  return lines;
};

/**
 * T2 — the index. Every addressable symbol, once, with the shard that holds it.
 *
 * This file is the completeness guarantee, so it is deliberately grep-shaped
 * rather than prose-shaped: one symbol per line, name first. For a surface too
 * large to read whole (libcascade's 5,114 symbols), `grep` plus a ranged
 * `read_file` is the intended access pattern, which is what the group headings
 * and the shard pointers exist to support.
 *
 * @param corpus - The corpus to index.
 * @param shards - The plan from `planShards`.
 * @param options - Document title.
 * @returns Markdown.
 * @public
 */
export const renderIndex = (
  corpus: ApiCorpus,
  shards: readonly ShardPlanEntry[],
  options: { readonly title: string },
): string => {
  const lines: string[] = [
    `# ${options.title}`,
    '',
    `${corpus.metadata.packageName} ${corpus.metadata.packageVersion} · ${corpus.metadata.totalEntries} symbols · extracted by ${corpus.metadata.extractor}.`,
    '',
    'Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.',
    '',
  ];

  const blocks = shards.map((shard) => ({ shard, rows: shard.entries.flatMap((entry) => indexLines(entry)) }));
  const keyCount = new Map<string, number>();
  for (const { rows } of blocks) {
    for (const row of rows) {
      keyCount.set(row.key, (keyCount.get(row.key) ?? 0) + 1);
    }
  }
  for (const { shard, rows } of blocks) {
    lines.push(`## ${shard.title} — \`${shard.slug}.md\`${shard.tier === 'cold' ? ' (on demand)' : ''}`, '');
    // The id disambiguates only where two lines would otherwise read the same.
    lines.push(...rows.map((row) => ((keyCount.get(row.key) ?? 0) > 1 ? `${row.text} [id: ${row.id}]` : row.text)));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
};

/** The `//` comment block above a signature: summary, then the status flags. */
const annotationLines = (entry: ApiEntry, indent: string, parentCategory?: string): readonly string[] => {
  const lines: string[] = [];
  if (entry.category !== undefined && entry.category !== parentCategory) {
    lines.push(`${indent}// Category: ${entry.category}`);
  }
  const summary = entry.docs?.summary;
  if (summary !== undefined && summary !== '') {
    lines.push(`${indent}// ${firstSentence(summary)}`);
  }
  if (entry.docs?.remarks !== undefined) {
    lines.push(`${indent}// Remarks: ${entry.docs.remarks.replaceAll(/\s+/gu, ' ').trim()}`);
  }
  for (const exception of entry.docs?.throws ?? []) {
    lines.push(`${indent}// Throws: ${exception.replaceAll(/\s+/gu, ' ').trim()}`);
  }
  if (entry.deprecated !== undefined) {
    lines.push(`${indent}// DEPRECATED${entry.deprecated === true ? '' : `: ${entry.deprecated}`}`);
  }
  if (entry.languageSpecific?.language === 'kcl' && entry.languageSpecific.experimental === true) {
    lines.push(`${indent}// EXPERIMENTAL`);
  }
  return lines;
};

/** Per-parameter prose, which only KCL and Python populate today. */
const parameterLines = (entry: ApiEntry, indent: string): readonly string[] =>
  (entry.signatures?.[0]?.parameters ?? [])
    .filter((parameter) => parameter.description !== undefined && parameter.description !== '')
    .map((parameter) => `${indent}//   ${parameter.name}: ${firstSentence(parameter.description ?? '')}`);

/** Upstream usage examples, commented so a shard stays valid source-language text. */
// ponytail: one example per entry; KCL carries up to six each, which tripled the zoo reference. Raise when a kernel needs variants.
const exampleLines = (entry: ApiEntry, indent: string): readonly string[] =>
  (entry.docs?.examples ?? []).slice(0, 1).flatMap((example) => [
    `${indent}// Example${example.caption === undefined || example.caption === '' ? '' : ` (${example.caption.trim()})`}:`,
    ...example.code
      .replaceAll('\r\n', '\n')
      .trim()
      .split('\n')
      .map((line) => `${indent}//   ${line.trimEnd()}`),
  ]);

/** Normalize declarations from upstream while preserving their source-language layout. */
const sourceLines = (text: string, indent: string): readonly string[] =>
  text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => `${indent}${line.trimEnd()}`);

/**
 * Rewrite the renderers' `//` annotation lines in the corpus language's own
 * comment syntax. Only Python differs, and no Python line starts with `//`.
 *
 * @param lines - Rendered lines.
 * @param language - The corpus language.
 * @returns The lines, with Python annotations as `#` comments.
 * @internal
 */
export const nativeComments = (
  lines: readonly string[],
  language: ApiCorpus['metadata']['language'],
): readonly string[] =>
  language === 'python' ? lines.map((line) => line.replace(/^(\s*)\/\/( |$)/u, '$1#$2')) : lines;

/**
 * A non-callable entry as its declaration reads: modifiers, name, `?` when optional, then the type.
 *
 * @param entry - A property, constant or type without signatures.
 * @returns `static readonly name?: Type`, with each part only when it applies.
 * @public
 */
export const labelledDeclaration = (entry: ApiEntry): string =>
  `${entry.static === true ? 'static ' : ''}${entry.readonly === true ? 'readonly ' : ''}${entry.name}${
    entry.optional === true ? '?' : ''
  }${entry.type === undefined ? '' : `: ${entry.type.text}`}`;

const renderEntryBody = (entry: ApiEntry, depth: number, parentCategory?: string): readonly string[] => {
  const indent = '  '.repeat(depth);
  const lines: string[] = [...annotationLines(entry, indent, parentCategory)];

  if (entry.signatures === undefined || entry.signatures.length === 0) {
    lines.push(...sourceLines(labelledDeclaration(entry), indent));
  } else {
    const name = entry.path === undefined ? entry.name : `${entry.path}.${entry.name}`;
    lines.push(`${indent}// ${name} (${entry.kind})`);
    for (const signature of entry.signatures) {
      lines.push(...sourceLines(signature.text, indent));
    }
  }

  lines.push(...parameterLines(entry, indent), ...exampleLines(entry, indent));

  for (const member of entry.members ?? []) {
    lines.push('');
    lines.push(...renderEntryBody(member, depth + 1, entry.category));
  }

  return lines;
};

/**
 * T3 — one shard. Signatures and member detail for one group.
 *
 * @param shard - The planned shard.
 * @param corpus - Its corpus, for the provenance header.
 * @returns Markdown.
 * @public
 */
export const renderShard = (shard: ShardPlanEntry, corpus: ApiCorpus): string => {
  const lines: string[] = [
    `# ${corpus.metadata.packageName} — ${shard.title}`,
    '',
    `${shard.entries.length} top-level symbols. Signatures are verbatim ${corpus.metadata.language}.`,
    '',
  ];

  for (const entry of shard.entries) {
    lines.push(...nativeComments(renderEntryBody(entry, 0), corpus.metadata.language), '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
};

/**
 * The reference map a `SKILL.md` body carries: where to look, and for what.
 *
 * Deliberately short. The agent already knows `grep` and `read_file`; this only
 * has to name the paths and the access pattern, in the shape
 * `filesystem-context-policy.md:83-87` prescribes for a lookup pointer.
 *
 * @param shards - The planned shards.
 * @param options - Index basename and total symbol count.
 * @returns Markdown fragment for inclusion in a skill body.
 * @public
 */
export const renderReferenceMap = (
  shards: readonly ShardPlanEntry[],
  options: { readonly indexFile: string; readonly totalSymbols: number },
): string => {
  const eager = shards.filter((shard) => shard.tier === 'eager');
  const cold = shards.filter((shard) => shard.tier === 'cold');
  const lines = [
    '## API reference',
    '',
    `To read any other signature, grep the skill directory for the name followed by \`(\` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. \`${options.indexFile}\` lists all ${options.totalSymbols} symbols by file.`,
    '',
  ];
  if (eager.length <= 12) {
    for (const shard of eager) {
      lines.push(`- \`${shard.slug}.md\` — ${shard.title}`);
    }
  } else {
    lines.push(`- ${eager.length} reference files, named in \`${options.indexFile}\``);
  }
  if (cold.length > 0) {
    lines.push(`- ${cold.length} further files are fetched on demand; \`${options.indexFile}\` names them.`);
  }
  lines.push('', 'Read ranges, not whole files. Never copy a reference into a source file.');
  return `${lines.join('\n')}\n`;
};
