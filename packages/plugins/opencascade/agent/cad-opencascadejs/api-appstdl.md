# libcascade — AppStdL

1 top-level symbols. Signatures are verbatim typescript.

// Legacy class defining resources name for lite OCAF documents
AppStdL_Application: declare class AppStdL_Application extends TDocStd_Application

constructor

// returns the file name which contains application resources
ResourcesName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
