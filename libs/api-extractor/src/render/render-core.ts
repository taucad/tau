/**
 * The Core API section of a skill body: the symbols real Tau models use most,
 * as verbatim declarations, so an agent can start modelling without a lookup.
 *
 * Selection is data-driven and deterministic. A committed usage ranking (see
 * `usage/collect-usage.ts`) orders the corpus; pins name the entry points every
 * model needs even when a ranking under-represents them; a token budget bounds
 * the section. Nothing here scans the filesystem.
 *
 * Rendering stays language-neutral in the way `render-reference.ts` is: each
 * entry is its summary comment above the corpus's verbatim source text, so the
 * section reads as native TypeScript, Python, KCL, OpenSCAD or C#.
 *
 * @module
 */

import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';
import { labelledDeclaration, nativeComments } from '#render/render-reference.js';
import { estimateTokens } from '#render/shard-plan.js';

/** One symbol's combined usage score, as the collector commits it. @public */
export type UsageSymbol = {
  readonly id: string;
  readonly score: number;
};

/** A committed usage ranking for one skill owner. @public */
export type UsageRanking = {
  readonly symbols: readonly UsageSymbol[];
};

/** A corpus offered to the core section, with the axis its groups follow. @public */
export type CoreSource = {
  readonly corpus: ApiCorpus;
  readonly groupBy: (entry: ApiEntry) => string;
};

/** How one owner's core section is chosen. @public */
export type CoreApiOptions = {
  /** Token ceiling for the rendered section, headings included. */
  readonly budgetTokens: number;
  /** Line ceiling for the rendered section, so the skill body stays under its 500-line limit. Default 300. */
  readonly budgetLines?: number;
  /**
   * Display names that always lead the section, in order: `drawCircle`,
   * `Library.Go`, or `GeoSpecMatcher.*` for a container with every member.
   */
  readonly pins?: readonly string[];
  /** Top-level entries never offered, such as a selected standard-library slice. */
  readonly exclude?: (entry: ApiEntry) => boolean;
  /**
   * The section's own grouping, when the reference's axis would not help an author:
   * PicoVoxel groups by import path, since its symbols come from several subpath modules.
   */
  readonly groupBy?: (entry: ApiEntry, packageName: string) => string;
  /** Offer every non-excluded top-level entry, ranked or not: for a surface small enough to show whole. */
  readonly includeUnused?: boolean;
};

/** A rendered core section and what it holds. @public */
export type RenderedCore = {
  readonly markdown: string;
  readonly tokens: number;
  /** Ids of every top-level and member entry shown. */
  readonly ids: readonly string[];
};

/** Containers whose members together weigh less than this render whole. */
const smallContainerTokens = 250;
/** Referenced option and record types are inlined when they weigh less than this. */
const smallReferencedTokens = 220;
/** Default line ceiling: leaves the doctrine and reference map 200 of the body's 500 lines. */
const defaultBudgetLines = 300;
/** Words an entry summary may spend. */
const summaryWords = 14;

const fenceLanguage: Readonly<Record<ApiCorpus['metadata']['language'], string>> = {
  typescript: 'ts',
  python: 'python',
  csharp: 'csharp',
  openscad: 'openscad',
  kcl: 'kcl',
};

const firstSentence = (text: string): string => {
  const trimmed = text.replaceAll(/\s+/gu, ' ').trim();
  const stop = trimmed.search(/[.:;]\s|[.:;]$/u);
  const sentence = (stop === -1 ? trimmed : trimmed.slice(0, stop)).trimEnd();
  const words = sentence.split(' ').filter(Boolean);
  return words.length <= summaryWords ? words.join(' ') : `${words.slice(0, summaryWords).join(' ')}…`;
};

const summaryLine = (entry: ApiEntry, indent: string): readonly string[] => {
  const summary = entry.docs?.summary;
  return summary === undefined || summary.trim() === '' ? [] : [`${indent}// ${firstSentence(summary)}`];
};

const sourceLines = (text: string, indent: string): readonly string[] =>
  text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => `${indent}${line.trimEnd()}`);

const declarationKeywords = new Set(['class', 'interface', 'enum', 'namespace', 'struct', 'record', 'module', 'type']);

/** Whether a declaration's first line already declares `name`, as in `class Solid` or `interface CuboidOptions`. */
const declaresName = (text: string, name: string): boolean => {
  const words = (text.split('\n')[0] ?? '').split(/[^\w$]+/u);
  return words.some((word, index) => word === name && declarationKeywords.has(words[index - 1] ?? ''));
};

