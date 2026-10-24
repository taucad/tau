/**
 * Reject Grafana provisioning that Grafana itself refuses at boot.
 *
 * Grafana caps alert-rule and dashboard UIDs at 40 characters. One over-long
 * alert UID fails alerting provisioning and the Grafana server exits, taking
 * every local dashboard down with it.
 *
 * It also holds the rule contract Tau Cloud's renderer depends on (W14 OB1): a cloud-handbook
 * runbook and a routable severity on every rule, trigger labels on every `info` rule, and rule UIDs
 * unique within the 20 characters hosted provisioning keeps. With `--log-sample`, it instead checks
 * captured storage logs for grant, receipt-signature and presigned-signature values.
 *
 * Usage: pnpm nx run scripts:validate-grafana
 *        node scripts/src/validate-grafana.ts --log-sample <file>...
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

const maxUidLength = 40;

type UidSource = {
  readonly file: string;
  readonly kind: 'alert rule' | 'dashboard';
  readonly uids: readonly string[];
};

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

/**
 * Runtime observability T32 (FR-26): a dashboard UID names one file. Deployment keys hosted dashboards
 * on the UID, so two files with one UID (the process dashboard `runtime.json` and the runtime operations
 * dashboard, say) would overwrite each other.
 */
export const dashboardUidProblems = (sources: readonly UidSource[]): string[] => {
  const files = Map.groupBy(
    sources.filter(({ kind }) => kind === 'dashboard').flatMap(({ file, uids }) => uids.map((uid) => ({ file, uid }))),
    ({ uid }) => uid,
  );
  return [...files]
    .filter(([, owners]) => owners.length > 1)
    .map(
      ([uid, owners]) =>
        `dashboard UID "${uid}" is used by ${owners.map(({ file }) => basename(file)).join(', ')}; each dashboard needs its own UID`,
    );
};

type RuleGroup = {
  /** Provisioning files name a group; Cloud's rule-group JSON titles it. */
  readonly name?: string;
  readonly title?: string;
  /** `"60s"` in provisioning, seconds in Cloud's JSON. */
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Grafana's own rule-group key
  readonly interval?: string | number;
  readonly rules?: readonly AlertRule[];
};

type AlertRule = {
  readonly uid?: string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly annotations?: Readonly<Record<string, string>>;
};

/** Tau Cloud routes `critical` and `warning` to the operator contact and `info` (trigger rules) to email only. */
const ruleSeverities = ['critical', 'warning', 'info'] as const;

/** A page in the private cloud handbook; Tau Brain's CI checks that the path exists. */
const runbookPattern = /^docs\/handbooks\/cloud\/(?:[\w-]+\/)*[\w-]+\.md$/u;

/** Labels an `info` rule needs so the trigger table can name what fired and which package it charters. */
const triggerLabels = ['trigger', 'package'] as const;

/**
 * W14 OB1 (a): every rule names a cloud-handbook runbook and a routable severity, and every `info`
 * rule is a labelled trigger. An `info` rule without them would reach the email-only contact with
 * nothing to say what to charter.
 */
export const alertRuleProblems = (file: string, groups: readonly RuleGroup[]): string[] =>
  groups.flatMap((group) =>
    (group.rules ?? []).flatMap((rule) => {
      const subject = `${file}: alert rule "${rule.uid ?? ''}"`;
      const runbook = rule.annotations?.['runbook_url'];
      const severity = rule.labels?.['severity'];
      const problems: string[] = [];
      if (runbook === undefined || !runbookPattern.test(runbook)) {
        problems.push(
          `${subject} needs annotations.runbook_url naming a docs/handbooks/cloud/**.md page (has ${runbook === undefined ? 'none' : JSON.stringify(runbook)})`,
        );
      }
      if (!ruleSeverities.some((known) => known === severity)) {
        problems.push(
          `${subject} needs label severity ${ruleSeverities.slice(0, -1).join(', ')} or ${ruleSeverities.at(-1)} (has ${severity === undefined ? 'none' : JSON.stringify(severity)})`,
        );
      }
      if (severity === 'info') {
        const missing = [
          ...(rule.labels?.['kind'] === 'trigger' ? [] : ['kind=trigger']),
          ...triggerLabels.filter((label) => (rule.labels?.[label] ?? '').trim() === ''),
        ];
        if (missing.length > 0) {
          problems.push(
            `${subject} is severity=info, so it needs kind=trigger and non-empty trigger and package labels (missing ${missing.join(', ')})`,
          );
        }
      }
      return problems;
    }),
  );

/** Hosted provisioning keeps this many characters of a source rule UID, then appends a hash (Tau Cloud `grafana-content`). */
const hostedUidPrefixLength = 20;

/**
 * Rules that shared a 20-character prefix before the W14 OB1 lint. Renaming a source UID recreates the
 * hosted rule and orphans its Tau Cloud overrides, so these stay; no new rule may join a collision.
 */
