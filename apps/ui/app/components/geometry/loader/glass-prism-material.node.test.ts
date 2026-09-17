// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CustomBlending, DataTexture, NormalBlending } from 'three';
import {
  createGlassPrismBodyMaterials,
  createGlassPrismNodeMaterial,
  createLightRibbonMaterials,
  glassPrismRenderOrder,
} from '#components/geometry/loader/glass-prism-material.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

/** A one-texel stand-in for the prefiltered studio; the graph only needs a texture to sample. */
const studio = (): DataTexture => new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);

describe('createGlassPrismNodeMaterial', () => {
  it('matches stable stripped glass node material snapshot', async () => {
    const { material } = createGlassPrismNodeMaterial({ environment: studio(), baseOpacity: 0.2, filmStrength: 0.4 });

    const serialised = serialiseStrippedTslGraph(material.toJSON());

    await expect(serialised).toMatchFileSnapshot(
      join(currentDirectory, '__shader-snapshots__', 'glass-prism-node-material.json'),
    );
  });

  it('should declare a premultiplied transparent body drawn far wall first', () => {
    const { front, back } = createGlassPrismBodyMaterials({ environment: studio() });

    for (const { material } of [front, back]) {
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.premultipliedAlpha).toBe(true);
      expect(material.positionNode).toBeDefined();
      expect(material.colorNode).toBeDefined();
      expect(material.opacityNode).toBeDefined();
    }
    expect(front.material.side).not.toBe(back.material.side);
    expect(glassPrismRenderOrder.backFaces).toBeLessThan(glassPrismRenderOrder.frontFaces);
    expect(glassPrismRenderOrder.ribbons).toBeLessThan(glassPrismRenderOrder.backFaces);
  });

  it('should animate through uniform mutation without rebuilding the graph', () => {
    const { material, handles, setEnvironment, setTheme } = createGlassPrismNodeMaterial({ environment: studio() });
    const { positionNode, colorNode } = material;

    handles.uFromIndex.value = 1;
    handles.uToIndex.value = 3;
    handles.uProgress.value = 0.4;
    handles.uMolten.value = 1;
    handles.uRing.value = -0.2;
    handles.uTime.value = 12.5;
    handles.uSweepAxis.value.set(0, 0, 1);
    handles.uSeedOffset.value.set(3, 4, 5);
    setEnvironment(studio());
    setTheme('light');

    expect(material.positionNode).toBe(positionNode);
    expect(material.colorNode).toBe(colorNode);
    expect(handles.uToIndex.value).toBe(3);
    expect(handles.uSweepAxis.value.z).toBe(1);
  });
});

describe('createLightRibbonMaterials', () => {
  it('should add light on a dark page and print ink on a light one', () => {
    const { light, ink, handles } = createLightRibbonMaterials();

    expect(light.blending).toBe(CustomBlending);
    expect(light.premultipliedAlpha).toBe(false);
    expect(light.depthTest).toBe(false);
    expect(ink.blending).toBe(NormalBlending);
    expect(ink.premultipliedAlpha).toBe(true);
    expect(handles.uGain.value).toBe(1);
  });
});
