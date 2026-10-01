# libcascade — StepShape (2)

36 top-level symbols. Signatures are verbatim typescript.

StepShape_FacetedBrepAndBrepWithVoids: declare class StepShape_FacetedBrepAndBrepWithVoids extends StepShape_ManifoldSolidBrep

  // StepShape_FacetedBrepAndBrepWithVoids.constructor (constructor)
  constructor();

  // StepShape_FacetedBrepAndBrepWithVoids.Init (method)
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aFacetedBrep: StepShape_FacetedBrep, aBrepWithVoids: StepShape_BrepWithVoids): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_FacetedBrepAndBrepWithVoids.SetFacetedBrep (method)
  SetFacetedBrep(aFacetedBrep: StepShape_FacetedBrep): void;

  // StepShape_FacetedBrepAndBrepWithVoids.FacetedBrep (method)
  FacetedBrep(): StepShape_FacetedBrep;

  // StepShape_FacetedBrepAndBrepWithVoids.SetBrepWithVoids (method)
  SetBrepWithVoids(aBrepWithVoids: StepShape_BrepWithVoids): void;

  // StepShape_FacetedBrepAndBrepWithVoids.BrepWithVoids (method)
  BrepWithVoids(): StepShape_BrepWithVoids;

  // StepShape_FacetedBrepAndBrepWithVoids.SetVoids (method)
  SetVoids(aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;

  // StepShape_FacetedBrepAndBrepWithVoids.Voids (method)
  Voids(): NCollection_HArray1_handle_StepShape_OrientedClosedShell;

  // StepShape_FacetedBrepAndBrepWithVoids.VoidsValue (method)
  VoidsValue(num: number): StepShape_OrientedClosedShell;

  // StepShape_FacetedBrepAndBrepWithVoids.NbVoids (method)
  NbVoids(): number;

  // StepShape_FacetedBrepAndBrepWithVoids.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FacetedBrepAndBrepWithVoids.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FacetedBrepAndBrepWithVoids.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FacetedBrepAndBrepWithVoids.delete (method)
  delete(): void;

  // StepShape_FacetedBrepAndBrepWithVoids.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FacetedBrepShapeRepresentation: declare class StepShape_FacetedBrepShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_FacetedBrepShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_FacetedBrepShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FacetedBrepShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FacetedBrepShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FacetedBrepShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_FacetedBrepShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_GeometricCurveSet: declare class StepShape_GeometricCurveSet extends StepShape_GeometricSet

  // StepShape_GeometricCurveSet.constructor (constructor)
  constructor();

  // StepShape_GeometricCurveSet.get_type_name (method)
  static get_type_name(): string;

  // StepShape_GeometricCurveSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_GeometricCurveSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_GeometricCurveSet.delete (method)
  delete(): void;

  // StepShape_GeometricCurveSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_GeometricSet: declare class StepShape_GeometricSet extends StepGeom_GeometricRepresentationItem

  // StepShape_GeometricSet.constructor (constructor)
  constructor();

  // StepShape_GeometricSet.Init (method)
  Init(aName: TCollection_HAsciiString, aElements: NCollection_HArray1_StepShape_GeometricSetSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_GeometricSet.SetElements (method)
  SetElements(aElements: NCollection_HArray1_StepShape_GeometricSetSelect): void;

  // StepShape_GeometricSet.Elements (method)
  Elements(): NCollection_HArray1_StepShape_GeometricSetSelect;

  // StepShape_GeometricSet.ElementsValue (method)
  ElementsValue(num: number): StepShape_GeometricSetSelect;

  // StepShape_GeometricSet.NbElements (method)
  NbElements(): number;

  // StepShape_GeometricSet.get_type_name (method)
  static get_type_name(): string;

  // StepShape_GeometricSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_GeometricSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_GeometricSet.delete (method)
  delete(): void;

  // StepShape_GeometricSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_GeometricSetSelect: declare class StepShape_GeometricSetSelect extends StepData_SelectType

  // StepShape_GeometricSetSelect.constructor (constructor)
  constructor();

  // StepShape_GeometricSetSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_GeometricSetSelect.Point (method)
  Point(): StepGeom_Point;

  // StepShape_GeometricSetSelect.Curve (method)
  Curve(): StepGeom_Curve;

  // StepShape_GeometricSetSelect.Surface (method)
  Surface(): StepGeom_Surface;

  // StepShape_GeometricSetSelect.delete (method)
  delete(): void;

  // StepShape_GeometricSetSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_GeometricallyBoundedSurfaceShapeRepresentation: declare class StepShape_GeometricallyBoundedSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_GeometricallyBoundedSurfaceShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_GeometricallyBoundedWireframeShapeRepresentation: declare class StepShape_GeometricallyBoundedWireframeShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_GeometricallyBoundedWireframeShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_HalfSpaceSolid: declare class StepShape_HalfSpaceSolid extends StepGeom_GeometricRepresentationItem

  // StepShape_HalfSpaceSolid.constructor (constructor)
  constructor();

  // StepShape_HalfSpaceSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_HalfSpaceSolid.SetBaseSurface (method)
  SetBaseSurface(aBaseSurface: StepGeom_Surface): void;

  // StepShape_HalfSpaceSolid.BaseSurface (method)
  BaseSurface(): StepGeom_Surface;

  // StepShape_HalfSpaceSolid.SetAgreementFlag (method)
  SetAgreementFlag(aAgreementFlag: boolean): void;

  // StepShape_HalfSpaceSolid.AgreementFlag (method)
  AgreementFlag(): boolean;

  // StepShape_HalfSpaceSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_HalfSpaceSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_HalfSpaceSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_HalfSpaceSolid.delete (method)
  delete(): void;

  // StepShape_HalfSpaceSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_LimitsAndFits: declare class StepShape_LimitsAndFits extends Standard_Transient

  // StepShape_LimitsAndFits.constructor (constructor)
  constructor();

  // StepShape_LimitsAndFits.Init (method)
  Init(form_variance: TCollection_HAsciiString, zone_variance: TCollection_HAsciiString, grade: TCollection_HAsciiString, source: TCollection_HAsciiString): void;

  // StepShape_LimitsAndFits.FormVariance (method)
  FormVariance(): TCollection_HAsciiString;

  // StepShape_LimitsAndFits.SetFormVariance (method)
  SetFormVariance(form_variance: TCollection_HAsciiString): void;

  // StepShape_LimitsAndFits.ZoneVariance (method)
  ZoneVariance(): TCollection_HAsciiString;

  // StepShape_LimitsAndFits.SetZoneVariance (method)
  SetZoneVariance(zone_variance: TCollection_HAsciiString): void;

  // StepShape_LimitsAndFits.Grade (method)
  Grade(): TCollection_HAsciiString;

  // StepShape_LimitsAndFits.SetGrade (method)
  SetGrade(grade: TCollection_HAsciiString): void;

  // StepShape_LimitsAndFits.Source (method)
  Source(): TCollection_HAsciiString;

  // StepShape_LimitsAndFits.SetSource (method)
  SetSource(source: TCollection_HAsciiString): void;

  // StepShape_LimitsAndFits.get_type_name (method)
  static get_type_name(): string;

  // StepShape_LimitsAndFits.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_LimitsAndFits.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_LimitsAndFits.delete (method)
  delete(): void;

  // StepShape_LimitsAndFits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Loop: declare class StepShape_Loop extends StepShape_TopologicalRepresentationItem

  // StepShape_Loop.constructor (constructor)
  constructor();

  // StepShape_Loop.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Loop.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Loop.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Loop.delete (method)
  delete(): void;

  // StepShape_Loop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_LoopAndPath: declare class StepShape_LoopAndPath extends StepShape_TopologicalRepresentationItem

  // StepShape_LoopAndPath.constructor (constructor)
  constructor();

  // StepShape_LoopAndPath.Init (method)
  Init(aName: TCollection_HAsciiString, aLoop: StepShape_Loop, aPath: StepShape_Path): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_LoopAndPath.SetLoop (method)
  SetLoop(aLoop: StepShape_Loop): void;

  // StepShape_LoopAndPath.Loop (method)
  Loop(): StepShape_Loop;

  // StepShape_LoopAndPath.SetPath (method)
  SetPath(aPath: StepShape_Path): void;

  // StepShape_LoopAndPath.Path (method)
  Path(): StepShape_Path;

  // StepShape_LoopAndPath.SetEdgeList (method)
  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  // StepShape_LoopAndPath.EdgeList (method)
  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  // StepShape_LoopAndPath.EdgeListValue (method)
  EdgeListValue(num: number): StepShape_OrientedEdge;

  // StepShape_LoopAndPath.NbEdgeList (method)
  NbEdgeList(): number;

  // StepShape_LoopAndPath.get_type_name (method)
  static get_type_name(): string;

  // StepShape_LoopAndPath.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_LoopAndPath.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_LoopAndPath.delete (method)
  delete(): void;

  // StepShape_LoopAndPath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ManifoldSolidBrep: declare class StepShape_ManifoldSolidBrep extends StepShape_SolidModel

  // StepShape_ManifoldSolidBrep.constructor (constructor)
  constructor();

  // StepShape_ManifoldSolidBrep.Init (method)
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ManifoldSolidBrep.SetOuter (method)
  SetOuter(aOuter: StepShape_ConnectedFaceSet): void;

  // StepShape_ManifoldSolidBrep.Outer (method)
  Outer(): StepShape_ConnectedFaceSet;

  // StepShape_ManifoldSolidBrep.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ManifoldSolidBrep.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ManifoldSolidBrep.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ManifoldSolidBrep.delete (method)
  delete(): void;

  // StepShape_ManifoldSolidBrep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ManifoldSurfaceShapeRepresentation: declare class StepShape_ManifoldSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_ManifoldSurfaceShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_ManifoldSurfaceShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ManifoldSurfaceShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ManifoldSurfaceShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ManifoldSurfaceShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_ManifoldSurfaceShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_MeasureQualification: declare class StepShape_MeasureQualification extends Standard_Transient

  // StepShape_MeasureQualification.constructor (constructor)
  constructor();

  // StepShape_MeasureQualification.Init (method)
  Init(name: TCollection_HAsciiString, description: TCollection_HAsciiString, qualified_measure: Standard_Transient, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

  // StepShape_MeasureQualification.Name (method)
  Name(): TCollection_HAsciiString;

  // StepShape_MeasureQualification.SetName (method)
  SetName(name: TCollection_HAsciiString): void;

  // StepShape_MeasureQualification.Description (method)
  Description(): TCollection_HAsciiString;

  // StepShape_MeasureQualification.SetDescription (method)
  SetDescription(description: TCollection_HAsciiString): void;

  // StepShape_MeasureQualification.QualifiedMeasure (method)
  QualifiedMeasure(): Standard_Transient;

  // StepShape_MeasureQualification.SetQualifiedMeasure (method)
  SetQualifiedMeasure(qualified_measure: Standard_Transient): void;

  // StepShape_MeasureQualification.Qualifiers (method)
  Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

  // StepShape_MeasureQualification.NbQualifiers (method)
  NbQualifiers(): number;

  // StepShape_MeasureQualification.SetQualifiers (method)
  SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

  // StepShape_MeasureQualification.QualifiersValue (method)
  QualifiersValue(num: number): StepShape_ValueQualifier;

  // StepShape_MeasureQualification.SetQualifiersValue (method)
  SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

  // StepShape_MeasureQualification.get_type_name (method)
  static get_type_name(): string;

  // StepShape_MeasureQualification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_MeasureQualification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_MeasureQualification.delete (method)
  delete(): void;

  // StepShape_MeasureQualification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem: declare class StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem extends StepRepr_RepresentationItem

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.constructor (constructor)
  constructor();

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.SetMeasure (method)
  SetMeasure(Measure: StepBasic_MeasureWithUnit): void;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.Measure (method)
  Measure(): StepBasic_MeasureWithUnit;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.Qualifiers (method)
  Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.NbQualifiers (method)
  NbQualifiers(): number;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.SetQualifiers (method)
  SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.QualifiersValue (method)
  QualifiersValue(num: number): StepShape_ValueQualifier;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.SetQualifiersValue (method)
  SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.delete (method)
  delete(): void;

  // StepShape_MeasureRepresentationItemAndQualifiedRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_NonManifoldSurfaceShapeRepresentation: declare class StepShape_NonManifoldSurfaceShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_NonManifoldSurfaceShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_NonManifoldSurfaceShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_NonManifoldSurfaceShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_NonManifoldSurfaceShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_NonManifoldSurfaceShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_NonManifoldSurfaceShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OpenShell: declare class StepShape_OpenShell extends StepShape_ConnectedFaceSet

  // StepShape_OpenShell.constructor (constructor)
  constructor();

  // StepShape_OpenShell.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OpenShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OpenShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OpenShell.delete (method)
  delete(): void;

  // StepShape_OpenShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OrientedClosedShell: declare class StepShape_OrientedClosedShell extends StepShape_ClosedShell

  // StepShape_OrientedClosedShell.constructor (constructor)
  constructor();

  // StepShape_OrientedClosedShell.Init (method)
  Init(aName: TCollection_HAsciiString, aClosedShellElement: StepShape_ClosedShell, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_OrientedClosedShell.SetClosedShellElement (method)
  SetClosedShellElement(aClosedShellElement: StepShape_ClosedShell): void;

  // StepShape_OrientedClosedShell.ClosedShellElement (method)
  ClosedShellElement(): StepShape_ClosedShell;

  // StepShape_OrientedClosedShell.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_OrientedClosedShell.Orientation (method)
  Orientation(): boolean;

  // StepShape_OrientedClosedShell.SetCfsFaces (method)
  SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

  // StepShape_OrientedClosedShell.CfsFaces (method)
  CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

  // StepShape_OrientedClosedShell.CfsFacesValue (method)
  CfsFacesValue(num: number): StepShape_Face;

  // StepShape_OrientedClosedShell.NbCfsFaces (method)
  NbCfsFaces(): number;

  // StepShape_OrientedClosedShell.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OrientedClosedShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OrientedClosedShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OrientedClosedShell.delete (method)
  delete(): void;

  // StepShape_OrientedClosedShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OrientedEdge: declare class StepShape_OrientedEdge extends StepShape_Edge

  // StepShape_OrientedEdge.constructor (constructor)
  constructor();

  // StepShape_OrientedEdge.Init (method)
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_OrientedEdge.SetEdgeElement (method)
  SetEdgeElement(aEdgeElement: StepShape_Edge): void;

  // StepShape_OrientedEdge.EdgeElement (method)
  EdgeElement(): StepShape_Edge;

  // StepShape_OrientedEdge.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_OrientedEdge.Orientation (method)
  Orientation(): boolean;

  // StepShape_OrientedEdge.SetEdgeStart (method)
  SetEdgeStart(aEdgeStart: StepShape_Vertex): void;

  // StepShape_OrientedEdge.EdgeStart (method)
  EdgeStart(): StepShape_Vertex;

  // StepShape_OrientedEdge.SetEdgeEnd (method)
  SetEdgeEnd(aEdgeEnd: StepShape_Vertex): void;

  // StepShape_OrientedEdge.EdgeEnd (method)
  EdgeEnd(): StepShape_Vertex;

  // StepShape_OrientedEdge.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OrientedEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OrientedEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OrientedEdge.delete (method)
  delete(): void;

  // StepShape_OrientedEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OrientedFace: declare class StepShape_OrientedFace extends StepShape_Face

  // StepShape_OrientedFace.constructor (constructor)
  constructor();

  // StepShape_OrientedFace.Init (method)
  Init(aName: TCollection_HAsciiString, aFaceElement: StepShape_Face, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_OrientedFace.SetFaceElement (method)
  SetFaceElement(aFaceElement: StepShape_Face): void;

  // StepShape_OrientedFace.FaceElement (method)
  FaceElement(): StepShape_Face;

  // StepShape_OrientedFace.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_OrientedFace.Orientation (method)
  Orientation(): boolean;

  // StepShape_OrientedFace.SetBounds (method)
  SetBounds(aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;

  // StepShape_OrientedFace.Bounds (method)
  Bounds(): NCollection_HArray1_handle_StepShape_FaceBound;

  // StepShape_OrientedFace.BoundsValue (method)
  BoundsValue(num: number): StepShape_FaceBound;

  // StepShape_OrientedFace.NbBounds (method)
  NbBounds(): number;

  // StepShape_OrientedFace.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OrientedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OrientedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OrientedFace.delete (method)
  delete(): void;

  // StepShape_OrientedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OrientedOpenShell: declare class StepShape_OrientedOpenShell extends StepShape_OpenShell

  // StepShape_OrientedOpenShell.constructor (constructor)
  constructor();

  // StepShape_OrientedOpenShell.Init (method)
  Init(aName: TCollection_HAsciiString, aOpenShellElement: StepShape_OpenShell, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_OrientedOpenShell.SetOpenShellElement (method)
  SetOpenShellElement(aOpenShellElement: StepShape_OpenShell): void;

  // StepShape_OrientedOpenShell.OpenShellElement (method)
  OpenShellElement(): StepShape_OpenShell;

  // StepShape_OrientedOpenShell.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_OrientedOpenShell.Orientation (method)
  Orientation(): boolean;

  // StepShape_OrientedOpenShell.SetCfsFaces (method)
  SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

  // StepShape_OrientedOpenShell.CfsFaces (method)
  CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

  // StepShape_OrientedOpenShell.CfsFacesValue (method)
  CfsFacesValue(num: number): StepShape_Face;

  // StepShape_OrientedOpenShell.NbCfsFaces (method)
  NbCfsFaces(): number;

  // StepShape_OrientedOpenShell.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OrientedOpenShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OrientedOpenShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OrientedOpenShell.delete (method)
  delete(): void;

  // StepShape_OrientedOpenShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_OrientedPath: declare class StepShape_OrientedPath extends StepShape_Path

  // StepShape_OrientedPath.constructor (constructor)
  constructor();

  // StepShape_OrientedPath.Init (method)
  Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_OrientedPath.SetPathElement (method)
  SetPathElement(aPathElement: StepShape_EdgeLoop): void;

  // StepShape_OrientedPath.PathElement (method)
  PathElement(): StepShape_EdgeLoop;

  // StepShape_OrientedPath.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_OrientedPath.Orientation (method)
  Orientation(): boolean;

  // StepShape_OrientedPath.SetEdgeList (method)
  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  // StepShape_OrientedPath.EdgeList (method)
  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  // StepShape_OrientedPath.EdgeListValue (method)
  EdgeListValue(num: number): StepShape_OrientedEdge;

  // StepShape_OrientedPath.NbEdgeList (method)
  NbEdgeList(): number;

  // StepShape_OrientedPath.get_type_name (method)
  static get_type_name(): string;

  // StepShape_OrientedPath.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_OrientedPath.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_OrientedPath.delete (method)
  delete(): void;

  // StepShape_OrientedPath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Path: declare class StepShape_Path extends StepShape_TopologicalRepresentationItem

  // StepShape_Path.constructor (constructor)
  constructor();

  // StepShape_Path.Init (method)
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Path.SetEdgeList (method)
  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  // StepShape_Path.EdgeList (method)
  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  // StepShape_Path.EdgeListValue (method)
  EdgeListValue(num: number): StepShape_OrientedEdge;

  // StepShape_Path.NbEdgeList (method)
  NbEdgeList(): number;

  // StepShape_Path.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Path.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Path.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Path.delete (method)
  delete(): void;

  // StepShape_Path.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_PlusMinusTolerance: declare class StepShape_PlusMinusTolerance extends Standard_Transient

  // StepShape_PlusMinusTolerance.constructor (constructor)
  constructor();

  // StepShape_PlusMinusTolerance.Init (method)
  Init(range: StepShape_ToleranceMethodDefinition, toleranced_dimension: StepShape_DimensionalCharacteristic): void;

  // StepShape_PlusMinusTolerance.Range (method)
  Range(): StepShape_ToleranceMethodDefinition;

  // StepShape_PlusMinusTolerance.SetRange (method)
  SetRange(range: StepShape_ToleranceMethodDefinition): void;

  // StepShape_PlusMinusTolerance.TolerancedDimension (method)
  TolerancedDimension(): StepShape_DimensionalCharacteristic;

  // StepShape_PlusMinusTolerance.SetTolerancedDimension (method)
  SetTolerancedDimension(toleranced_dimension: StepShape_DimensionalCharacteristic): void;

  // StepShape_PlusMinusTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepShape_PlusMinusTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_PlusMinusTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_PlusMinusTolerance.delete (method)
  delete(): void;

  // StepShape_PlusMinusTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_PointRepresentation: declare class StepShape_PointRepresentation extends StepShape_ShapeRepresentation

  // StepShape_PointRepresentation.constructor (constructor)
  constructor();

  // StepShape_PointRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_PointRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_PointRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_PointRepresentation.delete (method)
  delete(): void;

  // StepShape_PointRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_PolyLoop: declare class StepShape_PolyLoop extends StepShape_Loop

  // StepShape_PolyLoop.constructor (constructor)
  constructor();

  // StepShape_PolyLoop.Init (method)
  Init(aName: TCollection_HAsciiString, aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_PolyLoop.SetPolygon (method)
  SetPolygon(aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  // StepShape_PolyLoop.Polygon (method)
  Polygon(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  // StepShape_PolyLoop.PolygonValue (method)
  PolygonValue(num: number): StepGeom_CartesianPoint;

  // StepShape_PolyLoop.NbPolygon (method)
  NbPolygon(): number;

  // StepShape_PolyLoop.get_type_name (method)
  static get_type_name(): string;

  // StepShape_PolyLoop.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_PolyLoop.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_PolyLoop.delete (method)
  delete(): void;

  // StepShape_PolyLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_PrecisionQualifier: declare class StepShape_PrecisionQualifier extends Standard_Transient

  // StepShape_PrecisionQualifier.constructor (constructor)
  constructor();

  // StepShape_PrecisionQualifier.Init (method)
  Init(precision_value: number): void;

  // StepShape_PrecisionQualifier.PrecisionValue (method)
  PrecisionValue(): number;

  // StepShape_PrecisionQualifier.SetPrecisionValue (method)
  SetPrecisionValue(precision_value: number): void;

  // StepShape_PrecisionQualifier.get_type_name (method)
  static get_type_name(): string;

  // StepShape_PrecisionQualifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_PrecisionQualifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_PrecisionQualifier.delete (method)
  delete(): void;

  // StepShape_PrecisionQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_QualifiedRepresentationItem: declare class StepShape_QualifiedRepresentationItem extends StepRepr_RepresentationItem

  // StepShape_QualifiedRepresentationItem.constructor (constructor)
  constructor();

  // StepShape_QualifiedRepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_QualifiedRepresentationItem.Qualifiers (method)
  Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

  // StepShape_QualifiedRepresentationItem.NbQualifiers (method)
  NbQualifiers(): number;

  // StepShape_QualifiedRepresentationItem.SetQualifiers (method)
  SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

  // StepShape_QualifiedRepresentationItem.QualifiersValue (method)
  QualifiersValue(num: number): StepShape_ValueQualifier;

  // StepShape_QualifiedRepresentationItem.SetQualifiersValue (method)
  SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

  // StepShape_QualifiedRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepShape_QualifiedRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_QualifiedRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_QualifiedRepresentationItem.delete (method)
  delete(): void;

  // StepShape_QualifiedRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ReversibleTopologyItem: declare class StepShape_ReversibleTopologyItem extends StepData_SelectType

  // StepShape_ReversibleTopologyItem.constructor (constructor)
  constructor();

  // StepShape_ReversibleTopologyItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_ReversibleTopologyItem.Edge (method)
  Edge(): StepShape_Edge;

  // StepShape_ReversibleTopologyItem.Path (method)
  Path(): StepShape_Path;

  // StepShape_ReversibleTopologyItem.Face (method)
  Face(): StepShape_Face;

  // StepShape_ReversibleTopologyItem.FaceBound (method)
  FaceBound(): StepShape_FaceBound;

  // StepShape_ReversibleTopologyItem.ClosedShell (method)
  ClosedShell(): StepShape_ClosedShell;

  // StepShape_ReversibleTopologyItem.OpenShell (method)
  OpenShell(): StepShape_OpenShell;

  // StepShape_ReversibleTopologyItem.delete (method)
  delete(): void;

  // StepShape_ReversibleTopologyItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_RevolvedAreaSolid: declare class StepShape_RevolvedAreaSolid extends StepShape_SweptAreaSolid

  // StepShape_RevolvedAreaSolid.constructor (constructor)
  constructor();

  // StepShape_RevolvedAreaSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_RevolvedAreaSolid.SetAxis (method)
  SetAxis(aAxis: StepGeom_Axis1Placement): void;

  // StepShape_RevolvedAreaSolid.Axis (method)
  Axis(): StepGeom_Axis1Placement;

  // StepShape_RevolvedAreaSolid.SetAngle (method)
  SetAngle(aAngle: number): void;

  // StepShape_RevolvedAreaSolid.Angle (method)
  Angle(): number;

  // StepShape_RevolvedAreaSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_RevolvedAreaSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_RevolvedAreaSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_RevolvedAreaSolid.delete (method)
  delete(): void;

  // StepShape_RevolvedAreaSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_RevolvedFaceSolid: declare class StepShape_RevolvedFaceSolid extends StepShape_SweptFaceSolid

  // StepShape_RevolvedFaceSolid.constructor (constructor)
  constructor();

  // StepShape_RevolvedFaceSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_RevolvedFaceSolid.SetAxis (method)
  SetAxis(aAxis: StepGeom_Axis1Placement): void;

  // StepShape_RevolvedFaceSolid.Axis (method)
  Axis(): StepGeom_Axis1Placement;

  // StepShape_RevolvedFaceSolid.SetAngle (method)
  SetAngle(aAngle: number): void;

  // StepShape_RevolvedFaceSolid.Angle (method)
  Angle(): number;

  // StepShape_RevolvedFaceSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_RevolvedFaceSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_RevolvedFaceSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_RevolvedFaceSolid.delete (method)
  delete(): void;

  // StepShape_RevolvedFaceSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_RightAngularWedge: declare class StepShape_RightAngularWedge extends StepGeom_GeometricRepresentationItem

  // StepShape_RightAngularWedge.constructor (constructor)
  constructor();

  // StepShape_RightAngularWedge.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number, aLtx: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_RightAngularWedge.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

  // StepShape_RightAngularWedge.Position (method)
  Position(): StepGeom_Axis2Placement3d;

  // StepShape_RightAngularWedge.SetX (method)
  SetX(aX: number): void;

  // StepShape_RightAngularWedge.X (method)
  X(): number;

  // StepShape_RightAngularWedge.SetY (method)
  SetY(aY: number): void;

  // StepShape_RightAngularWedge.Y (method)
  Y(): number;

  // StepShape_RightAngularWedge.SetZ (method)
  SetZ(aZ: number): void;

  // StepShape_RightAngularWedge.Z (method)
  Z(): number;

  // StepShape_RightAngularWedge.SetLtx (method)
  SetLtx(aLtx: number): void;

  // StepShape_RightAngularWedge.Ltx (method)
  Ltx(): number;

  // StepShape_RightAngularWedge.get_type_name (method)
  static get_type_name(): string;

  // StepShape_RightAngularWedge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_RightAngularWedge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_RightAngularWedge.delete (method)
  delete(): void;

  // StepShape_RightAngularWedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_RightCircularCone: declare class StepShape_RightCircularCone extends StepGeom_GeometricRepresentationItem

  // StepShape_RightCircularCone.constructor (constructor)
  constructor();

  // StepShape_RightCircularCone.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_RightCircularCone.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  // StepShape_RightCircularCone.Position (method)
  Position(): StepGeom_Axis1Placement;

  // StepShape_RightCircularCone.SetHeight (method)
  SetHeight(aHeight: number): void;

  // StepShape_RightCircularCone.Height (method)
  Height(): number;

  // StepShape_RightCircularCone.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepShape_RightCircularCone.Radius (method)
  Radius(): number;

  // StepShape_RightCircularCone.SetSemiAngle (method)
  SetSemiAngle(aSemiAngle: number): void;

  // StepShape_RightCircularCone.SemiAngle (method)
  SemiAngle(): number;

  // StepShape_RightCircularCone.get_type_name (method)
  static get_type_name(): string;

  // StepShape_RightCircularCone.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_RightCircularCone.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_RightCircularCone.delete (method)
  delete(): void;

  // StepShape_RightCircularCone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_RightCircularCylinder: declare class StepShape_RightCircularCylinder extends StepGeom_GeometricRepresentationItem

  // StepShape_RightCircularCylinder.constructor (constructor)
  constructor();

  // StepShape_RightCircularCylinder.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_RightCircularCylinder.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  // StepShape_RightCircularCylinder.Position (method)
  Position(): StepGeom_Axis1Placement;

  // StepShape_RightCircularCylinder.SetHeight (method)
  SetHeight(aHeight: number): void;

  // StepShape_RightCircularCylinder.Height (method)
  Height(): number;

  // StepShape_RightCircularCylinder.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepShape_RightCircularCylinder.Radius (method)
  Radius(): number;

  // StepShape_RightCircularCylinder.get_type_name (method)
  static get_type_name(): string;

  // StepShape_RightCircularCylinder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_RightCircularCylinder.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_RightCircularCylinder.delete (method)
  delete(): void;

  // StepShape_RightCircularCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SeamEdge: declare class StepShape_SeamEdge extends StepShape_OrientedEdge

  // StepShape_SeamEdge.constructor (constructor)
  constructor();

  // StepShape_SeamEdge.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_SeamEdge.PcurveReference (method)
  PcurveReference(): StepGeom_Pcurve;

  // StepShape_SeamEdge.SetPcurveReference (method)
  SetPcurveReference(PcurveReference: StepGeom_Pcurve): void;

  // StepShape_SeamEdge.get_type_name (method)
  static get_type_name(): string;

  // StepShape_SeamEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_SeamEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_SeamEdge.delete (method)
  delete(): void;

  // StepShape_SeamEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ShapeDefinitionRepresentation: declare class StepShape_ShapeDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

  // StepShape_ShapeDefinitionRepresentation.constructor (constructor)
  constructor();

  // StepShape_ShapeDefinitionRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ShapeDefinitionRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ShapeDefinitionRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ShapeDefinitionRepresentation.delete (method)
  delete(): void;

  // StepShape_ShapeDefinitionRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
