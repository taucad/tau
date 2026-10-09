# picovoxel — Interfaces (2)

8 top-level symbols. Signatures are verbatim typescript.

FromCliResult: interface FromCliResult extends SliceStack

  unitsHeader: number

  date: string

  headerLayerCount: number

  warnings: string[]

SdfImage: interface SdfImage

  width: number

  height: number

  // Row-major samples, negative inside
  data: ArrayLike<number>

Slice: interface Slice

  // Layer height position in mm (first layer at one layerHeight, as CLI wants)
  z: number

  contours: SliceContour[]

  // Value provenance of the sliced voxels (`'exact'` or absent = exact
  lane?: 'exact' | 'fast'

SliceContour: interface SliceContour

  // Flat [x0, y0, x1, y1, …] loop in mm
  points: Float64Array

  // Solid boundaries are CCW, holes CW (upstream contract)
  winding: ContourWinding

SliceStack: interface SliceStack

  slices: Slice[]

  // XY bounds over every contour + Z from first/last layer
  bounds: {
      min: readonly [number, number, number];
      max: readonly [number, number, number];
    }

  // Value provenance (`'exact'` or absent = exact)
  lane?: 'exact' | 'fast'

SliceVoxelsOptions: interface SliceVoxelsOptions

  // Layer height in mm
  layerHeight?: number

  // Keep absolute XY coordinates instead of the bbox-relative default
  useAbsoluteXY?: boolean

  // Monotonic 0→1
  onProgress?: (fraction: number) => void

ToCliOptions: interface ToCliOptions

  // Units in mm per CLI unit (1 = mm, upstream default)
  units?: number

  // Emit an intentionally-empty first layer so readers can infer layer height
  emptyFirstLayer?: boolean

  // Header date string
  date?: string

  onProgress?: (fraction: number) => void

ToSvgOptions: interface ToSvgOptions

  // Filled single-path rendering (holes via winding) instead of stroked outlines
  solid?: boolean

  strokeWidth?: number

  // Override the viewBox [minX, minY, width, height]
  viewBox?: readonly [number, number, number, number]
