# libcascade — StepShape

44 top-level symbols. Signatures are verbatim typescript.

StepShape_AdvancedBrepShapeRepresentation: declare class StepShape_AdvancedBrepShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_AdvancedBrepShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_AdvancedBrepShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_AdvancedBrepShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_AdvancedBrepShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_AdvancedBrepShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_AdvancedBrepShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_AdvancedFace: declare class StepShape_AdvancedFace extends StepShape_FaceSurface

  // StepShape_AdvancedFace.constructor (constructor)
  constructor();

  // StepShape_AdvancedFace.get_type_name (method)
  static get_type_name(): string;

  // StepShape_AdvancedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_AdvancedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_AdvancedFace.delete (method)
  delete(): void;

  // StepShape_AdvancedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_AngleRelator: typeof StepShape_AngleRelator[keyof typeof StepShape_AngleRelator]

  readonly StepShape_Equal: 'StepShape_Equal'

  readonly StepShape_Large: 'StepShape_Large'

  readonly StepShape_Small: 'StepShape_Small'

StepShape_AngularLocation: declare class StepShape_AngularLocation extends StepShape_DimensionalLocation

  // StepShape_AngularLocation.constructor (constructor)
  constructor();

  // StepShape_AngularLocation.Init (method)
  Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aAngleSelection: StepShape_AngleRelator): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

  // StepShape_AngularLocation.AngleSelection (method)
  AngleSelection(): StepShape_AngleRelator;

  // StepShape_AngularLocation.SetAngleSelection (method)
  SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

  // StepShape_AngularLocation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_AngularLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_AngularLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_AngularLocation.delete (method)
  delete(): void;

  // StepShape_AngularLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_AngularSize: declare class StepShape_AngularSize extends StepShape_DimensionalSize

  // StepShape_AngularSize.constructor (constructor)
  constructor();

  // StepShape_AngularSize.Init (method)
  Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aAngleSelection: StepShape_AngleRelator): void;
  Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

  // StepShape_AngularSize.AngleSelection (method)
  AngleSelection(): StepShape_AngleRelator;

  // StepShape_AngularSize.SetAngleSelection (method)
  SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

  // StepShape_AngularSize.get_type_name (method)
  static get_type_name(): string;

  // StepShape_AngularSize.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_AngularSize.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_AngularSize.delete (method)
  delete(): void;

  // StepShape_AngularSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Block: declare class StepShape_Block extends StepGeom_GeometricRepresentationItem

  // StepShape_Block.constructor (constructor)
  constructor();

  // StepShape_Block.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Block.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

  // StepShape_Block.Position (method)
  Position(): StepGeom_Axis2Placement3d;

  // StepShape_Block.SetX (method)
  SetX(aX: number): void;

  // StepShape_Block.X (method)
  X(): number;

  // StepShape_Block.SetY (method)
  SetY(aY: number): void;

  // StepShape_Block.Y (method)
  Y(): number;

  // StepShape_Block.SetZ (method)
  SetZ(aZ: number): void;

  // StepShape_Block.Z (method)
  Z(): number;

  // StepShape_Block.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Block.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Block.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Block.delete (method)
  delete(): void;

  // StepShape_Block.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_BooleanOperand: declare class StepShape_BooleanOperand

  // StepShape_BooleanOperand.constructor (constructor)
  constructor();

  // StepShape_BooleanOperand.SetTypeOfContent (method)
  SetTypeOfContent(aTypeOfContent: number): void;

  // StepShape_BooleanOperand.TypeOfContent (method)
  TypeOfContent(): number;

  // StepShape_BooleanOperand.SolidModel (method)
  SolidModel(): StepShape_SolidModel;

  // StepShape_BooleanOperand.SetSolidModel (method)
  SetSolidModel(aSolidModel: StepShape_SolidModel): void;

  // StepShape_BooleanOperand.HalfSpaceSolid (method)
  HalfSpaceSolid(): StepShape_HalfSpaceSolid;

  // StepShape_BooleanOperand.SetHalfSpaceSolid (method)
  SetHalfSpaceSolid(aHalfSpaceSolid: StepShape_HalfSpaceSolid): void;

  // StepShape_BooleanOperand.CsgPrimitive (method)
  CsgPrimitive(): StepShape_CsgPrimitive;

  // StepShape_BooleanOperand.SetCsgPrimitive (method)
  SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

  // StepShape_BooleanOperand.BooleanResult (method)
  BooleanResult(): StepShape_BooleanResult;

  // StepShape_BooleanOperand.SetBooleanResult (method)
  SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

  // StepShape_BooleanOperand.delete (method)
  delete(): void;

  // StepShape_BooleanOperand.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_BooleanOperator: typeof StepShape_BooleanOperator[keyof typeof StepShape_BooleanOperator]

  readonly StepShape_boDifference: 'StepShape_boDifference'

  readonly StepShape_boIntersection: 'StepShape_boIntersection'

  readonly StepShape_boUnion: 'StepShape_boUnion'

