/**
 * Usage collector: which API symbols each skill owner's authors actually use.
 *
 * Scans `libs/tau-examples`, the operator's workspace roots and their chat
 * event logs, attributes each model file to one owner by extension and imports,
 * and counts every corpus symbol by document frequency — distinct files, or
 * distinct agent runs that looked it up. The committed output carries symbol
 * ids and counts only: no paths, project names, prompts or file contents, and
 * no timestamps, so a given input always produces the same bytes.
 *
 * Run: `pnpm nx run api-extractor:collect-usage` (roots overridable with
 * repeated `--workspace=<dir>` or `TAU_USAGE_WORKSPACES`, path-delimiter separated).
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import type { BundleOwner } from '#bundle/generate.js';
import type { ApiCorpus, ApiEntry, ApiEntryKind } from '#model/api-corpus.types.js';

/** One owner's corpus sources, as the bundle owner table declares them. @internal */
export type UsageOwner = Pick<BundleOwner, 'slug' | 'corpus' | 'supplementalApi'>;

/** One ranked symbol. @internal */
export type UsageSymbol = {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly workspace: number;
  readonly examples: number;
  readonly lookups: number;
};

/** The committed ranking for one owner. @internal */
export type UsageReport = {
  readonly slug: string;
  readonly sources: { readonly workspaceFiles: number; readonly exampleFiles: number; readonly transcriptRuns: number };
  readonly symbols: readonly UsageSymbol[];
};

// ---------------------------------------------------------------------------
// Source text
// ---------------------------------------------------------------------------

const cLikeSyntax = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;
const pythonSyntax = /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu;

/**
 * Remove comments, and string literal contents unless `keepStrings`.
 *
 * One left-to-right alternation, so `//` inside a string is never a comment.
 * Template literals are left alone: their `${}` holes are code.
 *
 * @internal
 */
export const stripSource = (text: string, syntax: 'c' | 'python', keepStrings = false): string =>
  text.replace(syntax === 'python' ? pythonSyntax : cLikeSyntax, (match) =>
    match.startsWith('"') || match.startsWith("'") ? (keepStrings ? match : '""') : ' ',
  );

/** Identifier tokens; `dotted` holds those written as `.name` (member access). @internal */
export type IdentifierTokens = {
  readonly bare: ReadonlySet<string>;
  readonly dotted: ReadonlySet<string>;
  /** Tokens written at least once without a leading dot; `bare` when absent. */
  readonly plain?: ReadonlySet<string>;
};

/** Tokenize identifiers. Every token is in `bare`; member-access tokens are also in `dotted`. @internal */
export const identifierTokens = (code: string): IdentifierTokens => {
  const bare = new Set<string>();
  const dotted = new Set<string>();
  const plain = new Set<string>();
  for (const [, dot, name] of code.matchAll(/(?:(\.)\s*)?(?<![\w$])([A-Za-z_$][\w$]*)/gu)) {
    if (name === undefined) {
      continue;
    }
    bare.add(name);
    (dot === undefined ? plain : dotted).add(name);
  }
  return { bare, dotted, plain };
};

/**
 * Add JSX use to a file's tokens: `<resistor …>` uses the `<resistor>` element
 * and each `name=` attribute inside a tag uses that prop, as `.name` would.
 *
 * @internal
 */
export const withJsxTokens = (code: string, tokens: IdentifierTokens): IdentifierTokens => {
  const bare = new Set(tokens.bare);
  const dotted = new Set(tokens.dotted);
  const plain = new Set(tokens.plain ?? tokens.bare);
  // ponytail: a tag ends at the first `>`, so an arrow inside a prop expression cuts its attribute list short.
  for (const [, tag = '', attributes = ''] of code.matchAll(/<([a-z][\w]*)\b([^>]*)>/gu)) {
    bare.add(`<${tag}>`);
    plain.add(`<${tag}>`);
    for (const [, name = ''] of attributes.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=/gu)) {
      bare.add(name);
      dotted.add(name);
    }
  }
  return { bare, dotted, plain };
};

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

