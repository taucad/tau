import { describe, expect, it, vi } from 'vitest';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('#bambu.host.js', () => {
  loaded.count += 1;
  return {
    async *discoverBambuMachines() {
      yield* [];
    },
  };
});

// Importing the provider module is not the behavior under test; keep it outside the per-test budget.
const { bambuA1MiniMachine, bambuMachine } = await import('#bambu.machine.js');
const { bambuSubmissionConfiguration } = await import('#bambu.manifest.js');

describe('bambuMachine', () => {
  it('declares diameters as positive millimetre quantities rather than editable metadata objects', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', bambuMachine());
    const { properties } = definition.submissionConfiguration.manifest.legacyProjection.inputSchema;
    for (const key of ['expectedFilamentDiameter', 'expectedNozzleDiameter']) {
      expect(properties).toMatchObject({
        [key]: {
          type: 'number',
          exclusiveMinimum: 0,
          'x-tau-unit': 'mm',
          'x-tau-quantity-kind': 'http://qudt.org/vocab/quantitykind/Diameter',
          'x-tau-space': 'linear',
        },
      });
    }
  });
  it('should map filaments to AMS trays 0–15 or the external spool 254, and nothing between', () => {
    const { amsMapping, expectedMaterials } = bambuSubmissionConfiguration.schema.shape;
    expect(amsMapping.safeParse([254]).success).toBe(true);
    expect(amsMapping.safeParse([15, -1]).success).toBe(true);
    expect(amsMapping.safeParse([16]).success).toBe(false);
    expect(amsMapping.safeParse([255]).success).toBe(false);
    expect(expectedMaterials.safeParse([{ slot: 254, materialId: 'PETG' }]).success).toBe(true);
    expect(expectedMaterials.safeParse([{ slot: -1, materialId: 'PETG' }]).success).toBe(false);
  });
  it('declares Mini geometry and its four-tray setup without inheriting X1C hardware', async () => {
    const definition = await resolveRuntimePluginDefinition('machine', bambuA1MiniMachine());
    expect(definition.manifest).toMatchObject({
      identity: { model: 'a1-mini' },
      processes: [
        {
          type: 'fff',
          geometry: {
            buildVolume: { x: 180, y: 180, z: 180 },
            kinematics: 'cartesian-bedslinger',
            bedMotion: 'y',
            enclosure: { enclosed: false },
          },
          bed: { maximumTemperature: { value: 80 } },
        },
      ],
    });
    expect(definition.manifest.components.find(({ kind }) => kind === 'material-system')).toMatchObject({
      units: [{ id: 'ams-a', slots: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }] }, { id: 'external' }],
    });
    const schema = definition.submissionConfiguration.manifest.legacyProjection.inputSchema;
    expect(schema).toMatchObject({ properties: { expectedModel: { const: 'A1 mini' }, amsMapping: { maxItems: 4 } } });
  });
  it('should keep host dependencies lazy until an explicit operation', async () => {
    expect(loaded.count).toBe(0);
    const registration = bambuMachine();
    expect(() => structuredClone(registration)).not.toThrow();
    // The manifest names the services a binding pins (ids only); nothing else about the transport or a secret.
    const { services, ...connection } = registration.manifest.connection;
    expect(services?.map(({ id }) => id)).toEqual(['mqtt', 'camera']);
    expect(JSON.stringify({ ...registration, manifest: { ...registration.manifest, connection } })).not.toMatch(
      /mqtt|ftp|secret|certificate/iu,
    );
    const definition = await resolveRuntimePluginDefinition('machine', registration);
    const iterator = definition
      .discover(
        {
          configuration: { logicalId: 'workshop-x1c' },
          signal: new AbortController().signal,
        },
        {
          clock: { now: () => '2026-09-14T00:00:00.000Z' },
          async *listenDatagrams() {
            yield* [];
          },
        },
      )
      [Symbol.asyncIterator]();
    await iterator.next();
    expect(loaded.count).toBe(1);
  });
});
