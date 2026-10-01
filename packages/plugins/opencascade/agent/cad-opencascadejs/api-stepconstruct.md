# libcascade — STEPConstruct

11 top-level symbols. Signatures are verbatim typescript.

STEPConstruct: declare class STEPConstruct

  // STEPConstruct.constructor (constructor)
  constructor();

  // STEPConstruct.FindEntity (method)
  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape): StepRepr_RepresentationItem;
  static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape, Loc: TopLoc_Location): StepRepr_RepresentationItem;

  // STEPConstruct.FindShape (method)
  static FindShape(TransientProcess: Transfer_TransientProcess, item: StepRepr_RepresentationItem): TopoDS_Shape;

  // STEPConstruct.FindCDSR (method)
  static FindCDSR(ComponentBinder: Transfer_Binder, AssemblySDR: StepShape_ShapeDefinitionRepresentation): { returnValue: boolean; ComponentCDSR: StepShape_ContextDependentShapeRepresentation; [Symbol.dispose](): void };

  // STEPConstruct.delete (method)
  delete(): void;

  // STEPConstruct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_AP203Context: declare class STEPConstruct_AP203Context

  // STEPConstruct_AP203Context.constructor (constructor)
  constructor();

  // STEPConstruct_AP203Context.DefaultApproval (method)
  DefaultApproval(): StepBasic_Approval;

  // STEPConstruct_AP203Context.SetDefaultApproval (method)
  SetDefaultApproval(app: StepBasic_Approval): void;

  // STEPConstruct_AP203Context.DefaultDateAndTime (method)
  DefaultDateAndTime(): StepBasic_DateAndTime;

  // STEPConstruct_AP203Context.SetDefaultDateAndTime (method)
  SetDefaultDateAndTime(dt: StepBasic_DateAndTime): void;

  // STEPConstruct_AP203Context.DefaultPersonAndOrganization (method)
  DefaultPersonAndOrganization(): StepBasic_PersonAndOrganization;

  // STEPConstruct_AP203Context.SetDefaultPersonAndOrganization (method)
  SetDefaultPersonAndOrganization(po: StepBasic_PersonAndOrganization): void;

  // STEPConstruct_AP203Context.DefaultSecurityClassificationLevel (method)
  DefaultSecurityClassificationLevel(): StepBasic_SecurityClassificationLevel;

  // STEPConstruct_AP203Context.SetDefaultSecurityClassificationLevel (method)
  SetDefaultSecurityClassificationLevel(sc: StepBasic_SecurityClassificationLevel): void;

  // STEPConstruct_AP203Context.RoleCreator (method)
  RoleCreator(): StepBasic_PersonAndOrganizationRole;

  // STEPConstruct_AP203Context.RoleDesignOwner (method)
  RoleDesignOwner(): StepBasic_PersonAndOrganizationRole;

  // STEPConstruct_AP203Context.RoleDesignSupplier (method)
  RoleDesignSupplier(): StepBasic_PersonAndOrganizationRole;

  // STEPConstruct_AP203Context.RoleClassificationOfficer (method)
  RoleClassificationOfficer(): StepBasic_PersonAndOrganizationRole;

  // STEPConstruct_AP203Context.RoleCreationDate (method)
  RoleCreationDate(): StepBasic_DateTimeRole;

  // STEPConstruct_AP203Context.RoleClassificationDate (method)
  RoleClassificationDate(): StepBasic_DateTimeRole;

  // STEPConstruct_AP203Context.RoleApprover (method)
  RoleApprover(): StepBasic_ApprovalRole;

  // STEPConstruct_AP203Context.Init (method)
  Init(sdr: StepShape_ShapeDefinitionRepresentation): void;
  Init(SDRTool: STEPConstruct_Part): void;
  Init(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

  // STEPConstruct_AP203Context.GetCreator (method)
  GetCreator(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  // STEPConstruct_AP203Context.GetDesignOwner (method)
  GetDesignOwner(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  // STEPConstruct_AP203Context.GetDesignSupplier (method)
  GetDesignSupplier(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  // STEPConstruct_AP203Context.GetClassificationOfficer (method)
  GetClassificationOfficer(): StepAP203_CcDesignPersonAndOrganizationAssignment;

  // STEPConstruct_AP203Context.GetSecurity (method)
  GetSecurity(): StepAP203_CcDesignSecurityClassification;

  // STEPConstruct_AP203Context.GetCreationDate (method)
  GetCreationDate(): StepAP203_CcDesignDateAndTimeAssignment;

  // STEPConstruct_AP203Context.GetClassificationDate (method)
  GetClassificationDate(): StepAP203_CcDesignDateAndTimeAssignment;

  // STEPConstruct_AP203Context.GetApproval (method)
  GetApproval(): StepAP203_CcDesignApproval;

  // STEPConstruct_AP203Context.GetApprover (method)
  GetApprover(): StepBasic_ApprovalPersonOrganization;

  // STEPConstruct_AP203Context.GetApprovalDateTime (method)
  GetApprovalDateTime(): StepBasic_ApprovalDateTime;

  // STEPConstruct_AP203Context.GetProductCategoryRelationship (method)
  GetProductCategoryRelationship(): StepBasic_ProductCategoryRelationship;

  // STEPConstruct_AP203Context.Clear (method)
  Clear(): void;

  // STEPConstruct_AP203Context.InitRoles (method)
  InitRoles(): void;

  // STEPConstruct_AP203Context.InitAssembly (method)
  InitAssembly(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

  // STEPConstruct_AP203Context.InitSecurityRequisites (method)
  InitSecurityRequisites(): void;

  // STEPConstruct_AP203Context.InitApprovalRequisites (method)
  InitApprovalRequisites(): void;

  // STEPConstruct_AP203Context.delete (method)
  delete(): void;

  // STEPConstruct_AP203Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_Assembly: declare class STEPConstruct_Assembly

  // STEPConstruct_Assembly.constructor (constructor)
  constructor();

  // STEPConstruct_Assembly.Init (method)
  Init(aSR: StepShape_ShapeDefinitionRepresentation, SDR0: StepShape_ShapeDefinitionRepresentation, Ax0: StepGeom_Axis2Placement3d, Loc: StepGeom_Axis2Placement3d): void;
  Init(theSR: StepShape_ShapeDefinitionRepresentation, theSDR0: StepShape_ShapeDefinitionRepresentation, theTrsfOp: StepGeom_CartesianTransformationOperator3d): void;

  // STEPConstruct_Assembly.MakeRelationship (method)
  MakeRelationship(): void;

  // STEPConstruct_Assembly.ItemValue (method)
  ItemValue(): Standard_Transient;

  // STEPConstruct_Assembly.ItemLocation (method)
  ItemLocation(): StepGeom_Axis2Placement3d;

  // STEPConstruct_Assembly.GetNAUO (method)
  GetNAUO(): StepRepr_NextAssemblyUsageOccurrence;

  // STEPConstruct_Assembly.delete (method)
  delete(): void;

  // STEPConstruct_Assembly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_ContextTool: declare class STEPConstruct_ContextTool

  // STEPConstruct_ContextTool.constructor (constructor)
  constructor();
  constructor(aStepModel: StepData_StepModel);

  // STEPConstruct_ContextTool.SetModel (method)
  SetModel(aStepModel: StepData_StepModel): void;

  // STEPConstruct_ContextTool.SetGlobalFactor (method)
  SetGlobalFactor(theGlobalFactor: StepData_Factors): void;

  // STEPConstruct_ContextTool.GetAPD (method)
  GetAPD(): StepBasic_ApplicationProtocolDefinition;

  // STEPConstruct_ContextTool.AddAPD (method)
  AddAPD(enforce?: boolean): void;

  // STEPConstruct_ContextTool.IsAP203 (method)
  IsAP203(): boolean;

  // STEPConstruct_ContextTool.IsAP214 (method)
  IsAP214(): boolean;

  // STEPConstruct_ContextTool.IsAP242 (method)
  IsAP242(): boolean;

  // STEPConstruct_ContextTool.GetACstatus (method)
  GetACstatus(): TCollection_HAsciiString;

  // STEPConstruct_ContextTool.GetACschemaName (method)
  GetACschemaName(): TCollection_HAsciiString;

  // STEPConstruct_ContextTool.GetACyear (method)
  GetACyear(): number;

  // STEPConstruct_ContextTool.GetACname (method)
  GetACname(): TCollection_HAsciiString;

  // STEPConstruct_ContextTool.SetACstatus (method)
  SetACstatus(status: TCollection_HAsciiString): void;

  // STEPConstruct_ContextTool.SetACschemaName (method)
  SetACschemaName(schemaName: TCollection_HAsciiString): void;

  // STEPConstruct_ContextTool.SetACyear (method)
  SetACyear(year: number): void;

  // STEPConstruct_ContextTool.SetACname (method)
  SetACname(name: TCollection_HAsciiString): void;

  // STEPConstruct_ContextTool.GetDefaultAxis (method)
  GetDefaultAxis(): StepGeom_Axis2Placement3d;

  // STEPConstruct_ContextTool.AP203Context (method)
  AP203Context(): STEPConstruct_AP203Context;

  // STEPConstruct_ContextTool.Level (method)
  Level(): number;

  // STEPConstruct_ContextTool.NextLevel (method)
  NextLevel(): void;

  // STEPConstruct_ContextTool.PrevLevel (method)
  PrevLevel(): void;

  // STEPConstruct_ContextTool.SetLevel (method)
  SetLevel(lev: number): void;

  // STEPConstruct_ContextTool.Index (method)
  Index(): number;

  // STEPConstruct_ContextTool.NextIndex (method)
  NextIndex(): void;

  // STEPConstruct_ContextTool.PrevIndex (method)
  PrevIndex(): void;

  // STEPConstruct_ContextTool.SetIndex (method)
  SetIndex(ind: number): void;

  // STEPConstruct_ContextTool.GetProductName (method)
  GetProductName(): TCollection_HAsciiString;

  // STEPConstruct_ContextTool.GetRootsForPart (method)
  GetRootsForPart(SDRTool: STEPConstruct_Part): NCollection_HSequence_handle_Standard_Transient;

  // STEPConstruct_ContextTool.GetRootsForAssemblyLink (method)
  GetRootsForAssemblyLink(assembly: STEPConstruct_Assembly): NCollection_HSequence_handle_Standard_Transient;

  // STEPConstruct_ContextTool.delete (method)
  delete(): void;

  // STEPConstruct_ContextTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_ExternRefs: declare class STEPConstruct_ExternRefs extends STEPConstruct_Tool

  // STEPConstruct_ExternRefs.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession);

  // STEPConstruct_ExternRefs.Init (method)
  Init(WS: XSControl_WorkSession): boolean;

  // STEPConstruct_ExternRefs.Clear (method)
  Clear(): void;

  // STEPConstruct_ExternRefs.LoadExternRefs (method)
  LoadExternRefs(): boolean;

  // STEPConstruct_ExternRefs.NbExternRefs (method)
  NbExternRefs(): number;

  // STEPConstruct_ExternRefs.FileName (method)
  FileName(num: number): string;

  // STEPConstruct_ExternRefs.ProdDef (method)
  ProdDef(num: number): StepBasic_ProductDefinition;

  // STEPConstruct_ExternRefs.DocFile (method)
  DocFile(num: number): StepBasic_DocumentFile;

  // STEPConstruct_ExternRefs.Format (method)
  Format(num: number): TCollection_HAsciiString;

  // STEPConstruct_ExternRefs.AddExternRef (method)
  AddExternRef(filename: string, PD: StepBasic_ProductDefinition, format: string): number;

  // STEPConstruct_ExternRefs.checkAP214Shared (method)
  checkAP214Shared(): void;

  // STEPConstruct_ExternRefs.WriteExternRefs (method)
  WriteExternRefs(num: number): number;

  // STEPConstruct_ExternRefs.SetAP214APD (method)
  SetAP214APD(APD: StepBasic_ApplicationProtocolDefinition): void;

  // STEPConstruct_ExternRefs.GetAP214APD (method)
  GetAP214APD(): StepBasic_ApplicationProtocolDefinition;

  // STEPConstruct_ExternRefs.delete (method)
  delete(): void;

  // STEPConstruct_ExternRefs.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_Part: declare class STEPConstruct_Part

  // STEPConstruct_Part.constructor (constructor)
  constructor();

  // STEPConstruct_Part.MakeSDR (method)
  MakeSDR(aShape: StepShape_ShapeRepresentation, aName: TCollection_HAsciiString, AC: StepBasic_ApplicationContext, theStepModel: StepData_StepModel): void;

  // STEPConstruct_Part.ReadSDR (method)
  ReadSDR(aShape: StepShape_ShapeDefinitionRepresentation): void;

  // STEPConstruct_Part.IsDone (method)
  IsDone(): boolean;

  // STEPConstruct_Part.SDRValue (method)
  SDRValue(): StepShape_ShapeDefinitionRepresentation;

  // STEPConstruct_Part.SRValue (method)
  SRValue(): StepShape_ShapeRepresentation;

  // STEPConstruct_Part.PC (method)
  PC(): StepBasic_ProductContext;

  // STEPConstruct_Part.PCname (method)
  PCname(): TCollection_HAsciiString;

  // STEPConstruct_Part.PCdisciplineType (method)
  PCdisciplineType(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPCname (method)
  SetPCname(name: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPCdisciplineType (method)
  SetPCdisciplineType(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.AC (method)
  AC(): StepBasic_ApplicationContext;

  // STEPConstruct_Part.ACapplication (method)
  ACapplication(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetACapplication (method)
  SetACapplication(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.PDC (method)
  PDC(): StepBasic_ProductDefinitionContext;

  // STEPConstruct_Part.PDCname (method)
  PDCname(): TCollection_HAsciiString;

  // STEPConstruct_Part.PDCstage (method)
  PDCstage(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPDCname (method)
  SetPDCname(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPDCstage (method)
  SetPDCstage(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.Product (method)
  Product(): StepBasic_Product;

  // STEPConstruct_Part.Pid (method)
  Pid(): TCollection_HAsciiString;

  // STEPConstruct_Part.Pname (method)
  Pname(): TCollection_HAsciiString;

  // STEPConstruct_Part.Pdescription (method)
  Pdescription(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPid (method)
  SetPid(id: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPname (method)
  SetPname(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPdescription (method)
  SetPdescription(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.PDF (method)
  PDF(): StepBasic_ProductDefinitionFormation;

  // STEPConstruct_Part.PDFid (method)
  PDFid(): TCollection_HAsciiString;

  // STEPConstruct_Part.PDFdescription (method)
  PDFdescription(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPDFid (method)
  SetPDFid(id: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPDFdescription (method)
  SetPDFdescription(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.PD (method)
  PD(): StepBasic_ProductDefinition;

  // STEPConstruct_Part.PDdescription (method)
  PDdescription(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPDdescription (method)
  SetPDdescription(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.PDS (method)
  PDS(): StepRepr_ProductDefinitionShape;

  // STEPConstruct_Part.PDSname (method)
  PDSname(): TCollection_HAsciiString;

  // STEPConstruct_Part.PDSdescription (method)
  PDSdescription(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPDSname (method)
  SetPDSname(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPDSdescription (method)
  SetPDSdescription(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.PRPC (method)
  PRPC(): StepBasic_ProductRelatedProductCategory;

  // STEPConstruct_Part.PRPCname (method)
  PRPCname(): TCollection_HAsciiString;

  // STEPConstruct_Part.PRPCdescription (method)
  PRPCdescription(): TCollection_HAsciiString;

  // STEPConstruct_Part.SetPRPCname (method)
  SetPRPCname(label: TCollection_HAsciiString): void;

  // STEPConstruct_Part.SetPRPCdescription (method)
  SetPRPCdescription(text: TCollection_HAsciiString): void;

  // STEPConstruct_Part.delete (method)
  delete(): void;

  // STEPConstruct_Part.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_RenderingProperties: declare class STEPConstruct_RenderingProperties

  // STEPConstruct_RenderingProperties.constructor (constructor)
  constructor();
  constructor(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties);
  constructor(theRGBAColor: Quantity_ColorRGBA);
  constructor(theMaterial: XCAFDoc_VisMaterialCommon);
  constructor(theMaterial: XCAFDoc_VisMaterial);
  constructor(theColor: StepVisual_Colour, theTransparency: number);
  constructor(theSurfaceColor: Quantity_Color, theTransparency?: number);

  // STEPConstruct_RenderingProperties.Init (method)
  Init(theRenderingProperties: StepVisual_SurfaceStyleRenderingWithProperties): void;
  Init(theRGBAColor: Quantity_ColorRGBA): void;
  Init(theMaterial: XCAFDoc_VisMaterialCommon): void;
  Init(theMaterial: XCAFDoc_VisMaterial): void;
  Init(theColor: StepVisual_Colour, theTransparency: number): void;
  Init(theSurfaceColor: Quantity_Color, theTransparency: number): void;

  // STEPConstruct_RenderingProperties.SetAmbientReflectance (method)
  SetAmbientReflectance(theAmbientReflectance: number): void;

  // STEPConstruct_RenderingProperties.SetAmbientAndDiffuseReflectance (method)
  SetAmbientAndDiffuseReflectance(theAmbientReflectance: number, theDiffuseReflectance: number): void;

  // STEPConstruct_RenderingProperties.SetAmbientDiffuseAndSpecularReflectance (method)
  SetAmbientDiffuseAndSpecularReflectance(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: Quantity_Color): void;

  // STEPConstruct_RenderingProperties.CreateRenderingProperties (method)
  CreateRenderingProperties(): StepVisual_SurfaceStyleRenderingWithProperties;
  CreateRenderingProperties(theRenderColour: StepVisual_Colour): StepVisual_SurfaceStyleRenderingWithProperties;

  // STEPConstruct_RenderingProperties.CreateXCAFMaterial (method)
  CreateXCAFMaterial(): XCAFDoc_VisMaterialCommon;

  // STEPConstruct_RenderingProperties.GetRGBAColor (method)
  GetRGBAColor(): Quantity_ColorRGBA;

  // STEPConstruct_RenderingProperties.SurfaceColor (method)
  SurfaceColor(): Quantity_Color;

  // STEPConstruct_RenderingProperties.Transparency (method)
  Transparency(): number;

  // STEPConstruct_RenderingProperties.RenderingMethod (method)
  RenderingMethod(): StepVisual_ShadingSurfaceMethod;

  // STEPConstruct_RenderingProperties.SetRenderingMethod (method)
  SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;

  // STEPConstruct_RenderingProperties.IsDefined (method)
  IsDefined(): boolean;

  // STEPConstruct_RenderingProperties.IsMaterialConvertible (method)
  IsMaterialConvertible(): boolean;

  // STEPConstruct_RenderingProperties.AmbientReflectance (method)
  AmbientReflectance(): number;

  // STEPConstruct_RenderingProperties.IsAmbientReflectanceDefined (method)
  IsAmbientReflectanceDefined(): boolean;

  // STEPConstruct_RenderingProperties.DiffuseReflectance (method)
  DiffuseReflectance(): number;

  // STEPConstruct_RenderingProperties.IsDiffuseReflectanceDefined (method)
  IsDiffuseReflectanceDefined(): boolean;

  // STEPConstruct_RenderingProperties.SpecularReflectance (method)
  SpecularReflectance(): number;

  // STEPConstruct_RenderingProperties.IsSpecularReflectanceDefined (method)
  IsSpecularReflectanceDefined(): boolean;

  // STEPConstruct_RenderingProperties.SpecularExponent (method)
  SpecularExponent(): number;

  // STEPConstruct_RenderingProperties.IsSpecularExponentDefined (method)
  IsSpecularExponentDefined(): boolean;

  // STEPConstruct_RenderingProperties.SpecularColour (method)
  SpecularColour(): Quantity_Color;

  // STEPConstruct_RenderingProperties.IsSpecularColourDefined (method)
  IsSpecularColourDefined(): boolean;

  // STEPConstruct_RenderingProperties.delete (method)
  delete(): void;

  // STEPConstruct_RenderingProperties.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_Styles: declare class STEPConstruct_Styles extends STEPConstruct_Tool

  // STEPConstruct_Styles.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession);

  // STEPConstruct_Styles.Init (method)
  Init(WS: XSControl_WorkSession): boolean;

  // STEPConstruct_Styles.NbStyles (method)
  NbStyles(): number;

  // STEPConstruct_Styles.Style (method)
  Style(i: number): StepVisual_StyledItem;

  // STEPConstruct_Styles.NbRootStyles (method)
  NbRootStyles(): number;

  // STEPConstruct_Styles.RootStyle (method)
  RootStyle(i: number): StepVisual_StyledItem;

  // STEPConstruct_Styles.ClearStyles (method)
  ClearStyles(): void;

  // STEPConstruct_Styles.AddStyle (method)
  AddStyle(style: StepVisual_StyledItem): void;
  AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
  AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;

  // STEPConstruct_Styles.CreateMDGPR (method)
  CreateMDGPR(Context: StepRepr_RepresentationContext): { returnValue: boolean; MDGPR: StepVisual_MechanicalDesignGeometricPresentationRepresentation; theStepModel: StepData_StepModel; [Symbol.dispose](): void };

  // STEPConstruct_Styles.CreateNAUOSRD (method)
  CreateNAUOSRD(Context: StepRepr_RepresentationContext, CDSR: StepShape_ContextDependentShapeRepresentation, initPDS: StepRepr_ProductDefinitionShape): boolean;

  // STEPConstruct_Styles.FindContext (method)
  FindContext(Shape: TopoDS_Shape): StepRepr_RepresentationContext;

  // STEPConstruct_Styles.LoadStyles (method)
  LoadStyles(): boolean;

  // STEPConstruct_Styles.LoadInvisStyles (method)
  LoadInvisStyles(): { returnValue: boolean; InvSyles: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

  // STEPConstruct_Styles.MakeColorPSA (method)
  MakeColorPSA(item: StepRepr_RepresentationItem, SurfCol: StepVisual_Colour, CurveCol: StepVisual_Colour, theRenderingProps: STEPConstruct_RenderingProperties, isForNAUO?: boolean): StepVisual_PresentationStyleAssignment;

  // STEPConstruct_Styles.GetColorPSA (method)
  GetColorPSA(item: StepRepr_RepresentationItem, Col: StepVisual_Colour): StepVisual_PresentationStyleAssignment;

  // STEPConstruct_Styles.GetColors (method)
  GetColors(theStyle: StepVisual_StyledItem, theRenderingProps: STEPConstruct_RenderingProperties, theIsComponent?: boolean): { returnValue: boolean; theSurfaceColour: StepVisual_Colour; theBoundaryColour: StepVisual_Colour; theCurveColour: StepVisual_Colour; theIsComponent: boolean; [Symbol.dispose](): void };

  // STEPConstruct_Styles.EncodeColor (method)
  static EncodeColor(Col: Quantity_Color): StepVisual_Colour;
  static EncodeColor(Col: Quantity_Color, DPDCs: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient, ColRGBs: NCollection_DataMap_gp_Pnt_handle_Standard_Transient): StepVisual_Colour;

  // STEPConstruct_Styles.DecodeColor (method)
  static DecodeColor(Colour: StepVisual_Colour, Col: Quantity_Color): boolean;

  // STEPConstruct_Styles.delete (method)
  delete(): void;

  // STEPConstruct_Styles.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_Tool: declare class STEPConstruct_Tool

  // STEPConstruct_Tool.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession);

  // STEPConstruct_Tool.WS (method)
  WS(): XSControl_WorkSession;

  // STEPConstruct_Tool.Model (method)
  Model(): Interface_InterfaceModel;

  // STEPConstruct_Tool.TransientProcess (method)
  TransientProcess(): Transfer_TransientProcess;

  // STEPConstruct_Tool.FinderProcess (method)
  FinderProcess(): Transfer_FinderProcess;

  // STEPConstruct_Tool.delete (method)
  delete(): void;

  // STEPConstruct_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_UnitContext: declare class STEPConstruct_UnitContext

  // STEPConstruct_UnitContext.constructor (constructor)
  constructor();

  // STEPConstruct_UnitContext.Init (method)
  Init(Tol3d: number, theModel: StepData_StepModel, theLocalFactors?: StepData_Factors): void;

  // STEPConstruct_UnitContext.IsDone (method)
  IsDone(): boolean;

  // STEPConstruct_UnitContext.Value (method)
  Value(): StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx;

  // STEPConstruct_UnitContext.ComputeFactors (method)
  ComputeFactors(aContext: StepRepr_GlobalUnitAssignedContext, theLocalFactors: StepData_Factors): number;
  ComputeFactors(aUnit: StepBasic_NamedUnit, theLocalFactors: StepData_Factors): number;

  // STEPConstruct_UnitContext.ComputeTolerance (method)
  ComputeTolerance(aContext: StepRepr_GlobalUncertaintyAssignedContext): number;

  // STEPConstruct_UnitContext.LengthFactor (method)
  LengthFactor(): number;

  // STEPConstruct_UnitContext.PlaneAngleFactor (method)
  PlaneAngleFactor(): number;

  // STEPConstruct_UnitContext.SolidAngleFactor (method)
  SolidAngleFactor(): number;

  // STEPConstruct_UnitContext.Uncertainty (method)
  Uncertainty(): number;

  // STEPConstruct_UnitContext.AreaFactor (method)
  AreaFactor(): number;

  // STEPConstruct_UnitContext.VolumeFactor (method)
  VolumeFactor(): number;

  // STEPConstruct_UnitContext.HasUncertainty (method)
  HasUncertainty(): boolean;

  // STEPConstruct_UnitContext.LengthDone (method)
  LengthDone(): boolean;

  // STEPConstruct_UnitContext.PlaneAngleDone (method)
  PlaneAngleDone(): boolean;

  // STEPConstruct_UnitContext.SolidAngleDone (method)
  SolidAngleDone(): boolean;

  // STEPConstruct_UnitContext.AreaDone (method)
  AreaDone(): boolean;

  // STEPConstruct_UnitContext.VolumeDone (method)
  VolumeDone(): boolean;

  // STEPConstruct_UnitContext.StatusMessage (method)
  StatusMessage(status: number): string;

  // STEPConstruct_UnitContext.ConvertSiPrefix (method)
  static ConvertSiPrefix(aPrefix: StepBasic_SiPrefix): number;

  // STEPConstruct_UnitContext.delete (method)
  delete(): void;

  // STEPConstruct_UnitContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPConstruct_ValidationProps: declare class STEPConstruct_ValidationProps extends STEPConstruct_Tool

  // STEPConstruct_ValidationProps.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession);

  // STEPConstruct_ValidationProps.Init (method)
  Init(WS: XSControl_WorkSession): boolean;

  // STEPConstruct_ValidationProps.AddProp (method)
  AddProp(Shape: TopoDS_Shape, Prop: StepRepr_RepresentationItem, Descr: string, instance: boolean): boolean;
  AddProp(target: StepRepr_CharacterizedDefinition, Context: StepRepr_RepresentationContext, Prop: StepRepr_RepresentationItem, Descr: string): boolean;

  // STEPConstruct_ValidationProps.AddArea (method)
  AddArea(Shape: TopoDS_Shape, Area: number): boolean;

  // STEPConstruct_ValidationProps.AddVolume (method)
  AddVolume(Shape: TopoDS_Shape, Vol: number): boolean;

  // STEPConstruct_ValidationProps.AddCentroid (method)
  AddCentroid(Shape: TopoDS_Shape, Pnt: gp_Pnt, instance?: boolean): boolean;

  // STEPConstruct_ValidationProps.FindTarget (method)
  FindTarget(S: TopoDS_Shape, target: StepRepr_CharacterizedDefinition, instance: boolean): { returnValue: boolean; Context: StepRepr_RepresentationContext; [Symbol.dispose](): void };

  // STEPConstruct_ValidationProps.LoadProps (method)
  LoadProps(seq: NCollection_Sequence_handle_Standard_Transient): boolean;

  // STEPConstruct_ValidationProps.GetPropNAUO (method)
  GetPropNAUO(PD: StepRepr_PropertyDefinition): StepRepr_NextAssemblyUsageOccurrence;

  // STEPConstruct_ValidationProps.GetPropPD (method)
  GetPropPD(PD: StepRepr_PropertyDefinition): StepBasic_ProductDefinition;

  // STEPConstruct_ValidationProps.GetPropShape (method)
  GetPropShape(ProdDef: StepBasic_ProductDefinition): TopoDS_Shape;
  GetPropShape(PD: StepRepr_PropertyDefinition): TopoDS_Shape;

  // STEPConstruct_ValidationProps.GetPropReal (method)
  GetPropReal(item: StepRepr_RepresentationItem, Val: number, isArea: boolean, theLocalFactors: StepData_Factors): { returnValue: boolean; Val: number; isArea: boolean };

  // STEPConstruct_ValidationProps.GetPropPnt (method)
  GetPropPnt(item: StepRepr_RepresentationItem, Context: StepRepr_RepresentationContext, Pnt: gp_Pnt, theLocalFactors: StepData_Factors): boolean;

  // STEPConstruct_ValidationProps.SetAssemblyShape (method)
  SetAssemblyShape(shape: TopoDS_Shape): void;

  // STEPConstruct_ValidationProps.delete (method)
  delete(): void;

  // STEPConstruct_ValidationProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
