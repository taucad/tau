# @classcad/smlibwasm — Types

32 top-level symbols. Signatures are verbatim typescript.

// A point or direction
VectorLike: Vector | ArrayLike<number>

// One alignment for all axes, or one per axis (null leaves an axis alone)
AlignLike: Align | string | null | readonly (Align | string | null)[]

// What a pattern of locations is made of (`new Locations(...)`)
LocationLike: Location | Plane | Locations | Face | Vertex | VectorLike | ShapeList<Face>

// What `kFactor` of `unfold`, `flatPattern` and `bends` takes
KFactor: number | string | ((radius: number, thickness: number, angle: number) => number) | ReadonlyMap<number, number> | Readonly<Record<string, number>> | readonly (readonly [
    number,
    number
])[] | null

// What `toSvg` and `exportSvg` draw
SvgItemsLike: DrawingView | Edge | Wire | Face | Shell | readonly SvgItemsLike[]

// A 4x4 matrix, row by row (`m[r * 4 + c]`), column-vector convention
Matrix: Float64Array

// A color
ColorLike: string | readonly number[]

// Edges as the operations on edges take them (`fillet`, `chamfer`)
EdgesLike: Edge | Face | Wire | (Iterable<EdgesLike> & object)

// Faces as the operations on faces take them (`shell`, `removeFaces`, `draft`)
FacesLike: Face | (Iterable<FacesLike> & object)

// A fillet radius
FilletRadius: number | readonly number[] | {
    start: number;
    end: number;
} | ReadonlyMap<number, number>

// A region on a face (`warp`, `flatten`)
RegionLike: Sketch | Face | Wire | Edge | Iterable<VectorLike>

// What shapes are sorted and grouped by
SortKey: Axis | string | ((s: Any) => number)

// The bodies, faces or edges a selection is checked against (`ShapeList.newSince`, `derivedFrom`, `joining`)
SourcesLike: Part | Shell | Face | Edge | (Iterable<SourcesLike> & object)

// Walls of their own thickness for `shell`
WallsLike: ReadonlyMap<Face, number> | Iterable<readonly [
    FacesLike,
    number
]>

// What `Hull` takes
HullItem: VectorLike | Vertex | Edge | Wire | Sketch | Face | readonly HullItem[]

// The options of `Trapezoid`
TrapezoidOptions: CornerOptions & PlacementOptions

  // Round every corner with this radius
  fillet?: number

  // Bevel every corner by this length
  chamfer?: number

  // Degrees counterclockwise about the shape's center
  rotation?: number

  // Alignment relative to the origin (after the rotation)
  align?: AlignLike

// A closed outline
Contour: Segment[]

// A point of an outline in font units, `[x, y]`
Point: readonly [
    number,
    number
]

// A line (2 points), a quadratic Bézier (3) or a cubic Bézier (4)
Segment: readonly Point[]

// A selection of lattice points
LatticeIndex: readonly [
    LatticeLayers,
    LatticeLayers,
    LatticeLayers
]

// Which layers of the lattice along one direction
LatticeLayers: number | null | readonly number[]

// What `exportFile` and `toFile` take
FileItemsLike: StepItemsLike | DxfShapesLike

// What `exportFile`, `toFile`, `Shape.export` and `Mesh.export` take as options
FileOptions: StepExportOptions | (MeshOptions & {
    ascii?: boolean;
}) | GltfOptions | DxfWriteOptions | SvgOptions | UsdExportOptions

// Shapes as the exporters, `htmlPage` and `show` take them
ShapesLike: Shape | Mesh | (Iterable<ShapesLike> & object)

// What a STEP file can hold, as `exportStep` and `toStep` take it
StepItemsLike: Shape | Mesh | Vector | Plane | StepCurve | StepPoint | StepFrame | StepModel | (Iterable<StepItemsLike> & object)

// The contents of a file in memory
BytesLike: Uint8Array | ArrayBufferView | ArrayBuffer

// What a DXF file can hold, as `exportDxf` and `toDxf` take it
DxfShapesLike: ShapesLike | DrawingView | (Iterable<DxfShapesLike> & object)

// The kinds of curvature `render` maps (see `RenderOptions.curvature`)
CurvatureKind: 'mean' | 'gaussian' | 'max' | 'min' | (string & {})

// A marker of `render` (see `RenderOptions.markers`)
RenderMarker: RenderPoint | readonly [
    RenderPoint,
    string
] | readonly [
    RenderPoint,
    string,
    ColorLike | null
] | {
    position: RenderPoint;
    label?: string;
    color?: ColorLike | null;
}

// A point of `render`'s options
RenderPoint: VectorLike | Shape | BoundBox

// A camera of `render` (see `RenderOptions.view`)
RenderView: 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | (string & {}) | VectorLike | {
    azimuth?: number;
    elevation?: number;
} | {
    direction: VectorLike;
    up?: VectorLike | null;
}

// What `render` draws
Renderable: Shape | Mesh | StepModel | (Iterable<Renderable> & object)
