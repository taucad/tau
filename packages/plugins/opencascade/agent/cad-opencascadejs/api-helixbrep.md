# libcascade — HelixBRep

1 top-level symbols. Signatures are verbatim typescript.

HelixBRep_BuilderHelix: declare class HelixBRep_BuilderHelix

  // HelixBRep_BuilderHelix.constructor (constructor)
  constructor();

  // HelixBRep_BuilderHelix.SetParameters (method)
  SetParameters(theAxis: gp_Ax3, theDiams: NCollection_Array1_double, thePitches: NCollection_Array1_double, theNbTurns: NCollection_Array1_double): void;
  SetParameters(theAxis: gp_Ax3, theDiam: number, thePitches: NCollection_Array1_double, theNbTurns: NCollection_Array1_double): void;
  SetParameters(theAxis: gp_Ax3, theDiams: NCollection_Array1_double, theHeights: NCollection_Array1_double, thePitches: NCollection_Array1_double, theIsPitches: NCollection_Array1_bool): void;
  SetParameters(theAxis: gp_Ax3, theDiam: number, theHeights: NCollection_Array1_double, thePitches: NCollection_Array1_double, theIsPitches: NCollection_Array1_bool): void;
  SetParameters(theAxis: gp_Ax3, theDiam1: number, theDiam2: number, thePitches: NCollection_Array1_double, theNbTurns: NCollection_Array1_double): void;
  SetParameters(theAxis: gp_Ax3, theDiam1: number, theDiam2: number, theHeights: NCollection_Array1_double, thePitches: NCollection_Array1_double, theIsPitches: NCollection_Array1_bool): void;

  // HelixBRep_BuilderHelix.SetApproxParameters (method)
  SetApproxParameters(theTolerance: number, theMaxDegree: number, theContinuity: GeomAbs_Shape): void;

  // HelixBRep_BuilderHelix.Perform (method)
  Perform(): void;

  // HelixBRep_BuilderHelix.ToleranceReached (method)
  ToleranceReached(): number;

  // HelixBRep_BuilderHelix.ErrorStatus (method)
  ErrorStatus(): number;

  // HelixBRep_BuilderHelix.WarningStatus (method)
  WarningStatus(): number;

  // HelixBRep_BuilderHelix.Shape (method)
  Shape(): TopoDS_Shape;

  // HelixBRep_BuilderHelix.delete (method)
  delete(): void;

  // HelixBRep_BuilderHelix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
