# libcascade — STEPConstruct

11 top-level symbols. Signatures are verbatim typescript.

STEPConstruct: declare class STEPConstruct

  constructor

  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape): StepRepr_RepresentationItem;
  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape, Loc: TopLoc_Location): StepRepr_RepresentationItem;
  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape): StepRepr_RepresentationItem;
  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape, Loc: TopLoc_Location): StepRepr_RepresentationItem;

  static FindShape(TransientProcess: Transfer_TransientProcess, item: StepRepr_RepresentationItem): TopoDS_Shape;

  static FindCDSR(ComponentBinder: Transfer_Binder, AssemblySDR: StepShape_ShapeDefinitionRepresentation): { returnValue: boolean; ComponentCDSR: StepShape_ContextDependentShapeRepresentation; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_AP203Context: declare class STEPConstruct_AP203Context

  constructor

  DefaultApproval(): StepBasic_Approval;

  SetDefaultApproval(app: StepBasic_Approval): void;

  DefaultDateAndTime(): StepBasic_DateAndTime;

  SetDefaultDateAndTime(dt: StepBasic_DateAndTime): void;

  DefaultPersonAndOrganization(): StepBasic_PersonAndOrganization;

  SetDefaultPersonAndOrganization(po: StepBasic_PersonAndOrganization): void;

  DefaultSecurityClassificationLevel(): StepBasic_SecurityClassificationLevel;

  SetDefaultSecurityClassificationLevel(sc: StepBasic_SecurityClassificationLevel): void;

  RoleCreator(): StepBasic_PersonAndOrganizationRole;

  RoleDesignOwner(): StepBasic_PersonAndOrganizationRole;

  RoleDesignSupplier(): StepBasic_PersonAndOrganizationRole;

  RoleClassificationOfficer(): StepBasic_PersonAndOrganizationRole;

  RoleCreationDate(): StepBasic_DateTimeRole;

  RoleClassificationDate(): StepBasic_DateTimeRole;

  RoleApprover(): StepBasic_ApprovalRole;

  Init(sdr: StepShape_ShapeDefinitionRepresentation): void;
  Init(SDRTool: STEPConstruct_Part): void;
  Init(nauo: StepRepr_NextAssemblyUsageOccurrence): void;
  Init(sdr: StepShape_ShapeDefinitionRepresentation): void;
  Init(SDRTool: STEPConstruct_Part): void;
  Init(nauo: StepRepr_NextAssemblyUsageOccurrence): void;
  Init(sdr: StepShape_ShapeDefinitionRepresentation): void;
  Init(SDRTool: STEPConstruct_Part): void;
  Init(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

  GetCreator(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  GetDesignOwner(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  GetDesignSupplier(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  GetClassificationOfficer(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  GetSecurity(): StepAP203_CcDesignSecurityClassification;

  GetCreationDate(): StepAP203_CcDesignDateAndTimeAssignment;

  GetClassificationDate(): StepAP203_CcDesignDateAndTimeAssignment;

  GetApproval(): StepAP203_CcDesignApproval;

  GetApprover(): StepBasic_ApprovalPersonOrganization;

  GetApprovalDateTime(): StepBasic_ApprovalDateTime;

  GetProductCategoryRelationship(): StepBasic_ProductCategoryRelationship;

  Clear(): void;

  InitRoles(): void;

  InitAssembly(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

  InitSecurityRequisites(): void;

  InitApprovalRequisites(): void;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_Assembly: declare class STEPConstruct_Assembly

  constructor

  Init(aSR: StepShape_ShapeDefinitionRepresentation, SDR0: StepShape_ShapeDefinitionRepresentation, Ax0: StepGeom_Axis2Placement3d, Loc: StepGeom_Axis2Placement3d): void;
  Init(theSR: StepShape_ShapeDefinitionRepresentation, theSDR0: StepShape_ShapeDefinitionRepresentation, theTrsfOp: StepGeom_CartesianTransformationOperator3d): void;
  Init(aSR: StepShape_ShapeDefinitionRepresentation, SDR0: StepShape_ShapeDefinitionRepresentation, Ax0: StepGeom_Axis2Placement3d, Loc: StepGeom_Axis2Placement3d): void;
  Init(theSR: StepShape_ShapeDefinitionRepresentation, theSDR0: StepShape_ShapeDefinitionRepresentation, theTrsfOp: StepGeom_CartesianTransformationOperator3d): void;

  MakeRelationship(): void;

  ItemValue(): Standard_Transient;

  ItemLocation(): StepGeom_Axis2Placement3d;

  GetNAUO(): StepRepr_NextAssemblyUsageOccurrence;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_ContextTool: declare class STEPConstruct_ContextTool

  constructor

  SetModel(aStepModel: StepData_StepModel): void;

  SetGlobalFactor(theGlobalFactor: StepData_Factors): void;

  GetAPD(): StepBasic_ApplicationProtocolDefinition;

  AddAPD(enforce?: boolean): void;

  IsAP203(): boolean;

  IsAP214(): boolean;

  IsAP242(): boolean;

  GetACstatus(): TCollection_HAsciiString;

  GetACschemaName(): TCollection_HAsciiString;

  GetACyear(): number;

  GetACname(): TCollection_HAsciiString;

  SetACstatus(status: TCollection_HAsciiString): void;

  SetACschemaName(schemaName: TCollection_HAsciiString): void;

  SetACyear(year: number): void;

  SetACname(name: TCollection_HAsciiString): void;

  GetDefaultAxis(): StepGeom_Axis2Placement3d;

  AP203Context(): STEPConstruct_AP203Context;

  Level(): number;

  NextLevel(): void;

  PrevLevel(): void;

  SetLevel(lev: number): void;

  Index(): number;

  NextIndex(): void;

  PrevIndex(): void;

  SetIndex(ind: number): void;

  GetProductName(): TCollection_HAsciiString;

  GetRootsForPart(SDRTool: STEPConstruct_Part): NCollection_HSequence_handle_Standard_Transient;

  GetRootsForAssemblyLink(assembly: STEPConstruct_Assembly): NCollection_HSequence_handle_Standard_Transient;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_ExternRefs: declare class STEPConstruct_ExternRefs extends STEPConstruct_Tool

  constructor

  Init(WS: XSControl_WorkSession): boolean;

  Clear(): void;

  LoadExternRefs(): boolean;

  NbExternRefs(): number;

  FileName(num: number): string;

  ProdDef(num: number): StepBasic_ProductDefinition;

  DocFile(num: number): StepBasic_DocumentFile;

  Format(num: number): TCollection_HAsciiString;

  AddExternRef(filename: string, PD: StepBasic_ProductDefinition, format: string): number;

  checkAP214Shared(): void;

  WriteExternRefs(num: number): number;

  SetAP214APD(APD: StepBasic_ApplicationProtocolDefinition): void;

  GetAP214APD(): StepBasic_ApplicationProtocolDefinition;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_Part: declare class STEPConstruct_Part

  constructor

  MakeSDR(aShape: StepShape_ShapeRepresentation, aName: TCollection_HAsciiString, AC: StepBasic_ApplicationContext, theStepModel: StepData_StepModel): void;

  ReadSDR(aShape: StepShape_ShapeDefinitionRepresentation): void;

  IsDone(): boolean;

  SDRValue(): StepShape_ShapeDefinitionRepresentation;

  SRValue(): StepShape_ShapeRepresentation;

  PC(): StepBasic_ProductContext;

  PCname(): TCollection_HAsciiString;

  PCdisciplineType(): TCollection_HAsciiString;

  SetPCname(name: TCollection_HAsciiString): void;

  SetPCdisciplineType(label: TCollection_HAsciiString): void;

  AC(): StepBasic_ApplicationContext;

  ACapplication(): TCollection_HAsciiString;

  SetACapplication(text: TCollection_HAsciiString): void;

  PDC(): StepBasic_ProductDefinitionContext;

  PDCname(): TCollection_HAsciiString;

  PDCstage(): TCollection_HAsciiString;

  SetPDCname(label: TCollection_HAsciiString): void;

  SetPDCstage(label: TCollection_HAsciiString): void;

  Product(): StepBasic_Product;

  Pid(): TCollection_HAsciiString;

  Pname(): TCollection_HAsciiString;

  Pdescription(): TCollection_HAsciiString;

  SetPid(id: TCollection_HAsciiString): void;

  SetPname(label: TCollection_HAsciiString): void;

  SetPdescription(text: TCollection_HAsciiString): void;

  PDF(): StepBasic_ProductDefinitionFormation;

  PDFid(): TCollection_HAsciiString;

  PDFdescription(): TCollection_HAsciiString;

  SetPDFid(id: TCollection_HAsciiString): void;

  SetPDFdescription(text: TCollection_HAsciiString): void;

  PD(): StepBasic_ProductDefinition;

  PDdescription(): TCollection_HAsciiString;

  SetPDdescription(text: TCollection_HAsciiString): void;

  PDS(): StepRepr_ProductDefinitionShape;

  PDSname(): TCollection_HAsciiString;

  PDSdescription(): TCollection_HAsciiString;

  SetPDSname(label: TCollection_HAsciiString): void;

  SetPDSdescription(text: TCollection_HAsciiString): void;

  PRPC(): StepBasic_ProductRelatedProductCategory;

  PRPCname(): TCollection_HAsciiString;

  PRPCdescription(): TCollection_HAsciiString;

  SetPRPCname(label: TCollection_HAsciiString): void;

  SetPRPCdescription(text: TCollection_HAsciiString): void;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_RenderingProperties: declare class STEPConstruct_RenderingProperties

  constructor

  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;

  SetAmbientReflectance(theAmbientReflectance: number): void;

  SetAmbientAndDiffuseReflectance(theAmbientReflectance: number, theDiffuseReflectance: number): void;

  SetAmbientDiffuseAndSpecularReflectance(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: Quantity_Color): void;

  CreateRenderingProperties(): StepVisual_SurfaceStyleRenderingWithProperties;
  CreateRenderingProperties(theRenderColour: StepVisual_Colour): StepVisual_SurfaceStyleRenderingWithProperties;
  CreateRenderingProperties(): StepVisual_SurfaceStyleRenderingWithProperties;
  CreateRenderingProperties(theRenderColour: StepVisual_Colour): StepVisual_SurfaceStyleRenderingWithProperties;

  CreateXCAFMaterial(): XCAFDoc_VisMaterialCommon;

  GetRGBAColor(): Quantity_ColorRGBA;

  SurfaceColor(): Quantity_Color;

  Transparency(): number;

  RenderingMethod(): StepVisual_ShadingSurfaceMethod;

  SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;

  IsDefined(): boolean;

  IsMaterialConvertible(): boolean;

  AmbientReflectance(): number;

  IsAmbientReflectanceDefined(): boolean;

  DiffuseReflectance(): number;

  IsDiffuseReflectanceDefined(): boolean;

  SpecularReflectance(): number;

  IsSpecularReflectanceDefined(): boolean;

  SpecularExponent(): number;

  IsSpecularExponentDefined(): boolean;

  SpecularColour(): Quantity_Color;

  IsSpecularColourDefined(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_Styles: declare class STEPConstruct_Styles extends STEPConstruct_Tool

  constructor

  Init(WS: XSControl_WorkSession): boolean;

  NbStyles(): number;

  Style(i: number): StepVisual_StyledItem;

  NbRootStyles(): number;

  RootStyle(i: number): StepVisual_StyledItem;

  ClearStyles(): void;

  AddStyle(style: StepVisual_StyledItem): void;
  AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(style: StepVisual_StyledItem): void;
  AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(style: StepVisual_StyledItem): void;
  AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;

  CreateMDGPR(Context: StepRepr_RepresentationContext): { returnValue: boolean; MDGPR: StepVisual_MechanicalDesignGeometricPresentationRepresentation; theStepModel: StepData_StepModel; [Symbol.dispose](): void };

  CreateNAUOSRD(Context: StepRepr_RepresentationContext, CDSR: StepShape_ContextDependentShapeRepresentation, initPDS: StepRepr_ProductDefinitionShape): boolean;

  FindContext(Shape: TopoDS_Shape): StepRepr_RepresentationContext;

  LoadStyles(): boolean;

  LoadInvisStyles(): { returnValue: boolean; InvSyles: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  MakeColorPSA(item: StepRepr_RepresentationItem, SurfCol: StepVisual_Colour, CurveCol: StepVisual_Colour, theRenderingProps: STEPConstruct_RenderingProperties, isForNAUO?: boolean): StepVisual_PresentationStyleAssignment;

  GetColorPSA(item: StepRepr_RepresentationItem, Col: StepVisual_Colour): StepVisual_PresentationStyleAssignment;

  GetColors(theStyle: StepVisual_StyledItem, theRenderingProps: STEPConstruct_RenderingProperties, theIsComponent?: boolean): { returnValue: boolean; theSurfaceColour: StepVisual_Colour; theBoundaryColour: StepVisual_Colour; theCurveColour: StepVisual_Colour; theIsComponent: boolean; [Symbol.dispose](): void };

  static EncodeColor(Col: Quantity_Color): StepVisual_Colour;
  static EncodeColor(Col: Quantity_Color, DPDCs: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient, ColRGBs: NCollection_DataMap_gp_Pnt_handle_Standard_Transient): StepVisual_Colour;
  static EncodeColor(Col: Quantity_Color): StepVisual_Colour;
  static EncodeColor(Col: Quantity_Color, DPDCs: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient, ColRGBs: NCollection_DataMap_gp_Pnt_handle_Standard_Transient): StepVisual_Colour;

  static DecodeColor(Colour: StepVisual_Colour, Col: Quantity_Color): boolean;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_Tool: declare class STEPConstruct_Tool

  constructor

  WS(): XSControl_WorkSession;

  Model(): Interface_InterfaceModel;

  TransientProcess(): Transfer_TransientProcess;

  FinderProcess(): Transfer_FinderProcess;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_UnitContext: declare class STEPConstruct_UnitContext

  constructor

  Init(Tol3d: number, theModel: StepData_StepModel, theLocalFactors?: StepData_Factors): void;

  IsDone(): boolean;

  Value(): StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx;

  ComputeFactors(aContext: StepRepr_GlobalUnitAssignedContext, theLocalFactors: StepData_Factors): number;
  ComputeFactors(aUnit: StepBasic_NamedUnit, theLocalFactors: StepData_Factors): number;
  ComputeFactors(aContext: StepRepr_GlobalUnitAssignedContext, theLocalFactors: StepData_Factors): number;
  ComputeFactors(aUnit: StepBasic_NamedUnit, theLocalFactors: StepData_Factors): number;

  ComputeTolerance(aContext: StepRepr_GlobalUncertaintyAssignedContext): number;

  LengthFactor(): number;

  PlaneAngleFactor(): number;

  SolidAngleFactor(): number;

  Uncertainty(): number;

  AreaFactor(): number;

  VolumeFactor(): number;

  HasUncertainty(): boolean;

  LengthDone(): boolean;

  PlaneAngleDone(): boolean;

  SolidAngleDone(): boolean;

  AreaDone(): boolean;

  VolumeDone(): boolean;

  StatusMessage(status: number): string;

  static ConvertSiPrefix(aPrefix: StepBasic_SiPrefix): number;

  delete(): void;

  [Symbol.dispose](): void;

STEPConstruct_ValidationProps: declare class STEPConstruct_ValidationProps extends STEPConstruct_Tool

  constructor

  Init(WS: XSControl_WorkSession): boolean;

  AddProp(Shape: TopoDS_Shape, Prop: StepRepr_RepresentationItem, Descr: string, instance: boolean): boolean;
  AddProp(target: StepRepr_CharacterizedDefinition, Context: StepRepr_RepresentationContext, Prop: StepRepr_RepresentationItem, Descr: string): boolean;
  AddProp(Shape: TopoDS_Shape, Prop: StepRepr_RepresentationItem, Descr: string, instance: boolean): boolean;
  AddProp(target: StepRepr_CharacterizedDefinition, Context: StepRepr_RepresentationContext, Prop: StepRepr_RepresentationItem, Descr: string): boolean;

  AddArea(Shape: TopoDS_Shape, Area: number): boolean;

  AddVolume(Shape: TopoDS_Shape, Vol: number): boolean;

  AddCentroid(Shape: TopoDS_Shape, Pnt: gp_Pnt, instance?: boolean): boolean;

  FindTarget(S: TopoDS_Shape, target: StepRepr_CharacterizedDefinition, instance: boolean): { returnValue: boolean; Context: StepRepr_RepresentationContext; [Symbol.dispose](): void };

  LoadProps(seq: NCollection_Sequence_handle_Standard_Transient): boolean;

  GetPropNAUO(PD: StepRepr_PropertyDefinition): StepRepr_NextAssemblyUsageOccurrence;

  GetPropPD(PD: StepRepr_PropertyDefinition): StepBasic_ProductDefinition;

  GetPropShape(ProdDef: StepBasic_ProductDefinition): TopoDS_Shape;
  GetPropShape(PD: StepRepr_PropertyDefinition): TopoDS_Shape;
  GetPropShape(ProdDef: StepBasic_ProductDefinition): TopoDS_Shape;
  GetPropShape(PD: StepRepr_PropertyDefinition): TopoDS_Shape;

  GetPropReal(item: StepRepr_RepresentationItem, Val: number, isArea: boolean, theLocalFactors: StepData_Factors): { returnValue: boolean; Val: number; isArea: boolean };

  GetPropPnt(item: StepRepr_RepresentationItem, Context: StepRepr_RepresentationContext, Pnt: gp_Pnt, theLocalFactors: StepData_Factors): boolean;

  SetAssemblyShape(shape: TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;