const importOwners: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:replicad|@taucad\/replicad[\w-]*)(?:\/|$)/u, 'cad-replicad'],
  [/^@jscad\/modeling(?:\/|$)/u, 'cad-jscad'],
  [/^manifold-3d(?:\/|$)/u, 'cad-manifold'],
  [/^(?:libcascade|opencascade\.js)(?:\/|$)/u, 'cad-opencascadejs'],
  [/^(?:picovoxel|@taucad\/picovoxel[\w-]*)(?:\/|$)/u, 'cad-picovoxel'],
  [/^(?:tscircuit|@tscircuit\/[\w.-]+)(?:\/|$)/u, 'cad-tscircuit'],
];

const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"'\n]+)\1/gu;

/**
 * The owner slugs a model file belongs to; empty when it is not a model file.
 *
 * @param fileName - Base name or path; only the suffix is read.
 * @param text - File contents.
 * @internal
 */
export const attributeFile = (fileName: string, text: string): readonly string[] => {
  if (/\.d\.ts$|\.(?:test|spec)\.\w+$/u.test(fileName)) {
    return [];
  }
  if (/\.geospec\.(?:ts|js)$/u.test(fileName)) {
    return ['geospec-authoring'];
  }
  const extension = /\.(\w+)$/u.exec(fileName)?.[1];
  switch (extension) {
    case 'scad': {
      return ['cad-openscad'];
    }
    case 'kcl': {
      return ['cad-zoo'];
    }
    case 'cs': {
      return ['cad-picogk'];
    }
    case 'py': {
      return /^\s*(?:from\s+build123d\b|import\s+build123d\b)/mu.test(stripSource(text, 'python', true))
        ? ['cad-build123d']
        : [];
    }
    case 'ts':
    case 'tsx':
    case 'js':
    case 'mjs': {
      const code = stripSource(text, 'c', true);
      const slugs = new Set<string>();
      for (const match of code.matchAll(importSpecifier)) {
        const specifier = match[2] ?? '';
        for (const [pattern, slug] of importOwners) {
          if (pattern.test(specifier)) {
            slugs.add(slug);
          }
        }
      }
      if (slugs.size === 0 && extension === 'tsx' && /<board\b/u.test(code)) {
        slugs.add('cad-tscircuit');
      }
      return [...slugs].sort();
    }
    default: {
      return [];
    }
  }
};

// ---------------------------------------------------------------------------
// Symbol index
// ---------------------------------------------------------------------------

/**
 * One corpus entry as a use is recognised: its id, the container that declares
 * it (empty for a top-level entry or a constructor) and whether only `.name`
 * counts.
 *
 * @internal
 */
export type SymbolRef = { readonly id: string; readonly container: string; readonly dottedOnly: boolean };

/** Corpus entries by the identifier that uses them, plus display names by id. @internal */
export type SymbolIndex = {
  readonly byName: ReadonlyMap<string, readonly SymbolRef[]>;
  readonly names: ReadonlyMap<string, string>;
  /** Type names an entry leads to: a callable's return type, an alias's body, a class's bases. */
  readonly leads: ReadonlyMap<string, readonly string[]>;
};

const identifiersIn = (text: string): readonly string[] => [...new Set(text.match(/[A-Za-z_$][\w$]*/gu) ?? [])];

/**
 * The type names a use of `entry` makes reachable. Text after a signature's last
 * `)` is its return type (`): Drawing;`, `-> Solid | Part`); a type's own text is
 * its alias body or its `extends`/`implements` clause.
 */
const leadsOf = (entry: ApiEntry): readonly string[] => {
  const returns = (entry.signatures ?? []).flatMap((signature) => {
    const close = signature.text.lastIndexOf(')');
    return close === -1 ? [] : identifiersIn(signature.text.slice(close + 1));
  });
  if (entry.type === undefined) {
    return [...new Set(returns)];
  }
  const heritage = /\b(?:extends|implements)\b(.*)$/u.exec(entry.type.text.split('\n')[0] ?? '')?.[1] ?? '';
  const declared = entry.kind === 'class' || entry.kind === 'interface' ? heritage : entry.type.text;
  return [...new Set([...returns, ...identifiersIn(declared)])];
};

