# manifold-3d — Interfaces

4 top-level symbols. Signatures are verbatim typescript.

ManifoldToplevel: export declare interface ManifoldToplevel

CrossSection: typeof CrossSection

Manifold: typeof Manifold

Mesh: typeof Mesh

triangulate: typeof triangulate

setMinCircularAngle: typeof setMinCircularAngle

setMinCircularEdgeLength: typeof setMinCircularEdgeLength

setCircularSegments: typeof setCircularSegments

getCircularSegments: typeof getCircularSegments

resetToCircularDefaults: typeof resetToCircularDefaults

setup: () => void

MeshOptions: export declare interface MeshOptions

numProp: number

vertProperties: Float32Array

triVerts: Uint32Array

mergeFromVert: Uint32Array

mergeToVert: Uint32Array

runIndex: Uint32Array

runOriginalID: Uint32Array

runTransform: Float32Array

faceID: Uint32Array

halfedgeTangent: Float32Array

tolerance: number

SealedFloat32Array: export declare interface SealedFloat32Array<N extends number> extends Float32Array

// The length of the array
length: N

SealedUint32Array: export declare interface SealedUint32Array<N extends number> extends Uint32Array

// The length of the array
length: N
