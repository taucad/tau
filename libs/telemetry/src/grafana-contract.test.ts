/* eslint-disable @typescript-eslint/naming-convention -- keys are Grafana variable, Prometheus and OTel label names */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCounter, defineGauge, defineHistogram } from '#define-metric.js';
import type { MetricDefinition } from '#define-metric.js';
import { toPrometheusName } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

/**
 * The dashboards and alert rules query Tau's own series by their exported Prometheus names. This
 * pins those names to the registry, so a renamed or undeclared instrument fails here instead of
 * leaving a panel or rule silently empty.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../../infra/grafana');

/** Seeded Grafana trees: `bad` breaks each binding rule once, `v2` is what Tau Cloud's binding contract v2 renders. */
const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures/grafana-contract');

/**
 * Names a dashboard may query ahead of the PR that declares them, as `name: 'owner/repo#PR'`. Each
 * entry goes when that PR merges; the tests fail until it does, and when no dashboard queries it.
 */
const pendingDeclaration: Readonly<Record<string, string>> = {};

/**
 * The API's per-process instruments live in its OTel bootstrap rather than the registry (they observe
 * `process.*` and need no reporter), so their names are read from that source.
 */
const processInstruments = [
  ...readFileSync(path.resolve(import.meta.dirname, '../../../apps/api/app/telemetry/otel.ts'), 'utf8').matchAll(
    /createObservable(?<kind>Counter|Gauge)\(\s*'(?<name>process\.[\w.]+)'/gu,
  ),
].map(({ groups }) => toPrometheusName(groups!['name']!, groups!['kind'] === 'Counter' ? 'counter' : 'gauge'));

const declared = new Set([
  ...Object.values(TauMetrics).map((metric) => toPrometheusName(metric.name, metric.type)),
  ...processInstruments,
]);

type Target = { expr?: unknown; datasource?: { type?: string } };
type Panel = {
  targets?: Target[];
  datasource?: { type?: string };
  panels?: Panel[];
};
type Variable = { name?: string; query?: unknown };
type Dashboard = { panels?: Panel[]; templating?: { list?: Variable[] } };
type RuleGroup = {
  rules?: Array<{
    data?: Array<{ datasourceUid?: string; model?: { expr?: unknown } }>;
  }>;
};

/** Where a PromQL string lives: dashboard panels and variables bind through `$app`-style variables, rules through regex placeholders. */
type QueryKind = 'panel' | 'variable' | 'rule' | 'provisioned';
type QuerySource = {
  readonly query: string;
  readonly file: string;
  readonly kind: QueryKind;
};

const strings = (values: readonly unknown[]): string[] =>
  values.filter((value): value is string => typeof value === 'string');

function read<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

const jsonFiles = (root: string, directory: string): string[] =>
  existsSync(path.join(root, directory))
    ? readdirSync(path.join(root, directory))
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(root, directory, name))
    : [];

/** Every PromQL string with the file it came from: panel targets, template variables and rule models. */
const promqlSources = (root = grafanaRoot): QuerySource[] => {
  const sources: QuerySource[] = [];
  const add = (file: string, kind: QueryKind, queries: readonly string[]): void => {
    for (const query of queries) {
      sources.push({ query, file: path.relative(root, file), kind });
    }
  };
  for (const file of jsonFiles(root, 'dashboards')) {
    const dashboard = read<Dashboard>(file);
    const panels = (dashboard.panels ?? []).flatMap((panel) => [panel, ...(panel.panels ?? [])]);
    // Loki targets also use `expr`; LogQL label filters sit outside braces and would read as metric names.
    const promql = panels.flatMap((panel) =>
      (panel.targets ?? []).filter((target) => (target.datasource ?? panel.datasource)?.type !== 'loki'),
    );
    add(file, 'panel', strings(promql.map((target) => target.expr)));
    add(file, 'variable', strings((dashboard.templating?.list ?? []).map((variable) => variable.query)));
  }
  for (const file of jsonFiles(root, 'alerts')) {
    const rules = read<RuleGroup>(file).rules ?? [];
    add(
      file,
      'rule',
      strings(
        rules.flatMap((rule) =>
          (rule.data ?? []).filter((query) => query.datasourceUid !== 'loki').map((query) => query.model?.expr),
        ),
      ),
    );
  }
  // The local provisioning copy: each `expr:` is a folded or plain YAML scalar, indented under its key.
  const yamlFile = path.join(root, 'provisioning/alerting/alerts.yaml');
  const lines = existsSync(yamlFile) ? readFileSync(yamlFile, 'utf8').split('\n') : [];
  for (const [index, line] of lines.entries()) {
    const match = /^(?<indent>\s*)expr:\s*(?<rest>.*)$/u.exec(line);
    if (match?.groups === undefined) {
      continue;
    }
    const { indent = '', rest = '' } = match.groups;
    const block: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() !== '' && next.length - next.trimStart().length <= indent.length) {
        break;
      }
      block.push(next);
    }
    add(yamlFile, 'provisioned', [/^[>|]/u.test(rest) ? block.join(' ') : rest]);
  }
  return sources;
};

/**
 * Tau-prefixed metric names in one PromQL string. Label names only appear inside `{...}`, in
 * `by`/`without`/`on`/`ignoring`/`group_*` lists, as quoted `label_replace` arguments or as the
 * second argument of `label_values`, so those are removed first; what remains prefixed is a metric.
 */
const metricNames = (query: string): string[] => {
  const stripped = query
    .replaceAll(/\{\{[^}]*\}\}/gu, '')
    .replaceAll(/"(?:[^"\\]|\\.)*"/gu, '""')
    .replaceAll(/\{[^}]*\}/gu, '{}')
    .replaceAll(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/gu, '')
    .replaceAll(/(label_values\([^,()]*),[^)]*\)/gu, '$1)');
  return [...stripped.matchAll(/\b((?:tau|ws|gen_ai|sse|rpc|kernel|publication|process|redis_connection)_\w+)/gu)].map(
    ([, name]) => name!.replace(/_(?:bucket|sum|count)$/u, ''),
  );
};

/** Metric name → every file that queries it, from the given kinds of source. */
const queried = (
  root = grafanaRoot,
  kinds: readonly QueryKind[] = ['panel', 'variable', 'rule', 'provisioned'],
): Map<string, string[]> => {
  const names = new Map<string, string[]>();
  for (const { query, file } of promqlSources(root).filter((source) => kinds.includes(source.kind))) {
    for (const name of metricNames(query)) {
      const files = names.get(name) ?? [];
      if (!files.includes(file)) {
        files.push(file);
      }
      names.set(name, files);
    }
  }
  return names;
};

