# libcascade — StepShape

32 top-level symbols. Signatures are verbatim typescript.

StepShape_AdvancedBrepShapeRepresentation: declare class StepShape_AdvancedBrepShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_AdvancedFace: declare class StepShape_AdvancedFace extends StepShape_FaceSurface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_AngleRelator: typeof StepShape_AngleRelator[keyof typeof StepShape_AngleRelator]

// Representation of STEP entity AngularLocation
StepShape_AngularLocation: declare class StepShape_AngularLocation extends StepShape_DimensionalLocation

constructor

// Initialize all fields (own and inherited)
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aAngleSelection: StepShape_AngleRelator): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aAngleSelection: StepShape_AngleRelator): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

// Returns field AngleSelection
AngleSelection(): StepShape_AngleRelator;

// Set field AngleSelection
SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity AngularSize
StepShape_AngularSize: declare class StepShape_AngularSize extends StepShape_DimensionalSize

constructor

// Initialize all fields (own and inherited)
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aAngleSelection: StepShape_AngleRelator): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aAngleSelection: StepShape_AngleRelator): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

// Returns field AngleSelection
AngleSelection(): StepShape_AngleRelator;

// Set field AngleSelection
SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Block: declare class StepShape_Block extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

Position(): StepGeom_Axis2Placement3d;

SetX(aX: number): void;

X(): number;

SetY(aY: number): void;

Y(): number;

SetZ(aZ: number): void;

Z(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_BooleanOperand: declare class StepShape_BooleanOperand

constructor

SetTypeOfContent(aTypeOfContent: number): void;

TypeOfContent(): number;

// returns Value as a SolidModel (Null if another type)
SolidModel(): StepShape_SolidModel;

SetSolidModel(aSolidModel: StepShape_SolidModel): void;

// returns Value as a HalfSpaceSolid (Null if another type)
HalfSpaceSolid(): StepShape_HalfSpaceSolid;

SetHalfSpaceSolid(aHalfSpaceSolid: StepShape_HalfSpaceSolid): void;

// returns Value as a CsgPrimitive (Null if another type) CsgPrimitive is another Select Type
CsgPrimitive(): StepShape_CsgPrimitive;

SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

// returns Value as a BooleanResult (Null if another type)
BooleanResult(): StepShape_BooleanResult;

SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_BooleanOperator: typeof StepShape_BooleanOperator[keyof typeof StepShape_BooleanOperator]

StepShape_BooleanResult: declare class StepShape_BooleanResult extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aOperator: StepShape_BooleanOperator, aFirstOperand: StepShape_BooleanOperand, aSecondOperand: StepShape_BooleanOperand): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOperator: StepShape_BooleanOperator, aFirstOperand: StepShape_BooleanOperand, aSecondOperand: StepShape_BooleanOperand): void;
Init(aName: TCollection_HAsciiString): void;

SetOperator(aOperator: StepShape_BooleanOperator): void;

Operator(): StepShape_BooleanOperator;

SetFirstOperand(aFirstOperand: StepShape_BooleanOperand): void;

FirstOperand(): StepShape_BooleanOperand;

SetSecondOperand(aSecondOperand: StepShape_BooleanOperand): void;

SecondOperand(): StepShape_BooleanOperand;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_BoxDomain: declare class StepShape_BoxDomain extends Standard_Transient

constructor

Init(aCorner: StepGeom_CartesianPoint, aXlength: number, aYlength: number, aZlength: number): void;

SetCorner(aCorner: StepGeom_CartesianPoint): void;

Corner(): StepGeom_CartesianPoint;

SetXlength(aXlength: number): void;

Xlength(): number;

SetYlength(aYlength: number): void;

Ylength(): number;

SetZlength(aZlength: number): void;

Zlength(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_BoxedHalfSpace: declare class StepShape_BoxedHalfSpace extends StepShape_HalfSpaceSolid

constructor

Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean, aEnclosure: StepShape_BoxDomain): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean, aEnclosure: StepShape_BoxDomain): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean, aEnclosure: StepShape_BoxDomain): void;
Init(aName: TCollection_HAsciiString, aBaseSurface: StepGeom_Surface, aAgreementFlag: boolean): void;
Init(aName: TCollection_HAsciiString): void;

