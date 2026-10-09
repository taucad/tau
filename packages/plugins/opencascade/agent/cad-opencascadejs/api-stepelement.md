# libcascade — StepElement

57 top-level symbols. Signatures are verbatim typescript.

StepElement_AnalysisItemWithinRepresentation: declare class StepElement_AnalysisItemWithinRepresentation extends Standard_Transient

  // StepElement_AnalysisItemWithinRepresentation.constructor (constructor)
  constructor();

  // StepElement_AnalysisItemWithinRepresentation.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aItem: StepRepr_RepresentationItem, aRep: StepRepr_Representation): void;

  // StepElement_AnalysisItemWithinRepresentation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepElement_AnalysisItemWithinRepresentation.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepElement_AnalysisItemWithinRepresentation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepElement_AnalysisItemWithinRepresentation.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepElement_AnalysisItemWithinRepresentation.Item (method)
  Item(): StepRepr_RepresentationItem;

  // StepElement_AnalysisItemWithinRepresentation.SetItem (method)
  SetItem(Item: StepRepr_RepresentationItem): void;

  // StepElement_AnalysisItemWithinRepresentation.Rep (method)
  Rep(): StepRepr_Representation;

  // StepElement_AnalysisItemWithinRepresentation.SetRep (method)
  SetRep(Rep: StepRepr_Representation): void;

  // StepElement_AnalysisItemWithinRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepElement_AnalysisItemWithinRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_AnalysisItemWithinRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_AnalysisItemWithinRepresentation.delete (method)
  delete(): void;

  // StepElement_AnalysisItemWithinRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_Curve3dElementDescriptor: declare class StepElement_Curve3dElementDescriptor extends StepElement_ElementDescriptor

  // StepElement_Curve3dElementDescriptor.constructor (constructor)
  constructor();

  // StepElement_Curve3dElementDescriptor.Init (method)
  Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;
  Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

  // StepElement_Curve3dElementDescriptor.Purpose (method)
  Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;

  // StepElement_Curve3dElementDescriptor.SetPurpose (method)
  SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): void;

  // StepElement_Curve3dElementDescriptor.get_type_name (method)
  static get_type_name(): string;

  // StepElement_Curve3dElementDescriptor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_Curve3dElementDescriptor.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_Curve3dElementDescriptor.delete (method)
  delete(): void;

  // StepElement_Curve3dElementDescriptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveEdge: typeof StepElement_CurveEdge[keyof typeof StepElement_CurveEdge]

  readonly StepElement_ElementEdge: 'StepElement_ElementEdge'

