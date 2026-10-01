# libcascade — IGESCAFControl

3 top-level symbols. Signatures are verbatim typescript.

IGESCAFControl: declare class IGESCAFControl

  // IGESCAFControl.constructor (constructor)
  constructor();

  // IGESCAFControl.DecodeColor (method)
  static DecodeColor(col: number): Quantity_Color;

  // IGESCAFControl.EncodeColor (method)
  static EncodeColor(col: Quantity_Color): number;

  // IGESCAFControl.delete (method)
  delete(): void;

  // IGESCAFControl.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESCAFControl_Reader: declare class IGESCAFControl_Reader extends IGESControl_Reader

  // IGESCAFControl_Reader.constructor (constructor)
  constructor();
  constructor(theWS: XSControl_WorkSession, FromScratch?: boolean);

  // IGESCAFControl_Reader.Transfer (method)
  Transfer(theDoc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

  // IGESCAFControl_Reader.Perform (method)
  Perform(theFileName: TCollection_AsciiString, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
  Perform(theFileName: string, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

  // IGESCAFControl_Reader.SetColorMode (method)
  SetColorMode(theMode: boolean): void;

  // IGESCAFControl_Reader.GetColorMode (method)
  GetColorMode(): boolean;

  // IGESCAFControl_Reader.SetNameMode (method)
  SetNameMode(theMode: boolean): void;

  // IGESCAFControl_Reader.GetNameMode (method)
  GetNameMode(): boolean;

  // IGESCAFControl_Reader.SetLayerMode (method)
  SetLayerMode(theMode: boolean): void;

  // IGESCAFControl_Reader.GetLayerMode (method)
  GetLayerMode(): boolean;

  // IGESCAFControl_Reader.delete (method)
  delete(): void;

  // IGESCAFControl_Reader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESCAFControl_Writer: declare class IGESCAFControl_Writer extends IGESControl_Writer

  // IGESCAFControl_Writer.constructor (constructor)
  constructor();
  constructor(WS: XSControl_WorkSession, scratch?: boolean);
  constructor(theWS: XSControl_WorkSession, theUnit: string);

  // IGESCAFControl_Writer.Transfer (method)
  Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
  Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
  Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;

  // IGESCAFControl_Writer.Perform (method)
  Perform(doc: TDocStd_Document, filename: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
  Perform(doc: TDocStd_Document, filename: string, theProgress: Message_ProgressRange): boolean;

  // IGESCAFControl_Writer.SetColorMode (method)
  SetColorMode(colormode: boolean): void;

  // IGESCAFControl_Writer.GetColorMode (method)
  GetColorMode(): boolean;

  // IGESCAFControl_Writer.SetNameMode (method)
  SetNameMode(namemode: boolean): void;

  // IGESCAFControl_Writer.GetNameMode (method)
  GetNameMode(): boolean;

  // IGESCAFControl_Writer.SetLayerMode (method)
  SetLayerMode(layermode: boolean): void;

  // IGESCAFControl_Writer.GetLayerMode (method)
  GetLayerMode(): boolean;

  // IGESCAFControl_Writer.delete (method)
  delete(): void;

  // IGESCAFControl_Writer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
