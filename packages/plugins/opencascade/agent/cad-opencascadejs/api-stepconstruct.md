# libcascade — STEPConstruct

8 top-level symbols. Signatures are verbatim typescript.

// Defines tools for creation and investigation STEP constructs used for representing various kinds of data, such as product and assembly structure, unit contexts, associated information The creation of these structures is made according to currently active schema (AP203 or AP214 CD2 or DIS) This is taken from parameter write.step.schema
STEPConstruct: declare class STEPConstruct

constructor

// Returns STEP entity of the (sub)type of RepresentationItem which is a result of the translation of the Shape, or Null if no result is recorded
static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape): StepRepr_RepresentationItem;
static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape, Loc: TopLoc_Location): StepRepr_RepresentationItem;
static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape): StepRepr_RepresentationItem;
static FindEntity(FinderProcess: Transfer_FinderProcess, Shape: TopoDS_Shape, Loc: TopLoc_Location): StepRepr_RepresentationItem;

// Returns Shape resulting from given STEP entity (Null if not mapped)
static FindShape(TransientProcess: Transfer_TransientProcess, item: StepRepr_RepresentationItem): TopoDS_Shape;

// Find CDSR corresponding to the component in the specified assembly
static FindCDSR(ComponentBinder: Transfer_Binder, AssemblySDR: StepShape_ShapeDefinitionRepresentation): { returnValue: boolean; ComponentCDSR: StepShape_ContextDependentShapeRepresentation; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Maintains context specific for AP203 (required data and management information such as persons, dates, approvals etc.) It contains static entities (which can be shared), default values for person and organisation, and also provides tool for creating management entities around specific part (SDR)
STEPConstruct_AP203Context: declare class STEPConstruct_AP203Context

constructor

// Returns default approval entity which is used when no other data are available
DefaultApproval(): StepBasic_Approval;

// Sets default approval
SetDefaultApproval(app: StepBasic_Approval): void;

// Returns default date_and_time entity which is used when no other data are available
DefaultDateAndTime(): StepBasic_DateAndTime;

// Sets default date_and_time entity
SetDefaultDateAndTime(dt: StepBasic_DateAndTime): void;

// Returns default person_and_organization entity which is used when no other data are available
DefaultPersonAndOrganization(): StepBasic_PersonAndOrganization;

// Sets default person_and_organization entity
SetDefaultPersonAndOrganization(po: StepBasic_PersonAndOrganization): void;

// Returns default security_classification_level entity which is used when no other data are available
DefaultSecurityClassificationLevel(): StepBasic_SecurityClassificationLevel;

// Sets default security_classification_level
SetDefaultSecurityClassificationLevel(sc: StepBasic_SecurityClassificationLevel): void;

RoleCreator(): StepBasic_PersonAndOrganizationRole;

RoleDesignOwner(): StepBasic_PersonAndOrganizationRole;

RoleDesignSupplier(): StepBasic_PersonAndOrganizationRole;

RoleClassificationOfficer(): StepBasic_PersonAndOrganizationRole;

RoleCreationDate(): StepBasic_DateTimeRole;

RoleClassificationDate(): StepBasic_DateTimeRole;

// Return predefined PersonAndOrganizationRole and DateTimeRole entities named 'creator', 'design owner', 'design supplier', 'classification officer', 'creation date', 'classification date', 'approver'
RoleApprover(): StepBasic_ApprovalRole;

// Takes SDR (part) which brings all standard data around part (common for AP203 and AP214) and creates all the additional entities required for AP203
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

// Return entities (roots) instantiated for the part by method Init
GetProductCategoryRelationship(): StepBasic_ProductCategoryRelationship;

// Clears all fields describing entities specific to each part
Clear(): void;

// Initializes constant fields (shared entities)
InitRoles(): void;

// Initializes all missing data which are required for assembly
InitAssembly(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

// Initializes ClassificationOfficer and ClassificationDate entities according to Security entity
InitSecurityRequisites(): void;

// Initializes Approver and ApprovalDateTime entities according to Approval entity
InitApprovalRequisites(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This operator creates and checks an item of an assembly, from its basic data
STEPConstruct_Assembly: declare class STEPConstruct_Assembly

constructor

// Initialises with starting values Ax0
Init(aSR: StepShape_ShapeDefinitionRepresentation, SDR0: StepShape_ShapeDefinitionRepresentation, Ax0: StepGeom_Axis2Placement3d, Loc: StepGeom_Axis2Placement3d): void;
Init(theSR: StepShape_ShapeDefinitionRepresentation, theSDR0: StepShape_ShapeDefinitionRepresentation, theTrsfOp: StepGeom_CartesianTransformationOperator3d): void;
Init(aSR: StepShape_ShapeDefinitionRepresentation, SDR0: StepShape_ShapeDefinitionRepresentation, Ax0: StepGeom_Axis2Placement3d, Loc: StepGeom_Axis2Placement3d): void;
Init(theSR: StepShape_ShapeDefinitionRepresentation, theSDR0: StepShape_ShapeDefinitionRepresentation, theTrsfOp: StepGeom_CartesianTransformationOperator3d): void;

// Make a (ShapeRepresentationRelationship,...WithTransformation) Resulting Value is returned by ItemValue
MakeRelationship(): void;

// Returns the Value If no Make..
ItemValue(): Standard_Transient;

// Returns the location of the item, computed from starting aLoc
ItemLocation(): StepGeom_Axis2Placement3d;

// Returns NAUO object describing the assembly link
GetNAUO(): StepRepr_NextAssemblyUsageOccurrence;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Maintains global context tool for writing
STEPConstruct_ContextTool: declare class STEPConstruct_ContextTool

constructor

// Initialize ApplicationProtocolDefinition by the first entity of that type found in the model
SetModel(aStepModel: StepData_StepModel): void;

SetGlobalFactor(theGlobalFactor: StepData_Factors): void;

GetAPD(): StepBasic_ApplicationProtocolDefinition;

AddAPD(enforce?: boolean): void;

// Returns True if APD.schema_name is config_control_design
IsAP203(): boolean;

// Returns True if APD.schema_name is automotive_design
IsAP214(): boolean;

// Returns True if APD.schema_name is ap242_managed_model_based_3d_engineering
IsAP242(): boolean;

GetACstatus(): TCollection_HAsciiString;

GetACschemaName(): TCollection_HAsciiString;

GetACyear(): number;

GetACname(): TCollection_HAsciiString;

SetACstatus(status: TCollection_HAsciiString): void;

SetACschemaName(schemaName: TCollection_HAsciiString): void;

SetACyear(year: number): void;

SetACname(name: TCollection_HAsciiString): void;

// Returns a default axis placement
GetDefaultAxis(): StepGeom_Axis2Placement3d;

// Returns tool which maintains context specific for AP203
AP203Context(): STEPConstruct_AP203Context;

// Returns current assembly level
Level(): number;

NextLevel(): void;

PrevLevel(): void;

// Changes current assembly level
SetLevel(lev: number): void;

// Returns current index of assembly component on current level
Index(): number;

NextIndex(): void;

PrevIndex(): void;

// Changes current index of assembly component on current level
SetIndex(ind: number): void;

// Generates a product name basing on write.step.product.name parameter and current position in the assembly structure
GetProductName(): TCollection_HAsciiString;

// Produces and returns a full list of root entities required for part identified by SDRTool (including SDR itself)
GetRootsForPart(SDRTool: STEPConstruct_Part): NCollection_HSequence_handle_Standard_Transient;

// Produces and returns a full list of root entities required for assembly link identified by assembly (including NAUO and CDSR)
GetRootsForAssemblyLink(assembly: STEPConstruct_Assembly): NCollection_HSequence_handle_Standard_Transient;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool for analyzing (reading) and creating (writing) references to external files in STEP
STEPConstruct_ExternRefs: declare class STEPConstruct_ExternRefs extends STEPConstruct_Tool

constructor

// Initializes tool
Init(WS: XSControl_WorkSession): boolean;

// Clears internal fields (list of defined extern refs)
Clear(): void;

// Searches current STEP model for external references and loads them to the internal data structures NOTE
LoadExternRefs(): boolean;

// Returns number of defined extern references
NbExternRefs(): number;

// Returns filename for numth extern reference Returns Null if FileName is not defined or bad
FileName(num: number): string;

// Returns ProductDefinition to which numth extern reference is associated
ProdDef(num: number): StepBasic_ProductDefinition;

// Returns DocumentFile to which numth extern reference is associated
DocFile(num: number): StepBasic_DocumentFile;

// Returns format identification string for the extern document Returns Null handle if format is not defined
Format(num: number): TCollection_HAsciiString;

// Create a new external reference with specified attributes attached to a given SDR <format> can be Null string, in that case this information is not written
AddExternRef(filename: string, PD: StepBasic_ProductDefinition, format: string): number;

// Check (create if it is null) all shared entities for the model
checkAP214Shared(): void;

// Adds all the currently defined external refs to the model Returns number of written extern refs
WriteExternRefs(num: number): number;

// Set the ApplicationProtocolDefinition of the PDM schema
SetAP214APD(APD: StepBasic_ApplicationProtocolDefinition): void;

// Returns the ApplicationProtocolDefinition of the PDM schema NOTE
GetAP214APD(): StepBasic_ApplicationProtocolDefinition;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides tools for creating STEP structures associated with part (SDR), such as PRODUCT, PDF etc., as required by current schema Also allows to investigate and modify this data
STEPConstruct_Part: declare class STEPConstruct_Part

constructor

MakeSDR(aShape: StepShape_ShapeRepresentation, aName: TCollection_HAsciiString, AC: StepBasic_ApplicationContext, theStepModel: StepData_StepModel): void;

ReadSDR(aShape: StepShape_ShapeDefinitionRepresentation): void;

IsDone(): boolean;

// Returns SDR or Null if not done
SDRValue(): StepShape_ShapeDefinitionRepresentation;

// Returns SDR->UsedRepresentation() or Null if not done
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for working with STEP rendering properties
STEPConstruct_RenderingProperties: declare class STEPConstruct_RenderingProperties

constructor

// Initializes from STEP rendering properties entity
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
// theRenderingProperties: rendering properties entity

// Sets ambient reflectance value
SetAmbientReflectance(theAmbientReflectance: number): void;
// theAmbientReflectance: ambient reflectance value

// Sets ambient and diffuse reflectance values
SetAmbientAndDiffuseReflectance(theAmbientReflectance: number, theDiffuseReflectance: number): void;
// theAmbientReflectance: ambient reflectance value
// theDiffuseReflectance: diffuse reflectance value

// Sets ambient, diffuse and specular reflectance values
SetAmbientDiffuseAndSpecularReflectance(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: Quantity_Color): void;
// theAmbientReflectance: ambient reflectance value
// theDiffuseReflectance: diffuse reflectance value
// theSpecularReflectance: specular reflectance value
// theSpecularExponent: specular exponent value
// theSpecularColour: specular color

// Creates and returns rendering properties entity
CreateRenderingProperties(): StepVisual_SurfaceStyleRenderingWithProperties;
CreateRenderingProperties(theRenderColour: StepVisual_Colour): StepVisual_SurfaceStyleRenderingWithProperties;
CreateRenderingProperties(): StepVisual_SurfaceStyleRenderingWithProperties;
CreateRenderingProperties(theRenderColour: StepVisual_Colour): StepVisual_SurfaceStyleRenderingWithProperties;

// Creates and returns XCAF material entity
CreateXCAFMaterial(): XCAFDoc_VisMaterialCommon;

// Creates the ColorRGBA object from the current color and transparency
GetRGBAColor(): Quantity_ColorRGBA;

// Returns surface color
SurfaceColor(): Quantity_Color;

// Returns transparency value
Transparency(): number;

// Returns rendering method
RenderingMethod(): StepVisual_ShadingSurfaceMethod;

// Sets rendering method
SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;
// theRenderingMethod: rendering method

// Returns whether the rendering properties are defined
IsDefined(): boolean;

// Returns whether material is convertible to STEP
IsMaterialConvertible(): boolean;

// Returns ambient reflectance value
AmbientReflectance(): number;

// Returns whether ambient reflectance is defined
IsAmbientReflectanceDefined(): boolean;

// Returns diffuse reflectance value
DiffuseReflectance(): number;

// Returns whether diffuse reflectance is defined
IsDiffuseReflectanceDefined(): boolean;

// Returns specular reflectance value
SpecularReflectance(): number;

// Returns whether specular reflectance is defined
IsSpecularReflectanceDefined(): boolean;

// Returns specular exponent value
SpecularExponent(): number;

// Returns whether specular exponent is defined
IsSpecularExponentDefined(): boolean;

// Returns specular color
SpecularColour(): Quantity_Color;

// Returns whether specular color is defined
IsSpecularColourDefined(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a mechanism for reading and writing shape styles (such as color) to and from the STEP file This tool maintains a list of styles, either taking them from STEP model (reading), or filling it by calls to AddStyle or directly (writing)
STEPConstruct_Styles: declare class STEPConstruct_Styles extends STEPConstruct_Tool

constructor

// Initializes tool
Init(WS: XSControl_WorkSession): boolean;

// Returns number of defined styles
NbStyles(): number;

// Returns style with given index
Style(i: number): StepVisual_StyledItem;

// Returns number of override styles
NbRootStyles(): number;

// Returns override style with given index
RootStyle(i: number): StepVisual_StyledItem;

// Clears all defined styles and PSA sequence
ClearStyles(): void;

// Adds a style to a sequence
AddStyle(style: StepVisual_StyledItem): void;
AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
AddStyle(style: StepVisual_StyledItem): void;
AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
AddStyle(style: StepVisual_StyledItem): void;
AddStyle(item: StepRepr_RepresentationItem, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;
AddStyle(Shape: TopoDS_Shape, PSA: StepVisual_PresentationStyleAssignment, Override: StepVisual_StyledItem): StepVisual_StyledItem;

// Create MDGPR, fill it with all the styles previously defined, and add it to the model
CreateMDGPR(Context: StepRepr_RepresentationContext): { returnValue: boolean; MDGPR: StepVisual_MechanicalDesignGeometricPresentationRepresentation; theStepModel: StepData_StepModel; [Symbol.dispose](): void };

// Create MDGPR, fill it with all the styles previously defined, and add it to the model IMPORTANT
CreateNAUOSRD(Context: StepRepr_RepresentationContext, CDSR: StepShape_ContextDependentShapeRepresentation, initPDS: StepRepr_ProductDefinitionShape): boolean;

// Searches the STEP model for the RepresentationContext in which given shape is defined
FindContext(Shape: TopoDS_Shape): StepRepr_RepresentationContext;

// Searches the STEP model for the MDGPR or DM entities (which bring styles) and fills sequence of styles
LoadStyles(): boolean;

// Searches the STEP model for the INISIBILITY entities (which bring styles) and fills out sequence of styles
LoadInvisStyles(): { returnValue: boolean; InvSyles: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

// Create a PresentationStyleAssignment entity which defines two colors (for filling surfaces and curves) if isForNAUO true then returns PresentationStyleByContext
MakeColorPSA(item: StepRepr_RepresentationItem, SurfCol: StepVisual_Colour, CurveCol: StepVisual_Colour, theRenderingProps: STEPConstruct_RenderingProperties, isForNAUO?: boolean): StepVisual_PresentationStyleAssignment;

// Returns a PresentationStyleAssignment entity which defines surface and curve colors as Col
GetColorPSA(item: StepRepr_RepresentationItem, Col: StepVisual_Colour): StepVisual_PresentationStyleAssignment;

// Extract color definitions from the style entity For each type of color supported, result can be either NULL if it is not defined by that style, or last definition (if they are 1 or more)
GetColors(theStyle: StepVisual_StyledItem, theRenderingProps: STEPConstruct_RenderingProperties, theIsComponent?: boolean): { returnValue: boolean; theSurfaceColour: StepVisual_Colour; theBoundaryColour: StepVisual_Colour; theCurveColour: StepVisual_Colour; theIsComponent: boolean; [Symbol.dispose](): void };
// theRenderingProps: Mutated in place

// Create STEP color entity by given {@link Quantity_Color`Quantity_Color`} The analysis is performed for whether the color corresponds to one of standard colors predefined in STEP
static EncodeColor(Col: Quantity_Color): StepVisual_Colour;
static EncodeColor(Col: Quantity_Color, DPDCs: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient, ColRGBs: NCollection_DataMap_gp_Pnt_handle_Standard_Transient): StepVisual_Colour;
static EncodeColor(Col: Quantity_Color): StepVisual_Colour;
static EncodeColor(Col: Quantity_Color, DPDCs: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient, ColRGBs: NCollection_DataMap_gp_Pnt_handle_Standard_Transient): StepVisual_Colour;

// Decodes STEP color and fills the {@link Quantity_Color`Quantity_Color`}
static DecodeColor(Colour: StepVisual_Colour, Col: Quantity_Color): boolean;
// Col: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
