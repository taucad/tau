# libcascade — Law (2)

2 top-level symbols. Signatures are verbatim typescript.

// Describes an "S" evolution law
Law_S: declare class Law_S extends Law_BSpFunc

constructor

// Defines this S evolution law by assigning both
Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;
Set(Pdeb: number, Valdeb: number, Ddeb: number, Pfin: number, Valfin: number, Dfin: number): void;
Set(Pdeb: number, Valdeb: number, Pfin: number, Valfin: number): void;
Set(Pdeb: number, Valdeb: number, Ddeb: number, Pfin: number, Valfin: number, Dfin: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Law_Laws: NCollection_List_handle_Law_Function
