# libcascade — XSControl (2)

6 top-level symbols. Signatures are verbatim typescript.

// TransferWriter gives help to control transfer to write a file after having converted data from Cascade/Imagine
XSControl_TransferWriter: declare class XSControl_TransferWriter extends Standard_Transient

constructor

// Returns the FinderProcess itself
FinderProcess(): Transfer_FinderProcess;

// Sets a new FinderProcess and forgets the former one
SetFinderProcess(theFP: Transfer_FinderProcess): void;

// Returns the currently used Controller
Controller(): XSControl_Controller;

// Sets a new Controller, also sets a new FinderProcess
SetController(theCtl: XSControl_Controller): void;

// Clears recorded data according a mode 0 clears FinderProcess (results, checks) -1 create a new FinderProcess
Clear(theMode: number): void;

// Returns the current Transfer Mode (an Integer) It will be interpreted by the Controller to run Transfers This call form could be later replaced by more specific ones (parameters suited for each norm / transfer case)
TransferMode(): number;

// Changes the Transfer Mode
SetTransferMode(theMode: number): void;

// Prints statistics on current Trace File, according what,mode See PrintStatsProcess for details
PrintStats(theWhat: number, theMode?: number): void;

// Tells if a transient object (from an application) is a valid candidate for a transfer to a model Asks the Controller (RecognizeWriteTransient) If <obj> is a HShape, calls RecognizeShape
RecognizeTransient(theObj: Standard_Transient): boolean;

