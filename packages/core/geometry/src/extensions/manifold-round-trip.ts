import type { WriterContext } from '@gltf-transform/core';
import { EXTManifold } from 'manifold-3d/manifold-gltf';
import type { ManifoldPrimitive } from 'manifold-3d/manifold-gltf';

/**
 * `EXT_mesh_manifold` that survives a glTF-Transform read and write.
 *
 * manifold-3d keeps the manifold index stream as the render indices and writes
 * the merge as a sparse overlay, pointing every render primitive's indices at
 * that base. glTF-Transform applies the overlay when it reads the accessor, so
 * writing a read document again hands the render primitives the merged stream:
 * each triangle keeps its positions but takes the normals and colours of
 * whichever split vertex shares them. After a read the render primitives hold
 * the base in run order, so it is restored from them before writing. A
 * document manifold-3d has just built carries placeholder render indices that
 * do not partition the stream, and is written as built.
 *
 * @internal
 */
export class ManifoldRoundTripExtension extends EXTManifold {
  public override prewrite(context: WriterContext): this {
    for (const mesh of this.document.getRoot().listMeshes()) {
      const manifoldIndices = mesh.getExtension<ManifoldPrimitive>(EXTManifold.EXTENSION_NAME)?.getIndices();
      const runs = mesh.listPrimitives().flatMap((primitive) => primitive.getIndices()?.getArray() ?? []);
      const count = runs.reduce((total, run) => total + run.length, 0);
      if (!manifoldIndices || count !== manifoldIndices.getCount()) {
        continue;
      }
      const base = new Uint32Array(count);
      let offset = 0;
      for (const run of runs) {
        base.set(run, offset);
        offset += run.length;
      }
      manifoldIndices.setArray(base).setSparse(false);
    }
    return super.prewrite(context);
  }
}
