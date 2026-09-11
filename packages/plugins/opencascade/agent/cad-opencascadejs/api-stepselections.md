# libcascade — STEPSelections

11 top-level symbols. Signatures are verbatim typescript.

STEPSelections_AssemblyComponent: declare class STEPSelections_AssemblyComponent extends Standard_Transient

constructor

GetSDR(): StepShape_ShapeDefinitionRepresentation;

GetList(): NCollection_HSequence_handle_STEPSelections_AssemblyLink;

SetSDR(sdr: StepShape_ShapeDefinitionRepresentation): void;

SetList(list: NCollection_HSequence_handle_STEPSelections_AssemblyLink): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_AssemblyExplorer: declare class STEPSelections_AssemblyExplorer

FindSDRWithProduct(product: StepBasic_ProductDefinition): StepShape_ShapeDefinitionRepresentation;

FillListWithGraph(cmp: STEPSelections_AssemblyComponent): void;

FindItemWithNAUO(nauo: StepRepr_NextAssemblyUsageOccurrence): Standard_Transient;

NbAssemblies(): number;

Root(rank?: number): STEPSelections_AssemblyComponent;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_AssemblyLink: declare class STEPSelections_AssemblyLink extends Standard_Transient

constructor

GetNAUO(): StepRepr_NextAssemblyUsageOccurrence;

GetItem(): Standard_Transient;

GetComponent(): STEPSelections_AssemblyComponent;

SetNAUO(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

SetItem(item: Standard_Transient): void;

SetComponent(part: STEPSelections_AssemblyComponent): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectAssembly: declare class STEPSelections_SelectAssembly extends IFSelect_SelectExplore

constructor

ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectDerived: declare class STEPSelections_SelectDerived extends StepSelect_StepType

constructor

Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectFaces: declare class STEPSelections_SelectFaces extends IFSelect_SelectExplore

constructor

ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectForTransfer: declare class STEPSelections_SelectForTransfer extends XSControl_SelectForTransfer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectGSCurves: declare class STEPSelections_SelectGSCurves extends IFSelect_SelectExplore

constructor

ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_SelectInstances: declare class STEPSelections_SelectInstances extends IFSelect_SelectExplore

constructor

ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPSelections_HSequenceOfAssemblyLink: NCollection_HSequence_handle_STEPSelections_AssemblyLink

STEPSelections_SequenceOfAssemblyLink: NCollection_Sequence_handle_STEPSelections_AssemblyLink
