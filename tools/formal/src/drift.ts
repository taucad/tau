import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AnyStateMachine } from 'xstate';
import { canonicalJson } from '#graph.js';

/**
 * `<Module>/drift.json` (FM-R13): what a spec is tied to, hashed or listed so a change forces a spec touch.
 *
 * @public
 */
export type DriftManifest = {
  /** Public event types, or a seam's frame kinds and verbs. */
  readonly alphabet: readonly string[];
  /** Machine id → its `version` (W2 MC-R21), one per machine the spec covers. */
  readonly versions?: Readonly<Record<string, string>>;
  /** Legality or timeout table path → sha256. */
  readonly tables: Readonly<Record<string, string>>;
  /** Owner-chosen code slice → sha256, for specs without a machine. */
  readonly sources?: Readonly<Record<string, string>>;
  /** `<machine>#<state>.<eventType>` → its transition's `meta.tla` (W2 MC-R27). */
  readonly actions?: Readonly<Record<string, string>>;
  /** `.tla` path → sha256. */
  readonly specs: Readonly<Record<string, string>>;
};

type NodeLike = {
  readonly id: string;
  readonly states?: Readonly<Record<string, NodeLike>>;
  readonly transitions?: ReadonlyMap<string, ReadonlyArray<{ readonly meta?: unknown }>>;
};

const nodesOf = (node: NodeLike): NodeLike[] => [
  node,
  ...Object.values(node.states ?? {}).flatMap((child) => nodesOf(child)),
];

const isPublic = (eventType: string): boolean =>
  eventType !== '' && !eventType.startsWith('xstate.') && eventType !== '*';

/**
 * The event types a machine's states handle, less `xstate.*` and eventless entries, sorted.
 *
 * @public
 */
export const machineAlphabet = (machines: readonly AnyStateMachine[]): string[] =>
  [
    ...new Set(
      machines.flatMap((machine) =>
        nodesOf(machine.root as unknown as NodeLike).flatMap((node) => [...(node.transitions?.keys() ?? [])]),
      ),
    ),
  ]
    .filter((eventType) => isPublic(eventType))
    .sort();

/**
 * Each transition's static `meta.tla`, keyed `<machine>#<state>.<eventType>`; read off the config, so no run is needed.
 *
 * @public
 */
export const machineActions = (machines: readonly AnyStateMachine[]): Record<string, string> => {
  const tlaOf = (definition: { readonly meta?: unknown }): unknown =>
    (definition.meta as { readonly tla?: unknown } | undefined)?.tla;
  const actions = machines
    .flatMap((machine) => nodesOf(machine.root as unknown as NodeLike))
    .flatMap((node) =>
      [...(node.transitions ?? [])].flatMap(([eventType, transitions]) =>
        transitions
          .map((definition) => tlaOf(definition))
          .filter((tla): tla is string => typeof tla === 'string')
          .map((tla): [string, string] => [`${node.id}.${eventType}`, tla]),
      ),
    );
  return Object.fromEntries(actions.sort(([left], [right]) => (left < right ? -1 : 1)));
};

/**
 * A file's SHA-256, in hex.
 *
 * @public
 */
export const sha256Of = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * Hashes each path relative to `root`, sorted.
 *
 * @public
 */
export const hashFiles = (root: string, files: readonly string[]): Record<string, string> =>
  Object.fromEntries([...files].sort().map((file) => [file, sha256Of(path.join(root, file))]));

/**
 * Operators a spec defines, read from its text (`Name ==` or `Name(args) ==` at the start of a line).
 *
 * @public
 */
export const specOperators = (tla: string): Set<string> =>
  new Set([...tla.matchAll(/^(\w+)\s*(?:\([^)]*\))?\s*==/gm)].map((match) => match[1] ?? ''));

/**
 * The correspondence check between a machine and its spec's alphabet: every `meta.tla` names an
 * operator the spec defines, and every action in `next` is named by a transition or listed as an
 * environment action (crash, freeze, delivery). A machine with no `meta.tla` yet has no actions,
 * and the check starts with its first annotated transition.
 *
 * @public
 */
export const checkActionCorrespondence = (
  actions: Readonly<Record<string, string>>,
  spec: {
    readonly operators: ReadonlySet<string>;
    readonly next: readonly string[];
    readonly environment: readonly string[];
  },
): string[] => {
  const named = new Set(Object.values(actions));
  if (named.size === 0) {
    return [];
  }
  return [
    ...[...named]
      .filter((action) => !spec.operators.has(action))
      .map((action) => `meta.tla names ${action}, which the spec does not define`),
    ...spec.next
      .filter((action) => !named.has(action) && !spec.environment.includes(action))
      .map((action) => `spec action ${action} is named by no transition and is not an environment action`),
  ].sort();
};

