# libcascade — LocalAnalysis

4 top-level symbols. Signatures are verbatim typescript.

LocalAnalysis: declare class LocalAnalysis

constructor

delete(): void;

[Symbol.dispose](): void;

LocalAnalysis_CurveContinuity: declare class LocalAnalysis_CurveContinuity

constructor

IsDone(): boolean;

StatusError(): LocalAnalysis_StatusErrorType;

ContinuityStatus(): GeomAbs_Shape;

C0Value(): number;

C1Angle(): number;

C1Ratio(): number;

C2Angle(): number;

C2Ratio(): number;

G1Angle(): number;

G2Angle(): number;

G2CurvatureVariation(): number;

IsC0(): boolean;

IsC1(): boolean;

IsC2(): boolean;

IsG1(): boolean;

IsG2(): boolean;

delete(): void;

[Symbol.dispose](): void;

LocalAnalysis_StatusErrorType: typeof LocalAnalysis_StatusErrorType[keyof typeof LocalAnalysis_StatusErrorType]

LocalAnalysis_SurfaceContinuity: declare class LocalAnalysis_SurfaceContinuity

constructor

ComputeAnalysis(Surf1: GeomLProp_SLProps, Surf2: GeomLProp_SLProps, Order: GeomAbs_Shape): void;

IsDone(): boolean;

ContinuityStatus(): GeomAbs_Shape;

StatusError(): LocalAnalysis_StatusErrorType;

C0Value(): number;

C1UAngle(): number;

C1URatio(): number;

C1VAngle(): number;

C1VRatio(): number;

C2UAngle(): number;

C2URatio(): number;

C2VAngle(): number;

C2VRatio(): number;

G1Angle(): number;

G2CurvatureGap(): number;

IsC0(): boolean;

IsC1(): boolean;

IsC2(): boolean;

IsG1(): boolean;

IsG2(): boolean;

delete(): void;

[Symbol.dispose](): void;
