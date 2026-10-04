# libcascade — STEPSelections

11 top-level symbols. Signatures are verbatim typescript.

STEPSelections_AssemblyComponent: declare class STEPSelections_AssemblyComponent extends Standard_Transient

  // STEPSelections_AssemblyComponent.constructor (constructor)
  constructor();
  constructor(sdr: StepShape_ShapeDefinitionRepresentation, list: NCollection_HSequence_handle_STEPSelections_AssemblyLink);

  // STEPSelections_AssemblyComponent.GetSDR (method)
  GetSDR(): StepShape_ShapeDefinitionRepresentation;

  // STEPSelections_AssemblyComponent.GetList (method)
  GetList(): NCollection_HSequence_handle_STEPSelections_AssemblyLink;

  // STEPSelections_AssemblyComponent.SetSDR (method)
  SetSDR(sdr: StepShape_ShapeDefinitionRepresentation): void;

  // STEPSelections_AssemblyComponent.SetList (method)
  SetList(list: NCollection_HSequence_handle_STEPSelections_AssemblyLink): void;

  // STEPSelections_AssemblyComponent.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_AssemblyComponent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_AssemblyComponent.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_AssemblyComponent.delete (method)
  delete(): void;

  // STEPSelections_AssemblyComponent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_AssemblyExplorer: declare class STEPSelections_AssemblyExplorer

  // STEPSelections_AssemblyExplorer.FindSDRWithProduct (method)
  FindSDRWithProduct(product: StepBasic_ProductDefinition): StepShape_ShapeDefinitionRepresentation;

  // STEPSelections_AssemblyExplorer.FillListWithGraph (method)
  FillListWithGraph(cmp: STEPSelections_AssemblyComponent): void;

  // STEPSelections_AssemblyExplorer.FindItemWithNAUO (method)
  FindItemWithNAUO(nauo: StepRepr_NextAssemblyUsageOccurrence): Standard_Transient;

  // STEPSelections_AssemblyExplorer.NbAssemblies (method)
  NbAssemblies(): number;

  // STEPSelections_AssemblyExplorer.Root (method)
  Root(rank?: number): STEPSelections_AssemblyComponent;

  // STEPSelections_AssemblyExplorer.delete (method)
  delete(): void;

  // STEPSelections_AssemblyExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_AssemblyLink: declare class STEPSelections_AssemblyLink extends Standard_Transient

  // STEPSelections_AssemblyLink.constructor (constructor)
  constructor();
  constructor(nauo: StepRepr_NextAssemblyUsageOccurrence, item: Standard_Transient, part: STEPSelections_AssemblyComponent);

  // STEPSelections_AssemblyLink.GetNAUO (method)
  GetNAUO(): StepRepr_NextAssemblyUsageOccurrence;

  // STEPSelections_AssemblyLink.GetItem (method)
  GetItem(): Standard_Transient;

  // STEPSelections_AssemblyLink.GetComponent (method)
  GetComponent(): STEPSelections_AssemblyComponent;

  // STEPSelections_AssemblyLink.SetNAUO (method)
  SetNAUO(nauo: StepRepr_NextAssemblyUsageOccurrence): void;

  // STEPSelections_AssemblyLink.SetItem (method)
  SetItem(item: Standard_Transient): void;

  // STEPSelections_AssemblyLink.SetComponent (method)
  SetComponent(part: STEPSelections_AssemblyComponent): void;

  // STEPSelections_AssemblyLink.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_AssemblyLink.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_AssemblyLink.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_AssemblyLink.delete (method)
  delete(): void;

  // STEPSelections_AssemblyLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectAssembly: declare class STEPSelections_SelectAssembly extends IFSelect_SelectExplore

  // STEPSelections_SelectAssembly.constructor (constructor)
  constructor();

  // STEPSelections_SelectAssembly.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // STEPSelections_SelectAssembly.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectAssembly.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectAssembly.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectAssembly.delete (method)
  delete(): void;

  // STEPSelections_SelectAssembly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectDerived: declare class STEPSelections_SelectDerived extends StepSelect_StepType

  // STEPSelections_SelectDerived.constructor (constructor)
  constructor();

  // STEPSelections_SelectDerived.Matches (method)
  Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

  // STEPSelections_SelectDerived.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectDerived.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectDerived.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectDerived.delete (method)
  delete(): void;

  // STEPSelections_SelectDerived.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectFaces: declare class STEPSelections_SelectFaces extends IFSelect_SelectExplore

  // STEPSelections_SelectFaces.constructor (constructor)
  constructor();

  // STEPSelections_SelectFaces.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // STEPSelections_SelectFaces.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectFaces.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectFaces.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectFaces.delete (method)
  delete(): void;

  // STEPSelections_SelectFaces.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectForTransfer: declare class STEPSelections_SelectForTransfer extends XSControl_SelectForTransfer

  // STEPSelections_SelectForTransfer.constructor (constructor)
  constructor();
  constructor(TR: XSControl_TransferReader);

  // STEPSelections_SelectForTransfer.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectForTransfer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectForTransfer.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectForTransfer.delete (method)
  delete(): void;

  // STEPSelections_SelectForTransfer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectGSCurves: declare class STEPSelections_SelectGSCurves extends IFSelect_SelectExplore

  // STEPSelections_SelectGSCurves.constructor (constructor)
  constructor();

  // STEPSelections_SelectGSCurves.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // STEPSelections_SelectGSCurves.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectGSCurves.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectGSCurves.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectGSCurves.delete (method)
  delete(): void;

  // STEPSelections_SelectGSCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_SelectInstances: declare class STEPSelections_SelectInstances extends IFSelect_SelectExplore

  // STEPSelections_SelectInstances.constructor (constructor)
  constructor();

  // STEPSelections_SelectInstances.ExploreLabel (method)
  ExploreLabel(): TCollection_AsciiString;

  // STEPSelections_SelectInstances.get_type_name (method)
  static get_type_name(): string;

  // STEPSelections_SelectInstances.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPSelections_SelectInstances.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPSelections_SelectInstances.delete (method)
  delete(): void;

  // STEPSelections_SelectInstances.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPSelections_HSequenceOfAssemblyLink: NCollection_HSequence_handle_STEPSelections_AssemblyLink

STEPSelections_SequenceOfAssemblyLink: NCollection_Sequence_handle_STEPSelections_AssemblyLink
