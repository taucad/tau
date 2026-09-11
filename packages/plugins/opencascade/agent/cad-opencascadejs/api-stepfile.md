# libcascade — StepFile

1 top-level symbols. Signatures are verbatim typescript.

StepFile_ReadData: declare class StepFile_ReadData

constructor

CreateNewText(theNewText: string, theLenText: number): void;

RecordNewEntity(): void;

RecordIdent(): void;

RecordType(): void;

RecordListStart(): void;

CreateNewArg(): void;

CreateErrorArg(): void;

AddNewScope(): void;

FinalOfScope(): void;

ClearRecorder(theMode: number): void;

GetArgDescription(theType: Interface_ParamType, theValue: string): boolean;

GetFileNbR(theNbHead: number, theNbRec: number, theNbPage: number): void;

GetRecordDescription(theIdent: string, theType: string, theNbArg: number): boolean;

RecordTypeText(): void;

NextRecord(): void;

PrintCurrentRecord(): void;

PrepareNewArg(): void;

FinalOfHead(): void;

SetTypeArg(theArgType: Interface_ParamType): void;

SetModePrint(theMode: number): void;

GetModePrint(): number;

GetNbRecord(): number;

AddError(theErrorMessage: string): void;

ErrorHandle(theCheck: Interface_Check): boolean;

GetLastError(): string;

delete(): void;

[Symbol.dispose](): void;
