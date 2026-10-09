# libcascade — BinTools

13 top-level symbols. Signatures are verbatim typescript.

BinTools: declare class BinTools

  // BinTools.constructor (constructor)
  constructor();

  // BinTools.Write (method)
  static Write(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;
  static Write(theShape: TopoDS_Shape, theFile: string, theWithTriangles: boolean, theWithNormals: boolean, theVersion: BinTools_FormatVersion, theRange: Message_ProgressRange): boolean;

  // BinTools.Read (method)
  static Read(theShape: TopoDS_Shape, theFile: string, theRange: Message_ProgressRange): boolean;

  // BinTools.delete (method)
  delete(): void;

  // BinTools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_Curve2dSet: declare class BinTools_Curve2dSet

  // BinTools_Curve2dSet.constructor (constructor)
  constructor();

  // BinTools_Curve2dSet.Clear (method)
  Clear(): void;

  // BinTools_Curve2dSet.Add (method)
  Add(C: Geom2d_Curve): number;

  // BinTools_Curve2dSet.Curve2d (method)
  Curve2d(I: number): Geom2d_Curve;

  // BinTools_Curve2dSet.Index (method)
  Index(C: Geom2d_Curve): number;

  // BinTools_Curve2dSet.WriteCurve2d (method)
  static WriteCurve2d(C: Geom2d_Curve, OS: BinTools_OStream): void;

  // BinTools_Curve2dSet.delete (method)
  delete(): void;

  // BinTools_Curve2dSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_CurveSet: declare class BinTools_CurveSet

  // BinTools_CurveSet.constructor (constructor)
  constructor();

  // BinTools_CurveSet.Clear (method)
  Clear(): void;

  // BinTools_CurveSet.Add (method)
  Add(C: Geom_Curve): number;

  // BinTools_CurveSet.Curve (method)
  Curve(I: number): Geom_Curve;

  // BinTools_CurveSet.Index (method)
  Index(C: Geom_Curve): number;

  // BinTools_CurveSet.WriteCurve (method)
  static WriteCurve(C: Geom_Curve, OS: BinTools_OStream): void;

  // BinTools_CurveSet.delete (method)
  delete(): void;

  // BinTools_CurveSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_FormatVersion: typeof BinTools_FormatVersion[keyof typeof BinTools_FormatVersion]

  readonly BinTools_FormatVersion_VERSION_1: 'BinTools_FormatVersion_VERSION_1'

  readonly BinTools_FormatVersion_VERSION_2: 'BinTools_FormatVersion_VERSION_2'

  readonly BinTools_FormatVersion_VERSION_3: 'BinTools_FormatVersion_VERSION_3'

  readonly BinTools_FormatVersion_VERSION_4: 'BinTools_FormatVersion_VERSION_4'

  readonly BinTools_FormatVersion_CURRENT: 'BinTools_FormatVersion_CURRENT'

BinTools_IStream: declare class BinTools_IStream

  // BinTools_IStream.ReadType (method)
  ReadType(): BinTools_ObjectType;

  // BinTools_IStream.LastType (method)
  LastType(): BinTools_ObjectType;

  // BinTools_IStream.ShapeType (method)
  ShapeType(): TopAbs_ShapeEnum;

  // BinTools_IStream.ShapeOrientation (method)
  ShapeOrientation(): TopAbs_Orientation;

  // BinTools_IStream.Position (method)
  Position(): number;

  // BinTools_IStream.GoTo (method)
  GoTo(thePosition: number): void;

  // BinTools_IStream.IsReference (method)
  IsReference(): boolean;

  // BinTools_IStream.ReadReference (method)
  ReadReference(): number;

  // BinTools_IStream.UpdatePosition (method)
  UpdatePosition(): void;

  // BinTools_IStream.ReadReal (method)
  ReadReal(): number;

  // BinTools_IStream.ReadInteger (method)
  ReadInteger(): number;

  // BinTools_IStream.ReadPnt (method)
  ReadPnt(): gp_Pnt;

  // BinTools_IStream.ReadByte (method)
  ReadByte(): number;

  // BinTools_IStream.ReadBool (method)
  ReadBool(): boolean;

  // BinTools_IStream.ReadShortReal (method)
  ReadShortReal(): number;

  // BinTools_IStream.ReadBools (method)
  ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean };
  ReadBools(theBool1?: boolean, theBool2?: boolean, theBool3?: boolean, theBool4?: boolean, theBool5?: boolean, theBool6?: boolean, theBool7?: boolean): { theBool1: boolean; theBool2: boolean; theBool3: boolean; theBool4: boolean; theBool5: boolean; theBool6: boolean; theBool7: boolean };

  // BinTools_IStream.delete (method)
  delete(): void;

  // BinTools_IStream.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_LocationSet: declare class BinTools_LocationSet

  // BinTools_LocationSet.constructor (constructor)
  constructor();

  // BinTools_LocationSet.Clear (method)
  Clear(): void;

  // BinTools_LocationSet.Add (method)
  Add(L: TopLoc_Location): number;

  // BinTools_LocationSet.Location (method)
  Location(I: number): TopLoc_Location;

  // BinTools_LocationSet.Index (method)
  Index(L: TopLoc_Location): number;

  // BinTools_LocationSet.NbLocations (method)
  NbLocations(): number;

  // BinTools_LocationSet.delete (method)
  delete(): void;

  // BinTools_LocationSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_OStream: declare class BinTools_OStream

  // BinTools_OStream.Position (method)
  Position(): number;

  // BinTools_OStream.WriteReference (method)
  WriteReference(thePosition: number): void;

  // BinTools_OStream.WriteShape (method)
  WriteShape(theType: TopAbs_ShapeEnum, theOrientation: TopAbs_Orientation): void;

  // BinTools_OStream.PutBools (method)
  PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean): void;
  PutBools(theValue1: boolean, theValue2: boolean, theValue3: boolean, theValue4: boolean, theValue5: boolean, theValue6: boolean, theValue7: boolean): void;

  // BinTools_OStream.delete (method)
  delete(): void;

  // BinTools_OStream.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_ObjectType: typeof BinTools_ObjectType[keyof typeof BinTools_ObjectType]

  readonly BinTools_ObjectType_Unknown: 'BinTools_ObjectType_Unknown'

  readonly BinTools_ObjectType_Reference8: 'BinTools_ObjectType_Reference8'

  readonly BinTools_ObjectType_Reference16: 'BinTools_ObjectType_Reference16'

  readonly BinTools_ObjectType_Reference32: 'BinTools_ObjectType_Reference32'

  readonly BinTools_ObjectType_Reference64: 'BinTools_ObjectType_Reference64'

  readonly BinTools_ObjectType_Location: 'BinTools_ObjectType_Location'

  readonly BinTools_ObjectType_SimpleLocation: 'BinTools_ObjectType_SimpleLocation'

  readonly BinTools_ObjectType_EmptyLocation: 'BinTools_ObjectType_EmptyLocation'

  readonly BinTools_ObjectType_LocationEnd: 'BinTools_ObjectType_LocationEnd'

  readonly BinTools_ObjectType_Curve: 'BinTools_ObjectType_Curve'

  readonly BinTools_ObjectType_EmptyCurve: 'BinTools_ObjectType_EmptyCurve'

  readonly BinTools_ObjectType_Curve2d: 'BinTools_ObjectType_Curve2d'

  readonly BinTools_ObjectType_EmptyCurve2d: 'BinTools_ObjectType_EmptyCurve2d'

  readonly BinTools_ObjectType_Surface: 'BinTools_ObjectType_Surface'

  readonly BinTools_ObjectType_EmptySurface: 'BinTools_ObjectType_EmptySurface'

  readonly BinTools_ObjectType_Polygon3d: 'BinTools_ObjectType_Polygon3d'

  readonly BinTools_ObjectType_EmptyPolygon3d: 'BinTools_ObjectType_EmptyPolygon3d'

  readonly BinTools_ObjectType_PolygonOnTriangulation: 'BinTools_ObjectType_PolygonOnTriangulation'

  readonly BinTools_ObjectType_EmptyPolygonOnTriangulation: 'BinTools_ObjectType_EmptyPolygonOnTriangulation'

  readonly BinTools_ObjectType_Triangulation: 'BinTools_ObjectType_Triangulation'

  readonly BinTools_ObjectType_EmptyTriangulation: 'BinTools_ObjectType_EmptyTriangulation'

  readonly BinTools_ObjectType_EmptyShape: 'BinTools_ObjectType_EmptyShape'

  readonly BinTools_ObjectType_EndShape: 'BinTools_ObjectType_EndShape'

