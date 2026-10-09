# manifold-3d — Classes (2)

2 top-level symbols. Signatures are verbatim typescript.

// An alternative to Mesh for output suitable for pushing into graphics libraries directly
Mesh: export declare class Mesh

  // Mesh.constructor (constructor)
  constructor(options: MeshOptions);

  // Number of properties per vertex, always >= 3
  numProp: number

  // Flat, GL-style interleaved list of all vertex properties
  vertProperties: Float32Array

  // The vertex indices of the three triangle corners in CCW (from the outside) order, for each triangle
  triVerts: Uint32Array

  // Optional
  mergeFromVert: Uint32Array

  // Optional
  mergeToVert: Uint32Array

  // Optional
  runIndex: Uint32Array

  // Optional
  runOriginalID: Uint32Array

  // Optional
  runTransform: Float32Array

  // Optional
  faceID: Uint32Array

  // Optional
  halfedgeTangent: Float32Array

  // Tolerance for mesh simplification
  tolerance: number

  // Number of triangles
  readonly numTri: number

  // Number of property vertices
  readonly numVert: number

  // Number of triangle runs
  readonly numRun: number

  // Updates the mergeFromVert and mergeToVert vectors in order to create a manifold solid
  // Remarks: There is no guarantee the result will be manifold - this is a best-effort helper function designed primarily to aid in the case where a manifold multi-material MeshGL was produced, but its merge vectors were lost due to a round-trip through a file format. Constructing a Manifold from the result will report a Status if it is not manifold.
  // Mesh.merge (method)
  merge(): boolean;

  // Gets the three vertex indices of this triangle in CCW order
  // Mesh.verts (method)
  verts(tri: number): SealedUint32Array<3>;
  //   tri: triangle index

  // Gets the x, y, z position of this vertex
  // Mesh.position (method)
  position(vert: number): SealedFloat32Array<3>;
  //   vert: vertex index

  // Gets any other properties associated with this vertex
  // Mesh.extras (method)
  extras(vert: number): Float32Array;
  //   vert: vertex index

  // Gets the tangent vector starting at verts(tri)[j] pointing to the next Bezier point along the CCW edge
  // Mesh.tangent (method)
  tangent(halfedge: number): SealedFloat32Array<4>;
  //   halfedge: halfedge index

  // Gets the column-major 4x4 matrix transform from the original mesh to these related triangles
  // Mesh.transform (method)
  transform(run: number): Mat4;
  //   run: triangle run index

// Include an imported model for visualization purposes
// Remarks: These nodes contain models that will be exported into the final GLTF document. They have not been converted into Manifold objects and cannot be modified. They can only be transformed (rotation, scale, translation) or displayed. This is useful for viewing ManifoldCAD models in the context of a larger assembly. GLTF objects meeting the `manifold-gltf` extension will still be manifold when exported.
VisualizationGLTFNode: export declare class VisualizationGLTFNode extends BaseGLTFNode

  node?: GLTFTransform.Node

  document?: GLTFTransform.Document

  uri?: string

  // VisualizationGLTFNode.constructor (constructor)
  constructor(parent?: BaseGLTFNode);

  // VisualizationGLTFNode.clone (method)
  clone(newParent?: BaseGLTFNode): VisualizationGLTFNode;

  // Does this node have any geometry that needs to be converted on export?
  // VisualizationGLTFNode.isEmpty (method)
  isEmpty(): boolean;
