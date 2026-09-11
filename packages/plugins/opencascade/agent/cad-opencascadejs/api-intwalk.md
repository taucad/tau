# libcascade — IntWalk

5 top-level symbols. Signatures are verbatim typescript.

IntWalk_StatusDeflection: typeof IntWalk_StatusDeflection[keyof typeof IntWalk_StatusDeflection]

IntWalk_TheInt2S: declare class IntWalk_TheInt2S

constructor

Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

IsDone(): boolean;

IsEmpty(): boolean;

Point(): IntSurf_PntOn2S;

IsTangent(): boolean;

Direction(): gp_Dir;

DirectionOnS1(): gp_Dir2d;

DirectionOnS2(): gp_Dir2d;

ChangePoint(): IntSurf_PntOn2S;

delete(): void;

[Symbol.dispose](): void;

IntWalk_VectorOfInteger: declare class IntWalk_VectorOfInteger

constructor

Data(): number;

HasData(): boolean;

Empty(): boolean;

static MaxSize(): number;

Size(): number;

IsEmpty(): boolean;

Capacity(): number;

Reserve(theCapacity: number): void;

Resize(theSize: number): void;
Resize(theSize: number, theValue: number): void;
Resize(theSize: number): void;
Resize(theSize: number, theValue: number): void;

Value(theIndex: number): number;

ChangeValue(theIndex: number): number;

First(): number;

ChangeFirst(): number;

Last(): number;

ChangeLast(): number;

Append(theValue: number): number;

Appended(): number;

SetValue(theIndex: number, theValue: number): number;

InsertBefore(theIndex: number, theValue: number): void;

InsertAfter(theIndex: number, theValue: number): void;

EraseLast(): void;

Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;

Clear(theReleaseMemory?: boolean): void;

ToArray1(): NCollection_Array1_int;

delete(): void;

[Symbol.dispose](): void;

IntWalk_VectorOfWalkingData: declare class IntWalk_VectorOfWalkingData

constructor

Data(): IntWalk_WalkingData;

HasData(): boolean;

Empty(): boolean;

static MaxSize(): number;

Size(): number;

IsEmpty(): boolean;

Capacity(): number;

Reserve(theCapacity: number): void;

Resize(theSize: number): void;
Resize(theSize: number, theValue: IntWalk_WalkingData): void;
Resize(theSize: number): void;
Resize(theSize: number, theValue: IntWalk_WalkingData): void;

Value(theIndex: number): IntWalk_WalkingData;

ChangeValue(theIndex: number): IntWalk_WalkingData;

First(): IntWalk_WalkingData;

ChangeFirst(): IntWalk_WalkingData;

Last(): IntWalk_WalkingData;

ChangeLast(): IntWalk_WalkingData;

Append(theValue: IntWalk_WalkingData): IntWalk_WalkingData;

Appended(): IntWalk_WalkingData;

SetValue(theIndex: number, theValue: IntWalk_WalkingData): IntWalk_WalkingData;

InsertBefore(theIndex: number, theValue: IntWalk_WalkingData): void;

InsertAfter(theIndex: number, theValue: IntWalk_WalkingData): void;

EraseLast(): void;

Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;

Clear(theReleaseMemory?: boolean): void;

ToArray1(): any;

delete(): void;

[Symbol.dispose](): void;

IntWalk_WalkingData: declare class IntWalk_WalkingData

constructor

ustart: number

vstart: number

etat: number

delete(): void;

[Symbol.dispose](): void;
