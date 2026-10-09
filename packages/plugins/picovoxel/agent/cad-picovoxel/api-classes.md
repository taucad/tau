# picovoxel — Classes

57 top-level symbols. Signatures are verbatim typescript.

PicoError: declare class PicoError extends Error

  code: PicoErrorCode

  // PicoError.constructor (constructor)
  constructor(code: PicoErrorCode, message: string, options?: ErrorOptions);

// Body-centred lattice
BodyCentreLattice: declare class BodyCentreLattice implements LatticeType

  // BodyCentreLattice.addCell (method)
  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Thickness from the distance to the bounding voxel surface
BoundaryBeamThickness: declare class BoundaryBeamThickness implements BeamThickness

  // BoundaryBeamThickness.constructor (constructor)
  constructor(minThickness: number, maxThickness: number);

  // BoundaryBeamThickness.beamThickness (method)
  beamThickness(pt: Vec3): number;

  // BoundaryBeamThickness.updateCell (method)
  updateCell(_cell: UnitCell): void;

  // BoundaryBeamThickness.setBoundingVoxels (method)
  setBoundingVoxels(voxels: Voxels): void;

// Thickness from the point's position within the current unit cell
CellBasedBeamThickness: declare class CellBasedBeamThickness implements BeamThickness

  // CellBasedBeamThickness.constructor (constructor)
  constructor(minThickness: number, maxThickness: number);

  // CellBasedBeamThickness.updateCell (method)
  updateCell(cell: UnitCell): void;

  // CellBasedBeamThickness.beamThickness (method)
  beamThickness(pt: Vec3): number;

  // CellBasedBeamThickness.setBoundingVoxels (method)
  setBoundingVoxels(_voxels: Voxels): void;

// Sequential composition of trafos
CombinedTrafo: declare class CombinedTrafo implements CoordinateTrafo

  // CombinedTrafo.constructor (constructor)
  constructor(trafos: readonly CoordinateTrafo[]);

  // CombinedTrafo.apply (method)
  apply(pt: Vec3): Vec3;

// Regular grid cell array conformal to a BaseBox, BaseLens or BasePipeSegment
ConformalCellArray: declare class ConformalCellArray implements CellArray

  // ConformalCellArray.constructor (constructor)
  constructor(shape: BaseBox | BaseLens | BasePipeSegment, numberInX: number, numberInY: number, numberInZ: number);

  // ConformalCellArray.unitCells (method)
  unitCells(): readonly UnitCell[];

// Constant thickness, independent of cell or boundary (C# `ConstantBeamThickness`)
ConstantBeamThickness: declare class ConstantBeamThickness implements BeamThickness

  // ConstantBeamThickness.constructor (constructor)
  constructor(thickness: number);

  // ConstantBeamThickness.beamThickness (method)
  beamThickness(_pt: Vec3): number;

  // ConstantBeamThickness.updateCell (method)
  updateCell(_cell: UnitCell): void;

  // ConstantBeamThickness.setBoundingVoxels (method)
  setBoundingVoxels(_voxels: Voxels): void;

// Simple unit cell with 8 corner points in the shape of a cuboid
CuboidCell: declare class CuboidCell implements UnitCell

  // CuboidCell.constructor (constructor)
  constructor(corners: readonly [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]);

  // CuboidCell.cornerPoints (method)
  cornerPoints(): readonly Vec3[];

  // CuboidCell.cellCentre (method)
  cellCentre(): Vec3;

  // CuboidCell.cellBounding (method)
  cellBounding(): Bounds;

// Complement of the full wall (C# `FullVoidLogic`)
FullVoidLogic: declare class FullVoidLogic implements SplittingLogic

  // FullVoidLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Wall on both sides of the zero surface (C# `FullWallLogic`)
FullWallLogic: declare class FullWallLogic implements SplittingLogic

  // FullWallLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Z-dependent scale ramp 20→5 over z 0..50
