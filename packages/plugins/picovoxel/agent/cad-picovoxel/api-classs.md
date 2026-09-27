# picovoxel — Classs

61 top-level symbols. Signatures are verbatim typescript.

PicoError: declare class PicoError extends Error

  code: PicoErrorCode

  constructor

// Body-centred lattice
BodyCentreLattice: declare class BodyCentreLattice implements LatticeType

  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Thickness from the distance to the bounding voxel surface
BoundaryBeamThickness: declare class BoundaryBeamThickness implements BeamThickness

  constructor

  beamThickness(pt: Vec3): number;

  updateCell(_cell: UnitCell): void;

  setBoundingVoxels(voxels: Voxels): void;

// Thickness from the point's position within the current unit cell
CellBasedBeamThickness: declare class CellBasedBeamThickness implements BeamThickness

  constructor

  updateCell(cell: UnitCell): void;

  beamThickness(pt: Vec3): number;

  setBoundingVoxels(_voxels: Voxels): void;

// Sequential composition of trafos
CombinedTrafo: declare class CombinedTrafo implements CoordinateTrafo

  constructor

  apply(pt: Vec3): Vec3;

// Regular grid cell array conformal to a BaseBox, BaseLens or BasePipeSegment
ConformalCellArray: declare class ConformalCellArray implements CellArray

  constructor

  unitCells(): readonly UnitCell[];

// Constant thickness, independent of cell or boundary (C# `ConstantBeamThickness`)
ConstantBeamThickness: declare class ConstantBeamThickness implements BeamThickness

  constructor

  beamThickness(_pt: Vec3): number;

  updateCell(_cell: UnitCell): void;

  setBoundingVoxels(_voxels: Voxels): void;

// Simple unit cell with 8 corner points in the shape of a cuboid
CuboidCell: declare class CuboidCell implements UnitCell

  constructor

  cornerPoints(): readonly Vec3[];

  cellCentre(): Vec3;

  cellBounding(): Bounds;

