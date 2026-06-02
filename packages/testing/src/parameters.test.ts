import { Accessor, Document, WebIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { analyze, parameterCases, parameterGroups, render } from '#parameters.js';

const createTriangleGlb = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor()
    .setType(Accessor.Type['VEC3']!)
    .setBuffer(buffer)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const indices = document
    .createAccessor()
    .setType(Accessor.Type['SCALAR']!)
    .setBuffer(buffer)
    .setArray(new Uint32Array([0, 1, 2]));
  const primitive = document.createPrimitive().setMode(4).setAttribute('POSITION', positions).setIndices(indices);
  const mesh = document.createMesh('triangle').addPrimitive(primitive);
  document.createScene().addChild(document.createNode('triangle').setMesh(mesh));
  return new WebIO().writeBinary(document);
};

describe('parameterCases', () => {
  it('should deep-merge defaults into named cases while replacing arrays', () => {
    expect(
      parameterCases(
        { width: 10, nested: { height: 20, tags: ['default'] } },
        { wide: { width: 40, nested: { tags: ['wide'] } } },
      ),
    ).toEqual([
      {
        name: 'wide',
        parameters: { width: 40, nested: { height: 20, tags: ['wide'] } },
      },
    ]);
  });
});

describe('parameterGroups', () => {
  it('should read Tau parameter groups in stored order', async () => {
    const groups = await parameterGroups({
      file: '/project/.tau/parameters/main.ts.json',
      readFile: () =>
        JSON.stringify({
          activeGroup: 'large',
          order: ['large', 'small'],
          groups: {
            small: { values: { width: 10 } },
            large: { values: { width: 50 } },
          },
        }),
      defaults: { height: 20 },
    });

    expect(groups).toEqual([
      { name: 'large', parameters: { height: 20, width: 50 } },
      { name: 'small', parameters: { height: 20, width: 10 } },
    ]);
  });

  it('should prioritize the active group when no explicit order is stored', async () => {
    const groups = await parameterGroups({
      file: {
        activeGroup: 'large',
        groups: {
          small: { values: { width: 10 } },
          large: { values: { width: 50 } },
        },
      },
    });

    expect(groups.map((group) => group.name)).toEqual(['large', 'small']);
  });
});

describe('render/analyze parameter helpers', () => {
  it('should pass parameters to the renderer and preserve them in GeoSpec provenance', async () => {
    const bytes = await createTriangleGlb();
    const calls: Array<{ file: string; parameters: Record<string, unknown> }> = [];
    const renderer = async (input: {
      file: string;
      parameters: Record<string, unknown>;
    }): Promise<Uint8Array<ArrayBuffer>> => {
      calls.push(input);
      return bytes;
    };

    const rendered = await render({ file: 'main.ts', parameters: { width: 12 }, renderer });
    expect(rendered).toBe(bytes);

    const result = await analyze({ file: 'main.ts', parameters: { width: 12 }, renderer });

    expect(calls).toEqual([
      { file: 'main.ts', parameters: { width: 12 } },
      { file: 'main.ts', parameters: { width: 12 } },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.subject.provenance.parameters).toEqual({ width: 12 });
      expect(result.stats.triangleCount).toBe(1);
    }
  });
});