// --- Binding contract v2 (W14 OB1 d) ---

type AppRole = 'api' | 'storage' | 'mirror';

/**
 * The only app matchers hosted provisioning rewrites (Tau Cloud `grafana-content`): dashboards bind a
 * variable per app, rules a regex placeholder per app. Anything else reaches hosted Grafana unbound, or
 * is refused at plan.
 */
const appPlaceholders: Readonly<Record<'dashboard' | 'rule', Readonly<Record<AppRole, string>>>> = {
  dashboard: { api: '$app', storage: '$storage_app', mirror: '$mirror_app' },
  rule: { api: '.*', storage: '.*storage.*', mirror: '.*mirror.*' },
};

/** Each dashboard variable's local default, which matches every series of its app on a local stack. */
const localVariables: Readonly<Record<string, string>> = {
  app: '.*',
  storage_app: '.*storage.*',
  mirror_app: '.*mirror.*',
};

const appNames: Readonly<Record<AppRole, string>> = {
  api: 'tau-api',
  storage: 'tau-storage',
  mirror: 'tau-mirror',
};

type Matcher = {
  readonly label: string;
  readonly op: string;
  readonly value: string;
};

const selectorMatchers = (body: string): Matcher[] =>
  [...body.matchAll(/(?<label>[A-Za-z_]\w*)\s*(?<op>=~|!~|!=|=)\s*"(?<value>(?:[^"\\]|\\.)*)"/gu)].map(
    ({ groups }) => ({
      label: groups!['label']!,
      op: groups!['op']!,
      value: groups!['value']!,
    }),
  );

/** The app a `service_name` value names; `$service` and `tau-api` are the API. One entry per alternative. */
const serviceRoles = (value: string): AppRole[] =>
  value
    .split('|')
    .map((service) => (service.includes('mirror') ? 'mirror' : service.includes('storage') ? 'storage' : 'api'));

/**
 * W14 OB1 (d), binding contract v2: each selector binds exactly one app with that app's placeholder.
 * `tau_mirror_*` series and `service_name` matchers say which app a selector reads; a selector that
 * spans two apps, or one combined matcher such as `app=~"tau-api.*|.*storage.*"`, must become one
 * query per app.
 */
const bindingProblems = (sources: readonly QuerySource[]): string[] =>
  sources
    .filter(({ kind }) => kind !== 'provisioned')
    .flatMap(({ query, file, kind }) => {
      const allowed = appPlaceholders[kind === 'rule' ? 'rule' : 'dashboard'];
      const allowedList = Object.values(allowed)
        .map((value) => `app=~"${value}"`)
        .join(', ');
      const bare = [...query.replaceAll(/"(?:[^"\\]|\\.)*"/gu, '""').matchAll(/\b(tau_mirror_\w+)\b(?!\s*\{)/gu)].map(
        ([, name]) => `${file}: ${name} has no selector, so it is not bound to app=~"${allowed.mirror}"`,
      );
      const selectors = [...query.matchAll(/(?<metric>[A-Za-z_:][\w:]*)?\s*\{(?<body>[^{}]*)\}/gu)].flatMap(
        ({ groups }) => {
          const metric = groups?.['metric'] ?? '';
          const body = groups?.['body'] ?? '';
          const at = `${file}: ${metric}{${body}}`;
          const matchers = selectorMatchers(body);
          const apps = matchers.filter(({ label }) => label === 'app');
          const roles = new Set<AppRole>([
            ...(metric.startsWith('tau_mirror_') ? (['mirror'] as const) : []),
            ...matchers.filter(({ label }) => label === 'service_name').flatMap(({ value }) => serviceRoles(value)),
          ]);
          if (roles.size > 1) {
            return [`${at} spans ${[...roles].map((role) => appNames[role]).join(' and ')}; write one query per app`];
          }
          if (apps.length > 1) {
            return [`${at} has ${apps.length} app matchers; hosted provisioning binds exactly one`];
          }
          const [target] = roles;
          const [app] = apps;
          if (app === undefined) {
            return target === undefined || target === 'api'
              ? []
              : [`${at} selects ${appNames[target]} series without app=~"${allowed[target]}"`];
          }
          const bound = (Object.keys(allowed) as AppRole[]).find(
            (role) => app.op === '=~' && app.value === allowed[role],
          );
          if (bound === undefined) {
            return [
              `${at} binds app${app.op}"${app.value}", which is not one of ${allowedList}; a combined or hard-coded matcher must become one query per app`,
            ];
          }
          return target === undefined || target === bound
            ? []
            : [
                `${at} selects ${appNames[target]} series but binds app=~"${allowed[bound]}"; use app=~"${allowed[target]}"`,
              ];
        },
      );
      return [...selectors, ...bare];
    });

/** Binding contract v2 for dashboard variables: each app variable a query uses exists and defaults to match its app locally. */
const variableProblems = (root: string): string[] =>
  jsonFiles(root, 'dashboards').flatMap((file) => {
    const at = path.relative(root, file);
    const dashboard = read<Dashboard>(file);
    const variables = new Map((dashboard.templating?.list ?? []).map((variable) => [variable.name, variable.query]));
    const text = readFileSync(file, 'utf8');
    return Object.entries(localVariables).flatMap(([name, local]) => {
      if (!variables.has(name)) {
        return text.includes(`$${name}"`) || text.includes(`$${name}\\"`)
          ? [`${at}: queries use $${name} but the dashboard defines no ${name} variable`]
          : [];
      }
      const query = variables.get(name);
      return query === local
        ? []
        : [`${at}: variable ${name} must default to "${local}" locally (has ${JSON.stringify(query)})`];
    });
  });

// --- Storage-family registry contracts (W14 OB1 c, e, f) ---

type Registry = Readonly<Record<string, MetricDefinition>>;

/** The W14 storage families: the git edge, object store, git execution, R2 analytics, B2, migration, LFS, compute and Postgres accounting. */
const storageFamilies = [
  'tau.sync.',
  'tau.storage.',
  'tau.git.',
  'tau.r2.',
  'tau.mirror.',
  'tau.migration.',
  'tau.lfs.',
  'tau.compute.',
  'tau.db.',
] as const;

const storageInstruments = (registry: Registry): MetricDefinition[] =>
  Object.values(registry).filter((metric) => storageFamilies.some((family) => metric.name.startsWith(family)));