FunctionalScaleTrafo: declare class FunctionalScaleTrafo implements CoordinateTrafo

  // FunctionalScaleTrafo.apply (method)
  apply(pt: Vec3): Vec3;

// Thickness from a global function of the point — upstream hard-codes a ramp over x
GlobalFuncBeamThickness: declare class GlobalFuncBeamThickness implements BeamThickness

  // GlobalFuncBeamThickness.constructor (constructor)
  constructor(minThickness: number, maxThickness: number);

  // GlobalFuncBeamThickness.beamThickness (method)
  beamThickness(pt: Vec3): number;

  // GlobalFuncBeamThickness.updateCell (method)
  updateCell(_cell: UnitCell): void;

  // GlobalFuncBeamThickness.setBoundingVoxels (method)
  setBoundingVoxels(_voxels: Voxels): void;

// Implicit lidinoid
ImplicitLidinoid: declare class ImplicitLidinoid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitLidinoid.constructor (constructor)
  constructor(unitSize: number, wallThickness: number);

// Modular implicit
ImplicitModular: declare class ImplicitModular

  readonly sdf: SdfFunction

  // ImplicitModular.constructor (constructor)
  constructor(pattern: RawTpmsPattern, wallThickness: BeamThickness, trafo: CoordinateTrafo, splittingLogic: SplittingLogic);

// Gyroid unwrapped around the Z axis
ImplicitRadialGyroid: declare class ImplicitRadialGyroid

  readonly sdf: SdfFunction

  // ImplicitRadialGyroid.constructor (constructor)
  constructor(unitsPerRound: number, unitSizeInZ: number, wallThickness: number);

// Schwarz primitive over a randomly deformed grid
ImplicitRandomizedSchwarzPrimitive: declare class ImplicitRandomizedSchwarzPrimitive

  readonly sdf: SdfFunction

  // ImplicitRandomizedSchwarzPrimitive.constructor (constructor)
  constructor(unitSize: number, wallThickness: number, field: RandomDeformationField);

// Implicit Schwarz diamond
ImplicitSchwarzDiamond: declare class ImplicitSchwarzDiamond implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSchwarzDiamond.constructor (constructor)
  constructor(unitSize: number, wallThickness: number);

// Implicit Schwarz primitive (C# `ImplicitSchwarzPrimitive`)
ImplicitSchwarzPrimitive: declare class ImplicitSchwarzPrimitive implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSchwarzPrimitive.constructor (constructor)
  constructor(unitSize: number, wallThickness: number);

// One side of the gyroid surface as a void, shrunk by the half wall
ImplicitSplitVoidGyroid: declare class ImplicitSplitVoidGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSplitVoidGyroid.constructor (constructor)
  constructor(unitSize: number, wallThickness: number, side: boolean);

// Gyroid wall on one side of the surface, solid on the other
ImplicitSplitWallGyroid: declare class ImplicitSplitWallGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSplitWallGyroid.constructor (constructor)
  constructor(unitSize: number, wallThickness: number, side: boolean);

// Wall only on the negative side (C# `NegativeHalfWallLogic`)
NegativeHalfWallLogic: declare class NegativeHalfWallLogic implements SplittingLogic

  // NegativeHalfWallLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Negative-side volume shrunk by the half wall (C# `NegativeVoidLogic`)
NegativeVoidLogic: declare class NegativeVoidLogic implements SplittingLogic

  // NegativeVoidLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Octahedron lattice
OctahedronLattice: declare class OctahedronLattice implements LatticeType

  // OctahedronLattice.addCell (method)
  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, subSamples?: number): void;

// Wall only on the positive side (C# `PositiveHalfWallLogic`)
PositiveHalfWallLogic: declare class PositiveHalfWallLogic implements SplittingLogic

  // PositiveHalfWallLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Positive-side volume shrunk by the half wall (C# `PositiveVoidLogic`)
