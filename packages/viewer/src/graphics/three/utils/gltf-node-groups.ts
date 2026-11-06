import { Group } from 'three';
import type { Object3D } from 'three';

/** The glTF indices GLTFLoader records for a loaded object (`parser.associations`). */
export type GltfNodeAssociation = {
  readonly nodes?: number;
  readonly meshes?: number;
  readonly primitives?: number;
};

/**
 * Give every glTF node that is loaded as one primitive's renderable and has child nodes a group of its own.
 *
 * GLTFLoader loads a node whose mesh has one primitive as that primitive's `Mesh` or `LineSegments`, and hangs the
 * node's child nodes beneath it; a node whose mesh has several primitives already loads as a group holding them. The
 * viewer hides a renderable by its own `visible` flag (edges or surfaces off, its component hidden or isolated away),
 * and Three hides every descendant with it, so the child nodes would vanish with their parent's primitive. OpenRSCAD
 * writes exactly that shape: a module node carries its feature-edge LINES and its solids are child nodes.
 *
 * The group takes the node's name, extras, local transform and node and mesh association, in the node's place among
 * its siblings; the renderable keeps its primitive association at identity under the group, followed by the child nodes,
 * as GLTFLoader lays out a node with several primitives.
 *
 * @param scene - The loaded scene (`gltf.scene`).
 * @param associations - The loader's `parser.associations`, updated in place.
 */
export function separateGltfNodeChildren(
  scene: Object3D,
  associations: Map<Object3D, GltfNodeAssociation | undefined>,
): void {
  const nodes: Object3D[] = [];
  scene.traverse((object) => {
    const association = associations.get(object);
    if (
      object !== scene &&
      object.children.length > 0 &&
      association?.nodes !== undefined &&
      association.meshes !== undefined &&
      association.primitives !== undefined
    ) {
      nodes.push(object);
    }
  });

  for (const renderable of nodes) {
    // Read now: an enclosing node split earlier moved this one under its new group.
    const { parent } = renderable;
    if (!parent) {
      continue;
    }
    const { nodes: nodeIndex, ...primitive } = associations.get(renderable)!;
    const group = new Group();
    group.name = renderable.name;
    group.userData = { ...renderable.userData };
    group.position.copy(renderable.position);
    group.quaternion.copy(renderable.quaternion);
    group.scale.copy(renderable.scale);
    group.visible = renderable.visible;
    renderable.position.set(0, 0, 0);
    renderable.quaternion.identity();
    renderable.scale.set(1, 1, 1);
    renderable.updateMatrix();
    group.updateMatrix();

    // Keep the node's place among its siblings: annotation and section topology walk children in order.
    parent.children.splice(parent.children.indexOf(renderable), 1, group);
    group.parent = parent;
    renderable.parent = null;
    group.add(renderable, ...renderable.children);

    associations.set(group, { meshes: primitive.meshes, nodes: nodeIndex });
    associations.set(renderable, primitive);
  }
}