/** The declaration text an entry shows on its own, without members. */
const declarationText = (entry: ApiEntry): string => {
  if (entry.signatures !== undefined && entry.signatures.length > 0) {
    return entry.signatures.map((signature) => signature.text).join('\n');
  }
  if (entry.type === undefined) {
    return entry.name;
  }
  // A declared type that already names the symbol (`export declare class Solid …`) needs no `Solid:` label.
  return declaresName(entry.type.text, entry.name) ? entry.type.text : labelledDeclaration(entry);
};

/**
 * The one-line header a container shows above its chosen members.
 *
 * A type alias's declared type already spells out every member, so a filtered
 * container cannot print it whole; it prints the first line and closes the brace
 * after the members it keeps.
 */
const containerHeader = (entry: ApiEntry): { readonly line: string; readonly closes: boolean } => {
  const first = declarationText(entry).split('\n')[0]?.trimEnd() ?? entry.name;
  return { line: first, closes: first.endsWith('{') };
};

const memberWeight = (entry: ApiEntry): number =>
  (entry.members ?? []).reduce((sum, member) => sum + estimateTokens(renderMember(member).join('\n')), 0);

/** A member or childless entry: summary, then its verbatim declaration. */
const renderLeaf = (entry: ApiEntry, indent: string): readonly string[] => [
  ...summaryLine(entry, indent),
  ...sourceLines(declarationText(entry), indent),
];

/** Render an entry with the members chosen for it, noting how many are left out. */
const renderEntry = (entry: ApiEntry, members: readonly ApiEntry[]): readonly string[] => {
  if (entry.members === undefined || entry.members.length === 0) {
    return renderLeaf(entry, '');
  }
  const header = containerHeader(entry);
  const lines = [...summaryLine(entry, ''), header.line];
  for (const member of members) {
    lines.push(...renderMember(member));
  }
  const omitted = entry.members.length - members.length;
  if (omitted > 0) {
    lines.push(`  // … ${String(omitted)} more members in the API reference`);
  }
  if (header.closes) {
    lines.push('}');
  }
  return lines;
};

/**
 * A member of a container: its declaration, plus the fields of a small nested
 * record (a namespace's `ExtrudeLinearOptions`), which a bare header would hide.
 */
const renderMember = (member: ApiEntry): readonly string[] => {
  const nested = member.members ?? [];
  const whole = nested.length > 0 ? renderEntry(member, nested) : [];
  return whole.length > 0 && estimateTokens(whole.join('\n')) <= smallReferencedTokens
    ? whole.map((line) => `  ${line}`)
    : renderLeaf(member, '  ');
};

const displayName = (entry: ApiEntry): string =>
  entry.path === undefined ? entry.name : `${entry.path}.${entry.name}`;

/** The names a pin may use for an entry: bare, path-qualified, or container-qualified. */
const pinNames = (entry: ApiEntry, container?: ApiEntry): readonly string[] => {
  const names = [entry.name, displayName(entry)];
  if (container !== undefined) {
    names.push(`${container.name}.${entry.name}`);
  }
  return names;
};

type Candidate = {
  readonly entry: ApiEntry;
  readonly group: string;
  readonly fence: string;
};

type SourceIndex = {
  readonly candidates: readonly Candidate[];
  readonly byName: ReadonlyMap<string, Candidate>;
};

type Ordering = {
  readonly ordered: readonly Candidate[];
  /** Members pinned by `Container.member`, per container id. */
  readonly pinnedMembers: ReadonlyMap<string, ReadonlySet<string>>;
  /** Containers pinned with `.*`. */
  readonly allMembers: ReadonlySet<string>;
};

/** Every offered top-level entry, plus a lookup by each name a pin may use. */
const indexSources = (sources: readonly CoreSource[], { exclude, groupBy: regroup }: CoreApiOptions): SourceIndex => {
  const candidates: Candidate[] = [];
  const byName = new Map<string, Candidate>();
  const seen = new Set<string>();
  for (const { corpus, groupBy } of sources) {
    const fence = fenceLanguage[corpus.metadata.language];
    for (const entry of corpus.entries) {
      if (seen.has(entry.id) || exclude?.(entry) === true) {
        continue;
      }
      seen.add(entry.id);
      const candidate = { entry, group: regroup?.(entry, corpus.metadata.packageName) ?? groupBy(entry), fence };
      candidates.push(candidate);
      for (const name of pinNames(entry)) {
        if (!byName.has(name)) {
          byName.set(name, candidate);
        }
      }
    }
  }
  return { candidates, byName };
};

