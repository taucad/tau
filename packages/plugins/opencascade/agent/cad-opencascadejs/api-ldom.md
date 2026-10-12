# libcascade — LDOM

22 top-level symbols. Signatures are verbatim typescript.

LDOM_Attr: declare class LDOM_Attr extends LDOM_Node

  // LDOM_Attr.constructor (constructor)
  constructor();
  constructor(anOther: LDOM_Attr);

  // LDOM_Attr.getName (method)
  getName(): LDOMString;

  // LDOM_Attr.getValue (method)
  getValue(): LDOMString;

  // LDOM_Attr.setValue (method)
  setValue(aValue: LDOMString): void;

  // LDOM_Attr.delete (method)
  delete(): void;

  // LDOM_Attr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_BasicAttribute: declare class LDOM_BasicAttribute extends LDOM_BasicNode

  // LDOM_BasicAttribute.constructor (constructor)
  constructor();

  // LDOM_BasicAttribute.GetName (method)
  GetName(): string;

  // LDOM_BasicAttribute.GetValue (method)
  GetValue(): LDOMBasicString;

  // LDOM_BasicAttribute.SetValue (method)
  SetValue(aValue: LDOMBasicString, aDoc: LDOM_MemManager): void;

  // LDOM_BasicAttribute.delete (method)
  delete(): void;

  // LDOM_BasicAttribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_BasicElement: declare class LDOM_BasicElement extends LDOM_BasicNode

  // LDOM_BasicElement.constructor (constructor)
  constructor();

  // LDOM_BasicElement.Create (method)
  static Create(aName: string, aLength: number, aDoc: LDOM_MemManager): LDOM_BasicElement;

  // LDOM_BasicElement.GetTagName (method)
  GetTagName(): string;

  // LDOM_BasicElement.GetFirstChild (method)
  GetFirstChild(): LDOM_BasicNode;

  // LDOM_BasicElement.GetLastChild (method)
  GetLastChild(): LDOM_BasicNode;

  // LDOM_BasicElement.GetAttribute (method)
  GetAttribute(aName: LDOMBasicString, aLastCh: LDOM_BasicNode): LDOM_BasicAttribute;

  // LDOM_BasicElement.delete (method)
  delete(): void;

  // LDOM_BasicElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_BasicNode: declare class LDOM_BasicNode

  // LDOM_BasicNode.isNull (method)
  isNull(): boolean;

  // LDOM_BasicNode.getNodeType (method)
  getNodeType(): LDOM_Node_NodeType;

  // LDOM_BasicNode.GetSibling (method)
  GetSibling(): LDOM_BasicNode;

  // LDOM_BasicNode.delete (method)
  delete(): void;

  // LDOM_BasicNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_BasicText: declare class LDOM_BasicText extends LDOM_BasicNode

  // LDOM_BasicText.constructor (constructor)
  constructor();

  // LDOM_BasicText.GetData (method)
  GetData(): LDOMBasicString;

  // LDOM_BasicText.SetData (method)
  SetData(aValue: LDOMBasicString, aDoc: LDOM_MemManager): void;

  // LDOM_BasicText.delete (method)
  delete(): void;

  // LDOM_BasicText.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_CDATASection: declare class LDOM_CDATASection extends LDOM_Text

  // LDOM_CDATASection.constructor (constructor)
  constructor();
  constructor(theOther: LDOM_CDATASection);

  // LDOM_CDATASection.delete (method)
  delete(): void;

  // LDOM_CDATASection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_CharReference: declare class LDOM_CharReference

  // LDOM_CharReference.constructor (constructor)
  constructor();

  // LDOM_CharReference.Decode (method)
  static Decode(theSrc: string, theLen: number): string;

  // LDOM_CharReference.Encode (method)
  static Encode(theSrc: string, theLen: number, isAttribute: boolean): string;

  // LDOM_CharReference.delete (method)
  delete(): void;

  // LDOM_CharReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_CharacterData: declare class LDOM_CharacterData extends LDOM_Node

  // LDOM_CharacterData.constructor (constructor)
  constructor();
  constructor(theOther: LDOM_CharacterData);

  // LDOM_CharacterData.getData (method)
  getData(): LDOMString;

  // LDOM_CharacterData.setData (method)
  setData(aValue: LDOMString): void;

  // LDOM_CharacterData.getLength (method)
  getLength(): number;

  // LDOM_CharacterData.delete (method)
  delete(): void;

  // LDOM_CharacterData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Comment: declare class LDOM_Comment extends LDOM_CharacterData

  // LDOM_Comment.constructor (constructor)
  constructor();
  constructor(theOther: LDOM_Comment);

  // LDOM_Comment.delete (method)
  delete(): void;

  // LDOM_Comment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Document: declare class LDOM_Document

  // LDOM_Document.constructor (constructor)
  constructor();
  constructor(aMemManager: LDOM_MemManager);

  // LDOM_Document.createDocument (method)
  static createDocument(theQualifiedName: LDOMString): LDOM_Document;

  // LDOM_Document.createElement (method)
  createElement(theTagName: LDOMString): LDOM_Element;

  // LDOM_Document.createCDATASection (method)
  createCDATASection(theData: LDOMString): LDOM_CDATASection;

  // LDOM_Document.createComment (method)
  createComment(theData: LDOMString): LDOM_Comment;

  // LDOM_Document.createTextNode (method)
  createTextNode(theData: LDOMString): LDOM_Text;

  // LDOM_Document.getDocumentElement (method)
  getDocumentElement(): LDOM_Element;

  // LDOM_Document.getElementsByTagName (method)
  getElementsByTagName(theTagName: LDOMString): LDOM_NodeList;

  // LDOM_Document.isNull (method)
  isNull(): boolean;

  // LDOM_Document.delete (method)
  delete(): void;

  // LDOM_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_DocumentType: declare class LDOM_DocumentType

  // LDOM_DocumentType.constructor (constructor)
  constructor();

  // LDOM_DocumentType.delete (method)
  delete(): void;

  // LDOM_DocumentType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Element: declare class LDOM_Element extends LDOM_Node

  // LDOM_Element.constructor (constructor)
  constructor();
  constructor(anOther: LDOM_Element);

  // LDOM_Element.getTagName (method)
  getTagName(): LDOMString;

  // LDOM_Element.getAttribute (method)
  getAttribute(aName: LDOMString): LDOMString;

  // LDOM_Element.getAttributeNode (method)
  getAttributeNode(aName: LDOMString): LDOM_Attr;

  // LDOM_Element.getElementsByTagName (method)
  getElementsByTagName(aName: LDOMString): LDOM_NodeList;

  // LDOM_Element.setAttribute (method)
  setAttribute(aName: LDOMString, aValue: LDOMString): void;

  // LDOM_Element.setAttributeNode (method)
  setAttributeNode(aNewAttr: LDOM_Attr): void;

  // LDOM_Element.removeAttribute (method)
  removeAttribute(aName: LDOMString): void;

  // LDOM_Element.GetChildByTagName (method)
  GetChildByTagName(aTagName: LDOMString): LDOM_Element;

  // LDOM_Element.GetSiblingByTagName (method)
  GetSiblingByTagName(): LDOM_Element;

  // LDOM_Element.ReplaceElement (method)
  ReplaceElement(anOther: LDOM_Element): void;

  // LDOM_Element.GetAttributesList (method)
  GetAttributesList(): LDOM_NodeList;

  // LDOM_Element.delete (method)
  delete(): void;

  // LDOM_Element.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_LDOMImplementation: declare class LDOM_LDOMImplementation

  // LDOM_LDOMImplementation.constructor (constructor)
  constructor();

  // LDOM_LDOMImplementation.createDocument (method)
  static createDocument(aNamespaceURI: LDOMString, aQualifiedName: LDOMString, aDocType: LDOM_DocumentType): LDOM_Document;

  // LDOM_LDOMImplementation.delete (method)
  delete(): void;

  // LDOM_LDOMImplementation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_MemManager: declare class LDOM_MemManager extends Standard_Transient

  // LDOM_MemManager.constructor (constructor)
  constructor(aBlockSize: number);

  // LDOM_MemManager.HashedAllocate (method)
  HashedAllocate(aString: string, theLen: number, theHash: number): string;
  HashedAllocate(aString: string, theLen: number, theResult: LDOMBasicString): void;

  // LDOM_MemManager.Hash (method)
  static Hash(theString: string, theLen: number): number;

  // LDOM_MemManager.CompareStrings (method)
  static CompareStrings(theString: string, theHashValue: number, theHashedStr: string): boolean;

  // LDOM_MemManager.RootElement (method)
  RootElement(): LDOM_BasicElement;

  // LDOM_MemManager.get_type_name (method)
  static get_type_name(): string;

  // LDOM_MemManager.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // LDOM_MemManager.DynamicType (method)
  DynamicType(): Standard_Type;

  // LDOM_MemManager.delete (method)
  delete(): void;

  // LDOM_MemManager.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Node: declare class LDOM_Node

  // LDOM_Node.constructor (constructor)
  constructor();
  constructor(anOther: LDOM_Node);

  // LDOM_Node.isNull (method)
  isNull(): boolean;

  // LDOM_Node.getNodeType (method)
  getNodeType(): LDOM_Node_NodeType;

  // LDOM_Node.getNodeName (method)
  getNodeName(): LDOMString;

  // LDOM_Node.getNodeValue (method)
  getNodeValue(): LDOMString;

  // LDOM_Node.getFirstChild (method)
  getFirstChild(): LDOM_Node;

  // LDOM_Node.getLastChild (method)
  getLastChild(): LDOM_Node;

  // LDOM_Node.getNextSibling (method)
  getNextSibling(): LDOM_Node;

  // LDOM_Node.removeChild (method)
  removeChild(aChild: LDOM_Node): void;

  // LDOM_Node.appendChild (method)
  appendChild(aChild: LDOM_Node): void;

  // LDOM_Node.hasChildNodes (method)
  hasChildNodes(): boolean;

  // LDOM_Node.SetValueClear (method)
  SetValueClear(): void;

  // LDOM_Node.delete (method)
  delete(): void;

  // LDOM_Node.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Node_NodeType: typeof LDOM_Node_NodeType[keyof typeof LDOM_Node_NodeType]

  readonly UNKNOWN: 'UNKNOWN'

  readonly ELEMENT_NODE: 'ELEMENT_NODE'

  readonly ATTRIBUTE_NODE: 'ATTRIBUTE_NODE'

  readonly TEXT_NODE: 'TEXT_NODE'

  readonly CDATA_SECTION_NODE: 'CDATA_SECTION_NODE'

  readonly COMMENT_NODE: 'COMMENT_NODE'