const memberKinds: ReadonlySet<ApiEntryKind> = new Set(['method', 'property', 'field', 'enumMember']);
const openContainers: ReadonlySet<ApiEntryKind> = new Set(['namespace', 'module']);

// ponytail: a member name declared by more containers than this, none of them named
// in the file, says nothing about which one is meant (OCCT declares `.Shape` on hundreds).
const maxUnresolvedDeclarers = 16;

/**
 * Index one owner's corpora. Supplemental entries sharing an id with the main
 * corpus are the same symbol (GeoSpec's public surface contains its core one).
 *
 * A top-level entry counts wherever its name appears. A namespace member counts
 * bare too, because JSCAD-style destructuring (`const { cuboid } = primitives`)
 * drops the dot; a class member counts only as `.name`. A constructor counts
 * where its class name appears.
 *
 * @internal
 */
export const indexCorpora = (corpora: readonly ApiCorpus[]): SymbolIndex => {
  const byName = new Map<string, SymbolRef[]>();
  const names = new Map<string, string>();
  const leads = new Map<string, readonly string[]>();
  const push = (key: string, symbol: SymbolRef): void => {
    const existing = byName.get(key);
    if (existing === undefined) {
      byName.set(key, [symbol]);
    } else {
      existing.push(symbol);
    }
  };
  const walk = (entries: readonly ApiEntry[], parent: ApiEntry | undefined): void => {
    for (const entry of entries) {
      if (!names.has(entry.id)) {
        names.set(entry.id, entry.name);
        leads.set(entry.id, leadsOf(entry));
        const declaringType = entry.path?.split('.').at(-1) ?? '';
        if (entry.kind === 'constructor') {
          push(parent?.name ?? (declaringType || entry.name), { id: entry.id, container: '', dottedOnly: false });
        } else if (parent !== undefined) {
          push(entry.name, { id: entry.id, container: parent.name, dottedOnly: !openContainers.has(parent.kind) });
        } else if (memberKinds.has(entry.kind) && declaringType !== '') {
          // A member hoisted to the top level by its corpus (PicoGK's embedding surface).
          push(entry.name, { id: entry.id, container: declaringType, dottedOnly: true });
        } else {
          push(entry.name, { id: entry.id, container: '', dottedOnly: false });
        }
      }
      walk(entry.members ?? [], entry);
    }
  };
  for (const corpus of corpora) {
    walk(corpus.entries, undefined);
  }
  return { byName, names, leads };
};

/**
 * Entry ids a file's tokens use.
 *
 * A top-level entry counts where its name is written without a leading dot, so
 * `shape.translate()` does not credit a free `translate` function. A member name
 * declared by several containers is credited to the containers the file reaches:
 * types it names, plus the types its credited calls return, their aliases and
 * their bases (`draw()` reaches `DrawingPen`, so `.close()` is `DrawingPen.close`).
 * When it reaches none, every declarer is credited unless there are too many to
 * mean anything.
 *
 * @internal
 */
export const usedIds = (index: SymbolIndex, tokens: IdentifierTokens): ReadonlySet<string> => {
  const plain = tokens.plain ?? tokens.bare;
  const reached = new Set(tokens.bare);
  let used = new Set<string>();
  // ponytail: a few rounds of return-type flow reach every chain a model writes; a type checker would be exact.
  for (let round = 0; round < 4; round += 1) {
    const next = new Set<string>();
    const leading = new Set<string>();
    for (const name of tokens.bare) {
      const candidates = (index.byName.get(name) ?? []).filter((candidate) =>
        candidate.container === '' ? plain.has(name) : !candidate.dottedOnly || tokens.dotted.has(name),
      );
      const members = candidates.filter((candidate) => candidate.container !== '');
      const named = members.filter((member) => reached.has(member.container));
      const resolved = [...candidates.filter((candidate) => candidate.container === ''), ...named];
      for (const { id } of resolved) {
        next.add(id);
        leading.add(id);
      }
      // An unresolved fallback is credited but leads nowhere, or one guess would resolve every later name.
      for (const { id } of named.length === 0 && members.length <= maxUnresolvedDeclarers ? members : []) {
        next.add(id);
      }
    }
    const before = reached.size;
    const expand = (ids: Iterable<string>): void => {
      for (const id of ids) {
        for (const lead of index.leads.get(id) ?? []) {
          reached.add(lead);
        }
      }
    };
    expand(leading);
    // A snapshot, so names added this round expand next round.
    const snapshot = new Set(reached);
    for (const name of snapshot) {
      expand((index.byName.get(name) ?? []).filter((symbol) => symbol.container === '').map((symbol) => symbol.id));
    }
    used = next;
    if (reached.size === before) {
      break;
    }
  }
  return used;
};

