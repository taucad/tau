/**
 * Reject Grafana provisioning that Grafana itself refuses at boot.
 *
 * Grafana caps alert-rule and dashboard UIDs at 40 characters. One over-long
 * alert UID fails alerting provisioning and the Grafana server exits, taking
 * every local dashboard down with it.
 *
 * Usage: pnpm nx run scripts:validate-grafana
 */
import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

const maxUidLength = 40;

type UidSource = { readonly file: string; readonly kind: 'alert rule' | 'dashboard'; readonly uids: readonly string[] };

export const grafanaUidProblems = (sources: readonly UidSource[]): string[] => {
  const problems: string[] = [];
  for (const { file, kind, uids } of sources) {
    // The alerts/*.json groups and the provisioned alerts.yaml describe the same rules, so duplicates are per file.
    const seen = new Set<string>();
    for (const uid of uids) {
      if (uid.length === 0 || uid.length > maxUidLength) {
        problems.push(`${file}: ${kind} UID "${uid}" must be 1-${maxUidLength} characters (has ${uid.length})`);
      }
      if (seen.has(uid)) {
        problems.push(`${file}: duplicate ${kind} UID "${uid}"`);
      }
      seen.add(uid);
    }
  }
  return problems;
};

type RuleGroup = {
  /** Provisioning files name a group; Cloud's rule-group JSON titles it. */
  readonly name?: string;
  readonly title?: string;
  /** `"60s"` in provisioning, seconds in Cloud's JSON. */
  readonly interval?: string | number;
  readonly rules?: ReadonlyArray<{ readonly uid?: string }>;
};

/** A rule with line breaks and their indentation folded to one space, so YAML line folding is not a difference. */
const comparable = (rule: unknown): unknown =>
  JSON.parse(
    JSON.stringify(rule, (_key, value: unknown) =>
      typeof value === 'string' ? value.replaceAll(/\s*\n\s*/gu, ' ').trim() : value,
    ),
  );

const durationUnits: Readonly<Record<string, number>> = { h: 3600, m: 60, s: 1 };

/** Seconds in a Grafana group interval (`60`, `"60s"`, `"1m30s"`, `"1h"`), or undefined when unreadable. */
const seconds = (interval: RuleGroup['interval']): number | undefined => {
  if (typeof interval === 'number') {
    return interval;
  }
  if (!/^(?:\d+[hms])+$/u.test(interval ?? '')) {
    return undefined;
  }
  return [...(interval ?? '').matchAll(/(?<count>\d+)(?<unit>[hms])/gu)].reduce(
    (total, { groups }) => total + Number(groups?.['count']) * (durationUnits[groups?.['unit'] ?? ''] ?? 0),
    0,
  );
};

const repeated = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
};

const duplicates = (groups: readonly RuleGroup[], where: string): string[] => [
  ...repeated(groups.map((group) => group.name ?? group.title ?? '')).map(
    (name) => `alert group "${name}" appears more than once in ${where}`,
  ),
  ...repeated(groups.flatMap((group) => group.rules ?? []).map((rule) => rule.uid ?? '')).map(
    (uid) => `alert rule "${uid}" appears more than once in ${where}`,
  ),
];

/**
 * The local provisioning copy must carry exactly the Grafana Cloud rule groups: the same groups with
 * the same intervals and members, and each rule field for field (queries, thresholds, waits, no-data
 * handling, labels and annotations). A local stack otherwise cannot show a page Cloud would send, or
 * shows one it would not.
 */
export const alertParityProblems = (provisioned: readonly RuleGroup[], cloud: readonly RuleGroup[]): string[] => {
  const byUid = (groups: readonly RuleGroup[]) =>
    new Map(groups.flatMap((group) => group.rules ?? []).map((rule) => [rule.uid ?? '', rule] as const));
  const byName = (groups: readonly RuleGroup[]) =>
    new Map(
      groups.map((group) => [
        group.name ?? group.title ?? '',
        { interval: seconds(group.interval), uids: (group.rules ?? []).map((rule) => rule.uid).toSorted() },
      ]),
    );
  const local = byUid(provisioned);
  const remote = byUid(cloud);
  const localGroups = byName(provisioned);
  const remoteGroups = byName(cloud);
  return [
    ...duplicates(cloud, 'infra/grafana/alerts'),
    ...duplicates(provisioned, 'alerts.yaml'),
    ...[...remoteGroups.keys()]
      .filter((name) => !localGroups.has(name))
      .map((name) => `alert group "${name}" is missing locally`),
    ...[...localGroups.keys()]
      .filter((name) => !remoteGroups.has(name))
      .map((name) => `alert group "${name}" is missing in Cloud`),
    ...[...remoteGroups]
      .filter(([name, group]) => localGroups.has(name) && !isDeepStrictEqual(localGroups.get(name), group))
      .map(
        ([name]) =>
          `alert group "${name}" has a different interval or rules between alerts.yaml and infra/grafana/alerts`,
      ),
    ...[...remote.keys()].filter((uid) => !local.has(uid)).map((uid) => `alert rule "${uid}" is missing locally`),
    ...[...local.keys()].filter((uid) => !remote.has(uid)).map((uid) => `alert rule "${uid}" is missing in Cloud`),
    ...[...remote]
      .filter(([uid, rule]) => local.has(uid) && !isDeepStrictEqual(comparable(local.get(uid)), comparable(rule)))
      .map(([uid]) => `alert rule "${uid}" differs between alerts.yaml and infra/grafana/alerts`),
  ];
};

const ruleUids = (groups: readonly RuleGroup[]): string[] =>
  groups.flatMap((group) => (group.rules ?? []).flatMap((rule) => (rule.uid === undefined ? [] : [rule.uid])));

const jsonFiles = (directory: string): string[] =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(directory, name));

const main = (): void => {
  const grafanaRoot = resolve(import.meta.dirname, '../../infra/grafana');
  const provisionedAlerts = join(grafanaRoot, 'provisioning/alerting/alerts.yaml');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Grafana's provisioning file shape
  const provisioned = load(readFileSync(provisionedAlerts, 'utf8')) as { groups?: RuleGroup[] };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Grafana's rule-group and dashboard JSON shapes
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as RuleGroup & { uid?: string };

  const sources: UidSource[] = [
    { file: provisionedAlerts, kind: 'alert rule', uids: ruleUids(provisioned.groups ?? []) },
    ...jsonFiles(join(grafanaRoot, 'alerts')).map(
      (file): UidSource => ({ file, kind: 'alert rule', uids: ruleUids([read(file)]) }),
    ),
    ...jsonFiles(join(grafanaRoot, 'dashboards')).map(
      (file): UidSource => ({ file, kind: 'dashboard', uids: [read(file).uid ?? ''] }),
    ),
  ];

  const problems = [
    ...grafanaUidProblems(sources),
    ...alertParityProblems(
      provisioned.groups ?? [],
      jsonFiles(join(grafanaRoot, 'alerts')).map((file) => read(file)),
    ),
  ];
  if (problems.length > 0) {
    throw new Error(`Invalid Grafana provisioning:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }

  console.log(`✓ ${sources.length} Grafana provisioning files have valid UIDs`);
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