PositiveVoidLogic: declare class PositiveVoidLogic implements SplittingLogic

  // PositiveVoidLogic.advancedSignedDistance (method)
  advancedSignedDistance(signedDistance: number, wallThickness: number): number;

// Cylindrical unwrap
RadialTrafo: declare class RadialTrafo implements CoordinateTrafo

  // RadialTrafo.constructor (constructor)
  constructor(samplesPerRound: number, phiPerZ: number);

  // RadialTrafo.apply (method)
  apply(pt: Vec3): Vec3;

// Regular cuboid 3D grid with a random 3D value at each grid point and tri-linear spatial interpolation for 3D modulations (C# `RandomDeformationField`)
RandomDeformationField: declare class RandomDeformationField

  // RandomDeformationField.constructor (constructor)
  constructor(bounds: Bounds, resolution: number, minValue: number, maxValue: number, random: RandomSource);

  // Tri-linear interpolation of the noise grid at the point, clamped to the bounding box (C# `vecGetData`
  // RandomDeformationField.dataAt (method)
  dataAt(pt: Vec3): Vec3;

// Custom lattice type connecting random corners of a cell through a noisy NURBS midpoint
RandomSplineLattice: declare class RandomSplineLattice implements LatticeType

  // RandomSplineLattice.constructor (constructor)
  constructor(random: RandomSource, passes?: number);

  // RandomSplineLattice.addCell (method)
  addCell(lattice: Lattice, cell: UnitCell, beamThickness: BeamThickness, _subSamples?: number): void;

// C# `RawGyroidTPMSPattern`
RawGyroidTpmsPattern: declare class RawGyroidTpmsPattern implements RawTpmsPattern

  // RawGyroidTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// C# `RawLidinoidTPMSPattern`
RawLidinoidTpmsPattern: declare class RawLidinoidTpmsPattern implements RawTpmsPattern

  // RawLidinoidTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// C# `RawSchwarzDiamondTPMSPattern`
RawSchwarzDiamondTpmsPattern: declare class RawSchwarzDiamondTpmsPattern implements RawTpmsPattern

  // RawSchwarzDiamondTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// C# `RawSchwarzPrimitiveTPMSPattern`
RawSchwarzPrimitiveTpmsPattern: declare class RawSchwarzPrimitiveTpmsPattern implements RawTpmsPattern

  // RawSchwarzPrimitiveTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// Schwarz diamond blending into Schwarz primitive over x in -2..3 (C# `RawTransitionTPMSPattern`)
RawTransitionTpmsPattern: declare class RawTransitionTpmsPattern implements RawTpmsPattern

  // RawTransitionTpmsPattern.signedDistance (method)
  signedDistance(x: number, y: number, z: number): number;

// Regular grid cell array housing the bounding box of the voxel field, with customised x/y/z unit-cell dimensions
RegularCellArray: declare class RegularCellArray implements CellArray

  // RegularCellArray.constructor (constructor)
  constructor(voxels: Voxels, dx: number, dy: number, dz: number, noiseLevel?: number);

  // RegularCellArray.unitCells (method)
  unitCells(): readonly UnitCell[];

// A grid of exactly one unit cell, centred in XY and based at z = 0 (C# `RegularUnitCell`)
RegularUnitCell: declare class RegularUnitCell implements CellArray

  // RegularUnitCell.constructor (constructor)
  constructor(dx: number, dy: number, dz: number, noiseLevel?: number);

  // RegularUnitCell.unitCells (method)
  unitCells(): readonly UnitCell[];

// Per-axis division by the unit sizes (C# `ScaleTrafo`)
ScaleTrafo: declare class ScaleTrafo implements CoordinateTrafo

  // ScaleTrafo.constructor (constructor)
  constructor(unitX: number, unitY: number, unitZ: number);

  // ScaleTrafo.apply (method)
  apply(pt: Vec3): Vec3;