// ---------------------------------------------------------------------------
// Transcript lookups
// ---------------------------------------------------------------------------

/** Shell verbs and tool-title words that would otherwise match short corpus names. */
const lookupStopWords = new Set(
  `cat sed head tail grep find awk printf echo xargs sort uniq ls pwd cd git status diff files file read
  Read Search search for and the with from print bin zsh bash node python python3 tsx pnpm npx`.split(/\s+/u),
);

/** What one tool input referenced: skill slugs and the identifier tokens it searched for. @internal */
export type LookupReference = { readonly slugs: readonly string[]; readonly tokens: ReadonlySet<string> };

const collectStrings = (value: unknown, into: string[]): void => {
  if (typeof value === 'string') {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, into);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'cwd') {
        collectStrings(item, into);
      }
    }
  }
};

/**
 * Skills and identifiers referenced by one `tool-input` message.
 *
 * A skill is referenced by a path through `.agents/skills/<slug>/` (Tau overlay,
 * `acp-skills/<hash>/` or a temporary ACP copy) or by a Codex search title
 * `Search for '…' in <slug>`. Paths, file names and regex escapes are removed
 * before tokenizing, so only the searched-for words remain.
 *
 * @internal
 */
export const lookupReference = (message: {
  readonly toolName?: unknown;
  readonly content?: unknown;
}): LookupReference => {
  const strings: string[] = [];
  collectStrings([message.toolName, message.content], strings);
  const slugs = new Set<string>();
  const text = strings
    .map((value) =>
      value.replace(/^Search for '([\s\S]*)' in ([a-z\d-]+)$/u, (_match, query: string, slug: string) => {
        slugs.add(slug);
        return query;
      }),
    )
    .join('\n');
  for (const [, slug] of text.matchAll(/\.agents\/skills\/([a-z\d-]+)/gu)) {
    if (slug !== undefined) {
      slugs.add(slug);
    }
  }
  if (slugs.size === 0) {
    return { slugs: [], tokens: new Set() };
  }
  const words = text
    .replaceAll(/\S*\/\S*/gu, ' ')
    .replaceAll(/\S+\.(?:md|json|tsx?|m?js|py|scad|kcl|cs|txt)\b\S*/gu, ' ')
    .replaceAll(/\\[A-Za-z]/gu, ' ')
    .replaceAll(/(?<!\S)--?[\w-]+/gu, ' ');
  const tokens = new Set(
    [...identifierTokens(words).bare].filter((token) => token.length >= 3 && !lookupStopWords.has(token)),
  );
  return { slugs: [...slugs].sort(), tokens };
};

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

const skippedDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'out-tsc',
  'bin',
  'obj',
  'target',
  'coverage',
  '__pycache__',
  'venv',
]);

// ponytail: a core section reads a few hundred symbols; OCCT's reachable surface would commit ~11k (2 MB).
const maxRankedSymbols = 1000;

// ponytail: files above this are generated data (meshes, bundles), not authored models.
const maxModelFileBytes = 2 * 1024 * 1024;

/** Model-file candidates under a root, sorted, skipping dot-directories and build outputs. @internal */
export const listModelFiles = (root: string): readonly string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !skippedDirectories.has(entry.name)) {
          walk(path);
        }
      } else if (entry.isFile() && /\.(?:scad|kcl|cs|py|tsx?|m?js)$/u.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(root);
  return files;
};

