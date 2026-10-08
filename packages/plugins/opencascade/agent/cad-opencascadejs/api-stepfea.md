# libcascade — StepFEA

41 top-level symbols. Signatures are verbatim typescript.

StepFEA_AlignedCurve3dElementCoordinateSystem: declare class StepFEA_AlignedCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_AlignedCurve3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_AlignedCurve3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.CoordinateSystem (method)
  CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.SetCoordinateSystem (method)
  SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_AlignedCurve3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_AlignedSurface3dElementCoordinateSystem: declare class StepFEA_AlignedSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_AlignedSurface3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_AlignedSurface3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.CoordinateSystem (method)
  CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.SetCoordinateSystem (method)
  SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_AlignedSurface3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ArbitraryVolume3dElementCoordinateSystem: declare class StepFEA_ArbitraryVolume3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinateSystem: StepFEA_FeaAxis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.CoordinateSystem (method)
  CoordinateSystem(): StepFEA_FeaAxis2Placement3d;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.SetCoordinateSystem (method)
  SetCoordinateSystem(CoordinateSystem: StepFEA_FeaAxis2Placement3d): void;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_ArbitraryVolume3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ConstantSurface3dElementCoordinateSystem: declare class StepFEA_ConstantSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_ConstantSurface3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_ConstantSurface3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.Axis (method)
  Axis(): number;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.SetAxis (method)
  SetAxis(Axis: number): void;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.Angle (method)
  Angle(): number;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.SetAngle (method)
  SetAngle(Angle: number): void;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_ConstantSurface3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CoordinateSystemType: typeof StepFEA_CoordinateSystemType[keyof typeof StepFEA_CoordinateSystemType]

  readonly StepFEA_Cartesian: 'StepFEA_Cartesian'

  readonly StepFEA_Cylindrical: 'StepFEA_Cylindrical'

  readonly StepFEA_Spherical: 'StepFEA_Spherical'

StepFEA_Curve3dElementProperty: declare class StepFEA_Curve3dElementProperty extends Standard_Transient

  // StepFEA_Curve3dElementProperty.constructor (constructor)
  constructor();

  // StepFEA_Curve3dElementProperty.Init (method)
  Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aIntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval, aEndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset, aEndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

  // StepFEA_Curve3dElementProperty.PropertyId (method)
  PropertyId(): TCollection_HAsciiString;

  // StepFEA_Curve3dElementProperty.SetPropertyId (method)
  SetPropertyId(PropertyId: TCollection_HAsciiString): void;

  // StepFEA_Curve3dElementProperty.Description (method)
  Description(): TCollection_HAsciiString;

  // StepFEA_Curve3dElementProperty.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepFEA_Curve3dElementProperty.IntervalDefinitions (method)
  IntervalDefinitions(): NCollection_HArray1_handle_StepFEA_CurveElementInterval;

  // StepFEA_Curve3dElementProperty.SetIntervalDefinitions (method)
  SetIntervalDefinitions(IntervalDefinitions: NCollection_HArray1_handle_StepFEA_CurveElementInterval): void;

  // StepFEA_Curve3dElementProperty.EndOffsets (method)
  EndOffsets(): NCollection_HArray1_handle_StepFEA_CurveElementEndOffset;

  // StepFEA_Curve3dElementProperty.SetEndOffsets (method)
  SetEndOffsets(EndOffsets: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset): void;

  // StepFEA_Curve3dElementProperty.EndReleases (method)
  EndReleases(): NCollection_HArray1_handle_StepFEA_CurveElementEndRelease;

  // StepFEA_Curve3dElementProperty.SetEndReleases (method)
  SetEndReleases(EndReleases: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease): void;

  // StepFEA_Curve3dElementProperty.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_Curve3dElementProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_Curve3dElementProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_Curve3dElementProperty.delete (method)
  delete(): void;

  // StepFEA_Curve3dElementProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_Curve3dElementRepresentation: declare class StepFEA_Curve3dElementRepresentation extends StepFEA_ElementRepresentation

  // StepFEA_Curve3dElementRepresentation.constructor (constructor)
  constructor();

  // StepFEA_Curve3dElementRepresentation.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Curve3dElementDescriptor, aProperty: StepFEA_Curve3dElementProperty, aMaterial: StepElement_ElementMaterial): void;
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_Curve3dElementRepresentation.ModelRef (method)
  ModelRef(): StepFEA_FeaModel3d;

  // StepFEA_Curve3dElementRepresentation.SetModelRef (method)
  SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

  // StepFEA_Curve3dElementRepresentation.ElementDescriptor (method)
  ElementDescriptor(): StepElement_Curve3dElementDescriptor;

  // StepFEA_Curve3dElementRepresentation.SetElementDescriptor (method)
  SetElementDescriptor(ElementDescriptor: StepElement_Curve3dElementDescriptor): void;

  // StepFEA_Curve3dElementRepresentation.Property (method)
  Property(): StepFEA_Curve3dElementProperty;

  // StepFEA_Curve3dElementRepresentation.SetProperty (method)
  SetProperty(Property: StepFEA_Curve3dElementProperty): void;

  // StepFEA_Curve3dElementRepresentation.Material (method)
  Material(): StepElement_ElementMaterial;

  // StepFEA_Curve3dElementRepresentation.SetMaterial (method)
  SetMaterial(Material: StepElement_ElementMaterial): void;

  // StepFEA_Curve3dElementRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_Curve3dElementRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_Curve3dElementRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_Curve3dElementRepresentation.delete (method)
  delete(): void;

  // StepFEA_Curve3dElementRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveEdge: typeof StepFEA_CurveEdge[keyof typeof StepFEA_CurveEdge]

  readonly StepFEA_ElementEdge: 'StepFEA_ElementEdge'

