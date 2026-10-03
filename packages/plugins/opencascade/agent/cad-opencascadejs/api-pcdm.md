# libcascade — PCDM

17 top-level symbols. Signatures are verbatim typescript.

PCDM: declare class PCDM

  // PCDM.constructor (constructor)
  constructor();

  // PCDM.delete (method)
  delete(): void;

  // PCDM.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_DOMHeaderParser: declare class PCDM_DOMHeaderParser extends LDOMParser

  // PCDM_DOMHeaderParser.constructor (constructor)
  constructor();

  // PCDM_DOMHeaderParser.SetStartElementName (method)
  SetStartElementName(aStartElementName: TCollection_AsciiString): void;

  // PCDM_DOMHeaderParser.SetEndElementName (method)
  SetEndElementName(anEndElementName: TCollection_AsciiString): void;

  // PCDM_DOMHeaderParser.startElement (method)
  startElement(): boolean;

  // PCDM_DOMHeaderParser.endElement (method)
  endElement(): boolean;

  // PCDM_DOMHeaderParser.GetElement (method)
  GetElement(): LDOM_Element;

  // PCDM_DOMHeaderParser.delete (method)
  delete(): void;

  // PCDM_DOMHeaderParser.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_Document: declare class PCDM_Document extends Standard_Persistent

  // PCDM_Document.constructor (constructor)
  constructor();

  // PCDM_Document.get_type_name (method)
  static get_type_name(): string;

  // PCDM_Document.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_Document.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_Document.delete (method)
  delete(): void;

  // PCDM_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_DriverError: declare class PCDM_DriverError extends Standard_Failure

  // PCDM_DriverError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // PCDM_DriverError.ExceptionType (method)
  ExceptionType(): string;

  // PCDM_DriverError.delete (method)
  delete(): void;

  // PCDM_DriverError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_ReadWriter: declare class PCDM_ReadWriter extends Standard_Transient

  // PCDM_ReadWriter.Version (method)
  Version(): TCollection_AsciiString;

  // PCDM_ReadWriter.WriteReferenceCounter (method)
  WriteReferenceCounter(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter.WriteReferences (method)
  WriteReferences(aData: Storage_Data, aDocument: CDM_Document, theReferencerFileName: TCollection_ExtendedString): void;

  // PCDM_ReadWriter.WriteExtensions (method)
  WriteExtensions(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter.WriteVersion (method)
  WriteVersion(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter.Reader (method)
  static Reader(aFileName: TCollection_ExtendedString): PCDM_ReadWriter;

  // PCDM_ReadWriter.Writer (method)
  static Writer(): PCDM_ReadWriter;

  // PCDM_ReadWriter.WriteFileFormat (method)
  static WriteFileFormat(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter.FileFormat (method)
  static FileFormat(aFileName: TCollection_ExtendedString): TCollection_ExtendedString;

  // PCDM_ReadWriter.get_type_name (method)
  static get_type_name(): string;

  // PCDM_ReadWriter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_ReadWriter.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_ReadWriter.delete (method)
  delete(): void;

  // PCDM_ReadWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_ReadWriter_1: declare class PCDM_ReadWriter_1 extends PCDM_ReadWriter

  // PCDM_ReadWriter_1.constructor (constructor)
  constructor();

  // PCDM_ReadWriter_1.Version (method)
  Version(): TCollection_AsciiString;

  // PCDM_ReadWriter_1.WriteReferenceCounter (method)
  WriteReferenceCounter(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter_1.WriteReferences (method)
  WriteReferences(aData: Storage_Data, aDocument: CDM_Document, theReferencerFileName: TCollection_ExtendedString): void;

  // PCDM_ReadWriter_1.WriteExtensions (method)
  WriteExtensions(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter_1.WriteVersion (method)
  WriteVersion(aData: Storage_Data, aDocument: CDM_Document): void;

  // PCDM_ReadWriter_1.get_type_name (method)
  static get_type_name(): string;

  // PCDM_ReadWriter_1.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_ReadWriter_1.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_ReadWriter_1.delete (method)
  delete(): void;

  // PCDM_ReadWriter_1.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_Reader: declare class PCDM_Reader extends Standard_Transient

  // PCDM_Reader.GetStatus (method)
  GetStatus(): PCDM_ReaderStatus;

  // PCDM_Reader.get_type_name (method)
  static get_type_name(): string;

  // PCDM_Reader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_Reader.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_Reader.delete (method)
  delete(): void;

  // PCDM_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_ReaderStatus: typeof PCDM_ReaderStatus[keyof typeof PCDM_ReaderStatus]

PCDM_Reference: declare class PCDM_Reference

  // PCDM_Reference.constructor (constructor)
  constructor();
  constructor(aReferenceIdentifier: number, aFileName: TCollection_ExtendedString, aDocumentVersion: number);

  // PCDM_Reference.ReferenceIdentifier (method)
  ReferenceIdentifier(): number;

  // PCDM_Reference.FileName (method)
  FileName(): TCollection_ExtendedString;

  // PCDM_Reference.DocumentVersion (method)
  DocumentVersion(): number;

  // PCDM_Reference.delete (method)
  delete(): void;

  // PCDM_Reference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_ReferenceIterator: declare class PCDM_ReferenceIterator extends Standard_Transient

  // PCDM_ReferenceIterator.LoadReferences (method)
  LoadReferences(aDocument: CDM_Document, aMetaData: CDM_MetaData, anApplication: CDM_Application, UseStorageConfiguration: boolean): void;

  // PCDM_ReferenceIterator.Init (method)
  Init(aMetaData: CDM_MetaData): void;

  // PCDM_ReferenceIterator.get_type_name (method)
  static get_type_name(): string;

  // PCDM_ReferenceIterator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_ReferenceIterator.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_ReferenceIterator.delete (method)
  delete(): void;

  // PCDM_ReferenceIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_RetrievalDriver: declare class PCDM_RetrievalDriver extends PCDM_Reader

  // PCDM_RetrievalDriver.SetFormat (method)
  SetFormat(aformat: TCollection_ExtendedString): void;

  // PCDM_RetrievalDriver.GetFormat (method)
  GetFormat(): TCollection_ExtendedString;

  // PCDM_RetrievalDriver.get_type_name (method)
  static get_type_name(): string;

  // PCDM_RetrievalDriver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_RetrievalDriver.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_RetrievalDriver.delete (method)
  delete(): void;

  // PCDM_RetrievalDriver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_StorageDriver: declare class PCDM_StorageDriver extends PCDM_Writer

  // PCDM_StorageDriver.constructor (constructor)
  constructor();

  // PCDM_StorageDriver.Make (method)
  Make(aDocument: CDM_Document): PCDM_Document;
  Make(aDocument: CDM_Document, Documents: NCollection_Sequence_handle_PCDM_Document): void;

  // PCDM_StorageDriver.Write (method)
  Write(aDocument: CDM_Document, aFileName: TCollection_ExtendedString, theRange: Message_ProgressRange): void;
  Write(theDocument: CDM_Document, theOStream: unknown, theRange: Message_ProgressRange): void;

  // PCDM_StorageDriver.SetFormat (method)
  SetFormat(aformat: TCollection_ExtendedString): void;

  // PCDM_StorageDriver.GetFormat (method)
  GetFormat(): TCollection_ExtendedString;

  // PCDM_StorageDriver.IsError (method)
  IsError(): boolean;

  // PCDM_StorageDriver.SetIsError (method)
  SetIsError(theIsError: boolean): void;

  // PCDM_StorageDriver.GetStoreStatus (method)
  GetStoreStatus(): PCDM_StoreStatus;

  // PCDM_StorageDriver.SetStoreStatus (method)
  SetStoreStatus(theStoreStatus: PCDM_StoreStatus): void;

  // PCDM_StorageDriver.get_type_name (method)
  static get_type_name(): string;

  // PCDM_StorageDriver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_StorageDriver.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_StorageDriver.delete (method)
  delete(): void;

  // PCDM_StorageDriver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_StoreStatus: typeof PCDM_StoreStatus[keyof typeof PCDM_StoreStatus]

PCDM_TypeOfFileDriver: typeof PCDM_TypeOfFileDriver[keyof typeof PCDM_TypeOfFileDriver]

PCDM_Writer: declare class PCDM_Writer extends Standard_Transient

  // PCDM_Writer.Write (method)
  Write(aDocument: CDM_Document, aFileName: TCollection_ExtendedString, theRange: Message_ProgressRange): void;

  // PCDM_Writer.get_type_name (method)
  static get_type_name(): string;

  // PCDM_Writer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // PCDM_Writer.DynamicType (method)
  DynamicType(): Standard_Type;

  // PCDM_Writer.delete (method)
  delete(): void;

  // PCDM_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

PCDM_SequenceOfDocument: NCollection_Sequence_handle_PCDM_Document

PCDM_SequenceOfReference: NCollection_Sequence_PCDM_Reference
