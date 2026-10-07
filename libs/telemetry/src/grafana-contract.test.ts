import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { toPrometheusName } from '#prometheus.js';
import { TauMetrics } from '#registry.js';

/**
 * The dashboards and alert rules query Tau's own series by their exported Prometheus names. This
 * pins those names to the registry, so a renamed or undeclared instrument fails here instead of
 * leaving a panel or rule silently empty.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../../infra/grafana');

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
type Panel = { targets?: Target[]; datasource?: { type?: string }; panels?: Panel[] };
type Dashboard = { panels?: Panel[]; templating?: { list?: Array<{ query?: unknown }> } };
type RuleGroup = { rules?: Array<{ data?: Array<{ model?: { expr?: unknown } }> }> };

const strings = (values: readonly unknown[]): string[] =>
  values.filter((value): value is string => typeof value === 'string');

function read<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

const jsonFiles = (directory: string): string[] =>
  readdirSync(path.join(grafanaRoot, directory))
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(grafanaRoot, directory, name));

/** Every PromQL string with the file it came from: panel targets, template variables and rule models. */
const promqlSources = (): Array<[query: string, file: string]> => {
  const sources: Array<[string, string]> = [];
  const add = (file: string, queries: readonly string[]): void => {
    for (const query of queries) {
      sources.push([query, path.relative(grafanaRoot, file)]);
    }
  };
  for (const file of jsonFiles('dashboards')) {
    const dashboard = read<Dashboard>(file);
    const panels = (dashboard.panels ?? []).flatMap((panel) => [panel, ...(panel.panels ?? [])]);
    // Loki targets also use `expr`; LogQL label filters sit outside braces and would read as metric names.
    const promql = panels.flatMap((panel) =>
      (panel.targets ?? []).filter((target) => (target.datasource ?? panel.datasource)?.type !== 'loki'),
    );
    add(file, strings(promql.map((target) => target.expr)));
    add(file, strings((dashboard.templating?.list ?? []).map((variable) => variable.query)));
  }
  for (const file of jsonFiles('alerts')) {
    const rules = read<RuleGroup>(file).rules ?? [];
    add(file, strings(rules.flatMap((rule) => (rule.data ?? []).map((query) => query.model?.expr))));
  }
  // The local provisioning copy: each `expr:` is a folded or plain YAML scalar, indented under its key.
  const yamlFile = path.join(grafanaRoot, 'provisioning/alerting/alerts.yaml');
  const lines = readFileSync(yamlFile, 'utf8').split('\n');
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
    add(yamlFile, [/^[>|]/u.test(rest) ? block.join(' ') : rest]);
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

/** Metric name → every file that queries it. */
const queried = (): Map<string, string[]> => {
  const names = new Map<string, string[]>();
  for (const [query, file] of promqlSources()) {
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
