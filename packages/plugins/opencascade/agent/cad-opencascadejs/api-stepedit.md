# libcascade — STEPEdit

3 top-level symbols. Signatures are verbatim typescript.

STEPEdit: declare class STEPEdit

  // STEPEdit.constructor (constructor)
  constructor();

  // STEPEdit.Protocol (method)
  static Protocol(): Interface_Protocol;

  // STEPEdit.NewModel (method)
  static NewModel(): StepData_StepModel;

  // STEPEdit.SignType (method)
  static SignType(): IFSelect_Signature;

  // STEPEdit.NewSelectSDR (method)
  static NewSelectSDR(): IFSelect_SelectSignature;

  // STEPEdit.NewSelectPlacedItem (method)
  static NewSelectPlacedItem(): IFSelect_SelectSignature;

  // STEPEdit.NewSelectShapeRepr (method)
  static NewSelectShapeRepr(): IFSelect_SelectSignature;

  // STEPEdit.delete (method)
  delete(): void;

  // STEPEdit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPEdit_EditContext: declare class STEPEdit_EditContext extends IFSelect_Editor

  // STEPEdit_EditContext.constructor (constructor)
  constructor();

  // STEPEdit_EditContext.Label (method)
  Label(): TCollection_AsciiString;

  // STEPEdit_EditContext.get_type_name (method)
  static get_type_name(): string;

  // STEPEdit_EditContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPEdit_EditContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPEdit_EditContext.delete (method)
  delete(): void;

  // STEPEdit_EditContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

STEPEdit_EditSDR: declare class STEPEdit_EditSDR extends IFSelect_Editor

  // STEPEdit_EditSDR.constructor (constructor)
  constructor();

  // STEPEdit_EditSDR.Label (method)
  Label(): TCollection_AsciiString;

  // STEPEdit_EditSDR.get_type_name (method)
  static get_type_name(): string;

  // STEPEdit_EditSDR.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // STEPEdit_EditSDR.DynamicType (method)
  DynamicType(): Standard_Type;

  // STEPEdit_EditSDR.delete (method)
  delete(): void;

  // STEPEdit_EditSDR.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
