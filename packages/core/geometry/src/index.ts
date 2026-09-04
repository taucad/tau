// GlTF extension contract
export { allExtensions } from '#gltf.extensions.js';
export {
  KittyCadBoundaryRepresentation,
  KittyCadBrepNode,
  KittyCadBrepRoot,
  registerTauGltfExtensions,
  TauCadTopology,
  TauCadTopologyRoot,
} from '#extensions/index.js';
export type {
  TauCadTopologyComponent,
  TauCadTopologyEdgeGroup,
  TauCadTopologyExport,
  TauCadTopologyFaceGroup,
  TauCadTopologyPayload,
  TauCadTopologyPrimitiveRef,
} from '#extensions/tau-cad-topology.types.js';
export { validateTauCadTopology } from '#extensions/tau-cad-topology-validation.js';
export type {
  TauCadTopologyDocumentBounds,
  TauCadTopologyPrimitiveBounds,
} from '#extensions/tau-cad-topology-validation.js';

// GlTF IO + document transforms
export { createNodeIo } from '#gltf.utils.js';
export { readGltfSceneBounds } from '#gltf-scene-bounds.js';
export type { ReadGltfSceneBoundsOptions } from '#gltf-scene-bounds.js';
export {
  createCoordinateTransform,
  createReverseCoordinateTransform,
  createScalingTransform,
} from '#gltf.transforms.js';

// Serialized-bytes pipeline
export { detectEdges } from '#utils/edge-detection.js';
export type { EdgeDetectionResult } from '#utils/edge-detection.js';
export { embedGltfResources } from '#utils/gltf-embed.js';
export { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
export { transformGltfExportBytes } from '#utils/gltf-export-transform.js';

// Import staging
export { createImportFileInventory } from '#import-file-inventory.js';
export type { ImportFileInventory } from '#import-file-inventory.js';
export { ImportLoader } from '#import-loader.js';
export type { ImportFile } from '#import-loader.js';
export type { FileResolver } from '#file-resolver.types.js';

// GLB writing
export {
  createEmptyGlb,
  createEmptyGltf,
  createEmptyGltfGeometry,
  writeGlb,
  writeGltfJson,
} from '#utils/glb-writer.js';
export type { GlbInput, GlbManifoldTopology, GlbMaterial, GlbNode, GlbPrimitive } from '#utils/glb-writer.js';

// Names
export {
  formatComponentId,
  formatNamedComponentId,
  formatNodeSelector,
  formatPrimitiveSelector,
} from '#utils/component-names.js';
export { formatShapeName, isLegacyGeneratedShapeName, resolveShapeName, uniqueShapeName } from '#utils/shape-names.js';

// Color
export { srgbHexToLinearTuple, srgbToLinear, srgbTupleToLinear } from '#utils/color-space.js';

// Coordinate/unit transforms
export { transformNormalArray, transformVertexArray } from '#geometry-transform.utils.js';
export type {
  GeometryOutputTransformOptions,
  OutputCoordinateSystem,
  OutputLengthUnit,
} from '#geometry-transform.utils.js';