/**
 * Storage-family instruments read by no dashboard panel yet, as `prometheus_name: 'package that adds
 * the panel'`. Since OB9 (`storage-critical.json` and the capability dashboard `tau-sync.json`) every
 * declared one is read; a later package that declares an instrument adds its panel in the same change,
 * or lists it here until it does. Each entry goes when a panel reads the name; the test fails until it does.
 */
const awaitingPanel: Readonly<Record<string, string>> = {};

/**
 * Storage-family labels that still admit any string, as `metric: { label: 'package that bounds it' }`.
 * The S3 command name and SDK error name predate W14; OB2 replaces them with bounded enums when it
 * touches `storage-metrics.ts`. Each entry goes when its label becomes an enum.
 */
const freeFormPending: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'tau.storage.operation.duration': {
    'tau.storage.operation': 'OB2',
    'error.type': 'OB2',
  },
  'tau.storage.transferred_bytes': { 'tau.storage.operation': 'OB2' },
};

/** What each identity word in a label key names, for the message. */
const identityWords: Readonly<Record<string, string>> = {
  project: 'a project',
  owner: 'an owner',
  user: 'a user',
  enduser: 'a user',
  device: 'a device',
  oid: 'an LFS oid',
  digest: 'a compute digest',
  requestid: 'a request id',
  rid: 'a request id',
};

/** The words of a label key: dotted, snake, kebab and camel segments, lower-cased. */
const keyWords = (key: string): string[] =>
  key
    .replaceAll(/(?<lower>[a-z\d])(?<upper>[A-Z])/gu, '$<lower> $<upper>')
    .toLowerCase()
    .split(/[^a-z\d]+/u)
    .filter((word) => word !== '');

const identityOf = (key: string): string | undefined => {
  const words = keyWords(key);
  const joined = words.flatMap((word, index) =>
    word === 'request' && words[index + 1] === 'id' ? ['requestid'] : [word],
  );
  return joined.map((word) => identityWords[word]).find((identity) => identity !== undefined);
};

/** A label schema with its optional, nullable and default wrappers removed. */
const innerSchema = (schema: z.core.$ZodType): z.core.$ZodType =>
  schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault
    ? innerSchema(schema.unwrap())
    : schema;

const isFreeForm = (schema: z.core.$ZodType | undefined): boolean =>
  schema !== undefined && innerSchema(schema) instanceof z.ZodString;

/**
 * W14 OB1 (c): no storage-family label names a project, owner, user, device, oid, digest or request id,
 * whatever its schema. Per-project detail is a `rank` label plus a log line (W14 Finding 5).
 */
const identityLabelProblems = (registry: Registry): string[] =>
  storageInstruments(registry).flatMap((metric) =>
    Object.keys(metric.attributes.shape).flatMap((key) => {
      const identity = identityOf(key);
      return identity === undefined
        ? []
        : [
            `${metric.name}: label "${key}" names ${identity}; storage-family labels never carry a project, owner, user, device, oid, digest or request id`,
          ];
    }),
  );

/**
 * W14 OB1 (f), review FR20: no storage-family label admits a free-form string, so neither a credential
 * nor an unbounded identifier can reach a series. Every label is an enum with an `other` value.
 */
const freeFormLabelProblems = (
  registry: Registry,
  pending: Readonly<Record<string, Readonly<Record<string, string>>>> = freeFormPending,
): string[] => {
  const storage = storageInstruments(registry);
  return [
    ...storage.flatMap((metric) =>
      Object.entries(metric.attributes.shape)
        .filter(([key, schema]) => isFreeForm(schema) && pending[metric.name]?.[key] === undefined)
        .map(
          ([key]) =>
            `${metric.name}: label "${key}" admits a free-form string; storage-family labels are enums with an "other" value`,
        ),
    ),
    ...Object.entries(pending).flatMap(([name, labels]) =>
      Object.keys(labels)
        .filter((key) => !isFreeForm(storage.find((metric) => metric.name === name)?.attributes.shape[key]))
        .map((key) => `freeFormPending entry ${name} "${key}" is not a free-form string label: remove it`),
    ),
  ];
};

/**
 * W14 OB1 (e): every storage-family instrument is read by at least one dashboard panel, so a package
 * cannot ship a metric nobody looks at. Rules and template variables do not count.
 */
const unwatchedProblems = (
  registry: Registry,
  root: string = grafanaRoot,
  awaiting: Readonly<Record<string, string>> = awaitingPanel,
): string[] => {
  const watched = queried(root, ['panel']);
  const instruments = storageInstruments(registry).map((metric) => [
    toPrometheusName(metric.name, metric.type),
    metric.name,
  ]);
  const names = new Set(instruments.map(([name]) => name));
  return [
    ...instruments
      .filter(([name]) => !watched.has(name!) && !(name! in awaiting))
      .map(
        ([name, otel]) =>
          `${name} (${otel}) is read by no dashboard panel: add one in the same change, or list it in awaitingPanel with the package that adds it`,
      ),
    ...Object.keys(awaiting)
      .filter((name) => watched.has(name) || !names.has(name))
      .map(
        (name) =>
          `awaitingPanel entry ${name} is stale: ${watched.has(name) ? 'a panel reads it' : 'no storage-family instrument has that name'}`,
      ),
  ];
};