LDOM_NodeList: declare class LDOM_NodeList

  // LDOM_NodeList.constructor (constructor)
  constructor();
  constructor(theOther: LDOM_NodeList);

  // LDOM_NodeList.item (method)
  item(argNo0: number): LDOM_Node;

  // LDOM_NodeList.getLength (method)
  getLength(): number;

  // LDOM_NodeList.delete (method)
  delete(): void;

  // LDOM_NodeList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_OSStream: declare class LDOM_OSStream

  // LDOM_OSStream.constructor (constructor)
  constructor(theMaxBuf: number);

  // LDOM_OSStream.str (method)
  str(): string;

  // LDOM_OSStream.Length (method)
  Length(): number;

  // LDOM_OSStream.Clear (method)
  Clear(): void;

  // LDOM_OSStream.delete (method)
  delete(): void;

  // LDOM_OSStream.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_OSStream_BOMType: typeof LDOM_OSStream_BOMType[keyof typeof LDOM_OSStream_BOMType]

  readonly BOM_UNDEFINED: 'BOM_UNDEFINED'

  readonly BOM_UTF8: 'BOM_UTF8'

  readonly BOM_UTF16BE: 'BOM_UTF16BE'

  readonly BOM_UTF16LE: 'BOM_UTF16LE'

  readonly BOM_UTF32BE: 'BOM_UTF32BE'

  readonly BOM_UTF32LE: 'BOM_UTF32LE'

  readonly BOM_UTF7: 'BOM_UTF7'

  readonly BOM_UTF1: 'BOM_UTF1'

  readonly BOM_UTFEBCDIC: 'BOM_UTFEBCDIC'

  readonly BOM_SCSU: 'BOM_SCSU'

  readonly BOM_BOCU1: 'BOM_BOCU1'

  readonly BOM_GB18030: 'BOM_GB18030'

