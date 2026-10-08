# libcascade — StepGeom (2)

36 top-level symbols. Signatures are verbatim typescript.

StepGeom_CompositeCurveSegment: declare class StepGeom_CompositeCurveSegment extends Standard_Transient

  // StepGeom_CompositeCurveSegment.constructor (constructor)
  constructor();

  // StepGeom_CompositeCurveSegment.Init (method)
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve): void;

  // StepGeom_CompositeCurveSegment.SetTransition (method)
  SetTransition(aTransition: StepGeom_TransitionCode): void;

  // StepGeom_CompositeCurveSegment.Transition (method)
  Transition(): StepGeom_TransitionCode;

  // StepGeom_CompositeCurveSegment.SetSameSense (method)
  SetSameSense(aSameSense: boolean): void;

  // StepGeom_CompositeCurveSegment.SameSense (method)
  SameSense(): boolean;

  // StepGeom_CompositeCurveSegment.SetParentCurve (method)
  SetParentCurve(aParentCurve: StepGeom_Curve): void;

  // StepGeom_CompositeCurveSegment.ParentCurve (method)
  ParentCurve(): StepGeom_Curve;

  // StepGeom_CompositeCurveSegment.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CompositeCurveSegment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CompositeCurveSegment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CompositeCurveSegment.delete (method)
  delete(): void;

  // StepGeom_CompositeCurveSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Conic: declare class StepGeom_Conic extends StepGeom_Curve

  // StepGeom_Conic.constructor (constructor)
  constructor();

  // StepGeom_Conic.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Conic.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis2Placement): void;

  // StepGeom_Conic.Position (method)
  Position(): StepGeom_Axis2Placement;

  // StepGeom_Conic.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Conic.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Conic.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Conic.delete (method)
  delete(): void;

  // StepGeom_Conic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_ConicalSurface: declare class StepGeom_ConicalSurface extends StepGeom_ElementarySurface

  // StepGeom_ConicalSurface.constructor (constructor)
  constructor();

  // StepGeom_ConicalSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_ConicalSurface.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepGeom_ConicalSurface.Radius (method)
  Radius(): number;

  // StepGeom_ConicalSurface.SetSemiAngle (method)
  SetSemiAngle(aSemiAngle: number): void;

  // StepGeom_ConicalSurface.SemiAngle (method)
  SemiAngle(): number;

  // StepGeom_ConicalSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_ConicalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_ConicalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_ConicalSurface.delete (method)
  delete(): void;

  // StepGeom_ConicalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Curve: declare class StepGeom_Curve extends StepGeom_GeometricRepresentationItem

  // StepGeom_Curve.constructor (constructor)
  constructor();

  // StepGeom_Curve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Curve.delete (method)
  delete(): void;

  // StepGeom_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CurveBoundedSurface: declare class StepGeom_CurveBoundedSurface extends StepGeom_BoundedSurface

  // StepGeom_CurveBoundedSurface.constructor (constructor)
  constructor();

  // StepGeom_CurveBoundedSurface.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aBoundaries: NCollection_HArray1_StepGeom_SurfaceBoundary, aImplicitOuter: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CurveBoundedSurface.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_CurveBoundedSurface.SetBasisSurface (method)
  SetBasisSurface(BasisSurface: StepGeom_Surface): void;

  // StepGeom_CurveBoundedSurface.Boundaries (method)
  Boundaries(): NCollection_HArray1_StepGeom_SurfaceBoundary;

  // StepGeom_CurveBoundedSurface.SetBoundaries (method)
  SetBoundaries(Boundaries: NCollection_HArray1_StepGeom_SurfaceBoundary): void;

  // StepGeom_CurveBoundedSurface.ImplicitOuter (method)
  ImplicitOuter(): boolean;

  // StepGeom_CurveBoundedSurface.SetImplicitOuter (method)
  SetImplicitOuter(ImplicitOuter: boolean): void;

  // StepGeom_CurveBoundedSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CurveBoundedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CurveBoundedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CurveBoundedSurface.delete (method)
  delete(): void;

  // StepGeom_CurveBoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CurveOnSurface: declare class StepGeom_CurveOnSurface extends StepData_SelectType

  // StepGeom_CurveOnSurface.constructor (constructor)
  constructor();

  // StepGeom_CurveOnSurface.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_CurveOnSurface.Pcurve (method)
  Pcurve(): StepGeom_Pcurve;

  // StepGeom_CurveOnSurface.SurfaceCurve (method)
  SurfaceCurve(): StepGeom_SurfaceCurve;

  // StepGeom_CurveOnSurface.CompositeCurveOnSurface (method)
  CompositeCurveOnSurface(): StepGeom_CompositeCurveOnSurface;

  // StepGeom_CurveOnSurface.delete (method)
  delete(): void;

  // StepGeom_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CurveReplica: declare class StepGeom_CurveReplica extends StepGeom_Curve

  // StepGeom_CurveReplica.constructor (constructor)
  constructor();

  // StepGeom_CurveReplica.Init (method)
  Init(aName: TCollection_HAsciiString, aParentCurve: StepGeom_Curve, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CurveReplica.SetParentCurve (method)
  SetParentCurve(aParentCurve: StepGeom_Curve): void;

  // StepGeom_CurveReplica.ParentCurve (method)
  ParentCurve(): StepGeom_Curve;

  // StepGeom_CurveReplica.SetTransformation (method)
  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator): void;

  // StepGeom_CurveReplica.Transformation (method)
  Transformation(): StepGeom_CartesianTransformationOperator;

  // StepGeom_CurveReplica.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CurveReplica.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CurveReplica.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CurveReplica.delete (method)
  delete(): void;

  // StepGeom_CurveReplica.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CylindricalSurface: declare class StepGeom_CylindricalSurface extends StepGeom_ElementarySurface

  // StepGeom_CylindricalSurface.constructor (constructor)
  constructor();

  // StepGeom_CylindricalSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CylindricalSurface.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepGeom_CylindricalSurface.Radius (method)
  Radius(): number;

  // StepGeom_CylindricalSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CylindricalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CylindricalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CylindricalSurface.delete (method)
  delete(): void;

  // StepGeom_CylindricalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_DegeneratePcurve: declare class StepGeom_DegeneratePcurve extends StepGeom_Point

  // StepGeom_DegeneratePcurve.constructor (constructor)
  constructor();

  // StepGeom_DegeneratePcurve.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_DegeneratePcurve.SetBasisSurface (method)
  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  // StepGeom_DegeneratePcurve.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_DegeneratePcurve.SetReferenceToCurve (method)
  SetReferenceToCurve(aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;

  // StepGeom_DegeneratePcurve.ReferenceToCurve (method)
  ReferenceToCurve(): StepRepr_DefinitionalRepresentation;

  // StepGeom_DegeneratePcurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_DegeneratePcurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_DegeneratePcurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_DegeneratePcurve.delete (method)
  delete(): void;

  // StepGeom_DegeneratePcurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_DegenerateToroidalSurface: declare class StepGeom_DegenerateToroidalSurface extends StepGeom_ToroidalSurface

  // StepGeom_DegenerateToroidalSurface.constructor (constructor)
  constructor();

  // StepGeom_DegenerateToroidalSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number, aSelectOuter: boolean): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_DegenerateToroidalSurface.SetSelectOuter (method)
  SetSelectOuter(aSelectOuter: boolean): void;

  // StepGeom_DegenerateToroidalSurface.SelectOuter (method)
  SelectOuter(): boolean;

  // StepGeom_DegenerateToroidalSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_DegenerateToroidalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_DegenerateToroidalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_DegenerateToroidalSurface.delete (method)
  delete(): void;

  // StepGeom_DegenerateToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Direction: declare class StepGeom_Direction extends StepGeom_GeometricRepresentationItem

  // StepGeom_Direction.constructor (constructor)
  constructor();

  // StepGeom_Direction.Init (method)
  Init(theName: TCollection_HAsciiString, theDirectionRatios: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Direction.Init3D (method)
  Init3D(theName: TCollection_HAsciiString, theDirectionRatios1: number, theDirectionRatios2: number, theDirectionRatios3: number): void;

  // StepGeom_Direction.Init2D (method)
  Init2D(theName: TCollection_HAsciiString, theDirectionRatios1: number, theDirectionRatios2: number): void;

  // StepGeom_Direction.SetDirectionRatios (method)
  SetDirectionRatios(theDirectionRatios: NCollection_HArray1_double): void;
  SetDirectionRatios(theDirectionRatios: [number, number, number]): void;

  // StepGeom_Direction.DirectionRatios (method)
  DirectionRatios(): [number, number, number];

  // StepGeom_Direction.DirectionRatiosValue (method)
  DirectionRatiosValue(theInd: number): number;

  // StepGeom_Direction.SetNbDirectionRatios (method)
  SetNbDirectionRatios(theSize: number): void;

  // StepGeom_Direction.NbDirectionRatios (method)
  NbDirectionRatios(): number;

  // StepGeom_Direction.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Direction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Direction.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Direction.delete (method)
  delete(): void;

  // StepGeom_Direction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_ElementarySurface: declare class StepGeom_ElementarySurface extends StepGeom_Surface

  // StepGeom_ElementarySurface.constructor (constructor)
  constructor();

  // StepGeom_ElementarySurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_ElementarySurface.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

  // StepGeom_ElementarySurface.Position (method)
  Position(): StepGeom_Axis2Placement3d;

  // StepGeom_ElementarySurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_ElementarySurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_ElementarySurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_ElementarySurface.delete (method)
  delete(): void;

  // StepGeom_ElementarySurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Ellipse: declare class StepGeom_Ellipse extends StepGeom_Conic

  // StepGeom_Ellipse.constructor (constructor)
  constructor();

  // StepGeom_Ellipse.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis1: number, aSemiAxis2: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Ellipse.SetSemiAxis1 (method)
  SetSemiAxis1(aSemiAxis1: number): void;

  // StepGeom_Ellipse.SemiAxis1 (method)
  SemiAxis1(): number;

  // StepGeom_Ellipse.SetSemiAxis2 (method)
  SetSemiAxis2(aSemiAxis2: number): void;

  // StepGeom_Ellipse.SemiAxis2 (method)
  SemiAxis2(): number;

  // StepGeom_Ellipse.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Ellipse.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Ellipse.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Ellipse.delete (method)
  delete(): void;

  // StepGeom_Ellipse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_EvaluatedDegeneratePcurve: declare class StepGeom_EvaluatedDegeneratePcurve extends StepGeom_DegeneratePcurve

  // StepGeom_EvaluatedDegeneratePcurve.constructor (constructor)
  constructor();

  // StepGeom_EvaluatedDegeneratePcurve.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation, aEquivalentPoint: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_EvaluatedDegeneratePcurve.SetEquivalentPoint (method)
  SetEquivalentPoint(aEquivalentPoint: StepGeom_CartesianPoint): void;

  // StepGeom_EvaluatedDegeneratePcurve.EquivalentPoint (method)
  EquivalentPoint(): StepGeom_CartesianPoint;

  // StepGeom_EvaluatedDegeneratePcurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_EvaluatedDegeneratePcurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_EvaluatedDegeneratePcurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_EvaluatedDegeneratePcurve.delete (method)
  delete(): void;

  // StepGeom_EvaluatedDegeneratePcurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx: declare class StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx extends StepRepr_RepresentationContext

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.constructor (constructor)
  constructor();

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationCtx: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedCtx: StepRepr_GlobalUnitAssignedContext, aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit, anUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetGeometricRepresentationContext (method)
  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.GeometricRepresentationContext (method)
  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetGlobalUnitAssignedContext (method)
  SetGlobalUnitAssignedContext(aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.GlobalUnitAssignedContext (method)
  GlobalUnitAssignedContext(): StepRepr_GlobalUnitAssignedContext;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetGlobalUncertaintyAssignedContext (method)
  SetGlobalUncertaintyAssignedContext(aGlobalUncertaintyAssignedCtx: StepRepr_GlobalUncertaintyAssignedContext): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.GlobalUncertaintyAssignedContext (method)
  GlobalUncertaintyAssignedContext(): StepRepr_GlobalUncertaintyAssignedContext;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetCoordinateSpaceDimension (method)
  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.CoordinateSpaceDimension (method)
  CoordinateSpaceDimension(): number;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetUnits (method)
  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.Units (method)
  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.UnitsValue (method)
  UnitsValue(num: number): StepBasic_NamedUnit;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.NbUnits (method)
  NbUnits(): number;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.SetUncertainty (method)
  SetUncertainty(aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.Uncertainty (method)
  Uncertainty(): NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.UncertaintyValue (method)
  UncertaintyValue(num: number): StepBasic_UncertaintyMeasureWithUnit;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.NbUncertainty (method)
  NbUncertainty(): number;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.delete (method)
  delete(): void;

  // StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContext: declare class StepGeom_GeometricRepresentationContext extends StepRepr_RepresentationContext

  // StepGeom_GeometricRepresentationContext.constructor (constructor)
  constructor();

  // StepGeom_GeometricRepresentationContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepGeom_GeometricRepresentationContext.SetCoordinateSpaceDimension (method)
  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  // StepGeom_GeometricRepresentationContext.CoordinateSpaceDimension (method)
  CoordinateSpaceDimension(): number;

  // StepGeom_GeometricRepresentationContext.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_GeometricRepresentationContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_GeometricRepresentationContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_GeometricRepresentationContext.delete (method)
  delete(): void;

  // StepGeom_GeometricRepresentationContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext: declare class StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext extends StepRepr_RepresentationContext

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.constructor (constructor)
  constructor();

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.SetGeometricRepresentationContext (method)
  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.GeometricRepresentationContext (method)
  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.SetGlobalUnitAssignedContext (method)
  SetGlobalUnitAssignedContext(aGlobalUnitAssignedContext: StepRepr_GlobalUnitAssignedContext): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.GlobalUnitAssignedContext (method)
  GlobalUnitAssignedContext(): StepRepr_GlobalUnitAssignedContext;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.SetCoordinateSpaceDimension (method)
  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.CoordinateSpaceDimension (method)
  CoordinateSpaceDimension(): number;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.SetUnits (method)
  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.Units (method)
  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.UnitsValue (method)
  UnitsValue(num: number): StepBasic_NamedUnit;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.NbUnits (method)
  NbUnits(): number;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.delete (method)
  delete(): void;

  // StepGeom_GeometricRepresentationContextAndGlobalUnitAssignedContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationContextAndParametricRepresentationContext: declare class StepGeom_GeometricRepresentationContextAndParametricRepresentationContext extends StepRepr_RepresentationContext

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.constructor (constructor)
  constructor();

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext, aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aCoordinateSpaceDimension: number): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.SetGeometricRepresentationContext (method)
  SetGeometricRepresentationContext(aGeometricRepresentationContext: StepGeom_GeometricRepresentationContext): void;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.GeometricRepresentationContext (method)
  GeometricRepresentationContext(): StepGeom_GeometricRepresentationContext;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.SetParametricRepresentationContext (method)
  SetParametricRepresentationContext(aParametricRepresentationContext: StepRepr_ParametricRepresentationContext): void;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.ParametricRepresentationContext (method)
  ParametricRepresentationContext(): StepRepr_ParametricRepresentationContext;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.SetCoordinateSpaceDimension (method)
  SetCoordinateSpaceDimension(aCoordinateSpaceDimension: number): void;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.CoordinateSpaceDimension (method)
  CoordinateSpaceDimension(): number;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.delete (method)
  delete(): void;

  // StepGeom_GeometricRepresentationContextAndParametricRepresentationContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_GeometricRepresentationItem: declare class StepGeom_GeometricRepresentationItem extends StepRepr_RepresentationItem

  // StepGeom_GeometricRepresentationItem.constructor (constructor)
  constructor();

  // StepGeom_GeometricRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_GeometricRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_GeometricRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_GeometricRepresentationItem.delete (method)
  delete(): void;

  // StepGeom_GeometricRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Hyperbola: declare class StepGeom_Hyperbola extends StepGeom_Conic

  // StepGeom_Hyperbola.constructor (constructor)
  constructor();

  // StepGeom_Hyperbola.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aSemiAxis: number, aSemiImagAxis: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Hyperbola.SetSemiAxis (method)
  SetSemiAxis(aSemiAxis: number): void;

  // StepGeom_Hyperbola.SemiAxis (method)
  SemiAxis(): number;

  // StepGeom_Hyperbola.SetSemiImagAxis (method)
  SetSemiImagAxis(aSemiImagAxis: number): void;

  // StepGeom_Hyperbola.SemiImagAxis (method)
  SemiImagAxis(): number;

  // StepGeom_Hyperbola.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Hyperbola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Hyperbola.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Hyperbola.delete (method)
  delete(): void;

  // StepGeom_Hyperbola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_IntersectionCurve: declare class StepGeom_IntersectionCurve extends StepGeom_SurfaceCurve

  // StepGeom_IntersectionCurve.constructor (constructor)
  constructor();

  // StepGeom_IntersectionCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_IntersectionCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_IntersectionCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_IntersectionCurve.delete (method)
  delete(): void;

  // StepGeom_IntersectionCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_KnotType: typeof StepGeom_KnotType[keyof typeof StepGeom_KnotType]

  readonly StepGeom_ktUniformKnots: 'StepGeom_ktUniformKnots'

  readonly StepGeom_ktUnspecified: 'StepGeom_ktUnspecified'

  readonly StepGeom_ktQuasiUniformKnots: 'StepGeom_ktQuasiUniformKnots'

  readonly StepGeom_ktPiecewiseBezierKnots: 'StepGeom_ktPiecewiseBezierKnots'

StepGeom_Line: declare class StepGeom_Line extends StepGeom_Curve

  // StepGeom_Line.constructor (constructor)
  constructor();

  // StepGeom_Line.Init (method)
  Init(aName: TCollection_HAsciiString, aPnt: StepGeom_CartesianPoint, aDir: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Line.SetPnt (method)
  SetPnt(aPnt: StepGeom_CartesianPoint): void;

  // StepGeom_Line.Pnt (method)
  Pnt(): StepGeom_CartesianPoint;

  // StepGeom_Line.SetDir (method)
  SetDir(aDir: StepGeom_Vector): void;

  // StepGeom_Line.Dir (method)
  Dir(): StepGeom_Vector;

  // StepGeom_Line.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Line.delete (method)
  delete(): void;

  // StepGeom_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_OffsetCurve3d: declare class StepGeom_OffsetCurve3d extends StepGeom_Curve

  // StepGeom_OffsetCurve3d.constructor (constructor)
  constructor();

  // StepGeom_OffsetCurve3d.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aDistance: number, aSelfIntersect: StepData_Logical, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_OffsetCurve3d.SetBasisCurve (method)
  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  // StepGeom_OffsetCurve3d.BasisCurve (method)
  BasisCurve(): StepGeom_Curve;

  // StepGeom_OffsetCurve3d.SetDistance (method)
  SetDistance(aDistance: number): void;

  // StepGeom_OffsetCurve3d.Distance (method)
  Distance(): number;

  // StepGeom_OffsetCurve3d.SetSelfIntersect (method)
  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  // StepGeom_OffsetCurve3d.SelfIntersect (method)
  SelfIntersect(): StepData_Logical;

  // StepGeom_OffsetCurve3d.SetRefDirection (method)
  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  // StepGeom_OffsetCurve3d.RefDirection (method)
  RefDirection(): StepGeom_Direction;

  // StepGeom_OffsetCurve3d.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_OffsetCurve3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_OffsetCurve3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_OffsetCurve3d.delete (method)
  delete(): void;

  // StepGeom_OffsetCurve3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_OffsetSurface: declare class StepGeom_OffsetSurface extends StepGeom_Surface

  // StepGeom_OffsetSurface.constructor (constructor)
  constructor();

  // StepGeom_OffsetSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aDistance: number, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_OffsetSurface.SetBasisSurface (method)
  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  // StepGeom_OffsetSurface.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_OffsetSurface.SetDistance (method)
  SetDistance(aDistance: number): void;

  // StepGeom_OffsetSurface.Distance (method)
  Distance(): number;

  // StepGeom_OffsetSurface.SetSelfIntersect (method)
  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  // StepGeom_OffsetSurface.SelfIntersect (method)
  SelfIntersect(): StepData_Logical;

  // StepGeom_OffsetSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_OffsetSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_OffsetSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_OffsetSurface.delete (method)
  delete(): void;

  // StepGeom_OffsetSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_OrientedSurface: declare class StepGeom_OrientedSurface extends StepGeom_Surface

  // StepGeom_OrientedSurface.constructor (constructor)
  constructor();

  // StepGeom_OrientedSurface.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_OrientedSurface.Orientation (method)
  Orientation(): boolean;

  // StepGeom_OrientedSurface.SetOrientation (method)
  SetOrientation(Orientation: boolean): void;

  // StepGeom_OrientedSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_OrientedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_OrientedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_OrientedSurface.delete (method)
  delete(): void;

  // StepGeom_OrientedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_OuterBoundaryCurve: declare class StepGeom_OuterBoundaryCurve extends StepGeom_BoundaryCurve

  // StepGeom_OuterBoundaryCurve.constructor (constructor)
  constructor();

  // StepGeom_OuterBoundaryCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_OuterBoundaryCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_OuterBoundaryCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_OuterBoundaryCurve.delete (method)
  delete(): void;

  // StepGeom_OuterBoundaryCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Parabola: declare class StepGeom_Parabola extends StepGeom_Conic

  // StepGeom_Parabola.constructor (constructor)
  constructor();

  // StepGeom_Parabola.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aFocalDist: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Parabola.SetFocalDist (method)
  SetFocalDist(aFocalDist: number): void;

  // StepGeom_Parabola.FocalDist (method)
  FocalDist(): number;

  // StepGeom_Parabola.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Parabola.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Parabola.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Parabola.delete (method)
  delete(): void;

  // StepGeom_Parabola.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Pcurve: declare class StepGeom_Pcurve extends StepGeom_Curve

  // StepGeom_Pcurve.constructor (constructor)
  constructor();

  // StepGeom_Pcurve.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Pcurve.SetBasisSurface (method)
  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  // StepGeom_Pcurve.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_Pcurve.SetReferenceToCurve (method)
  SetReferenceToCurve(aReferenceToCurve: StepRepr_DefinitionalRepresentation): void;

  // StepGeom_Pcurve.ReferenceToCurve (method)
  ReferenceToCurve(): StepRepr_DefinitionalRepresentation;

  // StepGeom_Pcurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Pcurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Pcurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Pcurve.delete (method)
  delete(): void;

  // StepGeom_Pcurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_PcurveOrSurface: declare class StepGeom_PcurveOrSurface extends StepData_SelectType

  // StepGeom_PcurveOrSurface.constructor (constructor)
  constructor();

  // StepGeom_PcurveOrSurface.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_PcurveOrSurface.Pcurve (method)
  Pcurve(): StepGeom_Pcurve;

  // StepGeom_PcurveOrSurface.Surface (method)
  Surface(): StepGeom_Surface;

  // StepGeom_PcurveOrSurface.delete (method)
  delete(): void;

  // StepGeom_PcurveOrSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Placement: declare class StepGeom_Placement extends StepGeom_GeometricRepresentationItem

  // StepGeom_Placement.constructor (constructor)
  constructor();

  // StepGeom_Placement.Init (method)
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Placement.SetLocation (method)
  SetLocation(aLocation: StepGeom_CartesianPoint): void;

  // StepGeom_Placement.Location (method)
  Location(): StepGeom_CartesianPoint;

  // StepGeom_Placement.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Placement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Placement.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Placement.delete (method)
  delete(): void;

  // StepGeom_Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Plane: declare class StepGeom_Plane extends StepGeom_ElementarySurface

  // StepGeom_Plane.constructor (constructor)
  constructor();

  // StepGeom_Plane.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Plane.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Plane.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Plane.delete (method)
  delete(): void;

  // StepGeom_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Point: declare class StepGeom_Point extends StepGeom_GeometricRepresentationItem

  // StepGeom_Point.constructor (constructor)
  constructor();

  // StepGeom_Point.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Point.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Point.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Point.delete (method)
  delete(): void;

  // StepGeom_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_PointOnCurve: declare class StepGeom_PointOnCurve extends StepGeom_Point

  // StepGeom_PointOnCurve.constructor (constructor)
  constructor();

  // StepGeom_PointOnCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisCurve: StepGeom_Curve, aPointParameter: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_PointOnCurve.SetBasisCurve (method)
  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  // StepGeom_PointOnCurve.BasisCurve (method)
  BasisCurve(): StepGeom_Curve;

  // StepGeom_PointOnCurve.SetPointParameter (method)
  SetPointParameter(aPointParameter: number): void;

  // StepGeom_PointOnCurve.PointParameter (method)
  PointParameter(): number;

  // StepGeom_PointOnCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_PointOnCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_PointOnCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_PointOnCurve.delete (method)
  delete(): void;

  // StepGeom_PointOnCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_PointOnSurface: declare class StepGeom_PointOnSurface extends StepGeom_Point

  // StepGeom_PointOnSurface.constructor (constructor)
  constructor();

  // StepGeom_PointOnSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aPointParameterU: number, aPointParameterV: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_PointOnSurface.SetBasisSurface (method)
  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  // StepGeom_PointOnSurface.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_PointOnSurface.SetPointParameterU (method)
  SetPointParameterU(aPointParameterU: number): void;

  // StepGeom_PointOnSurface.PointParameterU (method)
  PointParameterU(): number;

  // StepGeom_PointOnSurface.SetPointParameterV (method)
  SetPointParameterV(aPointParameterV: number): void;

  // StepGeom_PointOnSurface.PointParameterV (method)
  PointParameterV(): number;

  // StepGeom_PointOnSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_PointOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_PointOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_PointOnSurface.delete (method)
  delete(): void;

  // StepGeom_PointOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_PointReplica: declare class StepGeom_PointReplica extends StepGeom_Point

  // StepGeom_PointReplica.constructor (constructor)
  constructor();

  // StepGeom_PointReplica.Init (method)
  Init(aName: TCollection_HAsciiString, aParentPt: StepGeom_Point, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_PointReplica.SetParentPt (method)
  SetParentPt(aParentPt: StepGeom_Point): void;

  // StepGeom_PointReplica.ParentPt (method)
  ParentPt(): StepGeom_Point;

  // StepGeom_PointReplica.SetTransformation (method)
  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator): void;

  // StepGeom_PointReplica.Transformation (method)
  Transformation(): StepGeom_CartesianTransformationOperator;

  // StepGeom_PointReplica.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_PointReplica.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_PointReplica.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_PointReplica.delete (method)
  delete(): void;

  // StepGeom_PointReplica.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
