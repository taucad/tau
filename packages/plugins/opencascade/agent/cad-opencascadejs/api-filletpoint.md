# libcascade — FilletPoint

1 top-level symbols. Signatures are verbatim typescript.

// Private class
FilletPoint: declare class FilletPoint

constructor

// Changes the point position by changing point parameter on the first curve
setParam(theParam: number): void;

// Returns the point parameter on the first curve
getParam(): number;

// Returns number of found values of function in this point
getNBValues(): number;

// Returns value of function in this point
getValue(theIndex: number): number;

// Returns derivatives of function in this point
getDiff(theIndex: number): number;

// Returns true if function is valid (rediuses vectors of fillet do not intersect any curve)
isValid(theIndex: number): boolean;

// Returns the index of the nearest value
getNear(theIndex: number): number;

// Defines the parameter of the projected point on the second curve
setParam2(theParam2: number): void;

// Returns the parameter of the projected point on the second curve
getParam2(): number;

// Center of the fillet
setCenter(thePoint: gp_Pnt2d): void;

// Center of the fillet
getCenter(): gp_Pnt2d;

// Appends value of the function
appendValue(theValue: number, theValid: boolean): void;

// Computes difference between this point and the given
calculateDiff(argNo0: FilletPoint): boolean;

// Filters out the values and leaves the most optimal one
FilterPoints(argNo0: FilletPoint): void;

// Returns a pointer to created copy of the point warning
Copy(): FilletPoint;

// Returns the index of the solution or zero if there is no solution
hasSolution(theRadius: number): number;

// For debug only
LowerValue(): number;

// Removes the found value by the given index
remove(theIndex: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
