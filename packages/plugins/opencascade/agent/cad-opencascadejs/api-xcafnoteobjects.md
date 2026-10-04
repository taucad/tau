# libcascade — XCAFNoteObjects

1 top-level symbols. Signatures are verbatim typescript.

XCAFNoteObjects_NoteObject: declare class XCAFNoteObjects_NoteObject extends Standard_Transient

  // XCAFNoteObjects_NoteObject.constructor (constructor)
  constructor();
  constructor(theObj: XCAFNoteObjects_NoteObject);

  // XCAFNoteObjects_NoteObject.get_type_name (method)
  static get_type_name(): string;

  // XCAFNoteObjects_NoteObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFNoteObjects_NoteObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFNoteObjects_NoteObject.HasPlane (method)
  HasPlane(): boolean;

  // XCAFNoteObjects_NoteObject.GetPlane (method)
  GetPlane(): gp_Ax2;

  // XCAFNoteObjects_NoteObject.SetPlane (method)
  SetPlane(thePlane: gp_Ax2): void;

  // XCAFNoteObjects_NoteObject.HasPoint (method)
  HasPoint(): boolean;

  // XCAFNoteObjects_NoteObject.GetPoint (method)
  GetPoint(): gp_Pnt;

  // XCAFNoteObjects_NoteObject.SetPoint (method)
  SetPoint(thePnt: gp_Pnt): void;

  // XCAFNoteObjects_NoteObject.HasPointText (method)
  HasPointText(): boolean;

  // XCAFNoteObjects_NoteObject.GetPointText (method)
  GetPointText(): gp_Pnt;

  // XCAFNoteObjects_NoteObject.SetPointText (method)
  SetPointText(thePnt: gp_Pnt): void;

  // XCAFNoteObjects_NoteObject.GetPresentation (method)
  GetPresentation(): TopoDS_Shape;

  // XCAFNoteObjects_NoteObject.SetPresentation (method)
  SetPresentation(thePresentation: TopoDS_Shape): void;

  // XCAFNoteObjects_NoteObject.Reset (method)
  Reset(): void;

  // XCAFNoteObjects_NoteObject.delete (method)
  delete(): void;

  // XCAFNoteObjects_NoteObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
