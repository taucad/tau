# libcascade — StepGeom (3)

28 top-level symbols. Signatures are verbatim typescript.

StepGeom_Direction: declare class StepGeom_Direction extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theName: TCollection_HAsciiString, theDirectionRatios: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theDirectionRatios: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;

  Init3D(theName: TCollection_HAsciiString, theDirectionRatios1: number, theDirectionRatios2: number, theDirectionRatios3: number): void;

  Init2D(theName: TCollection_HAsciiString, theDirectionRatios1: number, theDirectionRatios2: number): void;

  SetDirectionRatios(theDirectionRatios: NCollection_HArray1_double): void;
  SetDirectionRatios(theDirectionRatios: [number, number, number]): void;
  SetDirectionRatios(theDirectionRatios: NCollection_HArray1_double): void;
  SetDirectionRatios(theDirectionRatios: [number, number, number]): void;

  DirectionRatios(): [number, number, number];

  DirectionRatiosValue(theInd: number): number;

  SetNbDirectionRatios(theSize: number): void;

  NbDirectionRatios(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_ElementarySurface: declare class StepGeom_ElementarySurface extends StepGeom_Surface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

  Position(): StepGeom_Axis2Placement3d;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Ellipse: declare class StepGeom_Ellipse extends StepGeom_Conic

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis1: number, aSemiAxis2: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis1: number, aSemiAxis2: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis1: number, aSemiAxis2: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSemiAxis1(aSemiAxis1: number): void;

  SemiAxis1(): number;

  SetSemiAxis2(aSemiAxis2: number): void;

  SemiAxis2(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_EvaluatedDegeneratePcurve: declare class StepGeom_EvaluatedDegeneratePcurve extends StepGeom_DegeneratePcurve

  constructor

  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation, aEquivalentPoint: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation, aEquivalentPoint: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation, aEquivalentPoint: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  SetEquivalentPoint(aEquivalentPoint: StepGeom_CartesianPoint): void;

  EquivalentPoint(): StepGeom_CartesianPoint;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx: declare class StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationCtx: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedCtx: StepRepr_GlobalUnitAssignedContext, aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit, anUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationCtx: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedCtx: StepRepr_GlobalUnitAssignedContext, aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit, anUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationCtx: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedCtx: StepRepr_GlobalUnitAssignedContext, aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit, anUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  SetGlobalUnitAssignedContext(aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;

  GlobalUnitAssignedContext(): StepRepr_GlobalUnitAssignedContext;

  SetGlobalUncertaintyAssignedContext(aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;

  GlobalUncertaintyAssignedContext(): StepRepr_GlobalUncertaintyAssignedContext;

  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  CoordinateSpaceDimension(): number;

  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  UnitsValue(num: number): StepBasic_NamedUnit;

  NbUnits(): number;

  SetUncertainty(aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;

  Uncertainty(): NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit;

  UncertaintyValue(num: number): StepBasic_UncertaintyMeasureWithUnit;

  NbUncertainty(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContext: declare class StepGeom_GeometricRepresentationContext extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  CoordinateSpaceDimension(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext: declare class StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  SetGlobalUnitAssignedContext(aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;

  GlobalUnitAssignedContext(): StepRepr_GlobalUnitAssignedContext;

  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  CoordinateSpaceDimension(): number;

  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  UnitsValue(num: number): StepBasic_NamedUnit;

  NbUnits(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContextAndParametricRepresentationContext: declare class StepGeom_GeometricRepresentationContextAndParametricRepresentationContext extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  SetParametricRepresentationContext(aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;

  ParametricRepresentationContext(): StepRepr_ParametricRepresentationContext;

  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  CoordinateSpaceDimension(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationItem: declare class StepGeom_GeometricRepresentationItem extends StepRepr_RepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Hyperbola: declare class StepGeom_Hyperbola extends StepGeom_Conic

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis: number, aSemiImagAxis: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis: number, aSemiImagAxis: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis: number, aSemiImagAxis: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSemiAxis(aSemiAxis: number): void;

  SemiAxis(): number;

  SetSemiImagAxis(aSemiImagAxis: number): void;

  SemiImagAxis(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_IntersectionCurve: declare class StepGeom_IntersectionCurve extends StepGeom_SurfaceCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_KnotType: typeof StepGeom_KnotType[keyof typeof StepGeom_KnotType]

StepGeom_Line: declare class StepGeom_Line extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aPnt: StepGeom_CartesianPoint, aDir: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPnt: StepGeom_CartesianPoint, aDir: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPnt(aPnt: StepGeom_CartesianPoint): void;

  Pnt(): StepGeom_CartesianPoint;

  SetDir(aDir: StepGeom_Vector): void;

  Dir(): StepGeom_Vector;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_OffsetCurve3d: declare class StepGeom_OffsetCurve3d extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aDistance: number, aSelfIntersect: StepData_Logical, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aDistance: number, aSelfIntersect: StepData_Logical, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  BasisCurve(): StepGeom_Curve;

  SetDistance(aDistance: number): void;

  Distance(): number;

  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  SelfIntersect(): StepData_Logical;

  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  RefDirection(): StepGeom_Direction;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_OffsetSurface: declare class StepGeom_OffsetSurface extends StepGeom_Surface

  constructor

  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aDistance: number, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aDistance: number, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  BasisSurface(): StepGeom_Surface;

  SetDistance(aDistance: number): void;

  Distance(): number;

  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  SelfIntersect(): StepData_Logical;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_OrientedSurface: declare class StepGeom_OrientedSurface extends StepGeom_Surface

  constructor

  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  Orientation(): boolean;

  SetOrientation(Orientation: boolean): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_OuterBoundaryCurve: declare class StepGeom_OuterBoundaryCurve extends StepGeom_BoundaryCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Parabola: declare class StepGeom_Parabola extends StepGeom_Conic

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aFocalDist: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aFocalDist: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aFocalDist: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  SetFocalDist(aFocalDist: number): void;

  FocalDist(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Pcurve: declare class StepGeom_Pcurve extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  BasisSurface(): StepGeom_Surface;

  SetReferenceToCurve(aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;

  ReferenceToCurve(): StepRepr_DefinitionalRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_PcurveOrSurface: declare class StepGeom_PcurveOrSurface extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Pcurve(): StepGeom_Pcurve;

  Surface(): StepGeom_Surface;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Placement: declare class StepGeom_Placement extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetLocation(aLocation: StepGeom_CartesianPoint): void;

  Location(): StepGeom_CartesianPoint;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Plane: declare class StepGeom_Plane extends StepGeom_ElementarySurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Point: declare class StepGeom_Point extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_PointOnCurve: declare class StepGeom_PointOnCurve extends StepGeom_Point

  constructor

  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aPointParameter: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aPointParameter: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  BasisCurve(): StepGeom_Curve;

  SetPointParameter(aPointParameter: number): void;

  PointParameter(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_PointOnSurface: declare class StepGeom_PointOnSurface extends StepGeom_Point

  constructor

  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aPointParameterU: number, aPointParameterV: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aPointParameterU: number, aPointParameterV: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  BasisSurface(): StepGeom_Surface;

  SetPointParameterU(aPointParameterU: number): void;

  PointParameterU(): number;

  SetPointParameterV(aPointParameterV: number): void;

  PointParameterV(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_PointReplica: declare class StepGeom_PointReplica extends StepGeom_Point

  constructor

  Init(aName: TCollection_HAsciiString, aParentPt: StepGeom_Point, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aParentPt: StepGeom_Point, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;

  SetParentPt(aParentPt: StepGeom_Point): void;

  ParentPt(): StepGeom_Point;

  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator): void;

  Transformation(): StepGeom_CartesianTransformationOperator;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Polyline: declare class StepGeom_Polyline extends StepGeom_BoundedCurve

  constructor

  Init(aName: TCollection_HAsciiString, aPoints: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPoints: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPoints(aPoints: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  Points(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  PointsValue(num: number): StepGeom_CartesianPoint;

  NbPoints(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_PreferredSurfaceCurveRepresentation: typeof StepGeom_PreferredSurfaceCurveRepresentation[keyof typeof StepGeom_PreferredSurfaceCurveRepresentation]