LDOM_SBuffer: declare class LDOM_SBuffer

  // LDOM_SBuffer.constructor (constructor)
  constructor(theMaxBuf: number);

  // LDOM_SBuffer.str (method)
  str(): string;

  // LDOM_SBuffer.Length (method)
  Length(): number;

  // LDOM_SBuffer.Clear (method)
  Clear(): void;

  // LDOM_SBuffer.overflow (method)
  overflow(c?: number): number;

  // LDOM_SBuffer.underflow (method)
  underflow(): number;

  // LDOM_SBuffer.xsputn (method)
  xsputn(s: string, n: number): number;

  // LDOM_SBuffer.delete (method)
  delete(): void;

  // LDOM_SBuffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_Text: declare class LDOM_Text extends LDOM_CharacterData

  // LDOM_Text.constructor (constructor)
  constructor();
  constructor(anOther: LDOM_Text);

  // LDOM_Text.delete (method)
  delete(): void;

  // LDOM_Text.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOM_XmlWriter: declare class LDOM_XmlWriter

  // LDOM_XmlWriter.constructor (constructor)
  constructor(theEncoding?: string);

  // LDOM_XmlWriter.SetIndentation (method)
  SetIndentation(theIndent: number): void;

  // LDOM_XmlWriter.delete (method)
  delete(): void;

  // LDOM_XmlWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
