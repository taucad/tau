# libcascade — BinTools

13 top-level symbols. Signatures are verbatim typescript.

BinTools: declare class BinTools

constructor

static Write(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: BinTools_FormatVersion, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: BinTools_FormatVersion, theRange: Message_ProgressRange): boolean;

static Read(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;

delete(): void;

[Symbol.dispose](): void;

BinTools_Curve2dSet: declare class BinTools_Curve2dSet

constructor

Clear(): void;

Add(C: Geom2d_Curve): number;

Curve2d(I: number): Geom2d_Curve;

Index(C: Geom2d_Curve): number;

static WriteCurve2d(C: Geom2d_Curve, OS: BinTools_OStream): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_CurveSet: declare class BinTools_CurveSet

constructor

Clear(): void;

Add(C: Geom_Curve): number;

Curve(I: number): Geom_Curve;

Index(C: Geom_Curve): number;

static WriteCurve(C: Geom_Curve, OS: BinTools_OStream): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_FormatVersion: typeof BinTools_FormatVersion[keyof typeof BinTools_FormatVersion]

BinTools_IStream: declare class BinTools_IStream

ReadType(): BinTools_ObjectType;

LastType(): BinTools_ObjectType;

ShapeType(): TopAbs_ShapeEnum;

ShapeOrientation(): TopAbs_Orientation;

Position(): number;

GoTo(thePosition: number): void;

IsReference(): boolean;

ReadReference(): number;

UpdatePosition(): void;

ReadReal(): number;

ReadInteger(): number;

ReadPnt(): gp_Pnt;

ReadByte(): number;

ReadBool(): boolean;

ReadShortReal(): number;

ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean, theBool4?: boolean, theBool5?: boolean, theBool6?: boolean, theBool7?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean; theBool4: boolean; theBool5: boolean; theBool6: boolean; theBool7: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean };
ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean, theBool4?: boolean, theBool5?: boolean, theBool6?: boolean, theBool7?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean; theBool4: boolean; theBool5: boolean; theBool6: boolean; theBool7: boolean };

delete(): void;

[Symbol.dispose](): void;

BinTools_LocationSet: declare class BinTools_LocationSet

constructor

Clear(): void;

Add(L: TopLoc_Location): number;

Location(I: number): TopLoc_Location;

Index(L: TopLoc_Location): number;

NbLocations(): number;

delete(): void;

[Symbol.dispose](): void;

BinTools_OStream: declare class BinTools_OStream

Position(): number;

WriteReference(thePosition: number): void;

WriteShape(theType: TopAbs_ShapeEnum, theOrientation: TopAbs_Orientation): void;

PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean, theValue4: boolean, theValue5: boolean, theValue6: boolean, theValue7: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean): void;
PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean, theValue4: boolean, theValue5: boolean, theValue6: boolean, theValue7: boolean): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_ObjectType: typeof BinTools_ObjectType[keyof typeof BinTools_ObjectType]

BinTools_ShapeReader: declare class BinTools_ShapeReader extends BinTools_ShapeSetBase

constructor

Clear(): void;

ReadLocation(theStream: BinTools_IStream): TopLoc_Location;

delete(): void;

[Symbol.dispose](): void;

BinTools_ShapeSet: declare class BinTools_ShapeSet extends BinTools_ShapeSetBase

constructor

Clear(): void;

Add(S: TopoDS_Shape): number;

Shape(I: number): TopoDS_Shape;

Index(S: TopoDS_Shape): number;

Locations(): BinTools_LocationSet;

ChangeLocations(): BinTools_LocationSet;

NbShapes(): number;

AddShape(S: TopoDS_Shape): void;

AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_ShapeSetBase: declare class BinTools_ShapeSetBase

constructor

IsWithTriangles(): boolean;

IsWithNormals(): boolean;

SetWithTriangles(theWithTriangles: boolean): void;

SetWithNormals(theWithNormals: boolean): void;

SetFormatNb(theFormatNb: number): void;

FormatNb(): number;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_ShapeWriter: declare class BinTools_ShapeWriter extends BinTools_ShapeSetBase

constructor

Clear(): void;

WriteLocation(theStream: BinTools_OStream, theLocation: TopLoc_Location): void;

delete(): void;

[Symbol.dispose](): void;

BinTools_SurfaceSet: declare class BinTools_SurfaceSet

constructor

Clear(): void;

Add(S: Geom_Surface): number;

Surface(I: number): Geom_Surface;

Index(S: Geom_Surface): number;

static WriteSurface(S: Geom_Surface, OS: BinTools_OStream): void;

delete(): void;

[Symbol.dispose](): void;
