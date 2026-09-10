# libcascade — IGESToBRep

11 top-level symbols. Signatures are verbatim typescript.

// Provides tools in order to transfer IGES entities to CAS.CADE
IGESToBRep: declare class IGESToBRep

constructor

// Creates and initializes default AlgoContainer
static Init(): void;

// Sets default AlgoContainer
static SetAlgoContainer(aContainer: IGESToBRep_AlgoContainer): void;

// Returns default AlgoContainer
static AlgoContainer(): IGESToBRep_AlgoContainer;

// Return True if the IGESEntity can be transferred by TransferCurveAndSurface
static IsCurveAndSurface(start: IGESData_IGESEntity): boolean;

// Return True if the IGESEntity can be transferred by TransferBasicCurve
static IsBasicCurve(start: IGESData_IGESEntity): boolean;

// Return True if the IGESEntity can be transferred by TransferBasicSurface
static IsBasicSurface(start: IGESData_IGESEntity): boolean;

// Return True if the IGESEntity can be transferred by TransferTopoCurve
static IsTopoCurve(start: IGESData_IGESEntity): boolean;

// Return True if the IGESEntity can be transferred by TransferTopoSurface
static IsTopoSurface(start: IGESData_IGESEntity): boolean;

// Return True if the IGESEntity can be transferred by TransferBRepEntity
static IsBRepEntity(start: IGESData_IGESEntity): boolean;

