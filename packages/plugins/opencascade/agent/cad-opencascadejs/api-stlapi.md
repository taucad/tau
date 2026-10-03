# libcascade — StlAPI

3 top-level symbols. Signatures are verbatim typescript.

StlAPI: declare class StlAPI

  // StlAPI.constructor (constructor)
  constructor();

  // StlAPI.Write (method)
  static Write(theShape: TopoDS_Shape, theFile: string, theAsciiMode?: boolean): boolean;

  // DEPRECATED
  // StlAPI.Read (method)
  static Read(theShape: TopoDS_Shape, aFile: string): boolean;

  // StlAPI.delete (method)
  delete(): void;

  // StlAPI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StlAPI_Reader: declare class StlAPI_Reader

  // StlAPI_Reader.constructor (constructor)
  constructor();

  // StlAPI_Reader.Read (method)
  Read(theShape: TopoDS_Shape, theFileName: string): boolean;

  // StlAPI_Reader.delete (method)
  delete(): void;

  // StlAPI_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StlAPI_Writer: declare class StlAPI_Writer

  // StlAPI_Writer.constructor (constructor)
  constructor();

  // StlAPI_Writer.ASCIIMode (method)
  ASCIIMode(): boolean;

  // StlAPI_Writer.Write (method)
  Write(theShape: TopoDS_Shape, theFileName: string, theProgress: Message_ProgressRange): boolean;

  // StlAPI_Writer.delete (method)
  delete(): void;

  // StlAPI_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
