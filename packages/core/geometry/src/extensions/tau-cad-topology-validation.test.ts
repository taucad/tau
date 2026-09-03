import { describe, expect, it } from 'vitest';
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
});
