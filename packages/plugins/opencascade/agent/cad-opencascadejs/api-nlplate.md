# libcascade — NLPlate

9 top-level symbols. Signatures are verbatim typescript.

NLPlate_HGPPConstraint: declare class NLPlate_HGPPConstraint extends Standard_Transient

  // NLPlate_HGPPConstraint.SetUVFreeSliding (method)
  SetUVFreeSliding(UVFree: boolean): void;

  // NLPlate_HGPPConstraint.SetIncrementalLoadAllowed (method)
  SetIncrementalLoadAllowed(ILA: boolean): void;

  // NLPlate_HGPPConstraint.SetActiveOrder (method)
  SetActiveOrder(ActiveOrder: number): void;

  // NLPlate_HGPPConstraint.SetUV (method)
  SetUV(UV: gp_XY): void;

  // NLPlate_HGPPConstraint.SetOrientation (method)
  SetOrientation(Orient?: number): void;

  // NLPlate_HGPPConstraint.SetG0Criterion (method)
  SetG0Criterion(TolDist: number): void;

  // NLPlate_HGPPConstraint.SetG1Criterion (method)
  SetG1Criterion(TolAng: number): void;

  // NLPlate_HGPPConstraint.SetG2Criterion (method)
  SetG2Criterion(TolCurv: number): void;

  // NLPlate_HGPPConstraint.SetG3Criterion (method)
  SetG3Criterion(TolG3: number): void;

  // NLPlate_HGPPConstraint.UVFreeSliding (method)
  UVFreeSliding(): boolean;

  // NLPlate_HGPPConstraint.IncrementalLoadAllowed (method)
  IncrementalLoadAllowed(): boolean;

  // NLPlate_HGPPConstraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HGPPConstraint.UV (method)
  UV(): gp_XY;

  // NLPlate_HGPPConstraint.Orientation (method)
  Orientation(): number;

  // NLPlate_HGPPConstraint.IsG0 (method)
  IsG0(): boolean;

  // NLPlate_HGPPConstraint.G0Target (method)
  G0Target(): gp_XYZ;

  // NLPlate_HGPPConstraint.G1Target (method)
  G1Target(): Plate_D1;

  // NLPlate_HGPPConstraint.G2Target (method)
  G2Target(): Plate_D2;

  // NLPlate_HGPPConstraint.G3Target (method)
  G3Target(): Plate_D3;

  // NLPlate_HGPPConstraint.G0Criterion (method)
  G0Criterion(): number;

  // NLPlate_HGPPConstraint.G1Criterion (method)
  G1Criterion(): number;

  // NLPlate_HGPPConstraint.G2Criterion (method)
  G2Criterion(): number;

  // NLPlate_HGPPConstraint.G3Criterion (method)
  G3Criterion(): number;

  // NLPlate_HGPPConstraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HGPPConstraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HGPPConstraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HGPPConstraint.delete (method)
  delete(): void;

  // NLPlate_HGPPConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG0Constraint: declare class NLPlate_HPG0Constraint extends NLPlate_HGPPConstraint

  // NLPlate_HPG0Constraint.constructor (constructor)
  constructor(UV: gp_XY, Value: gp_XYZ);

  // NLPlate_HPG0Constraint.SetUVFreeSliding (method)
  SetUVFreeSliding(UVFree: boolean): void;

  // NLPlate_HPG0Constraint.SetIncrementalLoadAllowed (method)
  SetIncrementalLoadAllowed(ILA: boolean): void;

  // NLPlate_HPG0Constraint.UVFreeSliding (method)
  UVFreeSliding(): boolean;

  // NLPlate_HPG0Constraint.IncrementalLoadAllowed (method)
  IncrementalLoadAllowed(): boolean;

  // NLPlate_HPG0Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG0Constraint.IsG0 (method)
  IsG0(): boolean;

  // NLPlate_HPG0Constraint.G0Target (method)
  G0Target(): gp_XYZ;

  // NLPlate_HPG0Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG0Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG0Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG0Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG0Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG0G1Constraint: declare class NLPlate_HPG0G1Constraint extends NLPlate_HPG0Constraint

  // NLPlate_HPG0G1Constraint.constructor (constructor)
  constructor(UV: gp_XY, Value: gp_XYZ, D1T: Plate_D1);

  // NLPlate_HPG0G1Constraint.SetOrientation (method)
  SetOrientation(Orient?: number): void;

  // NLPlate_HPG0G1Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG0G1Constraint.Orientation (method)
  Orientation(): number;

  // NLPlate_HPG0G1Constraint.G1Target (method)
  G1Target(): Plate_D1;

  // NLPlate_HPG0G1Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG0G1Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG0G1Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG0G1Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG0G1Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG0G2Constraint: declare class NLPlate_HPG0G2Constraint extends NLPlate_HPG0G1Constraint

  // NLPlate_HPG0G2Constraint.constructor (constructor)
  constructor(UV: gp_XY, Value: gp_XYZ, D1T: Plate_D1, D2T: Plate_D2);

  // NLPlate_HPG0G2Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG0G2Constraint.G2Target (method)
  G2Target(): Plate_D2;

  // NLPlate_HPG0G2Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG0G2Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG0G2Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG0G2Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG0G2Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG0G3Constraint: declare class NLPlate_HPG0G3Constraint extends NLPlate_HPG0G2Constraint

  // NLPlate_HPG0G3Constraint.constructor (constructor)
  constructor(UV: gp_XY, Value: gp_XYZ, D1T: Plate_D1, D2T: Plate_D2, D3T: Plate_D3);

  // NLPlate_HPG0G3Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG0G3Constraint.G3Target (method)
  G3Target(): Plate_D3;

  // NLPlate_HPG0G3Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG0G3Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG0G3Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG0G3Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG0G3Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG1Constraint: declare class NLPlate_HPG1Constraint extends NLPlate_HGPPConstraint

  // NLPlate_HPG1Constraint.constructor (constructor)
  constructor(UV: gp_XY, D1T: Plate_D1);

  // NLPlate_HPG1Constraint.SetIncrementalLoadAllowed (method)
  SetIncrementalLoadAllowed(ILA: boolean): void;

  // NLPlate_HPG1Constraint.SetOrientation (method)
  SetOrientation(Orient?: number): void;

  // NLPlate_HPG1Constraint.IncrementalLoadAllowed (method)
  IncrementalLoadAllowed(): boolean;

  // NLPlate_HPG1Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG1Constraint.IsG0 (method)
  IsG0(): boolean;

  // NLPlate_HPG1Constraint.Orientation (method)
  Orientation(): number;

  // NLPlate_HPG1Constraint.G1Target (method)
  G1Target(): Plate_D1;

  // NLPlate_HPG1Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG1Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG1Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG1Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG1Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG2Constraint: declare class NLPlate_HPG2Constraint extends NLPlate_HPG1Constraint

  // NLPlate_HPG2Constraint.constructor (constructor)
  constructor(UV: gp_XY, D1T: Plate_D1, D2T: Plate_D2);

  // NLPlate_HPG2Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG2Constraint.G2Target (method)
  G2Target(): Plate_D2;

  // NLPlate_HPG2Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG2Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG2Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG2Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG2Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_HPG3Constraint: declare class NLPlate_HPG3Constraint extends NLPlate_HPG2Constraint

  // NLPlate_HPG3Constraint.constructor (constructor)
  constructor(UV: gp_XY, D1T: Plate_D1, D2T: Plate_D2, D3T: Plate_D3);

  // NLPlate_HPG3Constraint.ActiveOrder (method)
  ActiveOrder(): number;

  // NLPlate_HPG3Constraint.G3Target (method)
  G3Target(): Plate_D3;

  // NLPlate_HPG3Constraint.get_type_name (method)
  static get_type_name(): string;

  // NLPlate_HPG3Constraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // NLPlate_HPG3Constraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // NLPlate_HPG3Constraint.delete (method)
  delete(): void;

  // NLPlate_HPG3Constraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NLPlate_NLPlate: declare class NLPlate_NLPlate

  // NLPlate_NLPlate.constructor (constructor)
  constructor(InitialSurface: Geom_Surface);

  // NLPlate_NLPlate.Load (method)
  Load(GConst: NLPlate_HGPPConstraint): void;

  // NLPlate_NLPlate.Solve (method)
  Solve(ord?: number, InitialConsraintOrder?: number): void;

  // NLPlate_NLPlate.Solve2 (method)
  Solve2(ord?: number, InitialConsraintOrder?: number): void;

  // NLPlate_NLPlate.IncrementalSolve (method)
  IncrementalSolve(ord?: number, InitialConsraintOrder?: number, NbIncrements?: number, UVSliding?: boolean): void;

  // NLPlate_NLPlate.IsDone (method)
  IsDone(): boolean;

  // NLPlate_NLPlate.destroy (method)
  destroy(): void;

  // NLPlate_NLPlate.Init (method)
  Init(): void;

  // NLPlate_NLPlate.Evaluate (method)
  Evaluate(point2d: gp_XY): gp_XYZ;

  // NLPlate_NLPlate.EvaluateDerivative (method)
  EvaluateDerivative(point2d: gp_XY, iu: number, iv: number): gp_XYZ;

  // NLPlate_NLPlate.Continuity (method)
  Continuity(): number;

  // NLPlate_NLPlate.ConstraintsSliding (method)
  ConstraintsSliding(NbIterations?: number): void;

  // NLPlate_NLPlate.MaxActiveConstraintOrder (method)
  MaxActiveConstraintOrder(): number;

  // NLPlate_NLPlate.delete (method)
  delete(): void;

  // NLPlate_NLPlate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
