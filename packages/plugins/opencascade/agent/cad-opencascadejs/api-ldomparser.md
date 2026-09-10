# libcascade — LDOMParser

1 top-level symbols. Signatures are verbatim typescript.

LDOMParser: declare class LDOMParser

constructor

getDocument(): LDOM_Document;

parse(aFileName: string): boolean;

GetError(aData: TCollection_AsciiString): TCollection_AsciiString;

GetBOM(): LDOM_OSStream_BOMType;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
