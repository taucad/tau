# libcascade — LDOM

22 top-level symbols. Signatures are verbatim typescript.

LDOM_Attr: declare class LDOM_Attr extends LDOM_Node

  constructor

  getName(): LDOMString;

  getValue(): LDOMString;

  setValue(aValue: LDOMString): void;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_BasicAttribute: declare class LDOM_BasicAttribute extends LDOM_BasicNode

  constructor

  GetName(): string;

  GetValue(): LDOMBasicString;

  SetValue(aValue: LDOMBasicString, aDoc: LDOM_MemManager): void;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_BasicElement: declare class LDOM_BasicElement extends LDOM_BasicNode

  constructor

  static Create(aName: string, aLength: number, aDoc: LDOM_MemManager): LDOM_BasicElement;

  GetTagName(): string;

  GetFirstChild(): LDOM_BasicNode;

  GetLastChild(): LDOM_BasicNode;

  GetAttribute(aName: LDOMBasicString, aLastCh: LDOM_BasicNode): LDOM_BasicAttribute;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_BasicNode: declare class LDOM_BasicNode

  isNull(): boolean;

  getNodeType(): LDOM_Node_NodeType;

  GetSibling(): LDOM_BasicNode;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_BasicText: declare class LDOM_BasicText extends LDOM_BasicNode

  constructor

  GetData(): LDOMBasicString;

  SetData(aValue: LDOMBasicString, aDoc: LDOM_MemManager): void;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_CDATASection: declare class LDOM_CDATASection extends LDOM_Text

  constructor

  delete(): void;

  [Symbol.dispose](): void;

LDOM_CharReference: declare class LDOM_CharReference

  constructor

  static Decode(theSrc: string, theLen: number): string;

  static Encode(theSrc: string, theLen: number, isAttribute: boolean): string;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_CharacterData: declare class LDOM_CharacterData extends LDOM_Node

  constructor

  getData(): LDOMString;

  setData(aValue: LDOMString): void;

  getLength(): number;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Comment: declare class LDOM_Comment extends LDOM_CharacterData

  constructor

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Document: declare class LDOM_Document

  constructor

  static createDocument(theQualifiedName: LDOMString): LDOM_Document;

  createElement(theTagName: LDOMString): LDOM_Element;

  createCDATASection(theData: LDOMString): LDOM_CDATASection;

  createComment(theData: LDOMString): LDOM_Comment;

  createTextNode(theData: LDOMString): LDOM_Text;

  getDocumentElement(): LDOM_Element;

  getElementsByTagName(theTagName: LDOMString): LDOM_NodeList;

  isNull(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_DocumentType: declare class LDOM_DocumentType

  constructor

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Element: declare class LDOM_Element extends LDOM_Node

  constructor

  getTagName(): LDOMString;

  getAttribute(aName: LDOMString): LDOMString;

  getAttributeNode(aName: LDOMString): LDOM_Attr;

  getElementsByTagName(aName: LDOMString): LDOM_NodeList;

  setAttribute(aName: LDOMString, aValue: LDOMString): void;

  setAttributeNode(aNewAttr: LDOM_Attr): void;

  removeAttribute(aName: LDOMString): void;

  GetChildByTagName(aTagName: LDOMString): LDOM_Element;

  GetSiblingByTagName(): LDOM_Element;

  ReplaceElement(anOther: LDOM_Element): void;

  GetAttributesList(): LDOM_NodeList;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_LDOMImplementation: declare class LDOM_LDOMImplementation

  constructor

  static createDocument(aNamespaceURI: LDOMString, aQualifiedName: LDOMString, aDocType: LDOM_DocumentType): LDOM_Document;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_MemManager: declare class LDOM_MemManager extends Standard_Transient

  constructor

  HashedAllocate(aString: string, theLen: number, theHash: number): string;
  HashedAllocate(aString: string, theLen: number, theResult: LDOMBasicString): void;
  HashedAllocate(aString: string, theLen: number, theHash: number): string;
  HashedAllocate(aString: string, theLen: number, theResult: LDOMBasicString): void;

  static Hash(theString: string, theLen: number): number;

  static CompareStrings(theString: string, theHashValue: number, theHashedStr: string): boolean;

  RootElement(): LDOM_BasicElement;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Node: declare class LDOM_Node

  constructor

  isNull(): boolean;

  getNodeType(): LDOM_Node_NodeType;

  getNodeName(): LDOMString;

  getNodeValue(): LDOMString;

  getFirstChild(): LDOM_Node;

  getLastChild(): LDOM_Node;

  getNextSibling(): LDOM_Node;

  removeChild(aChild: LDOM_Node): void;

  appendChild(aChild: LDOM_Node): void;

  hasChildNodes(): boolean;

  SetValueClear(): void;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Node_NodeType: typeof LDOM_Node_NodeType[keyof typeof LDOM_Node_NodeType]

LDOM_NodeList: declare class LDOM_NodeList

  constructor

  item(argNo0: number): LDOM_Node;

  getLength(): number;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_OSStream: declare class LDOM_OSStream

  constructor

  str(): string;

  Length(): number;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_OSStream_BOMType: typeof LDOM_OSStream_BOMType[keyof typeof LDOM_OSStream_BOMType]

LDOM_SBuffer: declare class LDOM_SBuffer

  constructor

  str(): string;

  Length(): number;

  Clear(): void;

  overflow(c?: number): number;

  underflow(): number;

  xsputn(s: string, n: number): number;

  delete(): void;

  [Symbol.dispose](): void;

LDOM_Text: declare class LDOM_Text extends LDOM_CharacterData

  constructor

  delete(): void;

  [Symbol.dispose](): void;

LDOM_XmlWriter: declare class LDOM_XmlWriter

  constructor

  SetIndentation(theIndent: number): void;

  delete(): void;

  [Symbol.dispose](): void;