StepFEA_CurveElementEndCoordinateSystem: declare class StepFEA_CurveElementEndCoordinateSystem extends StepData_SelectType

  // StepFEA_CurveElementEndCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_CurveElementEndCoordinateSystem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_CurveElementEndCoordinateSystem.FeaAxis2Placement3d (method)
  FeaAxis2Placement3d(): StepFEA_FeaAxis2Placement3d;

  // StepFEA_CurveElementEndCoordinateSystem.AlignedCurve3dElementCoordinateSystem (method)
  AlignedCurve3dElementCoordinateSystem(): StepFEA_AlignedCurve3dElementCoordinateSystem;

  // StepFEA_CurveElementEndCoordinateSystem.ParametricCurve3dElementCoordinateSystem (method)
  ParametricCurve3dElementCoordinateSystem(): StepFEA_ParametricCurve3dElementCoordinateSystem;

  // StepFEA_CurveElementEndCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_CurveElementEndCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementEndOffset: declare class StepFEA_CurveElementEndOffset extends Standard_Transient

  // StepFEA_CurveElementEndOffset.constructor (constructor)
  constructor();

  // StepFEA_CurveElementEndOffset.Init (method)
  Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aOffsetVector: NCollection_HArray1_double): void;

  // StepFEA_CurveElementEndOffset.CoordinateSystem (method)
  CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

  // StepFEA_CurveElementEndOffset.SetCoordinateSystem (method)
  SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

  // StepFEA_CurveElementEndOffset.OffsetVector (method)
  OffsetVector(): NCollection_HArray1_double;

  // StepFEA_CurveElementEndOffset.SetOffsetVector (method)
  SetOffsetVector(OffsetVector: NCollection_HArray1_double): void;

  // StepFEA_CurveElementEndOffset.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementEndOffset.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementEndOffset.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementEndOffset.delete (method)
  delete(): void;

  // StepFEA_CurveElementEndOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementEndRelease: declare class StepFEA_CurveElementEndRelease extends Standard_Transient

  // StepFEA_CurveElementEndRelease.constructor (constructor)
  constructor();

  // StepFEA_CurveElementEndRelease.Init (method)
  Init(aCoordinateSystem: StepFEA_CurveElementEndCoordinateSystem, aReleases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

  // StepFEA_CurveElementEndRelease.CoordinateSystem (method)
  CoordinateSystem(): StepFEA_CurveElementEndCoordinateSystem;

  // StepFEA_CurveElementEndRelease.SetCoordinateSystem (method)
  SetCoordinateSystem(CoordinateSystem: StepFEA_CurveElementEndCoordinateSystem): void;

  // StepFEA_CurveElementEndRelease.Releases (method)
  Releases(): NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket;

  // StepFEA_CurveElementEndRelease.SetReleases (method)
  SetReleases(Releases: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket): void;

  // StepFEA_CurveElementEndRelease.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementEndRelease.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementEndRelease.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementEndRelease.delete (method)
  delete(): void;

  // StepFEA_CurveElementEndRelease.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementInterval: declare class StepFEA_CurveElementInterval extends Standard_Transient

  // StepFEA_CurveElementInterval.constructor (constructor)
  constructor();

  // StepFEA_CurveElementInterval.Init (method)
  Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

  // StepFEA_CurveElementInterval.FinishPosition (method)
  FinishPosition(): StepFEA_CurveElementLocation;

  // StepFEA_CurveElementInterval.SetFinishPosition (method)
  SetFinishPosition(FinishPosition: StepFEA_CurveElementLocation): void;

  // StepFEA_CurveElementInterval.EuAngles (method)
  EuAngles(): StepBasic_EulerAngles;

  // StepFEA_CurveElementInterval.SetEuAngles (method)
  SetEuAngles(EuAngles: StepBasic_EulerAngles): void;

  // StepFEA_CurveElementInterval.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementInterval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementInterval.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementInterval.delete (method)
  delete(): void;

  // StepFEA_CurveElementInterval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementIntervalConstant: declare class StepFEA_CurveElementIntervalConstant extends StepFEA_CurveElementInterval

  // StepFEA_CurveElementIntervalConstant.constructor (constructor)
  constructor();

  // StepFEA_CurveElementIntervalConstant.Init (method)
  Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSection: StepElement_CurveElementSectionDefinition): void;
  Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

  // StepFEA_CurveElementIntervalConstant.Section (method)
  Section(): StepElement_CurveElementSectionDefinition;

  // StepFEA_CurveElementIntervalConstant.SetSection (method)
  SetSection(Section: StepElement_CurveElementSectionDefinition): void;

  // StepFEA_CurveElementIntervalConstant.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementIntervalConstant.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementIntervalConstant.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementIntervalConstant.delete (method)
  delete(): void;

  // StepFEA_CurveElementIntervalConstant.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementIntervalLinearlyVarying: declare class StepFEA_CurveElementIntervalLinearlyVarying extends StepFEA_CurveElementInterval

  // StepFEA_CurveElementIntervalLinearlyVarying.constructor (constructor)
  constructor();

  // StepFEA_CurveElementIntervalLinearlyVarying.Init (method)
  Init(aCurveElementInterval_FinishPosition: StepFEA_CurveElementLocation, aCurveElementInterval_EuAngles: StepBasic_EulerAngles, aSections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;
  Init(aFinishPosition: StepFEA_CurveElementLocation, aEuAngles: StepBasic_EulerAngles): void;

  // StepFEA_CurveElementIntervalLinearlyVarying.Sections (method)
  Sections(): NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition;

  // StepFEA_CurveElementIntervalLinearlyVarying.SetSections (method)
  SetSections(Sections: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition): void;

  // StepFEA_CurveElementIntervalLinearlyVarying.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementIntervalLinearlyVarying.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementIntervalLinearlyVarying.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementIntervalLinearlyVarying.delete (method)
  delete(): void;

  // StepFEA_CurveElementIntervalLinearlyVarying.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_CurveElementLocation: declare class StepFEA_CurveElementLocation extends Standard_Transient

  // StepFEA_CurveElementLocation.constructor (constructor)
  constructor();

  // StepFEA_CurveElementLocation.Init (method)
  Init(aCoordinate: StepFEA_FeaParametricPoint): void;

  // StepFEA_CurveElementLocation.Coordinate (method)
  Coordinate(): StepFEA_FeaParametricPoint;

  // StepFEA_CurveElementLocation.SetCoordinate (method)
  SetCoordinate(Coordinate: StepFEA_FeaParametricPoint): void;

  // StepFEA_CurveElementLocation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_CurveElementLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_CurveElementLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_CurveElementLocation.delete (method)
  delete(): void;

  // StepFEA_CurveElementLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_DegreeOfFreedom: declare class StepFEA_DegreeOfFreedom extends StepData_SelectType

  // StepFEA_DegreeOfFreedom.constructor (constructor)
  constructor();

  // StepFEA_DegreeOfFreedom.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_DegreeOfFreedom.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepFEA_DegreeOfFreedom.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepFEA_DegreeOfFreedom.SetEnumeratedDegreeOfFreedom (method)
  SetEnumeratedDegreeOfFreedom(aVal: StepFEA_EnumeratedDegreeOfFreedom): void;

  // StepFEA_DegreeOfFreedom.EnumeratedDegreeOfFreedom (method)
  EnumeratedDegreeOfFreedom(): StepFEA_EnumeratedDegreeOfFreedom;

  // StepFEA_DegreeOfFreedom.SetApplicationDefinedDegreeOfFreedom (method)
  SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

  // StepFEA_DegreeOfFreedom.ApplicationDefinedDegreeOfFreedom (method)
  ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

  // StepFEA_DegreeOfFreedom.delete (method)
  delete(): void;

  // StepFEA_DegreeOfFreedom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_DegreeOfFreedomMember: declare class StepFEA_DegreeOfFreedomMember extends StepData_SelectNamed

  // StepFEA_DegreeOfFreedomMember.constructor (constructor)
  constructor();

  // StepFEA_DegreeOfFreedomMember.HasName (method)
  HasName(): boolean;

  // StepFEA_DegreeOfFreedomMember.Name (method)
  Name(): string;

  // StepFEA_DegreeOfFreedomMember.SetName (method)
  SetName(name: string): boolean;

  // StepFEA_DegreeOfFreedomMember.Matches (method)
  Matches(name: string): boolean;

  // StepFEA_DegreeOfFreedomMember.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_DegreeOfFreedomMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_DegreeOfFreedomMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_DegreeOfFreedomMember.delete (method)
  delete(): void;

  // StepFEA_DegreeOfFreedomMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_DummyNode: declare class StepFEA_DummyNode extends StepFEA_NodeRepresentation

  // StepFEA_DummyNode.constructor (constructor)
  constructor();

  // StepFEA_DummyNode.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_DummyNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_DummyNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_DummyNode.delete (method)
  delete(): void;

  // StepFEA_DummyNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ElementGeometricRelationship: declare class StepFEA_ElementGeometricRelationship extends Standard_Transient

  // StepFEA_ElementGeometricRelationship.constructor (constructor)
  constructor();

  // StepFEA_ElementGeometricRelationship.Init (method)
  Init(aElementRef: StepFEA_ElementOrElementGroup, aItem: StepElement_AnalysisItemWithinRepresentation, aAspect: StepElement_ElementAspect): void;

  // StepFEA_ElementGeometricRelationship.ElementRef (method)
  ElementRef(): StepFEA_ElementOrElementGroup;

  // StepFEA_ElementGeometricRelationship.SetElementRef (method)
  SetElementRef(ElementRef: StepFEA_ElementOrElementGroup): void;

  // StepFEA_ElementGeometricRelationship.Item (method)
  Item(): StepElement_AnalysisItemWithinRepresentation;

  // StepFEA_ElementGeometricRelationship.SetItem (method)
  SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

  // StepFEA_ElementGeometricRelationship.Aspect (method)
  Aspect(): StepElement_ElementAspect;

  // StepFEA_ElementGeometricRelationship.SetAspect (method)
  SetAspect(Aspect: StepElement_ElementAspect): void;

  // StepFEA_ElementGeometricRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ElementGeometricRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ElementGeometricRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ElementGeometricRelationship.delete (method)
  delete(): void;

  // StepFEA_ElementGeometricRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ElementGroup: declare class StepFEA_ElementGroup extends StepFEA_FeaGroup

  // StepFEA_ElementGroup.constructor (constructor)
  constructor();

  // StepFEA_ElementGroup.Init (method)
  Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aElements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;
  Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepFEA_ElementGroup.Elements (method)
  Elements(): NCollection_HArray1_handle_StepFEA_ElementRepresentation;

  // StepFEA_ElementGroup.SetElements (method)
  SetElements(Elements: NCollection_HArray1_handle_StepFEA_ElementRepresentation): void;

  // StepFEA_ElementGroup.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ElementGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ElementGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ElementGroup.delete (method)
  delete(): void;

  // StepFEA_ElementGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ElementOrElementGroup: declare class StepFEA_ElementOrElementGroup extends StepData_SelectType

  // StepFEA_ElementOrElementGroup.constructor (constructor)
  constructor();

  // StepFEA_ElementOrElementGroup.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_ElementOrElementGroup.ElementRepresentation (method)
  ElementRepresentation(): StepFEA_ElementRepresentation;

  // StepFEA_ElementOrElementGroup.ElementGroup (method)
  ElementGroup(): StepFEA_ElementGroup;

  // StepFEA_ElementOrElementGroup.delete (method)
  delete(): void;

  // StepFEA_ElementOrElementGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ElementRepresentation: declare class StepFEA_ElementRepresentation extends StepRepr_Representation

  // StepFEA_ElementRepresentation.constructor (constructor)
  constructor();

  // StepFEA_ElementRepresentation.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_ElementRepresentation.NodeList (method)
  NodeList(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

  // StepFEA_ElementRepresentation.SetNodeList (method)
  SetNodeList(NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

  // StepFEA_ElementRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ElementRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ElementRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ElementRepresentation.delete (method)
  delete(): void;

  // StepFEA_ElementRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ElementVolume: typeof StepFEA_ElementVolume[keyof typeof StepFEA_ElementVolume]

  readonly StepFEA_Volume: 'StepFEA_Volume'

StepFEA_EnumeratedDegreeOfFreedom: typeof StepFEA_EnumeratedDegreeOfFreedom[keyof typeof StepFEA_EnumeratedDegreeOfFreedom]

  readonly StepFEA_XTranslation: 'StepFEA_XTranslation'

  readonly StepFEA_YTranslation: 'StepFEA_YTranslation'

  readonly StepFEA_ZTranslation: 'StepFEA_ZTranslation'

  readonly StepFEA_XRotation: 'StepFEA_XRotation'

  readonly StepFEA_YRotation: 'StepFEA_YRotation'

  readonly StepFEA_ZRotation: 'StepFEA_ZRotation'

  readonly StepFEA_Warp: 'StepFEA_Warp'

StepFEA_FeaAreaDensity: declare class StepFEA_FeaAreaDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaAreaDensity.constructor (constructor)
  constructor();

  // StepFEA_FeaAreaDensity.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaAreaDensity.FeaConstant (method)
  FeaConstant(): number;

  // StepFEA_FeaAreaDensity.SetFeaConstant (method)
  SetFeaConstant(FeaConstant: number): void;

  // StepFEA_FeaAreaDensity.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaAreaDensity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaAreaDensity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaAreaDensity.delete (method)
  delete(): void;

  // StepFEA_FeaAreaDensity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaAxis2Placement3d: declare class StepFEA_FeaAxis2Placement3d extends StepGeom_Axis2Placement3d

  // StepFEA_FeaAxis2Placement3d.constructor (constructor)
  constructor();

  // StepFEA_FeaAxis2Placement3d.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaAxis2Placement3d.SystemType (method)
  SystemType(): StepFEA_CoordinateSystemType;

  // StepFEA_FeaAxis2Placement3d.SetSystemType (method)
  SetSystemType(SystemType: StepFEA_CoordinateSystemType): void;

  // StepFEA_FeaAxis2Placement3d.Description (method)
  Description(): TCollection_HAsciiString;

  // StepFEA_FeaAxis2Placement3d.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepFEA_FeaAxis2Placement3d.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaAxis2Placement3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaAxis2Placement3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaAxis2Placement3d.delete (method)
  delete(): void;

  // StepFEA_FeaAxis2Placement3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaCurveSectionGeometricRelationship: declare class StepFEA_FeaCurveSectionGeometricRelationship extends Standard_Transient

  // StepFEA_FeaCurveSectionGeometricRelationship.constructor (constructor)
  constructor();

  // StepFEA_FeaCurveSectionGeometricRelationship.Init (method)
  Init(aSectionRef: StepElement_CurveElementSectionDefinition, aItem: StepElement_AnalysisItemWithinRepresentation): void;

  // StepFEA_FeaCurveSectionGeometricRelationship.SectionRef (method)
  SectionRef(): StepElement_CurveElementSectionDefinition;

  // StepFEA_FeaCurveSectionGeometricRelationship.SetSectionRef (method)
  SetSectionRef(SectionRef: StepElement_CurveElementSectionDefinition): void;

  // StepFEA_FeaCurveSectionGeometricRelationship.Item (method)
  Item(): StepElement_AnalysisItemWithinRepresentation;

  // StepFEA_FeaCurveSectionGeometricRelationship.SetItem (method)
  SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

  // StepFEA_FeaCurveSectionGeometricRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaCurveSectionGeometricRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaCurveSectionGeometricRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaCurveSectionGeometricRelationship.delete (method)
  delete(): void;

  // StepFEA_FeaCurveSectionGeometricRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaGroup: declare class StepFEA_FeaGroup extends StepBasic_Group

  // StepFEA_FeaGroup.constructor (constructor)
  constructor();

  // StepFEA_FeaGroup.Init (method)
  Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepFEA_FeaGroup.ModelRef (method)
  ModelRef(): StepFEA_FeaModel;

  // StepFEA_FeaGroup.SetModelRef (method)
  SetModelRef(ModelRef: StepFEA_FeaModel): void;

  // StepFEA_FeaGroup.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaGroup.delete (method)
  delete(): void;

  // StepFEA_FeaGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaLinearElasticity: declare class StepFEA_FeaLinearElasticity extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaLinearElasticity.constructor (constructor)
  constructor();

  // StepFEA_FeaLinearElasticity.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaLinearElasticity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaLinearElasticity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaLinearElasticity.delete (method)
  delete(): void;

  // StepFEA_FeaLinearElasticity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaMassDensity: declare class StepFEA_FeaMassDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaMassDensity.constructor (constructor)
  constructor();

  // StepFEA_FeaMassDensity.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaMassDensity.FeaConstant (method)
  FeaConstant(): number;

  // StepFEA_FeaMassDensity.SetFeaConstant (method)
  SetFeaConstant(FeaConstant: number): void;

  // StepFEA_FeaMassDensity.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaMassDensity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaMassDensity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaMassDensity.delete (method)
  delete(): void;

  // StepFEA_FeaMassDensity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaMaterialPropertyRepresentation: declare class StepFEA_FeaMaterialPropertyRepresentation extends StepRepr_MaterialPropertyRepresentation

  // StepFEA_FeaMaterialPropertyRepresentation.constructor (constructor)
  constructor();

  // StepFEA_FeaMaterialPropertyRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaMaterialPropertyRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaMaterialPropertyRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaMaterialPropertyRepresentation.delete (method)
  delete(): void;

  // StepFEA_FeaMaterialPropertyRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaMaterialPropertyRepresentationItem: declare class StepFEA_FeaMaterialPropertyRepresentationItem extends StepRepr_RepresentationItem

  // StepFEA_FeaMaterialPropertyRepresentationItem.constructor (constructor)
  constructor();

  // StepFEA_FeaMaterialPropertyRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaMaterialPropertyRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaMaterialPropertyRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaMaterialPropertyRepresentationItem.delete (method)
  delete(): void;

  // StepFEA_FeaMaterialPropertyRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaModel: declare class StepFEA_FeaModel extends StepRepr_Representation

  // StepFEA_FeaModel.constructor (constructor)
  constructor();

  // StepFEA_FeaModel.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aCreatingSoftware: TCollection_HAsciiString, aIntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString, aDescription: TCollection_HAsciiString, aAnalysisType: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_FeaModel.CreatingSoftware (method)
  CreatingSoftware(): TCollection_HAsciiString;

  // StepFEA_FeaModel.SetCreatingSoftware (method)
  SetCreatingSoftware(CreatingSoftware: TCollection_HAsciiString): void;

  // StepFEA_FeaModel.IntendedAnalysisCode (method)
  IntendedAnalysisCode(): NCollection_HArray1_TCollection_AsciiString;

  // StepFEA_FeaModel.SetIntendedAnalysisCode (method)
  SetIntendedAnalysisCode(IntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString): void;

  // StepFEA_FeaModel.Description (method)
  Description(): TCollection_HAsciiString;

  // StepFEA_FeaModel.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepFEA_FeaModel.AnalysisType (method)
  AnalysisType(): TCollection_HAsciiString;

  // StepFEA_FeaModel.SetAnalysisType (method)
  SetAnalysisType(AnalysisType: TCollection_HAsciiString): void;

  // StepFEA_FeaModel.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaModel.delete (method)
  delete(): void;

  // StepFEA_FeaModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaModel3d: declare class StepFEA_FeaModel3d extends StepFEA_FeaModel

  // StepFEA_FeaModel3d.constructor (constructor)
  constructor();

  // StepFEA_FeaModel3d.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaModel3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaModel3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaModel3d.delete (method)
  delete(): void;

  // StepFEA_FeaModel3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaModelDefinition: declare class StepFEA_FeaModelDefinition extends StepRepr_ShapeAspect

  // StepFEA_FeaModelDefinition.constructor (constructor)
  constructor();

  // StepFEA_FeaModelDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaModelDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaModelDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaModelDefinition.delete (method)
  delete(): void;

  // StepFEA_FeaModelDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaMoistureAbsorption: declare class StepFEA_FeaMoistureAbsorption extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaMoistureAbsorption.constructor (constructor)
  constructor();

  // StepFEA_FeaMoistureAbsorption.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaMoistureAbsorption.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor23d;

  // StepFEA_FeaMoistureAbsorption.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

  // StepFEA_FeaMoistureAbsorption.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaMoistureAbsorption.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaMoistureAbsorption.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaMoistureAbsorption.delete (method)
  delete(): void;

  // StepFEA_FeaMoistureAbsorption.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaParametricPoint: declare class StepFEA_FeaParametricPoint extends StepGeom_Point

  // StepFEA_FeaParametricPoint.constructor (constructor)
  constructor();

  // StepFEA_FeaParametricPoint.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinates: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaParametricPoint.Coordinates (method)
  Coordinates(): NCollection_HArray1_double;

  // StepFEA_FeaParametricPoint.SetCoordinates (method)
  SetCoordinates(Coordinates: NCollection_HArray1_double): void;

  // StepFEA_FeaParametricPoint.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaParametricPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaParametricPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaParametricPoint.delete (method)
  delete(): void;

  // StepFEA_FeaParametricPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaRepresentationItem: declare class StepFEA_FeaRepresentationItem extends StepRepr_RepresentationItem

  // StepFEA_FeaRepresentationItem.constructor (constructor)
  constructor();

  // StepFEA_FeaRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaRepresentationItem.delete (method)
  delete(): void;

  // StepFEA_FeaRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaSecantCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaSecantCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.constructor (constructor)
  constructor();

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d, aReferenceTemperature: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor23d;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.ReferenceTemperature (method)
  ReferenceTemperature(): number;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.SetReferenceTemperature (method)
  SetReferenceTemperature(ReferenceTemperature: number): void;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.delete (method)
  delete(): void;

  // StepFEA_FeaSecantCoefficientOfLinearThermalExpansion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaShellBendingStiffness: declare class StepFEA_FeaShellBendingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaShellBendingStiffness.constructor (constructor)
  constructor();

  // StepFEA_FeaShellBendingStiffness.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaShellBendingStiffness.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor42d;

  // StepFEA_FeaShellBendingStiffness.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

  // StepFEA_FeaShellBendingStiffness.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaShellBendingStiffness.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaShellBendingStiffness.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaShellBendingStiffness.delete (method)
  delete(): void;

  // StepFEA_FeaShellBendingStiffness.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaShellMembraneBendingCouplingStiffness: declare class StepFEA_FeaShellMembraneBendingCouplingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.constructor (constructor)
  constructor();

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor42d;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.delete (method)
  delete(): void;

  // StepFEA_FeaShellMembraneBendingCouplingStiffness.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
