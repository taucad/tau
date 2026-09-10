# libcascade — StepElement (2)

28 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity SurfaceSectionFieldConstant
StepElement_SurfaceSectionFieldConstant: declare class StepElement_SurfaceSectionFieldConstant extends StepElement_SurfaceSectionField

constructor

// Initialize all fields (own and inherited)
Init(aDefinition: StepElement_SurfaceSection): void;

// Returns field Definition
Definition(): StepElement_SurfaceSection;

// Set field Definition
SetDefinition(Definition: StepElement_SurfaceSection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceSectionFieldVarying
StepElement_SurfaceSectionFieldVarying: declare class StepElement_SurfaceSectionFieldVarying extends StepElement_SurfaceSectionField

constructor

// Initialize all fields (own and inherited)
Init(aDefinitions: NCollection_HArray1_handle_StepElement_SurfaceSection, aAdditionalNodeValues: boolean): void;

// Returns field Definitions
Definitions(): NCollection_HArray1_handle_StepElement_SurfaceSection;

// Set field Definitions
SetDefinitions(Definitions: NCollection_HArray1_handle_StepElement_SurfaceSection): void;

// Returns field AdditionalNodeValues
AdditionalNodeValues(): boolean;

// Set field AdditionalNodeValues
SetAdditionalNodeValues(AdditionalNodeValues: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity UniformSurfaceSection
StepElement_UniformSurfaceSection: declare class StepElement_UniformSurfaceSection extends StepElement_SurfaceSection

constructor

// Initialize all fields (own and inherited)
Init(aSurfaceSection_Offset: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue, aThickness: number, aBendingThickness: StepElement_MeasureOrUnspecifiedValue, aShearThickness: StepElement_MeasureOrUnspecifiedValue): void;
Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;
Init(aSurfaceSection_Offset: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aSurfaceSection_NonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue, aThickness: number, aBendingThickness: StepElement_MeasureOrUnspecifiedValue, aShearThickness: StepElement_MeasureOrUnspecifiedValue): void;
Init(aOffset: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMass: StepElement_MeasureOrUnspecifiedValue, aNonStructuralMassOffset: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field Thickness
Thickness(): number;

// Set field Thickness
SetThickness(Thickness: number): void;

// Returns field BendingThickness
BendingThickness(): StepElement_MeasureOrUnspecifiedValue;

// Set field BendingThickness
SetBendingThickness(BendingThickness: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field ShearThickness
ShearThickness(): StepElement_MeasureOrUnspecifiedValue;

// Set field ShearThickness
SetShearThickness(ShearThickness: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepElement_UnspecifiedValue: typeof StepElement_UnspecifiedValue[keyof typeof StepElement_UnspecifiedValue]

// Representation of STEP entity Volume3dElementDescriptor
StepElement_Volume3dElementDescriptor: declare class StepElement_Volume3dElementDescriptor extends StepElement_ElementDescriptor

constructor

// Initialize all fields (own and inherited)
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember, aShape: StepElement_Volume3dElementShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;
Init(aElementDescriptor_TopologyOrder: StepElement_ElementOrder, aElementDescriptor_Description: TCollection_HAsciiString, aPurpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember, aShape: StepElement_Volume3dElementShape): void;
Init(aTopologyOrder: StepElement_ElementOrder, aDescription: TCollection_HAsciiString): void;

// Returns field Purpose
Purpose(): NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember;

// Set field Purpose
SetPurpose(Purpose: NCollection_HArray1_handle_StepElement_VolumeElementPurposeMember): void;

// Returns field Shape
Shape(): StepElement_Volume3dElementShape;

// Set field Shape
SetShape(Shape: StepElement_Volume3dElementShape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepElement_Volume3dElementShape: typeof StepElement_Volume3dElementShape[keyof typeof StepElement_Volume3dElementShape]

// Representation of STEP SELECT type VolumeElementPurpose
StepElement_VolumeElementPurpose: declare class StepElement_VolumeElementPurpose extends StepData_SelectType

constructor

// Recognizes a kind of VolumeElementPurpose select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member VolumeElementPurposeMember 1 -> EnumeratedVolumeElementPurpose 2 -> ApplicationDefinedElementPurpose 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type VolumeElementPurposeMember
NewMember(): StepData_SelectMember;

// Set Value for EnumeratedVolumeElementPurpose
SetEnumeratedVolumeElementPurpose(aVal: StepElement_EnumeratedVolumeElementPurpose): void;

// Returns Value as EnumeratedVolumeElementPurpose (or Null if another type)
EnumeratedVolumeElementPurpose(): StepElement_EnumeratedVolumeElementPurpose;

// Set Value for ApplicationDefinedElementPurpose
SetApplicationDefinedElementPurpose(aVal: TCollection_HAsciiString): void;

// Returns Value as ApplicationDefinedElementPurpose (or Null if another type)
ApplicationDefinedElementPurpose(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type VolumeElementPurpose
StepElement_VolumeElementPurposeMember: declare class StepElement_VolumeElementPurposeMember extends StepData_SelectNamed

constructor

// Returns True if has name
HasName(): boolean;

// Returns set name
Name(): string;

// Set name
SetName(name: string): boolean;

// Tells if the name of a SelectMember matches a given one;
Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

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