// Box along a straight frame or spine with width/depth line modulations (C# `BaseBox`)
BaseBox: declare class BaseBox extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  widthSteps: number

  depthSteps: number

  widthModulation: LineModulation

  depthModulation: LineModulation

  frames: Frames

  // BaseBox.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, a?: number, b?: number, c?: number);

  // From a bounding box
  // BaseBox.fromBounds (method)
  static fromBounds(bounds: Bounds): BaseBox;

  // C# `SetWidth` — modulated width bumps width+length sampling to 500
  // BaseBox.setWidth (method)
  setWidth(modulation: LineModulation): void;

  // C# `SetDepth` — modulated depth bumps depth+length sampling to 500
  // BaseBox.setDepth (method)
  setDepth(modulation: LineModulation): void;

  // BaseBox.setWidthSteps (method)
  setWidthSteps(steps: number): void;

  // BaseBox.setDepthSteps (method)
  setDepthSteps(steps: number): void;

  // BaseBox.setLengthSteps (method)
  setLengthSteps(steps: number): void;

  // BaseBox.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseBox.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // BaseBox.depthRatioFromStep (method)
  protected depthRatioFromStep(step: number): number;

  // BaseBox.widthRatioFromStep (method)
  protected widthRatioFromStep(step: number): number;

  // BaseBox.lengthRatioFromStep (method)
  protected lengthRatioFromStep(step: number): number;

  // Surface point
  // BaseBox.surfacePoint (method)
  surfacePoint(widthRatio: number, depthRatio: number, lengthRatio: number): Vec3;

// Cone
BaseCone: declare class BaseCone extends BaseShape

  readonly cylinder: BaseCylinder

  // BaseCone.constructor (constructor)
  constructor(frame: Frame, length: number, startRadius: number, endRadius: number);

  // BaseCone.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // The underlying cylinder (C# `oGetBaseCylinder`)
  // BaseCone.baseCylinder (method)
  baseCylinder(): BaseCylinder;

// Cylinder along a straight frame or a spine, with a surface-modulated radius (C# `BaseCylinder`)
BaseCylinder: declare class BaseCylinder extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  radiusModulation: SurfaceModulation

  frames: Frames

  // BaseCylinder.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, lengthOrRadius?: number, radius?: number);

  // C# `SetRadius` — modulated radii bump the length sampling to 500
  // BaseCylinder.setRadius (method)
  setRadius(modulation: SurfaceModulation): void;

  // BaseCylinder.setRadialSteps (method)
  setRadialSteps(steps: number): void;

  // BaseCylinder.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BaseCylinder.setLengthSteps (method)
  setLengthSteps(steps: number): void;

  // BaseCylinder.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseCylinder.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // Top disc at full length (C# `AddTopSurface`)
  // BaseCylinder.addTopSurface (method)
  protected addTopSurface(builder: MeshBuilder): void;

  // Bottom disc, wound the other way (C# `AddBottomSurface`)
  // BaseCylinder.addBottomSurface (method)
  protected addBottomSurface(builder: MeshBuilder): void;

  // Outer mantle across phi and length (C# `AddOuterMantle`)
  // BaseCylinder.addOuterMantle (method)
  protected addOuterMantle(builder: MeshBuilder): void;

  // BaseCylinder.radiusRatioFromStep (method)
  protected radiusRatioFromStep(step: number): number;

  // BaseCylinder.phiRatioFromStep (method)
  protected phiRatioFromStep(step: number): number;

  // BaseCylinder.lengthRatioFromStep (method)
  protected lengthRatioFromStep(step: number): number;

  // Surface point at (lengthRatio, phiRatio, radiusRatio), all 0..1 (C# `vecGetSurfacePoint`)
  // BaseCylinder.surfacePoint (method)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Lens/washer
