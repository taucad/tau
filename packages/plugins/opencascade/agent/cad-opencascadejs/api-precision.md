# libcascade — Precision

1 top-level symbols. Signatures are verbatim typescript.

// The {@link Precision`Precision`} package offers a set of functions defining precision criteria for use in conventional situations when comparing two numbers
Precision: declare class Precision

constructor

// Returns the recommended precision value when checking the equality of two angles (given in radians)
static Angular(): number;

// Returns the recommended precision value when checking coincidence of two points in real space
static Confusion(): number;

// Returns square of Confusion
static SquareConfusion(): number;

// Returns a precision value at machine epsilon level, used for low-level numerical computations and floating-point comparisons
static Computational(): number;

// Returns square of Computational
static SquareComputational(): number;

// Returns the precision value in real space, frequently used by intersection algorithms to decide that a solution is reached
static Intersection(): number;

// Returns the precision value in real space, frequently used by approximation algorithms
static Approximation(): number;

// Convert a real space precision to a parametric space precision
static Parametric(P: number, T: number): number;
static Parametric(P: number): number;
static Parametric(P: number, T: number): number;
static Parametric(P: number): number;

// Returns a precision value in parametric space, which may be used
static PConfusion(T: number): number;
static PConfusion(): number;
static PConfusion(T: number): number;
static PConfusion(): number;

// Returns square of PConfusion
static SquarePConfusion(): number;

// Returns a precision value in parametric space, which may be used by intersection algorithms, to decide that a solution is reached
static PIntersection(T: number): number;
static PIntersection(): number;
static PIntersection(T: number): number;
static PIntersection(): number;

// Returns a precision value in parametric space, which may be used by approximation algorithms
static PApproximation(T: number): number;
static PApproximation(): number;
static PApproximation(T: number): number;
static PApproximation(): number;

// Returns True if R may be considered as an infinite number
static IsInfinite(R: number): boolean;

// Returns True if R may be considered as a positive infinite number
static IsPositiveInfinite(R: number): boolean;

// Returns True if R may be considered as a negative infinite number
static IsNegativeInfinite(R: number): boolean;

// Returns a big number that can be considered as infinite
static Infinite(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
