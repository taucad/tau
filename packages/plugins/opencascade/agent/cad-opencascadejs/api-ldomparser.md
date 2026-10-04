# libcascade — LDOMParser

1 top-level symbols. Signatures are verbatim typescript.

LDOMParser: declare class LDOMParser

  // LDOMParser.constructor (constructor)
  constructor();

  // LDOMParser.getDocument (method)
  getDocument(): LDOM_Document;

  // LDOMParser.parse (method)
  parse(aFileName: string): boolean;

  // LDOMParser.GetError (method)
  GetError(aData: TCollection_AsciiString): TCollection_AsciiString;

  // LDOMParser.GetBOM (method)
  GetBOM(): LDOM_OSStream_BOMType;

  // LDOMParser.delete (method)
  delete(): void;

  // LDOMParser.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