/** A registry that breaks each storage-family label rule once, beside rules it keeps. */
const seededLabels: Registry = {
  projectLabel: defineCounter({
    name: 'tau.git.pushes_by_project',
    unit: '{push}',
    description: 'seeded: a project label, even as an enum',
    attributes: z.object({ 'tau.project.id': z.enum(['prj_a', 'other']) }),
  }),
  ownerLabel: defineGauge({
    name: 'tau.storage.usage_by_owner',
    unit: 'By',
    description: 'seeded: an owner label that is also free-form',
    attributes: z.object({ ownerId: z.string() }),
  }),
  oidLabel: defineCounter({
    name: 'tau.lfs.objects',
    unit: '{object}',
    description: 'seeded: an LFS oid',
    attributes: z.object({ 'tau.lfs.oid': z.string().optional() }),
  }),
  digestLabel: defineHistogram({
    name: 'tau.compute.lookup.duration',
    unit: 's',
    description: 'seeded: a compute digest',
    buckets: [0.01, 0.1],
    attributes: z.object({
      'tau.compute.digest': z.enum(['sha256-a', 'other']),
    }),
  }),
  requestLabel: defineCounter({
    name: 'tau.mirror.rounds',
    unit: '{round}',
    description: 'seeded: a request id and a user',
    attributes: z.object({
      request_id: z.enum(['r1', 'other']),
      'enduser.id': z.enum(['u1', 'other']),
    }),
  }),
  deviceLabel: defineCounter({
    name: 'tau.sync.client.retries',
    unit: '{retry}',
    description: 'seeded: a device',
    attributes: z.object({ deviceId: z.enum(['d1', 'other']) }),
  }),
  freeForm: defineHistogram({
    name: 'tau.r2.request.duration',
    unit: 's',
    description: 'seeded: a free-form operation name',
    buckets: [0.01, 0.1],
    attributes: z.object({
      'tau.r2.action': z.string().optional(),
      outcome: z.enum(['ok', 'error']),
    }),
  }),
  outsideFamily: defineCounter({
    name: 'tau.billing.seeded',
    unit: '{event}',
    description: 'seeded: not a storage family, so not checked here',
    attributes: z.object({ 'user.id': z.string() }),
  }),
  bounded: defineCounter({
    name: 'tau.git.admissions',
    unit: '{admission}',
    description: 'kept: enums, a rank and a numeric status',
    attributes: z.object({
      outcome: z.enum(['admitted', 'owner_busy']),
      rank: z.enum(['1', '2']),
      'http.response.status_code': z.number().int(),
    }),
  }),
};

/** A registry for the `v2` dashboard: one instrument its panels read, one they do not. */
const seededWatch: Registry = {
  rpcsInflight: defineGauge({
    name: 'tau.git.rpcs_inflight',
    unit: '{rpc}',
    description: 'read by the v2 fixture panel',
    attributes: z.object({}),
  }),
  commitAttempts: defineCounter({
    name: 'tau.git.commit.attempts',
    unit: '{attempt}',
    description: 'read by the v2 fixture panel',
    attributes: z.object({ outcome: z.enum(['committed', 'lost_race']) }),
  }),
  copyLag: defineGauge({
    name: 'tau.mirror.copy_lag_seconds',
    unit: 's',
    description: 'read by the v2 fixture panel',
    attributes: z.object({ destination: z.enum(['b2']) }),
  }),
  capacitySlots: defineGauge({
    name: 'tau.git.capacity_slots',
    unit: '{slot}',
    description: 'seeded: read only by a rule, never by a panel',
    attributes: z.object({}),
  }),
  outsideFamily: defineCounter({
    name: 'tau.billing.unwatched',
    unit: '{event}',
    description: 'seeded: not a storage family',
    attributes: z.object({}),
  }),
};

describe('metricNames', () => {
  it('should find bare, ranged and label_values selectors but no label names', () => {
    expect(
      metricNames(
        'sum by (tau_surface) (rate(tau_a_total[5m])) / sum(tau_b{tau_process="app"}) + label_values(tau_c_total, tau_process) + histogram_quantile(0.9, sum by (le) (rate(tau_d_bucket[5m])))',
      ),
    ).toEqual(['tau_a_total', 'tau_b', 'tau_c_total', 'tau_d']);
  });
});

describe('Grafana dashboards and alert rules', () => {
  it('should query only Tau metrics the registry declares', () => {
    const undeclared = [...queried()]
      .filter(([name]) => !declared.has(name) && !(name in pendingDeclaration))
      .map(([name, files]) => `${name} (${files.join(', ')})`);

    expect(undeclared).toEqual([]);
  });

  it('should keep a pending name only while it is undeclared and still queried', () => {
    const names = queried();
    const stale = Object.keys(pendingDeclaration).filter((name) => declared.has(name) || !names.has(name));

    expect(stale).toEqual([]);
  });

  it('should see the rule expressions in the local provisioning copy', () => {
    expect([...queried()].some(([, files]) => files.includes('provisioning/alerting/alerts.yaml'))).toBe(true);
  });
});

describe('Grafana environment binding', () => {
  it('should give every dashboard a local app binding without hosted app names', () => {
    for (const file of jsonFiles(grafanaRoot, 'dashboards')) {
      const dashboard = read<{
        templating: { list: Array<{ name: string; query: string }> };
      }>(file);
      expect(dashboard.templating.list.find((variable) => variable.name === 'app')?.query, file).toBe('.*');
      expect(readFileSync(file, 'utf8'), file).not.toContain('tau-api-staging');
    }
  });

  it('should scope application metric selectors before hosted provisioning binds them', () => {
    const unscoped = promqlSources()
      .filter(({ kind }) => kind !== 'provisioned')
      .flatMap(({ query, file }) =>
        [...query.matchAll(/\{([^{}]*)\}/gu)]
          .filter(([, selector]) => selector?.includes('service_name') && !selector.includes('app=~'))
          .map(() => `${file}: ${query}`),
      );
    expect(unscoped).toEqual([]);
  });
});

// --- Runtime observability contracts (package.md T13, T32) ---

/** Runtime observability series: the instruments the Runtime operations and product dashboards read. */
const isRuntimeSeries = (name: string): boolean => /^tau_(?:runtime|telemetry)_/u.test(name);

/** Labels every API series carries beyond its attributes: Fly's scrape labels, the exporter's resource constants and the SDK's overflow marker. */
const seriesLabels = ['app', 'instance', 'job', 'service_name', 'tau_process', 'otel_metric_overflow'];

/** The exported label of an attribute key: the exporter replaces every invalid character with `_`. */
const labelOf = (attribute: string): string => attribute.replaceAll(/[^\w]/gu, '_');

const registryLabels = new Map(
  Object.values(TauMetrics).map((metric) => [
    toPrometheusName(metric.name, metric.type),
    Object.keys(metric.attributes.shape).map((attribute) => labelOf(attribute)),
  ]),
);

/** The labels a series may be selected or grouped by: its definition's, plus `le` on a histogram's buckets. */
const labelsOf = (series: string): readonly string[] | undefined => {
  const base = series.replace(/_(?:bucket|sum|count)$/u, '');
  const own = registryLabels.get(base);
  return own && [...own, ...seriesLabels, ...(series.endsWith('_bucket') ? ['le'] : [])];
};

/** The text of the parenthesised group that opens at `open`, without its parentheses. */
const groupAt = (query: string, open: number): string => {
  let depth = 0;
  for (let index = open; index < query.length; index++) {
    depth += query[index] === '(' ? 1 : query[index] === ')' ? -1 : 0;
    if (depth === 0) {
      return query.slice(open + 1, index);
    }
  }
  return query.slice(open + 1);
};