BinTools_ShapeReader: declare class BinTools_ShapeReader extends BinTools_ShapeSetBase

  // BinTools_ShapeReader.constructor (constructor)
  constructor();

  // BinTools_ShapeReader.Clear (method)
  Clear(): void;

  // BinTools_ShapeReader.ReadLocation (method)
  ReadLocation(theStream: BinTools_IStream): TopLoc_Location;

  // BinTools_ShapeReader.delete (method)
  delete(): void;

  // BinTools_ShapeReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_ShapeSet: declare class BinTools_ShapeSet extends BinTools_ShapeSetBase

  // BinTools_ShapeSet.constructor (constructor)
  constructor();

  // BinTools_ShapeSet.Clear (method)
  Clear(): void;

  // BinTools_ShapeSet.Add (method)
  Add(S: TopoDS_Shape): number;

  // BinTools_ShapeSet.Shape (method)
  Shape(I: number): TopoDS_Shape;

  // BinTools_ShapeSet.Index (method)
  Index(S: TopoDS_Shape): number;

  // BinTools_ShapeSet.Locations (method)
  Locations(): BinTools_LocationSet;

  // BinTools_ShapeSet.ChangeLocations (method)
  ChangeLocations(): BinTools_LocationSet;

  // BinTools_ShapeSet.NbShapes (method)
  NbShapes(): number;

  // BinTools_ShapeSet.AddShape (method)
  AddShape(S: TopoDS_Shape): void;

  // BinTools_ShapeSet.AddShapes (method)
  AddShapes(S1: TopoDS_Shape, S2: TopoDS_Shape): void;

  // BinTools_ShapeSet.delete (method)
  delete(): void;

  // BinTools_ShapeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_ShapeSetBase: declare class BinTools_ShapeSetBase

  // BinTools_ShapeSetBase.constructor (constructor)
  constructor();

  // BinTools_ShapeSetBase.IsWithTriangles (method)
  IsWithTriangles(): boolean;

  // BinTools_ShapeSetBase.IsWithNormals (method)
  IsWithNormals(): boolean;

  // BinTools_ShapeSetBase.SetWithTriangles (method)
  SetWithTriangles(theWithTriangles: boolean): void;

  // BinTools_ShapeSetBase.SetWithNormals (method)
  SetWithNormals(theWithNormals: boolean): void;

  // BinTools_ShapeSetBase.SetFormatNb (method)
  SetFormatNb(theFormatNb: number): void;

  // BinTools_ShapeSetBase.FormatNb (method)
  FormatNb(): number;

  // BinTools_ShapeSetBase.Clear (method)
  Clear(): void;

  // BinTools_ShapeSetBase.delete (method)
  delete(): void;

  // BinTools_ShapeSetBase.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_ShapeWriter: declare class BinTools_ShapeWriter extends BinTools_ShapeSetBase

  // BinTools_ShapeWriter.constructor (constructor)
  constructor();

  // BinTools_ShapeWriter.Clear (method)
  Clear(): void;

  // BinTools_ShapeWriter.WriteLocation (method)
  WriteLocation(theStream: BinTools_OStream, theLocation: TopLoc_Location): void;

  // BinTools_ShapeWriter.delete (method)
  delete(): void;

  // BinTools_ShapeWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BinTools_SurfaceSet: declare class BinTools_SurfaceSet

  // BinTools_SurfaceSet.constructor (constructor)
  constructor();

  // BinTools_SurfaceSet.Clear (method)
  Clear(): void;

  // BinTools_SurfaceSet.Add (method)
  Add(S: Geom_Surface): number;

  // BinTools_SurfaceSet.Surface (method)
  Surface(I: number): Geom_Surface;

  // BinTools_SurfaceSet.Index (method)
  Index(S: Geom_Surface): number;

  // BinTools_SurfaceSet.WriteSurface (method)
  static WriteSurface(S: Geom_Surface, OS: BinTools_OStream): void;

  // BinTools_SurfaceSet.delete (method)
  delete(): void;

  // BinTools_SurfaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