// Complement of the full wall (C# `FullVoidLogic`)
FullVoidLogic: declare class FullVoidLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Wall on both sides of the zero surface (C# `FullWallLogic`)
FullWallLogic: declare class FullWallLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Z-dependent scale ramp 20→5 over z 0..50
FunctionalScaleTrafo: declare class FunctionalScaleTrafo implements CoordinateTrafo

  apply(pt: Vec3): Vec3;

// Thickness from a global function of the point — upstream hard-codes a ramp over x
GlobalFuncBeamThickness: declare class GlobalFuncBeamThickness implements BeamThickness

  constructor

  beamThickness(pt: Vec3): number;

  updateCell(_cell: UnitCell): void;

  setBoundingVoxels(_voxels: Voxels): void;

// Implicit lidinoid
ImplicitLidinoid: declare class ImplicitLidinoid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Modular implicit
ImplicitModular: declare class ImplicitModular

  sdf: SdfFunction

  constructor

// Gyroid unwrapped around the Z axis
ImplicitRadialGyroid: declare class ImplicitRadialGyroid

  sdf: SdfFunction

  constructor

// Schwarz primitive over a randomly deformed grid
ImplicitRandomizedSchwarzPrimitive: declare class ImplicitRandomizedSchwarzPrimitive

  sdf: SdfFunction

  constructor

// Implicit Schwarz diamond
ImplicitSchwarzDiamond: declare class ImplicitSchwarzDiamond implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Implicit Schwarz primitive (C# `ImplicitSchwarzPrimitive`)
ImplicitSchwarzPrimitive: declare class ImplicitSchwarzPrimitive implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// One side of the gyroid surface as a void, shrunk by the half wall
ImplicitSplitVoidGyroid: declare class ImplicitSplitVoidGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Gyroid wall on one side of the surface, solid on the other
ImplicitSplitWallGyroid: declare class ImplicitSplitWallGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Wall only on the negative side (C# `NegativeHalfWallLogic`)
NegativeHalfWallLogic: declare class NegativeHalfWallLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Negative-side volume shrunk by the half wall (C# `NegativeVoidLogic`)
NegativeVoidLogic: declare class NegativeVoidLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Octahedron lattice
OctahedronLattice: declare class OctahedronLattice implements LatticeType

  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Wall only on the positive side (C# `PositiveHalfWallLogic`)
PositiveHalfWallLogic: declare class PositiveHalfWallLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Positive-side volume shrunk by the half wall (C# `PositiveVoidLogic`)
PositiveVoidLogic: declare class PositiveVoidLogic implements SplittingLogic

  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Cylindrical unwrap
RadialTrafo: declare class RadialTrafo implements CoordinateTrafo

  constructor

  apply(pt: Vec3): Vec3;

// Regular cuboid 3D grid with a random 3D value at each grid point and tri-linear spatial interpolation for 3D modulations (C# `RandomDeformationField`)
RandomDeformationField: declare class RandomDeformationField

  constructor

  // Tri-linear interpolation of the noise grid at the point, clamped to the bounding box (C# `vecGetData`
  dataAt(pt: Vec3): Vec3;

// Custom lattice type connecting random corners of a cell through a noisy NURBS midpoint
RandomSplineLattice: declare class RandomSplineLattice implements LatticeType

  constructor

  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, _subSamples?: number): void;

// C# `RawGyroidTPMSPattern`
RawGyroidTpmsPattern: declare class RawGyroidTpmsPattern implements RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// C# `RawLidinoidTPMSPattern`
RawLidinoidTpmsPattern: declare class RawLidinoidTpmsPattern implements RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// C# `RawSchwarzDiamondTPMSPattern`
RawSchwarzDiamondTpmsPattern: declare class RawSchwarzDiamondTpmsPattern implements RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// C# `RawSchwarzPrimitiveTPMSPattern`
RawSchwarzPrimitiveTpmsPattern: declare class RawSchwarzPrimitiveTpmsPattern implements RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// Schwarz diamond blending into Schwarz primitive over x in -2..3 (C# `RawTransitionTPMSPattern`)
RawTransitionTpmsPattern: declare class RawTransitionTpmsPattern implements RawTpmsPattern

  signedDistance(x: number, y: number, z: number): number;

// Regular grid cell array housing the bounding box of the voxel field, with customised x/y/z unit-cell dimensions
RegularCellArray: declare class RegularCellArray implements CellArray

  constructor

  unitCells(): readonly UnitCell[];

// A grid of just one unit cell, centred in XY and based at z = 0 (C# `RegularUnitCell`)
RegularUnitCell: declare class RegularUnitCell implements CellArray

  constructor

  unitCells(): readonly UnitCell[];

// Per-axis division by the unit sizes (C# `ScaleTrafo`)
ScaleTrafo: declare class ScaleTrafo implements CoordinateTrafo

  constructor

  apply(pt: Vec3): Vec3;

// Box along a straight frame or spine with width/depth line modulations (C# `BaseBox`)
BaseBox: declare class BaseBox extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  widthSteps: number

  depthSteps: number

  widthModulation: LineModulation

  depthModulation: LineModulation

  frames: Frames

  constructor

  // From a bounding box
  static fromBounds(bounds: Bounds): BaseBox;

  // C# `SetWidth` — modulated width bumps width+length sampling to 500
  setWidth(modulation: LineModulation): void;

  // C# `SetDepth` — modulated depth bumps depth+length sampling to 500
  setDepth(modulation: LineModulation): void;

  setWidthSteps(steps: number): void;

  setDepthSteps(steps: number): void;

  setLengthSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  protected depthRatioFromStep(step: number): number;

  protected widthRatioFromStep(step: number): number;

  protected lengthRatioFromStep(step: number): number;

  // Surface point
  surfacePoint(widthRatio: number, depthRatio: number, lengthRatio: number): Vec3;

// Cone
BaseCone: declare class BaseCone extends BaseShape

  cylinder: BaseCylinder

  constructor

  voxConstruct(pk: Pico): Voxels;

  // The underlying cylinder (C# `oGetBaseCylinder`)
  baseCylinder(): BaseCylinder;

// Cylinder along a straight frame or a spine, with a surface-modulated radius (C# `BaseCylinder`)
BaseCylinder: declare class BaseCylinder extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  radiusModulation: SurfaceModulation

  frames: Frames

  constructor

  // C# `SetRadius` — modulated radii bump the length sampling to 500
  setRadius(modulation: SurfaceModulation): void;

  setRadialSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  setLengthSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  // Top disc at full length (C# `AddTopSurface`)
  protected addTopSurface(builder: MeshBuilder): void;

  // Bottom disc, wound the other way (C# `AddBottomSurface`)
  protected addBottomSurface(builder: MeshBuilder): void;

  // Outer mantle across phi and length (C# `AddOuterMantle`)
  protected addOuterMantle(builder: MeshBuilder): void;

  protected radiusRatioFromStep(step: number): number;

  protected phiRatioFromStep(step: number): number;

  protected lengthRatioFromStep(step: number): number;

  // Surface point at (lengthRatio, phiRatio, radiusRatio), all 0..1 (C# `vecGetSurfacePoint`)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Lens/washer
BaseLens: declare class BaseLens extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  radialSteps: number

  polarSteps: number

  heightSteps: number

  innerRadius: number

  outerRadius: number

  upperModulation: SurfaceModulation

  lowerModulation: SurfaceModulation

  frame: Frame

  constructor

  // C# `SetHeight` — modulated faces bump radial sampling to 500
  setHeight(lowerModulation: SurfaceModulation, upperModulation: SurfaceModulation): void;

  setRadialSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  setHeightSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  protected radiusRatioFromStep(step: number): number;

  protected phiRatioFromStep(step: number): number;

  protected heightRatioFromStep(step: number): number;

  // Surface point (C# `vecGetSurfacePoint`
  surfacePoint(heightRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Pipe (annular cylinder) along a straight frame or spine (C# `BasePipe`)
BasePipe: declare class BasePipe extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  outerRadiusModulation: SurfaceModulation

  innerRadiusModulation: SurfaceModulation

  frames: Frames

  constructor

  // C# `SetRadius(inner, outer)` — bumps length sampling to 500
  setRadius(innerRadius: SurfaceModulation, outerRadius: SurfaceModulation): void;

  setRadialSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  setLengthSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  protected addTopSurface(builder: MeshBuilder, flip?: boolean): void;

  protected addBottomSurface(builder: MeshBuilder, flip?: boolean): void;

  protected addOuterMantle(builder: MeshBuilder, flip?: boolean): void;

  protected addInnerMantle(builder: MeshBuilder, flip?: boolean): void;

  protected radiusRatioFromStep(step: number): number;

  protected phiRatioFromStep(step: number): number;

  protected lengthRatioFromStep(step: number): number;

  // Surface point
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Angular pipe segment
BasePipeSegment: declare class BasePipeSegment extends BasePipe

  rangeModulation: LineModulation

  midModulation: LineModulation

  constructor

  mshConstruct(pk: Pico): Mesh;

  // Phi spans mid ± range/2 at the length ratio (C# override)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Revolves a spine cross-section about the reference frame's Z axis (C# `BaseRevolve`)
BaseRevolve: declare class BaseRevolve extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  frames: Frames

  frame: Frame

  outerRadiusModulation: LineModulation

  innerRadiusModulation: LineModulation

  constructor

  setRadius(innerRadius: LineModulation, outerRadius: LineModulation): void;

  setRadialSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  setLengthSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  protected radiusRatioFromStep(step: number): number;

  protected phiRatioFromStep(step: number): number;

  protected lengthRatioFromStep(step: number): number;

  // Spine offset along local X, revolved about the reference frame's Z axis (C# `vecGetSurfacePoint`)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

  // Spine position (C# `vecGetSpineAlongLength`)
  spinePoint(lengthRatio: number): Vec3;

  // Outer surface point at (phi, lengthRatio) (C# `vecGetOuterSurfacePoint`)
  outerSurfacePoint(phi: number, lengthRatio: number): Vec3;

  // Inner surface point at (phi, lengthRatio) (C# `vecGetInnerSurfacePoint`)
  innerSurfacePoint(phi: number, lengthRatio: number): Vec3;

  // Cylindrical frames traced from a rotationally-symmetric contour (C# `aGetFramesFromContour`)
  static framesFromContour(contour: GenericContour, referenceFrame?: Frame): Frames;

// Torus ring on a local frame
BaseRing: declare class BaseRing extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  polarSteps: number

  radialSteps: number

  ringRadius: number

  radiusModulation: SurfaceModulation

  frame: Frame

  constructor

  setRadius(modulation: SurfaceModulation): void;

  setRadialSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  protected alphaRatioFromStep(step: number): number;

  protected phiRatioFromStep(step: number): number;

  // Surface point on the torus
  surfacePoint(alphaRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// C# `BaseShape` — the vertex-transformation seam every shape shares
BaseShape: declare abstract class BaseShape

  trafo: VertexTransformation

  // Point-wise transformation applied during construction (C# `SetTransformation`)
  setTransformation(trafo: VertexTransformation): void;

  abstract voxConstruct(pk: Pico): Voxels;

// Sphere on a local frame with a surface-modulated radius (C# `BaseSphere`)
BaseSphere: declare class BaseSphere extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  azimuthalSteps: number

  polarSteps: number

  radiusModulation: SurfaceModulation

  frame: Frame

  constructor

  setRadius(modulation: SurfaceModulation): void;

  // No lower clamp upstream (unlike the other shapes' step setters)
  setAzimuthalSteps(steps: number): void;

  setPolarSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  mshConstruct(pk: Pico): Mesh;

  // Surface point
  surfacePoint(phiRatio: number, thetaRatio: number, radiusRatio: number): Vec3;

// BSpline-based control point spline, open or closed ends (C# `ControlPointSpline`)
ControlPointSpline: declare class ControlPointSpline implements Spline

  constructor

  // Render with the given sample count (C# `aGetPoints`)
  points(samples?: number): Vec3[];

  // Sample dynamically at a length ratio (C# `vecGetPointAt`)
  pointAt(lengthRatio: number): Vec3;

// Step-wise cylindrical path builder (C# `CylindricalControlSpline`)
CylindricalControlSpline: declare class CylindricalControlSpline implements Spline

  constructor

  // Append a step relative to the last position (C# `AddRelativeStep`)
  addRelativeStep(direction: CylindricalDirection, stepLength: number): void;

  // Append a step to an absolute radius or z (C# `AddAbsoluteStep`
  addAbsoluteStep(direction: Exclude<CylindricalDirection, 'tangential'>, newValue: number): void;

  points(samples?: number): Vec3[];

// Bundles a normalized line modulation with a physical length (C# `Distribution`)
Distribution: declare class Distribution

  totalLength: number

  modulation: LineModulation

  constructor

Frames: declare class Frames implements Spline

  // Extrude a const local frame along a straight line (C# `Frames(fLength, oConstLocalFrame, ...)`)
  static alongLine(length: number, constFrame: Frame, reparametrisationSpacing?: number): Frames;

  // Extrude a const local frame along a spline (C# `Frames(aPoints, oConstLocalFrame, ...)`)
  static alongSpline(points: readonly Vec3[], constFrame: Frame, reparametrisationSpacing?: number): Frames;

  // Tangential Z along the spline, X aligned to a const target direction, then NURBS post-smoothing (C# `Frames(aPoints, vecTargetX, ...)`)
  static withTargetX(points: readonly Vec3[], targetX: Vec3, reparametrisationSpacing?: number): Frames;

  // Tangential Z along the spline, X from a coordinate-system-dependent target — incl
  static ofType(points: readonly Vec3[], frameType: FrameType, reparametrisationSpacing?: number): Frames;

  // Transform all points and axes onto a frame's coordinate system, in place (C# `ApplyToFrame`)
  applyToFrame(f: Frame): void;

  // Best in-plane direction matching the target
  static alignWithTargetX(localZ: Vec3, targetX: Vec3): Vec3;

  // The alignment target per frame type (C# `vecGetTargetX`)
  static targetXFor(pt: Vec3, frameType: FrameType): Vec3;

  // Spine position at a length ratio 0..1 (C# `vecGetSpineAlongLength`)
  spineAt(lengthRatio: number): Vec3;

  // Local X at a length ratio (C# `vecGetLocalXAlongLength`)
  localXAt(lengthRatio: number): Vec3;

  // Local Y at a length ratio (C# `vecGetLocalYAlongLength`)
  localYAt(lengthRatio: number): Vec3;

  // Local Z at a length ratio (C# `vecGetLocalZAlongLength`)
  localZAt(lengthRatio: number): Vec3;

  // The full local frame at a length ratio (C# `oGetLocalFrame`)
  frameAt(lengthRatio: number): Frame;

  // The spine points (C# `aGetPoints()`)
  points(samples?: number): Vec3[];

// A Distribution describing contours of rotationally symmetric objects (C# `GenericContour`)
GenericContour: declare class GenericContour extends Distribution

// Implicit genus-2 surface
ImplicitGenus: declare class ImplicitGenus implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Gyroid pattern with a wall-thickness ratio (C# `ImplicitGyroid`)
ImplicitGyroid: declare class ImplicitGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

  // Thickness ratio for a target wall thickness in mm (C# `fGetThicknessRatio`)
  static thicknessRatio(wallThickness: number, unitSize: number): number;

// Implicit sphere (C# `ImplicitSphere`)
ImplicitSphere: declare class ImplicitSphere implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Implicit superellipsoid (C# `ImplicitSuperEllipsoid`
ImplicitSuperEllipsoid: declare class ImplicitSuperEllipsoid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  expression: SdfExpression

  constructor

// Manifold pipe
LatticeManifold: declare class LatticeManifold extends LatticePipe

  maxPrintableRadius: number

  limitAngle: number

  extendBothSides: boolean

  constructor

  // Chained beams along the spine (C# `latConstruct`)
  latConstruct(pk: Pico): Lattice;

  // Teardrop tip via circular-segment geometry (C# `AddTip`)
  protected addTip(lattice: Lattice, pt: Vec3, beam: number, zPositive: boolean): void;

// Round pipe built from lattice beams along a frame or spine (C# `LatticePipe`)
LatticePipe: declare class LatticePipe extends BaseShape implements LatticeBaseShape, SpineBaseShape

  radiusModulation: LineModulation

  lengthSteps: number

  frames: Frames

  constructor

  setRadius(modulation: LineModulation): void;

  // No lower clamp upstream
  setLengthSteps(steps: number): void;

  voxConstruct(pk: Pico): Voxels;

  // Chained beams along the spine (C# `latConstruct`)
  latConstruct(pk: Pico): Lattice;

  // Centre-axis position along the pipe (C# `vecGetSpinePoint`)
  spinePoint(lengthRatio: number): Vec3;

  protected radius(lengthRatio: number): number;

// 1D modulation
LineModulation: declare class LineModulation

  // The constant value when built from one (C# public `m_fConstValue`)
  constValue: number

  constructor

  // From a discrete point list
  static fromPoints(points: readonly Vec3[], values: ModulationCoord, axis: ModulationCoord): LineModulation;

  // The modulation value at a 0..1 ratio (C# `fGetModulation`)
  modulation(ratio: number): number;

  // Sum of two modulations (C# `operator +`)
  add(other: LineModulation): LineModulation;

  // Difference of two modulations (C# `operator -`)
  sub(other: LineModulation): LineModulation;

  // Scaled modulation (C# `operator *`)
  scale(factor: number): LineModulation;

// Accumulates upstream-style per-triangle geometry, built through ONE bulk `createMesh` call
MeshBuilder: declare class MeshBuilder

  // Three fresh vertices + one triangle, exactly like C# `Mesh.nAddTriangle(v0, v1, v2)`
  addTriangle(a: Vec3, b: Vec3, c: Vec3): void;

  // The two-triangle quad both upstream mesh helpers and shape mantles use
  addQuad(pt1: Vec3, pt2: Vec3, pt3: Vec3, pt4: Vec3): void;

  build(pk: Pico): Mesh;

// 2D modulation over (phi, lengthRatio) (C# `SurfaceModulation`
SurfaceModulation: declare class SurfaceModulation

  constructor

  // Lift a 1D modulation
  static fromLineModulation(lineModulation: LineModulation, line?: ModulationLine): SurfaceModulation;

  // The modulation value at the given ratios (C# `fGetModulation`)
  modulation(phi: number, lengthRatio: number): number;

  // Sum of two modulations (C# `operator +`)
  add(other: SurfaceModulation): SurfaceModulation;

  // Difference of two modulations (C# `operator -`)
  sub(other: SurfaceModulation): SurfaceModulation;

  // Scaled modulation (C# `operator *`)
  scale(factor: number): SurfaceModulation;

// Cubic-feel connector between two points/frames with tangent control (C# `TangentialControlSpline`)
TangentialControlSpline: declare class TangentialControlSpline implements Spline

  constructor

  // The frame-to-frame form
  static betweenFrames(startFrame: Frame, endFrame: Frame, options?: TangentOptions): TangentialControlSpline;

  points(samples?: number): Vec3[];
