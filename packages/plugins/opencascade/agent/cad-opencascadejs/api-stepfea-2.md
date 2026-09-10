# libcascade — StepFEA (2)

29 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity FeaAxis2Placement3d
StepFEA_FeaAxis2Placement3d: declare class StepFEA_FeaAxis2Placement3d extends StepGeom_Axis2Placement3d

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aPlacement_Location: StepGeom_CartesianPoint, hasAxis2Placement3d_Axis: boolean, aAxis2Placement3d_Axis: StepGeom_Direction, hasAxis2Placement3d_RefDirection: boolean, aAxis2Placement3d_RefDirection: StepGeom_Direction, aSystemType: StepFEA_CoordinateSystemType, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field SystemType
SystemType(): StepFEA_CoordinateSystemType;

// Set field SystemType
SetSystemType(SystemType: StepFEA_CoordinateSystemType): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaCurveSectionGeometricRelationship
StepFEA_FeaCurveSectionGeometricRelationship: declare class StepFEA_FeaCurveSectionGeometricRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aSectionRef: StepElement_CurveElementSectionDefinition, aItem: StepElement_AnalysisItemWithinRepresentation): void;

// Returns field SectionRef
SectionRef(): StepElement_CurveElementSectionDefinition;

// Set field SectionRef
SetSectionRef(SectionRef: StepElement_CurveElementSectionDefinition): void;

// Returns field Item
Item(): StepElement_AnalysisItemWithinRepresentation;

// Set field Item
SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaGroup
StepFEA_FeaGroup: declare class StepFEA_FeaGroup extends StepBasic_Group

constructor

// Initialize all fields (own and inherited)
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field ModelRef
ModelRef(): StepFEA_FeaModel;

// Set field ModelRef
SetModelRef(ModelRef: StepFEA_FeaModel): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaLinearElasticity
StepFEA_FeaLinearElasticity: declare class StepFEA_FeaLinearElasticity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaMassDensity
StepFEA_FeaMassDensity: declare class StepFEA_FeaMassDensity extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstant: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstant
FeaConstant(): number;

