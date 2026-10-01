// @vitest-environment node
import { expect, it } from 'vitest';
import { BufferGeometry, Mesh, MeshMatcapMaterial, Texture } from 'three';
import NodeMaterialObserver from 'three/src/materials/nodes/manager/NodeMaterialObserver.js';
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import type NodeFrame from 'three/src/nodes/core/NodeFrame.js';
import type RenderObject from 'three/src/renderers/common/RenderObject.js';

it('refreshes every material sharing a shader when a texture loads after its first draw', () => {
  const texture = new Texture();
  const materials = [new MeshMatcapMaterial({ matcap: texture }), new MeshMatcapMaterial({ matcap: texture })];
  const geometry = new BufferGeometry();
  const objects = materials.map((material) => ({
    object: new Mesh(geometry, material),
    geometry,
    material,
    bundle: null,
    lightsNode: { getLights: () => [] },
  }));
  // Only the observer's CPU inputs are required; no renderer/device is constructed by this regression.
  const observer = new NodeMaterialObserver({
    object: objects[0]!.object,
    material: materials[0],
    context: {},
  } as NodeBuilder);
  const frame = { renderId: 1, renderer: { getMRT: () => null } } as unknown as NodeFrame;
  for (const object of objects) {
    expect(observer.needsRefresh(object as unknown as RenderObject, frame)).toBe(true);
  }
  texture.needsUpdate = true;
  frame.renderId = 2;
  for (const object of objects) {
    expect(observer.needsRefresh(object as unknown as RenderObject, frame)).toBe(true);
  }
});
