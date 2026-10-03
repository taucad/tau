# libcascade — FSD

3 top-level symbols. Signatures are verbatim typescript.

FSD_Base64: declare class FSD_Base64

  // FSD_Base64.constructor (constructor)
  constructor();

  // FSD_Base64.Encode (method)
  static Encode(theEncodedStr: string, theStrLen: number, theData: number, theDataLen: number): number;
  static Encode(theData: number, theDataLen: number): TCollection_AsciiString;

  // FSD_Base64.Decode (method)
  static Decode(theDecodedData: number, theDataLen: number, theEncodedStr: string, theStrLen: number): number;
  static Decode(theStr: string, theLen: number): NCollection_Buffer;

  // FSD_Base64.delete (method)
  delete(): void;

  // FSD_Base64.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FSD_CmpFile: declare class FSD_CmpFile extends Standard_Transient

  // FSD_CmpFile.constructor (constructor)
  constructor();

  // FSD_CmpFile.get_type_name (method)
  static get_type_name(): string;

  // FSD_CmpFile.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FSD_CmpFile.DynamicType (method)
  DynamicType(): Standard_Type;

  // FSD_CmpFile.Open (method)
  Open(aName: TCollection_AsciiString, aMode: Storage_OpenMode): Storage_Error;

  // FSD_CmpFile.IsGoodFileType (method)
  static IsGoodFileType(aName: TCollection_AsciiString): Storage_Error;

  // FSD_CmpFile.BeginWriteInfoSection (method)
  BeginWriteInfoSection(): Storage_Error;

  // FSD_CmpFile.BeginReadInfoSection (method)
  BeginReadInfoSection(): Storage_Error;

  // FSD_CmpFile.WritePersistentObjectHeader (method)
  WritePersistentObjectHeader(aRef: number, aType: number): void;

  // FSD_CmpFile.BeginWritePersistentObjectData (method)
  BeginWritePersistentObjectData(): void;

  // FSD_CmpFile.BeginWriteObjectData (method)
  BeginWriteObjectData(): void;

  // FSD_CmpFile.EndWriteObjectData (method)
  EndWriteObjectData(): void;

  // FSD_CmpFile.EndWritePersistentObjectData (method)
  EndWritePersistentObjectData(): void;

  // FSD_CmpFile.ReadPersistentObjectHeader (method)
  ReadPersistentObjectHeader(aRef: number, aType: number): { aRef: number; aType: number };

  // FSD_CmpFile.BeginReadPersistentObjectData (method)
  BeginReadPersistentObjectData(): void;

  // FSD_CmpFile.BeginReadObjectData (method)
  BeginReadObjectData(): void;

  // FSD_CmpFile.EndReadObjectData (method)
  EndReadObjectData(): void;

  // FSD_CmpFile.EndReadPersistentObjectData (method)
  EndReadPersistentObjectData(): void;

  // FSD_CmpFile.Destroy (method)
  Destroy(): void;

  // FSD_CmpFile.MagicNumber (method)
  static MagicNumber(): string;

  // FSD_CmpFile.delete (method)
  delete(): void;

  // FSD_CmpFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FSD_FileHeader: declare class FSD_FileHeader

  // FSD_FileHeader.constructor (constructor)
  constructor();

  testindian: number

  binfo: number

  einfo: number

  bcomment: number

  ecomment: number

  btype: number

  etype: number

  broot: number

  eroot: number

  bref: number

  eref: number

  bdata: number

  edata: number

  // FSD_FileHeader.delete (method)
  delete(): void;

  // FSD_FileHeader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
