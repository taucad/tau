# manifold-3d — Functions

17 top-level symbols. Signatures are verbatim typescript.

// Get the current duruation of the animation, in seconds
// getAnimationDuration (function)
export declare function getAnimationDuration(): number;

// Get the current animation frame rate
// getAnimationFPS (function)
export declare function getAnimationFPS(): number;

// Get the current animation repeat mode
// getAnimationMode (function)
export declare function getAnimationMode(): AnimationMode;

// Determine the appropriate number of segments for a given radius
// getCircularSegments (function)
export declare function getCircularSegments(radius: number): number;
//   radius: For a given radius of circle, determine how many default segments there will be

// Get a list of GLTF nodes that have been created in this model
// Remarks: This function only works in scripts directly evaluated by the manifoldCAD website or CLI. When called in an imported library it will always return an empty array, and nodes created in libraries will not be included in the result. This is intentional; libraries must not create geometry as a side effect.
// getGLTFNodes (function)
export declare function getGLTFNodes(): BaseGLTFNode[];

// Get the current angle constraint
// getMinCircularAngle (function)
export declare function getMinCircularAngle(): number;

// Get the current edge length constraint
// getMinCircularEdgeLength (function)
export declare function getMinCircularEdgeLength(): number;

// Import a model, and convert it to a Manifold object for manipulation
// Remarks: The original imported model may consist of an entire tree of nodes, each of which may or may not be manifold. This method will convert each child node, and then union the results together. If a child node has no mesh, the mesh has no geometry, or the mesh is not manifold, that child node will be silently excluded.
// importManifold (function)
export declare function importManifold(source: string | Blob | URL | ArrayBuffer, options?: ImportOptions): Promise<Manifold>;

// Import a model, for display only
// importModel (function)
export declare function importModel(source: string | Blob | URL | ArrayBuffer, options?: ImportOptions): Promise<VisualizationGLTFNode>;

// Is this module running in manifoldCAD.org or the ManifoldCAD CLI?
// isManifoldCAD (function)
export declare function isManifoldCAD(): boolean

// Wrap any shape object with this method to display it and any copies as the result, while ghosting out the final result in transparent gray
// only (function)
export declare function only(manifold: Manifold): Manifold;
//   manifold: The object to show - returned for chaining

// Clear the list of cached GLTF nodes
// Remarks: This function only works in scripts directly evaluated by the manifoldCAD website or CLI. When called in an imported library it will have no effect.
// resetGLTFNodes (function)
export declare function resetGLTFNodes(): void;

// Return a shallow copy of the input manifold with the given material properties applied
// setMaterial (function)
export declare function setMaterial(manifold: Manifold, material: GLTFMaterial): Manifold;
//   manifold: The input object
//   material: A set of material properties to apply to this manifold

// Apply a morphing animation to the input manifold
// setMorphEnd (function)
export declare function setMorphEnd(manifold: Manifold, func: (v: Vec3) => void): void;
//   manifold: The object to add morphing animation to
//   func: A warping function to apply to the last animation frame

// Apply a morphing animation to the input manifold
// setMorphStart (function)
export declare function setMorphStart(manifold: Manifold, func: (v: Vec3) => void): void;
//   manifold: The object to add morphing animation to
//   func: A warping function to apply to the first animation frame

// Wrap any shape object with this method to display it and any copies in transparent red
// show (function)
export declare function show(manifold: Manifold): Manifold;
//   manifold: The object to show - returned for chaining

// Triangulates a set of /epsilon-valid polygons
// triangulate (function)
export declare function triangulate(
polygons: Polygons, epsilon?: number, allowConvex?: boolean): Vec3[];
//   polygons: The set of polygons, wound CCW and representing multiple polygons and/or holes
//   epsilon: The value of epsilon, bounding the uncertainty of the input
//   allowConvex: If true (default), the triangulator will use a fast triangulation if the input is convex, falling back to ear-clipping if not
