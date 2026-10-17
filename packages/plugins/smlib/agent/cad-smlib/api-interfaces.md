# @classcad/smlibwasm — Interfaces

6 top-level symbols. Signatures are verbatim typescript.

// How a USD file is written
UsdExportOptions: export interface UsdExportOptions

  mesh?: boolean

  tolerance?: number | null

  angle?: number

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
  view?: unknown

  // Width and height in pixels (default [800, 600])
  size?: readonly [number, number]

  // Draw the edges of faces in the shaded view (hidden edges stay hidden)
  edges?: boolean

  // Background color (default "white")
  background?: string | readonly number[]

  // Tessellation tolerance
  tolerance?: number | null

  // Factor on the scale that fits the shapes (2 shows half as much)
  zoom?: number

  // A point that lands in the middle of the picture
  lookAt?: unknown

  // The frame of an earlier render of the same view and size (its `Picture.frame`, or the picture itself)
  frame?: Frame | Picture | Record<string, number> | readonly number[] | null

  // Render at this many times the size and average down (1 to 4)
  supersample?: number

  // `"native"`
  colors?: string

  // Line style instead of shading
  lines?: boolean

  // A technical drawing
  drawing?: unknown

  // Several shaded views in one picture
  sheet?: unknown

  // Cut at a plane and leave out what is on the positive side of its normal
  section?: unknown

  // Fill the cut faces of closed bodies, hatched at 45 degrees (neighbouring bodies alternate the direction)
  cap?: boolean

  // Shapes drawn in signal colors
  highlight?: unknown

  // Points
  highlightAt?: unknown

  // Crosshairs with labels, drawn on top
  markers?: unknown

  // Measurement overlay
  annotate?: boolean

  // Translucent bodies
  xray?: boolean

  // Opacity of each face in the x-ray view (0 to 1, default 0.42)
  xrayAlpha?: number

  // Zebra stripes
  zebra?: unknown

  // A curvature map of the exact surfaces
  curvature?: unknown

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
  view?: readonly [number, number, number]

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
