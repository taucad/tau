# libcascade — Geom2dToIGES

4 top-level symbols. Signatures are verbatim typescript.

// This class implements the transfer of the Curve Entity from Geom2d To IGES
Geom2dToIGES_Geom2dCurve: declare class Geom2dToIGES_Geom2dCurve extends Geom2dToIGES_Geom2dEntity

constructor

// Transfer an Entity from Geom2d to IGES
Transfer2dCurve(start: Geom2d_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// provides methods to transfer Geom2d entity from CASCADE to IGES
Geom2dToIGES_Geom2dEntity: declare class Geom2dToIGES_Geom2dEntity

constructor

// Set the value of "TheModel"
SetModel(model: IGESData_IGESModel): void;

// Returns the value of "TheModel"
GetModel(): IGESData_IGESModel;

// Sets the value of the UnitFlag
SetUnit(unit: number): void;

// Returns the value of the UnitFlag of the header of the model in millimeters
GetUnit(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of the Point Entity from Geom2d to IGES
Geom2dToIGES_Geom2dPoint: declare class Geom2dToIGES_Geom2dPoint extends Geom2dToIGES_Geom2dEntity

constructor

// Transfer a Point from Geom to IGES
Transfer2dPoint(start: Geom2d_Point): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_CartesianPoint): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_Point): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_CartesianPoint): IGESGeom_Point;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of the Vector from Geom2d to IGES
Geom2dToIGES_Geom2dVector: declare class Geom2dToIGES_Geom2dVector extends Geom2dToIGES_Geom2dEntity

constructor

// Transfer a GeometryEntity which answer True to the member
Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