static IGESCurveToSequenceOfIGESCurve(curve: IGESData_IGESEntity): { returnValue: number; sequence: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

static TransferPCurve(fromedge: TopoDS_Edge, toedge: TopoDS_Edge, face: TopoDS_Face): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class performs the transfer of an Entity from {@link IGESToBRep`IGESToBRep`}
IGESToBRep_Actor: declare class IGESToBRep_Actor extends Transfer_ActorOfTransientProcess

constructor

SetModel(model: Interface_InterfaceModel): void;

// --Purpose By default continuity = 0 if continuity = 1
SetContinuity(continuity?: number): void;

// Return "thecontinuity"
GetContinuity(): number;

// Prerequisite for Transfer
Recognize(start: Standard_Transient): boolean;

Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

// Returns the tolerance which was actually used, either from the file or from statics
UsedTolerance(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESToBRep_AlgoContainer: declare class IGESToBRep_AlgoContainer extends Standard_Transient

constructor

// Sets ToolContainer
SetToolContainer(TC: IGESToBRep_ToolContainer): void;

// Returns ToolContainer
ToolContainer(): IGESToBRep_ToolContainer;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to transfer BRep entities ( VertexList 502, EdgeList 504, Loop 508, Face 510, Shell 514, ManifoldSolid 186) from IGES to CASCADE
IGESToBRep_BRepEntity: declare class IGESToBRep_BRepEntity extends IGESToBRep_CurveAndSurface

constructor

// Transfer the BRepEntity"
TransferBRepEntity(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Transfer the entity number "index" of the VertexList "start"
TransferVertex(start: IGESSolid_VertexList, index: number): TopoDS_Vertex;

// Transfer the entity number "index" of the EdgeList "start"
TransferEdge(start: IGESSolid_EdgeList, index: number): TopoDS_Shape;

// Transfer the Loop Entity
TransferLoop(start: IGESSolid_Loop, Face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

// Transfer the Face Entity
TransferFace(start: IGESSolid_Face): TopoDS_Shape;

// Transfer the Shell Entity
TransferShell(start: IGESSolid_Shell, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Transfer the ManifoldSolid Entity
TransferManifoldSolid(start: IGESSolid_ManifoldSolid, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to transfer basic geometric curves entities from IGES to CASCADE
IGESToBRep_BasicCurve: declare class IGESToBRep_BasicCurve extends IGESToBRep_CurveAndSurface

constructor

// Transfer a IGESEntity which answer True to the member
TransferBasicCurve(start: IGESData_IGESEntity): Geom_Curve;

// Transfert a IGESEntity which answer True to the member
Transfer2dBasicCurve(start: IGESData_IGESEntity): Geom2d_Curve;

TransferBSplineCurve(start: IGESGeom_BSplineCurve): Geom_Curve;

Transfer2dBSplineCurve(start: IGESGeom_BSplineCurve): Geom2d_Curve;

TransferCircularArc(start: IGESGeom_CircularArc): Geom_Curve;

Transfer2dCircularArc(start: IGESGeom_CircularArc): Geom2d_Curve;

TransferConicArc(start: IGESGeom_ConicArc): Geom_Curve;

Transfer2dConicArc(start: IGESGeom_ConicArc): Geom2d_Curve;

TransferCopiousData(start: IGESGeom_CopiousData): Geom_BSplineCurve;

Transfer2dCopiousData(start: IGESGeom_CopiousData): Geom2d_BSplineCurve;

TransferLine(start: IGESGeom_Line): Geom_Curve;

Transfer2dLine(start: IGESGeom_Line): Geom2d_Curve;

TransferSplineCurve(start: IGESGeom_SplineCurve): Geom_BSplineCurve;

Transfer2dSplineCurve(start: IGESGeom_SplineCurve): Geom2d_BSplineCurve;

TransferTransformation(start: IGESGeom_TransformationMatrix): Geom_Transformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to transfer basic geometric surface entities from IGES to CASCADE
IGESToBRep_BasicSurface: declare class IGESToBRep_BasicSurface extends IGESToBRep_CurveAndSurface

constructor

// Returns Surface from Geom if the last transfer has succeeded
TransferBasicSurface(start: IGESData_IGESEntity): Geom_Surface;

// Returns Plane from Geom if the transfer has succeeded
TransferPlaneSurface(start: IGESSolid_PlaneSurface): Geom_Plane;

// Returns CylindricalSurface from Geom if the transfer has succeeded
TransferRigthCylindricalSurface(start: IGESSolid_CylindricalSurface): Geom_CylindricalSurface;

// Returns ConicalSurface from Geom if the transfer has succeeded
TransferRigthConicalSurface(start: IGESSolid_ConicalSurface): Geom_ConicalSurface;

// Returns SphericalSurface from Geom if the transfer has succeeded
TransferSphericalSurface(start: IGESSolid_SphericalSurface): Geom_SphericalSurface;

// Returns SphericalSurface from Geom if the transfer has succeeded
TransferToroidalSurface(start: IGESSolid_ToroidalSurface): Geom_ToroidalSurface;

// Returns BSplineSurface from Geom if the transfer has succeeded
TransferSplineSurface(start: IGESGeom_SplineSurface): Geom_BSplineSurface;

// Returns BSplineSurface from Geom if the transfer has succeeded
TransferBSplineSurface(start: IGESGeom_BSplineSurface): Geom_BSplineSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to transfer CurveAndSurface from IGES to CASCADE
IGESToBRep_CurveAndSurface: declare class IGESToBRep_CurveAndSurface

constructor

// Initializes the field of the tool CurveAndSurface with default creating values
Init(): void;

// Changes the value of "myEps"
SetEpsilon(eps: number): void;

// Returns the value of "myEps"
GetEpsilon(): number;

// Changes the value of "myEpsCoeff"
SetEpsCoeff(eps: number): void;

// Returns the value of "myEpsCoeff"
GetEpsCoeff(): number;

// Changes the value of "myEpsGeom"
SetEpsGeom(eps: number): void;

// Returns the value of "myEpsGeom"
GetEpsGeom(): number;

// Changes the value of "myMinTol"
SetMinTol(mintol: number): void;

// Changes the value of "myMaxTol"
SetMaxTol(maxtol: number): void;

// Sets values of "myMinTol" and "myMaxTol" as follows myMaxTol = Max ("read.maxprecision.val", myEpsGeom \* myUnitFactor) myMinTol = `Precision::Confusion()` Remark
UpdateMinMaxTol(): void;

// Returns the value of "myMinTol"
GetMinTol(): number;

// Returns the value of "myMaxTol"
GetMaxTol(): number;

// Changes the value of "myModeApprox"
SetModeApprox(mode: boolean): void;

// Returns the value of "myModeApprox"
GetModeApprox(): boolean;

// Changes the value of "myModeIsTopo"
SetModeTransfer(mode: boolean): void;

// Returns the value of "myModeIsTopo"
GetModeTransfer(): boolean;

// Changes the value of "myContIsOpti"
SetOptimized(optimized: boolean): void;

// Returns the value of "myContIsOpti"
GetOptimized(): boolean;

// Returns the value of " myUnitFactor"
GetUnitFactor(): number;

// Changes the value of "mySurfaceCurve"
SetSurfaceCurve(ival: number): void;

// Returns the value of "mySurfaceCurve" 0 = value in file, 2 = keep 2d and compute 3d, 3 = keep 3d and compute 2d
GetSurfaceCurve(): number;

// Set the value of "myModel"
SetModel(model: IGESData_IGESModel): void;

// Returns the value of "myModel"
GetModel(): IGESData_IGESModel;

// Changes the value of "myContinuity" if continuity = 0 do nothing else if continuity = 1 try C1 if continuity = 2 try C2
SetContinuity(continuity: number): void;

// Returns the value of "myContinuity"
GetContinuity(): number;

// Set the value of "myMsgReg"
SetTransferProcess(TP: Transfer_TransientProcess): void;

// Returns the value of "myMsgReg"
GetTransferProcess(): Transfer_TransientProcess;

// Returns the result of the transfert of any IGES Curve or Surface Entity
TransferCurveAndSurface(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Returns the result of the transfert the geometry of any IGESEntity
TransferGeometry(start: IGESData_IGESEntity, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Records a new Fail message
SendFail(start: IGESData_IGESEntity, amsg: Message_Msg): void;

// Records a new Warning message
SendWarning(start: IGESData_IGESEntity, amsg: Message_Msg): void;

// Records a new Information message from the definition of a Msg (Original+Value)
SendMsg(start: IGESData_IGESEntity, amsg: Message_Msg): void;

// Returns True if start was already treated and has a result in "myMap" else returns False
HasShapeResult(start: IGESData_IGESEntity): boolean;

// Returns the result of the transfer of the IGESEntity "start" contained in "myMap"
GetShapeResult(start: IGESData_IGESEntity): TopoDS_Shape;
GetShapeResult(start: IGESData_IGESEntity, num: number): TopoDS_Shape;
GetShapeResult(start: IGESData_IGESEntity): TopoDS_Shape;
GetShapeResult(start: IGESData_IGESEntity, num: number): TopoDS_Shape;

// set in "myMap" the result of the transfer of the IGESEntity "start"
SetShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

// Returns the number of shapes results contained in "myMap" for the IGESEntity start (type VertexList or EdgeList)
NbShapeResult(start: IGESData_IGESEntity): number;

// set in "myMap" the result of the transfer of the entity of the IGESEntity start (type VertexList or EdgeList)
AddShapeResult(start: IGESData_IGESEntity, result: TopoDS_Shape): void;

SetSurface(theSurface: Geom_Surface): void;

Surface(): Geom_Surface;

GetUVResolution(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to translate IGES boundary entity (142-CurveOnSurface, 141-Boundary or 508-Loop) into the wire
IGESToBRep_IGESBoundary: declare class IGESToBRep_IGESBoundary extends Standard_Transient

constructor

// Inits the object with parameters common for all types of IGES boundaries
Init(CS: IGESToBRep_CurveAndSurface, entity: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number, filepreference: number): void;

// Returns the resulting wire
WireData(): ShapeExtend_WireData;

// Returns the wire from 3D curves (edges contain 3D curves and may contain pcurves)
WireData3d(): ShapeExtend_WireData;

// Returns the wire from 2D curves (edges contain pcurves only)
WireData2d(): ShapeExtend_WireData;

// Translates 141 and 142 entities
Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: IGESData*IGESEntity, toreverse3d: boolean, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, number*: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean };
Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: ShapeExtend*WireData, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, toreverse2d: boolean, number*: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean; lsewd: ShapeExtend*WireData; [Symbol.dispose](): void };
Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: IGESData_IGESEntity, toreverse3d: boolean, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, number*: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean };
Transfer(okCurve: boolean, okCurve3d: boolean, okCurve2d: boolean, curve3d: ShapeExtend*WireData, curves2d: NCollection_HArray1_handle_IGESData_IGESEntity, toreverse2d: boolean, number*: number): { returnValue: boolean; okCurve: boolean; okCurve3d: boolean; okCurve2d: boolean; lsewd: ShapeExtend_WireData; [Symbol.dispose](): void };

// Checks result of translation of IGES boundary entities (types 141, 142 or 508)
Check(result: boolean, checkclosure: boolean, okCurve3d: boolean, okCurve2d: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A simple way to read geometric IGES data
IGESToBRep_Reader: declare class IGESToBRep_Reader

constructor

// Loads a Model from a file.Returns 0 if success
LoadFile(filename: string): number;

// Specifies a Model to work on Also clears the result and Done status, sets TransientProcess
SetModel(model: IGESData_IGESModel): void;

// Returns the Model to be worked on
Model(): IGESData_IGESModel;

// Allows to set an already defined TransientProcess (to be called after LoadFile or SetModel)
SetTransientProcess(TP: Transfer_TransientProcess): void;

// Returns the TransientProcess
TransientProcess(): Transfer_TransientProcess;

// Returns "theActor"
Actor(): IGESToBRep_Actor;

// Clears the results between two translation operations
Clear(): void;

// Checks the IGES file that was loaded into memory
Check(withprint: boolean): boolean;

// Translates root entities in an IGES file
TransferRoots(onlyvisible?: boolean, theProgress?: Message_ProgressRange): void;

// Transfers an Entity given its rank in the Model (Root or not) Returns True if it is recognized as Geom-Topol
Transfer(num: number, theProgress?: Message_ProgressRange): boolean;

// Returns True if the LAST Transfer/TransferRoots was a success
IsDone(): boolean;

// Returns the Tolerance which has been actually used, converted in millimeters (either that from File or that from Session, according the mode)
UsedTolerance(): number;

// Returns the number of shapes produced by the translation
NbShapes(): number;

// Returns the num the resulting shape in a translation operation
Shape(num?: number): TopoDS_Shape;

// Returns all of the results in a single shape which is
OneShape(): TopoDS_Shape;

// Sets parameters for shape processing
SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;
// theParameters: the parameters for shape processing

// Returns parameters for shape processing that was set by SetParameters() method
GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

// Sets flags defining operations to be performed on shapes
SetShapeProcessFlags(theFlags: any): void;
// theFlags: The flags defining operations to be performed on shapes

// Returns flags defining operations to be performed on shapes
GetShapeProcessFlags(): any;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESToBRep_ToolContainer: declare class IGESToBRep_ToolContainer extends Standard_Transient

constructor

// Returns {@link IGESToBRep_IGESBoundary`IGESToBRep_IGESBoundary`}
IGESBoundary(): IGESToBRep_IGESBoundary;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides methods to transfer topologic curves entities from IGES to CASCADE
IGESToBRep_TopoCurve: declare class IGESToBRep_TopoCurve extends IGESToBRep_CurveAndSurface

constructor

TransferTopoCurve(start: IGESData_IGESEntity): TopoDS_Shape;

Transfer2dTopoCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

TransferTopoBasicCurve(start: IGESData_IGESEntity): TopoDS_Shape;

Transfer2dTopoBasicCurve(start: IGESData_IGESEntity, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

TransferPoint(start: IGESGeom_Point): TopoDS_Vertex;

Transfer2dPoint(start: IGESGeom_Point): TopoDS_Vertex;

TransferCompositeCurve(start: IGESGeom_CompositeCurve): TopoDS_Shape;

Transfer2dCompositeCurve(start: IGESGeom_CompositeCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

TransferOffsetCurve(start: IGESGeom_OffsetCurve): TopoDS_Shape;

Transfer2dOffsetCurve(start: IGESGeom_OffsetCurve, face: TopoDS_Face, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;

TransferCurveOnSurface(start: IGESGeom_CurveOnSurface): TopoDS_Shape;

// Transfers a CurveOnSurface directly on a face to trim it
TransferCurveOnFace(face: TopoDS_Face, start: IGESGeom_CurveOnSurface, trans: gp_Trsf2d, uFact: number, IsCurv: boolean): TopoDS_Shape;
// face: Mutated in place

TransferBoundary(start: IGESGeom_Boundary): TopoDS_Shape;

// Transfers a Boundary directly on a face to trim it
TransferBoundaryOnFace(face: TopoDS_Face, start: IGESGeom_Boundary, trans: gp_Trsf2d, uFact: number): TopoDS_Shape;
// face: Mutated in place

ApproxBSplineCurve(start: Geom_BSplineCurve): void;

// Returns the count of Curves in "TheCurves"
NbCurves(): number;

// Returns a Curve given its rank, by default the first one (null Curvee if out of range) in "TheCurves"
Curve(num?: number): Geom_Curve;

Approx2dBSplineCurve(start: Geom2d_BSplineCurve): void;

// Returns the count of Curves in "TheCurves2d"
NbCurves2d(): number;

// Returns a Curve given its rank, by default the first one (null Curvee if out of range) in "TheCurves2d"
Curve2d(num?: number): Geom2d_Curve;

// Sets TheBadCase flag
SetBadCase(value: boolean): void;

// Returns TheBadCase flag
BadCase(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
