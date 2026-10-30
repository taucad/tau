# @classcad/smlibwasm — Interfaces

41 top-level symbols. Signatures are verbatim typescript.

// How an IGES file is read
IgesImportOptions: export interface IgesImportOptions

  heal?: boolean

  strict?: boolean

// How `drawingViews` draws
DrawingViewsOptions: export interface DrawingViewsOptions

  projection?: 'first-angle' | 'third-angle'

  hidden?: boolean

  tangentEdges?: boolean

  gap?: number | null

// How `toSvg` draws
SvgOptions: export interface SvgOptions

  margin?: number | null

  stroke?: number | null

// How a USD file is written
UsdExportOptions: export interface UsdExportOptions

  mesh?: boolean

  tolerance?: number | null

  angle?: number

  materials?: boolean

  maxEdge?: number | null

// How a USD stage is read
UsdImportOptions: export interface UsdImportOptions

  heal?: boolean

  units?: string | null

  placement?: boolean

  check?: boolean

  strict?: boolean

// fromUsd's options
UsdReadOptions: export interface UsdReadOptions extends UsdImportOptions

  resolve?: ((asset: string, from: string) => string | Uint8Array | null | undefined) | null

// How a .brep file is read
BrepImportOptions: export interface BrepImportOptions

  heal?: boolean

  check?: boolean

  // Throw a ModelingError where a solid, shell or face of the file cannot be read
  strict?: boolean

// The frame of a single view
Frame: export interface Frame

  scale: number

  midX: number

  midY: number

// Pixels to compare
ImageLike: export interface ImageLike

  width: number

  height: number

  data: ArrayLike<number>

// The options of `render`
RenderOptions: export interface RenderOptions

  // Also write the PNG to this file (Node)
  path?: string | null

  // The camera, orthographic, Z up
  // Remarks: - a name: `"iso"` (default; a true isometric view from front, right and above), `"front"`, `"back"`, `"left"`, `"right"`, `"top"`, `"bottom"`; - `{ azimuth: a, elevation: e }` in degrees: azimuth 0 looks from the front, 90 from the right (+X); elevation 90 from above. `"iso"` is azimuth 45, elevation 35.264; `"right"` is azimuth 90; - `{ direction: [x, y, z], up: [x, y, z] }`: the direction the camera looks in (from the camera towards the model); `up` defaults to Z; - `[x, y, z]` (or a Vector): the direction from the model towards the camera; - `"sheet"`: the same as `drawing: "first-angle"`. Views are never mirrored.
  view?: RenderView | 'sheet'

  // Width and height in pixels (default [800, 600])
  size?: readonly [
          number,
          number
      ]

  // Draw the edges of faces in the shaded view (hidden edges stay hidden)
  edges?: boolean

  // Background color (default "white")
  background?: string | readonly number[]

  // Tessellation tolerance
  tolerance?: number | null

  // Factor on the scale that fits the shapes (2 shows half as much)
  zoom?: number

  // A point that lands in the middle of the picture
  lookAt?: RenderPoint | null

  // The frame of an earlier render of the same view and size (its `Picture.frame`, or the picture itself)
  frame?: Frame | Picture | Record<string, number> | readonly number[] | null

  // Render at this many times the size and average down (1 to 4)
  supersample?: number

  // `"native"`
  colors?: 'native' | 'distinct'

  // Line style instead of shading
  lines?: boolean

  // A technical drawing
  drawing?: boolean | 'first-angle' | 'third-angle' | (string & {}) | {
          projection?: string;
          side?: string;
          iso?: boolean;
      } | null

  // Several shaded views in one picture
  sheet?: boolean | readonly (RenderView | null)[] | null

  // Cut at a plane and leave out what is on the positive side of its normal
  section?: Plane | Face | readonly [
          Face
      ] | readonly [
          RenderPoint,
          VectorLike
      ] | {
          origin: RenderPoint;
          normal: VectorLike;
          cap?: boolean;
      } | false | null

  // Fill the cut faces of closed bodies, hatched at 45 degrees (neighbouring bodies alternate the direction)
  cap?: boolean

  // Shapes drawn in signal colors
  highlight?: Shape | Mesh | readonly (Shape | Mesh | readonly (Shape | Mesh)[])[] | null

  // Points
  highlightAt?: VectorLike | Iterable<RenderPoint> | null

  // Crosshairs with labels, drawn on top
  markers?: VectorLike | {
          position: RenderPoint;
          label?: string;
          color?: ColorLike | null;
      } | Iterable<RenderMarker> | null

  // Measurement overlay
  annotate?: boolean

  // Translucent bodies
  xray?: boolean

  // Opacity of each face in the x-ray view (0 to 1, default 0.42)
  xrayAlpha?: number

  // Zebra stripes
  zebra?: boolean | {
          stripes?: number;
          width?: number;
          direction?: 'vertical' | 'horizontal' | (string & {}) | VectorLike;
      } | null

  // A curvature map of the exact surfaces
  curvature?: CurvatureKind | {
          kind?: CurvatureKind;
          range?: number | readonly [
              number,
              number
          ] | null;
      } | false | null

