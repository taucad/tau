# libcascade — FilletPoint

1 top-level symbols. Signatures are verbatim typescript.

FilletPoint: declare class FilletPoint

constructor

setParam(theParam: number): void;

getParam(): number;

getNBValues(): number;

getValue(theIndex: number): number;

getDiff(theIndex: number): number;

isValid(theIndex: number): boolean;

getNear(theIndex: number): number;

setParam2(theParam2: number): void;

getParam2(): number;

setCenter(thePoint: gp_Pnt2d): void;

getCenter(): gp_Pnt2d;

appendValue(theValue: number, theValid: boolean): void;

calculateDiff(argNo0: FilletPoint): boolean;

FilterPoints(argNo0: FilletPoint): void;

Copy(): FilletPoint;

hasSolution(theRadius: number): number;

LowerValue(): number;

remove(theIndex: number): void;

delete(): void;

[Symbol.dispose](): void;
