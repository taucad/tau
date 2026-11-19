// @vitest-environment node
/* oxlint-disable new-cap -- OCJS embind exposes C++ PascalCase members. */
/* eslint-disable @typescript-eslint/naming-convention -- The fakes mirror OCJS embind's C++ PascalCase members. */

/**
 * Replicad — STEP visual-material factors.
 *
 * The shipped OCCT builds leave `XCAFDoc_VisMaterial` unbound, so `exportSTEP`
 * writes PBR factors only when a custom build provides those bindings. The
 * fakes below stand in for them over a real instance and record what
 * `exportSTEP` hands OCCT, which must match the glTF export of the same shapes.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { OpenCascadeInstance, Quantity_ColorRGBA, TDF_Label } from 'replicad-opencascadejs';
import { esbuildBundler } from '@taucad/esbuild';
import { assertRenderingSuccess, createTestGeometry } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { exportSTEP } from '#export/interface-export.js';
import { replicadKernel } from '#replicad.kernel.js';
import type { GeometryReplicad } from '#replicad.types.js';
import { normalizeRenderShapes, render } from '#utils/render-output.js';
import { convertReplicadGeometriesToGltf } from '#utils/replicad-to-gltf.js';

type RecordedPbr = { BaseColor?: number[]; Metallic?: number; Roughness?: number };
type Factors = { baseColor?: number[]; metallic?: number; roughness?: number };

/** Layers the visual-material bindings of a custom OCCT build over `oc`, recording each material by name. */
const withRecordedVisualMaterials = (oc: OpenCascadeInstance) => {
  const materials = new Map<string, RecordedPbr>();
  /** Like an embind object, each binding below is deleted by its owner; the export owns all of them. */
  const lifecycle = { created: 0, deleted: 0 };
  class Bound {
    public constructor() {
      lifecycle.created += 1;
    }
    public delete(): void {
      lifecycle.deleted += 1;
    }
  }
  class VisMaterialPbr extends Bound {
    public BaseColor?: Quantity_ColorRGBA;
    public Metallic?: number;
    public Roughness?: number;
  }
  class VisMaterial extends Bound {
    public pbr: RecordedPbr = {};
    // Like `XCAFDoc_VisMaterial::SetPbrMaterial`, it copies the factors: the export deletes its colour afterwards.
    public SetPbrMaterial(pbr: VisMaterialPbr): void {
      const rgb = pbr.BaseColor?.GetRGB();
      this.pbr = {
        BaseColor: pbr.BaseColor && rgb && [rgb.Red(), rgb.Green(), rgb.Blue(), pbr.BaseColor.Alpha()],
        Metallic: pbr.Metallic,
        Roughness: pbr.Roughness,
      };
      rgb?.delete();
    }
  }
  class AsciiString extends Bound {
    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly value: string;
    public constructor(value: string) {
      super();
      this.value = value;
    }
  }
  const visMaterialTool = {
    AddMaterial(material: VisMaterial, name: AsciiString): TDF_Label {
      materials.set(name.value, material.pbr);
      return new oc.TDF_Label();
    },
    SetShapeMaterial(): void {
      // The recorded factors are the evidence; the writer never sees these materials.
    },
  };
  const bindings: Record<string, unknown> = {
    XCAFDoc_VisMaterial: VisMaterial,
    XCAFDoc_VisMaterialPBR: VisMaterialPbr,
    TCollection_AsciiString: AsciiString,
    XCAFDoc_DocumentTool: new Proxy(oc.XCAFDoc_DocumentTool, {
      get: (target, key): unknown =>
        key === 'VisMaterialTool' ? () => Object.assign(new Bound(), visMaterialTool) : Reflect.get(target, key),
    }),
  };
  return {
    oc: new Proxy(oc, {
      get: (target, key): unknown =>
        typeof key === 'string' && key in bindings ? bindings[key] : Reflect.get(target, key),
    }),
    materials,
    lifecycle,
  };
};

const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

describe('exportSTEP visual materials', () => {
  // The `replicad` library binds its OpenCASCADE instance process-globally through `setOC`, so one render
  // installs the kernel's instance for the shapes built below.
  beforeAll(async () => {
    assertRenderingSuccess(
      await createTestGeometry({
        runtime,
        files: {
          'bootstrap.ts': `import { makeBox } from 'replicad'; export default () => makeBox([0, 0, 0], [1, 1, 1]);`,
        },
        open: { source: { path: 'bootstrap.ts' } },
      }),
    );
  }, 60_000);

  it('should hand OCCT the base colour and metallic-roughness factors the glTF export writes', async () => {
    const { getOC, makeBox } = await import('replicad');
    const shapes = normalizeRenderShapes([
      { shape: makeBox([0, 0, 0], [10, 10, 10]), name: 'legacy', color: '#3366cc' },
      {
        shape: makeBox([20, 0, 0], [30, 10, 10]),
        name: 'legacyFactors',
        color: '#cc6633',
        opacity: 0.5,
        metalness: 0.6,
        roughness: 1,
      },
      { shape: makeBox([40, 0, 0], [50, 10, 10]), name: 'authored', material: {} },
      {
        shape: makeBox([60, 0, 0], [70, 10, 10]),
        name: 'authoredFactors',
        material: {
          pbrMetallicRoughness: { baseColorFactor: [0.05, 0.6, 0.25, 1], metallicFactor: 0.4, roughnessFactor: 0.25 },
        },
      },
      { shape: makeBox([80, 0, 0], [90, 10, 10]), name: 'plain' },
    ]);
    const { oc, materials, lifecycle } = withRecordedVisualMaterials(getOC());

    exportSTEP(oc, shapes);
    expect(lifecycle.created).toBeGreaterThan(0);
    expect(lifecycle.deleted).toBe(lifecycle.created);

    const geometries = render(shapes).filter(
      (geometry): geometry is GeometryReplicad => geometry.format === 'replicad',
    );
    const { json } = await new NodeIO().binaryToJSON(convertReplicadGeometriesToGltf({ geometries }));
    // OCCT stores colour channels as float32.
    const round = (channel: number): number => Number(channel.toFixed(6));
    // Reads each node's material as a glTF viewer does, with the specification default for an omitted factor.
    const gltfFactors: Record<string, Factors> = Object.fromEntries(
      (json.nodes ?? []).map((node) => {
        const materialIndex = json.meshes?.[node.mesh!]?.primitives[0]?.material;
        const factors = json.materials?.[materialIndex!]?.pbrMetallicRoughness;
        return [
          node.name ?? '',
          {
            baseColor: (factors?.baseColorFactor ?? [1, 1, 1, 1]).map((channel) => round(channel)),
            metallic: factors?.metallicFactor ?? 1,
            roughness: factors?.roughnessFactor ?? 1,
          },
        ];
      }),
    );
    const stepFactors: Record<string, Factors> = Object.fromEntries(
      [...materials].map(([name, pbr]) => [
        name,
        {
          baseColor: pbr.BaseColor?.map((channel) => round(channel)),
          metallic: pbr.Metallic,
          roughness: pbr.Roughness,
        },
      ]),
    );

    // A shape without an authored colour gets no visual material: OCCT would write its base colour as the STEP colour.
    const { plain, ...coloured } = gltfFactors;
    expect(plain).toBeDefined();
    expect(stepFactors).toEqual(coloured);
  });
});
