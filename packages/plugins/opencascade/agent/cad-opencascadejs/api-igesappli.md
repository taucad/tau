# libcascade — IGESAppli

36 top-level symbols. Signatures are verbatim typescript.

IGESAppli: declare class IGESAppli

  // IGESAppli.constructor (constructor)
  constructor();

  // IGESAppli.Init (method)
  static Init(): void;

  // IGESAppli.Protocol (method)
  static Protocol(): IGESAppli_Protocol;

  // IGESAppli.delete (method)
  delete(): void;

  // IGESAppli.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_DrilledHole: declare class IGESAppli_DrilledHole extends IGESData_IGESEntity

  // IGESAppli_DrilledHole.constructor (constructor)
  constructor();

  // IGESAppli_DrilledHole.Init (method)
  Init(nbPropVal: number, aSize: number, anotherSize: number, aPlating: number, aLayer: number, anotherLayer: number): void;

  // IGESAppli_DrilledHole.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_DrilledHole.DrillDiaSize (method)
  DrillDiaSize(): number;

  // IGESAppli_DrilledHole.FinishDiaSize (method)
  FinishDiaSize(): number;

  // IGESAppli_DrilledHole.IsPlating (method)
  IsPlating(): boolean;

  // IGESAppli_DrilledHole.NbLowerLayer (method)
  NbLowerLayer(): number;

  // IGESAppli_DrilledHole.NbHigherLayer (method)
  NbHigherLayer(): number;

  // IGESAppli_DrilledHole.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_DrilledHole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_DrilledHole.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_DrilledHole.delete (method)
  delete(): void;

  // IGESAppli_DrilledHole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ElementResults: declare class IGESAppli_ElementResults extends IGESData_IGESEntity

  // IGESAppli_ElementResults.constructor (constructor)
  constructor();

  // IGESAppli_ElementResults.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aSubCase: number, aTime: number, nbResults: number, aResRepFlag: number, allElementIdents: NCollection_HArray1_int, allFiniteElems: NCollection_HArray1_handle_IGESAppli_FiniteElement, allTopTypes: NCollection_HArray1_int, nbLayers: NCollection_HArray1_int, allDataLayerFlags: NCollection_HArray1_int, allnbResDataLocs: NCollection_HArray1_int, allResDataLocs: IGESBasic_HArray1OfHArray1OfInteger, allResults: IGESBasic_HArray1OfHArray1OfReal): void;

  // IGESAppli_ElementResults.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESAppli_ElementResults.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESAppli_ElementResults.SubCaseNumber (method)
  SubCaseNumber(): number;

  // IGESAppli_ElementResults.Time (method)
  Time(): number;

  // IGESAppli_ElementResults.NbResultValues (method)
  NbResultValues(): number;

  // IGESAppli_ElementResults.ResultReportFlag (method)
  ResultReportFlag(): number;

  // IGESAppli_ElementResults.NbElements (method)
  NbElements(): number;

  // IGESAppli_ElementResults.ElementIdentifier (method)
  ElementIdentifier(Index: number): number;

  // IGESAppli_ElementResults.Element (method)
  Element(Index: number): IGESAppli_FiniteElement;

  // IGESAppli_ElementResults.ElementTopologyType (method)
  ElementTopologyType(Index: number): number;

  // IGESAppli_ElementResults.NbLayers (method)
  NbLayers(Index: number): number;

  // IGESAppli_ElementResults.DataLayerFlag (method)
  DataLayerFlag(Index: number): number;

  // IGESAppli_ElementResults.NbResultDataLocs (method)
  NbResultDataLocs(Index: number): number;

  // IGESAppli_ElementResults.ResultDataLoc (method)
  ResultDataLoc(NElem: number, NLoc: number): number;

  // IGESAppli_ElementResults.NbResults (method)
  NbResults(Index: number): number;

  // IGESAppli_ElementResults.ResultData (method)
  ResultData(NElem: number, num: number): number;
  ResultData(NElem: number, NVal: number, NLay: number, NLoc: number): number;

  // IGESAppli_ElementResults.ResultRank (method)
  ResultRank(NElem: number, NVal: number, NLay: number, NLoc: number): number;

  // IGESAppli_ElementResults.ResultList (method)
  ResultList(NElem: number): NCollection_HArray1_double;

  // IGESAppli_ElementResults.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_ElementResults.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_ElementResults.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_ElementResults.delete (method)
  delete(): void;

  // IGESAppli_ElementResults.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_FiniteElement: declare class IGESAppli_FiniteElement extends IGESData_IGESEntity

  // IGESAppli_FiniteElement.constructor (constructor)
  constructor();

  // IGESAppli_FiniteElement.Init (method)
  Init(aType: number, allNodes: NCollection_HArray1_handle_IGESAppli_Node, aName: TCollection_HAsciiString): void;

  // IGESAppli_FiniteElement.Topology (method)
  Topology(): number;

  // IGESAppli_FiniteElement.NbNodes (method)
  NbNodes(): number;

  // IGESAppli_FiniteElement.Node (method)
  Node(Index: number): IGESAppli_Node;

  // IGESAppli_FiniteElement.Name (method)
  Name(): TCollection_HAsciiString;

  // IGESAppli_FiniteElement.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_FiniteElement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_FiniteElement.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_FiniteElement.delete (method)
  delete(): void;

  // IGESAppli_FiniteElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_Flow: declare class IGESAppli_Flow extends IGESData_IGESEntity

  // IGESAppli_Flow.constructor (constructor)
  constructor();

  // IGESAppli_Flow.Init (method)
  Init(nbContextFlags: number, aFlowType: number, aFuncFlag: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESAppli_Flow.OwnCorrect (method)
  OwnCorrect(): boolean;

  // IGESAppli_Flow.NbContextFlags (method)
  NbContextFlags(): number;

  // IGESAppli_Flow.NbFlowAssociativities (method)
  NbFlowAssociativities(): number;

  // IGESAppli_Flow.NbConnectPoints (method)
  NbConnectPoints(): number;

  // IGESAppli_Flow.NbJoins (method)
  NbJoins(): number;

  // IGESAppli_Flow.NbFlowNames (method)
  NbFlowNames(): number;

  // IGESAppli_Flow.NbTextDisplayTemplates (method)
  NbTextDisplayTemplates(): number;

  // IGESAppli_Flow.NbContFlowAssociativities (method)
  NbContFlowAssociativities(): number;

  // IGESAppli_Flow.TypeOfFlow (method)
  TypeOfFlow(): number;

  // IGESAppli_Flow.FunctionFlag (method)
  FunctionFlag(): number;

  // IGESAppli_Flow.FlowAssociativity (method)
  FlowAssociativity(Index: number): IGESData_IGESEntity;

  // IGESAppli_Flow.ConnectPoint (method)
  ConnectPoint(Index: number): IGESDraw_ConnectPoint;

  // IGESAppli_Flow.Join (method)
  Join(Index: number): IGESData_IGESEntity;

  // IGESAppli_Flow.FlowName (method)
  FlowName(Index: number): TCollection_HAsciiString;

  // IGESAppli_Flow.TextDisplayTemplate (method)
  TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

  // IGESAppli_Flow.ContFlowAssociativity (method)
  ContFlowAssociativity(Index: number): IGESData_IGESEntity;

  // IGESAppli_Flow.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_Flow.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_Flow.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_Flow.delete (method)
  delete(): void;

  // IGESAppli_Flow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_FlowLineSpec: declare class IGESAppli_FlowLineSpec extends IGESData_IGESEntity

  // IGESAppli_FlowLineSpec.constructor (constructor)
  constructor();

  // IGESAppli_FlowLineSpec.Init (method)
  Init(allProperties: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // IGESAppli_FlowLineSpec.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_FlowLineSpec.FlowLineName (method)
  FlowLineName(): TCollection_HAsciiString;

  // IGESAppli_FlowLineSpec.Modifier (method)
  Modifier(Index: number): TCollection_HAsciiString;

  // IGESAppli_FlowLineSpec.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_FlowLineSpec.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_FlowLineSpec.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_FlowLineSpec.delete (method)
  delete(): void;

  // IGESAppli_FlowLineSpec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_GeneralModule: declare class IGESAppli_GeneralModule extends IGESData_GeneralModule

  // IGESAppli_GeneralModule.constructor (constructor)
  constructor();

  // IGESAppli_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESAppli_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESAppli_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESAppli_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESAppli_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_GeneralModule.delete (method)
  delete(): void;

  // IGESAppli_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_LevelFunction: declare class IGESAppli_LevelFunction extends IGESData_IGESEntity

  // IGESAppli_LevelFunction.constructor (constructor)
  constructor();

  // IGESAppli_LevelFunction.Init (method)
  Init(nbPropVal: number, aCode: number, aFuncDescrip: TCollection_HAsciiString): void;

  // IGESAppli_LevelFunction.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_LevelFunction.FuncDescriptionCode (method)
  FuncDescriptionCode(): number;

  // IGESAppli_LevelFunction.FuncDescription (method)
  FuncDescription(): TCollection_HAsciiString;

  // IGESAppli_LevelFunction.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_LevelFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_LevelFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_LevelFunction.delete (method)
  delete(): void;

  // IGESAppli_LevelFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_LevelToPWBLayerMap: declare class IGESAppli_LevelToPWBLayerMap extends IGESData_IGESEntity

  // IGESAppli_LevelToPWBLayerMap.constructor (constructor)
  constructor();

  // IGESAppli_LevelToPWBLayerMap.Init (method)
  Init(nbPropVal: number, allExchLevels: NCollection_HArray1_int, allNativeLevels: NCollection_HArray1_handle_TCollection_HAsciiString, allPhysLevels: NCollection_HArray1_int, allExchIdents: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // IGESAppli_LevelToPWBLayerMap.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_LevelToPWBLayerMap.NbLevelToLayerDefs (method)
  NbLevelToLayerDefs(): number;

  // IGESAppli_LevelToPWBLayerMap.ExchangeFileLevelNumber (method)
  ExchangeFileLevelNumber(Index: number): number;

  // IGESAppli_LevelToPWBLayerMap.NativeLevel (method)
  NativeLevel(Index: number): TCollection_HAsciiString;

  // IGESAppli_LevelToPWBLayerMap.PhysicalLayerNumber (method)
  PhysicalLayerNumber(Index: number): number;

  // IGESAppli_LevelToPWBLayerMap.ExchangeFileLevelIdent (method)
  ExchangeFileLevelIdent(Index: number): TCollection_HAsciiString;

  // IGESAppli_LevelToPWBLayerMap.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_LevelToPWBLayerMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_LevelToPWBLayerMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_LevelToPWBLayerMap.delete (method)
  delete(): void;

  // IGESAppli_LevelToPWBLayerMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_LineWidening: declare class IGESAppli_LineWidening extends IGESData_IGESEntity

  // IGESAppli_LineWidening.constructor (constructor)
  constructor();

  // IGESAppli_LineWidening.Init (method)
  Init(nbPropVal: number, aWidth: number, aCornering: number, aExtnFlag: number, aJustifFlag: number, aExtnVal: number): void;

  // IGESAppli_LineWidening.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_LineWidening.WidthOfMetalization (method)
  WidthOfMetalization(): number;

  // IGESAppli_LineWidening.CorneringCode (method)
  CorneringCode(): number;

  // IGESAppli_LineWidening.ExtensionFlag (method)
  ExtensionFlag(): number;

  // IGESAppli_LineWidening.JustificationFlag (method)
  JustificationFlag(): number;

  // IGESAppli_LineWidening.ExtensionValue (method)
  ExtensionValue(): number;

  // IGESAppli_LineWidening.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_LineWidening.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_LineWidening.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_LineWidening.delete (method)
  delete(): void;

  // IGESAppli_LineWidening.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_NodalConstraint: declare class IGESAppli_NodalConstraint extends IGESData_IGESEntity

  // IGESAppli_NodalConstraint.constructor (constructor)
  constructor();

  // IGESAppli_NodalConstraint.Init (method)
  Init(aType: number, aNode: IGESAppli_Node, allTabData: NCollection_HArray1_handle_IGESDefs_TabularData): void;

  // IGESAppli_NodalConstraint.NbCases (method)
  NbCases(): number;

  // IGESAppli_NodalConstraint.Type (method)
  Type(): number;

  // IGESAppli_NodalConstraint.NodeEntity (method)
  NodeEntity(): IGESAppli_Node;

  // IGESAppli_NodalConstraint.TabularData (method)
  TabularData(Index: number): IGESDefs_TabularData;

  // IGESAppli_NodalConstraint.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_NodalConstraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_NodalConstraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_NodalConstraint.delete (method)
  delete(): void;

  // IGESAppli_NodalConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_NodalDisplAndRot: declare class IGESAppli_NodalDisplAndRot extends IGESData_IGESEntity

  // IGESAppli_NodalDisplAndRot.constructor (constructor)
  constructor();

  // IGESAppli_NodalDisplAndRot.Init (method)
  Init(allNotes: NCollection_HArray1_handle_IGESDimen_GeneralNote, allIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allRotParams: IGESBasic_HArray1OfHArray1OfXYZ, allTransParams: IGESBasic_HArray1OfHArray1OfXYZ): void;

  // IGESAppli_NodalDisplAndRot.NbCases (method)
  NbCases(): number;

  // IGESAppli_NodalDisplAndRot.NbNodes (method)
  NbNodes(): number;

  // IGESAppli_NodalDisplAndRot.Note (method)
  Note(Index: number): IGESDimen_GeneralNote;

  // IGESAppli_NodalDisplAndRot.NodeIdentifier (method)
  NodeIdentifier(Index: number): number;

  // IGESAppli_NodalDisplAndRot.Node (method)
  Node(Index: number): IGESAppli_Node;

  // IGESAppli_NodalDisplAndRot.TranslationParameter (method)
  TranslationParameter(NodeNum: number, CaseNum: number): gp_XYZ;

  // IGESAppli_NodalDisplAndRot.RotationalParameter (method)
  RotationalParameter(NodeNum: number, CaseNum: number): gp_XYZ;

  // IGESAppli_NodalDisplAndRot.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_NodalDisplAndRot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_NodalDisplAndRot.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_NodalDisplAndRot.delete (method)
  delete(): void;

  // IGESAppli_NodalDisplAndRot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_NodalResults: declare class IGESAppli_NodalResults extends IGESData_IGESEntity

  // IGESAppli_NodalResults.constructor (constructor)
  constructor();

  // IGESAppli_NodalResults.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aNumber: number, aTime: number, allNodeIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allData: NCollection_HArray2_double): void;

  // IGESAppli_NodalResults.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESAppli_NodalResults.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESAppli_NodalResults.SubCaseNumber (method)
  SubCaseNumber(): number;

  // IGESAppli_NodalResults.Time (method)
  Time(): number;

  // IGESAppli_NodalResults.NbData (method)
  NbData(): number;

  // IGESAppli_NodalResults.NbNodes (method)
  NbNodes(): number;

  // IGESAppli_NodalResults.NodeIdentifier (method)
  NodeIdentifier(Index: number): number;

  // IGESAppli_NodalResults.Node (method)
  Node(Index: number): IGESAppli_Node;

  // IGESAppli_NodalResults.Data (method)
  Data(NodeNum: number, DataNum: number): number;

  // IGESAppli_NodalResults.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_NodalResults.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_NodalResults.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_NodalResults.delete (method)
  delete(): void;

  // IGESAppli_NodalResults.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_Node: declare class IGESAppli_Node extends IGESData_IGESEntity

  // IGESAppli_Node.constructor (constructor)
  constructor();

  // IGESAppli_Node.Init (method)
  Init(aCoord: gp_XYZ, aCoordSystem: IGESGeom_TransformationMatrix): void;

  // IGESAppli_Node.Coord (method)
  Coord(): gp_Pnt;

  // IGESAppli_Node.System (method)
  System(): IGESData_TransfEntity;

  // IGESAppli_Node.SystemType (method)
  SystemType(): number;

  // IGESAppli_Node.TransformedNodalCoord (method)
  TransformedNodalCoord(): gp_Pnt;

  // IGESAppli_Node.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_Node.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_Node.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_Node.delete (method)
  delete(): void;

  // IGESAppli_Node.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_PWBArtworkStackup: declare class IGESAppli_PWBArtworkStackup extends IGESData_IGESEntity

  // IGESAppli_PWBArtworkStackup.constructor (constructor)
  constructor();

  // IGESAppli_PWBArtworkStackup.Init (method)
  Init(nbPropVal: number, anArtIdent: TCollection_HAsciiString, allLevelNums: NCollection_HArray1_int): void;

  // IGESAppli_PWBArtworkStackup.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_PWBArtworkStackup.Identification (method)
  Identification(): TCollection_HAsciiString;

  // IGESAppli_PWBArtworkStackup.NbLevelNumbers (method)
  NbLevelNumbers(): number;

  // IGESAppli_PWBArtworkStackup.LevelNumber (method)
  LevelNumber(Index: number): number;

  // IGESAppli_PWBArtworkStackup.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_PWBArtworkStackup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_PWBArtworkStackup.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_PWBArtworkStackup.delete (method)
  delete(): void;

  // IGESAppli_PWBArtworkStackup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_PWBDrilledHole: declare class IGESAppli_PWBDrilledHole extends IGESData_IGESEntity

  // IGESAppli_PWBDrilledHole.constructor (constructor)
  constructor();

  // IGESAppli_PWBDrilledHole.Init (method)
  Init(nbPropVal: number, aDrillDia: number, aFinishDia: number, aCode: number): void;

  // IGESAppli_PWBDrilledHole.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_PWBDrilledHole.DrillDiameterSize (method)
  DrillDiameterSize(): number;

  // IGESAppli_PWBDrilledHole.FinishDiameterSize (method)
  FinishDiameterSize(): number;

  // IGESAppli_PWBDrilledHole.FunctionCode (method)
  FunctionCode(): number;

  // IGESAppli_PWBDrilledHole.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_PWBDrilledHole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_PWBDrilledHole.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_PWBDrilledHole.delete (method)
  delete(): void;

  // IGESAppli_PWBDrilledHole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_PartNumber: declare class IGESAppli_PartNumber extends IGESData_IGESEntity

  // IGESAppli_PartNumber.constructor (constructor)
  constructor();

  // IGESAppli_PartNumber.Init (method)
  Init(nbPropVal: number, aGenName: TCollection_HAsciiString, aMilName: TCollection_HAsciiString, aVendName: TCollection_HAsciiString, anIntName: TCollection_HAsciiString): void;

  // IGESAppli_PartNumber.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_PartNumber.GenericNumber (method)
  GenericNumber(): TCollection_HAsciiString;

  // IGESAppli_PartNumber.MilitaryNumber (method)
  MilitaryNumber(): TCollection_HAsciiString;

  // IGESAppli_PartNumber.VendorNumber (method)
  VendorNumber(): TCollection_HAsciiString;

  // IGESAppli_PartNumber.InternalNumber (method)
  InternalNumber(): TCollection_HAsciiString;

  // IGESAppli_PartNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_PartNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_PartNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_PartNumber.delete (method)
  delete(): void;

  // IGESAppli_PartNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_PinNumber: declare class IGESAppli_PinNumber extends IGESData_IGESEntity

  // IGESAppli_PinNumber.constructor (constructor)
  constructor();

  // IGESAppli_PinNumber.Init (method)
  Init(nbPropVal: number, aValue: TCollection_HAsciiString): void;

  // IGESAppli_PinNumber.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_PinNumber.PinNumberVal (method)
  PinNumberVal(): TCollection_HAsciiString;

  // IGESAppli_PinNumber.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_PinNumber.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_PinNumber.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_PinNumber.delete (method)
  delete(): void;

  // IGESAppli_PinNumber.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_PipingFlow: declare class IGESAppli_PipingFlow extends IGESData_IGESEntity

  // IGESAppli_PipingFlow.constructor (constructor)
  constructor();

  // IGESAppli_PipingFlow.Init (method)
  Init(nbContextFlags: number, aFlowType: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESAppli_PipingFlow.OwnCorrect (method)
  OwnCorrect(): boolean;

  // IGESAppli_PipingFlow.NbContextFlags (method)
  NbContextFlags(): number;

  // IGESAppli_PipingFlow.NbFlowAssociativities (method)
  NbFlowAssociativities(): number;

  // IGESAppli_PipingFlow.NbConnectPoints (method)
  NbConnectPoints(): number;

  // IGESAppli_PipingFlow.NbJoins (method)
  NbJoins(): number;

  // IGESAppli_PipingFlow.NbFlowNames (method)
  NbFlowNames(): number;

  // IGESAppli_PipingFlow.NbTextDisplayTemplates (method)
  NbTextDisplayTemplates(): number;

  // IGESAppli_PipingFlow.NbContFlowAssociativities (method)
  NbContFlowAssociativities(): number;

  // IGESAppli_PipingFlow.TypeOfFlow (method)
  TypeOfFlow(): number;

  // IGESAppli_PipingFlow.FlowAssociativity (method)
  FlowAssociativity(Index: number): IGESData_IGESEntity;

  // IGESAppli_PipingFlow.ConnectPoint (method)
  ConnectPoint(Index: number): IGESDraw_ConnectPoint;

  // IGESAppli_PipingFlow.Join (method)
  Join(Index: number): IGESData_IGESEntity;

  // IGESAppli_PipingFlow.FlowName (method)
  FlowName(Index: number): TCollection_HAsciiString;

  // IGESAppli_PipingFlow.TextDisplayTemplate (method)
  TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

  // IGESAppli_PipingFlow.ContFlowAssociativity (method)
  ContFlowAssociativity(Index: number): IGESData_IGESEntity;

  // IGESAppli_PipingFlow.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_PipingFlow.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_PipingFlow.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_PipingFlow.delete (method)
  delete(): void;

  // IGESAppli_PipingFlow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_Protocol: declare class IGESAppli_Protocol extends IGESData_Protocol

  // IGESAppli_Protocol.constructor (constructor)
  constructor();

  // IGESAppli_Protocol.NbResources (method)
  NbResources(): number;

  // IGESAppli_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESAppli_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESAppli_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_Protocol.delete (method)
  delete(): void;

  // IGESAppli_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ReadWriteModule: declare class IGESAppli_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESAppli_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESAppli_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESAppli_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESAppli_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_ReadWriteModule.delete (method)
  delete(): void;

  // IGESAppli_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ReferenceDesignator: declare class IGESAppli_ReferenceDesignator extends IGESData_IGESEntity

  // IGESAppli_ReferenceDesignator.constructor (constructor)
  constructor();

  // IGESAppli_ReferenceDesignator.Init (method)
  Init(nbPropVal: number, aText: TCollection_HAsciiString): void;

  // IGESAppli_ReferenceDesignator.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_ReferenceDesignator.RefDesignatorText (method)
  RefDesignatorText(): TCollection_HAsciiString;

  // IGESAppli_ReferenceDesignator.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_ReferenceDesignator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_ReferenceDesignator.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_ReferenceDesignator.delete (method)
  delete(): void;

  // IGESAppli_ReferenceDesignator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_RegionRestriction: declare class IGESAppli_RegionRestriction extends IGESData_IGESEntity

  // IGESAppli_RegionRestriction.constructor (constructor)
  constructor();

  // IGESAppli_RegionRestriction.Init (method)
  Init(nbPropVal: number, aViasRest: number, aCompoRest: number, aCktRest: number): void;

  // IGESAppli_RegionRestriction.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESAppli_RegionRestriction.ElectricalViasRestriction (method)
  ElectricalViasRestriction(): number;

  // IGESAppli_RegionRestriction.ElectricalComponentRestriction (method)
  ElectricalComponentRestriction(): number;

  // IGESAppli_RegionRestriction.ElectricalCktRestriction (method)
  ElectricalCktRestriction(): number;

  // IGESAppli_RegionRestriction.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_RegionRestriction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_RegionRestriction.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_RegionRestriction.delete (method)
  delete(): void;

  // IGESAppli_RegionRestriction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_SpecificModule: declare class IGESAppli_SpecificModule extends IGESData_SpecificModule

  // IGESAppli_SpecificModule.constructor (constructor)
  constructor();

  // IGESAppli_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESAppli_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESAppli_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESAppli_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESAppli_SpecificModule.delete (method)
  delete(): void;

  // IGESAppli_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolDrilledHole: declare class IGESAppli_ToolDrilledHole

  // IGESAppli_ToolDrilledHole.constructor (constructor)
  constructor();

  // IGESAppli_ToolDrilledHole.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_DrilledHole, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolDrilledHole.OwnCorrect (method)
  OwnCorrect(ent: IGESAppli_DrilledHole): boolean;

  // IGESAppli_ToolDrilledHole.DirChecker (method)
  DirChecker(ent: IGESAppli_DrilledHole): IGESData_DirChecker;

  // IGESAppli_ToolDrilledHole.OwnCheck (method)
  OwnCheck(ent: IGESAppli_DrilledHole, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolDrilledHole.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_DrilledHole, entto: IGESAppli_DrilledHole, TC: Interface_CopyTool): void;

  // IGESAppli_ToolDrilledHole.delete (method)
  delete(): void;

  // IGESAppli_ToolDrilledHole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolElementResults: declare class IGESAppli_ToolElementResults

  // IGESAppli_ToolElementResults.constructor (constructor)
  constructor();

  // IGESAppli_ToolElementResults.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_ElementResults, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolElementResults.DirChecker (method)
  DirChecker(ent: IGESAppli_ElementResults): IGESData_DirChecker;

  // IGESAppli_ToolElementResults.OwnCheck (method)
  OwnCheck(ent: IGESAppli_ElementResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolElementResults.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_ElementResults, entto: IGESAppli_ElementResults, TC: Interface_CopyTool): void;

  // IGESAppli_ToolElementResults.delete (method)
  delete(): void;

  // IGESAppli_ToolElementResults.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolFiniteElement: declare class IGESAppli_ToolFiniteElement

  // IGESAppli_ToolFiniteElement.constructor (constructor)
  constructor();

  // IGESAppli_ToolFiniteElement.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_FiniteElement, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolFiniteElement.DirChecker (method)
  DirChecker(ent: IGESAppli_FiniteElement): IGESData_DirChecker;

  // IGESAppli_ToolFiniteElement.OwnCheck (method)
  OwnCheck(ent: IGESAppli_FiniteElement, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolFiniteElement.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_FiniteElement, entto: IGESAppli_FiniteElement, TC: Interface_CopyTool): void;

  // IGESAppli_ToolFiniteElement.delete (method)
  delete(): void;

  // IGESAppli_ToolFiniteElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolFlow: declare class IGESAppli_ToolFlow

  // IGESAppli_ToolFlow.constructor (constructor)
  constructor();

  // IGESAppli_ToolFlow.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_Flow, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolFlow.OwnCorrect (method)
  OwnCorrect(ent: IGESAppli_Flow): boolean;

  // IGESAppli_ToolFlow.DirChecker (method)
  DirChecker(ent: IGESAppli_Flow): IGESData_DirChecker;

  // IGESAppli_ToolFlow.OwnCheck (method)
  OwnCheck(ent: IGESAppli_Flow, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolFlow.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_Flow, entto: IGESAppli_Flow, TC: Interface_CopyTool): void;

  // IGESAppli_ToolFlow.delete (method)
  delete(): void;

  // IGESAppli_ToolFlow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolFlowLineSpec: declare class IGESAppli_ToolFlowLineSpec

  // IGESAppli_ToolFlowLineSpec.constructor (constructor)
  constructor();

  // IGESAppli_ToolFlowLineSpec.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_FlowLineSpec, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolFlowLineSpec.DirChecker (method)
  DirChecker(ent: IGESAppli_FlowLineSpec): IGESData_DirChecker;

  // IGESAppli_ToolFlowLineSpec.OwnCheck (method)
  OwnCheck(ent: IGESAppli_FlowLineSpec, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolFlowLineSpec.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_FlowLineSpec, entto: IGESAppli_FlowLineSpec, TC: Interface_CopyTool): void;

  // IGESAppli_ToolFlowLineSpec.delete (method)
  delete(): void;

  // IGESAppli_ToolFlowLineSpec.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolLevelFunction: declare class IGESAppli_ToolLevelFunction

  // IGESAppli_ToolLevelFunction.constructor (constructor)
  constructor();

  // IGESAppli_ToolLevelFunction.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_LevelFunction, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolLevelFunction.OwnCorrect (method)
  OwnCorrect(ent: IGESAppli_LevelFunction): boolean;

  // IGESAppli_ToolLevelFunction.DirChecker (method)
  DirChecker(ent: IGESAppli_LevelFunction): IGESData_DirChecker;

  // IGESAppli_ToolLevelFunction.OwnCheck (method)
  OwnCheck(ent: IGESAppli_LevelFunction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolLevelFunction.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_LevelFunction, entto: IGESAppli_LevelFunction, TC: Interface_CopyTool): void;

  // IGESAppli_ToolLevelFunction.delete (method)
  delete(): void;

  // IGESAppli_ToolLevelFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolLevelToPWBLayerMap: declare class IGESAppli_ToolLevelToPWBLayerMap

  // IGESAppli_ToolLevelToPWBLayerMap.constructor (constructor)
  constructor();

  // IGESAppli_ToolLevelToPWBLayerMap.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_LevelToPWBLayerMap, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolLevelToPWBLayerMap.DirChecker (method)
  DirChecker(ent: IGESAppli_LevelToPWBLayerMap): IGESData_DirChecker;

  // IGESAppli_ToolLevelToPWBLayerMap.OwnCheck (method)
  OwnCheck(ent: IGESAppli_LevelToPWBLayerMap, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolLevelToPWBLayerMap.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_LevelToPWBLayerMap, entto: IGESAppli_LevelToPWBLayerMap, TC: Interface_CopyTool): void;

  // IGESAppli_ToolLevelToPWBLayerMap.delete (method)
  delete(): void;

  // IGESAppli_ToolLevelToPWBLayerMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolLineWidening: declare class IGESAppli_ToolLineWidening

  // IGESAppli_ToolLineWidening.constructor (constructor)
  constructor();

  // IGESAppli_ToolLineWidening.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_LineWidening, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolLineWidening.OwnCorrect (method)
  OwnCorrect(ent: IGESAppli_LineWidening): boolean;

  // IGESAppli_ToolLineWidening.DirChecker (method)
  DirChecker(ent: IGESAppli_LineWidening): IGESData_DirChecker;

  // IGESAppli_ToolLineWidening.OwnCheck (method)
  OwnCheck(ent: IGESAppli_LineWidening, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolLineWidening.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_LineWidening, entto: IGESAppli_LineWidening, TC: Interface_CopyTool): void;

  // IGESAppli_ToolLineWidening.delete (method)
  delete(): void;

  // IGESAppli_ToolLineWidening.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolNodalConstraint: declare class IGESAppli_ToolNodalConstraint

  // IGESAppli_ToolNodalConstraint.constructor (constructor)
  constructor();

  // IGESAppli_ToolNodalConstraint.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_NodalConstraint, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolNodalConstraint.DirChecker (method)
  DirChecker(ent: IGESAppli_NodalConstraint): IGESData_DirChecker;

  // IGESAppli_ToolNodalConstraint.OwnCheck (method)
  OwnCheck(ent: IGESAppli_NodalConstraint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolNodalConstraint.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_NodalConstraint, entto: IGESAppli_NodalConstraint, TC: Interface_CopyTool): void;

  // IGESAppli_ToolNodalConstraint.delete (method)
  delete(): void;

  // IGESAppli_ToolNodalConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolNodalDisplAndRot: declare class IGESAppli_ToolNodalDisplAndRot

  // IGESAppli_ToolNodalDisplAndRot.constructor (constructor)
  constructor();

  // IGESAppli_ToolNodalDisplAndRot.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_NodalDisplAndRot, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolNodalDisplAndRot.DirChecker (method)
  DirChecker(ent: IGESAppli_NodalDisplAndRot): IGESData_DirChecker;

  // IGESAppli_ToolNodalDisplAndRot.OwnCheck (method)
  OwnCheck(ent: IGESAppli_NodalDisplAndRot, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolNodalDisplAndRot.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_NodalDisplAndRot, entto: IGESAppli_NodalDisplAndRot, TC: Interface_CopyTool): void;

  // IGESAppli_ToolNodalDisplAndRot.delete (method)
  delete(): void;

  // IGESAppli_ToolNodalDisplAndRot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolNodalResults: declare class IGESAppli_ToolNodalResults

  // IGESAppli_ToolNodalResults.constructor (constructor)
  constructor();

  // IGESAppli_ToolNodalResults.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_NodalResults, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolNodalResults.DirChecker (method)
  DirChecker(ent: IGESAppli_NodalResults): IGESData_DirChecker;

  // IGESAppli_ToolNodalResults.OwnCheck (method)
  OwnCheck(ent: IGESAppli_NodalResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolNodalResults.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_NodalResults, entto: IGESAppli_NodalResults, TC: Interface_CopyTool): void;

  // IGESAppli_ToolNodalResults.delete (method)
  delete(): void;

  // IGESAppli_ToolNodalResults.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESAppli_ToolNode: declare class IGESAppli_ToolNode

  // IGESAppli_ToolNode.constructor (constructor)
  constructor();

  // IGESAppli_ToolNode.WriteOwnParams (method)
  WriteOwnParams(ent: IGESAppli_Node, IW: IGESData_IGESWriter): void;

  // IGESAppli_ToolNode.DirChecker (method)
  DirChecker(ent: IGESAppli_Node): IGESData_DirChecker;

  // IGESAppli_ToolNode.OwnCheck (method)
  OwnCheck(ent: IGESAppli_Node, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESAppli_ToolNode.OwnCopy (method)
  OwnCopy(entfrom: IGESAppli_Node, entto: IGESAppli_Node, TC: Interface_CopyTool): void;

  // IGESAppli_ToolNode.delete (method)
  delete(): void;

  // IGESAppli_ToolNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