// The options of `htmlPage`
PageOptions: export interface PageOptions

  // The page title (default "smlibwasm")
  title?: string

  // Tessellation tolerance
  tolerance?: number | null

  // Largest angle between neighbouring triangle normals on curved faces, degrees (default 12)
  angle?: number

  // Draw the B-rep edges (default true)
  edges?: boolean

  // The direction from the model towards the camera, Z up (default [1, -1.25, 0.75])
  view?: readonly [
          number,
          number,
          number
      ]

  // Room around the model when it is framed (default 1.1)
  margin?: number

// The options of `show`
ShowOptions: export interface ShowOptions

  // The page title (default "smlibwasm")
  title?: string

  // Where to write the page (default
  path?: string | null

  // Open the page in the default browser (default true)
  openBrowser?: boolean

  // Tessellation tolerance
  tolerance?: number | null

  // Largest angle between neighbouring triangle normals on curved faces, degrees (default 12)
  angle?: number

  // Draw the B-rep edges (default true)
  edges?: boolean

// What the kernel's memory holds, in bytes (see `memoryUsage`)
MemoryUsage: export interface MemoryUsage

  // What the kernel's objects take
  readonly used: number

  // The module's memory
  readonly heap: number

  // What the module's memory can grow to
  readonly limit: number

  // The kernel objects (bodies, curves, surfaces, meshes) that JavaScript holds and that are not freed yet
  readonly handles: number

  // The times the kernel crashed (a trap of the module) since it was loaded
  readonly crashes: number

// Anything with a `moved(location)`
Movable: export interface Movable<T>

  // Movable.moved (method)
  moved(location: Location): T;

// Coordinates by name, for `Pos({ z
XYZ: export interface XYZ

  x?: number

  y?: number

  z?: number

// Metadata a body carries
BodyOptions: export interface BodyOptions

  name?: string | null

  color?: ColorLike | null

  // (a sketch's plane)
  plane?: Plane | null

// How a sketch is extruded
ExtrudeOptions: export interface ExtrudeOptions

  // Extrude the amount to both sides of the sketch
  both?: boolean

  // Draft angle in degrees
  taper?: number

  // Extrude along this direction (an axis or a vector) instead of the normal
  direction?: Axis | VectorLike | null

  // With a taper, the corners the taper pulls apart
  corners?: 'sharp' | 'round'

// How a fillet's cross-section is shaped
FilletOptions: export interface FilletOptions

  // null for a circular fillet
  continuity?: number | string | null

  // Shape of a blend cross-section
  fullness?: number

  // Round the edges that continue the selected ones tangentially too (`Edge.tangentChain`)
  propagate?: boolean

  // Where three rounded edges meet
  corners?: 'patch' | 'mitre' | 'miter'

  // Set the corners back
  setback?: number | null

// The options of `Face.iso`
IsoOptions: export interface IsoOptions

  u?: number | null

  v?: number | null

// How `Part.push` and `Shell.push` move the point (see `Part.push`)
PushOptions: export interface PushOptions

  // How far the point moves
  by?: number | VectorLike | null

  // Where the point moves to, instead of `by`
  to?: VectorLike | null

  // The face's normal at the moved point (default
  normal?: VectorLike | null

  // How far from the point the face changes (default
  radius?: number | null

  // `'G0'`, `'G1'` (default) or `'G2'`
  continuity?: 'G0' | 'G1' | 'G2'

// The coordinate a line or a forward move goes to
Coordinates: export interface Coordinates

  x?: number | null

  y?: number | null

// The corner options of the shapes with corners
CornerOptions: export interface CornerOptions

  // Round every corner with this radius
  fillet?: number

  // Bevel every corner by this length
  chamfer?: number

// Where a new shape sits and how it is turned
PlacementOptions: export interface PlacementOptions

  // Degrees counterclockwise about the shape's center
  rotation?: number

  // Alignment relative to the origin (after the rotation)
  align?: AlignLike

// The options of `Polygon`
PolygonOptions: export interface PolygonOptions extends CornerOptions

  align?: AlignLike

// How `Text` sets the text
TextOptions: export interface TextOptions

  // A TrueType or OpenType font (.ttf, .otf, .ttc, .woff, .woff2)
  font?: string | BytesLike | Font | null

  // Placement of the text's layout box (from the start to the end of the longest line, and from the baseline of the last line to the cap height of the first)
  align?: AlignLike

  // Extra distance between neighbouring letters in mm (negative
  spacing?: number

  // Distance between baselines as a multiple of `size`
  lineSpacing?: number

  // Apply the font's kerning pairs
  kerning?: boolean

  // An edge or wire in the XY plane to set one line of text along
  path?: Edge | Wire | null

