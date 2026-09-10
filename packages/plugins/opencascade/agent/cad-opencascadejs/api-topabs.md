# libcascade — TopAbs

4 top-level symbols. Signatures are verbatim typescript.

// This package gives resources for Topology oriented applications such as
TopAbs: declare class TopAbs

constructor

// Reverses the interior/exterior status of each side of the object
static Complement(Or: TopAbs_Orientation): TopAbs_Orientation;

// Returns the string name for a given shape type
static ShapeTypeToString(theType: TopAbs_ShapeEnum): string;
// theType: shape type

// Returns the shape type from the given string identifier (using case-insensitive comparison)
static ShapeTypeFromString(theTypeString: string): TopAbs_ShapeEnum;
static ShapeTypeFromString(theTypeString: string, theType?: TopAbs_ShapeEnum): { returnValue: boolean; theType: TopAbs_ShapeEnum };
static ShapeTypeFromString(theTypeString: string): TopAbs_ShapeEnum;
static ShapeTypeFromString(theTypeString: string, theType?: TopAbs_ShapeEnum): { returnValue: boolean; theType: TopAbs_ShapeEnum };
// theTypeString: string identifier

// Returns the string name for a given shape orientation
static ShapeOrientationToString(theOrientation: TopAbs_Orientation): string;
// theOrientation: shape orientation

// Returns the shape orientation from the given string identifier (using case-insensitive comparison)
static ShapeOrientationFromString(theOrientationString: string): TopAbs_Orientation;
static ShapeOrientationFromString(theOrientationString: string, theOrientation?: TopAbs_Orientation): { returnValue: boolean; theOrientation: TopAbs_Orientation };
static ShapeOrientationFromString(theOrientationString: string): TopAbs_Orientation;
static ShapeOrientationFromString(theOrientationString: string, theOrientation?: TopAbs_Orientation): { returnValue: boolean; theOrientation: TopAbs_Orientation };
// theOrientationString: string identifier

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies the orientation of a topological shape
TopAbs_Orientation: typeof TopAbs_Orientation[keyof typeof TopAbs_Orientation]

// Identifies various topological shapes
TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]

// Identifies the position of a vertex or a set of vertices relative to a region of a shape
TopAbs_State: typeof TopAbs_State[keyof typeof TopAbs_State]
