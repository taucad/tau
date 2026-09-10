# libcascade — ChFiDS (2)

8 top-level symbols. Signatures are verbatim typescript.

// data structure for all information related to the fillet and to 2 faces vis a vis
ChFiDS_SurfData: declare class ChFiDS_SurfData extends Standard_Transient

constructor

Copy(Other: ChFiDS_SurfData): void;

IndexOfS1(): number;

IndexOfS2(): number;

IsOnCurve1(): boolean;

IsOnCurve2(): boolean;

IndexOfC1(): number;

IndexOfC2(): number;

Surf(): number;

Orientation(): TopAbs_Orientation;

InterferenceOnS1(): ChFiDS_FaceInterference;

InterferenceOnS2(): ChFiDS_FaceInterference;

VertexFirstOnS1(): ChFiDS_CommonPoint;

VertexFirstOnS2(): ChFiDS_CommonPoint;

VertexLastOnS1(): ChFiDS_CommonPoint;

VertexLastOnS2(): ChFiDS_CommonPoint;

ChangeIndexOfS1(Index: number): void;

ChangeIndexOfS2(Index: number): void;

ChangeSurf(Index: number): void;

SetIndexOfC1(Index: number): void;

SetIndexOfC2(Index: number): void;

ChangeOrientation(): TopAbs_Orientation;

ChangeInterferenceOnS1(): ChFiDS_FaceInterference;

ChangeInterferenceOnS2(): ChFiDS_FaceInterference;

ChangeVertexFirstOnS1(): ChFiDS_CommonPoint;

ChangeVertexFirstOnS2(): ChFiDS_CommonPoint;

ChangeVertexLastOnS1(): ChFiDS_CommonPoint;

ChangeVertexLastOnS2(): ChFiDS_CommonPoint;

Interference(OnS: number): ChFiDS_FaceInterference;

ChangeInterference(OnS: number): ChFiDS_FaceInterference;

Index(OfS: number): number;

// returns one of the four vertices whether First is true or wrong and OnS equals 1 or 2
Vertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

// returns one of the four vertices whether First is true or wrong and OnS equals 1 or 2
ChangeVertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

IsOnCurve(OnS: number): boolean;

IndexOfC(OnS: number): number;

FirstSpineParam(): number;
FirstSpineParam(Par: number): void;
FirstSpineParam(): number;
FirstSpineParam(Par: number): void;

LastSpineParam(): number;
LastSpineParam(Par: number): void;
LastSpineParam(): number;
LastSpineParam(Par: number): void;

FirstExtensionValue(): number;
FirstExtensionValue(Extend: number): void;
FirstExtensionValue(): number;
FirstExtensionValue(Extend: number): void;

LastExtensionValue(): number;
LastExtensionValue(Extend: number): void;
LastExtensionValue(): number;
LastExtensionValue(Extend: number): void;

Simul(): Standard_Transient;

SetSimul(S: Standard_Transient): void;

ResetSimul(): void;

Get2dPoints(First: boolean, OnS: number): gp_Pnt2d;
Get2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;
Get2dPoints(First: boolean, OnS: number): gp_Pnt2d;
Get2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

Set2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

TwistOnS1(): boolean;
TwistOnS1(T: boolean): void;
TwistOnS1(): boolean;
TwistOnS1(T: boolean): void;

TwistOnS2(): boolean;
TwistOnS2(T: boolean): void;
TwistOnS2(): boolean;
TwistOnS2(T: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ChFiDS_TypeOfConcavity: typeof ChFiDS_TypeOfConcavity[keyof typeof ChFiDS_TypeOfConcavity]

ChFiDS_HData: NCollection_HSequence_handle_ChFiDS_SurfData

ChFiDS_ListOfHElSpine: NCollection_List_handle_ChFiDS_ElSpine

ChFiDS_ListOfStripe: NCollection_List_handle_ChFiDS_Stripe

ChFiDS_SecArray1: NCollection_Array1_ChFiDS_CircSection

ChFiDS_SecHArray1: NCollection_HArray1_ChFiDS_CircSection

ChFiDS_SequenceOfSurfData: NCollection_Sequence_handle_ChFiDS_SurfData
