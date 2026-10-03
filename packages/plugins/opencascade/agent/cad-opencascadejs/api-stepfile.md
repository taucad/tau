# libcascade — StepFile

1 top-level symbols. Signatures are verbatim typescript.

StepFile_ReadData: declare class StepFile_ReadData

  // StepFile_ReadData.constructor (constructor)
  constructor();

  // StepFile_ReadData.CreateNewText (method)
  CreateNewText(theNewText: string, theLenText: number): void;

  // StepFile_ReadData.RecordNewEntity (method)
  RecordNewEntity(): void;

  // StepFile_ReadData.RecordIdent (method)
  RecordIdent(): void;

  // StepFile_ReadData.RecordType (method)
  RecordType(): void;

  // StepFile_ReadData.RecordListStart (method)
  RecordListStart(): void;

  // StepFile_ReadData.CreateNewArg (method)
  CreateNewArg(): void;

  // StepFile_ReadData.CreateErrorArg (method)
  CreateErrorArg(): void;

  // StepFile_ReadData.AddNewScope (method)
  AddNewScope(): void;

  // StepFile_ReadData.FinalOfScope (method)
  FinalOfScope(): void;

  // StepFile_ReadData.ClearRecorder (method)
  ClearRecorder(theMode: number): void;

  // StepFile_ReadData.GetArgDescription (method)
  GetArgDescription(theType: Interface_ParamType, theValue: string): boolean;

  // StepFile_ReadData.GetFileNbR (method)
  GetFileNbR(theNbHead: number, theNbRec: number, theNbPage: number): void;

  // StepFile_ReadData.GetRecordDescription (method)
  GetRecordDescription(theIdent: string, theType: string, theNbArg: number): boolean;

  // StepFile_ReadData.RecordTypeText (method)
  RecordTypeText(): void;

  // StepFile_ReadData.NextRecord (method)
  NextRecord(): void;

  // StepFile_ReadData.PrintCurrentRecord (method)
  PrintCurrentRecord(): void;

  // StepFile_ReadData.PrepareNewArg (method)
  PrepareNewArg(): void;

  // StepFile_ReadData.FinalOfHead (method)
  FinalOfHead(): void;

  // StepFile_ReadData.SetTypeArg (method)
  SetTypeArg(theArgType: Interface_ParamType): void;

  // StepFile_ReadData.SetModePrint (method)
  SetModePrint(theMode: number): void;

  // StepFile_ReadData.GetModePrint (method)
  GetModePrint(): number;

  // StepFile_ReadData.GetNbRecord (method)
  GetNbRecord(): number;

  // StepFile_ReadData.AddError (method)
  AddError(theErrorMessage: string): void;

  // StepFile_ReadData.ErrorHandle (method)
  ErrorHandle(theCheck: Interface_Check): boolean;

  // StepFile_ReadData.GetLastError (method)
  GetLastError(): string;

  // StepFile_ReadData.delete (method)
  delete(): void;

  // StepFile_ReadData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
