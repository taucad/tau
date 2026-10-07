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
 * (`pnpm nx run api:grafana:check` passes `--baseline=infra/grafana/known-empty-panels.txt`)
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

type Target = Record<string, unknown> & { refId?: string; datasource?: unknown; hide?: boolean };
type Panel = { title?: string; type: string; datasource?: unknown; targets?: Target[]; panels?: Panel[] };
type Datasource = { uid: string; name: string; type: string; isDefault: boolean };
type Variable = {
  name: string;
  type: string;
  query?: unknown;
  datasource?: unknown;
  allValue?: string;
  current?: { value?: string | string[] };
};

/** A dashboard's variables at the values it opens with: its saved `current`, with `All` as its `allValue`. */
const openingValues = (list: readonly Variable[]): Record<string, string> =>
  Object.fromEntries(
    list.map(({ name, current, allValue }) => {
      const value = current?.value ?? '$__all';
      const values = Array.isArray(value) ? value : [value];
      return [name, values.includes('$__all') ? (allValue ?? '.*') : values.join('|')];
    }),
  );

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
const substitute = (value: unknown, variables: Readonly<Record<string, string>>): unknown =>
  typeof value === 'string'
    ? value
        .replaceAll('$__range', '1h')
        .replaceAll('$__rate_interval', '1m')
        .replaceAll('$__interval', '1m')
        .replaceAll(/\$\{?(\w+)\}?/gu, (match, name: string) => variables[name] ?? match)
    : value;
/** A `$name` left after substitution is a variable the dashboard does not define, not a telemetry gap. */
const unresolved = (value: unknown): string | undefined =>
  typeof value === 'string' ? /\$\{?\w+/u.exec(value)?.[0] : undefined;

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
        .filter((line) => line !== '' && !line.startsWith('#'))
    : [],
);
// Keyed `Dashboard › Panel` (or `Dashboard › $variable`), the form a baseline line takes.
const empty = new Map<string, string>();
let checked = 0;
const checkedTitles = new Set<string>();
for (const { uid, title } of dashboards.filter(({ uid: id }) => !values.dashboard || id === values.dashboard)) {
  checkedTitles.add(title);
  const { dashboard } = await get<{ dashboard: { panels: Panel[]; templating?: { list?: Variable[] } } }>(
    `/api/dashboards/uid/${uid}`,
  );
  const variables = openingValues(dashboard.templating?.list ?? []);
  for (const variable of dashboard.templating?.list ?? []) {
    const match =
      variable.type === 'query' && typeof variable.query === 'string'
        ? /^label_values\((?<selector>.+),\s*(?<label>\w+)\)$/u.exec(variable.query)?.groups
        : undefined;
    if (match?.['selector'] === undefined || match['label'] === undefined) {
      continue;
    }
    checked += 1;
    const search = new URLSearchParams({ 'match[]': String(substitute(match['selector'], variables)) });
    const labelValues = await get<{ data: string[] }>(
      `/api/datasources/proxy/uid/${resolve(variable.datasource)?.uid ?? ''}/api/v1/label/${match['label']}/values?${search.toString()}`,
    ).then(({ data }) => data, String);
    if (typeof labelValues === 'string' || labelValues.length === 0) {
      empty.set(
        `${title} › $${variable.name}`,
        typeof labelValues === 'string' ? labelValues : 'variable has no values',
      );
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
        ...Object.fromEntries(Object.entries(target).map(([key, value]) => [key, substitute(value, variables)])),
        refId: target.refId ?? String.fromCodePoint(65 + index),
        datasource: { uid: source?.uid, type: source?.type },
        // Tempo search panels list traces; the query API needs the search shape spelled out.
        ...(source?.type === 'tempo' ? { queryType: 'traceql', limit: 20 } : {}),
        maxDataPoints: 100,
        // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Grafana's query API field name
        intervalMs: 60_000,
      };
    });
    const leftover = queries.flatMap((query) => Object.values(query).map((value) => unresolved(value))).find(Boolean);
    if (leftover !== undefined) {
      empty.set(`${title} › ${panel.title ?? '(untitled)'}`, `unresolved variable ${leftover}`);
      continue;
    }
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
// Deliberately not a failure: a panel fed only by error paths can have data on one run and not the
// next, so a stale line is reported for pruning rather than failing the gate. With `--dashboard`, only
// that dashboard's lines are judged; otherwise a line naming a dashboard that no longer exists is stale too.
for (const key of [...baseline].filter(
  (line) => (!values.dashboard || checkedTitles.has(line.split(' › ')[0] ?? '')) && !empty.has(line),
)) {
  console.log(`  ↑ ${key} — has data now or its dashboard is gone; drop it from the baseline`);
}
process.exit(unexpected.length === 0 ? 0 : 1);
