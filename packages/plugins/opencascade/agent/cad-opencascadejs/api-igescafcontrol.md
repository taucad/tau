# libcascade — IGESCAFControl

3 top-level symbols. Signatures are verbatim typescript.

// Provides high-level API to translate IGES file to and from DECAF document
IGESCAFControl: declare class IGESCAFControl

constructor

// Provides a tool for writing IGES file Converts IGES color index to CASCADE color
static DecodeColor(col: number): Quantity_Color;

// Tries to Convert CASCADE color to IGES color index If no corresponding color defined in IGES, returns 0
static EncodeColor(col: Quantity_Color): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool to read IGES file and put it into DECAF document
IGESCAFControl_Reader: declare class IGESCAFControl_Reader extends IGESControl_Reader

constructor

// Translates currently loaded IGES file into the document Returns True if succeeded, and False in case of fail
Transfer(theDoc: TDocStd_Document, theProgress?: Message_ProgressRange): boolean;

// Translate IGES file given by filename into the document Return True if succeeded, and False in case of fail
Perform(theFileName: TCollection_AsciiString, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: string, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: TCollection_AsciiString, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Perform(theFileName: string, theDoc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;

// Set ColorMode for indicate read Colors or not
SetColorMode(theMode: boolean): void;

GetColorMode(): boolean;

// Set NameMode for indicate read Name or not
SetNameMode(theMode: boolean): void;

GetNameMode(): boolean;

// Set LayerMode for indicate read Layers or not
SetLayerMode(theMode: boolean): void;

GetLayerMode(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a tool to write DECAF document to the IGES file
IGESCAFControl_Writer: declare class IGESCAFControl_Writer extends IGESControl_Writer

constructor

// Transfers a document to a IGES model Returns True if translation is OK
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(doc: TDocStd_Document, theProgress: Message_ProgressRange): boolean;
Transfer(labels: NCollection_Sequence_TDF_Label, theProgress: Message_ProgressRange): boolean;
Transfer(label: TDF_Label, theProgress: Message_ProgressRange): boolean;

// Transfers a document and writes it to a IGES file Returns True if translation is OK
Perform(doc: TDocStd_Document, filename: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: string, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
Perform(doc: TDocStd_Document, filename: string, theProgress: Message_ProgressRange): boolean;

// Set ColorMode for indicate write Colors or not
SetColorMode(colormode: boolean): void;

GetColorMode(): boolean;

// Set NameMode for indicate write Name or not
SetNameMode(namemode: boolean): void;

GetNameMode(): boolean;

// Set LayerMode for indicate write Layers or not
SetLayerMode(layermode: boolean): void;

GetLayerMode(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
