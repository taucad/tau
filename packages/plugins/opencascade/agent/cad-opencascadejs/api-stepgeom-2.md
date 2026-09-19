# libcascade — StepGeom (2)

23 top-level symbols. Signatures are verbatim typescript.

StepGeom_BezierCurveAndRationalBSplineCurve: declare class StepGeom_BezierCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierCurve: StepGeom_BezierCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierCurve: StepGeom_BezierCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierCurve: StepGeom_BezierCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierCurve: StepGeom_BezierCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBezierCurve(aBezierCurve: StepGeom_BezierCurve): void;

  BezierCurve(): StepGeom_BezierCurve;

  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  WeightsData(): NCollection_HArray1_double;

  WeightsDataValue(num: number): number;

  NbWeightsData(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BezierSurface: declare class StepGeom_BezierSurface extends StepGeom_BSplineSurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BezierSurfaceAndRationalBSplineSurface: declare class StepGeom_BezierSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierSurface: StepGeom_BezierSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierSurface: StepGeom_BezierSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierSurface: StepGeom_BezierSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierSurface: StepGeom_BezierSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBezierSurface(aBezierSurface: StepGeom_BezierSurface): void;

  BezierSurface(): StepGeom_BezierSurface;

  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  WeightsData(): NCollection_HArray2_double;

  WeightsDataValue(num1: number, num2: number): number;

  NbWeightsDataI(): number;

  NbWeightsDataJ(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BoundaryCurve: declare class StepGeom_BoundaryCurve extends StepGeom_CompositeCurveOnSurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BoundedCurve: declare class StepGeom_BoundedCurve extends StepGeom_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BoundedSurface: declare class StepGeom_BoundedSurface extends StepGeom_Surface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CartesianPoint: declare class StepGeom_CartesianPoint extends StepGeom_Point

  constructor

  Init(theName: TCollection_HAsciiString, theCoordinates: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theCoordinates: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;

  Init2D(theName: TCollection_HAsciiString, theX: number, theY: number): void;

  Init3D(theName: TCollection_HAsciiString, theX: number, theY: number, theZ: number): void;

  SetCoordinates(theCoordinates: NCollection_HArray1_double): void;
  SetCoordinates(theCoordinates: [number, number, number]): void;
  SetCoordinates(theCoordinates: NCollection_HArray1_double): void;
  SetCoordinates(theCoordinates: [number, number, number]): void;

  Coordinates(): [number, number, number];

  CoordinatesValue(theInd: number): number;

  SetNbCoordinates(theSize: number): void;

  NbCoordinates(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator: declare class StepGeom_CartesianTransformationOperator extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis1(aAxis1: StepGeom_Direction): void;

  UnSetAxis1(): void;

  Axis1(): StepGeom_Direction;

  HasAxis1(): boolean;

  SetAxis2(aAxis2: StepGeom_Direction): void;

  UnSetAxis2(): void;

  Axis2(): StepGeom_Direction;

  HasAxis2(): boolean;

  SetLocalOrigin(aLocalOrigin: StepGeom_CartesianPoint): void;

  LocalOrigin(): StepGeom_CartesianPoint;

  SetScale(aScale: number): void;

  UnSetScale(): void;

  Scale(): number;

  HasScale(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator2d: declare class StepGeom_CartesianTransformationOperator2d extends StepGeom_CartesianTransformationOperator

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator3d: declare class StepGeom_CartesianTransformationOperator3d extends StepGeom_CartesianTransformationOperator

  constructor

  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number, hasAaxis3: boolean, aAxis3: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number, hasAaxis3: boolean, aAxis3: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number, hasAaxis3: boolean, aAxis3: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis3(aAxis3: StepGeom_Direction): void;

  UnSetAxis3(): void;

  Axis3(): StepGeom_Direction;

  HasAxis3(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Circle: declare class StepGeom_Circle extends StepGeom_Conic

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRadius(aRadius: number): void;

  Radius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CompositeCurve: declare class StepGeom_CompositeCurve extends StepGeom_BoundedCurve

  constructor

  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSegments(aSegments: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment): void;

  Segments(): NCollection_HArray1_handle_StepGeom_CompositeCurveSegment;

  SegmentsValue(num: number): StepGeom_CompositeCurveSegment;

  NbSegments(): number;

  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  SelfIntersect(): StepData_Logical;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CompositeCurveOnSurface: declare class StepGeom_CompositeCurveOnSurface extends StepGeom_CompositeCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CompositeCurveSegment: declare class StepGeom_CompositeCurveSegment extends Standard_Transient

  constructor

  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve): void;

  SetTransition(aTransition: StepGeom_TransitionCode): void;

  Transition(): StepGeom_TransitionCode;

  SetSameSense(aSameSense: boolean): void;

  SameSense(): boolean;

  SetParentCurve(aParentCurve: StepGeom_Curve): void;

  ParentCurve(): StepGeom_Curve;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Conic: declare class StepGeom_Conic extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis2Placement): void;

  Position(): StepGeom_Axis2Placement;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_ConicalSurface: declare class StepGeom_ConicalSurface extends StepGeom_ElementarySurface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRadius(aRadius: number): void;

  Radius(): number;

  SetSemiAngle(aSemiAngle: number): void;

  SemiAngle(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Curve: declare class StepGeom_Curve extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CurveBoundedSurface: declare class StepGeom_CurveBoundedSurface extends StepGeom_BoundedSurface

  constructor

  Init(aRepresentationItem_Name: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aBoundaries: NCollection_HArray1_StepGeom_SurfaceBoundary, aImplicitOuter: boolean): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aBoundaries: NCollection_HArray1_StepGeom_SurfaceBoundary, aImplicitOuter: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  BasisSurface(): StepGeom_Surface;

  SetBasisSurface(BasisSurface: StepGeom_Surface): void;

  Boundaries(): NCollection_HArray1_StepGeom_SurfaceBoundary;

  SetBoundaries(Boundaries: NCollection_HArray1_StepGeom_SurfaceBoundary): void;

  ImplicitOuter(): boolean;

  SetImplicitOuter(ImplicitOuter: boolean): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CurveOnSurface: declare class StepGeom_CurveOnSurface extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Pcurve(): StepGeom_Pcurve;

  SurfaceCurve(): StepGeom_SurfaceCurve;

  CompositeCurveOnSurface(): StepGeom_CompositeCurveOnSurface;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CurveReplica: declare class StepGeom_CurveReplica extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aParentCurve: StepGeom_Curve, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aParentCurve: StepGeom_Curve, aTransformation: StepGeom_CartesianTransformationOperator): void;
  Init(aName: TCollection_HAsciiString): void;

  SetParentCurve(aParentCurve: StepGeom_Curve): void;

  ParentCurve(): StepGeom_Curve;

  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator): void;

  Transformation(): StepGeom_CartesianTransformationOperator;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_CylindricalSurface: declare class StepGeom_CylindricalSurface extends StepGeom_ElementarySurface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRadius(aRadius: number): void;

  Radius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_DegeneratePcurve: declare class StepGeom_DegeneratePcurve extends StepGeom_Point

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

StepGeom_DegenerateToroidalSurface: declare class StepGeom_DegenerateToroidalSurface extends StepGeom_ToroidalSurface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number, aSelectOuter: boolean): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number, aSelectOuter: boolean): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number, aSelectOuter: boolean): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number, aSelectOuter: boolean): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSelectOuter(aSelectOuter: boolean): void;

  SelectOuter(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
