# libcascade — BRepPrimAPI

12 top-level symbols. Signatures are verbatim typescript.

// Describes functions to build parallelepiped boxes
BRepPrimAPI_MakeBox: declare class BRepPrimAPI_MakeBox extends BRepBuilderAPI_MakeShape

constructor

// Init a box with corners thePnt1, thePnt2
Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
Init(theDX: number, theDY: number, theDZ: number): void;
Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
Init(theDX: number, theDY: number, theDZ: number): void;
Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
Init(theDX: number, theDY: number, theDZ: number): void;
Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
Init(theDX: number, theDY: number, theDZ: number): void;
Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;

// Returns the internal algorithm
Wedge(): BRepPrim_Wedge;

// Stores the solid in myShape
Build(theRange?: Message_ProgressRange): void;

// Returns the constructed box as a shell
Shell(): TopoDS_Shell;

// Returns the constructed box as a solid
Solid(): TopoDS_Solid;

// Returns ZMin face
BottomFace(): TopoDS_Face;

// Returns XMin face
BackFace(): TopoDS_Face;

// Returns XMax face
FrontFace(): TopoDS_Face;

// Returns YMin face
LeftFace(): TopoDS_Face;

// Returns YMax face
RightFace(): TopoDS_Face;

// Returns ZMax face
TopFace(): TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build cones or portions of cones
BRepPrimAPI_MakeCone: declare class BRepPrimAPI_MakeCone extends BRepPrimAPI_MakeOneAxis

constructor

// Returns the algorithm
Cone(): BRepPrim_Cone;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build cylinders or portions of cylinders
BRepPrimAPI_MakeCylinder: declare class BRepPrimAPI_MakeCylinder extends BRepPrimAPI_MakeOneAxis

constructor

// Returns the algorithm
Cylinder(): BRepPrim_Cylinder;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build half-spaces
BRepPrimAPI_MakeHalfSpace: declare class BRepPrimAPI_MakeHalfSpace extends BRepBuilderAPI_MakeShape

constructor

// Returns the constructed half-space as a solid
Solid(): TopoDS_Solid;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class MakeOneAxis is the root class of algorithms used to construct rotational primitives
BRepPrimAPI_MakeOneAxis: declare class BRepPrimAPI_MakeOneAxis extends BRepBuilderAPI_MakeShape

// Stores the solid in myShape
Build(theRange?: Message_ProgressRange): void;

// Returns the lateral face of the rotational primitive
Face(): TopoDS_Face;

// Returns the constructed rotational primitive as a shell
Shell(): TopoDS_Shell;

// Returns the constructed rotational primitive as a solid
Solid(): TopoDS_Solid;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build linear swept topologies, called prisms
BRepPrimAPI_MakePrism: declare class BRepPrimAPI_MakePrism extends BRepPrimAPI_MakeSweep

constructor

// Returns the internal sweeping algorithm
Prism(): BRepSweep_Prism;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// Returns the `TopoDS` Shape of the bottom of the prism
FirstShape(): TopoDS_Shape;
FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
FirstShape(): TopoDS_Shape;
FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns the `TopoDS` Shape of the top of the prism
LastShape(): TopoDS_Shape;
LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
LastShape(): TopoDS_Shape;
LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns ListOfShape from {@link TopTools `TopTools`}
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class to make revolved sweep topologies
BRepPrimAPI_MakeRevol: declare class BRepPrimAPI_MakeRevol extends BRepPrimAPI_MakeSweep

constructor

// Returns the internal sweeping algorithm
Revol(): BRepSweep_Revol;

// Builds the resulting shape (redefined from MakeShape)
Build(theRange?: Message_ProgressRange): void;

// Returns the first shape of the revol (coinciding with the generating shape)
FirstShape(): TopoDS_Shape;
FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
FirstShape(): TopoDS_Shape;
FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns the `TopoDS` Shape of the end of the revol
LastShape(): TopoDS_Shape;
LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
LastShape(): TopoDS_Shape;
LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns list of shape generated from shape S Warning
Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// Returns true if the shape S has been deleted
IsDeleted(S: TopoDS_Shape): boolean;

// Check if there are degenerated edges in the result
HasDegenerated(): boolean;

// Returns the list of degenerated edges
Degenerated(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build revolved shapes
BRepPrimAPI_MakeRevolution: declare class BRepPrimAPI_MakeRevolution extends BRepPrimAPI_MakeOneAxis

constructor

// Returns the algorithm
Revolution(): BRepPrim_Revolution;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build spheres or portions of spheres
BRepPrimAPI_MakeSphere: declare class BRepPrimAPI_MakeSphere extends BRepPrimAPI_MakeOneAxis

constructor

// Returns the algorithm
Sphere(): BRepPrim_Sphere;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class MakeSweep is the root class of swept primitives
BRepPrimAPI_MakeSweep: declare class BRepPrimAPI_MakeSweep extends BRepBuilderAPI_MakeShape

// Returns the `TopoDS` Shape of the bottom of the sweep
FirstShape(): TopoDS_Shape;

// Returns the `TopoDS` Shape of the top of the sweep
LastShape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build tori or portions of tori
BRepPrimAPI_MakeTorus: declare class BRepPrimAPI_MakeTorus extends BRepPrimAPI_MakeOneAxis

constructor

// Returns the algorithm
Torus(): BRepPrim_Torus;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes functions to build wedges, i.e
BRepPrimAPI_MakeWedge: declare class BRepPrimAPI_MakeWedge extends BRepBuilderAPI_MakeShape

constructor

// Returns the internal algorithm
Wedge(): BRepPrim_Wedge;

// Stores the solid in myShape
Build(theRange?: Message_ProgressRange): void;

// Returns the constructed box in the form of a shell
Shell(): TopoDS_Shell;

// Returns the constructed box in the form of a solid
Solid(): TopoDS_Solid;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
