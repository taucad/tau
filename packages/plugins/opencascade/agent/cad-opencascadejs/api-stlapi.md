# libcascade — StlAPI

3 top-level symbols. Signatures are verbatim typescript.

StlAPI: declare class StlAPI

  constructor

  static Write(theShape: TopoDS_Shape, theFile: string, theAsciiMode?: boolean): boolean;

  // DEPRECATED
  static Read(theShape: TopoDS_Shape, aFile: string): boolean;

  delete(): void;

  [Symbol.dispose](): void;

StlAPI_Reader: declare class StlAPI_Reader

  constructor

  Read(theShape: TopoDS_Shape, theFileName: string): boolean;

  delete(): void;

  [Symbol.dispose](): void;

StlAPI_Writer: declare class StlAPI_Writer

  constructor

  ASCIIMode(): boolean;

  Write(theShape: TopoDS_Shape, theFileName: string, theProgress: Message_ProgressRange): boolean;

  delete(): void;

  [Symbol.dispose](): void;