// How a profile is extruded (see `Sketch.extrude`)
ExtrudeFunctionOptions: export interface ExtrudeFunctionOptions

  both?: boolean

  taper?: number

  direction?: Axis | VectorLike | null

  corners?: 'sharp' | 'round'

// How a profile is swept (see `sweep`)
SweepOptions: export interface SweepOptions

  // Turn the profile to be perpendicular to the path at its start (default)
  orient?: boolean

  // Keep the profile's orientation fixed instead of turning it with the path
  translational?: boolean

  // For paths of several edges
  sharpCorners?: boolean | null

  // An axis or a direction the profile keeps its attitude to
  up?: Axis | VectorLike | string | null

  // Degrees the profile turns about the path on top of that, spread evenly along its length
  twist?: number | ((s: number) => number)

  // The profile's scale along the path, about the point of it that sits on the path
  scale?: readonly [
          number,
          number
      ] | readonly (readonly [
          number,
          number
      ])[] | ((s: number) => number) | null

  // The point of the profile that goes on the path (and that `scale` scales about)
  anchor?: 'center' | 'origin' | VectorLike | Vertex

  // A second rail (an edge or a wire
  // Remarks: const hood = sweep(ThreePointArc([0, 0, 0], [10, 0, 4], [20, 0, 0]), left, { rails: right })
  rails?: Edge | Wire | null

// How a part is bent (see `bend`)
BendOptions: export interface BendOptions extends RangeOptions

  // The bend radius of the neutral layer
  radius?: number | null

  // Sets the bend
  plane?: Plane

// Where a deformation applies along its axis
RangeOptions: export interface RangeOptions

  // Where the deformation begins, as a distance along the axis from its origin
  start?: number | null

  // Where the deformation ends, measured the same way
  end?: number | null

  // Largest distance of the deformed faces from the exact map (mm)
  tolerance?: number | null

// How a part is tapered (see `taper`)
TaperOptions: export interface TaperOptions extends RangeOptions

  // The line the cross-sections shrink toward (default the world Z axis)
  axis?: Axis

// How a part is twisted (see `twist`)
TwistOptions: export interface TwistOptions extends RangeOptions

  // The line to twist about (default the world Z axis through the origin)
  axis?: Axis

// The bend of `bendAllowance` and `bendDeduction`
BendAllowanceOptions: export interface BendAllowanceOptions

  // Inside bend radius
  radius: number

  // Sheet thickness
  thickness: number

  // Position of the neutral fiber, 0 (inside) to 1 (outside)
  kFactor?: number

// The bends of `developedLength`
DevelopedLengthOptions: export interface DevelopedLengthOptions extends BendAllowanceOptions

  // The angle of every bend in degrees, or one angle per bend (default 90)
  angle?: number | Iterable<number>

// Options of `flange`
FlangeOptions: export interface FlangeOptions

  // Bend angle in degrees, below 180 (default 90)
  angle?: number

  // Inside bend radius
  radius: number

  // Position of the neutral fiber, 0 (inside) to 1 (outside)
  kFactor?: number

// Options of `fold`
FoldOptions: export interface FoldOptions

  // Inside bend radius
  radius: number

  // Position of the neutral fiber, 0 (inside) to 1 (outside)
  kFactor?: number

  // A point (or a face, edge or vertex) on the side of the line that stays in place
  fixed?: VectorLike | Shape | null

  // Bend only along the segment `line` (an Edge), not across the whole sheet
  partial?: boolean

// Options of `unfold` and `flatPattern`
UnfoldOptions: export interface UnfoldOptions

  // The K-factor of each bend (see `KFactor`)
  kFactor?: KFactor

  // The planar face of the part that stays in place (default
  fixed?: Face | null

// How glTF is written
GltfOptions: export interface GltfOptions extends MeshOptions

  edges?: boolean

  edgeColor?: Any

// How shapes are meshed
MeshOptions: export interface MeshOptions

  tolerance?: number | null

  angle?: number

  maxEdge?: number | null

// How a STEP file is written
StepExportOptions: export interface StepExportOptions

  unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in'

  name?: string | null

  assembly?: boolean

// How a drawing is read
DxfReadOptions: export interface DxfReadOptions

  // Read only these layers (names in any letter case)
  layers?: Iterable<string> | string | null

  // The unit of the drawing ("mm", "cm", "m", "um", "inch", "ft"), instead of the file's `$INSUNITS`
  unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in' | 'ft' | null

  // Ends closer than this (mm) are joined
  tolerance?: number | null

// How a drawing is written
DxfWriteOptions: export interface DxfWriteOptions

  // Unit of the file
  unit?: 'mm' | 'cm' | 'm' | 'um' | 'inch' | 'in' | 'ft'

  // The plane of the drawing
  plane?: Plane | null

  // 'exact' (default) writes splines and ellipses as SPLINE and ELLIPSE
  curves?: 'exact' | 'arcs'

  // For `curves
  tolerance?: number
