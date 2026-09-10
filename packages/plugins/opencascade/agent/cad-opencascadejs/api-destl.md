# libcascade — DESTL

2 top-level symbols. Signatures are verbatim typescript.

// The purpose of this class is to configure the transfer process for STL format Stores the necessary settings for `DESTL_Provider`
DESTL_ConfigurationNode: declare class DESTL_ConfigurationNode extends Standard_Transient

constructor

InternalParameters: DESTL_ConfigurationNode_RWStl_InternalSection

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Writes configuration to the string
Save(): TCollection_AsciiString;
Save(theResourcePath: TCollection_AsciiString): boolean;
Save(): TCollection_AsciiString;
Save(theResourcePath: TCollection_AsciiString): boolean;

// Checks the import supporting
IsImportSupported(): boolean;

// Checks the export supporting
IsExportSupported(): boolean;

// Checks for stream support
IsStreamSupported(): boolean;

// Gets CAD format name of associated provider
GetFormat(): TCollection_AsciiString;

// Gets provider's vendor name of associated provider
GetVendor(): TCollection_AsciiString;

// Gets list of supported file extensions
GetExtensions(): NCollection_List_TCollection_AsciiString;

// Checks the file content to verify a format
CheckContent(theBuffer: NCollection_Buffer): boolean;
// theBuffer: read stream buffer to check content

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

DESTL_ConfigurationNode_RWStl_InternalSection: interface DESTL_ConfigurationNode_RWStl_InternalSection

ReadMergeAngle: number

ReadBRep: boolean

WriteAscii: boolean
