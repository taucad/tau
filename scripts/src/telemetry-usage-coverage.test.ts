/**
 * T36 (revision 22, usage coverage contract; the telemetry part): every transcoder and job provider the plugin
 * registry composes has a usage series. The ids are derived from the registry itself, not from the generated
 * vocabulary, so a transcoder or job provider added to the registry fails here until its id reaches the usage
 * counter `tau.runtime.plugin_operations` under its capability and the product dashboard reads that series.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RuntimeEntryName,
  capabilityOf,
  otherValue,
  parseRuntimeEntry,
  runtimeMetrics,
  usageCoverage,
} from '@taucad/telemetry';
import type { PluginCapability } from '@taucad/telemetry';

/** The part of `libs/telemetry/scripts/runtime-registry.mts` this test reads. */
type RegistryModule = Readonly<{
  deriveRuntimeVocabulary: () => Promise<
    Readonly<{ transcoderIds: readonly string[]; jobProviderIds: readonly string[] }>
  >;
}>;

/*
 * The derivation lives beside the telemetry generator (it imports the plugins, which that library must not depend on);
 * this test lives here, in the workspace-wide `scripts` project, so the plugin sources are not `telemetry:test` inputs.
 */
const registryModule = new URL('../../libs/telemetry/scripts/runtime-registry.mts', import.meta.url).href;
const registry = (await import(/* @vite-ignore */ registryModule)) as RegistryModule;
const derived = await registry.deriveRuntimeVocabulary();

const productDashboard = path.resolve(import.meta.dirname, '../../infra/grafana/dashboards/runtime-product.json');

type Panel = Readonly<{ title?: string; targets?: ReadonlyArray<Readonly<{ expr?: string }>>; panels?: Panel[] }>;
const panelsOf = (panels: readonly Panel[]): Panel[] =>
  panels.flatMap((panel) => [panel, ...panelsOf(panel.panels ?? [])]);
const productPanels = panelsOf(
  (JSON.parse(readFileSync(productDashboard, 'utf8')) as Readonly<{ panels?: Panel[] }>).panels ?? [],
);
const productExpressions = productPanels.flatMap((panel) => (panel.targets ?? []).map((target) => target.expr ?? ''));

/** One usage row's dimension, as `usageCoverage` names it. */
type UsageDimension = (typeof usageCoverage)[number]['dimension'];

/**
 * Rows whose series lives on another dashboard and not on the product dashboard. The agent dashboards count tool calls
 * by agent and tool kind, but no panel there reads `tool_name`, so this row has no panel to map yet.
 */
const offProductDashboard = ['agent tools (existing instruments)'] as const satisfies readonly UsageDimension[];

/**
 * Each usage row's product-dashboard panel, by exact title (operator ruling, 2026-11-04: "Map by panel title"). The
 * design's §11 numbers and Grafana panel ids are not used, so renaming a panel, or adding a row without choosing its
 * panel, fails here.
 */
const productPanelByDimension = {
  kernels: 'Attempts by Kernel (daily)',
  'kernels by host and caller': 'Kernels by Host',
  transcoders: 'Transcoder Usage (daily)',
  'job providers': 'Job Usage by Provider (daily)',
  middleware: 'Middleware Usage',
  bundlers: 'Bundler Usage (daily)',
  'machine providers': 'Machine Provider Usage (daily)',
  'machine operations (action, stop, hold, transfer, start) and action families':
    'Machine Operations by Provider and Kind',
  'plugin reach (distinct signed-in users)': 'Plugin Reach, Today',
  'kernel reach (distinct signed-in users)': 'Estimated Users per Kernel, Today',
  'conversions (import side)': 'Conversions: Source → Target',
  'entry and import formats': 'Entry Formats by Kernel',
  'export formats': 'Exports by Format (daily)',
  'callers (editor, agent, geospec, quicklook, host, converter, capture, viewer)': 'Caller Mix',
  'hosts, platform, OS': 'Hosts',
  transport: 'Attempts by Transport (daily)',
  operations: 'Operation Mix (daily)',
  'GeoSpec runs': 'GeoSpec Runs by Outcome (daily)',
  'jobs (lifecycle)': 'Jobs by Outcome (daily)',
  'viewer events': 'Viewer Context Loss per 1,000 First Frames',
  'viewer downloads by format': 'Viewer Downloads by Format (daily)',
  'parameters declared and modified': 'Evaluates by Parameter Class (daily)',
  'parameter features': 'Parameter Features by Kernel',
  'cache reuse': 'Cache Hit Ratio by Kernel',
  releases: 'Success Rate by Release',
  'heap source coverage': 'Heap Coverage per Kernel',
} as const satisfies Readonly<Record<Exclude<UsageDimension, (typeof offProductDashboard)[number]>, string>>;

/**
 * Whether one PromQL expression reads a usage row's series: a selector on the row's metric carrying each of the row's
 * matchers, and the row's `by` label grouped on or matched in the same expression.
 *
 * @param expr - The panel target's expression.
 * @param row - The usage row.
 * @returns Whether the expression reads the row's series by its label.
 */
