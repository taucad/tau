# libcascade — StepData (2)

2 top-level symbols. Signatures are verbatim typescript.

StepData_StepWriter: declare class StepData_StepWriter

  constructor

  LabelMode(): number;

  TypeMode(): number;

  FloatWriter(): Interface_FloatWriter;

  SetScope(numscope: number, numin: number): void;

  IsInScope(num: number): boolean;

  SendModel(protocol: StepData_Protocol, headeronly?: boolean): void;

  SendHeader(): void;

  SendData(): void;

  SendEntity(nument: number, lib: StepData_WriterLib): void;

  EndSec(): void;

  EndFile(): void;

  NewLine(evenempty: boolean): void;

  JoinLast(newline: boolean): void;

  Indent(onent: boolean): void;

  SendIdent(ident: number): void;

  SendScope(): void;

  SendEndscope(): void;

  Comment(mode: boolean): void;

  SendComment(text: TCollection_HAsciiString): void;
  SendComment(text: string): void;
  SendComment(text: TCollection_HAsciiString): void;
  SendComment(text: string): void;

  StartEntity(atype: TCollection_AsciiString): void;

  StartComplex(): void;

  EndComplex(): void;

  SendField(fild: StepData_Field, descr: StepData_PDescr): void;

  SendSelect(sm: StepData_SelectMember, descr: StepData_PDescr): void;

  SendList(list: StepData_FieldList, descr: StepData_ESDescr): void;

  OpenSub(): void;

  OpenTypedSub(subtype: string): void;

  CloseSub(): void;

  AddParam(): void;

  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_AsciiString): void;
  Send(val: Standard_Transient): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_AsciiString): void;
  Send(val: Standard_Transient): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_AsciiString): void;
  Send(val: Standard_Transient): void;
  Send(val: number): void;
  Send(val: number): void;
  Send(val: TCollection_AsciiString): void;
  Send(val: Standard_Transient): void;

  SendBoolean(val: boolean): void;

  SendLogical(val: StepData_Logical): void;

  SendString(val: TCollection_AsciiString): void;
  SendString(val: string): void;
  SendString(val: TCollection_AsciiString): void;
  SendString(val: string): void;

  SendEnum(val: TCollection_AsciiString): void;
  SendEnum(val: string): void;
  SendEnum(val: TCollection_AsciiString): void;
  SendEnum(val: string): void;

  SendArrReal(anArr: NCollection_HArray1_double): void;

  SendUndef(): void;

  SendDerived(): void;

  EndEntity(): void;

  NbLines(): number;

  Line(num: number): TCollection_HAsciiString;

  static CleanTextForSend(theText: TCollection_AsciiString): TCollection_AsciiString;

  delete(): void;

  [Symbol.dispose](): void;

StepData_WriterLib: declare class StepData_WriterLib

  constructor

  static SetGlobal(amodule: StepData_ReadWriteModule, aprotocol: StepData_Protocol): void;

  AddProtocol(aprotocol: Standard_Transient): void;

  Clear(): void;

  SetComplete(): void;

  Select(obj: Standard_Transient, CN?: number): { returnValue: boolean; module_: StepData_ReadWriteModule; CN: number; [Symbol.dispose](): void };

  Start(): void;

  More(): boolean;

  Next(): void;

  Module(): StepData_ReadWriteModule;

  Protocol(): StepData_Protocol;

  delete(): void;

  [Symbol.dispose](): void;
