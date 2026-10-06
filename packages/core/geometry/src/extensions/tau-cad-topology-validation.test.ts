/* eslint-disable @typescript-eslint/naming-convention -- Physical wire units use the published valueGPerCm3 spelling. */
import { describe, expect, it } from 'vitest';
import type { Mechanism } from '@taucad/kinematics';
import { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';
import type { TauCadTopologyPayload } from '#extensions/tau-cad-topology.types.js';

const payload: TauCadTopologyPayload = {
  schemaVersion: 1,
  components: [
    {
      id: 'component:body-0',
      name: 'Body',
      kind: 'body',
      selector: 'node/0',
      childIds: ['component:face-0'],
      primitiveRefs: [
        { nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 },
        { nodeIndex: 0, meshIndex: 0, primitiveIndex: 1 },
      ],
      faceGroups: [{ start: 0, count: 3, faceId: 0 }],
      edgeGroups: [{ start: 0, count: 2, edgeId: 0 }],
    },
    {
      id: 'component:face-0',
      name: 'Face',
      kind: 'face',
      selector: 'node/0/surface',
      parentId: 'component:body-0',
    },
  ],
};

describe('validateTauCadTopology', () => {
  it('checks forward and backward hierarchy references with bounded component ID reads', () => {
    const count = 128;
    let idReads = 0;
    const components: TauCadTopologyPayload['components'] = Array.from({ length: count }, (_, index) => ({
      get id() {
        idReads += 1;
        return `component:chain-${index}`;
      },
      name: `Chain ${index}`,
      kind: 'body',
      selector: `chain/${index}`,
      ...(index > 0 ? { parentId: `component:chain-${index - 1}` } : {}),
      ...(index + 1 < count ? { childIds: [`component:chain-${index + 1}`] } : {}),
    }));
    expect(validateTauCadTopology({ schemaVersion: 1, components }, { nodes: [], meshes: [] })).toEqual([]);
    expect(idReads).toBeLessThan(count * 10);
  });

  it('accepts requested solid evidence and rejects fabricated or invalid physical facts', () => {
    const bounds = { nodes: [], meshes: [] };
    const component = { ...payload.components[1]!, parentId: undefined };
    const digest = `sha256:${'a'.repeat(64)}`;
    expect(
      validateTauCadTopology(
        {
          schemaVersion: 1,
          components: [
            {
              ...component,
              physical: {
                volume: {
                  state: 'measured',
                  valueMm3: 480,
                  geometryDigest: digest,
                  method: 'occt-solid-volume',
                  validity: 'closed-solid',
                },
                density: { valueGPerCm3: 2.7, provenance: 'authored-shape-config' },
              },
            },
          ],
        },
        bounds,
      ),
    ).toEqual([]);
    expect(
      validateTauCadTopology(
        {
          schemaVersion: 1,
          components: [
            {
              ...component,
              physical: {
                volume: {
                  state: 'measured',
                  valueMm3: Number.NaN,
                  geometryDigest: 'sha256:mesh',
                  method: 'occt-solid-volume',
                  validity: 'closed-solid',
                },
                density: { valueGPerCm3: -2, provenance: 'authored-shape-config' },
              },
            },
          ],
        },
        bounds,
      ),
    ).toEqual([
      'component:face-0 has invalid native solid volume evidence',
      'component:face-0 has invalid authored density evidence',
    ]);
    expect(
      validateTauCadTopology(
        {
          schemaVersion: 1,
          components: [
            {
              ...component,
              physical: {
                volume: {
                  state: 'measured',
                  valueMm3: 0,
                  geometryDigest: digest,
                  method: 'occt-solid-volume',
                  validity: 'closed-solid',
                },
              },
            },
          ],
        },
        bounds,
      ),
    ).toEqual(['component:face-0 has invalid native solid volume evidence']);
  });
  it('accepts only a provenance-preserving placed-volume product', () => {
    const bounds = { nodes: [], meshes: [] };
    const component = { ...payload.components[1]!, parentId: undefined };
    const volume = {
      state: 'derived',
      sourceValueMm3: 3840,
      addedAbsDeterminant: 3.375,
      valueMm3: 12_960,
      geometryDigest: `sha256:${'a'.repeat(64)}`,
      method: 'occurrence-determinant-v1',
      validity: 'placed-solid',
    } as const;
    expect(
      validateTauCadTopology({ schemaVersion: 1, components: [{ ...component, physical: { volume } }] }, bounds),
    ).toEqual([]);
    expect(
      validateTauCadTopology(
        { schemaVersion: 1, components: [{ ...component, physical: { volume: { ...volume, valueMm3: 3840 } } }] },
        bounds,
      ),
    ).toEqual(['component:face-0 has invalid placed-volume evidence']);
    expect(
      validateTauCadTopology(
        {
          schemaVersion: 1,
          components: [
            { ...component, physical: { volume: { state: 'unavailable', reason: 'degenerate-placement' } } },
          ],
        },
        bounds,
      ),
    ).toEqual([]);
  });
  it('accepts in-range hierarchy and primitive groups', () => {
    expect(
      validateTauCadTopology(payload, {
        nodes: [{ meshIndex: 0 }],
        meshes: [
          [
            { mode: 4, indexCount: 3 },
            { mode: 1, indexCount: 2 },
          ],
        ],
      }),
    ).toEqual([]);
  });

  it('checks Replicad edge groups in flat XYZ scalar units', () => {
    const source = {
      ...payload.components[0]!,
      childIds: [],
      sourceRefs: { edgeGroupUnit: 'xyz-scalars-v1' },
      edgeGroups: [{ start: 3, count: 6, edgeId: 0 }],
    };
    const input: TauCadTopologyPayload = { schemaVersion: 1, components: [source] };
    const bounds = {
      nodes: [{ meshIndex: 0 }],
      meshes: [
        [
          { mode: 4, indexCount: 3 },
          { mode: 1, indexCount: 3, positionScalarCount: 9 },
        ],
      ],
    };
    expect(validateTauCadTopology(input, bounds)).toEqual([]);
    expect(
      validateTauCadTopology(input, {
        ...bounds,
        meshes: [
          [
            { mode: 4, indexCount: 3 },
            { mode: 1, indexCount: 3, positionScalarCount: 6 },
          ],
        ],
      }),
    ).toEqual(['component:body-0 edge group exceeds its primitive position scalar count']);
  });

  it('reports duplicate, hierarchy, primitive, and group bounds failures', () => {
    const invalid: TauCadTopologyPayload = {
      schemaVersion: 1,
      components: [
        ...payload.components,
        {
          ...payload.components[0]!,
          parentId: 'missing-parent',
          childIds: ['missing-child'],
          primitiveRefs: [{ nodeIndex: 1, meshIndex: 0, primitiveIndex: 0 }],
          faceGroups: [{ start: 2, count: 3, faceId: 0 }],
          edgeGroups: [{ start: 0, count: 2, edgeId: 0 }],
        },
      ],
    };
    const issues = validateTauCadTopology(invalid, {
      nodes: [{ meshIndex: 1 }],
      meshes: [[{ mode: 4, indexCount: 3 }]],
    });

    expect(issues).toEqual([
      'component:body-0 references mesh 0 from node 0, which owns mesh 1',
      'component:body-0 references missing node 0, mesh 0, primitive 1',
      'component:body-0 has edge groups without a matching primitive',
      'component:body-0 is duplicated',
      'component:body-0 references missing node 1, mesh 0, primitive 0',
      'component:body-0 references missing parent missing-parent',
      'component:body-0 references missing child missing-child',
      'component:body-0 face group exceeds its primitive index count',
      'component:body-0 has edge groups without a matching primitive',
    ]);
  });

  it('reports a mechanism that admission rejects or whose links name undeclared components', () => {
    const bounds = {
      nodes: [{ meshIndex: 0 }],
      meshes: [
        [
          { mode: 4, indexCount: 3 },
          { mode: 1, indexCount: 2 },
        ],
      ],
    };
    const hinge = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'deg' },
      root: 'body',
      links: { body: { components: ['component:body-0'] }, face: { components: ['component:face-0'] } },
      joints: { hinge: { type: 'revolute', parent: 'body', child: 'face', origin: [0, 0, 0], axis: [0, 0, 1] } },
    };
    // The payload is untrusted wire data, so these cases deliberately break the Mechanism type.
    const withMechanism = (mechanism: unknown): TauCadTopologyPayload => ({
      ...payload,
      mechanism: mechanism as Mechanism,
    });

    expect(validateTauCadTopology(withMechanism(hinge), bounds)).toEqual([]);
    expect(
      validateTauCadTopology(
        withMechanism({ ...hinge, links: { ...hinge.links, face: { components: ['component:missing'] } } }),
        bounds,
      ),
    ).toEqual(['mechanism link face references missing component component:missing']);
    expect(validateTauCadTopology(withMechanism({ ...hinge, units: { length: 'cm', angle: 'deg' } }), bounds)).toEqual([
      expect.stringMatching(/^mechanism \/units\/length: /),
    ]);
  });
});
