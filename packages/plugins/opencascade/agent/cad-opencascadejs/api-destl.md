# libcascade — DESTL

2 top-level symbols. Signatures are verbatim typescript.

DESTL_ConfigurationNode: declare class DESTL_ConfigurationNode extends Standard_Transient

  constructor

  InternalParameters: DESTL_ConfigurationNode_RWStl_InternalSection

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Save(): TCollection_AsciiString;
  Save(theResourcePath: TCollection_AsciiString): boolean;
  Save(): TCollection_AsciiString;
  Save(theResourcePath: TCollection_AsciiString): boolean;

  IsImportSupported(): boolean;

  IsExportSupported(): boolean;

  IsStreamSupported(): boolean;

  GetFormat(): TCollection_AsciiString;

  GetVendor(): TCollection_AsciiString;

  GetExtensions(): NCollection_List_TCollection_AsciiString;

  CheckContent(theBuffer: NCollection_Buffer): boolean;

  delete(): void;

  [Symbol.dispose](): void;

DESTL_ConfigurationNode_RWStl_InternalSection: interface DESTL_ConfigurationNode_RWStl_InternalSection

  ReadMergeAngle: number

  ReadBRep: boolean

  WriteAscii: boolean
