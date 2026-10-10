# libcascade — Resource

5 top-level symbols. Signatures are verbatim typescript.

Resource_FormatType: typeof Resource_FormatType[keyof typeof Resource_FormatType]

  readonly Resource_FormatType_SJIS: 'Resource_FormatType_SJIS'

  readonly Resource_FormatType_EUC: 'Resource_FormatType_EUC'

  readonly Resource_FormatType_NoConversion: 'Resource_FormatType_NoConversion'

  readonly Resource_FormatType_GB: 'Resource_FormatType_GB'

  readonly Resource_FormatType_UTF8: 'Resource_FormatType_UTF8'

  readonly Resource_FormatType_SystemLocale: 'Resource_FormatType_SystemLocale'

  readonly Resource_FormatType_CP1250: 'Resource_FormatType_CP1250'

  readonly Resource_FormatType_CP1251: 'Resource_FormatType_CP1251'

  readonly Resource_FormatType_CP1252: 'Resource_FormatType_CP1252'

  readonly Resource_FormatType_CP1253: 'Resource_FormatType_CP1253'

  readonly Resource_FormatType_CP1254: 'Resource_FormatType_CP1254'

  readonly Resource_FormatType_CP1255: 'Resource_FormatType_CP1255'

  readonly Resource_FormatType_CP1256: 'Resource_FormatType_CP1256'

  readonly Resource_FormatType_CP1257: 'Resource_FormatType_CP1257'

  readonly Resource_FormatType_CP1258: 'Resource_FormatType_CP1258'

  readonly Resource_FormatType_iso8859_1: 'Resource_FormatType_iso8859_1'

  readonly Resource_FormatType_iso8859_2: 'Resource_FormatType_iso8859_2'

  readonly Resource_FormatType_iso8859_3: 'Resource_FormatType_iso8859_3'

  readonly Resource_FormatType_iso8859_4: 'Resource_FormatType_iso8859_4'

  readonly Resource_FormatType_iso8859_5: 'Resource_FormatType_iso8859_5'

  readonly Resource_FormatType_iso8859_6: 'Resource_FormatType_iso8859_6'

  readonly Resource_FormatType_iso8859_7: 'Resource_FormatType_iso8859_7'

  readonly Resource_FormatType_iso8859_8: 'Resource_FormatType_iso8859_8'

  readonly Resource_FormatType_iso8859_9: 'Resource_FormatType_iso8859_9'

  readonly Resource_FormatType_CP850: 'Resource_FormatType_CP850'

  readonly Resource_FormatType_GBK: 'Resource_FormatType_GBK'

  readonly Resource_FormatType_Big5: 'Resource_FormatType_Big5'

  readonly Resource_FormatType_ANSI: 'Resource_FormatType_ANSI'

  readonly Resource_SJIS: 'Resource_SJIS'

  readonly Resource_EUC: 'Resource_EUC'

  readonly Resource_ANSI: 'Resource_ANSI'

  readonly Resource_GB: 'Resource_GB'

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