// Set field FeaConstant
SetFeaConstant(FeaConstant: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaMaterialPropertyRepresentation
StepFEA_FeaMaterialPropertyRepresentation: declare class StepFEA_FeaMaterialPropertyRepresentation extends StepRepr_MaterialPropertyRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaMaterialPropertyRepresentationItem
StepFEA_FeaMaterialPropertyRepresentationItem: declare class StepFEA_FeaMaterialPropertyRepresentationItem extends StepRepr_RepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaModel
StepFEA_FeaModel: declare class StepFEA_FeaModel extends StepRepr_Representation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aCreatingSoftware: TCollection_HAsciiString, aIntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString, aDescription: TCollection_HAsciiString, aAnalysisType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aCreatingSoftware: TCollection_HAsciiString, aIntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString, aDescription: TCollection_HAsciiString, aAnalysisType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field CreatingSoftware
CreatingSoftware(): TCollection_HAsciiString;

// Set field CreatingSoftware
SetCreatingSoftware(CreatingSoftware: TCollection_HAsciiString): void;

// Returns field IntendedAnalysisCode
IntendedAnalysisCode(): NCollection_HArray1_TCollection_AsciiString;

// Set field IntendedAnalysisCode
SetIntendedAnalysisCode(IntendedAnalysisCode: NCollection_HArray1_TCollection_AsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field AnalysisType
AnalysisType(): TCollection_HAsciiString;

// Set field AnalysisType
SetAnalysisType(AnalysisType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaModel3d
StepFEA_FeaModel3d: declare class StepFEA_FeaModel3d extends StepFEA_FeaModel

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaModelDefinition
StepFEA_FeaModelDefinition: declare class StepFEA_FeaModelDefinition extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaMoistureAbsorption
StepFEA_FeaMoistureAbsorption: declare class StepFEA_FeaMoistureAbsorption extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor23d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaParametricPoint
StepFEA_FeaParametricPoint: declare class StepFEA_FeaParametricPoint extends StepGeom_Point

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinates: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCoordinates: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Coordinates
Coordinates(): NCollection_HArray1_double;

// Set field Coordinates
SetCoordinates(Coordinates: NCollection_HArray1_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaRepresentationItem
StepFEA_FeaRepresentationItem: declare class StepFEA_FeaRepresentationItem extends StepRepr_RepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaSecantCoefficientOfLinearThermalExpansion
StepFEA_FeaSecantCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaSecantCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d, aReferenceTemperature: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d, aReferenceTemperature: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor23d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

// Returns field ReferenceTemperature
ReferenceTemperature(): number;

// Set field ReferenceTemperature
SetReferenceTemperature(ReferenceTemperature: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaShellBendingStiffness
StepFEA_FeaShellBendingStiffness: declare class StepFEA_FeaShellBendingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor42d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaShellMembraneBendingCouplingStiffness
StepFEA_FeaShellMembraneBendingCouplingStiffness: declare class StepFEA_FeaShellMembraneBendingCouplingStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor42d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaShellMembraneStiffness
StepFEA_FeaShellMembraneStiffness: declare class StepFEA_FeaShellMembraneStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor42d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaShellShearStiffness
StepFEA_FeaShellShearStiffness: declare class StepFEA_FeaShellShearStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor22d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor22d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor22d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor22d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaSurfaceSectionGeometricRelationship
StepFEA_FeaSurfaceSectionGeometricRelationship: declare class StepFEA_FeaSurfaceSectionGeometricRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aSectionRef: StepElement_SurfaceSection, aItem: StepElement_AnalysisItemWithinRepresentation): void;

// Returns field SectionRef
SectionRef(): StepElement_SurfaceSection;

// Set field SectionRef
SetSectionRef(SectionRef: StepElement_SurfaceSection): void;

// Returns field Item
Item(): StepElement_AnalysisItemWithinRepresentation;

// Set field Item
SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FeaTangentialCoefficientOfLinearThermalExpansion
StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field FeaConstants
FeaConstants(): StepFEA_SymmetricTensor23d;

// Set field FeaConstants
SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FreedomAndCoefficient
StepFEA_FreedomAndCoefficient: declare class StepFEA_FreedomAndCoefficient extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aFreedom: StepFEA_DegreeOfFreedom, aA: StepElement_MeasureOrUnspecifiedValue): void;

// Returns field Freedom
Freedom(): StepFEA_DegreeOfFreedom;

// Set field Freedom
SetFreedom(Freedom: StepFEA_DegreeOfFreedom): void;

// Returns field A
A(): StepElement_MeasureOrUnspecifiedValue;

// Set field A
SetA(A: StepElement_MeasureOrUnspecifiedValue): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FreedomsList
StepFEA_FreedomsList: declare class StepFEA_FreedomsList extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aFreedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

// Returns field Freedoms
Freedoms(): NCollection_HArray1_StepFEA_DegreeOfFreedom;

// Set field Freedoms
SetFreedoms(Freedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GeometricNode
StepFEA_GeometricNode: declare class StepFEA_GeometricNode extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Node
StepFEA_Node: declare class StepFEA_Node extends StepFEA_NodeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NodeDefinition
StepFEA_NodeDefinition: declare class StepFEA_NodeDefinition extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NodeGroup
StepFEA_NodeGroup: declare class StepFEA_NodeGroup extends StepFEA_FeaGroup

constructor

// Initialize all fields (own and inherited)
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Nodes
Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

// Set field Nodes
SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NodeRepresentation
StepFEA_NodeRepresentation: declare class StepFEA_NodeRepresentation extends StepRepr_Representation

constructor

// Initialize all fields (own and inherited)
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aModelRef: StepFEA_FeaModel): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field ModelRef
ModelRef(): StepFEA_FeaModel;

// Set field ModelRef
SetModelRef(ModelRef: StepFEA_FeaModel): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NodeSet
StepFEA_NodeSet: declare class StepFEA_NodeSet extends StepGeom_GeometricRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Nodes
Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

// Set field Nodes
SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NodeWithSolutionCoordinateSystem
StepFEA_NodeWithSolutionCoordinateSystem: declare class StepFEA_NodeWithSolutionCoordinateSystem extends StepFEA_Node

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