export const legacyUidPrefixCollisions: readonly string[] = [
  'billing-funded-operation-due-age',
  'billing-funded-operation-limit',
  'billing-funded-operation-occupancy',
  'billing-funded-operation-recovery-failed',
];

/**
 * W14 OB1 (b): rule UIDs are unique within the characters hosted provisioning keeps, so a hosted rule
 * reads as its source rule. A collision is tolerated only when every member is a listed legacy UID.
 */
export const uidPrefixProblems = (
  uids: readonly string[],
  legacy: readonly string[] = legacyUidPrefixCollisions,
): string[] => {
  const prefixOf = (uid: string): string => uid.slice(0, hostedUidPrefixLength);
  const byPrefix = Map.groupBy(new Set(uids), prefixOf);
  const collides = (uid: string): boolean => uids.includes(uid) && (byPrefix.get(prefixOf(uid))?.length ?? 0) > 1;
  return [
    ...[...byPrefix]
      .filter(([, members]) => members.length > 1 && members.some((uid) => !legacy.includes(uid)))
      .map(
        ([prefix, members]) =>
          `alert rule UIDs ${members.map((uid) => `"${uid}"`).join(', ')} share their first ${hostedUidPrefixLength} characters "${prefix}"; hosted provisioning keeps only those, so each UID must differ within them`,
      ),
    ...legacy
      .filter((uid) => !collides(uid))
      .map((uid) => `legacy UID collision "${uid}" no longer collides: remove it from legacyUidPrefixCollisions`),
  ];
};

/** Values a redacting logger leaves: pino's censor, Tau's `redactionCensor`, or nothing. */
const redacted = /^(?:|\*\*REDACTED\*\*|\[redacted\])$/iu;

