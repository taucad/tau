# libcascade — PCDM

17 top-level symbols. Signatures are verbatim typescript.

PCDM: declare class PCDM

  constructor

  delete(): void;

  [Symbol.dispose](): void;

PCDM_DOMHeaderParser: declare class PCDM_DOMHeaderParser extends LDOMParser

  constructor

  SetStartElementName(aStartElementName: TCollection_AsciiString): void;

  SetEndElementName(anEndElementName: TCollection_AsciiString): void;

  startElement(): boolean;

  endElement(): boolean;

  GetElement(): LDOM_Element;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_Document: declare class PCDM_Document extends Standard_Persistent

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_DriverError: declare class PCDM_DriverError extends Standard_Failure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_ReadWriter: declare class PCDM_ReadWriter extends Standard_Transient

  Version(): TCollection_AsciiString;

  WriteReferenceCounter(aData: Storage_Data, aDocument: CDM_Document): void;

  WriteReferences(aData: Storage_Data, aDocument: CDM_Document, theReferencerFileName: TCollection_ExtendedString): void;

  WriteExtensions(aData: Storage_Data, aDocument: CDM_Document): void;

  WriteVersion(aData: Storage_Data, aDocument: CDM_Document): void;

  static Reader(aFileName: TCollection_ExtendedString): PCDM_ReadWriter;

  static Writer(): PCDM_ReadWriter;

  static WriteFileFormat(aData: Storage_Data, aDocument: CDM_Document): void;

  static FileFormat(aFileName: TCollection_ExtendedString): TCollection_ExtendedString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_ReadWriter_1: declare class PCDM_ReadWriter_1 extends PCDM_ReadWriter

  constructor

  Version(): TCollection_AsciiString;

  WriteReferenceCounter(aData: Storage_Data, aDocument: CDM_Document): void;

  WriteReferences(aData: Storage_Data, aDocument: CDM_Document, theReferencerFileName: TCollection_ExtendedString): void;

  WriteExtensions(aData: Storage_Data, aDocument: CDM_Document): void;

  WriteVersion(aData: Storage_Data, aDocument: CDM_Document): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_Reader: declare class PCDM_Reader extends Standard_Transient

  GetStatus(): PCDM_ReaderStatus;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_ReaderStatus: typeof PCDM_ReaderStatus[keyof typeof PCDM_ReaderStatus]

PCDM_Reference: declare class PCDM_Reference

  constructor

  ReferenceIdentifier(): number;

  FileName(): TCollection_ExtendedString;

  DocumentVersion(): number;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_ReferenceIterator: declare class PCDM_ReferenceIterator extends Standard_Transient

  LoadReferences(aDocument: CDM_Document, aMetaData: CDM_MetaData, anApplication: CDM_Application, UseStorageConfiguration: boolean): void;

  Init(aMetaData: CDM_MetaData): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_RetrievalDriver: declare class PCDM_RetrievalDriver extends PCDM_Reader

  SetFormat(aformat: TCollection_ExtendedString): void;

  GetFormat(): TCollection_ExtendedString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_StorageDriver: declare class PCDM_StorageDriver extends PCDM_Writer

  constructor

  Make(aDocument: CDM_Document): PCDM_Document;
  Make(aDocument: CDM_Document, Documents: NCollection_Sequence_handle_PCDM_Document): void;
  Make(aDocument: CDM_Document): PCDM_Document;
  Make(aDocument: CDM_Document, Documents: NCollection_Sequence_handle_PCDM_Document): void;

  Write(aDocument: CDM_Document, aFileName: TCollection_ExtendedString, theRange: Message_ProgressRange): void;
  Write(theDocument: CDM_Document, theOStream: unknown, theRange: Message_ProgressRange): void;
  Write(aDocument: CDM_Document, aFileName: TCollection_ExtendedString, theRange: Message_ProgressRange): void;
  Write(theDocument: CDM_Document, theOStream: unknown, theRange: Message_ProgressRange): void;

  SetFormat(aformat: TCollection_ExtendedString): void;

  GetFormat(): TCollection_ExtendedString;

  IsError(): boolean;

  SetIsError(theIsError: boolean): void;

  GetStoreStatus(): PCDM_StoreStatus;

  SetStoreStatus(theStoreStatus: PCDM_StoreStatus): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_StoreStatus: typeof PCDM_StoreStatus[keyof typeof PCDM_StoreStatus]

PCDM_TypeOfFileDriver: typeof PCDM_TypeOfFileDriver[keyof typeof PCDM_TypeOfFileDriver]

PCDM_Writer: declare class PCDM_Writer extends Standard_Transient

  Write(aDocument: CDM_Document, aFileName: TCollection_ExtendedString, theRange: Message_ProgressRange): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

PCDM_SequenceOfDocument: NCollection_Sequence_handle_PCDM_Document

PCDM_SequenceOfReference: NCollection_Sequence_PCDM_Reference