StepElement_CurveElementEndReleasePacket: declare class StepElement_CurveElementEndReleasePacket extends Standard_Transient

  // StepElement_CurveElementEndReleasePacket.constructor (constructor)
  constructor();

  // StepElement_CurveElementEndReleasePacket.Init (method)
  Init(aReleaseFreedom: StepElement_CurveElementFreedom, aReleaseStiffness: number): void;

  // StepElement_CurveElementEndReleasePacket.ReleaseFreedom (method)
  ReleaseFreedom(): StepElement_CurveElementFreedom;

  // StepElement_CurveElementEndReleasePacket.SetReleaseFreedom (method)
  SetReleaseFreedom(ReleaseFreedom: StepElement_CurveElementFreedom): void;

  // StepElement_CurveElementEndReleasePacket.ReleaseStiffness (method)
  ReleaseStiffness(): number;

  // StepElement_CurveElementEndReleasePacket.SetReleaseStiffness (method)
  SetReleaseStiffness(ReleaseStiffness: number): void;

  // StepElement_CurveElementEndReleasePacket.get_type_name (method)
  static get_type_name(): string;

  // StepElement_CurveElementEndReleasePacket.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_CurveElementEndReleasePacket.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_CurveElementEndReleasePacket.delete (method)
  delete(): void;

  // StepElement_CurveElementEndReleasePacket.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementFreedom: declare class StepElement_CurveElementFreedom extends StepData_SelectType

  // StepElement_CurveElementFreedom.constructor (constructor)
  constructor();

  // StepElement_CurveElementFreedom.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_CurveElementFreedom.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_CurveElementFreedom.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_CurveElementFreedom.SetEnumeratedCurveElementFreedom (method)
  SetEnumeratedCurveElementFreedom(aVal: StepElement_EnumeratedCurveElementFreedom): void;

  // StepElement_CurveElementFreedom.EnumeratedCurveElementFreedom (method)
  EnumeratedCurveElementFreedom(): StepElement_EnumeratedCurveElementFreedom;

  // StepElement_CurveElementFreedom.SetApplicationDefinedDegreeOfFreedom (method)
  SetApplicationDefinedDegreeOfFreedom(aVal: TCollection_HAsciiString): void;

  // StepElement_CurveElementFreedom.ApplicationDefinedDegreeOfFreedom (method)
  ApplicationDefinedDegreeOfFreedom(): TCollection_HAsciiString;

  // StepElement_CurveElementFreedom.delete (method)
  delete(): void;

  // StepElement_CurveElementFreedom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementFreedomMember: declare class StepElement_CurveElementFreedomMember extends StepData_SelectNamed

  // StepElement_CurveElementFreedomMember.constructor (constructor)
  constructor();

  // StepElement_CurveElementFreedomMember.HasName (method)
  HasName(): boolean;

  // StepElement_CurveElementFreedomMember.Name (method)
  Name(): string;

  // StepElement_CurveElementFreedomMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_CurveElementFreedomMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_CurveElementFreedomMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_CurveElementFreedomMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_CurveElementFreedomMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_CurveElementFreedomMember.delete (method)
  delete(): void;

  // StepElement_CurveElementFreedomMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementPurpose: declare class StepElement_CurveElementPurpose extends StepData_SelectType

  // StepElement_CurveElementPurpose.constructor (constructor)
  constructor();

  // StepElement_CurveElementPurpose.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_CurveElementPurpose.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_CurveElementPurpose.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_CurveElementPurpose.SetEnumeratedCurveElementPurpose (method)
  SetEnumeratedCurveElementPurpose(aVal: StepElement_EnumeratedCurveElementPurpose): void;

  // StepElement_CurveElementPurpose.EnumeratedCurveElementPurpose (method)
  EnumeratedCurveElementPurpose(): StepElement_EnumeratedCurveElementPurpose;

  // StepElement_CurveElementPurpose.SetApplicationDefinedElementPurpose (method)
  SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

  // StepElement_CurveElementPurpose.ApplicationDefinedElementPurpose (method)
  ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

  // StepElement_CurveElementPurpose.delete (method)
  delete(): void;

  // StepElement_CurveElementPurpose.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementPurposeMember: declare class StepElement_CurveElementPurposeMember extends StepData_SelectNamed

  // StepElement_CurveElementPurposeMember.constructor (constructor)
  constructor();

  // StepElement_CurveElementPurposeMember.HasName (method)
  HasName(): boolean;

  // StepElement_CurveElementPurposeMember.Name (method)
  Name(): string;

  // StepElement_CurveElementPurposeMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_CurveElementPurposeMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_CurveElementPurposeMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_CurveElementPurposeMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_CurveElementPurposeMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_CurveElementPurposeMember.delete (method)
  delete(): void;

  // StepElement_CurveElementPurposeMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementSectionDefinition: declare class StepElement_CurveElementSectionDefinition extends Standard_Transient

  // StepElement_CurveElementSectionDefinition.constructor (constructor)
  constructor();

  // StepElement_CurveElementSectionDefinition.Init (method)
  Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

  // StepElement_CurveElementSectionDefinition.Description (method)
  Description(): TCollection_HAsciiString;

  // StepElement_CurveElementSectionDefinition.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepElement_CurveElementSectionDefinition.SectionAngle (method)
  SectionAngle(): number;

  // StepElement_CurveElementSectionDefinition.SetSectionAngle (method)
  SetSectionAngle(SectionAngle: number): void;

  // StepElement_CurveElementSectionDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepElement_CurveElementSectionDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_CurveElementSectionDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_CurveElementSectionDefinition.delete (method)
  delete(): void;

  // StepElement_CurveElementSectionDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_CurveElementSectionDerivedDefinitions: declare class StepElement_CurveElementSectionDerivedDefinitions extends StepElement_CurveElementSectionDefinition

  // StepElement_CurveElementSectionDerivedDefinitions.constructor (constructor)
  constructor();

  // StepElement_CurveElementSectionDerivedDefinitions.Init (method)
  Init(aCurveElementSectionDefinition_Description: TCollection_HAsciiString, aCurveElementSectionDefinition_SectionAngle: number, aCrossSectionalArea: number, aShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aSecondMomentOfArea: NCollection_HArray1_double, aTorsionalConstant: number, aWarpingConstant: StepElement_MeasureOrUnspecifiedValue, aLocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aLocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aPolarMoment: StepElement_MeasureOrUnspecifiedValue): void;
  Init(aDescription: TCollection_HAsciiString, aSectionAngle: number): void;

  // StepElement_CurveElementSectionDerivedDefinitions.CrossSectionalArea (method)
  CrossSectionalArea(): number;

  // StepElement_CurveElementSectionDerivedDefinitions.SetCrossSectionalArea (method)
  SetCrossSectionalArea(CrossSectionalArea: number): void;

  // StepElement_CurveElementSectionDerivedDefinitions.ShearArea (method)
  ShearArea(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetShearArea (method)
  SetShearArea(ShearArea: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.SecondMomentOfArea (method)
  SecondMomentOfArea(): NCollection_HArray1_double;

  // StepElement_CurveElementSectionDerivedDefinitions.SetSecondMomentOfArea (method)
  SetSecondMomentOfArea(SecondMomentOfArea: NCollection_HArray1_double): void;

  // StepElement_CurveElementSectionDerivedDefinitions.TorsionalConstant (method)
  TorsionalConstant(): number;

  // StepElement_CurveElementSectionDerivedDefinitions.SetTorsionalConstant (method)
  SetTorsionalConstant(TorsionalConstant: number): void;

  // StepElement_CurveElementSectionDerivedDefinitions.WarpingConstant (method)
  WarpingConstant(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetWarpingConstant (method)
  SetWarpingConstant(WarpingConstant: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.LocationOfCentroid (method)
  LocationOfCentroid(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetLocationOfCentroid (method)
  SetLocationOfCentroid(LocationOfCentroid: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.LocationOfShearCentre (method)
  LocationOfShearCentre(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetLocationOfShearCentre (method)
  SetLocationOfShearCentre(LocationOfShearCentre: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.LocationOfNonStructuralMass (method)
  LocationOfNonStructuralMass(): NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetLocationOfNonStructuralMass (method)
  SetLocationOfNonStructuralMass(LocationOfNonStructuralMass: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.NonStructuralMass (method)
  NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetNonStructuralMass (method)
  SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.PolarMoment (method)
  PolarMoment(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_CurveElementSectionDerivedDefinitions.SetPolarMoment (method)
  SetPolarMoment(PolarMoment: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_CurveElementSectionDerivedDefinitions.get_type_name (method)
  static get_type_name(): string;

  // StepElement_CurveElementSectionDerivedDefinitions.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_CurveElementSectionDerivedDefinitions.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_CurveElementSectionDerivedDefinitions.delete (method)
  delete(): void;

  // StepElement_CurveElementSectionDerivedDefinitions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_Element2dShape: typeof StepElement_Element2dShape[keyof typeof StepElement_Element2dShape]

  readonly StepElement_Quadrilateral: 'StepElement_Quadrilateral'

  readonly StepElement_Triangle: 'StepElement_Triangle'

StepElement_ElementAspect: declare class StepElement_ElementAspect extends StepData_SelectType

  // StepElement_ElementAspect.constructor (constructor)
  constructor();

  // StepElement_ElementAspect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_ElementAspect.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_ElementAspect.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_ElementAspect.SetElementVolume (method)
  SetElementVolume(aVal: StepElement_ElementVolume): void;

  // StepElement_ElementAspect.ElementVolume (method)
  ElementVolume(): StepElement_ElementVolume;

  // StepElement_ElementAspect.SetVolume3dFace (method)
  SetVolume3dFace(aVal: number): void;

  // StepElement_ElementAspect.Volume3dFace (method)
  Volume3dFace(): number;

  // StepElement_ElementAspect.SetVolume2dFace (method)
  SetVolume2dFace(aVal: number): void;

  // StepElement_ElementAspect.Volume2dFace (method)
  Volume2dFace(): number;

  // StepElement_ElementAspect.SetVolume3dEdge (method)
  SetVolume3dEdge(aVal: number): void;

  // StepElement_ElementAspect.Volume3dEdge (method)
  Volume3dEdge(): number;

  // StepElement_ElementAspect.SetVolume2dEdge (method)
  SetVolume2dEdge(aVal: number): void;

  // StepElement_ElementAspect.Volume2dEdge (method)
  Volume2dEdge(): number;

  // StepElement_ElementAspect.SetSurface3dFace (method)
  SetSurface3dFace(aVal: number): void;

  // StepElement_ElementAspect.Surface3dFace (method)
  Surface3dFace(): number;

  // StepElement_ElementAspect.SetSurface2dFace (method)
  SetSurface2dFace(aVal: number): void;

  // StepElement_ElementAspect.Surface2dFace (method)
  Surface2dFace(): number;

  // StepElement_ElementAspect.SetSurface3dEdge (method)
  SetSurface3dEdge(aVal: number): void;

  // StepElement_ElementAspect.Surface3dEdge (method)
  Surface3dEdge(): number;

  // StepElement_ElementAspect.SetSurface2dEdge (method)
  SetSurface2dEdge(aVal: number): void;

  // StepElement_ElementAspect.Surface2dEdge (method)
  Surface2dEdge(): number;

  // StepElement_ElementAspect.SetCurveEdge (method)
  SetCurveEdge(aVal: StepElement_CurveEdge): void;

  // StepElement_ElementAspect.CurveEdge (method)
  CurveEdge(): StepElement_CurveEdge;

  // StepElement_ElementAspect.delete (method)
  delete(): void;

  // StepElement_ElementAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_ElementAspectMember: declare class StepElement_ElementAspectMember extends StepData_SelectNamed

  // StepElement_ElementAspectMember.constructor (constructor)
  constructor();

  // StepElement_ElementAspectMember.HasName (method)
  HasName(): boolean;

  // StepElement_ElementAspectMember.Name (method)
  Name(): string;

  // StepElement_ElementAspectMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_ElementAspectMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_ElementAspectMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_ElementAspectMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_ElementAspectMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_ElementAspectMember.delete (method)
  delete(): void;

  // StepElement_ElementAspectMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_ElementDescriptor: declare class StepElement_ElementDescriptor extends Standard_Transient

  // StepElement_ElementDescriptor.constructor (constructor)
  constructor();

  // StepElement_ElementDescriptor.Init (method)
  Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

  // StepElement_ElementDescriptor.TopologyOrder (method)
  TopologyOrder(): StepElement_ElementOrder;

  // StepElement_ElementDescriptor.SetTopologyOrder (method)
  SetTopologyOrder(TopologyOrder: StepElement_ElementOrder): void;

  // StepElement_ElementDescriptor.Description (method)
  Description(): TCollection_HAsciiString;

  // StepElement_ElementDescriptor.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepElement_ElementDescriptor.get_type_name (method)
  static get_type_name(): string;

  // StepElement_ElementDescriptor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_ElementDescriptor.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_ElementDescriptor.delete (method)
  delete(): void;

  // StepElement_ElementDescriptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_ElementMaterial: declare class StepElement_ElementMaterial extends Standard_Transient

  // StepElement_ElementMaterial.constructor (constructor)
  constructor();

  // StepElement_ElementMaterial.Init (method)
  Init(aMaterialId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aProperties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

  // StepElement_ElementMaterial.MaterialId (method)
  MaterialId(): TCollection_HAsciiString;

  // StepElement_ElementMaterial.SetMaterialId (method)
  SetMaterialId(MaterialId: TCollection_HAsciiString): void;

  // StepElement_ElementMaterial.Description (method)
  Description(): TCollection_HAsciiString;

  // StepElement_ElementMaterial.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepElement_ElementMaterial.Properties (method)
  Properties(): NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation;

  // StepElement_ElementMaterial.SetProperties (method)
  SetProperties(Properties: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation): void;

  // StepElement_ElementMaterial.get_type_name (method)
  static get_type_name(): string;

  // StepElement_ElementMaterial.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_ElementMaterial.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_ElementMaterial.delete (method)
  delete(): void;

  // StepElement_ElementMaterial.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_ElementOrder: typeof StepElement_ElementOrder[keyof typeof StepElement_ElementOrder]

  readonly StepElement_Linear: 'StepElement_Linear'

  readonly StepElement_Quadratic: 'StepElement_Quadratic'

  readonly StepElement_Cubic: 'StepElement_Cubic'

StepElement_ElementVolume: typeof StepElement_ElementVolume[keyof typeof StepElement_ElementVolume]

  readonly StepElement_Volume: 'StepElement_Volume'

StepElement_EnumeratedCurveElementFreedom: typeof StepElement_EnumeratedCurveElementFreedom[keyof typeof StepElement_EnumeratedCurveElementFreedom]

  readonly StepElement_XTranslation: 'StepElement_XTranslation'

  readonly StepElement_YTranslation: 'StepElement_YTranslation'

  readonly StepElement_ZTranslation: 'StepElement_ZTranslation'

  readonly StepElement_XRotation: 'StepElement_XRotation'

  readonly StepElement_YRotation: 'StepElement_YRotation'

  readonly StepElement_ZRotation: 'StepElement_ZRotation'

  readonly StepElement_Warp: 'StepElement_Warp'

  readonly StepElement_None: 'StepElement_None'

StepElement_EnumeratedCurveElementPurpose: typeof StepElement_EnumeratedCurveElementPurpose[keyof typeof StepElement_EnumeratedCurveElementPurpose]

  readonly StepElement_Axial: 'StepElement_Axial'

  readonly StepElement_YYBending: 'StepElement_YYBending'

  readonly StepElement_ZZBending: 'StepElement_ZZBending'

  readonly StepElement_Torsion: 'StepElement_Torsion'

  readonly StepElement_XYShear: 'StepElement_XYShear'

  readonly StepElement_XZShear: 'StepElement_XZShear'

  readonly StepElement_Warping: 'StepElement_Warping'

StepElement_EnumeratedSurfaceElementPurpose: typeof StepElement_EnumeratedSurfaceElementPurpose[keyof typeof StepElement_EnumeratedSurfaceElementPurpose]

  readonly StepElement_MembraneDirect: 'StepElement_MembraneDirect'

  readonly StepElement_MembraneShear: 'StepElement_MembraneShear'

  readonly StepElement_BendingDirect: 'StepElement_BendingDirect'

  readonly StepElement_BendingTorsion: 'StepElement_BendingTorsion'

  readonly StepElement_NormalToPlaneShear: 'StepElement_NormalToPlaneShear'

StepElement_EnumeratedVolumeElementPurpose: typeof StepElement_EnumeratedVolumeElementPurpose[keyof typeof StepElement_EnumeratedVolumeElementPurpose]

  readonly StepElement_StressDisplacement: 'StepElement_StressDisplacement'

StepElement_MeasureOrUnspecifiedValue: declare class StepElement_MeasureOrUnspecifiedValue extends StepData_SelectType

  // StepElement_MeasureOrUnspecifiedValue.constructor (constructor)
  constructor();

  // StepElement_MeasureOrUnspecifiedValue.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_MeasureOrUnspecifiedValue.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_MeasureOrUnspecifiedValue.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_MeasureOrUnspecifiedValue.SetContextDependentMeasure (method)
  SetContextDependentMeasure(aVal: number): void;

  // StepElement_MeasureOrUnspecifiedValue.ContextDependentMeasure (method)
  ContextDependentMeasure(): number;

  // StepElement_MeasureOrUnspecifiedValue.SetUnspecifiedValue (method)
  SetUnspecifiedValue(aVal: StepElement_UnspecifiedValue): void;

  // StepElement_MeasureOrUnspecifiedValue.UnspecifiedValue (method)
  UnspecifiedValue(): StepElement_UnspecifiedValue;

  // StepElement_MeasureOrUnspecifiedValue.delete (method)
  delete(): void;

  // StepElement_MeasureOrUnspecifiedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_MeasureOrUnspecifiedValueMember: declare class StepElement_MeasureOrUnspecifiedValueMember extends StepData_SelectNamed

  // StepElement_MeasureOrUnspecifiedValueMember.constructor (constructor)
  constructor();

  // StepElement_MeasureOrUnspecifiedValueMember.HasName (method)
  HasName(): boolean;

  // StepElement_MeasureOrUnspecifiedValueMember.Name (method)
  Name(): string;

  // StepElement_MeasureOrUnspecifiedValueMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_MeasureOrUnspecifiedValueMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_MeasureOrUnspecifiedValueMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_MeasureOrUnspecifiedValueMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_MeasureOrUnspecifiedValueMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_MeasureOrUnspecifiedValueMember.delete (method)
  delete(): void;

  // StepElement_MeasureOrUnspecifiedValueMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_Surface3dElementDescriptor: declare class StepElement_Surface3dElementDescriptor extends StepElement_ElementDescriptor

  // StepElement_Surface3dElementDescriptor.constructor (constructor)
  constructor();

  // StepElement_Surface3dElementDescriptor.Init (method)
  Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember, aShape: StepElement_Element2dShape): void;
  Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

  // StepElement_Surface3dElementDescriptor.Purpose (method)
  Purpose(): NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;

  // StepElement_Surface3dElementDescriptor.SetPurpose (method)
  SetPurpose(Purpose: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): void;

  // StepElement_Surface3dElementDescriptor.Shape (method)
  Shape(): StepElement_Element2dShape;

  // StepElement_Surface3dElementDescriptor.SetShape (method)
  SetShape(Shape: StepElement_Element2dShape): void;

  // StepElement_Surface3dElementDescriptor.get_type_name (method)
  static get_type_name(): string;

  // StepElement_Surface3dElementDescriptor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_Surface3dElementDescriptor.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_Surface3dElementDescriptor.delete (method)
  delete(): void;

  // StepElement_Surface3dElementDescriptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceElementProperty: declare class StepElement_SurfaceElementProperty extends Standard_Transient

  // StepElement_SurfaceElementProperty.constructor (constructor)
  constructor();

  // StepElement_SurfaceElementProperty.Init (method)
  Init(aPropertyId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aSection: StepElement_SurfaceSectionField): void;

  // StepElement_SurfaceElementProperty.PropertyId (method)
  PropertyId(): TCollection_HAsciiString;

  // StepElement_SurfaceElementProperty.SetPropertyId (method)
  SetPropertyId(PropertyId: TCollection_HAsciiString): void;

  // StepElement_SurfaceElementProperty.Description (method)
  Description(): TCollection_HAsciiString;

  // StepElement_SurfaceElementProperty.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepElement_SurfaceElementProperty.Section (method)
  Section(): StepElement_SurfaceSectionField;

  // StepElement_SurfaceElementProperty.SetSection (method)
  SetSection(Section: StepElement_SurfaceSectionField): void;

  // StepElement_SurfaceElementProperty.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceElementProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceElementProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceElementProperty.delete (method)
  delete(): void;

  // StepElement_SurfaceElementProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceElementPurpose: declare class StepElement_SurfaceElementPurpose extends StepData_SelectType

  // StepElement_SurfaceElementPurpose.constructor (constructor)
  constructor();

  // StepElement_SurfaceElementPurpose.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_SurfaceElementPurpose.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_SurfaceElementPurpose.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_SurfaceElementPurpose.SetEnumeratedSurfaceElementPurpose (method)
  SetEnumeratedSurfaceElementPurpose(aVal: StepElement_EnumeratedSurfaceElementPurpose): void;

  // StepElement_SurfaceElementPurpose.EnumeratedSurfaceElementPurpose (method)
  EnumeratedSurfaceElementPurpose(): StepElement_EnumeratedSurfaceElementPurpose;

  // StepElement_SurfaceElementPurpose.SetApplicationDefinedElementPurpose (method)
  SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

  // StepElement_SurfaceElementPurpose.ApplicationDefinedElementPurpose (method)
  ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

  // StepElement_SurfaceElementPurpose.delete (method)
  delete(): void;

  // StepElement_SurfaceElementPurpose.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceElementPurposeMember: declare class StepElement_SurfaceElementPurposeMember extends StepData_SelectNamed

  // StepElement_SurfaceElementPurposeMember.constructor (constructor)
  constructor();

  // StepElement_SurfaceElementPurposeMember.HasName (method)
  HasName(): boolean;

  // StepElement_SurfaceElementPurposeMember.Name (method)
  Name(): string;

  // StepElement_SurfaceElementPurposeMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_SurfaceElementPurposeMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_SurfaceElementPurposeMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceElementPurposeMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceElementPurposeMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceElementPurposeMember.delete (method)
  delete(): void;

  // StepElement_SurfaceElementPurposeMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceSection: declare class StepElement_SurfaceSection extends Standard_Transient

  // StepElement_SurfaceSection.constructor (constructor)
  constructor();

  // StepElement_SurfaceSection.Init (method)
  Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_SurfaceSection.Offset (method)
  Offset(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_SurfaceSection.SetOffset (method)
  SetOffset(Offset: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_SurfaceSection.NonStructuralMass (method)
  NonStructuralMass(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_SurfaceSection.SetNonStructuralMass (method)
  SetNonStructuralMass(NonStructuralMass: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_SurfaceSection.NonStructuralMassOffset (method)
  NonStructuralMassOffset(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_SurfaceSection.SetNonStructuralMassOffset (method)
  SetNonStructuralMassOffset(NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_SurfaceSection.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceSection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceSection.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceSection.delete (method)
  delete(): void;

  // StepElement_SurfaceSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceSectionField: declare class StepElement_SurfaceSectionField extends Standard_Transient

  // StepElement_SurfaceSectionField.constructor (constructor)
  constructor();

  // StepElement_SurfaceSectionField.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceSectionField.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceSectionField.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceSectionField.delete (method)
  delete(): void;

  // StepElement_SurfaceSectionField.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceSectionFieldConstant: declare class StepElement_SurfaceSectionFieldConstant extends StepElement_SurfaceSectionField

  // StepElement_SurfaceSectionFieldConstant.constructor (constructor)
  constructor();

  // StepElement_SurfaceSectionFieldConstant.Init (method)
  Init(aDefinition: StepElement_SurfaceSection): void;

  // StepElement_SurfaceSectionFieldConstant.Definition (method)
  Definition(): StepElement_SurfaceSection;

  // StepElement_SurfaceSectionFieldConstant.SetDefinition (method)
  SetDefinition(Definition: StepElement_SurfaceSection): void;

  // StepElement_SurfaceSectionFieldConstant.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceSectionFieldConstant.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceSectionFieldConstant.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceSectionFieldConstant.delete (method)
  delete(): void;

  // StepElement_SurfaceSectionFieldConstant.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_SurfaceSectionFieldVarying: declare class StepElement_SurfaceSectionFieldVarying extends StepElement_SurfaceSectionField

  // StepElement_SurfaceSectionFieldVarying.constructor (constructor)
  constructor();

  // StepElement_SurfaceSectionFieldVarying.Init (method)
  Init(aDefinitions: NCollection_HArray1_handle_StepElement_SurfaceSection, aAdditionalNodeValues: boolean): void;

  // StepElement_SurfaceSectionFieldVarying.Definitions (method)
  Definitions(): NCollection_HArray1_handle_StepElement_SurfaceSection;

  // StepElement_SurfaceSectionFieldVarying.SetDefinitions (method)
  SetDefinitions(Definitions: NCollection_HArray1_handle_StepElement_SurfaceSection): void;

  // StepElement_SurfaceSectionFieldVarying.AdditionalNodeValues (method)
  AdditionalNodeValues(): boolean;

  // StepElement_SurfaceSectionFieldVarying.SetAdditionalNodeValues (method)
  SetAdditionalNodeValues(AdditionalNodeValues: boolean): void;

  // StepElement_SurfaceSectionFieldVarying.get_type_name (method)
  static get_type_name(): string;

  // StepElement_SurfaceSectionFieldVarying.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_SurfaceSectionFieldVarying.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_SurfaceSectionFieldVarying.delete (method)
  delete(): void;

  // StepElement_SurfaceSectionFieldVarying.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_UniformSurfaceSection: declare class StepElement_UniformSurfaceSection extends StepElement_SurfaceSection

  // StepElement_UniformSurfaceSection.constructor (constructor)
  constructor();

  // StepElement_UniformSurfaceSection.Init (method)
  Init(aSurfaceSection_Offset: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue, aThickness: number, aBendingThickness: StepElement_MeasureOrUnspecifiedValue, aShearThickness: StepElement_MeasureOrUnspecifiedValue): void;
  Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_UniformSurfaceSection.Thickness (method)
  Thickness(): number;

  // StepElement_UniformSurfaceSection.SetThickness (method)
  SetThickness(Thickness: number): void;

  // StepElement_UniformSurfaceSection.BendingThickness (method)
  BendingThickness(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_UniformSurfaceSection.SetBendingThickness (method)
  SetBendingThickness(BendingThickness: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_UniformSurfaceSection.ShearThickness (method)
  ShearThickness(): StepElement_MeasureOrUnspecifiedValue;

  // StepElement_UniformSurfaceSection.SetShearThickness (method)
  SetShearThickness(ShearThickness: StepElement_MeasureOrUnspecifiedValue): void;

  // StepElement_UniformSurfaceSection.get_type_name (method)
  static get_type_name(): string;

  // StepElement_UniformSurfaceSection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_UniformSurfaceSection.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_UniformSurfaceSection.delete (method)
  delete(): void;

  // StepElement_UniformSurfaceSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_UnspecifiedValue: typeof StepElement_UnspecifiedValue[keyof typeof StepElement_UnspecifiedValue]

  readonly StepElement_Unspecified: 'StepElement_Unspecified'

StepElement_Volume3dElementDescriptor: declare class StepElement_Volume3dElementDescriptor extends StepElement_ElementDescriptor

  // StepElement_Volume3dElementDescriptor.constructor (constructor)
  constructor();

  // StepElement_Volume3dElementDescriptor.Init (method)
  Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember, aShape: StepElement_Volume3dElementShape): void;
  Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

  // StepElement_Volume3dElementDescriptor.Purpose (method)
  Purpose(): NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember;

  // StepElement_Volume3dElementDescriptor.SetPurpose (method)
  SetPurpose(Purpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember): void;

  // StepElement_Volume3dElementDescriptor.Shape (method)
  Shape(): StepElement_Volume3dElementShape;

  // StepElement_Volume3dElementDescriptor.SetShape (method)
  SetShape(Shape: StepElement_Volume3dElementShape): void;

  // StepElement_Volume3dElementDescriptor.get_type_name (method)
  static get_type_name(): string;

  // StepElement_Volume3dElementDescriptor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_Volume3dElementDescriptor.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_Volume3dElementDescriptor.delete (method)
  delete(): void;

  // StepElement_Volume3dElementDescriptor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_Volume3dElementShape: typeof StepElement_Volume3dElementShape[keyof typeof StepElement_Volume3dElementShape]

  readonly StepElement_Hexahedron: 'StepElement_Hexahedron'

  readonly StepElement_Wedge: 'StepElement_Wedge'

  readonly StepElement_Tetrahedron: 'StepElement_Tetrahedron'

  readonly StepElement_Pyramid: 'StepElement_Pyramid'

StepElement_VolumeElementPurpose: declare class StepElement_VolumeElementPurpose extends StepData_SelectType

  // StepElement_VolumeElementPurpose.constructor (constructor)
  constructor();

  // StepElement_VolumeElementPurpose.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepElement_VolumeElementPurpose.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepElement_VolumeElementPurpose.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepElement_VolumeElementPurpose.SetEnumeratedVolumeElementPurpose (method)
  SetEnumeratedVolumeElementPurpose(aVal: StepElement_EnumeratedVolumeElementPurpose): void;

  // StepElement_VolumeElementPurpose.EnumeratedVolumeElementPurpose (method)
  EnumeratedVolumeElementPurpose(): StepElement_EnumeratedVolumeElementPurpose;

  // StepElement_VolumeElementPurpose.SetApplicationDefinedElementPurpose (method)
  SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

  // StepElement_VolumeElementPurpose.ApplicationDefinedElementPurpose (method)
  ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

  // StepElement_VolumeElementPurpose.delete (method)
  delete(): void;

  // StepElement_VolumeElementPurpose.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_VolumeElementPurposeMember: declare class StepElement_VolumeElementPurposeMember extends StepData_SelectNamed

  // StepElement_VolumeElementPurposeMember.constructor (constructor)
  constructor();

  // StepElement_VolumeElementPurposeMember.HasName (method)
  HasName(): boolean;

  // StepElement_VolumeElementPurposeMember.Name (method)
  Name(): string;

  // StepElement_VolumeElementPurposeMember.SetName (method)
  SetName(name: string): boolean;

  // StepElement_VolumeElementPurposeMember.Matches (method)
  Matches(name: string): boolean;

  // StepElement_VolumeElementPurposeMember.get_type_name (method)
  static get_type_name(): string;

  // StepElement_VolumeElementPurposeMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepElement_VolumeElementPurposeMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepElement_VolumeElementPurposeMember.delete (method)
  delete(): void;

  // StepElement_VolumeElementPurposeMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepElement_Array1OfCurveElementEndReleasePacket: NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket

StepElement_Array1OfCurveElementSectionDefinition: NCollection_Array1_handle_StepElement_CurveElementSectionDefinition

StepElement_Array1OfHSequenceOfCurveElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_Array1OfHSequenceOfSurfaceElementPurposeMember: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_Array1OfMeasureOrUnspecifiedValue: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue

StepElement_Array1OfSurfaceSection: NCollection_Array1_handle_StepElement_SurfaceSection

StepElement_Array1OfVolumeElementPurposeMember: NCollection_Array1_handle_StepElement_VolumeElementPurposeMember

StepElement_HArray1OfCurveElementEndReleasePacket: NCollection_HArray1_handle_StepElement_CurveElementEndReleasePacket

StepElement_HArray1OfCurveElementSectionDefinition: NCollection_HArray1_handle_StepElement_CurveElementSectionDefinition

StepElement_HArray1OfHSequenceOfCurveElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_HArray1OfHSequenceOfSurfaceElementPurposeMember: NCollection_HArray1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_HArray1OfMeasureOrUnspecifiedValue: NCollection_HArray1_StepElement_MeasureOrUnspecifiedValue

StepElement_HArray1OfSurfaceSection: NCollection_HArray1_handle_StepElement_SurfaceSection

StepElement_HArray1OfVolumeElementPurposeMember: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember

StepElement_HSequenceOfCurveElementPurposeMember: NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

StepElement_HSequenceOfCurveElementSectionDefinition: NCollection_HSequence_handle_StepElement_CurveElementSectionDefinition

StepElement_HSequenceOfElementMaterial: NCollection_HSequence_handle_StepElement_ElementMaterial

StepElement_HSequenceOfSurfaceElementPurposeMember: NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

StepElement_SequenceOfCurveElementSectionDefinition: NCollection_Sequence_handle_StepElement_CurveElementSectionDefinition

StepElement_SequenceOfElementMaterial: NCollection_Sequence_handle_StepElement_ElementMaterial