const readsSeries = (expr: string, row: Readonly<{ series: string; by: string }>): boolean => {
  const [, metric = '', selector = ''] = /^(?<metric>[\w:]+)(?:\{(?<selector>[^}]*)\})?$/u.exec(row.series) ?? [];
  const matchers = selector === '' ? [] : selector.split(',');
  const selectors = [...expr.matchAll(/(?<name>[\w:]+)\{(?<inner>[^}]*)\}/gu)].filter(
    ({ groups }) => groups?.['name'] === metric,
  );
  const selected = selectors.some(({ groups }) => matchers.every((matcher) => groups?.['inner']?.includes(matcher)));
  const grouped = [...expr.matchAll(/\bby \((?<labels>[^)]*)\)/gu)].some(({ groups }) =>
    (groups?.['labels'] ?? '').split(',').some((label) => label.trim() === row.by),
  );
  const matched = new RegExp(`[{,]${row.by}=~?"`, 'u').test(expr);
  return selected && (grouped || matched);
};

const usage = (capability: PluginCapability, plugin: string) =>
  runtimeMetrics.runtimePluginOperations.attributes.parse({
    'tau.runtime.capability': capability,
    'tau.runtime.plugin': plugin,
    'tau.runtime.operation': capability === 'job' ? 'job' : 'transcode',
    'tau.runtime.outcome': 'succeeded',
    'tau.runtime.population': 'signed-in',
  });

const capabilities = [
  { capability: 'transcoder', operation: 'transcode', ids: derived.transcoderIds },
  { capability: 'job', operation: 'job', ids: derived.jobProviderIds },
] as const;

describe('usage coverage (T36): every registry transcoder and job provider has a usage series', () => {
  it.each(capabilities)('should name a $capability row on plugin_operations by plugin', ({ capability }) => {
    const series = `tau_runtime_plugin_operations_total{tau_runtime_capability="${capability}"}`;
    expect(usageCoverage).toContainEqual(expect.objectContaining({ series, by: 'tau_runtime_plugin' }));
    // The product dashboard reads the series per plugin under the same capability.
    expect(
      productExpressions.some(
        (expr) =>
          /sum by \([^)]*\btau_runtime_plugin\b[^)]*\)/u.test(expr) &&
          expr.includes('tau_runtime_plugin_operations_total{') &&
          expr.includes(`tau_runtime_capability="${capability}"`),
      ),
    ).toBe(true);
  });

  it.each(capabilities)(
    'should carry every registry $capability id from the entry to its own usage label',
    ({ capability, operation, ids }) => {
      expect(ids.length).toBeGreaterThan(0);
      const problems = ids.flatMap((id) => {
        const entry = parseRuntimeEntry({
          name: RuntimeEntryName.OPERATION,
          duration: 120,
          detail: {
            operation,
            outcome: 'succeeded',
            route: 'browser',
            caller: 'editor',
            release: '0123abc',
            plugin: id,
          },
        });
        const facet = entry !== undefined && 'plugin' in entry.detail ? entry.detail.plugin : undefined;
        const found: string[] = [];
        if (facet !== id) {
          found.push(`${id}: the entry's plugin facet reads ${String(facet)}`);
        }
        const derivedCapability = capabilityOf[id as keyof typeof capabilityOf] as PluginCapability | undefined;
        if (derivedCapability !== capability) {
          found.push(`${id}: capabilityOf is ${String(derivedCapability)}`);
        }
        const labels = usage(capability, id);
        if (labels['tau.runtime.plugin'] !== id || labels['tau.runtime.capability'] !== capability) {
          found.push(`${id}: plugin_operations records ${JSON.stringify(labels)}`);
        }
        return found;
      });
      expect(problems).toEqual([]);
    },
  );

  it('should collapse an id the registry does not compose to _OTHER, so the checks above can fail', () => {
    expect(usage('transcoder', 'not-a-registry-transcoder')['tau.runtime.plugin']).toBe(otherValue);
    expect(capabilityOf['not-a-registry-transcoder' as keyof typeof capabilityOf]).toBeUndefined();
  });
});

describe('usage coverage (T36): every usage row maps to a product panel by title', () => {
  it('should map every usage row, or list it as off the product dashboard', () => {
    expect([...Object.keys(productPanelByDimension), ...offProductDashboard].sort()).toEqual(
      usageCoverage.map(({ dimension }) => dimension).sort(),
    );
  });

  it.each(
    usageCoverage.flatMap((row) =>
      Object.hasOwn(productPanelByDimension, row.dimension)
        ? [{ ...row, title: productPanelByDimension[row.dimension as keyof typeof productPanelByDimension] }]
        : [],
    ),
  )('should show the $dimension row on the product panel $title', (row) => {
    const panels = productPanels.filter((panel) => panel.title === row.title);
    expect(panels).toHaveLength(1);
    const expressions = (panels[0]?.targets ?? []).map((target) => target.expr ?? '');
    expect(expressions.some((expr) => readsSeries(expr, row))).toBe(true);
  });

  it('should not take a panel that reads another series for a row', () => {
    const transcoders = {
      series: 'tau_runtime_plugin_operations_total{tau_runtime_capability="transcoder"}',
      by: 'tau_runtime_plugin',
    };
    const bundler = productPanels.find((panel) => panel.title === productPanelByDimension.bundlers);
    expect((bundler?.targets ?? []).some((target) => readsSeries(target.expr ?? '', transcoders))).toBe(false);
    expect(readsSeries('sum by (kernel_id) (increase(tau_runtime_operations_total{a="b"}[1d]))', transcoders)).toBe(
      false,
    );
  });
});
