// @vitest-environment node
import { expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { BufferGeometry, Mesh, MeshMatcapMaterial, Texture } from 'three';
import NodeMaterialObserver from 'three/src/materials/nodes/manager/NodeMaterialObserver.js';
import type NodeBuilder from 'three/src/nodes/core/NodeBuilder.js';
import NodeFrame from 'three/src/nodes/core/NodeFrame.js';
import type RenderObject from 'three/src/renderers/common/RenderObject.js';

it('refreshes every material sharing a shader when a texture loads after its first draw', () => {
  const texture = new Texture();
  const materials = [new MeshMatcapMaterial({ matcap: texture }), new MeshMatcapMaterial({ matcap: texture })];
  const geometry = new BufferGeometry();
  const lightsNode = mock<RenderObject['lightsNode']>();
  lightsNode.getLights.mockReturnValue([]);
  const objects = materials.map((material) =>
    Object.assign(mock<RenderObject>(), {
      object: new Mesh(geometry, material),
      geometry,
      material,
      bundle: null,
      lightsNode,
    } satisfies Partial<RenderObject>),
  );
  // Only CPU inputs are required. Upstream types omit the observer's current builder.context field.
  const observer = new NodeMaterialObserver(
    Object.assign(mock<NodeBuilder>(), {
      object: objects[0]!.object,
      material: materials[0]!,
      context: {},
    } satisfies Partial<NodeBuilder> & { context: Record<string, unknown> }),
  );
  const renderer = mock<NonNullable<NodeFrame['renderer']>>();
  const mrt = mock<ReturnType<typeof renderer.getMRT>>();
  mrt.has.mockReturnValue(false);
  renderer.getMRT.mockReturnValue(mrt);
  const frame = new NodeFrame();
  frame.renderId = 1;
  frame.renderer = renderer;
  for (const object of objects) {
    expect(observer.needsRefresh(object, frame)).toBe(true);
  }
  texture.needsUpdate = true;
  frame.renderId = 2;
  for (const object of objects) {
    expect(observer.needsRefresh(object, frame)).toBe(true);
  }
});
