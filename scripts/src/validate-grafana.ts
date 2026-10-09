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

type RuleGroup = { readonly rules?: ReadonlyArray<{ readonly uid?: string }> };

/** A rule with every string's whitespace squashed, so YAML line folding is not a difference. */
const comparable = (rule: unknown): unknown =>
  JSON.parse(
    JSON.stringify(rule, (_key, value: unknown) =>
      typeof value === 'string' ? value.replaceAll(/\s+/gu, ' ').trim() : value,
    ),
  );

/**
 * The local provisioning copy must carry exactly the Grafana Cloud rules, field for field: queries,
 * thresholds, waits, no-data handling, labels and annotations. A local stack otherwise cannot show a
 * page Cloud would send, or shows one it would not.
 */
export const alertParityProblems = (provisioned: readonly RuleGroup[], cloud: readonly RuleGroup[]): string[] => {
  const byUid = (groups: readonly RuleGroup[]) =>
    new Map(groups.flatMap((group) => group.rules ?? []).map((rule) => [rule.uid ?? '', rule] as const));
  const local = byUid(provisioned);
  const remote = byUid(cloud);
  return [
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
