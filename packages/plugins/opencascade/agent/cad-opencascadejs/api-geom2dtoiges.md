# libcascade — Geom2dToIGES

4 top-level symbols. Signatures are verbatim typescript.

Geom2dToIGES_Geom2dCurve: declare class Geom2dToIGES_Geom2dCurve extends Geom2dToIGES_Geom2dEntity

constructor

Transfer2dCurve(start: Geom2d_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;

delete(): void;

[Symbol.dispose](): void;

Geom2dToIGES_Geom2dEntity: declare class Geom2dToIGES_Geom2dEntity

constructor

SetModel(model: IGESData_IGESModel): void;

GetModel(): IGESData_IGESModel;

SetUnit(unit: number): void;

GetUnit(): number;

delete(): void;

[Symbol.dispose](): void;

Geom2dToIGES_Geom2dPoint: declare class Geom2dToIGES_Geom2dPoint extends Geom2dToIGES_Geom2dEntity

constructor

Transfer2dPoint(start: Geom2d_Point): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_CartesianPoint): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_Point): IGESGeom_Point;
Transfer2dPoint(start: Geom2d_CartesianPoint): IGESGeom_Point;

delete(): void;

[Symbol.dispose](): void;

Geom2dToIGES_Geom2dVector: declare class Geom2dToIGES_Geom2dVector extends Geom2dToIGES_Geom2dEntity

constructor

Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Vector): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_VectorWithMagnitude): IGESGeom_Direction;
Transfer2dVector(start: Geom2d_Direction): IGESGeom_Direction;

delete(): void;

[Symbol.dispose](): void;
