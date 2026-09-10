# libcascade — GeomToIGES

3 top-level symbols. Signatures are verbatim typescript.

// This class implements the transfer of the Curve Entity from Geom To IGES
GeomToIGES_GeomCurve: declare class GeomToIGES_GeomCurve extends GeomToIGES_GeomEntity

constructor

// Transfer a GeometryEntity which answer True to the member
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Curve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BoundedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BSplineCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_BezierCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_TrimmedCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Conic, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Circle, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Ellipse, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Hyperbola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Line, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_Parabola, Udeb: number, Ufin: number): IGESData_IGESEntity;
TransferCurve(start: Geom_OffsetCurve, Udeb: number, Ufin: number): IGESData_IGESEntity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// provides methods to transfer Geom entity from CASCADE to IGES
GeomToIGES_GeomEntity: declare class GeomToIGES_GeomEntity

constructor

// Set the value of "TheModel"
SetModel(model: IGESData_IGESModel): void;

// Returns the value of "TheModel"
GetModel(): IGESData_IGESModel;

// Sets the value of the UnitFlag
SetUnit(unit: number): void;

// Returns the value of the UnitFlag of the header of the model in meters
GetUnit(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the transfer of the Point Entity from Geom to IGES
GeomToIGES_GeomPoint: declare class GeomToIGES_GeomPoint extends GeomToIGES_GeomEntity

constructor

// Transfer a Point from Geom to IGES
TransferPoint(start: Geom_Point): IGESGeom_Point;
TransferPoint(start: Geom_CartesianPoint): IGESGeom_Point;
TransferPoint(start: Geom_Point): IGESGeom_Point;
TransferPoint(start: Geom_CartesianPoint): IGESGeom_Point;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