/** Chat event logs under a workspace root: `*\/.tau/chats/*\/events.jsonl` and `events/*.jsonl`. @internal */
export const listEventLogs = (root: string): readonly string[] => {
  const logs: string[] = [];
  const directories = (path: string): readonly string[] =>
    existsSync(path)
      ? readdirSync(path, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];
  for (const project of directories(root)) {
    const chats = join(root, project, '.tau', 'chats');
    for (const chat of directories(chats)) {
      const single = join(chats, chat, 'events.jsonl');
      if (existsSync(single)) {
        logs.push(single);
      }
      const split = join(chats, chat, 'events');
      const parts = existsSync(split) ? readdirSync(split).filter((name) => name.endsWith('.jsonl')) : [];
      logs.push(...parts.sort().map((name) => join(split, name)));
    }
  }
  return logs;
};

const parseEventLine = (line: string): EventLine | undefined => {
  try {
    return JSON.parse(line) as EventLine;
  } catch {
    return undefined;
  }
};

/** `tool-input` messages in one event log, with the run that issued each. */
const readToolInputs = (log: string): ReadonlyArray<{ readonly runId: string; readonly message: ToolInput }> =>
  readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.includes('"tool-input"'))
    .flatMap((line) => {
      // A running Tau may be mid-write on its last line; skip what does not parse.
      const event = parseEventLine(line);
      const message = event?.message ?? event?.replacement;
      return message?.role === 'tool-input' && event?.runId !== undefined ? [{ runId: event.runId, message }] : [];
    });

type ToolInput = { readonly role?: string; readonly toolName?: unknown; readonly content?: unknown };

type EventLine = {
  readonly runId?: string;
  readonly message?: ToolInput;
  readonly replacement?: ToolInput;
};

type Tally = {
  readonly workspaceFiles: Set<string>;
  readonly exampleFiles: Set<string>;
  readonly runs: Set<string>;
  readonly workspace: Map<string, Set<string>>;
  readonly examples: Map<string, Set<string>>;
  readonly lookups: Map<string, Set<string>>;
};

const credit = (map: Map<string, Set<string>>, ids: Iterable<string>, document: string): void => {
  for (const id of ids) {
    const documents = map.get(id) ?? new Set<string>();
    documents.add(document);
    map.set(id, documents);
  }
};

/**
 * Rank every corpus-backed owner's symbols by document frequency.
 *
 * Identical file contents count once across all sources, attributed to the first
 * source seen: examples first, then each workspace root in order. Example usage
 * counts per file; workspace usage counts per project (the root's top-level
 * directory), so one large or cloned project weighs as much as one model.
 *
 * @param options - Roots to scan and the owners to rank.
 * @returns One report per owner with a corpus, in owner order.
 * @internal
 */
