# libcascade — FSD

3 top-level symbols. Signatures are verbatim typescript.

// Tool for encoding/decoding base64 stream
FSD_Base64: declare class FSD_Base64

constructor

// Function encoding a buffer to base64 string
static Encode(theEncodedStr: string, theStrLen: number, theData: number, theDataLen: number): number;
static Encode(theData: number, theDataLen: number): TCollection_AsciiString;
static Encode(theEncodedStr: string, theStrLen: number, theData: number, theDataLen: number): number;
static Encode(theData: number, theDataLen: number): TCollection_AsciiString;
// theEncodedStr: the place for encoded string
// theStrLen: the length of the buffer theEncodedStr in bytes
// theData: the input binary data
// theDataLen: the length of input data in bytes

// Function decoding base64 string
static Decode(theDecodedData: number, theDataLen: number, theEncodedStr: string, theStrLen: number): number;
static Decode(theStr: string, theLen: number): NCollection_Buffer;
static Decode(theDecodedData: number, theDataLen: number, theEncodedStr: string, theStrLen: number): number;
static Decode(theStr: string, theLen: number): NCollection_Buffer;
// theDecodedData: the place for decoded data
// theDataLen: the length of the buffer theDecodedData in bytes
// theEncodedStr: the input encoded string
// theStrLen: the length of input encoded string

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

FSD_CmpFile: declare class FSD_CmpFile extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Open(aName: TCollection_AsciiString, aMode: Storage_OpenMode): Storage_Error;

static IsGoodFileType(aName: TCollection_AsciiString): Storage_Error;

BeginWriteInfoSection(): Storage_Error;

BeginReadInfoSection(): Storage_Error;

WritePersistentObjectHeader(aRef: number, aType: number): void;

BeginWritePersistentObjectData(): void;

BeginWriteObjectData(): void;

EndWriteObjectData(): void;

EndWritePersistentObjectData(): void;

ReadPersistentObjectHeader(aRef: number, aType: number): { aRef: number; aType: number };

BeginReadPersistentObjectData(): void;

BeginReadObjectData(): void;

EndReadObjectData(): void;

EndReadPersistentObjectData(): void;

Destroy(): void;

static MagicNumber(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

FSD_FileHeader: declare class FSD_FileHeader

constructor

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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
