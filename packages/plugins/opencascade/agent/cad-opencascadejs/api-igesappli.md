# libcascade — IGESAppli

37 top-level symbols. Signatures are verbatim typescript.

IGESAppli: declare class IGESAppli

  constructor

  static Init(): void;

  static Protocol(): IGESAppli_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_DrilledHole: declare class IGESAppli_DrilledHole extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aSize: number, anotherSize: number, aPlating: number, aLayer: number, anotherLayer: number): void;

  NbPropertyValues(): number;

  DrillDiaSize(): number;

  FinishDiaSize(): number;

  IsPlating(): boolean;

  NbLowerLayer(): number;

  NbHigherLayer(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ElementResults: declare class IGESAppli_ElementResults extends IGESData_IGESEntity

  constructor

  Init(aNote: IGESDimen_GeneralNote, aSubCase: number, aTime: number, nbResults: number, aResRepFlag: number, allElementIdents: NCollection_HArray1_int, allFiniteElems: NCollection_HArray1_handle_IGESAppli_FiniteElement, allTopTypes: NCollection_HArray1_int, nbLayers: NCollection_HArray1_int, allDataLayerFlags: NCollection_HArray1_int, allnbResDataLocs: NCollection_HArray1_int, allResDataLocs: IGESBasic_HArray1OfHArray1OfInteger, allResults: IGESBasic_HArray1OfHArray1OfReal): void;

  SetFormNumber(form: number): void;

  Note(): IGESDimen_GeneralNote;

  SubCaseNumber(): number;

  Time(): number;

  NbResultValues(): number;

  ResultReportFlag(): number;

  NbElements(): number;

  ElementIdentifier(Index: number): number;

  Element(Index: number): IGESAppli_FiniteElement;

  ElementTopologyType(Index: number): number;

  NbLayers(Index: number): number;

  DataLayerFlag(Index: number): number;

  NbResultDataLocs(Index: number): number;

  ResultDataLoc(NElem: number, NLoc: number): number;

  NbResults(Index: number): number;

  ResultData(NElem: number, num: number): number;
  ResultData(NElem: number, NVal: number, NLay: number, NLoc: number): number;
  ResultData(NElem: number, num: number): number;
  ResultData(NElem: number, NVal: number, NLay: number, NLoc: number): number;

  ResultRank(NElem: number, NVal: number, NLay: number, NLoc: number): number;

  ResultList(NElem: number): NCollection_HArray1_double;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_FiniteElement: declare class IGESAppli_FiniteElement extends IGESData_IGESEntity

  constructor

  Init(aType: number, allNodes: NCollection_HArray1_handle_IGESAppli_Node, aName: TCollection_HAsciiString): void;

  Topology(): number;

  NbNodes(): number;

  Node(Index: number): IGESAppli_Node;

  Name(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_Flow: declare class IGESAppli_Flow extends IGESData_IGESEntity

  constructor

  Init(nbContextFlags: number, aFlowType: number, aFuncFlag: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  OwnCorrect(): boolean;

  NbContextFlags(): number;

  NbFlowAssociativities(): number;

  NbConnectPoints(): number;

  NbJoins(): number;

  NbFlowNames(): number;

  NbTextDisplayTemplates(): number;

  NbContFlowAssociativities(): number;

  TypeOfFlow(): number;

  FunctionFlag(): number;

  FlowAssociativity(Index: number): IGESData_IGESEntity;

  ConnectPoint(Index: number): IGESDraw_ConnectPoint;

  Join(Index: number): IGESData_IGESEntity;

  FlowName(Index: number): TCollection_HAsciiString;

  TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

  ContFlowAssociativity(Index: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_FlowLineSpec: declare class IGESAppli_FlowLineSpec extends IGESData_IGESEntity

  constructor

  Init(allProperties: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  FlowLineName(): TCollection_HAsciiString;

  Modifier(Index: number): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_GeneralModule: declare class IGESAppli_GeneralModule extends IGESData_GeneralModule

  constructor

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_LevelFunction: declare class IGESAppli_LevelFunction extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aCode: number, aFuncDescrip: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  FuncDescriptionCode(): number;

  FuncDescription(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_LevelToPWBLayerMap: declare class IGESAppli_LevelToPWBLayerMap extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, allExchLevels: NCollection_HArray1_int, allNativeLevels: NCollection_HArray1_handle_TCollection_HAsciiString, allPhysLevels: NCollection_HArray1_int, allExchIdents: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  NbLevelToLayerDefs(): number;

  ExchangeFileLevelNumber(Index: number): number;

  NativeLevel(Index: number): TCollection_HAsciiString;

  PhysicalLayerNumber(Index: number): number;

  ExchangeFileLevelIdent(Index: number): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_LineWidening: declare class IGESAppli_LineWidening extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aWidth: number, aCornering: number, aExtnFlag: number, aJustifFlag: number, aExtnVal: number): void;

  NbPropertyValues(): number;

  WidthOfMetalization(): number;

  CorneringCode(): number;

  ExtensionFlag(): number;

  JustificationFlag(): number;

  ExtensionValue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_NodalConstraint: declare class IGESAppli_NodalConstraint extends IGESData_IGESEntity

  constructor

  Init(aType: number, aNode: IGESAppli_Node, allTabData: NCollection_HArray1_handle_IGESDefs_TabularData): void;

  NbCases(): number;

  Type(): number;

  NodeEntity(): IGESAppli_Node;

  TabularData(Index: number): IGESDefs_TabularData;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_NodalDisplAndRot: declare class IGESAppli_NodalDisplAndRot extends IGESData_IGESEntity

  constructor

  Init(allNotes: NCollection_HArray1_handle_IGESDimen_GeneralNote, allIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allRotParams: IGESBasic_HArray1OfHArray1OfXYZ, allTransParams: IGESBasic_HArray1OfHArray1OfXYZ): void;

  NbCases(): number;

  NbNodes(): number;

  Note(Index: number): IGESDimen_GeneralNote;

  NodeIdentifier(Index: number): number;

  Node(Index: number): IGESAppli_Node;

  TranslationParameter(NodeNum: number, CaseNum: number): gp_XYZ;

  RotationalParameter(NodeNum: number, CaseNum: number): gp_XYZ;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_NodalResults: declare class IGESAppli_NodalResults extends IGESData_IGESEntity

  constructor

  Init(aNote: IGESDimen_GeneralNote, aNumber: number, aTime: number, allNodeIdentifiers: NCollection_HArray1_int, allNodes: NCollection_HArray1_handle_IGESAppli_Node, allData: NCollection_HArray2_double): void;

  SetFormNumber(form: number): void;

  Note(): IGESDimen_GeneralNote;

  SubCaseNumber(): number;

  Time(): number;

  NbData(): number;

  NbNodes(): number;

  NodeIdentifier(Index: number): number;

  Node(Index: number): IGESAppli_Node;

  Data(NodeNum: number, DataNum: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_Node: declare class IGESAppli_Node extends IGESData_IGESEntity

  constructor

  Init(aCoord: gp_XYZ, aCoordSystem: IGESGeom_TransformationMatrix): void;

  Coord(): gp_Pnt;

  System(): IGESData_TransfEntity;

  SystemType(): number;

  TransformedNodalCoord(): gp_Pnt;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_PWBArtworkStackup: declare class IGESAppli_PWBArtworkStackup extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, anArtIdent: TCollection_HAsciiString, allLevelNums: NCollection_HArray1_int): void;

  NbPropertyValues(): number;

  Identification(): TCollection_HAsciiString;

  NbLevelNumbers(): number;

  LevelNumber(Index: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_PWBDrilledHole: declare class IGESAppli_PWBDrilledHole extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aDrillDia: number, aFinishDia: number, aCode: number): void;

  NbPropertyValues(): number;

  DrillDiameterSize(): number;

  FinishDiameterSize(): number;

  FunctionCode(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_PartNumber: declare class IGESAppli_PartNumber extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aGenName: TCollection_HAsciiString, aMilName: TCollection_HAsciiString, aVendName: TCollection_HAsciiString, anIntName: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  GenericNumber(): TCollection_HAsciiString;

  MilitaryNumber(): TCollection_HAsciiString;

  VendorNumber(): TCollection_HAsciiString;

  InternalNumber(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_PinNumber: declare class IGESAppli_PinNumber extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aValue: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  PinNumberVal(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_PipingFlow: declare class IGESAppli_PipingFlow extends IGESData_IGESEntity

  constructor

  Init(nbContextFlags: number, aFlowType: number, allFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity, allConnectPoints: NCollection_HArray1_handle_IGESDraw_ConnectPoint, allJoins: NCollection_HArray1_handle_IGESData_IGESEntity, allFlowNames: NCollection_HArray1_handle_TCollection_HAsciiString, allTextDisps: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate, allContFlowAssocs: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  OwnCorrect(): boolean;

  NbContextFlags(): number;

  NbFlowAssociativities(): number;

  NbConnectPoints(): number;

  NbJoins(): number;

  NbFlowNames(): number;

  NbTextDisplayTemplates(): number;

  NbContFlowAssociativities(): number;

  TypeOfFlow(): number;

  FlowAssociativity(Index: number): IGESData_IGESEntity;

  ConnectPoint(Index: number): IGESDraw_ConnectPoint;

  Join(Index: number): IGESData_IGESEntity;

  FlowName(Index: number): TCollection_HAsciiString;

  TextDisplayTemplate(Index: number): IGESGraph_TextDisplayTemplate;

  ContFlowAssociativity(Index: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_Protocol: declare class IGESAppli_Protocol extends IGESData_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ReadWriteModule: declare class IGESAppli_ReadWriteModule extends IGESData_ReadWriteModule

  constructor

  CaseIGES(typenum: number, formnum: number): number;

  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ReferenceDesignator: declare class IGESAppli_ReferenceDesignator extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aText: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  RefDesignatorText(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_RegionRestriction: declare class IGESAppli_RegionRestriction extends IGESData_IGESEntity

  constructor

  Init(nbPropVal: number, aViasRest: number, aCompoRest: number, aCktRest: number): void;

  NbPropertyValues(): number;

  ElectricalViasRestriction(): number;

  ElectricalComponentRestriction(): number;

  ElectricalCktRestriction(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_SpecificModule: declare class IGESAppli_SpecificModule extends IGESData_SpecificModule

  constructor

  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolDrilledHole: declare class IGESAppli_ToolDrilledHole

  constructor

  WriteOwnParams(ent: IGESAppli_DrilledHole, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESAppli_DrilledHole): boolean;

  DirChecker(ent: IGESAppli_DrilledHole): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_DrilledHole, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_DrilledHole, entto: IGESAppli_DrilledHole, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolElementResults: declare class IGESAppli_ToolElementResults

  constructor

  WriteOwnParams(ent: IGESAppli_ElementResults, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_ElementResults): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_ElementResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_ElementResults, entto: IGESAppli_ElementResults, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolFiniteElement: declare class IGESAppli_ToolFiniteElement

  constructor

  WriteOwnParams(ent: IGESAppli_FiniteElement, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_FiniteElement): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_FiniteElement, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_FiniteElement, entto: IGESAppli_FiniteElement, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolFlow: declare class IGESAppli_ToolFlow

  constructor

  WriteOwnParams(ent: IGESAppli_Flow, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESAppli_Flow): boolean;

  DirChecker(ent: IGESAppli_Flow): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_Flow, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_Flow, entto: IGESAppli_Flow, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolFlowLineSpec: declare class IGESAppli_ToolFlowLineSpec

  constructor

  WriteOwnParams(ent: IGESAppli_FlowLineSpec, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_FlowLineSpec): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_FlowLineSpec, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_FlowLineSpec, entto: IGESAppli_FlowLineSpec, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolLevelFunction: declare class IGESAppli_ToolLevelFunction

  constructor

  WriteOwnParams(ent: IGESAppli_LevelFunction, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESAppli_LevelFunction): boolean;

  DirChecker(ent: IGESAppli_LevelFunction): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_LevelFunction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_LevelFunction, entto: IGESAppli_LevelFunction, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolLevelToPWBLayerMap: declare class IGESAppli_ToolLevelToPWBLayerMap

  constructor

  WriteOwnParams(ent: IGESAppli_LevelToPWBLayerMap, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_LevelToPWBLayerMap): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_LevelToPWBLayerMap, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_LevelToPWBLayerMap, entto: IGESAppli_LevelToPWBLayerMap, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolLineWidening: declare class IGESAppli_ToolLineWidening

  constructor

  WriteOwnParams(ent: IGESAppli_LineWidening, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESAppli_LineWidening): boolean;

  DirChecker(ent: IGESAppli_LineWidening): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_LineWidening, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_LineWidening, entto: IGESAppli_LineWidening, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolNodalConstraint: declare class IGESAppli_ToolNodalConstraint

  constructor

  WriteOwnParams(ent: IGESAppli_NodalConstraint, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_NodalConstraint): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_NodalConstraint, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_NodalConstraint, entto: IGESAppli_NodalConstraint, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolNodalDisplAndRot: declare class IGESAppli_ToolNodalDisplAndRot

  constructor

  WriteOwnParams(ent: IGESAppli_NodalDisplAndRot, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_NodalDisplAndRot): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_NodalDisplAndRot, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_NodalDisplAndRot, entto: IGESAppli_NodalDisplAndRot, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolNodalResults: declare class IGESAppli_ToolNodalResults

  constructor

  WriteOwnParams(ent: IGESAppli_NodalResults, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_NodalResults): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_NodalResults, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_NodalResults, entto: IGESAppli_NodalResults, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolNode: declare class IGESAppli_ToolNode

  constructor

  WriteOwnParams(ent: IGESAppli_Node, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_Node): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_Node, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_Node, entto: IGESAppli_Node, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESAppli_ToolPWBArtworkStackup: declare class IGESAppli_ToolPWBArtworkStackup

  constructor

  WriteOwnParams(ent: IGESAppli_PWBArtworkStackup, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESAppli_PWBArtworkStackup): IGESData_DirChecker;

  OwnCheck(ent: IGESAppli_PWBArtworkStackup, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESAppli_PWBArtworkStackup, entto: IGESAppli_PWBArtworkStackup, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;