BaseLens: declare class BaseLens extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  radialSteps: number

  polarSteps: number

  heightSteps: number

  readonly innerRadius: number

  readonly outerRadius: number

  upperModulation: SurfaceModulation

  lowerModulation: SurfaceModulation

  readonly frame: Frame

  // BaseLens.constructor (constructor)
  constructor(frame: Frame, height: number, innerRadius: number, outerRadius: number);

  // C# `SetHeight` — modulated faces bump radial sampling to 500
  // BaseLens.setHeight (method)
  setHeight(lowerModulation: SurfaceModulation, upperModulation: SurfaceModulation): void;

  // BaseLens.setRadialSteps (method)
  setRadialSteps(steps: number): void;

  // BaseLens.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BaseLens.setHeightSteps (method)
  setHeightSteps(steps: number): void;

  // BaseLens.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseLens.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // BaseLens.radiusRatioFromStep (method)
  protected radiusRatioFromStep(step: number): number;

  // BaseLens.phiRatioFromStep (method)
  protected phiRatioFromStep(step: number): number;

  // BaseLens.heightRatioFromStep (method)
  protected heightRatioFromStep(step: number): number;

  // Surface point (C# `vecGetSurfacePoint`
  // BaseLens.surfacePoint (method)
  surfacePoint(heightRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Pipe (annular cylinder) along a straight frame or spine (C# `BasePipe`)
BasePipe: declare class BasePipe extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  outerRadiusModulation: SurfaceModulation

  innerRadiusModulation: SurfaceModulation

  frames: Frames

  // BasePipe.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, a?: number, b?: number, c?: number);

  // C# `SetRadius(inner, outer)` — bumps length sampling to 500
  // BasePipe.setRadius (method)
  setRadius(innerRadius: SurfaceModulation, outerRadius: SurfaceModulation): void;

  // BasePipe.setRadialSteps (method)
  setRadialSteps(steps: number): void;

  // BasePipe.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BasePipe.setLengthSteps (method)
  setLengthSteps(steps: number): void;

  // BasePipe.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BasePipe.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // BasePipe.addTopSurface (method)
  protected addTopSurface(builder: MeshBuilder, flip?: boolean): void;

  // BasePipe.addBottomSurface (method)
  protected addBottomSurface(builder: MeshBuilder, flip?: boolean): void;

  // BasePipe.addOuterMantle (method)
  protected addOuterMantle(builder: MeshBuilder, flip?: boolean): void;

  // BasePipe.addInnerMantle (method)
  protected addInnerMantle(builder: MeshBuilder, flip?: boolean): void;

  // BasePipe.radiusRatioFromStep (method)
  protected radiusRatioFromStep(step: number): number;

  // BasePipe.phiRatioFromStep (method)
  protected phiRatioFromStep(step: number): number;

  // BasePipe.lengthRatioFromStep (method)
  protected lengthRatioFromStep(step: number): number;

  // Spine point and local axes at a length ratio
  // BasePipe.axesAt (method)
  protected axesAt(lengthRatio: number): PipeAxes;

  // Surface point
  // BasePipe.surfacePoint (method)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Angular pipe segment
BasePipeSegment: declare class BasePipeSegment extends BasePipe

  readonly rangeModulation: LineModulation

  readonly midModulation: LineModulation

  // BasePipeSegment.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, options: PipeSegmentOptions);

  // BasePipeSegment.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // Phi spans mid ± range/2 at the length ratio (C# override)
  // BasePipeSegment.surfacePoint (method)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// Revolves a spine cross-section about the reference frame's Z axis (C# `BaseRevolve`)
BaseRevolve: declare class BaseRevolve extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  lengthSteps: number

  polarSteps: number

  radialSteps: number

  readonly frames: Frames

  readonly frame: Frame

  outerRadiusModulation: LineModulation

  innerRadiusModulation: LineModulation

  // BaseRevolve.constructor (constructor)
  constructor(referenceFrame: Frame, frames: Frames, inwardRadius?: number, outwardRadius?: number);

  // BaseRevolve.setRadius (method)
  setRadius(innerRadius: LineModulation, outerRadius: LineModulation): void;

  // BaseRevolve.setRadialSteps (method)
  setRadialSteps(steps: number): void;

  // BaseRevolve.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BaseRevolve.setLengthSteps (method)
  setLengthSteps(steps: number): void;

  // BaseRevolve.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseRevolve.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // BaseRevolve.radiusRatioFromStep (method)
  protected radiusRatioFromStep(step: number): number;

  // BaseRevolve.phiRatioFromStep (method)
  protected phiRatioFromStep(step: number): number;

  // BaseRevolve.lengthRatioFromStep (method)
  protected lengthRatioFromStep(step: number): number;

  // Spine offset along local X, revolved about the reference frame's Z axis (C# `vecGetSurfacePoint`)
  // BaseRevolve.surfacePoint (method)
  surfacePoint(lengthRatio: number, phiRatio: number, radiusRatio: number): Vec3;

  // Spine position (C# `vecGetSpineAlongLength`)
  // BaseRevolve.spinePoint (method)
  spinePoint(lengthRatio: number): Vec3;

  // Outer surface point at (phi, lengthRatio) (C# `vecGetOuterSurfacePoint`)
  // BaseRevolve.outerSurfacePoint (method)
  outerSurfacePoint(phi: number, lengthRatio: number): Vec3;

  // Inner surface point at (phi, lengthRatio) (C# `vecGetInnerSurfacePoint`)
  // BaseRevolve.innerSurfacePoint (method)
  innerSurfacePoint(phi: number, lengthRatio: number): Vec3;

  // Cylindrical frames traced from a rotationally-symmetric contour (C# `aGetFramesFromContour`)
  // BaseRevolve.framesFromContour (method)
  static framesFromContour(contour: GenericContour, referenceFrame?: Frame): Frames;

// Torus ring on a local frame
BaseRing: declare class BaseRing extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  polarSteps: number

  radialSteps: number

  readonly ringRadius: number

  radiusModulation: SurfaceModulation

  readonly frame: Frame

  // BaseRing.constructor (constructor)
  constructor(frame: Frame, ringRadius?: number, radius?: number);

  // BaseRing.setRadius (method)
  setRadius(modulation: SurfaceModulation): void;

  // BaseRing.setRadialSteps (method)
  setRadialSteps(steps: number): void;

  // BaseRing.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BaseRing.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseRing.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // BaseRing.alphaRatioFromStep (method)
  protected alphaRatioFromStep(step: number): number;

  // BaseRing.phiRatioFromStep (method)
  protected phiRatioFromStep(step: number): number;

  // Surface point on the torus
  // BaseRing.surfacePoint (method)
  surfacePoint(alphaRatio: number, phiRatio: number, radiusRatio: number): Vec3;

// C# `BaseShape` — the vertex-transformation seam every shape shares
BaseShape: declare abstract class BaseShape

  trafo: VertexTransformation

  // Point-wise transformation applied during construction (C# `SetTransformation`)
  // BaseShape.setTransformation (method)
  setTransformation(trafo: VertexTransformation): void;

  // BaseShape.voxConstruct (method)
  abstract voxConstruct(pk: Pico): Voxels;

// Sphere on a local frame with a surface-modulated radius (C# `BaseSphere`)
BaseSphere: declare class BaseSphere extends BaseShape implements MeshBaseShape, SurfaceBaseShape

  azimuthalSteps: number

  polarSteps: number

  radiusModulation: SurfaceModulation

  readonly frame: Frame

  // BaseSphere.constructor (constructor)
  constructor(frame: Frame, radius?: number);

  // BaseSphere.setRadius (method)
  setRadius(modulation: SurfaceModulation): void;

  // No lower clamp upstream (unlike the other shapes' step setters)
  // BaseSphere.setAzimuthalSteps (method)
  setAzimuthalSteps(steps: number): void;

  // BaseSphere.setPolarSteps (method)
  setPolarSteps(steps: number): void;

  // BaseSphere.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // BaseSphere.mshConstruct (method)
  mshConstruct(pk: Pico): Mesh;

  // Surface point
  // BaseSphere.surfacePoint (method)
  surfacePoint(phiRatio: number, thetaRatio: number, radiusRatio: number): Vec3;

// BSpline-based control point spline, open or closed ends (C# `ControlPointSpline`)
ControlPointSpline: declare class ControlPointSpline implements Spline

  // ControlPointSpline.constructor (constructor)
  constructor(controlPoints: readonly Vec3[], degree?: number, ends?: SplineEnds);

  // Render with the given sample count (C# `aGetPoints`)
  // ControlPointSpline.points (method)
  points(samples?: number): Vec3[];

  // Sample dynamically at a length ratio (C# `vecGetPointAt`)
  // ControlPointSpline.pointAt (method)
  pointAt(lengthRatio: number): Vec3;

// Step-wise cylindrical path builder (C# `CylindricalControlSpline`)
CylindricalControlSpline: declare class CylindricalControlSpline implements Spline

  // CylindricalControlSpline.constructor (constructor)
  constructor(start: Vec3);

  // Append a step relative to the last position (C# `AddRelativeStep`)
  // CylindricalControlSpline.addRelativeStep (method)
  addRelativeStep(direction: CylindricalDirection, stepLength: number): void;

  // Append a step to an absolute radius or z (C# `AddAbsoluteStep`
  // CylindricalControlSpline.addAbsoluteStep (method)
  addAbsoluteStep(direction: Exclude<CylindricalDirection, 'tangential'>, newValue: number): void;

  // CylindricalControlSpline.points (method)
  points(samples?: number): Vec3[];

// Bundles a normalized line modulation with a physical length (C# `Distribution`)
Distribution: declare class Distribution

  readonly totalLength: number

  readonly modulation: LineModulation

  // Distribution.constructor (constructor)
  constructor(totalLength: number, modulation: LineModulation);

Frames: declare class Frames implements Spline

  // Extrude a const local frame along a straight line (C# `Frames(fLength, oConstLocalFrame, ...)`)
  // Frames.alongLine (method)
  static alongLine(length: number, constFrame: Frame, reparametrisationSpacing?: number): Frames;

  // Extrude a const local frame along a spline (C# `Frames(aPoints, oConstLocalFrame, ...)`)
  // Frames.alongSpline (method)
  static alongSpline(points: readonly Vec3[], constFrame: Frame, reparametrisationSpacing?: number): Frames;

  // Tangential Z along the spline, X aligned to a const target direction, then NURBS post-smoothing (C# `Frames(aPoints, vecTargetX, ...)`)
  // Frames.withTargetX (method)
  static withTargetX(points: readonly Vec3[], targetX: Vec3, reparametrisationSpacing?: number): Frames;

  // Tangential Z along the spline, X from a coordinate-system-dependent target — incl
  // Frames.ofType (method)
  static ofType(points: readonly Vec3[], frameType: FrameType, reparametrisationSpacing?: number): Frames;

  // Transform all points and axes onto a frame's coordinate system, in place (C# `ApplyToFrame`)
  // Frames.applyToFrame (method)
  applyToFrame(f: Frame): void;

  // Best in-plane direction matching the target
  // Frames.alignWithTargetX (method)
  static alignWithTargetX(localZ: Vec3, targetX: Vec3): Vec3;

  // The alignment target per frame type (C# `vecGetTargetX`)
  // Frames.targetXFor (method)
  static targetXFor(pt: Vec3, frameType: FrameType): Vec3;

  // Spine position at a length ratio 0..1 (C# `vecGetSpineAlongLength`)
  // Frames.spineAt (method)
  spineAt(lengthRatio: number): Vec3;

  // Local X at a length ratio (C# `vecGetLocalXAlongLength`)
  // Frames.localXAt (method)
  localXAt(lengthRatio: number): Vec3;

  // Local Y at a length ratio (C# `vecGetLocalYAlongLength`)
  // Frames.localYAt (method)
  localYAt(lengthRatio: number): Vec3;

  // Local Z at a length ratio (C# `vecGetLocalZAlongLength`)
  // Frames.localZAt (method)
  localZAt(lengthRatio: number): Vec3;

  // The full local frame at a length ratio (C# `oGetLocalFrame`)
  // Frames.frameAt (method)
  frameAt(lengthRatio: number): Frame;

  // The spine points (C# `aGetPoints()`)
  // Frames.points (method)
  points(samples?: number): Vec3[];

// A Distribution describing contours of rotationally symmetric objects (C# `GenericContour`)
GenericContour: declare class GenericContour extends Distribution

// Implicit genus-2 surface
ImplicitGenus: declare class ImplicitGenus implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitGenus.constructor (constructor)
  constructor(gap: number);

// Gyroid pattern with a wall-thickness ratio (C# `ImplicitGyroid`)
ImplicitGyroid: declare class ImplicitGyroid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitGyroid.constructor (constructor)
  constructor(unitSize: number, thicknessRatio: number);

  // Thickness ratio for a target wall thickness in mm (C# `fGetThicknessRatio`)
  // ImplicitGyroid.thicknessRatio (method)
  static thicknessRatio(wallThickness: number, unitSize: number): number;

// Implicit sphere (C# `ImplicitSphere`)
ImplicitSphere: declare class ImplicitSphere implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSphere.constructor (constructor)
  constructor(centre: Vec3, radius: number);

// Implicit superellipsoid (C# `ImplicitSuperEllipsoid`
ImplicitSuperEllipsoid: declare class ImplicitSuperEllipsoid implements Implicit

  // C# `IImplicit.fSignedDistance` as a picovoxel SdfFunction
  readonly sdf: SdfFunction

  // The same field as a tape expression for the parallel fill
  readonly expression: SdfExpression

  // ImplicitSuperEllipsoid.constructor (constructor)
  constructor(centre: Vec3, ax: number, ay: number, az: number, epsilon1: number, epsilon2: number);

// Manifold pipe
LatticeManifold: declare class LatticeManifold extends LatticePipe

  readonly maxPrintableRadius: number

  readonly limitAngle: number

  readonly extendBothSides: boolean

  // LatticeManifold.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, options?: LatticeManifoldOptions);

  // Chained beams along the spine (C# `latConstruct`)
  // LatticeManifold.latConstruct (method)
  latConstruct(pk: Pico): Lattice;

  // Teardrop tip via circular-segment geometry (C# `AddTip`)
  // LatticeManifold.addTip (method)
  protected addTip(lattice: Lattice, pt: Vec3, beam: number, zPositive: boolean): void;

// Round pipe built from lattice beams along a frame or spine (C# `LatticePipe`)
LatticePipe: declare class LatticePipe extends BaseShape implements LatticeBaseShape, SpineBaseShape

  radiusModulation: LineModulation

  lengthSteps: number

  frames: Frames

  // LatticePipe.constructor (constructor)
  constructor(frameOrFrames: Frame | Frames, lengthOrRadius?: number, radius?: number);

  // LatticePipe.setRadius (method)
  setRadius(modulation: LineModulation): void;

  // No lower clamp upstream
  // LatticePipe.setLengthSteps (method)
  setLengthSteps(steps: number): void;

  // LatticePipe.voxConstruct (method)
  voxConstruct(pk: Pico): Voxels;

  // Chained beams along the spine (C# `latConstruct`)
  // LatticePipe.latConstruct (method)
  latConstruct(pk: Pico): Lattice;

  // Centre-axis position along the pipe (C# `vecGetSpinePoint`)
  // LatticePipe.spinePoint (method)
  spinePoint(lengthRatio: number): Vec3;

  // LatticePipe.radius (method)
  protected radius(lengthRatio: number): number;
