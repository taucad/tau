# libcascade — Resource

5 top-level symbols. Signatures are verbatim typescript.

// List of non ASCII format types which may be converted into the Unicode 16 bits format type
Resource_FormatType: typeof Resource_FormatType[keyof typeof Resource_FormatType]

Resource_LexicalCompare: declare class Resource_LexicalCompare

constructor

// Returns True if <Left> is lower than <Right>
IsLower(Left: TCollection_AsciiString, Right: TCollection_AsciiString): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a resource structure and its management methods
Resource_Manager: declare class Resource_Manager extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Save the user resource structure in the specified file
Save(): boolean;

// returns True if the Resource does exist
Find(aResource: string): boolean;
Find(theResource: TCollection_AsciiString, theValue: TCollection_AsciiString): boolean;
Find(aResource: string): boolean;
Find(theResource: TCollection_AsciiString, theValue: TCollection_AsciiString): boolean;

// Gets the value of an integer resource according to its instance and its type
Integer(aResourceName: string): number;

// Gets the value of a real resource according to its instance and its type
Real(aResourceName: string): number;

// Gets the value of a CString resource according to its instance and its type
Value(aResourceName: string): string;

// Gets the value of an ExtString resource according to its instance and its type
ExtValue(aResourceName: string): string;

// Sets the new value of an integer resource
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: string): void;
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: string): void;
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: number): void;
SetResource(aResourceName: string, aValue: string): void;

// Sets the new value of an ExtString resource
SetResource_4(aResourceName: string, aValue: string): void;

// Gets the resource file full path by its name
static GetResourcePath(aPath: TCollection_AsciiString, aName: string, isUserDefaults: boolean): void;
// aPath: Mutated in place

// Returns internal Ref or User map with parameters
GetMap(theRefMap?: boolean): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Returns true if Resource have been found
IsInitialized(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Resource_NoSuchResource: declare class Resource_NoSuchResource extends Standard_NoSuchObject

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides functions used to convert a non-ASCII C string given in ANSI, EUC, GB or SJIS format, to a Unicode string of extended characters, and vice versa
Resource_Unicode: declare class Resource_Unicode

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
