# libcascade — Resource

5 top-level symbols. Signatures are verbatim typescript.

Resource_FormatType: typeof Resource_FormatType[keyof typeof Resource_FormatType]

Resource_LexicalCompare: declare class Resource_LexicalCompare

  // Resource_LexicalCompare.constructor (constructor)
  constructor();

  // Resource_LexicalCompare.IsLower (method)
  IsLower(Left: TCollection_AsciiString, Right: TCollection_AsciiString): boolean;

  // Resource_LexicalCompare.delete (method)
  delete(): void;

  // Resource_LexicalCompare.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Resource_Manager: declare class Resource_Manager extends Standard_Transient

  // Resource_Manager.constructor (constructor)
  constructor();
  constructor(aName: string, Verbose?: boolean);
  constructor(theName: TCollection_AsciiString, theDefaultsDirectory: TCollection_AsciiString, theUserDefaultsDirectory: TCollection_AsciiString, theIsVerbose?: boolean);

  // Resource_Manager.get_type_name (method)
  static get_type_name(): string;

  // Resource_Manager.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Resource_Manager.DynamicType (method)
  DynamicType(): Standard_Type;

  // Resource_Manager.Save (method)
  Save(): boolean;

  // Resource_Manager.Find (method)
  Find(aResource: string): boolean;
  Find(theResource: TCollection_AsciiString, theValue: TCollection_AsciiString): boolean;

  // Resource_Manager.Integer (method)
  Integer(aResourceName: string): number;

  // Resource_Manager.Real (method)
  Real(aResourceName: string): number;

  // Resource_Manager.Value (method)
  Value(aResourceName: string): string;

  // Resource_Manager.ExtValue (method)
  ExtValue(aResourceName: string): string;

  // Resource_Manager.SetResource (method)
  SetResource(aResourceName: string, aValue: number): void;
  SetResource(aResourceName: string, aValue: string): void;

  // Resource_Manager.SetResource_4 (method)
  SetResource_4(aResourceName: string, aValue: string): void;

  // Resource_Manager.GetResourcePath (method)
  static GetResourcePath(aPath: TCollection_AsciiString, aName: string, isUserDefaults: boolean): void;

  // Resource_Manager.GetMap (method)
  GetMap(theRefMap?: boolean): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

  // Resource_Manager.IsInitialized (method)
  IsInitialized(): boolean;

  // Resource_Manager.delete (method)
  delete(): void;

  // Resource_Manager.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Resource_NoSuchResource: declare class Resource_NoSuchResource extends Standard_NoSuchObject

  // Resource_NoSuchResource.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Resource_NoSuchResource.ExceptionType (method)
  ExceptionType(): string;

  // Resource_NoSuchResource.delete (method)
  delete(): void;

  // Resource_NoSuchResource.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Resource_Unicode: declare class Resource_Unicode

  // Resource_Unicode.constructor (constructor)
  constructor();

  // Resource_Unicode.delete (method)
  delete(): void;

  // Resource_Unicode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