StepShape_BooleanResult: declare class StepShape_BooleanResult extends StepGeom_GeometricRepresentationItem

  // StepShape_BooleanResult.constructor (constructor)
  constructor();

  // StepShape_BooleanResult.Init (method)
  Init(aName: TCollection_HAsciiString, aOperator: StepShape_BooleanOperator, aFirstOperand: StepShape_BooleanOperand, aSecondOperand: StepShape_BooleanOperand): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_BooleanResult.SetOperator (method)
  SetOperator(aOperator: StepShape_BooleanOperator): void;

  // StepShape_BooleanResult.Operator (method)
  Operator(): StepShape_BooleanOperator;

  // StepShape_BooleanResult.SetFirstOperand (method)
  SetFirstOperand(aFirstOperand: StepShape_BooleanOperand): void;

  // StepShape_BooleanResult.FirstOperand (method)
  FirstOperand(): StepShape_BooleanOperand;

  // StepShape_BooleanResult.SetSecondOperand (method)
  SetSecondOperand(aSecondOperand: StepShape_BooleanOperand): void;

  // StepShape_BooleanResult.SecondOperand (method)
  SecondOperand(): StepShape_BooleanOperand;

  // StepShape_BooleanResult.get_type_name (method)
  static get_type_name(): string;

  // StepShape_BooleanResult.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_BooleanResult.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_BooleanResult.delete (method)
  delete(): void;

  // StepShape_BooleanResult.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_BoxDomain: declare class StepShape_BoxDomain extends Standard_Transient

  // StepShape_BoxDomain.constructor (constructor)
  constructor();

  // StepShape_BoxDomain.Init (method)
  Init(aCorner: StepGeom_CartesianPoint, aXlength: number, aYlength: number, aZlength: number): void;

  // StepShape_BoxDomain.SetCorner (method)
  SetCorner(aCorner: StepGeom_CartesianPoint): void;

  // StepShape_BoxDomain.Corner (method)
  Corner(): StepGeom_CartesianPoint;

  // StepShape_BoxDomain.SetXlength (method)
  SetXlength(aXlength: number): void;

  // StepShape_BoxDomain.Xlength (method)
  Xlength(): number;

  // StepShape_BoxDomain.SetYlength (method)
  SetYlength(aYlength: number): void;

  // StepShape_BoxDomain.Ylength (method)
  Ylength(): number;

  // StepShape_BoxDomain.SetZlength (method)
  SetZlength(aZlength: number): void;

  // StepShape_BoxDomain.Zlength (method)
  Zlength(): number;

  // StepShape_BoxDomain.get_type_name (method)
  static get_type_name(): string;

  // StepShape_BoxDomain.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_BoxDomain.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_BoxDomain.delete (method)
  delete(): void;

  // StepShape_BoxDomain.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_BoxedHalfSpace: declare class StepShape_BoxedHalfSpace extends StepShape_HalfSpaceSolid

  // StepShape_BoxedHalfSpace.constructor (constructor)
  constructor();

  // StepShape_BoxedHalfSpace.Init (method)
  Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean, aEnclosure: StepShape_BoxDomain): void;
  Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_BoxedHalfSpace.SetEnclosure (method)
  SetEnclosure(aEnclosure: StepShape_BoxDomain): void;

  // StepShape_BoxedHalfSpace.Enclosure (method)
  Enclosure(): StepShape_BoxDomain;

  // StepShape_BoxedHalfSpace.get_type_name (method)
  static get_type_name(): string;

  // StepShape_BoxedHalfSpace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_BoxedHalfSpace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_BoxedHalfSpace.delete (method)
  delete(): void;

  // StepShape_BoxedHalfSpace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_BrepWithVoids: declare class StepShape_BrepWithVoids extends StepShape_ManifoldSolidBrep

  // StepShape_BrepWithVoids.constructor (constructor)
  constructor();

  // StepShape_BrepWithVoids.Init (method)
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
  Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_BrepWithVoids.SetVoids (method)
  SetVoids(aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;

  // StepShape_BrepWithVoids.Voids (method)
  Voids(): NCollection_HArray1_handle_StepShape_OrientedClosedShell;

  // StepShape_BrepWithVoids.VoidsValue (method)
  VoidsValue(num: number): StepShape_OrientedClosedShell;

  // StepShape_BrepWithVoids.NbVoids (method)
  NbVoids(): number;

  // StepShape_BrepWithVoids.get_type_name (method)
  static get_type_name(): string;

  // StepShape_BrepWithVoids.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_BrepWithVoids.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_BrepWithVoids.delete (method)
  delete(): void;

  // StepShape_BrepWithVoids.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ClosedShell: declare class StepShape_ClosedShell extends StepShape_ConnectedFaceSet

  // StepShape_ClosedShell.constructor (constructor)
  constructor();

  // StepShape_ClosedShell.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ClosedShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ClosedShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ClosedShell.delete (method)
  delete(): void;

  // StepShape_ClosedShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_CompoundShapeRepresentation: declare class StepShape_CompoundShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_CompoundShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_CompoundShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_CompoundShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_CompoundShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_CompoundShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_CompoundShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ConnectedEdgeSet: declare class StepShape_ConnectedEdgeSet extends StepShape_TopologicalRepresentationItem

  // StepShape_ConnectedEdgeSet.constructor (constructor)
  constructor();

  // StepShape_ConnectedEdgeSet.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aCesEdges: NCollection_HArray1_handle_StepShape_Edge): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ConnectedEdgeSet.CesEdges (method)
  CesEdges(): NCollection_HArray1_handle_StepShape_Edge;

  // StepShape_ConnectedEdgeSet.SetCesEdges (method)
  SetCesEdges(CesEdges: NCollection_HArray1_handle_StepShape_Edge): void;

  // StepShape_ConnectedEdgeSet.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ConnectedEdgeSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ConnectedEdgeSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ConnectedEdgeSet.delete (method)
  delete(): void;

  // StepShape_ConnectedEdgeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ConnectedFaceSet: declare class StepShape_ConnectedFaceSet extends StepShape_TopologicalRepresentationItem

  // StepShape_ConnectedFaceSet.constructor (constructor)
  constructor();

  // StepShape_ConnectedFaceSet.Init (method)
  Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ConnectedFaceSet.SetCfsFaces (method)
  SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

  // StepShape_ConnectedFaceSet.CfsFaces (method)
  CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

  // StepShape_ConnectedFaceSet.CfsFacesValue (method)
  CfsFacesValue(num: number): StepShape_Face;

  // StepShape_ConnectedFaceSet.NbCfsFaces (method)
  NbCfsFaces(): number;

  // StepShape_ConnectedFaceSet.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ConnectedFaceSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ConnectedFaceSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ConnectedFaceSet.delete (method)
  delete(): void;

  // StepShape_ConnectedFaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ConnectedFaceShapeRepresentation: declare class StepShape_ConnectedFaceShapeRepresentation extends StepRepr_Representation

  // StepShape_ConnectedFaceShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_ConnectedFaceShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ConnectedFaceShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ConnectedFaceShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ConnectedFaceShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_ConnectedFaceShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ConnectedFaceSubSet: declare class StepShape_ConnectedFaceSubSet extends StepShape_ConnectedFaceSet

  // StepShape_ConnectedFaceSubSet.constructor (constructor)
  constructor();

  // StepShape_ConnectedFaceSubSet.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ConnectedFaceSubSet.ParentFaceSet (method)
  ParentFaceSet(): StepShape_ConnectedFaceSet;

  // StepShape_ConnectedFaceSubSet.SetParentFaceSet (method)
  SetParentFaceSet(ParentFaceSet: StepShape_ConnectedFaceSet): void;

  // StepShape_ConnectedFaceSubSet.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ConnectedFaceSubSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ConnectedFaceSubSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ConnectedFaceSubSet.delete (method)
  delete(): void;

  // StepShape_ConnectedFaceSubSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ContextDependentShapeRepresentation: declare class StepShape_ContextDependentShapeRepresentation extends Standard_Transient

  // StepShape_ContextDependentShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_ContextDependentShapeRepresentation.Init (method)
  Init(aRepRel: StepRepr_ShapeRepresentationRelationship, aProRel: StepRepr_ProductDefinitionShape): void;

  // StepShape_ContextDependentShapeRepresentation.RepresentationRelation (method)
  RepresentationRelation(): StepRepr_ShapeRepresentationRelationship;

  // StepShape_ContextDependentShapeRepresentation.SetRepresentationRelation (method)
  SetRepresentationRelation(aRepRel: StepRepr_ShapeRepresentationRelationship): void;

  // StepShape_ContextDependentShapeRepresentation.RepresentedProductRelation (method)
  RepresentedProductRelation(): StepRepr_ProductDefinitionShape;

  // StepShape_ContextDependentShapeRepresentation.SetRepresentedProductRelation (method)
  SetRepresentedProductRelation(aProRel: StepRepr_ProductDefinitionShape): void;

  // StepShape_ContextDependentShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ContextDependentShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ContextDependentShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ContextDependentShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_ContextDependentShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_CsgPrimitive: declare class StepShape_CsgPrimitive extends StepData_SelectType

  // StepShape_CsgPrimitive.constructor (constructor)
  constructor();

  // StepShape_CsgPrimitive.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_CsgPrimitive.Sphere (method)
  Sphere(): StepShape_Sphere;

  // StepShape_CsgPrimitive.Block (method)
  Block(): StepShape_Block;

  // StepShape_CsgPrimitive.RightAngularWedge (method)
  RightAngularWedge(): StepShape_RightAngularWedge;

  // StepShape_CsgPrimitive.Torus (method)
  Torus(): StepShape_Torus;

  // StepShape_CsgPrimitive.RightCircularCone (method)
  RightCircularCone(): StepShape_RightCircularCone;

  // StepShape_CsgPrimitive.RightCircularCylinder (method)
  RightCircularCylinder(): StepShape_RightCircularCylinder;

  // StepShape_CsgPrimitive.delete (method)
  delete(): void;

  // StepShape_CsgPrimitive.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_CsgSelect: declare class StepShape_CsgSelect

  // StepShape_CsgSelect.constructor (constructor)
  constructor();

  // StepShape_CsgSelect.SetTypeOfContent (method)
  SetTypeOfContent(aTypeOfContent: number): void;

  // StepShape_CsgSelect.TypeOfContent (method)
  TypeOfContent(): number;

  // StepShape_CsgSelect.BooleanResult (method)
  BooleanResult(): StepShape_BooleanResult;

  // StepShape_CsgSelect.SetBooleanResult (method)
  SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

  // StepShape_CsgSelect.CsgPrimitive (method)
  CsgPrimitive(): StepShape_CsgPrimitive;

  // StepShape_CsgSelect.SetCsgPrimitive (method)
  SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

  // StepShape_CsgSelect.delete (method)
  delete(): void;

  // StepShape_CsgSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_CsgShapeRepresentation: declare class StepShape_CsgShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_CsgShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_CsgShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_CsgShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_CsgShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_CsgShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_CsgShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_CsgSolid: declare class StepShape_CsgSolid extends StepShape_SolidModel

  // StepShape_CsgSolid.constructor (constructor)
  constructor();

  // StepShape_CsgSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aTreeRootExpression: StepShape_CsgSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_CsgSolid.SetTreeRootExpression (method)
  SetTreeRootExpression(aTreeRootExpression: StepShape_CsgSelect): void;

  // StepShape_CsgSolid.TreeRootExpression (method)
  TreeRootExpression(): StepShape_CsgSelect;

  // StepShape_CsgSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_CsgSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_CsgSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_CsgSolid.delete (method)
  delete(): void;

  // StepShape_CsgSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DefinitionalRepresentationAndShapeRepresentation: declare class StepShape_DefinitionalRepresentationAndShapeRepresentation extends StepRepr_DefinitionalRepresentation

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_DefinitionalRepresentationAndShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalCharacteristic: declare class StepShape_DimensionalCharacteristic extends StepData_SelectType

  // StepShape_DimensionalCharacteristic.constructor (constructor)
  constructor();

  // StepShape_DimensionalCharacteristic.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_DimensionalCharacteristic.DimensionalLocation (method)
  DimensionalLocation(): StepShape_DimensionalLocation;

  // StepShape_DimensionalCharacteristic.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepShape_DimensionalCharacteristic.delete (method)
  delete(): void;

  // StepShape_DimensionalCharacteristic.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalCharacteristicRepresentation: declare class StepShape_DimensionalCharacteristicRepresentation extends Standard_Transient

  // StepShape_DimensionalCharacteristicRepresentation.constructor (constructor)
  constructor();

  // StepShape_DimensionalCharacteristicRepresentation.Init (method)
  Init(aDimension: StepShape_DimensionalCharacteristic, aRepresentation: StepShape_ShapeDimensionRepresentation): void;

  // StepShape_DimensionalCharacteristicRepresentation.Dimension (method)
  Dimension(): StepShape_DimensionalCharacteristic;

  // StepShape_DimensionalCharacteristicRepresentation.SetDimension (method)
  SetDimension(Dimension: StepShape_DimensionalCharacteristic): void;

  // StepShape_DimensionalCharacteristicRepresentation.Representation (method)
  Representation(): StepShape_ShapeDimensionRepresentation;

  // StepShape_DimensionalCharacteristicRepresentation.SetRepresentation (method)
  SetRepresentation(Representation: StepShape_ShapeDimensionRepresentation): void;

  // StepShape_DimensionalCharacteristicRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DimensionalCharacteristicRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DimensionalCharacteristicRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DimensionalCharacteristicRepresentation.delete (method)
  delete(): void;

  // StepShape_DimensionalCharacteristicRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalLocation: declare class StepShape_DimensionalLocation extends StepRepr_ShapeAspectRelationship

  // StepShape_DimensionalLocation.constructor (constructor)
  constructor();

  // StepShape_DimensionalLocation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DimensionalLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DimensionalLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DimensionalLocation.delete (method)
  delete(): void;

  // StepShape_DimensionalLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalLocationWithPath: declare class StepShape_DimensionalLocationWithPath extends StepShape_DimensionalLocation

  // StepShape_DimensionalLocationWithPath.constructor (constructor)
  constructor();

  // StepShape_DimensionalLocationWithPath.Init (method)
  Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aPath: StepRepr_ShapeAspect): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

  // StepShape_DimensionalLocationWithPath.Path (method)
  Path(): StepRepr_ShapeAspect;

  // StepShape_DimensionalLocationWithPath.SetPath (method)
  SetPath(Path: StepRepr_ShapeAspect): void;

  // StepShape_DimensionalLocationWithPath.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DimensionalLocationWithPath.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DimensionalLocationWithPath.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DimensionalLocationWithPath.delete (method)
  delete(): void;

  // StepShape_DimensionalLocationWithPath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalSize: declare class StepShape_DimensionalSize extends Standard_Transient

  // StepShape_DimensionalSize.constructor (constructor)
  constructor();

  // StepShape_DimensionalSize.Init (method)
  Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

  // StepShape_DimensionalSize.AppliesTo (method)
  AppliesTo(): StepRepr_ShapeAspect;

  // StepShape_DimensionalSize.SetAppliesTo (method)
  SetAppliesTo(AppliesTo: StepRepr_ShapeAspect): void;

  // StepShape_DimensionalSize.Name (method)
  Name(): TCollection_HAsciiString;

  // StepShape_DimensionalSize.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepShape_DimensionalSize.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DimensionalSize.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DimensionalSize.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DimensionalSize.delete (method)
  delete(): void;

  // StepShape_DimensionalSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DimensionalSizeWithPath: declare class StepShape_DimensionalSizeWithPath extends StepShape_DimensionalSize

  // StepShape_DimensionalSizeWithPath.constructor (constructor)
  constructor();

  // StepShape_DimensionalSizeWithPath.Init (method)
  Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aPath: StepRepr_ShapeAspect): void;
  Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

  // StepShape_DimensionalSizeWithPath.Path (method)
  Path(): StepRepr_ShapeAspect;

  // StepShape_DimensionalSizeWithPath.SetPath (method)
  SetPath(Path: StepRepr_ShapeAspect): void;

  // StepShape_DimensionalSizeWithPath.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DimensionalSizeWithPath.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DimensionalSizeWithPath.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DimensionalSizeWithPath.delete (method)
  delete(): void;

  // StepShape_DimensionalSizeWithPath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_DirectedDimensionalLocation: declare class StepShape_DirectedDimensionalLocation extends StepShape_DimensionalLocation

  // StepShape_DirectedDimensionalLocation.constructor (constructor)
  constructor();

  // StepShape_DirectedDimensionalLocation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_DirectedDimensionalLocation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_DirectedDimensionalLocation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_DirectedDimensionalLocation.delete (method)
  delete(): void;

  // StepShape_DirectedDimensionalLocation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Edge: declare class StepShape_Edge extends StepShape_TopologicalRepresentationItem

  // StepShape_Edge.constructor (constructor)
  constructor();

  // StepShape_Edge.Init (method)
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Edge.SetEdgeStart (method)
  SetEdgeStart(aEdgeStart: StepShape_Vertex): void;

  // StepShape_Edge.EdgeStart (method)
  EdgeStart(): StepShape_Vertex;

  // StepShape_Edge.SetEdgeEnd (method)
  SetEdgeEnd(aEdgeEnd: StepShape_Vertex): void;

  // StepShape_Edge.EdgeEnd (method)
  EdgeEnd(): StepShape_Vertex;

  // StepShape_Edge.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Edge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Edge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Edge.delete (method)
  delete(): void;

  // StepShape_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_EdgeBasedWireframeModel: declare class StepShape_EdgeBasedWireframeModel extends StepGeom_GeometricRepresentationItem

  // StepShape_EdgeBasedWireframeModel.constructor (constructor)
  constructor();

  // StepShape_EdgeBasedWireframeModel.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aEbwmBoundary: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_EdgeBasedWireframeModel.EbwmBoundary (method)
  EbwmBoundary(): NCollection_HArray1_handle_StepShape_ConnectedEdgeSet;

  // StepShape_EdgeBasedWireframeModel.SetEbwmBoundary (method)
  SetEbwmBoundary(EbwmBoundary: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet): void;

  // StepShape_EdgeBasedWireframeModel.get_type_name (method)
  static get_type_name(): string;

  // StepShape_EdgeBasedWireframeModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_EdgeBasedWireframeModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_EdgeBasedWireframeModel.delete (method)
  delete(): void;

  // StepShape_EdgeBasedWireframeModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_EdgeBasedWireframeShapeRepresentation: declare class StepShape_EdgeBasedWireframeShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_EdgeBasedWireframeShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_EdgeBasedWireframeShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_EdgeBasedWireframeShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_EdgeBasedWireframeShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_EdgeBasedWireframeShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_EdgeBasedWireframeShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_EdgeCurve: declare class StepShape_EdgeCurve extends StepShape_Edge

  // StepShape_EdgeCurve.constructor (constructor)
  constructor();

  // StepShape_EdgeCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex, aEdgeGeometry: StepGeom_Curve, aSameSense: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_EdgeCurve.SetEdgeGeometry (method)
  SetEdgeGeometry(aEdgeGeometry: StepGeom_Curve): void;

  // StepShape_EdgeCurve.EdgeGeometry (method)
  EdgeGeometry(): StepGeom_Curve;

  // StepShape_EdgeCurve.SetSameSense (method)
  SetSameSense(aSameSense: boolean): void;

  // StepShape_EdgeCurve.SameSense (method)
  SameSense(): boolean;

  // StepShape_EdgeCurve.get_type_name (method)
  static get_type_name(): string;

  // StepShape_EdgeCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_EdgeCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_EdgeCurve.delete (method)
  delete(): void;

  // StepShape_EdgeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_EdgeLoop: declare class StepShape_EdgeLoop extends StepShape_Loop

  // StepShape_EdgeLoop.constructor (constructor)
  constructor();

  // StepShape_EdgeLoop.Init (method)
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_EdgeLoop.SetEdgeList (method)
  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  // StepShape_EdgeLoop.EdgeList (method)
  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  // StepShape_EdgeLoop.EdgeListValue (method)
  EdgeListValue(num: number): StepShape_OrientedEdge;

  // StepShape_EdgeLoop.NbEdgeList (method)
  NbEdgeList(): number;

  // StepShape_EdgeLoop.get_type_name (method)
  static get_type_name(): string;

  // StepShape_EdgeLoop.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_EdgeLoop.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_EdgeLoop.delete (method)
  delete(): void;

  // StepShape_EdgeLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ExtrudedAreaSolid: declare class StepShape_ExtrudedAreaSolid extends StepShape_SweptAreaSolid

  // StepShape_ExtrudedAreaSolid.constructor (constructor)
  constructor();

  // StepShape_ExtrudedAreaSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ExtrudedAreaSolid.SetExtrudedDirection (method)
  SetExtrudedDirection(aExtrudedDirection: StepGeom_Direction): void;

  // StepShape_ExtrudedAreaSolid.ExtrudedDirection (method)
  ExtrudedDirection(): StepGeom_Direction;

  // StepShape_ExtrudedAreaSolid.SetDepth (method)
  SetDepth(aDepth: number): void;

  // StepShape_ExtrudedAreaSolid.Depth (method)
  Depth(): number;

  // StepShape_ExtrudedAreaSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ExtrudedAreaSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ExtrudedAreaSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ExtrudedAreaSolid.delete (method)
  delete(): void;

  // StepShape_ExtrudedAreaSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ExtrudedFaceSolid: declare class StepShape_ExtrudedFaceSolid extends StepShape_SweptFaceSolid

  // StepShape_ExtrudedFaceSolid.constructor (constructor)
  constructor();

  // StepShape_ExtrudedFaceSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aExtrudedDirection: StepGeom_Direction, aDepth: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ExtrudedFaceSolid.SetExtrudedDirection (method)
  SetExtrudedDirection(aExtrudedDirection: StepGeom_Direction): void;

  // StepShape_ExtrudedFaceSolid.ExtrudedDirection (method)
  ExtrudedDirection(): StepGeom_Direction;

  // StepShape_ExtrudedFaceSolid.SetDepth (method)
  SetDepth(aDepth: number): void;

  // StepShape_ExtrudedFaceSolid.Depth (method)
  Depth(): number;

  // StepShape_ExtrudedFaceSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ExtrudedFaceSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ExtrudedFaceSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ExtrudedFaceSolid.delete (method)
  delete(): void;

  // StepShape_ExtrudedFaceSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Face: declare class StepShape_Face extends StepShape_TopologicalRepresentationItem

  // StepShape_Face.constructor (constructor)
  constructor();

  // StepShape_Face.Init (method)
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Face.SetBounds (method)
  SetBounds(aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;

  // StepShape_Face.Bounds (method)
  Bounds(): NCollection_HArray1_handle_StepShape_FaceBound;

  // StepShape_Face.BoundsValue (method)
  BoundsValue(num: number): StepShape_FaceBound;

  // StepShape_Face.NbBounds (method)
  NbBounds(): number;

  // StepShape_Face.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Face.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Face.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Face.delete (method)
  delete(): void;

  // StepShape_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FaceBasedSurfaceModel: declare class StepShape_FaceBasedSurfaceModel extends StepGeom_GeometricRepresentationItem

  // StepShape_FaceBasedSurfaceModel.constructor (constructor)
  constructor();

  // StepShape_FaceBasedSurfaceModel.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFbsmFaces: NCollection_HArray1_handle_StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_FaceBasedSurfaceModel.FbsmFaces (method)
  FbsmFaces(): NCollection_HArray1_handle_StepShape_ConnectedFaceSet;

  // StepShape_FaceBasedSurfaceModel.SetFbsmFaces (method)
  SetFbsmFaces(FbsmFaces: NCollection_HArray1_handle_StepShape_ConnectedFaceSet): void;

  // StepShape_FaceBasedSurfaceModel.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FaceBasedSurfaceModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FaceBasedSurfaceModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FaceBasedSurfaceModel.delete (method)
  delete(): void;

  // StepShape_FaceBasedSurfaceModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FaceBound: declare class StepShape_FaceBound extends StepShape_TopologicalRepresentationItem

  // StepShape_FaceBound.constructor (constructor)
  constructor();

  // StepShape_FaceBound.Init (method)
  Init(aName: TCollection_HAsciiString, aBound: StepShape_Loop, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_FaceBound.SetBound (method)
  SetBound(aBound: StepShape_Loop): void;

  // StepShape_FaceBound.Bound (method)
  Bound(): StepShape_Loop;

  // StepShape_FaceBound.SetOrientation (method)
  SetOrientation(aOrientation: boolean): void;

  // StepShape_FaceBound.Orientation (method)
  Orientation(): boolean;

  // StepShape_FaceBound.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FaceBound.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FaceBound.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FaceBound.delete (method)
  delete(): void;

  // StepShape_FaceBound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FaceOuterBound: declare class StepShape_FaceOuterBound extends StepShape_FaceBound

  // StepShape_FaceOuterBound.constructor (constructor)
  constructor();

  // StepShape_FaceOuterBound.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FaceOuterBound.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FaceOuterBound.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FaceOuterBound.delete (method)
  delete(): void;

  // StepShape_FaceOuterBound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FaceSurface: declare class StepShape_FaceSurface extends StepShape_Face

  // StepShape_FaceSurface.constructor (constructor)
  constructor();

  // StepShape_FaceSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound, aFaceGeometry: StepGeom_Surface, aSameSense: boolean): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_FaceSurface.SetFaceGeometry (method)
  SetFaceGeometry(aFaceGeometry: StepGeom_Surface): void;

  // StepShape_FaceSurface.FaceGeometry (method)
  FaceGeometry(): StepGeom_Surface;

  // StepShape_FaceSurface.SetSameSense (method)
  SetSameSense(aSameSense: boolean): void;

  // StepShape_FaceSurface.SameSense (method)
  SameSense(): boolean;

  // StepShape_FaceSurface.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FaceSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FaceSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FaceSurface.delete (method)
  delete(): void;

  // StepShape_FaceSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_FacetedBrep: declare class StepShape_FacetedBrep extends StepShape_ManifoldSolidBrep

  // StepShape_FacetedBrep.constructor (constructor)
  constructor();

  // StepShape_FacetedBrep.get_type_name (method)
  static get_type_name(): string;

  // StepShape_FacetedBrep.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_FacetedBrep.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_FacetedBrep.delete (method)
  delete(): void;

  // StepShape_FacetedBrep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