const labelList = (list: string): string[] =>
  list
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '');

/** A query with its strings, selector bodies and label lists emptied, so what remains named is a series. */
const seriesText = (query: string): string =>
  query
    .replaceAll(/"(?:[^"\\]|\\.)*"/gu, '""')
    .replaceAll(/\{[^}]*\}/gu, '{}')
    .replaceAll(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^)]*\)/gu, '')
    .replaceAll(/(label_values\([^,()]*),[^)]*\)/gu, '$1)');

/** Runtime series a query reads, with their bucket/sum/count suffix. */
const runtimeSeries = (query: string): string[] =>
  [...seriesText(query).matchAll(/\b(tau_(?:runtime|telemetry)_\w+)/gu)].map(([, name]) => name!);

/**
 * T13 (AR-W4-11, AR-W5-05): every runtime series reference carries a selector with an `app` matcher,
 * and every label a selector, a `by` clause, an `on`/`ignoring` clause or `label_values` names exists
 * on the definition of the runtime metric it reads.
 */
/** A runtime series named without a selector carries no app matcher, so hosted provisioning cannot bind it. */
const bareSeriesProblems = (file: string, query: string): string[] =>
  [...seriesText(query).matchAll(/\b(tau_(?:runtime|telemetry)_\w+)\b(?!\s*\{)/gu)].map(
    ([, name]) => `${file}: ${name} has no selector, so it carries no app matcher`,
  );

/** One selector: bound to an app when it reads a runtime series or names none, and matching only labels its metric has. */
const selectorLabelProblems = (file: string, metric: string, body: string): string[] => {
  const matchers = selectorMatchers(body);
  const runtime = isRuntimeSeries(metric);
  const known = runtime ? labelsOf(metric) : undefined;
  return [
    ...((metric === '' || runtime) && !matchers.some(({ label }) => label === 'app')
      ? [`${file}: ${metric}{${body}} has no app matcher`]
      : []),
    ...(runtime && known === undefined
      ? [`${file}: ${metric} is not a runtime metric the registry or PR-2 defines`]
      : []),
    ...(known === undefined
      ? []
      : matchers
          .filter(({ label }) => !known.includes(label))
          .map(({ label }) => `${file}: ${metric} has no label ${label}`)),
  ];
};

/**
 * `by (…)` labels exist on every runtime series inside the aggregated expression. Runtime queries
 * write `by (…)` before the expression, because only that form names the series the check reads.
 */
const groupingProblems = (file: string, unquoted: string): string[] => [
  ...(runtimeSeries(unquoted).length > 0 && /\)\s*by\s*\(/u.test(unquoted)
    ? [`${file}: write by (…) before the aggregated expression so its labels are checked`]
    : []),
  ...[...unquoted.matchAll(/\bby\s*\((?<labels>[^)]*)\)\s*\(/gu)].flatMap((match) =>
    runtimeSeries(groupAt(unquoted, match.index + match[0].length - 1)).flatMap((series) =>
      labelList(match.groups?.['labels'] ?? '')
        .filter((label) => !(labelsOf(series) ?? []).includes(label))
        .map((label) => `${file}: by (${label}) over ${series}, which has no label ${label}`),
    ),
  ),
];

/** `on (…)` and `ignoring (…)` labels exist on at least one runtime series of the query. */
const matchingProblems = (file: string, unquoted: string, query: string): string[] => {
  const everySeries = runtimeSeries(query);
  return everySeries.length === 0
    ? []
    : [...unquoted.matchAll(/\b(?:on|ignoring)\s*\((?<labels>[^)]*)\)/gu)].flatMap((match) =>
        labelList(match.groups?.['labels'] ?? '')
          .filter((label) => !everySeries.some((series) => labelsOf(series)?.includes(label)))
          .map((label) => `${file}: on/ignoring (${label}) names a label no runtime series in the query has`),
      );
};

/** `label_values(series{…}, label)` names a label the runtime series has. */
const labelValuesProblems = (file: string, query: string): string[] =>
  [...query.matchAll(/label_values\((?<series>tau_\w+)\{[^}]*\},\s*(?<label>\w+)\)/gu)]
    .map(({ groups }) => ({
      series: groups?.['series'] ?? '',
      label: groups?.['label'] ?? '',
    }))
    .filter(({ series, label }) => isRuntimeSeries(series) && !(labelsOf(series) ?? []).includes(label))
    .map(({ series, label }) => `${file}: label_values over ${series} names ${label}, which it lacks`);

/**
 * T13 (AR-W4-11, AR-W5-05): every runtime series reference carries a selector with an `app` matcher,
 * and every label a selector, a `by` clause, an `on`/`ignoring` clause or `label_values` names exists
 * on the definition of the runtime metric it reads.
 */
const runtimeLabelProblems = (sources: readonly QuerySource[]): string[] =>
  sources
    .filter(({ kind }) => kind !== 'provisioned')
    .flatMap(({ query, file }) => {
      const unquoted = query.replaceAll(/"(?:[^"\\]|\\.)*"/gu, '""');
      return [
        ...bareSeriesProblems(file, query),
        ...[...query.matchAll(/(?<metric>[A-Za-z_:][\w:]*)?\s*\{(?<body>[^{}]*)\}/gu)].flatMap(({ groups }) =>
          selectorLabelProblems(file, groups?.['metric'] ?? '', groups?.['body'] ?? ''),
        ),
        ...groupingProblems(file, unquoted),
        ...matchingProblems(file, unquoted, query),
        ...labelValuesProblems(file, query),
      ];
    });

/** The clause every absence rule carries, so a self-hosted, unset or paused API is silent (package.md §12.2). */
const enabledClause = /and on\s*\(\)\s*\(max\(tau_telemetry_runtime_enabled\{[^}]*app=~"\.\*"[^}]*\}\)\s*==\s*1\)/u;

type Rule = {
  uid?: string;
  isPaused?: boolean;
  labels?: Record<string, string>;
  data?: Array<{ datasourceUid?: string; model?: { expr?: unknown } }>;
};

const rulesIn = (root: string): Array<{ file: string; rule: Rule }> =>
  jsonFiles(root, 'alerts').flatMap((file) =>
    (read<{ rules?: Rule[] }>(file).rules ?? []).map((rule) => ({
      file: path.relative(root, file),
      rule,
    })),
  );

