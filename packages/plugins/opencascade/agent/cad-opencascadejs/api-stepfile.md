# libcascade — StepFile

1 top-level symbols. Signatures are verbatim typescript.

StepFile_ReadData: declare class StepFile_ReadData

constructor

// Prepares the text value for analysis
CreateNewText(theNewText: string, theLenText: number): void;

// Adds the current record to the list
RecordNewEntity(): void;

// Creates a new record and sets Ident from myResText
RecordIdent(): void;

// Starts reading of the type (entity)
RecordType(): void;

// Prepares and saves a record or sub-record
RecordListStart(): void;

// Prepares new arguments
CreateNewArg(): void;

// Prepares error arguments, controls count of error arguments
CreateErrorArg(): void;

// Creates a new scope, containing the current record
AddNewScope(): void;

// Ends the scope
FinalOfScope(): void;

// Releases memory
ClearRecorder(theMode: number): void;
// theMode: 1 - clear pages of records and arguments2 - clear pages of characters3 - clear all data

// Returns a value of fields of current argument
GetArgDescription(theType: Interface_ParamType, theValue: string): boolean;

// Returns a value of all file counters
GetFileNbR(theNbHead: number, theNbRec: number, theNbPage: number): void;

// Returns a value of fields of current record
GetRecordDescription(theIdent: string, theType: string, theNbArg: number): boolean;

// Initializes the record type with myResText
RecordTypeText(): void;

// Skips to next record
NextRecord(): void;

// Prints data of current record according to the modeprint
PrintCurrentRecord(): void;

// Controls the correct argument count for the record
PrepareNewArg(): void;

// Prepares the end of the head section
FinalOfHead(): void;

// Sets type of the current argument
SetTypeArg(theArgType: Interface_ParamType): void;

// Initializes the print mode 0 - don't print descriptions 1 - print only descriptions of record 2 - print descriptions of records and its arguments
SetModePrint(theMode: number): void;

// Returns mode print
GetModePrint(): number;

// Returns number of records
GetNbRecord(): number;

// Adds an error message
AddError(theErrorMessage: string): void;

// Transfers error messages to checker
ErrorHandle(theCheck: Interface_Check): boolean;

// Returns the message of the last error
GetLastError(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
