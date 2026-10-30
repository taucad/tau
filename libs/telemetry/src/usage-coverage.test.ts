/**
 * T36 (revision 22, usage coverage contract; the telemetry part): every transcoder and job provider the plugin
 * registry composes has a usage series. The ids are derived from the registry itself, not from the generated
 * vocabulary, so a transcoder or job provider added to the registry fails here until its id reaches the usage
 * counter `tau.runtime.plugin_operations` under its capability and the product dashboard reads that series.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuntimeEntryName, capabilityOf, otherValue, usageCoverage } from '#runtime-ingest.js';
import type { PluginCapability } from '#runtime-ingest.js';
import { parseRuntimeEntry } from '#runtime-entry.js';
import { runtimeMetrics } from '#runtime-metrics.js';

/** The part of `scripts/runtime-registry.mts` this test reads. */
type RegistryModule = Readonly<{
  deriveRuntimeVocabulary: () => Promise<
    Readonly<{ transcoderIds: readonly string[]; jobProviderIds: readonly string[] }>
  >;
}>;

/* The derivation lives in `scripts/` (it imports the plugins, which this library must not depend on). */
const registryModule = '../scripts/runtime-registry.mts';
const registry = (await import(/* @vite-ignore */ registryModule)) as RegistryModule;
const derived = await registry.deriveRuntimeVocabulary();

const productDashboard = path.resolve(import.meta.dirname, '../../../infra/grafana/dashboards/runtime-product.json');

type Panel = Readonly<{ title?: string; targets?: ReadonlyArray<Readonly<{ expr?: string }>>; panels?: Panel[] }>;
const panelsOf = (panels: readonly Panel[]): Panel[] =>
  panels.flatMap((panel) => [panel, ...panelsOf(panel.panels ?? [])]);
const productExpressions = panelsOf(
  (JSON.parse(readFileSync(productDashboard, 'utf8')) as Readonly<{ panels?: Panel[] }>).panels ?? [],
).flatMap((panel) => (panel.targets ?? []).map((target) => target.expr ?? ''));

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
