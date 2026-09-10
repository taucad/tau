# libcascade — STEPEdit

3 top-level symbols. Signatures are verbatim typescript.

// Provides tools to exploit and edit a set of STEP data
STEPEdit: declare class STEPEdit

constructor

// Returns a Protocol fit for STEP (creates the first time)
static Protocol(): Interface_Protocol;

// Returns a new empty StepModel fit for STEP i.e
static NewModel(): StepData_StepModel;

// Returns a SignType fit for STEP (creates the first time)
static SignType(): IFSelect_Signature;

// Creates a Selection for ShapeDefinitionRepresentation By default searches among root entities
static NewSelectSDR(): IFSelect_SelectSignature;

// Creates a Selection for Placed Items, i.e
static NewSelectPlacedItem(): IFSelect_SelectSignature;

// Creates a Selection for ShapeRepresentation and its sub-types, plus ContextDependentShapeRepresentation (which is not a sub-type of ShapeRepresentation) By default in the whole StepModel
static NewSelectShapeRepr(): IFSelect_SelectSignature;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// EditContext is an Editor fit for Product Definition Context (one per Model) , i.e
STEPEdit_EditContext: declare class STEPEdit_EditContext extends IFSelect_Editor

constructor

// Returns the specific label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// EditSDR is an Editor fit for a Shape Definition Representation which designates a Product Definition
STEPEdit_EditSDR: declare class STEPEdit_EditSDR extends IFSelect_Editor

constructor

// Returns the specific label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
