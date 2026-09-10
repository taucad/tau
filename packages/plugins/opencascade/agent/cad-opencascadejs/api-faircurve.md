# libcascade — FairCurve

12 top-level symbols. Signatures are verbatim typescript.

// To deal with different results in the computation of curvatures
FairCurve_AnalysisCode: typeof FairCurve_AnalysisCode[keyof typeof FairCurve_AnalysisCode]

// Constructs curves with a constant or linearly increasing section to be used in the design of wooden or plastic battens
FairCurve_Batten: declare class FairCurve_Batten

constructor

// Freesliding is initialized with the default setting false
SetFreeSliding(FreeSliding: boolean): void;

// Allows you to change the order of the constraint on the first point
SetConstraintOrder1(ConstraintOrder: number): void;

// Allows you to change the order of the constraint on the second point
SetConstraintOrder2(ConstraintOrder: number): void;

// Allows you to change the location of the point, P1, and in doing so, modify the curve
SetP1(P1: gp_Pnt2d): void;

// Allows you to change the location of the point, P1, and in doing so, modify the curve
SetP2(P2: gp_Pnt2d): void;

// Allows you to change the angle Angle1 at the first point, P1
SetAngle1(Angle1: number): void;

// Allows you to change the angle Angle2 at the second point, P2
SetAngle2(Angle2: number): void;

// Allows you to change the height of the deformation
SetHeight(Height: number): void;

// Allows you to set the slope value, Slope
SetSlope(Slope: number): void;

// Allows you to change the ratio SlidingFactor
SetSlidingFactor(SlidingFactor: number): void;

// Performs the algorithm, using the arguments Code, NbIterations and Tolerance and computes the curve with respect to the constraints
Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

// Computes the real number value for length Sliding of Reference for new constraints
SlidingOfReference(): number;

// Returns the initial free sliding value, false by default
GetFreeSliding(): boolean;

// Returns the established first constraint order
GetConstraintOrder1(): number;

// Returns the established second constraint order
GetConstraintOrder2(): number;

// Returns the established location of the point P1
GetP1(): gp_Pnt2d;

// Returns the established location of the point P2
GetP2(): gp_Pnt2d;

// Returns the established first angle
GetAngle1(): number;

// Returns the established second angle
GetAngle2(): number;

// Returns the thickness of the lathe
GetHeight(): number;

// Returns the established slope value
GetSlope(): number;

// Returns the initial sliding factor
GetSlidingFactor(): number;

// Returns the computed curve a 2d BSpline
Curve(): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class compute the Heigth of an batten
FairCurve_BattenLaw: declare class FairCurve_BattenLaw extends math_Function

constructor

// Change the value of sliding
SetSliding(Sliding: number): void;

// Change the value of Heigth at the middle point
SetHeigth(Heigth: number): void;

// Change the value of the geometric slope
SetSlope(Slope: number): void;

// computes the value of the heigth for the parameter T on the neutral fibber
Value(X: number, F: number): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract class to use the Energy of an FairCurve
FairCurve_DistributionOfEnergy: declare class FairCurve_DistributionOfEnergy extends math_FunctionSet

// returns the number of variables of the function
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

SetDerivativeOrder(DerivativeOrder: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Compute the "Jerk" distribution
FairCurve_DistributionOfJerk: declare class FairCurve_DistributionOfJerk extends FairCurve_DistributionOfEnergy

constructor

// computes the values <F> of the functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Compute the Sagging Distribution
FairCurve_DistributionOfSagging: declare class FairCurve_DistributionOfSagging extends FairCurve_DistributionOfEnergy

constructor

// computes the values <F> of the functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Compute the Tension Distribution
FairCurve_DistributionOfTension: declare class FairCurve_DistributionOfTension extends FairCurve_DistributionOfEnergy

constructor

// change the length sliding
SetLengthSliding(LengthSliding: number): void;

// computes the values <F> of the functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// necessary methodes to compute the energy of an FairCurve
FairCurve_Energy: declare class FairCurve_Energy extends math_MultipleVarFunctionWithHessian

// returns the number of variables of the energy
NbVariables(): number;

// computes the values of the Energys E for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// computes the gradient <G> of the energys for the variable <X>
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// computes the Energy <E> and the gradient <G> of the energy for the variable <X>
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

// compute the variables <X> which correspond with the field <MyPoles>
Variable(X: math_VectorBase_double): boolean;

// return the poles
Poles(): NCollection_HArray1_gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Energy Criterium to minimize in Batten
FairCurve_EnergyOfBatten: declare class FairCurve_EnergyOfBatten extends FairCurve_Energy

constructor

// return the lengthSliding = P1P2 + Sliding
LengthSliding(): number;

// return the status
Status(): FairCurve_AnalysisCode;

// compute the variables <X> which correspond with the field <MyPoles>
Variable(X: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Energy Criterium to minimize in MinimalVariationCurve
FairCurve_EnergyOfMVC: declare class FairCurve_EnergyOfMVC extends FairCurve_Energy

constructor

// return the lengthSliding = P1P2 + Sliding
LengthSliding(): number;

// return the status
Status(): FairCurve_AnalysisCode;

// compute the variables <X> which correspond with the field <MyPoles>
Variable(X: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes a 2D curve using an algorithm which minimizes tension, sagging, and jerk energy
FairCurve_MinimalVariation: declare class FairCurve_MinimalVariation extends FairCurve_Batten

constructor

// Allows you to set a new constraint on curvature at the first point
SetCurvature1(Curvature: number): void;

// Allows you to set a new constraint on curvature at the second point
SetCurvature2(Curvature: number): void;

// Allows you to set the physical ratio Ratio
SetPhysicalRatio(Ratio: number): void;

// Computes the curve with respect to the constraints, NbIterations and Tolerance
Compute(Code: FairCurve_AnalysisCode, NbIterations: number, Tolerance: number): { returnValue: boolean; Code: FairCurve_AnalysisCode };

// Returns the first established curvature
GetCurvature1(): number;

// Returns the second established curvature
GetCurvature2(): number;

// Returns the physical ratio, or kind of energy
GetPhysicalRatio(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Algorithm of Optimization used to make "FairCurve"
FairCurve_Newton: declare class FairCurve_Newton

constructor

// This method is called at the end of each iteration to check the convergence
IsConverged(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