/** A presigned URL's signature, raw or percent-encoded inside another URL. */
const amzSignature = /X-Amz-Signature(?:=|%3D)(?<value>[^&\s"'\\]*)/giu;

/** W9's grant and receipt header shape, `v.kid.payload.signature`, with a base64url Ed25519 signature (86 characters). */
const storageToken = /(?<![\w.-])\d+\.[\w-]{1,64}\.[\w-]{8,}\.[\w-]{86}(?![\w-])/u;

/** Keys that hold a grant, a receipt signature or a presigned signature when they carry a value. */
const credentialKey = /grant|signature/iu;

/** Shortest value under a credential key that counts as material; a `kid`, reason or boolean is shorter. */
const minimumCredentialLength = 32;

/** Every string leaf of a parsed log record with its dotted path. */
const stringLeaves = (value: unknown, path: readonly string[] = []): Array<[path: string[], value: string]> => {
  if (typeof value === 'string') {
    return [[[...path], value]];
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => stringLeaves(child, [...path, key]));
};

const parsedRecord = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/**
 * W14 OB1 (f), review FR20: a log sample from the storage forwarder, the worker, the receipt route and
 * the LFS batch route carries no grant header, receipt signature or `X-Amz-Signature` value. Lines are
 * JSON (pino) or plain text; a problem names the line and field, never the value.
 */
export const logSecretProblems = (file: string, text: string): string[] =>
  text.split('\n').flatMap((line, index) => {
    const at = `${file}:${index + 1}`;
    const record = parsedRecord(line);
    return [
      ...(storageToken.test(line)
        ? [`${at}: a storage grant or receipt token (v.kid.payload.signature) appears in the line`]
        : []),
      ...stringLeaves(record)
        .filter(
          ([path, value]) =>
            credentialKey.test(path.at(-1) ?? '') &&
            !redacted.test(value) &&
            value.length >= minimumCredentialLength &&
            !/X-Amz-Signature/iu.test(value),
        )
        .map(([path]) => `${at}: field ${path.join('.')} carries credential material`),
      ...([...line.matchAll(amzSignature)].some(({ groups }) => !redacted.test(groups?.['value'] ?? ''))
        ? [`${at}: a presigned URL X-Amz-Signature value appears in the line`]
        : []),
    ];
  });

/** A rule with line breaks and their indentation folded to one space, so YAML line folding is not a difference. */
const comparable = (rule: unknown): unknown =>
  JSON.parse(
    JSON.stringify(rule, (_key, value: unknown) =>
      typeof value === 'string' ? value.replaceAll(/\s*\n\s*/gu, ' ').trim() : value,
    ),
  );

const durationUnits: Readonly<Record<string, number>> = {
  h: 3600,
  m: 60,
  s: 1,
};

/** Seconds in a Grafana group interval (`60`, `"60s"`, `"1m30s"`, `"1h"`), or undefined when unreadable. */
const seconds = (groupInterval: RuleGroup['interval']): number | undefined => {
  if (typeof groupInterval === 'number') {
    return groupInterval;
  }
  if (!/^(?:\d+[hms])+$/u.test(groupInterval ?? '')) {
    return undefined;
  }
  return [...(groupInterval ?? '').matchAll(/(?<count>\d+)(?<unit>[hms])/gu)].reduce(
    (total, { groups }) => total + Number(groups?.['count']) * (durationUnits[groups?.['unit'] ?? ''] ?? 0),
    0,
  );
};

const repeated = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
};

/** Repeated group names and uids, and intervals {@link seconds} cannot read (two unreadable ones would compare equal). */
const groupProblems = (groups: readonly RuleGroup[], where: string): string[] => [
  ...groups
    .filter((group) => seconds(group.interval) === undefined)
    .map(
      (group) =>
        `alert group "${group.name ?? group.title ?? ''}" has an unreadable interval ${JSON.stringify(group.interval)} in ${where}`,
    ),
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
        {
          interval: seconds(group.interval),
          uids: (group.rules ?? []).map((rule) => rule.uid ?? '').toSorted((left, right) => left.localeCompare(right)),
        },
      ]),
    );
  const local = byUid(provisioned);
  const remote = byUid(cloud);
  const localGroups = byName(provisioned);
  const remoteGroups = byName(cloud);
  return [
    ...groupProblems(cloud, 'infra/grafana/alerts'),
    ...groupProblems(provisioned, 'alerts.yaml'),
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
    .toSorted()
    .map((name) => join(directory, name));

const main = (): void => {
  const grafanaRoot = resolve(import.meta.dirname, '../../infra/grafana');
  const provisionedAlerts = join(grafanaRoot, 'provisioning/alerting/alerts.yaml');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Grafana's provisioning file shape
  const provisioned = load(readFileSync(provisionedAlerts, 'utf8')) as {
    groups?: RuleGroup[];
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Grafana's rule-group and dashboard JSON shapes
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as RuleGroup & { uid?: string };

  const sources: UidSource[] = [
    {
      file: provisionedAlerts,
      kind: 'alert rule',
      uids: ruleUids(provisioned.groups ?? []),
    },
    ...jsonFiles(join(grafanaRoot, 'alerts')).map(
      (file): UidSource => ({
        file,
        kind: 'alert rule',
        uids: ruleUids([read(file)]),
      }),
    ),
    ...jsonFiles(join(grafanaRoot, 'dashboards')).map(
      (file): UidSource => ({
        file,
        kind: 'dashboard',
        uids: [read(file).uid ?? ''],
      }),
    ),
  ];

  // A tiny, content-addressed distribution index lets deployment consume only
  // these definitions at a pinned commit, without cloning the application history.
  const bundleFile = join(grafanaRoot, 'bundle.json');
  const bundle = {
    schemaVersion: 1,
    files: Object.fromEntries(
      ['dashboards', 'alerts'].flatMap((directory) =>
        jsonFiles(join(grafanaRoot, directory)).map((file) => [
          `${directory}/${basename(file)}`,
          createHash('sha256').update(readFileSync(file)).digest('hex'),
        ]),
      ),
    ),
  };
  const bundleJson = `${JSON.stringify(bundle, null, 2)}\n`;
  if (process.argv.includes('--write-bundle')) {
    writeFileSync(bundleFile, bundleJson);
  }
  if (readFileSync(bundleFile, 'utf8') !== bundleJson) {
    throw new Error('Grafana bundle is stale. Run pnpm nx run scripts:grafana-bundle after editing definitions.');
  }

  const cloudGroups = jsonFiles(join(grafanaRoot, 'alerts')).map((file) => [file, read(file)] as const);
  const problems = [
    ...grafanaUidProblems(sources),
    ...dashboardUidProblems(sources),
    ...alertParityProblems(
      provisioned.groups ?? [],
      cloudGroups.map(([, group]) => group),
    ),
    // The local alerts.yaml must equal these field for field, so linting the Cloud groups covers it.
    ...cloudGroups.flatMap(([file, group]) => alertRuleProblems(basename(file), [group])),
    ...uidPrefixProblems(ruleUids(cloudGroups.map(([, group]) => group))),
  ];
  if (problems.length > 0) {
    throw new Error(`Invalid Grafana provisioning:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }

  console.log(`✓ ${sources.length} Grafana provisioning files have valid UIDs, rule labels and runbooks`);
};

/** `--log-sample <file>...`: lint captured storage log samples (W14 OB1 f) instead of the definitions. */
const lintLogSamples = (files: readonly string[]): void => {
  if (files.length === 0) {
    throw new Error('--log-sample needs at least one file');
  }
  const problems = files.flatMap((file) => logSecretProblems(file, readFileSync(file, 'utf8')));
  if (problems.length > 0) {
    throw new Error(`Storage log sample leaks credentials:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
  console.log(`✓ ${files.length} storage log sample(s) carry no grant, receipt signature or X-Amz-Signature value`);
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    const sampleFlag = process.argv.indexOf('--log-sample');
    if (sampleFlag === -1) {
      main();
    } else {
      lintLogSamples(process.argv.slice(sampleFlag + 1));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
