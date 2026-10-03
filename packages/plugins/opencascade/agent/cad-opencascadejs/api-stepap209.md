# libcascade — StepAP209

1 top-level symbols. Signatures are verbatim typescript.

StepAP209_Construct: declare class StepAP209_Construct extends STEPConstruct_Tool

  // StepAP209_Construct.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession);

  // StepAP209_Construct.Init (method)
  Init(WS: XSControl_WorkSession): boolean;

  // StepAP209_Construct.IsDesing (method)
  IsDesing(PD: StepBasic_ProductDefinitionFormation): boolean;

  // StepAP209_Construct.IsAnalys (method)
  IsAnalys(PD: StepBasic_ProductDefinitionFormation): boolean;

  // StepAP209_Construct.FeaModel (method)
  FeaModel(Prod: StepBasic_Product): StepFEA_FeaModel;
  FeaModel(PDF: StepBasic_ProductDefinitionFormation): StepFEA_FeaModel;
  FeaModel(PDS: StepRepr_ProductDefinitionShape): StepFEA_FeaModel;
  FeaModel(PD: StepBasic_ProductDefinition): StepFEA_FeaModel;

  // StepAP209_Construct.GetFeaAxis2Placement3d (method)
  GetFeaAxis2Placement3d(theFeaModel: StepFEA_FeaModel): StepFEA_FeaAxis2Placement3d;

  // StepAP209_Construct.IdealShape (method)
  IdealShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
  IdealShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;
  IdealShape(PD: StepBasic_ProductDefinition): StepShape_ShapeRepresentation;
  IdealShape(PDS: StepRepr_ProductDefinitionShape): StepShape_ShapeRepresentation;

  // StepAP209_Construct.NominShape (method)
  NominShape(Prod: StepBasic_Product): StepShape_ShapeRepresentation;
  NominShape(PDF: StepBasic_ProductDefinitionFormation): StepShape_ShapeRepresentation;

  // StepAP209_Construct.GetElementMaterial (method)
  GetElementMaterial(): NCollection_HSequence_handle_StepElement_ElementMaterial;

  // StepAP209_Construct.GetElemGeomRelat (method)
  GetElemGeomRelat(): NCollection_HSequence_handle_StepFEA_ElementGeometricRelationship;

  // StepAP209_Construct.GetElements1D (method)
  GetElements1D(theFeaModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

  // StepAP209_Construct.GetElements2D (method)
  GetElements2D(theFEAModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

  // StepAP209_Construct.GetElements3D (method)
  GetElements3D(theFEAModel: StepFEA_FeaModel): NCollection_HSequence_handle_StepFEA_ElementRepresentation;

  // StepAP209_Construct.GetCurElemSection (method)
  GetCurElemSection(ElemRepr: StepFEA_Curve3dElementRepresentation): NCollection_HSequence_handle_StepElement_CurveElementSectionDefinition;

  // StepAP209_Construct.GetShReprForElem (method)
  GetShReprForElem(ElemRepr: StepFEA_ElementRepresentation): StepShape_ShapeRepresentation;

  // StepAP209_Construct.CreateAnalysStructure (method)
  CreateAnalysStructure(Prod: StepBasic_Product): boolean;

  // StepAP209_Construct.CreateFeaStructure (method)
  CreateFeaStructure(Prod: StepBasic_Product): boolean;

  // StepAP209_Construct.ReplaceCcDesingToApplied (method)
  ReplaceCcDesingToApplied(): boolean;

  // StepAP209_Construct.CreateAddingEntities (method)
  CreateAddingEntities(AnaPD: StepBasic_ProductDefinition): boolean;

  // StepAP209_Construct.CreateAP203Structure (method)
  CreateAP203Structure(): StepData_StepModel;

  // StepAP209_Construct.CreateAdding203Entities (method)
  CreateAdding203Entities(PD: StepBasic_ProductDefinition): { returnValue: boolean; aModel: StepData_StepModel; [Symbol.dispose](): void };

  // StepAP209_Construct.delete (method)
  delete(): void;

  // StepAP209_Construct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
