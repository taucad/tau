# libcascade — DESTL

2 top-level symbols. Signatures are verbatim typescript.

DESTL_ConfigurationNode: declare class DESTL_ConfigurationNode extends Standard_Transient

  // DESTL_ConfigurationNode.constructor (constructor)
  constructor();
  constructor(theNode: DESTL_ConfigurationNode);

  InternalParameters: DESTL_ConfigurationNode_RWStl_InternalSection

  // DESTL_ConfigurationNode.get_type_name (method)
  static get_type_name(): string;

  // DESTL_ConfigurationNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // DESTL_ConfigurationNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // DESTL_ConfigurationNode.Save (method)
  Save(): TCollection_AsciiString;
  Save(theResourcePath: TCollection_AsciiString): boolean;

  // DESTL_ConfigurationNode.IsImportSupported (method)
  IsImportSupported(): boolean;

  // DESTL_ConfigurationNode.IsExportSupported (method)
  IsExportSupported(): boolean;

  // DESTL_ConfigurationNode.IsStreamSupported (method)
  IsStreamSupported(): boolean;

  // DESTL_ConfigurationNode.GetFormat (method)
  GetFormat(): TCollection_AsciiString;

  // DESTL_ConfigurationNode.GetVendor (method)
  GetVendor(): TCollection_AsciiString;

  // DESTL_ConfigurationNode.GetExtensions (method)
  GetExtensions(): NCollection_List_TCollection_AsciiString;

  // DESTL_ConfigurationNode.CheckContent (method)
  CheckContent(theBuffer: NCollection_Buffer): boolean;

  // DESTL_ConfigurationNode.delete (method)
  delete(): void;

  // DESTL_ConfigurationNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

DESTL_ConfigurationNode_RWStl_InternalSection: interface DESTL_ConfigurationNode_RWStl_InternalSection

  ReadMergeAngle: number

  ReadBRep: boolean

  WriteAscii: boolean
