# libcascade — StepData (2)

2 top-level symbols. Signatures are verbatim typescript.

StepData_StepWriter: declare class StepData_StepWriter

  // StepData_StepWriter.constructor (constructor)
  constructor(amodel: StepData_StepModel);

  // StepData_StepWriter.LabelMode (method)
  LabelMode(): number;

  // StepData_StepWriter.TypeMode (method)
  TypeMode(): number;

  // StepData_StepWriter.FloatWriter (method)
  FloatWriter(): Interface_FloatWriter;

  // StepData_StepWriter.SetScope (method)
  SetScope(numscope: number, numin: number): void;

  // StepData_StepWriter.IsInScope (method)
  IsInScope(num: number): boolean;

  // StepData_StepWriter.SendModel (method)
  SendModel(protocol: StepData_Protocol, headeronly?: boolean): void;

  // StepData_StepWriter.SendHeader (method)
  SendHeader(): void;

  // StepData_StepWriter.SendData (method)
  SendData(): void;

  // StepData_StepWriter.SendEntity (method)
  SendEntity(nument: number, lib: StepData_WriterLib): void;

  // StepData_StepWriter.EndSec (method)
  EndSec(): void;

  // StepData_StepWriter.EndFile (method)
  EndFile(): void;

  // StepData_StepWriter.NewLine (method)
  NewLine(evenempty: boolean): void;

  // StepData_StepWriter.JoinLast (method)
  JoinLast(newline: boolean): void;

  // StepData_StepWriter.Indent (method)
  Indent(onent: boolean): void;

  // StepData_StepWriter.SendIdent (method)
  SendIdent(ident: number): void;

  // StepData_StepWriter.SendScope (method)
  SendScope(): void;

  // StepData_StepWriter.SendEndscope (method)
  SendEndscope(): void;

  // StepData_StepWriter.Comment (method)
  Comment(mode: boolean): void;

  // StepData_StepWriter.SendComment (method)
  SendComment(text: TCollection_HAsciiString): void;
  SendComment(text: string): void;

  // StepData_StepWriter.StartEntity (method)
  StartEntity(atype: TCollection_AsciiString): void;

  // StepData_StepWriter.StartComplex (method)
  StartComplex(): void;

  // StepData_StepWriter.EndComplex (method)
  EndComplex(): void;

  // StepData_StepWriter.SendField (method)
  SendField(fild: StepData_Field, descr: StepData_PDescr): void;

  // StepData_StepWriter.SendSelect (method)
  SendSelect(sm: StepData_SelectMember, descr: StepData_PDescr): void;

  // StepData_StepWriter.SendList (method)
  SendList(list: StepData_FieldList, descr: StepData_ESDescr): void;

  // StepData_StepWriter.OpenSub (method)
  OpenSub(): void;

  // StepData_StepWriter.OpenTypedSub (method)
  OpenTypedSub(subtype: string): void;

  // StepData_StepWriter.CloseSub (method)
  CloseSub(): void;

  // StepData_StepWriter.AddParam (method)
  AddParam(): void;

  // StepData_StepWriter.Send (method)
  Send(val: number): void;
  Send(val: TCollection_AsciiString): void;
  Send(val: Standard_Transient): void;

  // StepData_StepWriter.SendBoolean (method)
  SendBoolean(val: boolean): void;

  // StepData_StepWriter.SendLogical (method)
  SendLogical(val: StepData_Logical): void;

  // StepData_StepWriter.SendString (method)
  SendString(val: TCollection_AsciiString): void;
  SendString(val: string): void;

  // StepData_StepWriter.SendEnum (method)
  SendEnum(val: TCollection_AsciiString): void;
  SendEnum(val: string): void;

  // StepData_StepWriter.SendArrReal (method)
  SendArrReal(anArr: NCollection_HArray1_double): void;

  // StepData_StepWriter.SendUndef (method)
  SendUndef(): void;

  // StepData_StepWriter.SendDerived (method)
  SendDerived(): void;

  // StepData_StepWriter.EndEntity (method)
  EndEntity(): void;

  // StepData_StepWriter.NbLines (method)
  NbLines(): number;

  // StepData_StepWriter.Line (method)
  Line(num: number): TCollection_HAsciiString;

  // StepData_StepWriter.CleanTextForSend (method)
  static CleanTextForSend(theText: TCollection_AsciiString): TCollection_AsciiString;

  // StepData_StepWriter.delete (method)
  delete(): void;

  // StepData_StepWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepData_WriterLib: declare class StepData_WriterLib

  // StepData_WriterLib.constructor (constructor)
  constructor();
  constructor(aprotocol: StepData_Protocol);

  // StepData_WriterLib.SetGlobal (method)
  static SetGlobal(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

  // StepData_WriterLib.AddProtocol (method)
  AddProtocol(aprotocol: Standard_Transient): void;

  // StepData_WriterLib.Clear (method)
  Clear(): void;

  // StepData_WriterLib.SetComplete (method)
  SetComplete(): void;

  // StepData_WriterLib.Select (method)
  Select(obj: Standard_Transient, CN?: number): { returnValue: boolean; module_: StepData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

  // StepData_WriterLib.Start (method)
  Start(): void;

  // StepData_WriterLib.More (method)
  More(): boolean;

  // StepData_WriterLib.Next (method)
  Next(): void;

  // StepData_WriterLib.Module (method)
  Module(): StepData_ReadWriteModule;

  // StepData_WriterLib.Protocol (method)
  Protocol(): StepData_Protocol;

  // StepData_WriterLib.delete (method)
  delete(): void;

  // StepData_WriterLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