SetEnclosure(aEnclosure: StepShape_BoxDomain): void;

Enclosure(): StepShape_BoxDomain;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_BrepWithVoids: declare class StepShape_BrepWithVoids extends StepShape_ManifoldSolidBrep

constructor

Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell, aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ClosedShell): void;
Init(aName: TCollection_HAsciiString, aOuter: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;

SetVoids(aVoids: NCollection_HArray1_handle_StepShape_OrientedClosedShell): void;

Voids(): NCollection_HArray1_handle_StepShape_OrientedClosedShell;

VoidsValue(num: number): StepShape_OrientedClosedShell;

NbVoids(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ClosedShell: declare class StepShape_ClosedShell extends StepShape_ConnectedFaceSet

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CompoundShapeRepresentation
StepShape_CompoundShapeRepresentation: declare class StepShape_CompoundShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConnectedEdgeSet
StepShape_ConnectedEdgeSet: declare class StepShape_ConnectedEdgeSet extends StepShape_TopologicalRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCesEdges: NCollection_HArray1_handle_StepShape_Edge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCesEdges: NCollection_HArray1_handle_StepShape_Edge): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field CesEdges
CesEdges(): NCollection_HArray1_handle_StepShape_Edge;

// Set field CesEdges
SetCesEdges(CesEdges: NCollection_HArray1_handle_StepShape_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ConnectedFaceSet: declare class StepShape_ConnectedFaceSet extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;

SetCfsFaces(aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;

CfsFaces(): NCollection_HArray1_handle_StepShape_Face;

CfsFacesValue(num: number): StepShape_Face;

NbCfsFaces(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConnectedFaceShapeRepresentation
StepShape_ConnectedFaceShapeRepresentation: declare class StepShape_ConnectedFaceShapeRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConnectedFaceSubSet
StepShape_ConnectedFaceSubSet: declare class StepShape_ConnectedFaceSubSet extends StepShape_ConnectedFaceSet

constructor

// Initialize all fields (own and inherited)
Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ParentFaceSet
ParentFaceSet(): StepShape_ConnectedFaceSet;

// Set field ParentFaceSet
SetParentFaceSet(ParentFaceSet: StepShape_ConnectedFaceSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_ContextDependentShapeRepresentation: declare class StepShape_ContextDependentShapeRepresentation extends Standard_Transient

constructor

Init(aRepRel: StepRepr_ShapeRepresentationRelationship, aProRel: StepRepr_ProductDefinitionShape): void;

RepresentationRelation(): StepRepr_ShapeRepresentationRelationship;

SetRepresentationRelation(aRepRel: StepRepr_ShapeRepresentationRelationship): void;

RepresentedProductRelation(): StepRepr_ProductDefinitionShape;

SetRepresentedProductRelation(aProRel: StepRepr_ProductDefinitionShape): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_CsgPrimitive: declare class StepShape_CsgPrimitive extends StepData_SelectType

constructor

// Recognizes a CsgPrimitive Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Sphere (Null if another type)
Sphere(): StepShape_Sphere;

// returns Value as a Block (Null if another type)
Block(): StepShape_Block;

// returns Value as a RightAngularWedge (Null if another type)
RightAngularWedge(): StepShape_RightAngularWedge;

// returns Value as a Torus (Null if another type)
Torus(): StepShape_Torus;

// returns Value as a RightCircularCone (Null if another type)
RightCircularCone(): StepShape_RightCircularCone;

// returns Value as a RightCircularCylinder (Null if another type)
RightCircularCylinder(): StepShape_RightCircularCylinder;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_CsgSelect: declare class StepShape_CsgSelect

constructor

SetTypeOfContent(aTypeOfContent: number): void;

TypeOfContent(): number;

// returns Value as a BooleanResult (Null if another type)
BooleanResult(): StepShape_BooleanResult;

SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

// returns Value as a CsgPrimitive (Null if another type)
CsgPrimitive(): StepShape_CsgPrimitive;

SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_CsgShapeRepresentation: declare class StepShape_CsgShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_CsgSolid: declare class StepShape_CsgSolid extends StepShape_SolidModel

constructor

Init(aName: TCollection_HAsciiString, aTreeRootExpression: StepShape_CsgSelect): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aTreeRootExpression: StepShape_CsgSelect): void;
Init(aName: TCollection_HAsciiString): void;

SetTreeRootExpression(aTreeRootExpression: StepShape_CsgSelect): void;

TreeRootExpression(): StepShape_CsgSelect;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements complex type (DEFINITIONAL_REPRESENTATION,REPRESENTATION,SHAPE_REPRESENTATION)
StepShape_DefinitionalRepresentationAndShapeRepresentation: declare class StepShape_DefinitionalRepresentationAndShapeRepresentation extends StepRepr_DefinitionalRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type DimensionalCharacteristic
StepShape_DimensionalCharacteristic: declare class StepShape_DimensionalCharacteristic extends StepData_SelectType

constructor

// Recognizes a kind of DimensionalCharacteristic select type 1 -> DimensionalLocation from StepShape 2 -> DimensionalSize from StepShape 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as DimensionalLocation (or Null if another type)
DimensionalLocation(): StepShape_DimensionalLocation;

// Returns Value as DimensionalSize (or Null if another type)
DimensionalSize(): StepShape_DimensionalSize;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalCharacteristicRepresentation
StepShape_DimensionalCharacteristicRepresentation: declare class StepShape_DimensionalCharacteristicRepresentation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aDimension: StepShape_DimensionalCharacteristic, aRepresentation: StepShape_ShapeDimensionRepresentation): void;

// Returns field Dimension
Dimension(): StepShape_DimensionalCharacteristic;

// Set field Dimension
SetDimension(Dimension: StepShape_DimensionalCharacteristic): void;

// Returns field Representation
Representation(): StepShape_ShapeDimensionRepresentation;

// Set field Representation
SetRepresentation(Representation: StepShape_ShapeDimensionRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalLocation
StepShape_DimensionalLocation: declare class StepShape_DimensionalLocation extends StepRepr_ShapeAspectRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalLocationWithPath
StepShape_DimensionalLocationWithPath: declare class StepShape_DimensionalLocationWithPath extends StepShape_DimensionalLocation

constructor

// Initialize all fields (own and inherited)
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aPath: StepRepr_ShapeAspect): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aPath: StepRepr_ShapeAspect): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

// Returns field Path
Path(): StepRepr_ShapeAspect;

// Set field Path
SetPath(Path: StepRepr_ShapeAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalSize
StepShape_DimensionalSize: declare class StepShape_DimensionalSize extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

// Returns field AppliesTo
AppliesTo(): StepRepr_ShapeAspect;

// Set field AppliesTo
SetAppliesTo(AppliesTo: StepRepr_ShapeAspect): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalSizeWithPath
StepShape_DimensionalSizeWithPath: declare class StepShape_DimensionalSizeWithPath extends StepShape_DimensionalSize

constructor

// Initialize all fields (own and inherited)
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aPath: StepRepr_ShapeAspect): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aPath: StepRepr_ShapeAspect): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

// Returns field Path
Path(): StepRepr_ShapeAspect;

// Set field Path
SetPath(Path: StepRepr_ShapeAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DirectedDimensionalLocation
StepShape_DirectedDimensionalLocation: declare class StepShape_DirectedDimensionalLocation extends StepShape_DimensionalLocation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepShape_Edge: declare class StepShape_Edge extends StepShape_TopologicalRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

SetEdgeStart(aEdgeStart: StepShape_Vertex): void;

EdgeStart(): StepShape_Vertex;

SetEdgeEnd(aEdgeEnd: StepShape_Vertex): void;

EdgeEnd(): StepShape_Vertex;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