// Transfers a Transient object (from an application) to a model of current norm, according to the last call to SetTransferMode Works by calling the Controller Returns status
TransferWriteTransient(theModel: Interface_InterfaceModel, theObj: Standard_Transient, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// Tells if a Shape is valid for a transfer to a model Asks the Controller (RecognizeWriteShape)
RecognizeShape(theShape: TopoDS_Shape): boolean;

// Transfers a Shape from CasCade to a model of current norm, according to the last call to SetTransferMode Works by calling the Controller Returns status
TransferWriteShape(theModel: Interface_InterfaceModel, theShape: TopoDS_Shape, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides various useful utility routines, to facilitate handling of most common data structures
XSControl_Utils: declare class XSControl_Utils

constructor

// Just prints a line into the current Trace File
TraceLine(line: string): void;

// Just prints a line or a set of lines into the current Trace File
TraceLines(lines: Standard_Transient): void;

IsKind(item: Standard_Transient, what: Standard_Type): boolean;

// Returns the name of the dynamic type of an object, i.e
TypeName(item: Standard_Transient, nopk: boolean): string;

TraValue(list: Standard_Transient, num: number): Standard_Transient;

NewSeqTra(): NCollection_HSequence_handle_Standard_Transient;

AppendTra(seqval: NCollection_HSequence_handle_Standard_Transient, traval: Standard_Transient): void;

DateString(yy: number, mm: number, dd: number, hh: number, mn: number, ss: number): string;

DateValues(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

ToCString(strval: TCollection_HAsciiString): string;
ToCString(strval: TCollection_AsciiString): string;
ToCString(strval: TCollection_HAsciiString): string;
ToCString(strval: TCollection_AsciiString): string;

ToHString(strcon: string): TCollection_HAsciiString;

ToHString_2(strcon: string): TCollection_HExtendedString;

ToAString(strcon: string): TCollection_AsciiString;

ToEString(strval: TCollection_HExtendedString): string;
ToEString(strval: TCollection_ExtendedString): string;
ToEString(strval: TCollection_HExtendedString): string;
ToEString(strval: TCollection_ExtendedString): string;

ToXString(strcon: string): TCollection_ExtendedString;

AsciiToExtended(str: string): string;

IsAscii(str: string): boolean;

ExtendedToAscii(str: string): string;

CStrValue(list: Standard_Transient, num: number): string;

EStrValue(list: Standard_Transient, num: number): string;

NewSeqCStr(): NCollection_HSequence_handle_TCollection_HAsciiString;

AppendCStr(seqval: NCollection_HSequence_handle_TCollection_HAsciiString, strval: string): void;

NewSeqEStr(): NCollection_HSequence_handle_TCollection_HExtendedString;

AppendEStr(seqval: NCollection_HSequence_handle_TCollection_HExtendedString, strval: string): void;

// Converts a list of Shapes to a Compound (a kind of Shape)
CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

// Returns the type of a Shape
ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

// From a Shape, builds a Compound as follows
SortedCompound(shape: TopoDS*Shape, type*: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

ShapeValue(seqv: NCollection_HSequence_TopoDS_Shape, num: number): TopoDS_Shape;

NewSeqShape(): NCollection_HSequence_TopoDS_Shape;

AppendShape(seqv: NCollection_HSequence_TopoDS_Shape, shape: TopoDS_Shape): void;

// Creates a Transient Object from a Shape
ShapeBinder(shape: TopoDS_Shape, hs?: boolean): Standard_Transient;

// From a Transient, returns a Shape
BinderShape(tr: Standard_Transient): TopoDS_Shape;

SeqLength(list: Standard_Transient): number;

SeqToArr(seq: Standard_Transient, first?: number): Standard_Transient;

ArrToSeq(arr: Standard_Transient): Standard_Transient;

SeqIntValue(list: NCollection_HSequence_int, num: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a receptacle for externally defined variables, each one has a name
XSControl_Vars: declare class XSControl_Vars extends Standard_Transient

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This WorkSession completes the basic one, by adding
XSControl_WorkSession: declare class XSControl_WorkSession extends IFSelect_WorkSession

constructor

// In addition to basic ClearData, clears Transfer and Management for interactive use, for mode = 0,1,2 and over 4 Plus
ClearData(mode: number): void;

// Selects a Norm defined by its name
SelectNorm(theNormName: string): boolean;

// Selects a Norm defined by its Controller itself
SetController(theCtl: XSControl_Controller): void;

// Returns the name of the last Selected Norm
SelectedNorm(theRsc: boolean): string;

// Returns the norm controller itself
NormAdaptor(): XSControl_Controller;

// Returns the current Context List, Null if not defined The Context is given to the TransientProcess for TransferRead
Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

// Sets the current Context List, as a whole Sets it to the TransferReader
SetAllContext(theContext: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient): void;

// Clears the whole current Context (nullifies it)
ClearContext(): void;

// Sets a Transfer Reader, by internal ways, according mode
InitTransferReader(theMode: number): void;

// Sets a Transfer Reader, which manages transfers on reading
SetTransferReader(theTR: XSControl_TransferReader): void;

// Returns the Transfer Reader, Null if not set
TransferReader(): XSControl_TransferReader;

// Returns the TransientProcess(internal data for TransferReader)
MapReader(): Transfer_TransientProcess;

// Changes the Map Reader, i.e
SetMapReader(theTP: Transfer_TransientProcess): boolean;

// Returns the result attached to a starting entity If <mode> = 0, returns Final Result If <mode> = 1, considers Last Result If <mode> = 2, considers Final, else if absent, Last returns it as Transient, if result is not transient returns the Binder <mode> = 10,11,12 idem but returns the Binder itself (if it is not, e.g
Result(theEnt: Standard_Transient, theMode: number): Standard_Transient;

// Commands the transfer of, either one entity, or a list I.E
TransferReadOne(theEnts: Standard_Transient, theProgress?: Message_ProgressRange): number;

// Commands the transfer of all the root entities of the model i.e
TransferReadRoots(theProgress?: Message_ProgressRange): number;

// produces and returns a new Model well conditioned It is produced by the Norm Controller It can be Null (if this function is not implemented)
NewModel(): Interface_InterfaceModel;

// Returns the Transfer Reader, Null if not set
TransferWriter(): XSControl_TransferWriter;

// Changes the Map Reader, i.e
SetMapWriter(theFP: Transfer_FinderProcess): boolean;

// Transfers a Shape from CasCade to a model of current norm, according to the last call to SetModeWriteShape Returns status :Done if OK, Fail if error during transfer, Error if transfer badly initialised
TransferWriteShape(theShape: TopoDS_Shape, theCompGraph?: boolean, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

Vars(): XSControl_Vars;

SetVars(theVars: XSControl_Vars): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a simple way to create then write a Model compliant to a given norm, from a Shape The model can then be edited by tools by other appropriate tools
XSControl_Writer: declare class XSControl_Writer

constructor

// Sets a specific norm to <me> Returns True if done, False if <norm> is not available
SetNorm(norm: string): boolean;

// Sets a specific session to <me>
SetWS(WS: XSControl_WorkSession, scratch?: boolean): void;

// Returns the session used in <me>
WS(): XSControl_WorkSession;

// Returns the produced model
Model(newone?: boolean): Interface_InterfaceModel;

// Transfers a Shape according to the mode
TransferShape(sh: TopoDS_Shape, mode?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

// Writes the produced model
WriteFile(filename: string): IFSelect_ReturnStatus;

// Prints Statistics about Transfer
PrintStatsTransfer(what: number, mode?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XSControl_WorkSessionMap: NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient
