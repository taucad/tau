# libcascade — XCAFApp

1 top-level symbols. Signatures are verbatim typescript.

XCAFApp_Application: declare class XCAFApp_Application extends TDocStd_Application

ResourcesName(): string;

InitDocument(theDoc: CDM_Document): void;

static GetApplication(): XCAFApp_Application;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
