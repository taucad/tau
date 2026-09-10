# libcascade — StepFEA (3)

28 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity NodeWithVector
StepFEA_NodeWithVector: declare class StepFEA_NodeWithVector extends StepFEA_Node

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ParametricCurve3dElementCoordinateDirection
StepFEA_ParametricCurve3dElementCoordinateDirection: declare class StepFEA_ParametricCurve3dElementCoordinateDirection extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Orientation
Orientation(): StepGeom_Direction;

// Set field Orientation
SetOrientation(Orientation: StepGeom_Direction): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ParametricCurve3dElementCoordinateSystem
StepFEA_ParametricCurve3dElementCoordinateSystem: declare class StepFEA_ParametricCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aDirection: StepFEA_ParametricCurve3dElementCoordinateDirection): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aDirection: StepFEA_ParametricCurve3dElementCoordinateDirection): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Direction
Direction(): StepFEA_ParametricCurve3dElementCoordinateDirection;

// Set field Direction
SetDirection(Direction: StepFEA_ParametricCurve3dElementCoordinateDirection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ParametricSurface3dElementCoordinateSystem
StepFEA_ParametricSurface3dElementCoordinateSystem: declare class StepFEA_ParametricSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Axis
Axis(): number;

// Set field Axis
SetAxis(Axis: number): void;

// Returns field Angle
Angle(): number;

// Set field Angle
SetAngle(Angle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Surface3dElementRepresentation
StepFEA_Surface3dElementRepresentation: declare class StepFEA_Surface3dElementRepresentation extends StepFEA_ElementRepresentation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field ModelRef
ModelRef(): StepFEA_FeaModel3d;

// Set field ModelRef
SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

// Returns field ElementDescriptor
ElementDescriptor(): StepElement_Surface3dElementDescriptor;

// Set field ElementDescriptor
SetElementDescriptor(ElementDescriptor: StepElement_Surface3dElementDescriptor): void;

// Returns field Property
Property(): StepElement_SurfaceElementProperty;

// Set field Property
SetProperty(Property: StepElement_SurfaceElementProperty): void;

// Returns field Material
Material(): StepElement_ElementMaterial;

// Set field Material
SetMaterial(Material: StepElement_ElementMaterial): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type SymmetricTensor22d
StepFEA_SymmetricTensor22d: declare class StepFEA_SymmetricTensor22d extends StepData_SelectType

constructor

// Recognizes a kind of SymmetricTensor22d select type 1 -> HArray1OfReal from TColStd 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as AnisotropicSymmetricTensor22d (or Null if another type)
AnisotropicSymmetricTensor22d(): NCollection_HArray1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type SymmetricTensor23d
StepFEA_SymmetricTensor23d: declare class StepFEA_SymmetricTensor23d extends StepData_SelectType

constructor

// Recognizes a kind of SymmetricTensor23d select type return 0
CaseNum(ent: Standard_Transient): number;

// Recognizes a items of select member SymmetricTensor23dMember 1 -> IsotropicSymmetricTensor23d 2 -> OrthotropicSymmetricTensor23d 3 -> AnisotropicSymmetricTensor23d 0 else
CaseMem(ent: StepData_SelectMember): number;

// Returns a new select member the type SymmetricTensor23dMember
NewMember(): StepData_SelectMember;

// Set Value for IsotropicSymmetricTensor23d
SetIsotropicSymmetricTensor23d(aVal: number): void;

// Returns Value as IsotropicSymmetricTensor23d (or Null if another type)
IsotropicSymmetricTensor23d(): number;

// Set Value for OrthotropicSymmetricTensor23d
SetOrthotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

// Returns Value as OrthotropicSymmetricTensor23d (or Null if another type)
OrthotropicSymmetricTensor23d(): NCollection_HArray1_double;

// Set Value for AnisotropicSymmetricTensor23d
SetAnisotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

// Returns Value as AnisotropicSymmetricTensor23d (or Null if another type)
AnisotropicSymmetricTensor23d(): NCollection_HArray1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type SymmetricTensor23d
StepFEA_SymmetricTensor23dMember: declare class StepFEA_SymmetricTensor23dMember extends StepData_SelectArrReal

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

// Representation of STEP SELECT type SymmetricTensor42d
StepFEA_SymmetricTensor42d: declare class StepFEA_SymmetricTensor42d extends StepData_SelectType

constructor

// Recognizes a kind of SymmetricTensor42d select type 1 -> HArray1OfReal from TColStd 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as AnisotropicSymmetricTensor42d (or Null if another type)
AnisotropicSymmetricTensor42d(): NCollection_HArray1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of member for STEP SELECT type SymmetricTensor43d
StepFEA_SymmetricTensor43dMember: declare class StepFEA_SymmetricTensor43dMember extends StepData_SelectArrReal

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

StepFEA_UnspecifiedValue: typeof StepFEA_UnspecifiedValue[keyof typeof StepFEA_UnspecifiedValue]

// Representation of STEP entity Volume3dElementRepresentation
StepFEA_Volume3dElementRepresentation: declare class StepFEA_Volume3dElementRepresentation extends StepFEA_ElementRepresentation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Volume3dElementDescriptor, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Volume3dElementDescriptor, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Volume3dElementDescriptor, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field ModelRef
ModelRef(): StepFEA_FeaModel3d;

// Set field ModelRef
SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

// Returns field ElementDescriptor
ElementDescriptor(): StepElement_Volume3dElementDescriptor;

// Set field ElementDescriptor
SetElementDescriptor(ElementDescriptor: StepElement_Volume3dElementDescriptor): void;

// Returns field Material
Material(): StepElement_ElementMaterial;

// Set field Material
SetMaterial(Material: StepElement_ElementMaterial): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepFEA_Array1OfCurveElementEndOffset: NCollection_Array1_handle_StepFEA_CurveElementEndOffset

StepFEA_Array1OfCurveElementEndRelease: NCollection_Array1_handle_StepFEA_CurveElementEndRelease

StepFEA_Array1OfCurveElementInterval: NCollection_Array1_handle_StepFEA_CurveElementInterval

StepFEA_Array1OfDegreeOfFreedom: NCollection_Array1_StepFEA_DegreeOfFreedom

StepFEA_Array1OfElementRepresentation: NCollection_Array1_handle_StepFEA_ElementRepresentation

StepFEA_Array1OfNodeRepresentation: NCollection_Array1_handle_StepFEA_NodeRepresentation

StepFEA_HArray1OfCurveElementEndOffset: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset

StepFEA_HArray1OfCurveElementEndRelease: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease

StepFEA_HArray1OfCurveElementInterval: NCollection_HArray1_handle_StepFEA_CurveElementInterval

StepFEA_HArray1OfDegreeOfFreedom: NCollection_HArray1_StepFEA_DegreeOfFreedom

StepFEA_HArray1OfElementRepresentation: NCollection_HArray1_handle_StepFEA_ElementRepresentation

StepFEA_HArray1OfNodeRepresentation: NCollection_HArray1_handle_StepFEA_NodeRepresentation

StepFEA_HSequenceOfElementGeometricRelationship: NCollection_HSequence_handle_StepFEA_ElementGeometricRelationship

StepFEA_HSequenceOfElementRepresentation: NCollection_HSequence_handle_StepFEA_ElementRepresentation

StepFEA_SequenceOfElementGeometricRelationship: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship

StepFEA_SequenceOfElementRepresentation: NCollection_Sequence_handle_StepFEA_ElementRepresentation
