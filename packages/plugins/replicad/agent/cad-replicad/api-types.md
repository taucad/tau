# replicad — Types

30 top-level symbols. Signatures are verbatim typescript.

AnyShape: Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound

AxisName: (typeof AXIS_NAMES)[number]

// We can defined a chamfer with only a number - in that case it will be symmetric
// Remarks: We can also define a chamfer with two distances, in that case the chamfer will be asymmetric, and the first distance will be used for selected face. We can also define a chamfer with a distance and an angle, in that case the chamfer will be asymmetric, and the distance will be used for selected face. Note that the selected face is a function that takes a FaceFinder, and if this fails, you might expect an error.
ChamferRadius: number | {
    distances: [number, number];
    selectedFace: FinderFunction<FaceFinder, AnyShape>;
} | {
    distance: number;
    angle: number;
    selectedFace: FinderFunction<FaceFinder, AnyShape>;
}

Corner: {
    firstCurve: Curve2D;
    secondCurve: Curve2D;
    point: Point2D;
}

  firstCurve: Curve2D

  secondCurve: Curve2D

  point: Point2D

CubeFace: "front" | "back" | "top" | "bottom" | "left" | "right"

CurveType: "LINE" | "CIRCLE" | "ELLIPSE" | "HYPERBOLA" | "PARABOLA" | "BEZIER_CURVE" | "BSPLINE_CURVE" | "OFFSET_CURVE" | "OTHER_CURVE"

// A vector-like point or a named principal axis
Direction: Point | AxisName

FilletRadius: number | [number, number]

FilterFcn: {
    element: Type;
    normal: Vector | null;
}

  element: Type

  normal: Vector | null

FinderFunction: (finder: FinderType, shape: ShapeType) => FinderType

ManifoldBox: Box

  min: Vec3

  max: Vec3

ManifoldInstance: Manifold

ManifoldMesh: Mesh

ManifoldVec3: Vec3

PlaneName: "XY" | "YZ" | "ZX" | "XZ" | "YX" | "ZY" | "front" | "back" | "left" | "right" | "top" | "bottom"

PlaneSide: "positive" | "negative"

Point: SimplePoint | Vector | [number, number] | {
    XYZ: () => gp_XYZ;
    delete: () => void;
}

Point2D: [number, number]

ProjectionPlane: "XY" | "XZ" | "YZ" | "YX" | "ZX" | "ZY" | "front" | "back" | "top" | "bottom" | "left" | "right"

// A generic way to define radii for fillet or chamfer (the operation)
// Remarks: If the radius is a filter finder object (with an EdgeFinder as filter, and a radius to specify the fillet radius), the operation will only be applied to the edges as selected by the finder. The finder will be deleted unless it is explicitly specified to `keep` it. If the radius is a number all the edges will be targetted for the operation. If the radius is a function edges will be filletted or chamfered according to the value returned by the function (0 or null will not add any fillet).
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
    /** PBR metalness factor (0 = dielectric, 1 = metal). Threaded to GLTF only (not STEP; see note above). */
    metalness?: number;
    /** PBR roughness factor — threaded to GLTF only (not STEP; see note above). */
    roughness?: number;
    /** Material density in g/cm3, written as the shape's STEP material. */
    density?: number;
}

  shape: AnyShape

  color?: string

  alpha?: number

  name?: string

  // PBR metalness factor (0 = dielectric, 1 = metal)
  metalness?: number

  // PBR roughness factor — threaded to GLTF only (not STEP
  roughness?: number

  // Material density in g/cm3, written as the shape's STEP material
  density?: number

SimplePoint: [number, number, number]

SingleFace: Face | FaceFinder | FinderFunction<FaceFinder, AnyShape>

SplineConfig: SplineTangent | {
    endTangent?: SplineTangent;
    startTangent?: StartSplineTangent;
    startFactor?: number;
    endFactor?: number;
}

SupportedUnit: "M" | "CM" | "MM" | "INCH" | "FT" | "m" | "mm" | "cm" | "inch" | "ft"

SurfaceType: "PLANE" | "CYLINDRE" | "CONE" | "SPHERE" | "TORUS" | "BEZIER_SURFACE" | "BSPLINE_SURFACE" | "REVOLUTION_SURFACE" | "EXTRUSION_SURFACE" | "OFFSET_SURFACE" | "OTHER_SURFACE"

TopoEntity: TopologyKind | "shape"
