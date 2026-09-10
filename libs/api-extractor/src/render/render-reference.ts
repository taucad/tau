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
  return stop === -1 ? trimmed : trimmed.slice(0, stop);
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

/** One entry's index lines: the symbol, then each of its members indented. */
const indexLines = (entry: ApiEntry): readonly string[] => {
  const summary = indexSummary(entry);
  const members = memberCount(entry);
  const suffix = members === 0 ? '' : ` [${members} members]`;
  const lines = [`${entry.name} (${entry.kind})${suffix}${summary === '' ? '' : ` — ${summary}`}`];
  for (const member of entry.members ?? []) {
    const memberSummary = indexSummary(member);
    lines.push(`  ${entry.name}.${member.name} (${member.kind})${memberSummary === '' ? '' : ` — ${memberSummary}`}`);
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
    'Every symbol appears here exactly once. The heading above each block names the file with its signature.',
    '',
  ];

  for (const shard of shards) {
    lines.push(`## ${shard.title} — \`${shard.slug}.md\`${shard.tier === 'cold' ? ' (on demand)' : ''}`, '');
    for (const entry of shard.entries) {
      lines.push(...indexLines(entry));
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
};

/** The `//` comment block above a signature: summary, then the status flags. */
const annotationLines = (entry: ApiEntry, indent: string): readonly string[] => {
  const lines: string[] = [];
  const summary = entry.docs?.summary;
  if (summary !== undefined && summary !== '') {
    lines.push(`${indent}// ${firstSentence(summary)}`);
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

const renderEntryBody = (entry: ApiEntry, depth: number): readonly string[] => {
  const indent = '  '.repeat(depth);
  const lines: string[] = [...annotationLines(entry, indent)];

  if (entry.signatures === undefined || entry.signatures.length === 0) {
    lines.push(`${indent}${entry.name}${entry.type === undefined ? '' : `: ${entry.type.text}`}`);
  } else {
    for (const signature of entry.signatures) {
      lines.push(`${indent}${signature.text}`);
    }
  }

  lines.push(...parameterLines(entry, indent));

  for (const member of entry.members ?? []) {
    lines.push('');
    lines.push(...renderEntryBody(member, depth + 1));
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
    lines.push(...renderEntryBody(entry, 0), '');
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
    `All ${options.totalSymbols} symbols are listed in \`${options.indexFile}\`. Grep it for a name, then read only the file its heading names.`,
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
