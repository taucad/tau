# libcascade — IGESCAFControl

3 top-level symbols. Signatures are verbatim typescript.

IGESCAFControl: declare class IGESCAFControl

constructor

static DecodeColor(col: number): Quantity_Color;

static EncodeColor(col: Quantity_Color): number;

delete(): void;

[Symbol.dispose](): void;

IGESCAFControl_Reader: declare class IGESCAFControl_Reader extends IGESControl_Reader

constructor

Transfer(theDoc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

Perform(theFileName: TCollection_AsciiString, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: string, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: TCollection_AsciiString, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: string, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

SetColorMode(theMode: boolean): void;

GetColorMode(): boolean;

SetNameMode(theMode: boolean): void;

GetNameMode(): boolean;

SetLayerMode(theMode: boolean): void;

GetLayerMode(): boolean;

delete(): void;

[Symbol.dispose](): void;

IGESCAFControl_Writer: declare class IGESCAFControl_Writer extends IGESControl_Writer

constructor

Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;

Perform(doc: TDocStd_Document, filename: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: string, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: string, theProgress: Message_ProgressRange): boolean;

SetColorMode(colormode: boolean): void;

GetColorMode(): boolean;

SetNameMode(namemode: boolean): void;

GetNameMode(): boolean;

SetLayerMode(layermode: boolean): void;

GetLayerMode(): boolean;

delete(): void;

[Symbol.dispose](): void;
