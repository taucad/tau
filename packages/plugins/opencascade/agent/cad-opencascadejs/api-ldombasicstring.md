# libcascade — LDOMBasicString

2 top-level symbols. Signatures are verbatim typescript.

LDOMBasicString: declare class LDOMBasicString

  // LDOMBasicString.constructor (constructor)
  constructor();
  constructor(anOther: LDOMBasicString);
  constructor(aValue: number);
  constructor(aValue: string);
  constructor(aValue: string, aDoc: LDOM_MemManager);
  constructor(aValue: string, aLen: number, aDoc: LDOM_MemManager);

  // LDOMBasicString.Type (method)
  Type(): LDOMBasicString_StringType;

  // LDOMBasicString.GetInteger (method)
  GetInteger(aResult?: number): { returnValue: boolean; aResult: number };

  // LDOMBasicString.GetString (method)
  GetString(): string;

  // LDOMBasicString.equals (method)
  equals(anOther: LDOMBasicString): boolean;

  // LDOMBasicString.delete (method)
  delete(): void;

  // LDOMBasicString.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

LDOMBasicString_StringType: typeof LDOMBasicString_StringType[keyof typeof LDOMBasicString_StringType]

  readonly LDOM_NULL: 'LDOM_NULL'

  readonly LDOM_Integer: 'LDOM_Integer'

  readonly LDOM_AsciiFree: 'LDOM_AsciiFree'

  readonly LDOM_AsciiDoc: 'LDOM_AsciiDoc'

  readonly LDOM_AsciiDocClear: 'LDOM_AsciiDocClear'

  readonly LDOM_AsciiHashed: 'LDOM_AsciiHashed'
