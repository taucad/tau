# libcascade — XCAFNoteObjects

1 top-level symbols. Signatures are verbatim typescript.

XCAFNoteObjects_NoteObject: declare class XCAFNoteObjects_NoteObject extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  HasPlane(): boolean;

  GetPlane(): gp_Ax2;

  SetPlane(thePlane: gp_Ax2): void;

  HasPoint(): boolean;

  GetPoint(): gp_Pnt;

  SetPoint(thePnt: gp_Pnt): void;

  HasPointText(): boolean;

  GetPointText(): gp_Pnt;

  SetPointText(thePnt: gp_Pnt): void;

  GetPresentation(): TopoDS_Shape;

  SetPresentation(thePresentation: TopoDS_Shape): void;

  Reset(): void;

  delete(): void;

  [Symbol.dispose](): void;
