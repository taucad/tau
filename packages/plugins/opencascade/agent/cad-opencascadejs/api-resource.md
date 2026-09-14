# libcascade — Resource

5 top-level symbols. Signatures are verbatim typescript.

Resource_FormatType: typeof Resource_FormatType[keyof typeof Resource_FormatType]

Resource_LexicalCompare: declare class Resource_LexicalCompare

  constructor

  IsLower(Left: TCollection_AsciiString, Right: TCollection_AsciiString): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Resource_Manager: declare class Resource_Manager extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Save(): boolean;

  Find(aResource: string): boolean;
  Find(theResource: TCollection_AsciiString, theValue: TCollection_AsciiString): boolean;
  Find(aResource: string): boolean;
  Find(theResource: TCollection_AsciiString, theValue: TCollection_AsciiString): boolean;

  Integer(aResourceName: string): number;

  Real(aResourceName: string): number;

  Value(aResourceName: string): string;

  ExtValue(aResourceName: string): string;

  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: string): void;
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: string): void;
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: string): void;

  SetResource_4(aResourceName: string, aValue: string): void;

  static GetResourcePath(aPath: TCollection_AsciiString, aName: string, isUserDefaults: boolean): void;

  GetMap(theRefMap?: boolean): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  IsInitialized(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Resource_NoSuchResource: declare class Resource_NoSuchResource extends Standard_NoSuchObject

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Resource_Unicode: declare class Resource_Unicode

  constructor

  delete(): void;

  [Symbol.dispose](): void;
