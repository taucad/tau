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
 * Names the dashboards query ahead of the PR that declares them (taucad/tau#382). Each entry goes when that PR
 * merges; the second test fails until it does.
 */
/* eslint-disable @typescript-eslint/naming-convention -- keys are Prometheus metric names */
const pendingDeclaration: Readonly<Record<string, string>> = {
  tau_agent_sessions_total: 'taucad/tau#382',
  tau_agent_turns_total: 'taucad/tau#382',
  tau_agent_turn_duration: 'taucad/tau#382',
  tau_agent_time_to_first_update: 'taucad/tau#382',
  tau_agent_tool_calls_total: 'taucad/tau#382',
  tau_agent_tokens_total: 'taucad/tau#382',
  tau_agent_cost_total: 'taucad/tau#382',
  tau_agent_errors_total: 'taucad/tau#382',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the metric-name map */

const declared = new Set(Object.values(TauMetrics).map((metric) => toPrometheusName(metric.name, metric.type)));

const queried = (): Map<string, string> => {
  const files = [
    ...['dashboards', 'alerts'].flatMap((directory) =>
      readdirSync(path.join(grafanaRoot, directory))
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(grafanaRoot, directory, name)),
    ),
    path.join(grafanaRoot, 'provisioning/alerting/alerts.yaml'),
  ];
  const names = new Map<string, string>();
  for (const file of files) {
    // A PromQL metric selector is the only place a Tau-prefixed token is followed by `{`; labels never are.
    for (const [, name] of readFileSync(file, 'utf8').matchAll(
      /\b((?:tau|ws|gen_ai|sse|rpc|kernel|publication)_\w+)\s*\{/gu,
    )) {
      names.set(name!.replace(/_(?:bucket|sum|count)$/u, ''), path.relative(grafanaRoot, file));
    }
  }
  return names;
};

describe('Grafana dashboards and alert rules', () => {
  it('should query only Tau metrics the registry declares', () => {
    const undeclared = [...queried()]
      .filter(([name]) => !declared.has(name) && !(name in pendingDeclaration))
      .map(([name, file]) => `${name} (${file})`);

    expect(undeclared).toEqual([]);
  });

  it('should drop a pending name once its PR declares it', () => {
    expect(Object.keys(pendingDeclaration).filter((name) => declared.has(name))).toEqual([]);
  });
});
