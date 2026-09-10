# replicad — Types

25 top-level symbols. Signatures are verbatim typescript.

AnyShape: Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound

// We can defined a chamfer with only a number - in that case it will be symmetric
ChamferRadius: number | {
distances: [number, number];
selectedFace: (f: FaceFinder) => FaceFinder;
} | {
distance: number;
angle: number;
selectedFace: (f: FaceFinder) => FaceFinder;
}

Corner: {
firstCurve: Curve2D;
secondCurve: Curve2D;
point: Point2D;
}

CubeFace: "front" | "back" | "top" | "bottom" | "left" | "right"

CurveType: "LINE" | "CIRCLE" | "ELLIPSE" | "HYPERBOLA" | "PARABOLA" | "BEZIER_CURVE" | "BSPLINE_CURVE" | "OFFSET_CURVE" | "OTHER_CURVE"

FilletRadius: number | [number, number]

FilterFcn: {
element: Type;
normal: Vector | null;
}

ManifoldBox: Box

ManifoldInstance: Manifold

ManifoldMesh: Mesh

ManifoldVec3: Vec3

PlaneName: "XY" | "YZ" | "ZX" | "XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom"

Point: SimplePoint | Vector | [number, number] | {
XYZ: () => gp_XYZ;
delete: () => void;
}

Point2D: [number, number]

ProjectionPlane: "XY" | "XZ" | "YZ" | "YX" | "ZX" | "ZY" | "front" | "back" | "top" | "bottom" | "left" | "right"

// A generic way to define radii for fillet or chamfer (the operation)
RadiusConfig: ((e: Edge) => R | null) | R | {
filter: EdgeFinder;
radius: R;
keep?: boolean;
}

ScaleMode: "original" | "bounds" | "native"

Shape2D: Blueprint | Blueprints | CompoundBlueprint | null

Shape3D: Shell | Solid | CompSolid | Compound

ShapeConfig: {
shape: AnyShape;
color?: string;
alpha?: number;
name?: string;
/** PBR metalness factor (0 = dielectric, 1 = metal). Threaded to GLTF only (not STEP; see note above). \*/
metalness?: number;
/** PBR roughness factor — threaded to GLTF only (not STEP; see note above). \*/
roughness?: number;
density?: number;
}

SimplePoint: [number, number, number]

SingleFace: Face | FaceFinder | ((f: FaceFinder) => FaceFinder)

SplineConfig: SplineTangent | {
endTangent?: SplineTangent;
startTangent?: StartSplineTangent;
startFactor?: number;
endFactor?: number;
}

SupportedUnit: "M" | "CM" | "MM" | "INCH" | "FT" | "m" | "mm" | "cm" | "inch" | "ft"

SurfaceType: "PLANE" | "CYLINDRE" | "CONE" | "SPHERE" | "TORUS" | "BEZIER_SURFACE" | "BSPLINE_SURFACE" | "REVOLUTION_SURFACE" | "EXTRUSION_SURFACE" | "OFFSET_SURFACE" | "OTHER_SURFACE"
