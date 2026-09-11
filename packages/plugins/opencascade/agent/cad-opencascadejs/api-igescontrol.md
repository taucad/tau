# libcascade — IGESControl

7 top-level symbols. Signatures are verbatim typescript.

IGESControl_ActorWrite: declare class IGESControl_ActorWrite extends Transfer_ActorOfFinderProcess

constructor

Recognize(start: Transfer_Finder): boolean;

Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESControl_AlgoContainer: declare class IGESControl_AlgoContainer extends IGESToBRep_AlgoContainer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESControl_Controller: declare class IGESControl_Controller extends XSControl_Controller

constructor

NewModel(): Interface_InterfaceModel;

ActorRead(model: Interface_InterfaceModel): Transfer_ActorOfTransientProcess;

TransferWriteShape(shape: TopoDS_Shape, FP: Transfer_FinderProcess, model: Interface_InterfaceModel, modetrans?: number, theProgress?: Message_ProgressRange): IFSelect_ReturnStatus;

static Init(): boolean;

Customise(): { WS: XSControl_WorkSession; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESControl_IGESBoundary: declare class IGESControl_IGESBoundary extends IGESToBRep_IGESBoundary

constructor

Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESControl_Reader: declare class IGESControl_Reader extends XSControl_Reader

constructor

SetReadVisible(ReadRoot: boolean): void;

GetReadVisible(): boolean;

IGESModel(): IGESData_IGESModel;

NbRootsForTransfer(): number;

PrintTransferInfo(failwarn: IFSelect_PrintFail, mode: IFSelect_PrintCount): void;

delete(): void;

[Symbol.dispose](): void;

IGESControl_ToolContainer: declare class IGESControl_ToolContainer extends IGESToBRep_ToolContainer

constructor

IGESBoundary(): IGESToBRep_IGESBoundary;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IGESControl_Writer: declare class IGESControl_Writer

constructor

Model(): IGESData_IGESModel;

TransferProcess(): Transfer_FinderProcess;

SetTransferProcess(TP: Transfer_FinderProcess): void;

AddShape(sh: TopoDS_Shape, theProgress?: Message_ProgressRange): boolean;

AddGeom(geom: Standard_Transient): boolean;

AddEntity(ent: IGESData_IGESEntity): boolean;

ComputeModel(): void;

Write(file: string, fnes: boolean): boolean;

SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

SetShapeProcessFlags(theFlags: any): void;

GetShapeProcessFlags(): any;

delete(): void;

[Symbol.dispose](): void;