/** T13: a rule that fires on absence (`absent`, `absent_over_time`) is conditioned on the enabled gauge. */
const absenceProblems = (root: string): string[] =>
  rulesIn(root).flatMap(({ file, rule }) =>
    strings((rule.data ?? []).map((query) => query.model?.expr))
      .filter((expr) => /\babsent(?:_over_time)?\s*\(/u.test(expr) && !enabledClause.test(expr))
      .map(() => `${file}: rule "${rule.uid ?? ''}" fires on absence without the tau_telemetry_runtime_enabled clause`),
  );

type LokiSource = {
  readonly file: string;
  readonly query: string;
  readonly where: 'dashboard' | 'alert';
};

const lokiSources = (root: string): LokiSource[] => [
  ...jsonFiles(root, 'dashboards').flatMap((file) => {
    const dashboard = read<Dashboard>(file);
    return (dashboard.panels ?? [])
      .flatMap((panel) => [panel, ...(panel.panels ?? [])])
      .flatMap((panel) =>
        (panel.targets ?? []).filter((target) => (target.datasource ?? panel.datasource)?.type === 'loki'),
      )
      .flatMap((target): LokiSource[] =>
        typeof target.expr === 'string'
          ? [
              {
                file: path.relative(root, file),
                query: target.expr,
                where: 'dashboard',
              },
            ]
          : [],
      );
  }),
  ...rulesIn(root).flatMap(({ file, rule }) =>
    strings((rule.data ?? []).filter((query) => query.datasourceUid === 'loki').map((query) => query.model?.expr)).map(
      (query): LokiSource => ({ file, query, where: 'alert' }),
    ),
  ),
];

/**
 * T32 (FR-27, FR-28): Tau Cloud rewrites exactly `service_name=~"$service"` (dashboards) and
 * `service_name="tau-api"` (alerts) to the environment's `fly_app_name`, and refuses at plan an alert
 * selector without it, so every Loki selector is written exactly so and none names `fly_app_name`.
 * Every Prometheus rule selector carries the `service_name` of the app it binds (binding contract v2:
 * `app=~".*"` is `tau-api`, `app=~".*storage.*"` is `tau-storage`, `app=~".*mirror.*"` is `tau-mirror`), so
 * a second exporter in that app cannot match. Grafana's own `grafana_*` series and Fly's platform `fly_*`
 * series carry no `service_name`; the `app` matcher alone binds them.
 */
const ruleServices: Readonly<Record<string, string>> = {
  [appPlaceholders.rule.api]: appNames.api,
  [appPlaceholders.rule.storage]: appNames.storage,
  [appPlaceholders.rule.mirror]: appNames.mirror,
};

const selectorSourceProblems = (root: string): string[] => [
  ...lokiSources(root).flatMap(({ file, query, where }) => {
    const expected = where === 'dashboard' ? 'service_name=~"$service"' : 'service_name="tau-api"';
    return [...query.matchAll(/\{(?<body>[^{}]*)\}/gu)]
      .filter(({ groups }) => groups?.['body']?.trim() !== expected)
      .map(({ groups }) => `${file}: Loki selector {${groups?.['body'] ?? ''}} must be exactly {${expected}}`);
  }),
  ...[...jsonFiles(root, 'dashboards'), ...jsonFiles(root, 'alerts')]
    .filter((file) => readFileSync(file, 'utf8').includes('fly_app_name'))
    .map((file) => `${path.relative(root, file)}: names fly_app_name, which bypasses Tau Cloud's rewrite`),
  ...promqlSources(root)
    .filter(({ kind }) => kind === 'rule')
    .flatMap(({ query, file }) =>
      [...query.matchAll(/(?<metric>[A-Za-z_:][\w:]*)?\s*\{(?<body>[^{}]*)\}/gu)]
        .filter(({ groups }) => !(groups?.['metric'] ?? '').startsWith('grafana_'))
        .flatMap(({ groups }) => {
          const matchers = selectorMatchers(groups?.['body'] ?? '');
          if ((groups?.['metric'] ?? '').startsWith('fly_')) {
            // Fly's series carry no service_name, so the app placeholder alone keeps one app's Machines.
            const apps = matchers.filter(({ label }) => label === 'app');
            const placeholders: readonly string[] = Object.values(appPlaceholders.rule);
            return apps.length === 1 && apps[0]!.op === '=~' && placeholders.includes(apps[0]!.value)
              ? []
              : [
                  `${file}: ${groups?.['metric'] ?? ''}{${groups?.['body'] ?? ''}} needs exactly one app matcher from ${placeholders.map((value) => `app=~"${value}"`).join(', ')}`,
                ];
          }
          const app = matchers.find(({ label, op }) => label === 'app' && op === '=~');
          const service = ruleServices[app?.value ?? appPlaceholders.rule.api] ?? appNames.api;
          return matchers.some(({ label, op, value }) => label === 'service_name' && op === '=' && value === service)
            ? []
            : [`${file}: ${groups?.['metric'] ?? ''}{${groups?.['body'] ?? ''}} lacks service_name="${service}"`];
        }),
    ),
];

type ProductVariable = { name?: string; current?: { value?: unknown } };

/**
 * T13 (AR-W4-07, AR-W5-07): the product dashboard opens on the signed-in population, and every selector
 * on a metric that carries `tau_runtime_population` filters it, by the variable or explicitly.
 */
const populationProblems = (file: string): string[] => {
  const dashboard = read<{ templating?: { list?: ProductVariable[] } }>(file);
  const population = dashboard.templating?.list?.find((variable) => variable.name === 'population');
  return [
    ...(population?.current?.value === 'signed-in'
      ? []
      : [`population must default to signed-in (has ${JSON.stringify(population?.current?.value)})`]),
    ...promqlSources(path.dirname(path.dirname(file)))
      .filter(
        (source) => source.kind === 'panel' && source.file === path.relative(path.dirname(path.dirname(file)), file),
      )
      .flatMap(({ query }) =>
        [...query.matchAll(/(?<metric>tau_\w+)\{(?<body>[^{}]*)\}/gu)]
          .filter(({ groups }) => labelsOf(groups!['metric']!)?.includes('tau_runtime_population'))
          .filter(
            ({ groups }) => !selectorMatchers(groups!['body']!).some(({ label }) => label === 'tau_runtime_population'),
          )
          .map(({ groups }) => `${groups!['metric']}{${groups!['body']}} does not filter tau_runtime_population`),
      ),
  ];
};

describe('Runtime observability dashboards and rules (T13, T32)', () => {
  it('should bind every runtime series to an app and read only labels its metric defines', () => {
    expect(runtimeLabelProblems(promqlSources())).toEqual([]);
  });

  it('should reject a bare runtime series and a label its metric lacks', () => {
    expect(
      runtimeLabelProblems([
        {
          file: 'seeded.json',
          kind: 'rule',
          query:
            'max(tau_telemetry_runtime_enabled) + sum by (error_type) (rate(tau_runtime_operations_total{app=~".*",tau_runtime_route="cli"}[5m])) / ignoring(tau_runtime_set) group_left count({otel_metric_overflow="true"})',
        },
      ]),
    ).toEqual([
      'seeded.json: tau_telemetry_runtime_enabled has no selector, so it carries no app matcher',
      'seeded.json: tau_runtime_operations_total has no label tau_runtime_route',
      'seeded.json: {otel_metric_overflow="true"} has no app matcher',
      'seeded.json: by (error_type) over tau_runtime_operations_total, which has no label error_type',
      'seeded.json: on/ignoring (tau_runtime_set) names a label no runtime series in the query has',
    ]);
  });

  it('should reject a postfix by clause on a runtime query', () => {
    expect(
      runtimeLabelProblems([
        {
          file: 'seeded.json',
          kind: 'rule',
          query: 'sum(rate(tau_runtime_operations_total{app=~"$app"}[5m])) by (error_type)',
        },
      ]),
    ).toEqual(['seeded.json: write by (…) before the aggregated expression so its labels are checked']);
  });

  it('should reject the seeded runtime tree: an unconditioned absence rule, unbound selectors and an all-population default', () => {
    const seeded = path.join(fixtureRoot, 'runtime-bad');

    expect(absenceProblems(seeded)).toEqual([
      'alerts/runtime-unbound.json: rule "seeded-absent-unconditioned" fires on absence without the tau_telemetry_runtime_enabled clause',
    ]);
    expect(selectorSourceProblems(seeded)).toEqual([
      'dashboards/runtime-product.json: Loki selector {fly_app_name="tau-api-staging"} must be exactly {service_name=~"$service"}',
      'alerts/runtime-unbound.json: Loki selector {service_name=~"$service"} must be exactly {service_name="tau-api"}',
      "dashboards/runtime-product.json: names fly_app_name, which bypasses Tau Cloud's rewrite",
      'alerts/runtime-unbound.json: tau_telemetry_ingest_entries_total{app=~".*",disposition="recorded"} lacks service_name="tau-api"',
      'alerts/runtime-unbound.json: tau_mirror_copy_lag_seconds{app=~".*mirror.*",service_name="tau-api"} lacks service_name="tau-mirror"',
      'alerts/runtime-unbound.json: fly_instance_up{} needs exactly one app matcher from app=~".*", app=~".*storage.*", app=~".*mirror.*"',
    ]);
    expect(populationProblems(path.join(seeded, 'dashboards/runtime-product.json'))).toEqual([
      'population must default to signed-in (has "$__all")',
      'tau_runtime_exports_total{app=~"$app"} does not filter tau_runtime_population',
    ]);
  });

  it('should condition every absence rule on the enabled gauge', () => {
    expect(absenceProblems(grafanaRoot)).toEqual([]);
    expect(rulesIn(grafanaRoot).some(({ rule }) => rule.uid === 'telemetry-runtime-absent')).toBe(true);
  });

  it('should write every Loki selector as Tau Cloud rewrites it and pin every rule to its app exporter', () => {
    expect(selectorSourceProblems(grafanaRoot)).toEqual([]);
  });

  it('should default the product dashboard to the signed-in population', () => {
    expect(populationProblems(path.join(grafanaRoot, 'dashboards/runtime-product.json'))).toEqual([]);
  });

  it('should keep the process dashboard beside the runtime operations dashboard', () => {
    const uids = jsonFiles(grafanaRoot, 'dashboards').map((file) => [
      path.basename(file),
      read<{ uid: string }>(file).uid,
    ]);
    expect(uids).toContainEqual(['runtime.json', 'tau-runtime']);
    expect(uids).toContainEqual(['runtime-operations.json', 'tau-runtime-operations']);
    expect(uids).toContainEqual(['runtime-product.json', 'tau-runtime-product']);
    expect(new Set(uids.map(([, uid]) => uid)).size).toBe(uids.length);
  });

  it('should add the info rules and the heartbeat paused until Tau Cloud routes them (PR-5a)', () => {
    const unpaused = rulesIn(grafanaRoot)
      .filter(({ rule }) => rule.labels?.['severity'] === 'info' && rule.labels['package'] === 'runtime-observability')
      .filter(({ rule }) => rule.isPaused !== true)
      .map(({ rule }) => rule.uid);
    expect(unpaused).toEqual([]);
    expect(rulesIn(grafanaRoot).find(({ rule }) => rule.uid === 'telemetry-heartbeat')?.rule.isPaused).toBe(true);
  });

  it('should repeat the heartbeat weekly, since Tau Cloud renders a missing repeat_interval as the 24 h info default', () => {
    expect(
      rulesIn(grafanaRoot).find(({ rule }) => rule.uid === 'telemetry-heartbeat')?.rule.labels?.['repeat_interval'],
    ).toBe('7d');
  });
});

describe('Binding contract v2 selectors (W14 OB1 d)', () => {
  it('should reject combined, cross-app, hard-coded and mismatched app matchers in the seeded tree', () => {
    expect(bindingProblems(promqlSources(path.join(fixtureRoot, 'bad')))).toEqual([
      'dashboards/storage-unbound.json: tau_git_commit_attempts_total{app=~"tau-api.*|.*storage.*"} binds app=~"tau-api.*|.*storage.*", which is not one of app=~"$app", app=~"$storage_app", app=~"$mirror_app"; a combined or hard-coded matcher must become one query per app',
      'dashboards/storage-unbound.json: tau_storage_attempts_total{app=~"$app",service_name=~"tau-api|tau-storage"} spans tau-api and tau-storage; write one query per app',
      'dashboards/storage-unbound.json: tau_mirror_copy_lag_seconds{app=~"$app",destination="b2"} selects tau-mirror series but binds app=~"$app"; use app=~"$mirror_app"',
      'dashboards/storage-unbound.json: tau_git_rpcs_inflight{app=~"$app",service_name="tau-storage"} selects tau-storage series but binds app=~"$app"; use app=~"$storage_app"',
      'dashboards/storage-unbound.json: tau_git_rpcs_inflight{app="tau-storage-staging"} binds app="tau-storage-staging", which is not one of app=~"$app", app=~"$storage_app", app=~"$mirror_app"; a combined or hard-coded matcher must become one query per app',
      'dashboards/storage-unbound.json: tau_git_rpcs_inflight{app=~".*storage.*"} binds app=~".*storage.*", which is not one of app=~"$app", app=~"$storage_app", app=~"$mirror_app"; a combined or hard-coded matcher must become one query per app',
      'dashboards/storage-unbound.json: tau_mirror_rounds_total has no selector, so it is not bound to app=~"$mirror_app"',
      'alerts/storage-unbound.json: tau_git_hot_project_commit_rate{app=~"tau-api.*|.*storage.*",rank="1"} binds app=~"tau-api.*|.*storage.*", which is not one of app=~".*", app=~".*storage.*", app=~".*mirror.*"; a combined or hard-coded matcher must become one query per app',
      'alerts/storage-unbound.json: tau_git_rpcs_inflight{app=~"$storage_app"} binds app=~"$storage_app", which is not one of app=~".*", app=~".*storage.*", app=~".*mirror.*"; a combined or hard-coded matcher must become one query per app',
      'alerts/storage-unbound.json: tau_mirror_rounds_total{app=~".*"} selects tau-mirror series but binds app=~".*"; use app=~".*mirror.*"',
      'alerts/storage-unbound.json: tau_git_rpcs_inflight{app=~".*",app=~".*storage.*"} has 2 app matchers; hosted provisioning binds exactly one',
    ]);
    expect(variableProblems(path.join(fixtureRoot, 'bad'))).toEqual([
      'dashboards/storage-unbound.json: variable mirror_app must default to ".*mirror.*" locally (has "tau-mirror")',
    ]);
  });

  it('should accept what Tau Cloud renders for binding contract v2: one query per app', () => {
    expect(bindingProblems(promqlSources(path.join(fixtureRoot, 'v2')))).toEqual([]);
    expect(variableProblems(path.join(fixtureRoot, 'v2'))).toEqual([]);
  });

  it('should hold for every shipped dashboard and rule', () => {
    expect(bindingProblems(promqlSources())).toEqual([]);
    expect(variableProblems(grafanaRoot)).toEqual([]);
  });

  it('should scrape a local tau-storage with the app label $storage_app matches', () => {
    const config = readFileSync(path.join(grafanaRoot, 'otelcol-config.yaml'), 'utf8');
    const job = /^ {2}prometheus\/tau-storage:\n(?<body>(?: {4,}.*\n)+)/mu.exec(config)?.groups?.['body'] ?? '';
    const pipeline =
      /^ {4}metrics:\n {6}receivers:\s*\[(?<receivers>[^\]]*)\]/mu.exec(config)?.groups?.['receivers'] ?? '';

    expect(job).toMatch(/job_name: 'tau-storage'/u);
    expect(job).toMatch(/labels: \{ app: 'tau-storage' \}/u);
    expect(new RegExp(localVariables['storage_app']!, 'u').test('tau-storage')).toBe(true);
    expect(pipeline.split(',').map((receiver) => receiver.trim())).toContain('prometheus/tau-storage');
  });
});

