/**
 * T30 (AR-W15-02/03/08, AR-W22-03, AR-W23-02): the generated runtime vocabularies equal the plugin registry, and the
 * product `kernelIds` are untouched. Regenerate with `pnpm nx run telemetry:generate-runtime-vocabulary`.
 */
import { describe, expect, it } from 'vitest';
import { kernelIds } from '#ingest.js';
import { capabilityOf, codeClassOf, errorTypes, fileFormatOf, pluginUsageIds } from '#runtime-ingest.js';
import * as generated from '#runtime-vocabulary.js';

/** The parts of `scripts/runtime-registry.mts` this test reads. */
type RegistryModule = Readonly<{
  deriveRuntimeVocabulary: () => Promise<Readonly<Record<string, readonly string[]>>>;
  registryCapabilities: () => Promise<
    ReadonlyArray<
      Readonly<{
        kind: string;
        id: string;
        extensions: readonly string[];
        exports: readonly string[];
        edges: ReadonlyArray<Readonly<{ from: string; to: string }>>;
      }>
    >
  >;
}>;

/* The derivation lives in `scripts/` (it imports the plugins, which this library must not depend on). */
const registryModule = '../scripts/runtime-registry.mts';
const registry = (await import(/* @vite-ignore */ registryModule)) as RegistryModule;
const derived = await registry.deriveRuntimeVocabulary();

describe('runtime vocabularies (T30)', () => {
  it('should equal the vocabularies derived from the plugin registry', () => {
    const { ...actual } = generated;
    expect(actual).toEqual(derived);
  });

  it('should keep the product kernelIds byte-identical to main (they are not runtime plugin ids)', () => {
    expect(kernelIds).toEqual([
      'picogk',
      'picovoxel',
      'build123d',
      'smlibpy',
      'openscad',
      'replicad',
      'manifold',
      'zoo',
      'jscad',
      'opencascadejs',
      'smlib',
      'tscircuit',
    ]);
    expect(generated.runtimeKernelIds).toContain('smlib');
    expect(generated.runtimeKernelIds).toContain('openrscad');
    expect(generated.runtimeKernelIds).not.toContain('opencascadejs');
  });

  it('should list every transcoder, job provider and machine provider the registry composes', () => {
    expect(generated.transcoderIds).toContain('slicer');
    expect(generated.jobProviderIds.length).toBeGreaterThan(0);
    expect(generated.machineProviderIds.length).toBeGreaterThan(0);
    expect(generated.bundlerIds).toEqual(['esbuild', 'rolldown']);
    expect(generated.middlewareIds).toContain('ParameterCache');
  });

  it('should derive format as kernel export extensions and transcoder edge targets, nothing else', async () => {
    const capabilities = await registry.registryCapabilities();
    const expected = new Set([
      ...capabilities.flatMap((capability) => capability.exports),
      ...capabilities.flatMap((capability) => capability.edges.map((edge) => edge.to)),
    ]);
    expect(new Set(generated.exportFormats)).toEqual(expected);
    for (const format of ['webp', 'jpeg', 'gcode.3mf', 'dae', 'fbx', 'usda', 'usdc', 'usdz', 'csv', 'txt', 'json']) {
      expect(generated.exportFormats).toContain(format);
    }
    for (const format of ['3ds', 'x', 'x3d', 'wrl', 'vrml']) {
      expect(generated.exportFormats).not.toContain(format);
    }
  });

  it('should keep fileFormat a superset of format with every assimp extension', async () => {
    const fileFormats = new Set<string>(generated.fileFormats);
    for (const format of generated.exportFormats) {
      expect(fileFormats.has(format)).toBe(true);
    }
    const capabilities = await registry.registryCapabilities();
    const assimp = capabilities.find((capability) => capability.kind === 'kernels' && capability.id === 'assimp');
    expect(assimp?.extensions).toHaveLength(24);
    for (const extension of assimp?.extensions ?? []) {
      expect(fileFormats.has(extension)).toBe(true);
    }
    expect(fileFormatOf('model.mesh.xml')).toBe('mesh.xml');
  });

  it('should equal the conversion edges to the transcoder edges', async () => {
    const capabilities = await registry.registryCapabilities();
    const edges = capabilities.flatMap((capability) => capability.edges.map((edge) => `${edge.from}→${edge.to}`));
    expect(generated.conversionEdges).toEqual([...new Set(edges)].toSorted());
  });

  it('should map every non-kernel plugin id to a capability, and classify every error type', () => {
    for (const id of pluginUsageIds) {
      expect(capabilityOf[id]).toBeDefined();
    }
    for (const id of generated.transcoderIds) {
      expect(capabilityOf[id]).toBe('transcoder');
    }
    for (const id of generated.jobProviderIds) {
      expect(capabilityOf[id]).toBe('job');
    }
    for (const code of errorTypes) {
      expect(codeClassOf[code]).toBeDefined();
    }
    for (const code of generated.machineFailureCodes) {
      expect(errorTypes).toContain(code);
    }
  });
});
