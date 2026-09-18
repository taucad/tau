// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyMetalMorphMaterialTuning,
  createMetalMorphNodeMaterial,
  metalMorphDirectionAttributeName,
  metalMorphMaterialTuningKeys,
  metalMorphShapeAttributeName,
  readMetalMorphMaterialTuning,
} from '#components/geometry/loader/metal-morph-material.node.js';
import { metalMorphShapeIds } from '#components/geometry/loader/metal-morph-shapes.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

describe('createMetalMorphNodeMaterial', () => {
  it('matches stable stripped physical node material snapshot', async () => {
    const { material } = createMetalMorphNodeMaterial({ roughnessRest: 0.12, iridescence: 0.5, overshoot: 1.1 });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'metal-morph-node-material.json'),
    );
  });

  it('should declare an opaque metallic body with iridescence driven by nodes', () => {
    const { material } = createMetalMorphNodeMaterial();

    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.metalness).toBe(1);
    expect(material.positionNode).toBeDefined();
    expect(material.normalNode).toBeDefined();
    expect(material.roughnessNode).toBeDefined();
    expect(material.iridescenceNode).toBeDefined();
  });

  it('should leave the thin-film model out of a spinner material', () => {
    const { material } = createMetalMorphNodeMaterial({
      iridescence: 0,
    });

    expect(material.iridescence).toBe(0);
    expect(material.iridescenceNode).toBeNull();
    expect(material.iridescenceThicknessNode).toBeNull();
    expect(material.positionNode).toBeDefined();
    expect(material.normalNode).toBeDefined();
  });

  it('should animate through uniform mutation without rebuilding the graph', () => {
    const { material, handles } = createMetalMorphNodeMaterial();
    const { positionNode } = material;

    handles.uFromIndex.value = 2;
    handles.uToIndex.value = 4;
    handles.uProgress.value = 0.4;
    handles.uMolten.value = 1;
    handles.uRing.value = -0.2;
    handles.uTime.value = 12.5;
    handles.uSweepAxis.value.set(0, 0, 1);
    handles.uSeedOffset.value.set(3, 4, 5);

    expect(material.positionNode).toBe(positionNode);
    expect(handles.uToIndex.value).toBe(4);
    expect(handles.uSweepAxis.value.z).toBe(1);
  });

  it('should tune every surface and flow parameter through its uniform without rebuilding the graph', () => {
    const { material, handles } = createMetalMorphNodeMaterial({ roughnessRest: 0.12, swell: 0.05 });
    const { positionNode, roughnessNode } = material;

    expect(readMetalMorphMaterialTuning(handles.tuning)).toMatchObject({ roughnessRest: 0.12, swell: 0.05 });
    for (const key of metalMorphMaterialTuningKeys) {
      expect(handles.tuning[key].value, key).toBeTypeOf('number');
    }

    applyMetalMorphMaterialTuning(handles.tuning, { roughnessRest: 0.3, frontBand: 0.4, filmThicknessThick: 600 });

    expect(handles.tuning.roughnessRest.value).toBe(0.3);
    expect(handles.tuning.frontBand.value).toBe(0.4);
    expect(handles.tuning.filmThicknessThick.value).toBe(600);
    expect(handles.tuning.swell.value).toBe(0.05);
    expect(material.positionNode).toBe(positionNode);
    expect(material.roughnessNode).toBe(roughnessNode);
  });

  it('should name one packed attribute per sequenced shape', () => {
    expect(metalMorphShapeIds.map((_id, index) => metalMorphShapeAttributeName(index))).toEqual([
      'shapeSample0',
      'shapeSample1',
      'shapeSample2',
      'shapeSample3',
      'shapeSample4',
    ]);
    expect(metalMorphShapeIds.map((_id, index) => metalMorphDirectionAttributeName(index))).toEqual([
      'shapeDirection0',
      'shapeDirection1',
      'shapeDirection2',
      'shapeDirection3',
      'shapeDirection4',
    ]);
  });
});
