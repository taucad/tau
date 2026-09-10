# libcascade — IGESGeom (3)

22 top-level symbols. Signatures are verbatim typescript.

// Tool to work on a Direction
IGESGeom_ToolDirection: declare class IGESGeom_ToolDirection

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Direction, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Direction): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Direction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Direction, entto: IGESGeom_Direction, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Flash
IGESGeom_ToolFlash: declare class IGESGeom_ToolFlash

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Flash, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Flash (LineFont in Directory Entry forced to Rank = 1)
OwnCorrect(ent: IGESGeom_Flash): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Flash): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Flash, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Flash, entto: IGESGeom_Flash, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Line
IGESGeom_ToolLine: declare class IGESGeom_ToolLine

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Line, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Line): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Line, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Line, entto: IGESGeom_Line, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a OffsetCurve
IGESGeom_ToolOffsetCurve: declare class IGESGeom_ToolOffsetCurve

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_OffsetCurve, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a OffsetCurve (if OffsetType is not 3, OffsetFunction is cleared)
OwnCorrect(ent: IGESGeom_OffsetCurve): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_OffsetCurve): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_OffsetCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_OffsetCurve, entto: IGESGeom_OffsetCurve, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a OffsetSurface
IGESGeom_ToolOffsetSurface: declare class IGESGeom_ToolOffsetSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_OffsetSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_OffsetSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_OffsetSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_OffsetSurface, entto: IGESGeom_OffsetSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Plane
IGESGeom_ToolPlane: declare class IGESGeom_ToolPlane

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Plane, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Plane): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Plane, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Plane, entto: IGESGeom_Plane, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Point
IGESGeom_ToolPoint: declare class IGESGeom_ToolPoint

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_Point, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_Point): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_Point, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_Point, entto: IGESGeom_Point, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a RuledSurface
IGESGeom_ToolRuledSurface: declare class IGESGeom_ToolRuledSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_RuledSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_RuledSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_RuledSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_RuledSurface, entto: IGESGeom_RuledSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SplineCurve
IGESGeom_ToolSplineCurve: declare class IGESGeom_ToolSplineCurve

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_SplineCurve, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_SplineCurve): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_SplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_SplineCurve, entto: IGESGeom_SplineCurve, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SplineSurface
IGESGeom_ToolSplineSurface: declare class IGESGeom_ToolSplineSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_SplineSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_SplineSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_SplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_SplineSurface, entto: IGESGeom_SplineSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SurfaceOfRevolution
IGESGeom_ToolSurfaceOfRevolution: declare class IGESGeom_ToolSurfaceOfRevolution

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_SurfaceOfRevolution, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_SurfaceOfRevolution): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_SurfaceOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_SurfaceOfRevolution, entto: IGESGeom_SurfaceOfRevolution, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TabulatedCylinder
IGESGeom_ToolTabulatedCylinder: declare class IGESGeom_ToolTabulatedCylinder

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_TabulatedCylinder, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_TabulatedCylinder): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_TabulatedCylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_TabulatedCylinder, entto: IGESGeom_TabulatedCylinder, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TransformationMatrix
IGESGeom_ToolTransformationMatrix: declare class IGESGeom_ToolTransformationMatrix

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_TransformationMatrix, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a TransformationMatrix (FormNumber if 0 or 1, recomputed according Positive/Negative)
OwnCorrect(ent: IGESGeom_TransformationMatrix): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGeom_TransformationMatrix): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_TransformationMatrix, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_TransformationMatrix, entto: IGESGeom_TransformationMatrix, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TrimmedSurface
IGESGeom_ToolTrimmedSurface: declare class IGESGeom_ToolTrimmedSurface

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGeom_TrimmedSurface, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGeom_TrimmedSurface): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGeom_TrimmedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGeom_TrimmedSurface, entto: IGESGeom_TrimmedSurface, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESTransformationMatrix, Type <124> Form <0> in package {@link IGESGeom`IGESGeom`} The transformation matrix entity transforms three-row column vectors by means of matrix multiplication and then a vector addition
IGESGeom_TransformationMatrix: declare class IGESGeom_TransformationMatrix extends IGESData_TransfEntity

constructor

// This method is used to set the fields of the class TransformationMatrix
Init(aMatrix: NCollection_HArray2_double): void;

// Changes FormNumber (indicates the Type of Transf
SetFormNumber(form: number): void;

// returns individual Data Error if I not in [1-3] or J not in [1-4]
Data(I: number, J: number): number;

// returns the transformation matrix 4th row elements of GTrsf will always be 0, 0, 0, 1 (not defined)
Value(): gp_GTrsf;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESTrimmedSurface, Type <144> Form <0> in package {@link IGESGeom`IGESGeom`} A simple closed curve in Euclidean plane divides the plane in to two disjoint, open connected components
IGESGeom_TrimmedSurface: declare class IGESGeom_TrimmedSurface extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class TrimmedSurface
Init(aSurface: IGESData_IGESEntity, aFlag: number, anOuter: IGESGeom_CurveOnSurface, allInners: NCollection_HArray1_handle_IGESGeom_CurveOnSurface): void;

// returns the surface to be trimmed
Surface(): IGESData_IGESEntity;

// returns True if outer contour exists
HasOuterContour(): boolean;

// returns the outer contour of the trimmed surface
OuterContour(): IGESGeom_CurveOnSurface;

// returns the outer contour type of the trimmed surface 0
OuterBoundaryType(): number;

// returns the number of inner boundaries
NbInnerContours(): number;

// returns the Index'th inner contour raises exception if Index <= 0 or Index > `NbInnerContours()`
InnerContour(Index: number): IGESGeom_CurveOnSurface;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESGeom_Array1OfBoundary: NCollection_Array1_handle_IGESGeom_Boundary

IGESGeom_Array1OfCurveOnSurface: NCollection_Array1_handle_IGESGeom_CurveOnSurface

IGESGeom_Array1OfTransformationMatrix: NCollection_Array1_handle_IGESGeom_TransformationMatrix

IGESGeom_HArray1OfBoundary: NCollection_HArray1_handle_IGESGeom_Boundary

IGESGeom_HArray1OfCurveOnSurface: NCollection_HArray1_handle_IGESGeom_CurveOnSurface

IGESGeom_HArray1OfTransformationMatrix: NCollection_HArray1_handle_IGESGeom_TransformationMatrix
