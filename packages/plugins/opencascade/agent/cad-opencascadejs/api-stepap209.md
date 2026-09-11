# libcascade — StepAP209

1 top-level symbols. Signatures are verbatim typescript.

StepAP209_Construct: declare class StepAP209_Construct extends STEPConstruct_Tool

constructor

Init(WS: XSControl_WorkSession): boolean;

IsDesing(PD: StepBasic_ProductDefinitionFormation): boolean;

IsAnalys(PD: StepBasic_ProductDefinitionFormation): boolean;

FeaModel(Prod: StepBasic_Product): StepFEA_FeaModel;
FeaModel(PDF: StepBasic_ProductDefinitionFormation): StepFEA_FeaModel;
FeaModel(PDS: StepRepr_ProductDefinitionShape): StepFEA_FeaModel;
FeaModel(PD: StepBasic_ProductDefinition): StepFEA_FeaModel;
FeaModel(Prod: StepBasic_Product): StepFEA_FeaModel;
FeaModel(PDF: StepBasic_ProductDefinitionFormation): StepFEA_FeaModel;
FeaModel(PDS: StepRepr_ProductDefinitionShape): StepFEA_FeaModel;
FeaModel(PD: StepBasic_ProductDefinition): StepFEA_FeaModel;
FeaModel(Prod: StepBasic_Product): StepFEA_FeaModel;
FeaModel(PDF: StepBasic_ProductDefinitionFormation): StepFEA_FeaModel;
FeaModel(PDS: StepRepr_ProductDefinitionShape): StepFEA_FeaModel;
FeaModel(PD: StepBasic_ProductDefinition): StepFEA_FeaModel;
FeaModel(Prod: StepBasic_Product): StepFEA_FeaModel;
FeaModel(PDF: StepBasic_ProductDefinitionFormation): StepFEA_FeaModel;
FeaModel(PDS: StepRepr_ProductDefinitionShape): StepFEA_FeaModel;
FeaModel(PD: StepBasic_ProductDefinition): StepFEA_FeaModel;

GetFeaAxis2Placement3d(theFeaModel: StepFEA_FeaModel): StepFEA_FeaAxis2Placement3d;

IdealShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
IdealShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
IdealShape(PD: StepBasic_ProductDefinition): StepShape_ShapeRepresentation;
IdealShape(PDS: StepRepr_ProductDefinitionShape): StepShape_ShapeRepresentation;
IdealShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
IdealShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
IdealShape(PD: StepBasic_ProductDefinition): StepShape_ShapeRepresentation;
IdealShape(PDS: StepRepr_ProductDefinitionShape): StepShape_ShapeRepresentation;
IdealShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
IdealShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
IdealShape(PD: StepBasic_ProductDefinition): StepShape_ShapeRepresentation;
IdealShape(PDS: StepRepr_ProductDefinitionShape): StepShape_ShapeRepresentation;
IdealShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
IdealShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
IdealShape(PD: StepBasic_ProductDefinition): StepShape_ShapeRepresentation;
IdealShape(PDS: StepRepr_ProductDefinitionShape): StepShape_ShapeRepresentation;

NominShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
NominShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
NominShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
NominShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;

GetElementMaterial(): NCollection_HSequence_handle_StepElement_ElementMaterial;

GetElemGeomRelat(): NCollection_HSequence_handle_StepFEA_ElementGeometricRelationship;

GetElements1D(theFeaModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

GetElements2D(theFEAModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

GetElements3D(theFEAModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

GetCurElemSection(ElemRepr: StepFEA_Curve3dElementRepresentation): NCollection_HSequence_handle_StepElement_CurveElementSectionDefinition;

GetShReprForElem(ElemRepr: StepFEA_ElementRepresentation): StepShape_ShapeRepresentation;

CreateAnalysStructure(Prod: StepBasic_Product): boolean;

CreateFeaStructure(Prod: StepBasic_Product): boolean;

ReplaceCcDesingToApplied(): boolean;

CreateAddingEntities(AnaPD: StepBasic_ProductDefinition): boolean;

CreateAP203Structure(): StepData_StepModel;

CreateAdding203Entities(PD: StepBasic_ProductDefinition): { returnValue: boolean; aModel: StepData_StepModel; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;