export const collectUsage = (options: {
  readonly examplesRoot: string;
  readonly workspaceRoots: readonly string[];
  readonly owners: readonly UsageOwner[];
}): readonly UsageReport[] => {
  const owners = options.owners.flatMap((owner) =>
    owner.corpus === undefined
      ? []
      : [
          {
            slug: owner.slug,
            index: indexCorpora([
              owner.corpus(),
              ...(owner.supplementalApi === undefined ? [] : [owner.supplementalApi.corpus()]),
            ]),
          },
        ],
  );
  const tallies = new Map<string, Tally>(
    owners.map(({ slug }) => [
      slug,
      {
        workspaceFiles: new Set(),
        exampleFiles: new Set(),
        runs: new Set(),
        workspace: new Map(),
        examples: new Map(),
        lookups: new Map(),
      },
    ]),
  );
  const indexes = new Map(owners.map(({ slug, index }) => [slug, index]));
  const seen = new Set<string>();

  const scanFiles = (root: string, source: 'examples' | 'workspace'): void => {
    for (const path of listModelFiles(root)) {
      if (statSync(path).size > maxModelFileBytes) {
        continue;
      }
      const text = readFileSync(path, 'utf8');
      const digest = createHash('sha256').update(text).digest('hex');
      if (seen.has(digest)) {
        continue;
      }
      seen.add(digest);
      const slugs = attributeFile(path, text).filter((slug) => tallies.has(slug));
      if (slugs.length === 0) {
        continue;
      }
      const code = stripSource(text, path.endsWith('.py') ? 'python' : 'c');
      const tokens = path.endsWith('.tsx') ? withJsxTokens(code, identifierTokens(code)) : identifierTokens(code);
      for (const slug of slugs) {
        const tally = tallies.get(slug);
        const index = indexes.get(slug);
        if (tally === undefined || index === undefined) {
          continue;
        }
        (source === 'examples' ? tally.exampleFiles : tally.workspaceFiles).add(digest);
        // A workspace symbol counts once per project, so a cloned upstream repository opened as a project cannot outvote authored models.
        const document = source === 'examples' ? digest : `${root}\0${relative(root, path).split(sep)[0] ?? ''}`;
        credit(source === 'examples' ? tally.examples : tally.workspace, usedIds(index, tokens), document);
      }
    }
  };

  scanFiles(options.examplesRoot, 'examples');
  for (const root of options.workspaceRoots) {
    scanFiles(root, 'workspace');
  }

  for (const root of options.workspaceRoots) {
    for (const { runId, message } of listEventLogs(root).flatMap((log) => readToolInputs(log))) {
      const reference = lookupReference(message);
      for (const slug of reference.slugs) {
        const tally = tallies.get(slug);
        const index = indexes.get(slug);
        if (tally === undefined || index === undefined) {
          continue;
        }
        tally.runs.add(runId);
        credit(tally.lookups, usedIds(index, { bare: reference.tokens, dotted: reference.tokens }), runId);
      }
    }
  }

  return owners.map(({ slug, index }) => {
    const tally = tallies.get(slug);
    if (tally === undefined) {
      throw new Error(`missing tally for ${slug}`);
    }
    const ids = new Set([...tally.workspace.keys(), ...tally.examples.keys(), ...tally.lookups.keys()]);
    const symbols = [...ids]
      .map((id): UsageSymbol => {
        const workspace = tally.workspace.get(id)?.size ?? 0;
        const examples = tally.examples.get(id)?.size ?? 0;
        const lookups = tally.lookups.get(id)?.size ?? 0;
        return {
          id,
          name: index.names.get(id) ?? id,
          score: workspace + examples + lookups,
          workspace,
          examples,
          lookups,
        };
      })
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, maxRankedSymbols);
    return {
      slug,
      sources: {
        workspaceFiles: tally.workspaceFiles.size,
        exampleFiles: tally.exampleFiles.size,
        transcriptRuns: tally.runs.size,
      },
      symbols,
    };
  });
};

/** Write one `<slug>.json` per report: 2-space JSON and a trailing newline. @internal */
export const writeUsageReports = (reports: readonly UsageReport[], outDirectory: string): void => {
  mkdirSync(outDirectory, { recursive: true });
  for (const report of reports) {
    writeFileSync(join(outDirectory, `${report.slug}.json`), `${JSON.stringify(report, undefined, 2)}\n`, 'utf8');
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string', multiple: true },
      out: { type: 'string', default: 'src/generated/usage' },
    },
  });
  const workspaceRoots = values.workspace ??
    process.env['TAU_USAGE_WORKSPACES']?.split(delimiter).filter(Boolean) ?? [
      join(homedir(), 'Documents/tau-workspace'),
      join(homedir(), 'Library/Application Support/Tau/home'),
    ];
  const missing = workspaceRoots.filter((root) => !existsSync(root));
  if (missing.length > 0) {
    // Refuse rather than silently overwrite committed rankings with weaker data.
    throw new Error(`workspace root not found: ${missing.join(', ')}`);
  }
  const { bundleOwners } = await import('#bundle/generate.js');
  const reports = collectUsage({
    examplesRoot: fileURLToPath(new URL('../../../tau-examples/src', import.meta.url)),
    workspaceRoots,
    owners: bundleOwners,
  });
  writeUsageReports(reports, values.out);
  for (const report of reports) {
    const { workspaceFiles, exampleFiles, transcriptRuns } = report.sources;
    console.log(
      `${report.slug}: ${String(workspaceFiles)} workspace files, ${String(exampleFiles)} example files, ${String(transcriptRuns)} runs, ${String(report.symbols.length)} symbols`,
    );
  }
}
