# libcascade — XCAFApp

1 top-level symbols. Signatures are verbatim typescript.

// Implements an Application for the DECAF documents
XCAFApp_Application: declare class XCAFApp_Application extends TDocStd_Application

// **methods from TDocStd_Application**
ResourcesName(): string;

// Set {@link XCAFDoc_DocumentTool `XCAFDoc_DocumentTool`} attribute
InitDocument(theDoc: CDM_Document): void;

// Initializes (for the first time) and returns the static object ({@link XCAFApp_Application`XCAFApp_Application`}) This is the only valid method to get {@link XCAFApp_Application`XCAFApp_Application`} object, and it should be called at least once before any actions with documents in order to init application
static GetApplication(): XCAFApp_Application;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
