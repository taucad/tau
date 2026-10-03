# libcascade — FilletPoint

1 top-level symbols. Signatures are verbatim typescript.

FilletPoint: declare class FilletPoint

  // FilletPoint.constructor (constructor)
  constructor(theParam: number);

  // FilletPoint.setParam (method)
  setParam(theParam: number): void;

  // FilletPoint.getParam (method)
  getParam(): number;

  // FilletPoint.getNBValues (method)
  getNBValues(): number;

  // FilletPoint.getValue (method)
  getValue(theIndex: number): number;

  // FilletPoint.getDiff (method)
  getDiff(theIndex: number): number;

  // FilletPoint.isValid (method)
  isValid(theIndex: number): boolean;

  // FilletPoint.getNear (method)
  getNear(theIndex: number): number;

  // FilletPoint.setParam2 (method)
  setParam2(theParam2: number): void;

  // FilletPoint.getParam2 (method)
  getParam2(): number;

  // FilletPoint.setCenter (method)
  setCenter(thePoint: gp_Pnt2d): void;

  // FilletPoint.getCenter (method)
  getCenter(): gp_Pnt2d;

  // FilletPoint.appendValue (method)
  appendValue(theValue: number, theValid: boolean): void;

  // FilletPoint.calculateDiff (method)
  calculateDiff(argNo0: FilletPoint): boolean;

  // FilletPoint.FilterPoints (method)
  FilterPoints(argNo0: FilletPoint): void;

  // FilletPoint.Copy (method)
  Copy(): FilletPoint;

  // FilletPoint.hasSolution (method)
  hasSolution(theRadius: number): number;

  // FilletPoint.LowerValue (method)
  LowerValue(): number;

  // FilletPoint.remove (method)
  remove(theIndex: number): void;

  // FilletPoint.delete (method)
  delete(): void;

  // FilletPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
