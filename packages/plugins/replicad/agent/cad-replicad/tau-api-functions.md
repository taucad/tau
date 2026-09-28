# @taucad/replicad — Functions

7 top-level symbols. Signatures are verbatim typescript.

// Declare a named face selected from a Replicad `FaceFinder`
(select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>) => FaceDeclaration
//   select: Selector evaluated against the live Replicad shape

// Declare a named cylindrical or conical axis selected from a Replicad `FaceFinder`
(select: Extract<SingleFace, (f: FaceFinder) => FaceFinder>) => AxisDeclaration
//   select: Selector evaluated against the live Replicad shape

// Declare a named coordinate frame exported as AP242 supplemental geometry
({ origin, xAxis, zAxis, }: {
    origin: SimplePoint;
    xAxis?: SimplePoint;
    zAxis?: SimplePoint;
}) => DatumDeclaration

// Declare a named coordinate frame exported as AP242 supplemental geometry
// DEPRECATED: Use {@link frame} — this declares a coordinate *frame* in the
supplemental-geometry channel, not a GD&T datum (the semantic
`DATUM`/`DATUM_FEATURE` family); the old name is a homonym that conflates
the two concepts. Behaviour is identical.
({ origin, xAxis, zAxis, }: {
    origin: SimplePoint;
    xAxis?: SimplePoint;
    zAxis?: SimplePoint;
}) => DatumDeclaration

// Declare a named group of face and axis annotations
(members: Array<FaceDeclaration | AxisDeclaration>) => GroupDeclaration
//   members: Face and axis declarations included in the group

// Return whether a candidate interface path is valid for STEP export
(name: string) => boolean
//   name: Candidate interface name

// Return whether a candidate top-level authoring key can appear in source code
(key: string) => boolean
//   key: Candidate authoring key