/**
 * The committed text of a drift manifest: canonical JSON, one trailing newline.
 *
 * @public
 */
export const serializeManifest = (manifest: DriftManifest): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(manifest)), undefined, 2)}\n`;

const changed = (committed: DriftManifest, rebuilt: DriftManifest, key: keyof DriftManifest): boolean =>
  canonicalJson(committed[key] ?? {}) !== canonicalJson(rebuilt[key] ?? {});

/**
 * Every part of the manifest that moved; empty when the committed manifest is current.
 *
 * @public
 */
export const checkDriftManifest = (file: string, rebuilt: DriftManifest): string[] => {
  if (!existsSync(file)) {
    return [`${file} does not exist; run formal update`];
  }
  const committed = JSON.parse(readFileSync(file, 'utf8')) as DriftManifest;
  return (['alphabet', 'versions', 'tables', 'sources', 'actions', 'specs'] as const)
    .filter((key) => changed(committed, rebuilt, key))
    .map(
      (key) => `${path.basename(path.dirname(file))}/drift.json: ${key} changed; touch the spec and run formal update`,
    );
};

/**
 * Why `formal update` refuses to rewrite a manifest (FM-R13), or `undefined` when it may:
 * the alphabet, tables, sources or actions moved while no spec file did, or the alphabet moved
 * while no machine's `version` did.
 *
 * @public
 */
export const refuseDriftUpdate = (committed: DriftManifest, rebuilt: DriftManifest): string | undefined => {
  const moved = (['alphabet', 'tables', 'sources', 'actions'] as const).filter((key) =>
    changed(committed, rebuilt, key),
  );
  if (moved.length > 0 && !changed(committed, rebuilt, 'specs')) {
    return `${moved.join(', ')} changed but no spec file did: change the spec first (models before code)`;
  }
  if (
    changed(committed, rebuilt, 'alphabet') &&
    committed.versions !== undefined &&
    !changed(committed, rebuilt, 'versions')
  ) {
    return 'the alphabet changed but no machine version did: bump the machine version (MC-R21)';
  }
  return undefined;
};

/**
 * The owner test's entry point: under `FORMAL_UPDATE=1` rewrite the manifest (subject to the
 * refusals), otherwise report what moved.
 *
 * @public
 */
export const driftManifestProblems = (
  file: string,
  rebuilt: DriftManifest,
  update = process.env['FORMAL_UPDATE'] === '1',
): string[] => {
  if (!update) {
    return checkDriftManifest(file, rebuilt);
  }
  if (existsSync(file)) {
    const refusal = refuseDriftUpdate(JSON.parse(readFileSync(file, 'utf8')) as DriftManifest, rebuilt);
    if (refusal) {
      return [refusal];
    }
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serializeManifest(rebuilt));
  return [];
};

/**
 * A row of W4's timeout table (T9): `site` is a repository path, `token` the constant or key found there.
 *
 * @public
 */
export type TimeoutRow = {
  readonly id: string;
  readonly site: string;
  readonly token: string;
  readonly class: string;
  readonly owner: string;
  readonly fixedBy?: string;
};

const timerPattern = /\bset(?:Timeout|Interval)\s*\(|\bafter\s*:|\btimeout\s*:|\bdelay\s*:/;

/** How many lines after a timer site a row's token may appear (a delay key on the next line). */
const tokenWindow = 3;

/**
 * The timer gate (W4 SC-A8): a timer site with no row, a row whose token is gone from its site, and a
 * peer row with no `fixedBy`. `files` maps each scanned repository path to its text.
 * ponytail: a token scan; an AST walk if aliased timers slip past it.
 *
 * @public
 */
export const checkTimerInventory = (
  files: Readonly<Record<string, string>>,
  table: readonly TimeoutRow[],
): string[] => {
  const problems: string[] = [];
  for (const [site, text] of Object.entries(files)) {
    const lines = text.split('\n');
    const rows = table.filter((row) => row.site === site);
    for (const [index, line] of lines.entries()) {
      if (!timerPattern.test(line)) {
        continue;
      }
      const window = lines.slice(index, index + 1 + tokenWindow).join('\n');
      if (!rows.some((row) => window.includes(row.token))) {
        problems.push(`${site}:${index + 1}: timer site with no timeout-table row`);
      }
    }
  }
  for (const row of table) {
    const text = files[row.site];
    if (text !== undefined && !text.includes(row.token)) {
      problems.push(`${row.id}: token ${row.token} no longer appears in ${row.site}`);
    }
    if (row.class.toLowerCase() === 'peer' && row.fixedBy === undefined) {
      problems.push(`${row.id}: a peer wait names the work package that deletes it (fixedBy)`);
    }
  }
  return problems;
};