describe('Storage-family label cardinality (W14 OB1 c)', () => {
  it('should reject seeded labels naming a project, owner, user, device, oid, digest or request id', () => {
    expect(identityLabelProblems(seededLabels)).toEqual([
      'tau.git.pushes_by_project: label "tau.project.id" names a project; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.storage.usage_by_owner: label "ownerId" names an owner; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.lfs.objects: label "tau.lfs.oid" names an LFS oid; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.compute.lookup.duration: label "tau.compute.digest" names a compute digest; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.mirror.rounds: label "request_id" names a request id; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.mirror.rounds: label "enduser.id" names a user; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
      'tau.sync.client.retries: label "deviceId" names a device; storage-family labels never carry a project, owner, user, device, oid, digest or request id',
    ]);
  });

  it('should hold for the registry', () => {
    expect(identityLabelProblems(TauMetrics)).toEqual([]);
  });
});

describe('Storage-family free-form labels (W14 OB1 f, FR20)', () => {
  it('should reject seeded free-form string labels and stale pending entries', () => {
    expect(freeFormLabelProblems(seededLabels, {})).toEqual([
      'tau.storage.usage_by_owner: label "ownerId" admits a free-form string; storage-family labels are enums with an "other" value',
      'tau.lfs.objects: label "tau.lfs.oid" admits a free-form string; storage-family labels are enums with an "other" value',
      'tau.r2.request.duration: label "tau.r2.action" admits a free-form string; storage-family labels are enums with an "other" value',
    ]);
    expect(
      freeFormLabelProblems(seededLabels, {
        'tau.storage.usage_by_owner': { ownerId: 'OB3' },
        'tau.lfs.objects': { 'tau.lfs.oid': 'OB2' },
        'tau.r2.request.duration': { 'tau.r2.action': 'OB3', outcome: 'OB3' },
        'tau.git.retired': { 'tau.git.operation': 'OB2' },
      }),
    ).toEqual([
      'freeFormPending entry tau.r2.request.duration "outcome" is not a free-form string label: remove it',
      'freeFormPending entry tau.git.retired "tau.git.operation" is not a free-form string label: remove it',
    ]);
  });

  it('should hold for the registry, with each remaining free-form label owned by a package', () => {
    expect(freeFormLabelProblems(TauMetrics)).toEqual([]);
  });
});

describe('No unwatched storage metric (W14 OB1 e)', () => {
  const v2 = path.join(fixtureRoot, 'v2');

  it('should reject a seeded storage-family instrument that no panel reads, and stale awaiting entries', () => {
    expect(unwatchedProblems(seededWatch, v2, {})).toEqual([
      'tau_git_capacity_slots (tau.git.capacity_slots) is read by no dashboard panel: add one in the same change, or list it in awaitingPanel with the package that adds it',
    ]);
    expect(
      unwatchedProblems(seededWatch, v2, {
        tau_git_capacity_slots: 'OB4',
        tau_git_rpcs_inflight: 'OB4',
        tau_git_capcity_slots: 'OB4',
      }),
    ).toEqual([
      'awaitingPanel entry tau_git_rpcs_inflight is stale: a panel reads it',
      'awaitingPanel entry tau_git_capcity_slots is stale: no storage-family instrument has that name',
    ]);
  });

  it('should hold for the registry and the shipped dashboards', () => {
    expect(unwatchedProblems(TauMetrics)).toEqual([]);
  });
});
