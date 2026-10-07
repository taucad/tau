#!/usr/bin/env node
/**
 * List every Grafana dashboard panel whose queries return no data, by running each panel's targets
 * through Grafana's own query API (so Prometheus, Loki, Tempo, Pyroscope, Redis and PostgreSQL panels
 * are judged the way the panel would render them).
 *
 * Template variables built by `label_values(...)` are run too: one that resolves empty blanks every
 * panel filtering on it.
 *
 * Optional env: GRAFANA_URL (default http://localhost:6100), GRAFANA_API_KEY (else anonymous/admin).
 * Usage: node apps/api/scripts/check-grafana-panels.mts [--from=now-1h] [--dashboard=<uid>] [--baseline=<file>]
 * `--baseline` names known-empty panels, one `Dashboard › Panel` per line, so the check can gate new gaps
 * while instrumentation is still landing; baseline lines that now have data are reported as stale.
 * Exit codes: 0 every panel and variable has data (or is in the baseline), 1 otherwise.
 */
/* oxlint-disable no-await-in-loop -- one query at a time keeps a local Grafana responsive */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { from: { type: 'string', default: 'now-1h' }, dashboard: { type: 'string' }, baseline: { type: 'string' } },
});
const grafana = process.env['GRAFANA_URL'] ?? 'http://localhost:6100';
const headers: Record<string, string> = {
  'content-type': 'application/json',
  ...(process.env['GRAFANA_API_KEY'] ? { authorization: `Bearer ${process.env['GRAFANA_API_KEY']}` } : {}),
};
// Template variables at the values an operator opens the dashboards with.
const variables: Record<string, string> = { service: 'tau-api', instance: '.*', agent: '.*', app: 'tau-api' };

type Target = Record<string, unknown> & { refId?: string; datasource?: unknown; hide?: boolean };
type Panel = { title?: string; type: string; datasource?: unknown; targets?: Target[]; panels?: Panel[] };
type Datasource = { uid: string; name: string; type: string; isDefault: boolean };
type Variable = { name: string; type: string; query?: unknown; datasource?: unknown };

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${grafana}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status}`);
  }
  return (await response.json()) as T;
}

const datasources = await get<Datasource[]>('/api/datasources');
const fallback = datasources.find((source) => source.isDefault) ?? datasources[0];
const resolve = (reference: unknown): Datasource | undefined => {
  if (reference === null || reference === undefined) {
    return fallback;
  }
  const key = typeof reference === 'string' ? reference : (reference as { uid?: string }).uid;
  return datasources.find((source) => source.uid === key || source.name === key);
};
const substitute = (value: unknown): unknown =>
  typeof value === 'string'
    ? value
        .replaceAll(/\$\{?(\w+)\}?/gu, (match, name: string) => variables[name] ?? match)
        .replaceAll('$__range', '1h')
        .replaceAll('$__rate_interval', '1m')
        .replaceAll('$__interval', '1m')
    : value;

const hasData = (result: unknown): boolean =>
  Object.values(
    (result as { results?: Record<string, { frames?: Array<{ data?: { values?: unknown[][] } }> }> }).results ?? {},
  ).some(({ frames = [] }) => frames.some(({ data }) => (data?.values ?? []).some((column) => column.length > 0)));

const dashboards = await get<Array<{ uid: string; title: string }>>('/api/search?type=dash-db');
const baseline = new Set(
  values.baseline
    ? readFileSync(values.baseline, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [],
);
// Keyed `Dashboard › Panel` (or `Dashboard › $variable`), the form a baseline line takes.
const empty = new Map<string, string>();
let checked = 0;
for (const { uid, title } of dashboards.filter(({ uid: id }) => !values.dashboard || id === values.dashboard)) {
  const { dashboard } = await get<{ dashboard: { panels: Panel[]; templating?: { list?: Variable[] } } }>(
    `/api/dashboards/uid/${uid}`,
  );
  for (const variable of dashboard.templating?.list ?? []) {
    const match =
      variable.type === 'query' && typeof variable.query === 'string'
        ? /^label_values\((?<selector>.+),\s*(?<label>\w+)\)$/u.exec(variable.query)?.groups
        : undefined;
    if (match?.['selector'] === undefined || match['label'] === undefined) {
      continue;
    }
    checked += 1;
    const search = new URLSearchParams({ 'match[]': String(substitute(match['selector'])) });
    const { data } = await get<{ data: string[] }>(
      `/api/datasources/proxy/uid/${resolve(variable.datasource)?.uid ?? ''}/api/v1/label/${match['label']}/values?${search.toString()}`,
    );
    if (data.length === 0) {
      empty.set(`${title} › $${variable.name}`, 'variable has no values');
    }
  }
  const panels = dashboard.panels.flatMap((panel) => (panel.type === 'row' ? (panel.panels ?? []) : [panel]));
  for (const panel of panels) {
    const targets = (panel.targets ?? []).filter((target) => !target.hide);
    if (targets.length === 0) {
      continue;
    }
    checked += 1;
    const queries = targets.map((target, index) => {
      const source = resolve(target.datasource ?? panel.datasource);
      return {
        ...Object.fromEntries(Object.entries(target).map(([key, value]) => [key, substitute(value)])),
        refId: target.refId ?? String.fromCodePoint(65 + index),
        datasource: { uid: source?.uid, type: source?.type },
        // Tempo search panels list traces; the query API needs the search shape spelled out.
        ...(source?.type === 'tempo' ? { queryType: 'traceql', limit: 20 } : {}),
        maxDataPoints: 100,
        // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Grafana's query API field name
        intervalMs: 60_000,
      };
    });
    const response = await fetch(`${grafana}/api/ds/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from: values.from, to: 'now', queries }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok || !hasData(body)) {
      empty.set(
        `${title} › ${panel.title ?? '(untitled)'}`,
        response.ok ? 'no data' : `HTTP ${response.status} ${JSON.stringify(body).slice(0, 160)}`,
      );
    }
  }
}

console.log(`${checked - empty.size}/${checked} panels and variables have data`);
const unexpected = [...empty].filter(([key]) => !baseline.has(key));
for (const [key, reason] of empty) {
  console.log(`  ${baseline.has(key) ? '·' : '✗'} ${key} — ${reason}`);
}
for (const key of [...baseline].filter((line) => !empty.has(line))) {
  console.log(`  ↑ ${key} — has data now; drop it from the baseline`);
}
process.exit(unexpected.length === 0 ? 0 : 1);
