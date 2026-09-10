# libcascade — LDOMBasicString

2 top-level symbols. Signatures are verbatim typescript.

LDOMBasicString: declare class LDOMBasicString

constructor

Type(): LDOMBasicString_StringType;

GetInteger(aResult?: number): { returnValue: boolean; aResult: number };

GetString(): string;

equals(anOther: LDOMBasicString): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

LDOMBasicString_StringType: typeof LDOMBasicString_StringType[keyof typeof LDOMBasicString_StringType]
