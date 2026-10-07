#!/usr/bin/env node
/**
 * List every Grafana dashboard panel whose queries return no data, by running each panel's targets
 * through Grafana's own query API (so Prometheus, Loki, Tempo, Pyroscope, Redis and PostgreSQL panels
 * are judged the way the panel would render them).
 *
 * Optional env: GRAFANA_URL (default http://localhost:6100), GRAFANA_API_KEY (else anonymous/admin).
 * Usage: node apps/api/scripts/check-grafana-panels.mts [--from=now-1h] [--dashboard=<uid>]
 * Exit codes: 0 every panel has data, 1 at least one panel is empty or failed.
 */
/* oxlint-disable no-await-in-loop -- one query at a time keeps a local Grafana responsive */
import process from 'node:process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { from: { type: 'string', default: 'now-1h' }, dashboard: { type: 'string' } },
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
const empty: string[] = [];
let checked = 0;
for (const { uid, title } of dashboards.filter(({ uid: id }) => !values.dashboard || id === values.dashboard)) {
  const { dashboard } = await get<{ dashboard: { panels: Panel[] } }>(`/api/dashboards/uid/${uid}`);
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
      const reason = response.ok ? 'no data' : `HTTP ${response.status} ${JSON.stringify(body).slice(0, 160)}`;
      empty.push(`${title} › ${panel.title ?? '(untitled)'} — ${reason}`);
    }
  }
}

console.log(`${checked - empty.length}/${checked} panels have data`);
for (const line of empty) {
  console.log(`  ✗ ${line}`);
}
process.exit(empty.length === 0 ? 0 : 1);
