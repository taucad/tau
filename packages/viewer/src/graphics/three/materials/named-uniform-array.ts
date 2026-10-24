import { REVISION, WebGLCoordinateSystem } from 'three';
import type { Vector4 } from 'three';
import type { Node, NodeBuilder } from 'three/webgpu';
import { uniformArray } from 'three/tsl';

/**
 * Stable shader identifiers, with independent per-owner uniform storage.
 * r184's GLSL builder ignores explicit buffer names and embeds allocation IDs.
 * Adapt only this named array during synchronous generation; never share GPU data.
 * Remove the GLSL adaptation when upstream honors BufferNode.setName.
 *
 * @internal
 * @param values - Live vec4 values owned by the calling viewer.
 * @param name - Unique semantic identifier within the material graph.
 * @returns An independently owned array with stable shader identifiers.
 */
export function namedUniformArray(values: Vector4[], name: string): ReturnType<typeof uniformArray<'vec4'>> {
  const array = uniformArray<'vec4'>(values, 'vec4').setName(name);
  // @types/three intersects Node's optional result with UniformNode's string result.
  const generate = array.generate.bind(array) as (
    builder: NodeBuilder,
    output: Parameters<typeof array.generate>[1],
  ) => string;
  array.generate = (builder, output = null): string => {
    if (builder.renderer.coordinateSystem !== WebGLCoordinateSystem) {
      return generate(builder, output);
    }
    if (REVISION !== '184') {
      throw new Error('Requalify named uniform buffers for this Three revision');
    }
    const original = builder.getUniformFromNode;
    builder.getUniformFromNode = (...args) => {
      const result = original.apply(builder, args);
      const [node, type] = args;
      if (type === 'buffer' && node.uuid === array.uuid) {
        // The installed GLSL builder uses the node name for the block declaration
        // and a shared NodeUniformBuffer name for its binding. Keep both aligned.
        const getData = builder.getDataFromNode as (
          node: Node,
          stage?: (typeof args)[2],
          cache?: NodeBuilder['globalCache'],
        ) => ReturnType<NodeBuilder['getDataFromNode']> & { uniformGPU: { name: string } };
        array.name = name;
        result.name = `${name}Values`;
        getData.call(builder, node, args[2], builder.globalCache).uniformGPU.name = name;
      }
      return result;
    };
    try {
      return generate(builder, output);
    } finally {
      builder.getUniformFromNode = original;
    }
  };
  return array;
}
