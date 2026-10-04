# libcascade — IGESGeom

31 top-level symbols. Signatures are verbatim typescript.

IGESGeom: declare class IGESGeom

  // IGESGeom.constructor (constructor)
  constructor();

  // IGESGeom.Init (method)
  static Init(): void;

  // IGESGeom.Protocol (method)
  static Protocol(): IGESGeom_Protocol;

  // IGESGeom.delete (method)
  delete(): void;

  // IGESGeom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_BSplineCurve: declare class IGESGeom_BSplineCurve extends IGESData_IGESEntity

  // IGESGeom_BSplineCurve.constructor (constructor)
  constructor();

  // IGESGeom_BSplineCurve.Init (method)
  Init(anIndex: number, aDegree: number, aPlanar: boolean, aClosed: boolean, aPolynom: boolean, aPeriodic: boolean, allKnots: NCollection_HArray1_double, allWeights: NCollection_HArray1_double, allPoles: NCollection_HArray1_gp_XYZ, aUmin: number, aUmax: number, aNorm: gp_XYZ): void;

  // IGESGeom_BSplineCurve.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESGeom_BSplineCurve.UpperIndex (method)
  UpperIndex(): number;

  // IGESGeom_BSplineCurve.Degree (method)
  Degree(): number;

  // IGESGeom_BSplineCurve.IsPlanar (method)
  IsPlanar(): boolean;

  // IGESGeom_BSplineCurve.IsClosed (method)
  IsClosed(): boolean;

  // IGESGeom_BSplineCurve.IsPolynomial (method)
  IsPolynomial(flag?: boolean): boolean;

  // IGESGeom_BSplineCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // IGESGeom_BSplineCurve.NbKnots (method)
  NbKnots(): number;

  // IGESGeom_BSplineCurve.Knot (method)
  Knot(anIndex: number): number;

  // IGESGeom_BSplineCurve.NbPoles (method)
  NbPoles(): number;

  // IGESGeom_BSplineCurve.Weight (method)
  Weight(anIndex: number): number;

  // IGESGeom_BSplineCurve.Pole (method)
  Pole(anIndex: number): gp_Pnt;

  // IGESGeom_BSplineCurve.TransformedPole (method)
  TransformedPole(anIndex: number): gp_Pnt;

  // IGESGeom_BSplineCurve.UMin (method)
  UMin(): number;

  // IGESGeom_BSplineCurve.UMax (method)
  UMax(): number;

  // IGESGeom_BSplineCurve.Normal (method)
  Normal(): gp_XYZ;

  // IGESGeom_BSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_BSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_BSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_BSplineCurve.delete (method)
  delete(): void;

  // IGESGeom_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_BSplineSurface: declare class IGESGeom_BSplineSurface extends IGESData_IGESEntity

  // IGESGeom_BSplineSurface.constructor (constructor)
  constructor();

  // IGESGeom_BSplineSurface.Init (method)
  Init(anIndexU: number, anIndexV: number, aDegU: number, aDegV: number, aCloseU: boolean, aCloseV: boolean, aPolynom: boolean, aPeriodU: boolean, aPeriodV: boolean, allKnotsU: NCollection_HArray1_double, allKnotsV: NCollection_HArray1_double, allWeights: NCollection_HArray2_double, allPoles: NCollection_HArray2_gp_XYZ, aUmin: number, aUmax: number, aVmin: number, aVmax: number): void;

  // IGESGeom_BSplineSurface.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESGeom_BSplineSurface.UpperIndexU (method)
  UpperIndexU(): number;

  // IGESGeom_BSplineSurface.UpperIndexV (method)
  UpperIndexV(): number;

  // IGESGeom_BSplineSurface.DegreeU (method)
  DegreeU(): number;

  // IGESGeom_BSplineSurface.DegreeV (method)
  DegreeV(): number;

  // IGESGeom_BSplineSurface.IsClosedU (method)
  IsClosedU(): boolean;

  // IGESGeom_BSplineSurface.IsClosedV (method)
  IsClosedV(): boolean;

  // IGESGeom_BSplineSurface.IsPolynomial (method)
  IsPolynomial(flag?: boolean): boolean;

  // IGESGeom_BSplineSurface.IsPeriodicU (method)
  IsPeriodicU(): boolean;

  // IGESGeom_BSplineSurface.IsPeriodicV (method)
  IsPeriodicV(): boolean;

  // IGESGeom_BSplineSurface.NbKnotsU (method)
  NbKnotsU(): number;

  // IGESGeom_BSplineSurface.NbKnotsV (method)
  NbKnotsV(): number;

  // IGESGeom_BSplineSurface.KnotU (method)
  KnotU(anIndex: number): number;

  // IGESGeom_BSplineSurface.KnotV (method)
  KnotV(anIndex: number): number;

  // IGESGeom_BSplineSurface.NbPolesU (method)
  NbPolesU(): number;

  // IGESGeom_BSplineSurface.NbPolesV (method)
  NbPolesV(): number;

  // IGESGeom_BSplineSurface.Weight (method)
  Weight(anIndex1: number, anIndex2: number): number;

  // IGESGeom_BSplineSurface.Pole (method)
  Pole(anIndex1: number, anIndex2: number): gp_Pnt;

  // IGESGeom_BSplineSurface.TransformedPole (method)
  TransformedPole(anIndex1: number, anIndex2: number): gp_Pnt;

  // IGESGeom_BSplineSurface.UMin (method)
  UMin(): number;

  // IGESGeom_BSplineSurface.UMax (method)
  UMax(): number;

  // IGESGeom_BSplineSurface.VMin (method)
  VMin(): number;

  // IGESGeom_BSplineSurface.VMax (method)
  VMax(): number;

  // IGESGeom_BSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_BSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_BSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_BSplineSurface.delete (method)
  delete(): void;

  // IGESGeom_BSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Boundary: declare class IGESGeom_Boundary extends IGESData_IGESEntity

  // IGESGeom_Boundary.constructor (constructor)
  constructor();

  // IGESGeom_Boundary.Init (method)
  Init(aType: number, aPreference: number, aSurface: IGESData_IGESEntity, allModelCurves: NCollection_HArray1_handle_IGESData_IGESEntity, allSenses: NCollection_HArray1_int, allParameterCurves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

  // IGESGeom_Boundary.BoundaryType (method)
  BoundaryType(): number;

  // IGESGeom_Boundary.PreferenceType (method)
  PreferenceType(): number;

  // IGESGeom_Boundary.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESGeom_Boundary.NbModelSpaceCurves (method)
  NbModelSpaceCurves(): number;

  // IGESGeom_Boundary.ModelSpaceCurve (method)
  ModelSpaceCurve(Index: number): IGESData_IGESEntity;

  // IGESGeom_Boundary.Sense (method)
  Sense(Index: number): number;

  // IGESGeom_Boundary.NbParameterCurves (method)
  NbParameterCurves(Index: number): number;

  // IGESGeom_Boundary.ParameterCurves (method)
  ParameterCurves(Index: number): NCollection_HArray1_handle_IGESData_IGESEntity;

  // IGESGeom_Boundary.ParameterCurve (method)
  ParameterCurve(Index: number, Num: number): IGESData_IGESEntity;

  // IGESGeom_Boundary.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Boundary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Boundary.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Boundary.delete (method)
  delete(): void;

  // IGESGeom_Boundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_BoundedSurface: declare class IGESGeom_BoundedSurface extends IGESData_IGESEntity

  // IGESGeom_BoundedSurface.constructor (constructor)
  constructor();

  // IGESGeom_BoundedSurface.Init (method)
  Init(aType: number, aSurface: IGESData_IGESEntity, allBounds: NCollection_HArray1_handle_IGESGeom_Boundary): void;

  // IGESGeom_BoundedSurface.RepresentationType (method)
  RepresentationType(): number;

  // IGESGeom_BoundedSurface.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESGeom_BoundedSurface.NbBoundaries (method)
  NbBoundaries(): number;

  // IGESGeom_BoundedSurface.Boundary (method)
  Boundary(Index: number): IGESGeom_Boundary;

  // IGESGeom_BoundedSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_BoundedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_BoundedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_BoundedSurface.delete (method)
  delete(): void;

  // IGESGeom_BoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_CircularArc: declare class IGESGeom_CircularArc extends IGESData_IGESEntity

  // IGESGeom_CircularArc.constructor (constructor)
  constructor();

  // IGESGeom_CircularArc.Init (method)
  Init(aZT: number, aCenter: gp_XY, aStart: gp_XY, anEnd: gp_XY): void;

  // IGESGeom_CircularArc.Center (method)
  Center(): gp_Pnt2d;

  // IGESGeom_CircularArc.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESGeom_CircularArc.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // IGESGeom_CircularArc.TransformedStartPoint (method)
  TransformedStartPoint(): gp_Pnt;

  // IGESGeom_CircularArc.ZPlane (method)
  ZPlane(): number;

  // IGESGeom_CircularArc.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // IGESGeom_CircularArc.TransformedEndPoint (method)
  TransformedEndPoint(): gp_Pnt;

  // IGESGeom_CircularArc.Radius (method)
  Radius(): number;

  // IGESGeom_CircularArc.Angle (method)
  Angle(): number;

  // IGESGeom_CircularArc.Axis (method)
  Axis(): gp_Dir;

  // IGESGeom_CircularArc.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESGeom_CircularArc.IsClosed (method)
  IsClosed(): boolean;

  // IGESGeom_CircularArc.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_CircularArc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_CircularArc.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_CircularArc.delete (method)
  delete(): void;

  // IGESGeom_CircularArc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_CompositeCurve: declare class IGESGeom_CompositeCurve extends IGESData_IGESEntity

  // IGESGeom_CompositeCurve.constructor (constructor)
  constructor();

  // IGESGeom_CompositeCurve.Init (method)
  Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESGeom_CompositeCurve.NbCurves (method)
  NbCurves(): number;

  // IGESGeom_CompositeCurve.Curve (method)
  Curve(Index: number): IGESData_IGESEntity;

  // IGESGeom_CompositeCurve.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_CompositeCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_CompositeCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_CompositeCurve.delete (method)
  delete(): void;

  // IGESGeom_CompositeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ConicArc: declare class IGESGeom_ConicArc extends IGESData_IGESEntity

  // IGESGeom_ConicArc.constructor (constructor)
  constructor();

  // IGESGeom_ConicArc.Init (method)
  Init(A: number, B: number, C: number, D: number, E: number, F: number, ZT: number, aStart: gp_XY, anEnd: gp_XY): void;

  // IGESGeom_ConicArc.OwnCorrect (method)
  OwnCorrect(): boolean;

  // IGESGeom_ConicArc.ComputedFormNumber (method)
  ComputedFormNumber(): number;

  // IGESGeom_ConicArc.Equation (method)
  Equation(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

  // IGESGeom_ConicArc.ZPlane (method)
  ZPlane(): number;

  // IGESGeom_ConicArc.StartPoint (method)
  StartPoint(): gp_Pnt2d;

  // IGESGeom_ConicArc.TransformedStartPoint (method)
  TransformedStartPoint(): gp_Pnt;

  // IGESGeom_ConicArc.EndPoint (method)
  EndPoint(): gp_Pnt2d;

  // IGESGeom_ConicArc.TransformedEndPoint (method)
  TransformedEndPoint(): gp_Pnt;

  // IGESGeom_ConicArc.IsFromEllipse (method)
  IsFromEllipse(): boolean;

  // IGESGeom_ConicArc.IsFromParabola (method)
  IsFromParabola(): boolean;

  // IGESGeom_ConicArc.IsFromHyperbola (method)
  IsFromHyperbola(): boolean;

  // IGESGeom_ConicArc.IsClosed (method)
  IsClosed(): boolean;

  // IGESGeom_ConicArc.Axis (method)
  Axis(): gp_Dir;

  // IGESGeom_ConicArc.TransformedAxis (method)
  TransformedAxis(): gp_Dir;

  // IGESGeom_ConicArc.Definition (method)
  Definition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };

  // IGESGeom_ConicArc.TransformedDefinition (method)
  TransformedDefinition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };

  // IGESGeom_ConicArc.ComputedDefinition (method)
  ComputedDefinition(Xcen?: number, Ycen?: number, Xax?: number, Yax?: number, Rmin?: number, Rmax?: number): { Xcen: number; Ycen: number; Xax: number; Yax: number; Rmin: number; Rmax: number };

  // IGESGeom_ConicArc.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_ConicArc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_ConicArc.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_ConicArc.delete (method)
  delete(): void;

  // IGESGeom_ConicArc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_CopiousData: declare class IGESGeom_CopiousData extends IGESData_IGESEntity

  // IGESGeom_CopiousData.constructor (constructor)
  constructor();

  // IGESGeom_CopiousData.Init (method)
  Init(aDataType: number, aZPlane: number, allData: NCollection_HArray1_double): void;

  // IGESGeom_CopiousData.SetPolyline (method)
  SetPolyline(mode: boolean): void;

  // IGESGeom_CopiousData.SetClosedPath2D (method)
  SetClosedPath2D(): void;

  // IGESGeom_CopiousData.IsPointSet (method)
  IsPointSet(): boolean;

  // IGESGeom_CopiousData.IsPolyline (method)
  IsPolyline(): boolean;

  // IGESGeom_CopiousData.IsClosedPath2D (method)
  IsClosedPath2D(): boolean;

  // IGESGeom_CopiousData.DataType (method)
  DataType(): number;

  // IGESGeom_CopiousData.NbPoints (method)
  NbPoints(): number;

  // IGESGeom_CopiousData.Data (method)
  Data(NumPoint: number, NumData: number): number;

  // IGESGeom_CopiousData.ZPlane (method)
  ZPlane(): number;

  // IGESGeom_CopiousData.Point (method)
  Point(anIndex: number): gp_Pnt;

  // IGESGeom_CopiousData.TransformedPoint (method)
  TransformedPoint(anIndex: number): gp_Pnt;

  // IGESGeom_CopiousData.Vector (method)
  Vector(anIndex: number): gp_Vec;

  // IGESGeom_CopiousData.TransformedVector (method)
  TransformedVector(anIndex: number): gp_Vec;

  // IGESGeom_CopiousData.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_CopiousData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_CopiousData.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_CopiousData.delete (method)
  delete(): void;

  // IGESGeom_CopiousData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_CurveOnSurface: declare class IGESGeom_CurveOnSurface extends IGESData_IGESEntity

  // IGESGeom_CurveOnSurface.constructor (constructor)
  constructor();

  // IGESGeom_CurveOnSurface.Init (method)
  Init(aMode: number, aSurface: IGESData_IGESEntity, aCurveUV: IGESData_IGESEntity, aCurve3D: IGESData_IGESEntity, aPreference: number): void;

  // IGESGeom_CurveOnSurface.CreationMode (method)
  CreationMode(): number;

  // IGESGeom_CurveOnSurface.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESGeom_CurveOnSurface.CurveUV (method)
  CurveUV(): IGESData_IGESEntity;

  // IGESGeom_CurveOnSurface.Curve3D (method)
  Curve3D(): IGESData_IGESEntity;

  // IGESGeom_CurveOnSurface.PreferenceMode (method)
  PreferenceMode(): number;

  // IGESGeom_CurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_CurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_CurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_CurveOnSurface.delete (method)
  delete(): void;

  // IGESGeom_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Direction: declare class IGESGeom_Direction extends IGESData_IGESEntity

  // IGESGeom_Direction.constructor (constructor)
  constructor();

  // IGESGeom_Direction.Init (method)
  Init(aDirection: gp_XYZ): void;

  // IGESGeom_Direction.Value (method)
  Value(): gp_Vec;

  // IGESGeom_Direction.TransformedValue (method)
  TransformedValue(): gp_Vec;

  // IGESGeom_Direction.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Direction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Direction.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Direction.delete (method)
  delete(): void;

  // IGESGeom_Direction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Flash: declare class IGESGeom_Flash extends IGESData_IGESEntity

  // IGESGeom_Flash.constructor (constructor)
  constructor();

  // IGESGeom_Flash.Init (method)
  Init(aPoint: gp_XY, aDim: number, anotherDim: number, aRotation: number, aReference: IGESData_IGESEntity): void;

  // IGESGeom_Flash.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESGeom_Flash.ReferencePoint (method)
  ReferencePoint(): gp_Pnt2d;

  // IGESGeom_Flash.TransformedReferencePoint (method)
  TransformedReferencePoint(): gp_Pnt;

  // IGESGeom_Flash.Dimension1 (method)
  Dimension1(): number;

  // IGESGeom_Flash.Dimension2 (method)
  Dimension2(): number;

  // IGESGeom_Flash.Rotation (method)
  Rotation(): number;

  // IGESGeom_Flash.ReferenceEntity (method)
  ReferenceEntity(): IGESData_IGESEntity;

  // IGESGeom_Flash.HasReferenceEntity (method)
  HasReferenceEntity(): boolean;

  // IGESGeom_Flash.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Flash.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Flash.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Flash.delete (method)
  delete(): void;

  // IGESGeom_Flash.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_GeneralModule: declare class IGESGeom_GeneralModule extends IGESData_GeneralModule

  // IGESGeom_GeneralModule.constructor (constructor)
  constructor();

  // IGESGeom_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESGeom_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESGeom_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESGeom_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESGeom_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_GeneralModule.delete (method)
  delete(): void;

  // IGESGeom_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Line: declare class IGESGeom_Line extends IGESData_IGESEntity

  // IGESGeom_Line.constructor (constructor)
  constructor();

  // IGESGeom_Line.Init (method)
  Init(aStart: gp_XYZ, anEnd: gp_XYZ): void;

  // IGESGeom_Line.Infinite (method)
  Infinite(): number;

  // IGESGeom_Line.SetInfinite (method)
  SetInfinite(status: number): void;

  // IGESGeom_Line.StartPoint (method)
  StartPoint(): gp_Pnt;

  // IGESGeom_Line.TransformedStartPoint (method)
  TransformedStartPoint(): gp_Pnt;

  // IGESGeom_Line.EndPoint (method)
  EndPoint(): gp_Pnt;

  // IGESGeom_Line.TransformedEndPoint (method)
  TransformedEndPoint(): gp_Pnt;

  // IGESGeom_Line.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Line.delete (method)
  delete(): void;

  // IGESGeom_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_OffsetCurve: declare class IGESGeom_OffsetCurve extends IGESData_IGESEntity

  // IGESGeom_OffsetCurve.constructor (constructor)
  constructor();

  // IGESGeom_OffsetCurve.Init (method)
  Init(aBaseCurve: IGESData_IGESEntity, anOffsetType: number, aFunction: IGESData_IGESEntity, aFunctionCoord: number, aTaperedOffsetType: number, offDistance1: number, arcLength1: number, offDistance2: number, arcLength2: number, aNormalVec: gp_XYZ, anOffsetParam: number, anotherOffsetParam: number): void;

  // IGESGeom_OffsetCurve.BaseCurve (method)
  BaseCurve(): IGESData_IGESEntity;

  // IGESGeom_OffsetCurve.OffsetType (method)
  OffsetType(): number;

  // IGESGeom_OffsetCurve.Function (method)
  Function(): IGESData_IGESEntity;

  // IGESGeom_OffsetCurve.HasFunction (method)
  HasFunction(): boolean;

  // IGESGeom_OffsetCurve.FunctionParameter (method)
  FunctionParameter(): number;

  // IGESGeom_OffsetCurve.TaperedOffsetType (method)
  TaperedOffsetType(): number;

  // IGESGeom_OffsetCurve.FirstOffsetDistance (method)
  FirstOffsetDistance(): number;

  // IGESGeom_OffsetCurve.ArcLength1 (method)
  ArcLength1(): number;

  // IGESGeom_OffsetCurve.SecondOffsetDistance (method)
  SecondOffsetDistance(): number;

  // IGESGeom_OffsetCurve.ArcLength2 (method)
  ArcLength2(): number;

  // IGESGeom_OffsetCurve.NormalVector (method)
  NormalVector(): gp_Vec;

  // IGESGeom_OffsetCurve.TransformedNormalVector (method)
  TransformedNormalVector(): gp_Vec;

  // IGESGeom_OffsetCurve.Parameters (method)
  Parameters(StartParam?: number, EndParam?: number): { StartParam: number; EndParam: number };

  // IGESGeom_OffsetCurve.StartParameter (method)
  StartParameter(): number;

  // IGESGeom_OffsetCurve.EndParameter (method)
  EndParameter(): number;

  // IGESGeom_OffsetCurve.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_OffsetCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_OffsetCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_OffsetCurve.delete (method)
  delete(): void;

  // IGESGeom_OffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_OffsetSurface: declare class IGESGeom_OffsetSurface extends IGESData_IGESEntity

  // IGESGeom_OffsetSurface.constructor (constructor)
  constructor();

  // IGESGeom_OffsetSurface.Init (method)
  Init(anIndicatoR: gp_XYZ, aDistance: number, aSurface: IGESData_IGESEntity): void;

  // IGESGeom_OffsetSurface.OffsetIndicator (method)
  OffsetIndicator(): gp_Vec;

  // IGESGeom_OffsetSurface.TransformedOffsetIndicator (method)
  TransformedOffsetIndicator(): gp_Vec;

  // IGESGeom_OffsetSurface.Distance (method)
  Distance(): number;

  // IGESGeom_OffsetSurface.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESGeom_OffsetSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_OffsetSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_OffsetSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_OffsetSurface.delete (method)
  delete(): void;

  // IGESGeom_OffsetSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Plane: declare class IGESGeom_Plane extends IGESData_IGESEntity

  // IGESGeom_Plane.constructor (constructor)
  constructor();

  // IGESGeom_Plane.Init (method)
  Init(A: number, B: number, C: number, D: number, aCurve: IGESData_IGESEntity, attach: gp_XYZ, aSize: number): void;

  // IGESGeom_Plane.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESGeom_Plane.Equation (method)
  Equation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

  // IGESGeom_Plane.TransformedEquation (method)
  TransformedEquation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

  // IGESGeom_Plane.HasBoundingCurve (method)
  HasBoundingCurve(): boolean;

  // IGESGeom_Plane.HasBoundingCurveHole (method)
  HasBoundingCurveHole(): boolean;

  // IGESGeom_Plane.BoundingCurve (method)
  BoundingCurve(): IGESData_IGESEntity;

  // IGESGeom_Plane.HasSymbolAttach (method)
  HasSymbolAttach(): boolean;

  // IGESGeom_Plane.SymbolAttach (method)
  SymbolAttach(): gp_Pnt;

  // IGESGeom_Plane.TransformedSymbolAttach (method)
  TransformedSymbolAttach(): gp_Pnt;

  // IGESGeom_Plane.SymbolSize (method)
  SymbolSize(): number;

  // IGESGeom_Plane.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Plane.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Plane.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Plane.delete (method)
  delete(): void;

  // IGESGeom_Plane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Point: declare class IGESGeom_Point extends IGESData_IGESEntity

  // IGESGeom_Point.constructor (constructor)
  constructor();

  // IGESGeom_Point.Init (method)
  Init(aPoint: gp_XYZ, aSymbol: IGESBasic_SubfigureDef): void;

  // IGESGeom_Point.Value (method)
  Value(): gp_Pnt;

  // IGESGeom_Point.TransformedValue (method)
  TransformedValue(): gp_Pnt;

  // IGESGeom_Point.HasDisplaySymbol (method)
  HasDisplaySymbol(): boolean;

  // IGESGeom_Point.DisplaySymbol (method)
  DisplaySymbol(): IGESBasic_SubfigureDef;

  // IGESGeom_Point.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Point.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Point.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Point.delete (method)
  delete(): void;

  // IGESGeom_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Protocol: declare class IGESGeom_Protocol extends IGESData_Protocol

  // IGESGeom_Protocol.constructor (constructor)
  constructor();

  // IGESGeom_Protocol.NbResources (method)
  NbResources(): number;

  // IGESGeom_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESGeom_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESGeom_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_Protocol.delete (method)
  delete(): void;

  // IGESGeom_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ReadWriteModule: declare class IGESGeom_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESGeom_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESGeom_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESGeom_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESGeom_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_ReadWriteModule.delete (method)
  delete(): void;

  // IGESGeom_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_RuledSurface: declare class IGESGeom_RuledSurface extends IGESData_IGESEntity

  // IGESGeom_RuledSurface.constructor (constructor)
  constructor();

  // IGESGeom_RuledSurface.Init (method)
  Init(aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aDirFlag: number, aDevFlag: number): void;

  // IGESGeom_RuledSurface.SetRuledByParameter (method)
  SetRuledByParameter(mode: boolean): void;

  // IGESGeom_RuledSurface.IsRuledByParameter (method)
  IsRuledByParameter(): boolean;

  // IGESGeom_RuledSurface.FirstCurve (method)
  FirstCurve(): IGESData_IGESEntity;

  // IGESGeom_RuledSurface.SecondCurve (method)
  SecondCurve(): IGESData_IGESEntity;

  // IGESGeom_RuledSurface.DirectionFlag (method)
  DirectionFlag(): number;

  // IGESGeom_RuledSurface.IsDevelopable (method)
  IsDevelopable(): boolean;

  // IGESGeom_RuledSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_RuledSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_RuledSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_RuledSurface.delete (method)
  delete(): void;

  // IGESGeom_RuledSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_SpecificModule: declare class IGESGeom_SpecificModule extends IGESData_SpecificModule

  // IGESGeom_SpecificModule.constructor (constructor)
  constructor();

  // IGESGeom_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESGeom_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_SpecificModule.delete (method)
  delete(): void;

  // IGESGeom_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_SplineCurve: declare class IGESGeom_SplineCurve extends IGESData_IGESEntity

  // IGESGeom_SplineCurve.constructor (constructor)
  constructor();

  // IGESGeom_SplineCurve.Init (method)
  Init(aType: number, aDegree: number, nbDimensions: number, allBreakPoints: NCollection_HArray1_double, allXPolynomials: NCollection_HArray2_double, allYPolynomials: NCollection_HArray2_double, allZPolynomials: NCollection_HArray2_double, allXvalues: NCollection_HArray1_double, allYvalues: NCollection_HArray1_double, allZvalues: NCollection_HArray1_double): void;

  // IGESGeom_SplineCurve.SplineType (method)
  SplineType(): number;

  // IGESGeom_SplineCurve.Degree (method)
  Degree(): number;

  // IGESGeom_SplineCurve.NbDimensions (method)
  NbDimensions(): number;

  // IGESGeom_SplineCurve.NbSegments (method)
  NbSegments(): number;

  // IGESGeom_SplineCurve.BreakPoint (method)
  BreakPoint(Index: number): number;

  // IGESGeom_SplineCurve.XCoordPolynomial (method)
  XCoordPolynomial(Index: number, AX?: number, BX?: number, CX?: number, DX?: number): { AX: number; BX: number; CX: number; DX: number };

  // IGESGeom_SplineCurve.YCoordPolynomial (method)
  YCoordPolynomial(Index: number, AY?: number, BY?: number, CY?: number, DY?: number): { AY: number; BY: number; CY: number; DY: number };

  // IGESGeom_SplineCurve.ZCoordPolynomial (method)
  ZCoordPolynomial(Index: number, AZ?: number, BZ?: number, CZ?: number, DZ?: number): { AZ: number; BZ: number; CZ: number; DZ: number };

  // IGESGeom_SplineCurve.XValues (method)
  XValues(TPX0?: number, TPX1?: number, TPX2?: number, TPX3?: number): { TPX0: number; TPX1: number; TPX2: number; TPX3: number };

  // IGESGeom_SplineCurve.YValues (method)
  YValues(TPY0?: number, TPY1?: number, TPY2?: number, TPY3?: number): { TPY0: number; TPY1: number; TPY2: number; TPY3: number };

  // IGESGeom_SplineCurve.ZValues (method)
  ZValues(TPZ0?: number, TPZ1?: number, TPZ2?: number, TPZ3?: number): { TPZ0: number; TPZ1: number; TPZ2: number; TPZ3: number };

  // IGESGeom_SplineCurve.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_SplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_SplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_SplineCurve.delete (method)
  delete(): void;

  // IGESGeom_SplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_SplineSurface: declare class IGESGeom_SplineSurface extends IGESData_IGESEntity

  // IGESGeom_SplineSurface.constructor (constructor)
  constructor();

  // IGESGeom_SplineSurface.Init (method)
  Init(aBoundaryType: number, aPatchType: number, allUBreakpoints: NCollection_HArray1_double, allVBreakpoints: NCollection_HArray1_double, allXCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allYCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allZCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double): void;

  // IGESGeom_SplineSurface.NbUSegments (method)
  NbUSegments(): number;

  // IGESGeom_SplineSurface.NbVSegments (method)
  NbVSegments(): number;

  // IGESGeom_SplineSurface.BoundaryType (method)
  BoundaryType(): number;

  // IGESGeom_SplineSurface.PatchType (method)
  PatchType(): number;

  // IGESGeom_SplineSurface.UBreakPoint (method)
  UBreakPoint(anIndex: number): number;

  // IGESGeom_SplineSurface.VBreakPoint (method)
  VBreakPoint(anIndex: number): number;

  // IGESGeom_SplineSurface.XPolynomial (method)
  XPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  // IGESGeom_SplineSurface.YPolynomial (method)
  YPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  // IGESGeom_SplineSurface.ZPolynomial (method)
  ZPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  // IGESGeom_SplineSurface.Polynomials (method)
  Polynomials(): { XCoef: NCollection_HArray2_handle_NCollection_HArray1_double; YCoef: NCollection_HArray2_handle_NCollection_HArray1_double; ZCoef: NCollection_HArray2_handle_NCollection_HArray1_double; [Symbol.dispose](): void };

  // IGESGeom_SplineSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_SplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_SplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_SplineSurface.delete (method)
  delete(): void;

  // IGESGeom_SplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_SurfaceOfRevolution: declare class IGESGeom_SurfaceOfRevolution extends IGESData_IGESEntity

  // IGESGeom_SurfaceOfRevolution.constructor (constructor)
  constructor();

  // IGESGeom_SurfaceOfRevolution.Init (method)
  Init(anAxis: IGESGeom_Line, aGeneratrix: IGESData_IGESEntity, aStartAngle: number, anEndAngle: number): void;

  // IGESGeom_SurfaceOfRevolution.AxisOfRevolution (method)
  AxisOfRevolution(): IGESGeom_Line;

  // IGESGeom_SurfaceOfRevolution.Generatrix (method)
  Generatrix(): IGESData_IGESEntity;

  // IGESGeom_SurfaceOfRevolution.StartAngle (method)
  StartAngle(): number;

  // IGESGeom_SurfaceOfRevolution.EndAngle (method)
  EndAngle(): number;

  // IGESGeom_SurfaceOfRevolution.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_SurfaceOfRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_SurfaceOfRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_SurfaceOfRevolution.delete (method)
  delete(): void;

  // IGESGeom_SurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_TabulatedCylinder: declare class IGESGeom_TabulatedCylinder extends IGESData_IGESEntity

  // IGESGeom_TabulatedCylinder.constructor (constructor)
  constructor();

  // IGESGeom_TabulatedCylinder.Init (method)
  Init(aDirectrix: IGESData_IGESEntity, anEnd: gp_XYZ): void;

  // IGESGeom_TabulatedCylinder.Directrix (method)
  Directrix(): IGESData_IGESEntity;

  // IGESGeom_TabulatedCylinder.EndPoint (method)
  EndPoint(): gp_Pnt;

  // IGESGeom_TabulatedCylinder.TransformedEndPoint (method)
  TransformedEndPoint(): gp_Pnt;

  // IGESGeom_TabulatedCylinder.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_TabulatedCylinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_TabulatedCylinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_TabulatedCylinder.delete (method)
  delete(): void;

  // IGESGeom_TabulatedCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolBSplineCurve: declare class IGESGeom_ToolBSplineCurve

  // IGESGeom_ToolBSplineCurve.constructor (constructor)
  constructor();

  // IGESGeom_ToolBSplineCurve.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_BSplineCurve, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolBSplineCurve.DirChecker (method)
  DirChecker(ent: IGESGeom_BSplineCurve): IGESData_DirChecker;

  // IGESGeom_ToolBSplineCurve.OwnCheck (method)
  OwnCheck(ent: IGESGeom_BSplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolBSplineCurve.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_BSplineCurve, entto: IGESGeom_BSplineCurve, TC: Interface_CopyTool): void;

  // IGESGeom_ToolBSplineCurve.delete (method)
  delete(): void;

  // IGESGeom_ToolBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolBSplineSurface: declare class IGESGeom_ToolBSplineSurface

  // IGESGeom_ToolBSplineSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolBSplineSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_BSplineSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolBSplineSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_BSplineSurface): IGESData_DirChecker;

  // IGESGeom_ToolBSplineSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_BSplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolBSplineSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_BSplineSurface, entto: IGESGeom_BSplineSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolBSplineSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolBoundary: declare class IGESGeom_ToolBoundary

  // IGESGeom_ToolBoundary.constructor (constructor)
  constructor();

  // IGESGeom_ToolBoundary.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Boundary, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolBoundary.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_Boundary): boolean;

  // IGESGeom_ToolBoundary.DirChecker (method)
  DirChecker(ent: IGESGeom_Boundary): IGESData_DirChecker;

  // IGESGeom_ToolBoundary.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Boundary, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolBoundary.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Boundary, entto: IGESGeom_Boundary, TC: Interface_CopyTool): void;

  // IGESGeom_ToolBoundary.delete (method)
  delete(): void;

  // IGESGeom_ToolBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolBoundedSurface: declare class IGESGeom_ToolBoundedSurface

  // IGESGeom_ToolBoundedSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolBoundedSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_BoundedSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolBoundedSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_BoundedSurface): IGESData_DirChecker;

  // IGESGeom_ToolBoundedSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_BoundedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolBoundedSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_BoundedSurface, entto: IGESGeom_BoundedSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolBoundedSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolBoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolCircularArc: declare class IGESGeom_ToolCircularArc

  // IGESGeom_ToolCircularArc.constructor (constructor)
  constructor();

  // IGESGeom_ToolCircularArc.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_CircularArc, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolCircularArc.DirChecker (method)
  DirChecker(ent: IGESGeom_CircularArc): IGESData_DirChecker;

  // IGESGeom_ToolCircularArc.OwnCheck (method)
  OwnCheck(ent: IGESGeom_CircularArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolCircularArc.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_CircularArc, entto: IGESGeom_CircularArc, TC: Interface_CopyTool): void;

  // IGESGeom_ToolCircularArc.delete (method)
  delete(): void;

  // IGESGeom_ToolCircularArc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
