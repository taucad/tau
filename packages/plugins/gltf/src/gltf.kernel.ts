import { Primitive } from '@gltf-transform/core';
import type { Accessor, Document } from '@gltf-transform/core';
import { unpartition } from '@gltf-transform/functions';
import {
  coordinateSystemSchema,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';
import { createFileResolverIo } from '#file-resolver-io.utils.js';

import { dracoExtensionName, loadDracoDecoder, usesDracoCompression } from '#draco-backend.js';

/**
 * Drops a replaced accessor once nothing but the root holds it.
 *
 * @param accessor - The accessor a primitive no longer references.
 */
const disposeIfUnused = (accessor: Accessor): void => {
  if (accessor.listParents().length === 1) {
    accessor.dispose();
  }
};

/**
 * Gives every `TRIANGLES` primitive without `NORMAL` the flat normals glTF implies for it.
 *
 * The headless renderer needs authored normals. `normals()` from glTF-Transform would unweld the
 * whole document; this de-indexes only the primitives that lack them, so authored indexing survives.
 *
 * @param document - The imported document, changed in place.
 */
const addFlatNormals = (document: Document): void => {
  for (const mesh of document.getRoot().listMeshes()) {
    // ponytail: EXT_mesh_manifold shares POSITION with its welded topology, so these stay as authored.
    if (mesh.getExtension('EXT_mesh_manifold') !== null) {
      continue;
    }
    for (const primitive of mesh.listPrimitives()) {
      // ponytail: morph targets would need per-target flat normals; none of the importers' inputs have met that yet.
      if (
        primitive.getMode() !== Primitive.Mode['TRIANGLES'] ||
        primitive.getAttribute('NORMAL') !== null ||
        primitive.listTargets().length > 0
      ) {
        continue;
      }
      const position = primitive.getAttribute('POSITION');
      if (position === null) {
        continue;
      }
      const indices = primitive.getIndices();
      const order = indices?.getArray() ?? Array.from({ length: position.getCount() }, (_, index) => index);
      // A primitive without NORMAL has its TANGENT ignored by glTF.
      primitive.setAttribute('TANGENT', null);
      for (const semantic of primitive.listSemantics()) {
        const source = primitive.getAttribute(semantic)!;
        const size = source.getElementSize();
        const array = source.getArray()!;
        const unwelded = new (array.constructor as new (length: number) => typeof array)(order.length * size);
        for (const [vertex, index] of [...order].entries()) {
          unwelded.set(array.subarray(index * size, index * size + size), vertex * size);
        }
        primitive.setAttribute(semantic, source.clone().setArray(unwelded));
        disposeIfUnused(source);
      }
      primitive.setIndices(null);
      if (indices !== null) {
        disposeIfUnused(indices);
      }
      const unweldedPosition = primitive.getAttribute('POSITION')!;
      const positions = unweldedPosition.getArray()!;
      const normals = new Float32Array(positions.length);
      for (let offset = 0; offset + 9 <= positions.length; offset += 9) {
        const ux = positions[offset + 3]! - positions[offset]!;
        const uy = positions[offset + 4]! - positions[offset + 1]!;
        const uz = positions[offset + 5]! - positions[offset + 2]!;
        const vx = positions[offset + 6]! - positions[offset]!;
        const vy = positions[offset + 7]! - positions[offset + 1]!;
        const vz = positions[offset + 8]! - positions[offset + 2]!;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);
        // A collapsed triangle has no direction; +Z keeps the stream finite.
        const normal = length > 0 ? [nx / length, ny / length, nz / length] : [0, 0, 1];
        normals.set(normal, offset);
        normals.set(normal, offset + 3);
        normals.set(normal, offset + 6);
      }
      primitive.setAttribute(
        'NORMAL',
        document.createAccessor().setType('VEC3').setArray(normals).setBuffer(unweldedPosition.getBuffer()),
      );
    }
  }
};

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .strict();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** GlTF and GLB import kernel. @public */
export const gltfKernel = defineKernel({
  id: 'gltf',
  extensions: ['glb', 'gltf'],
  name: 'GltfKernel',
  version: '0.1.0',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {
    glb: { title: 'glTF binary', mimeType: 'model/gltf-binary', extension: 'glb', optionsSchema: glbOptionsSchema },
  },

  async initialize() {
    return {};
  },

  async resolve({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    return {
      resolved: [...inventory.resolved],
      unresolved: [...inventory.unresolved],
    };
  },

  async describe() {
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        {
          id: 'urn:taucad:gltf:parameters',
          name: 'GltfParameters',
        },
      ),
    });
  },

  async evaluate({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const isJson = entryPath.toLowerCase().endsWith('.gltf');
    const io = createFileResolverIo(inventory.resolver);
    const jsonDocument = isJson
      ? await io.readAsJSON(basename(entryPath))
      : await io.binaryToJSON(inventory.entryBytes);
    if (usesDracoCompression(jsonDocument.json)) {
      io.registerDependencies({ 'draco3d.decoder': await loadDracoDecoder() });
    }
    const document = await io.readJSON(jsonDocument);
    document.disposeExtension(dracoExtensionName);
    await document.transform(unpartition());
    addFlatNormals(document);
    const glb = await io.writeBinary(document);
    const normalized = await normalizeGltfGeometryNames(glb, {
      format: 'glb',
      io,
      rewriteLegacyGeneratedShapeNames: false,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'imported',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'imported',
    });
    return { handle: normalized };
  },

  async render({ handle }) {
    return { content: handle };
  },

  async export(input) {
    if (input.handle.length === 0) {
      throw new Error('No geometry available for export.');
    }
    const bytes = await transformGltfExportBytes(input.handle, {
      format: 'glb',
      coordinateSystem: input.options.coordinateSystem,
      unit: input.options.unit,
    });
    return { files: [createExportFile('glb', 'model.glb', bytes)] };
  },

  serializeHandle: ({ handle }) => new Uint8Array(handle),
  deserializeHandle: ({ serialized }) => new Uint8Array(serialized),
});
