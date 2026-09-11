# libcascade — STEPEdit

3 top-level symbols. Signatures are verbatim typescript.

STEPEdit: declare class STEPEdit

constructor

static Protocol(): Interface_Protocol;

static NewModel(): StepData_StepModel;

static SignType(): IFSelect_Signature;

static NewSelectSDR(): IFSelect_SelectSignature;

static NewSelectPlacedItem(): IFSelect_SelectSignature;

static NewSelectShapeRepr(): IFSelect_SelectSignature;

delete(): void;

[Symbol.dispose](): void;

STEPEdit_EditContext: declare class STEPEdit_EditContext extends IFSelect_Editor

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

STEPEdit_EditSDR: declare class STEPEdit_EditSDR extends IFSelect_Editor

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