/** Pins as written, then the remaining entries by their own score plus their members' scores. */
const orderCandidates = (
  { candidates, byName }: SourceIndex,
  total: (entry: ApiEntry) => number,
  options: CoreApiOptions,
): Ordering => {
  const pinnedMembers = new Map<string, Set<string>>();
  const allMembers = new Set<string>();
  const ordered: Candidate[] = [];
  const placed = new Set<string>();
  const place = (candidate: Candidate): void => {
    if (!placed.has(candidate.entry.id)) {
      placed.add(candidate.entry.id);
      ordered.push(candidate);
    }
  };
  for (const pin of options.pins ?? []) {
    const wholeContainer = pin.endsWith('.*');
    const name = wholeContainer ? pin.slice(0, -2) : pin;
    const direct = byName.get(name);
    if (direct !== undefined) {
      if (wholeContainer) {
        allMembers.add(direct.entry.id);
      }
      place(direct);
      continue;
    }
    const dot = name.lastIndexOf('.');
    const container = dot === -1 ? undefined : byName.get(name.slice(0, dot));
    const member = container?.entry.members?.find((candidate) => candidate.name === name.slice(dot + 1));
    if (container === undefined || member === undefined) {
      throw new Error(`core pin ${pin} names no entry in the corpus`);
    }
    const kept = pinnedMembers.get(container.entry.id) ?? new Set<string>();
    kept.add(member.id);
    pinnedMembers.set(container.entry.id, kept);
    place(container);
  }
  const ranked = candidates
    .filter((candidate) => !placed.has(candidate.entry.id))
    .filter(
      (candidate) =>
        (options.includeUnused === true || total(candidate.entry) > 0) &&
        candidate.entry.deprecated === undefined &&
        hasDeclaration(candidate.entry),
    )
    .toSorted(
      (left, right) => total(right.entry) - total(left.entry) || left.entry.id.localeCompare(right.entry.id, 'en'),
    );
  return { ordered: [...ordered, ...ranked], pinnedMembers, allMembers };
};

/** A record, option or enum type with something to show: an opaque `bool` or `Face` adds a line and no information. */
const isRecordKind = (entry: ApiEntry): boolean =>
  (entry.kind === 'interface' || entry.kind === 'type' || entry.kind === 'enum') && hasDeclaration(entry);

/** Whether an entry shows more than its own name: a bare module or opaque type is left to the reference. */
const hasDeclaration = (entry: ApiEntry): boolean =>
  (entry.members?.length ?? 0) > 0 || declarationText(entry) !== entry.name;

/** Type names after `extends` or `implements` on an entry's declaration line. */
const heritageNames = (entry: ApiEntry): readonly string[] =>
  /\b(?:extends|implements)\b(.*)$/u
    .exec(declarationText(entry).split('\n')[0] ?? '')?.[1]
    ?.match(/[$A-Z_a-z][\w$]*/gu) ?? [];

/** A rendered block without its summary comments, so prose words never name a type. */
const declarationOnly = (block: string): string =>
  block
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/**
 * Choose and render one owner's core section.
 *
 * Order: pins as written, then the remaining top-level entries by their own
 * score plus the scores of their members. A container shows every member when
 * it is small or pinned with `.*`, and otherwise only the members with observed
 * use. A small record or option type named by a shown signature follows it, so
 * an agent sees `cuboid(options)` beside the fields of `CuboidOptions`. Entries
 * that do not fit are skipped rather than truncated, so every rendered block is
 * a complete declaration.
 *
 * @param sources - The primary corpus, then any supplemental authoring corpus.
 * @param ranking - The owner's committed usage ranking, if one exists.
 * @param options - Budget, pins and exclusions.
 * @returns The section, or `undefined` when nothing qualifies.
 * @public
 */
