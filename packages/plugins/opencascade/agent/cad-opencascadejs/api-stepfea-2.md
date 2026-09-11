# libcascade — StepFEA (2)

33 top-level symbols. Signatures are verbatim typescript.

StepFEA_FeaModel: declare class StepFEA_FeaModel extends StepRepr_Representation

constructor

Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aCreatingSoftware: TCollection_HAsciiString, aIntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString, aDescription: TCollection_HAsciiString, aAnalysisType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aCreatingSoftware: TCollection_HAsciiString, aIntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString, aDescription: TCollection_HAsciiString, aAnalysisType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

CreatingSoftware(): TCollection_HAsciiString;

SetCreatingSoftware(CreatingSoftware: TCollection_HAsciiString): void;

IntendedAnalysisCode(): NCollection_HArray1_TCollection_AsciiString;

SetIntendedAnalysisCode(IntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

AnalysisType(): TCollection_HAsciiString;

SetAnalysisType(AnalysisType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaModel3d: declare class StepFEA_FeaModel3d extends StepFEA_FeaModel

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaModelDefinition: declare class StepFEA_FeaModelDefinition extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaMoistureAbsorption: declare class StepFEA_FeaMoistureAbsorption extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor23d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaParametricPoint: declare class StepFEA_FeaParametricPoint extends StepGeom_Point

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinates: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinates: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString): void;

Coordinates(): NCollection_HArray1_double;

SetCoordinates(Coordinates: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaRepresentationItem: declare class StepFEA_FeaRepresentationItem extends StepRepr_RepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaSecantCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaSecantCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d, aReferenceTemperature: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d, aReferenceTemperature: number): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor23d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

ReferenceTemperature(): number;

SetReferenceTemperature(ReferenceTemperature: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaShellBendingStiffness: declare class StepFEA_FeaShellBendingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor42d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaShellMembraneBendingCouplingStiffness: declare class StepFEA_FeaShellMembraneBendingCouplingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor42d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaShellMembraneStiffness: declare class StepFEA_FeaShellMembraneStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor42d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaShellShearStiffness: declare class StepFEA_FeaShellShearStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor22d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor22d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor22d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor22d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaSurfaceSectionGeometricRelationship: declare class StepFEA_FeaSurfaceSectionGeometricRelationship extends Standard_Transient

constructor

Init(aSectionRef: StepElement_SurfaceSection, aItem: StepElement_AnalysisItemWithinRepresentation): void;

SectionRef(): StepElement_SurfaceSection;

SetSectionRef(SectionRef: StepElement_SurfaceSection): void;

Item(): StepElement_AnalysisItemWithinRepresentation;

SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;

FeaConstants(): StepFEA_SymmetricTensor23d;

SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FreedomAndCoefficient: declare class StepFEA_FreedomAndCoefficient extends Standard_Transient

constructor

Init(aFreedom: StepFEA_DegreeOfFreedom, aA: StepElement_MeasureOrUnspecifiedValue): void;

Freedom(): StepFEA_DegreeOfFreedom;

SetFreedom(Freedom: StepFEA_DegreeOfFreedom): void;

A(): StepElement_MeasureOrUnspecifiedValue;

SetA(A: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_FreedomsList: declare class StepFEA_FreedomsList extends Standard_Transient

constructor

Init(aFreedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

Freedoms(): NCollection_HArray1_StepFEA_DegreeOfFreedom;

SetFreedoms(Freedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_GeometricNode: declare class StepFEA_GeometricNode extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_Node: declare class StepFEA_Node extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeDefinition: declare class StepFEA_NodeDefinition extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeGroup: declare class StepFEA_NodeGroup extends StepFEA_FeaGroup

constructor

Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeRepresentation: declare class StepFEA_NodeRepresentation extends StepRepr_Representation

constructor

Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

ModelRef(): StepFEA_FeaModel;

SetModelRef(ModelRef: StepFEA_FeaModel): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeSet: declare class StepFEA_NodeSet extends StepGeom_GeometricRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString): void;

Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeWithSolutionCoordinateSystem: declare class StepFEA_NodeWithSolutionCoordinateSystem extends StepFEA_Node

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_NodeWithVector: declare class StepFEA_NodeWithVector extends StepFEA_Node

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ParametricCurve3dElementCoordinateDirection: declare class StepFEA_ParametricCurve3dElementCoordinateDirection extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString): void;

Orientation(): StepGeom_Direction;

SetOrientation(Orientation: StepGeom_Direction): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ParametricCurve3dElementCoordinateSystem: declare class StepFEA_ParametricCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aDirection: StepFEA_ParametricCurve3dElementCoordinateDirection): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aDirection: StepFEA_ParametricCurve3dElementCoordinateDirection): void;
Init(aName: TCollection_HAsciiString): void;

Direction(): StepFEA_ParametricCurve3dElementCoordinateDirection;

SetDirection(Direction: StepFEA_ParametricCurve3dElementCoordinateDirection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_ParametricSurface3dElementCoordinateSystem: declare class StepFEA_ParametricSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
Init(aName: TCollection_HAsciiString): void;

Axis(): number;

SetAxis(Axis: number): void;

Angle(): number;

SetAngle(Angle: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_Surface3dElementRepresentation: declare class StepFEA_Surface3dElementRepresentation extends StepFEA_ElementRepresentation

constructor

Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

ModelRef(): StepFEA_FeaModel3d;

SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

ElementDescriptor(): StepElement_Surface3dElementDescriptor;

SetElementDescriptor(ElementDescriptor: StepElement_Surface3dElementDescriptor): void;

Property(): StepElement_SurfaceElementProperty;

SetProperty(Property: StepElement_SurfaceElementProperty): void;

Material(): StepElement_ElementMaterial;

SetMaterial(Material: StepElement_ElementMaterial): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_SymmetricTensor22d: declare class StepFEA_SymmetricTensor22d extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

AnisotropicSymmetricTensor22d(): NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;

StepFEA_SymmetricTensor23d: declare class StepFEA_SymmetricTensor23d extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

CaseMem(ent: StepData_SelectMember): number;

NewMember(): StepData_SelectMember;

SetIsotropicSymmetricTensor23d(aVal: number): void;

IsotropicSymmetricTensor23d(): number;

SetOrthotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

OrthotropicSymmetricTensor23d(): NCollection_HArray1_double;

SetAnisotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

AnisotropicSymmetricTensor23d(): NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;

StepFEA_SymmetricTensor23dMember: declare class StepFEA_SymmetricTensor23dMember extends StepData_SelectArrReal

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_SymmetricTensor42d: declare class StepFEA_SymmetricTensor42d extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

AnisotropicSymmetricTensor42d(): NCollection_HArray1_double;

delete(): void;

[Symbol.dispose](): void;

StepFEA_SymmetricTensor43dMember: declare class StepFEA_SymmetricTensor43dMember extends StepData_SelectArrReal

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

Matches(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepFEA_UnspecifiedValue: typeof StepFEA_UnspecifiedValue[keyof typeof StepFEA_UnspecifiedValue]
