import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { sha256, verifyBroadFixtures } from '#bench/lib';
import type { BroadFixtureDescriptor, BroadFixtureManifest, SizedArtifact } from '#bench/broad-fixtures';

await test('should verify all broad families once per file and retain recipes as pending non-ingestible metadata', async (context) => {
  const cache = 'node_modules/.cache/geospec-engine-native/matcher-full-broad-harness-integration-a1';
  await fs.mkdir(cache, { recursive: true });
  const directory = await fs.mkdtemp(join(cache, 'valid-'));
  const write = async (name: string, text: string): Promise<SizedArtifact> => {
    const path = join(directory, name);
    await fs.writeFile(path, text);
    return { path, sha256: sha256(text), bytes: Buffer.byteLength(text) };
  };
  try {
    const generator = await write('producer.ts', '// Tiny input provenance only.\n');
    const shared = await write('shared.bin', 'shared input bytes');
    const mesh = await write('mesh.gltf', '{"asset":{"version":"2.0"}}');
    const occurrences = await write('occurrences.step', 'ISO-10303-21;\nEND-ISO-10303-21;\n');
    const boolean = await write('boolean.gltf', '{"asset":{"version":"2.0"},"meshes":[]}');
    const pending = {
      id: 'claims',
      subject: 'mesh',
      claimCount: 2,
      profileRequirements: {
        configuration: 'W2.C-CONFIG-01',
        logicalBudget: 'W2.C-LOGICAL-BUDGET-02',
        workUnitBudget: 'LEAD_PROFILE_VALUE',
        canonicalEnvelope: 'LEAD_OWNED_PENDING_CORE_NORMALIZATION',
      },
      metadataObligations: {
        sourceGenerations: 1,
        sourceIngestions: 1,
        demandReuse: 'permitted',
        status: 'obligation-not-observation',
      },
    };
    const recipe = await write(
      'claims.json',
      JSON.stringify({
        schemaVersion: 1,
        ...pending,
        claims: [
          { claimId: 'bounds', subject: 'mesh', query: { kind: 'bounds' } },
          { claimId: 'area', subject: 'mesh', query: { kind: 'surface-area' } },
        ],
      }),
    );
    const fixtures: BroadFixtureDescriptor[] = [
      {
        id: 'mesh',
        family: 'large-mesh',
        format: 'gltf',
        primary: mesh,
        resources: [shared],
        analyticFacts: { declaredOccurrences: 1 },
        qualification: 'input metadata only',
      },
      {
        id: 'occurrences',
        family: 'many-occurrences',
        format: 'step',
        primary: occurrences,
        resources: [shared],
        analyticFacts: { occurrences: 2 },
        qualification: 'input metadata only',
      },
      {
        id: 'boolean',
        family: 'boolean-void-heavy',
        format: 'gltf',
        primary: boolean,
        resources: [shared],
        analyticFacts: { formula: 'supplied by producer' },
        qualification: 'input metadata only',
      },
      {
        id: 'claims',
        family: 'many-claims',
        format: 'request-construction-json',
        primary: recipe,
        resources: [shared],
        analyticFacts: { claimCount: 2 },
        qualification: 'mapping pending',
      },
    ];
    const totalGeneratedBytes = [mesh, occurrences, boolean, recipe, shared].reduce(
      (sum, input) => sum + input.bytes,
      0,
    );
    const manifest: BroadFixtureManifest = {
      schemaVersion: 1,
      source: 'abda45d29347115685b226bffe26bbb3678a27e0',
      generator,
      fixtures,
      totalGeneratedBytes,
      candidateEngineExecuted: false,
      timingRun: false,
    };
    const manifestArtifact = await write('manifest.json', JSON.stringify(manifest));
    // Pass-through instrumentation: count actual filesystem reads without replacing input behavior.
    const reader = context.mock.method(fs, 'readFile');
    syncBuiltinESMExports();
    try {
      const receipt = await verifyBroadFixtures(manifestArtifact);
      assert.deepEqual(receipt, {
        schemaVersion: 1,
        manifest: manifestArtifact,
        producerSource: manifest.source,
        generator,
        closure: {
          declared: { artifacts: 5, bytes: totalGeneratedBytes },
          observed: { artifacts: 5, bytes: totalGeneratedBytes },
          uniqueFileReads: 7,
        },
        artifacts: [mesh, shared, occurrences, boolean, recipe],
        fixtures: fixtures.map((fixture) => ({
          ...fixture,
          disposition:
            fixture.format === 'request-construction-json'
              ? 'recipe-pending-mapping-not-ingestible'
              : 'artifact-awaiting-engine-correctness-and-delivery-routes',
          ...(fixture.format === 'request-construction-json' ? { recipe: pending } : {}),
        })),
        qualification: 'input-integrity-only',
        engineCorrectness: 'pending',
        deliveryRoutes: 'pending',
        performanceQualification: 'pending',
        analyticFactsStatus: 'supplied-independent-metadata-not-engine-observations',
      });
      assert.equal(reader.mock.callCount(), 7);
      const paths = reader.mock.calls.map(({ arguments: args }) => args[0]);
      assert.equal(new Set(paths).size, 7);
      assert.equal(paths.filter((path) => path === shared.path).length, 1);
      assert.notEqual(receipt.fixtures[0]?.analyticFacts, fixtures[0]?.analyticFacts);
    } finally {
      reader.mock.restore();
      syncBuiltinESMExports();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