export const renderCoreApi = (
  sources: readonly CoreSource[],
  ranking: UsageRanking | undefined,
  options: CoreApiOptions,
): RenderedCore | undefined => {
  const score = new Map((ranking?.symbols ?? []).map((symbol) => [symbol.id, symbol.score]));
  const scoreOf = (entry: ApiEntry): number => score.get(entry.id) ?? 0;
  const memberScore = (entry: ApiEntry): number =>
    (entry.members ?? []).reduce((sum, member) => sum + scoreOf(member) + memberScore(member), 0);
  const total = (entry: ApiEntry): number => scoreOf(entry) + memberScore(entry);

  const index = indexSources(sources, options);
  const { byName } = index;
  const { ordered, pinnedMembers, allMembers } = orderCandidates(index, total, options);

  const chooseMembers = (entry: ApiEntry): readonly ApiEntry[] => {
    // A member with no type or signature would print as a bare name and say nothing.
    const members = (entry.members ?? []).filter((member) => hasDeclaration(member));
    if (allMembers.has(entry.id) || memberWeight(entry) <= smallContainerTokens) {
      return members;
    }
    const pinned = pinnedMembers.get(entry.id) ?? new Set<string>();
    return members.filter((member) => pinned.has(member.id) || total(member) > 0);
  };

  const shown = new Set<string>();
  /** Interfaces a shown class implements or extends: the class block already lists their used members. */
  const coveredByClass = new Set<string>();
  const groups = new Map<string, { readonly fence: string; readonly blocks: string[] }>();
  const header = ['## Core API', ''];
  const intro =
    'The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.';
  let tokens = estimateTokens([...header, intro, ''].join('\n'));
  let lineCount = header.length + 2;
  const budgetLines = options.budgetLines ?? defaultBudgetLines;

  const add = (candidate: Candidate, entry: ApiEntry, members: readonly ApiEntry[]): boolean => {
    const block = renderEntry(entry, members).join('\n');
    const group = groups.get(candidate.group);
    const groupCost =
      group === undefined ? estimateTokens(`### ${candidate.group}\n\n\`\`\`${candidate.fence}\n\`\`\`\n`) : 0;
    const cost = estimateTokens(block) + 1 + groupCost;
    // A new group adds its heading, a blank line, both fences and a trailing blank; a later block adds one blank.
    const blockLines = block.split('\n').length + (group === undefined ? 5 : 1);
    if (tokens + cost > options.budgetTokens || lineCount + blockLines > budgetLines) {
      return false;
    }
    tokens += cost;
    lineCount += blockLines;
    if (group === undefined) {
      groups.set(candidate.group, { fence: candidate.fence, blocks: [block] });
    } else {
      group.blocks.push(block);
    }
    for (const id of [entry.id, ...members.map((member) => member.id)]) {
      shown.add(id);
    }
    if (entry.kind === 'class') {
      for (const name of heritageNames(entry)) {
        coveredByClass.add(name);
      }
    }
    return true;
  };

  /** Small record and option types a shown declaration names, not yet shown. */
  const referenced = (text: string): readonly Candidate[] =>
    [...new Set(declarationOnly(text).match(/[$A-Z_a-z][\w$]*/gu) ?? [])]
      .map((identifier) => byName.get(identifier))
      .filter(
        (target): target is Candidate =>
          target !== undefined && !shown.has(target.entry.id) && isRecordKind(target.entry),
      )
      .filter(
        (target) =>
          estimateTokens(renderEntry(target.entry, target.entry.members ?? []).join('\n')) <= smallReferencedTokens,
      );

  const offer = (candidate: Candidate): void => {
    const members = chooseMembers(candidate.entry);
    if (!add(candidate, candidate.entry, members)) {
      return;
    }
    // Two levels: `toHaveCircularHole(expected)` brings its expectation type, which brings the axis type it names.
    let level = referenced(renderEntry(candidate.entry, members).join('\n'));
    for (let depth = 0; depth < 2 && level.length > 0; depth += 1) {
      const added = level
        .filter((target) => !coveredByClass.has(target.entry.name) && !shown.has(target.entry.id))
        .filter((target) => add({ ...target, group: candidate.group }, target.entry, target.entry.members ?? []));
      level = added.flatMap((target) => referenced(renderEntry(target.entry, target.entry.members ?? []).join('\n')));
    }
  };

  /** Interfaces an offered class implements: offered after the classes, and only if no shown class covers them. */
  const implementedByOffered = new Set(
    ordered
      .filter((candidate) => candidate.entry.kind === 'class')
      .flatMap((candidate) => heritageNames(candidate.entry)),
  );
  const deferred: Candidate[] = [];
  for (const candidate of ordered) {
    const isInterface = candidate.entry.kind === 'interface';
    if (shown.has(candidate.entry.id) || (isInterface && coveredByClass.has(candidate.entry.name))) {
      continue;
    }
    if (isInterface && implementedByOffered.has(candidate.entry.name)) {
      deferred.push(candidate);
      continue;
    }
    offer(candidate);
  }
  for (const candidate of deferred) {
    if (!shown.has(candidate.entry.id) && !coveredByClass.has(candidate.entry.name)) {
      offer(candidate);
    }
  }

  if (groups.size === 0) {
    return undefined;
  }
  const lines = [...header, intro, ''];
  for (const [title, group] of groups) {
    const body =
      group.fence === 'python'
        ? nativeComments(group.blocks.join('\n\n').split('\n'), 'python').join('\n')
        : group.blocks.join('\n\n');
    lines.push(`### ${title}`, '', `\`\`\`${group.fence}`, body, '```', '');
  }
  const markdown = `${lines.join('\n').trimEnd()}\n`;
  return { markdown, tokens: estimateTokens(markdown), ids: [...shown].toSorted() };
};
