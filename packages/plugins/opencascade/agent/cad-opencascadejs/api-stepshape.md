# libcascade — StepShape

36 top-level symbols. Signatures are verbatim typescript.

StepShape_AdvancedBrepShapeRepresentation: declare class StepShape_AdvancedBrepShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_AdvancedFace: declare class StepShape_AdvancedFace extends StepShape_FaceSurface

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_AngleRelator: typeof StepShape_AngleRelator[keyof typeof StepShape_AngleRelator]

StepShape_AngularLocation: declare class StepShape_AngularLocation extends StepShape_DimensionalLocation

constructor

Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aAngleSelection: StepShape_AngleRelator): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aAngleSelection: StepShape_AngleRelator): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

AngleSelection(): StepShape_AngleRelator;

SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_AngularSize: declare class StepShape_AngularSize extends StepShape_DimensionalSize

constructor

Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aAngleSelection: StepShape_AngleRelator): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aAngleSelection: StepShape_AngleRelator): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

AngleSelection(): StepShape_AngleRelator;

SetAngleSelection(AngleSelection: StepShape_AngleRelator): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_BooleanOperand: declare class StepShape_BooleanOperand

constructor

SetTypeOfContent(aTypeOfContent: number): void;

TypeOfContent(): number;

SolidModel(): StepShape_SolidModel;

SetSolidModel(aSolidModel: StepShape_SolidModel): void;

HalfSpaceSolid(): StepShape_HalfSpaceSolid;

SetHalfSpaceSolid(aHalfSpaceSolid: StepShape_HalfSpaceSolid): void;

CsgPrimitive(): StepShape_CsgPrimitive;

SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

BooleanResult(): StepShape_BooleanResult;

SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_ClosedShell: declare class StepShape_ClosedShell extends StepShape_ConnectedFaceSet

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_CompoundShapeRepresentation: declare class StepShape_CompoundShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ConnectedEdgeSet: declare class StepShape_ConnectedEdgeSet extends StepShape_TopologicalRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aCesEdges: NCollection_HArray1_handle_StepShape_Edge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aCesEdges: NCollection_HArray1_handle_StepShape_Edge): void;
Init(aName: TCollection_HAsciiString): void;

CesEdges(): NCollection_HArray1_handle_StepShape_Edge;

SetCesEdges(CesEdges: NCollection_HArray1_handle_StepShape_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_ConnectedFaceShapeRepresentation: declare class StepShape_ConnectedFaceShapeRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_ConnectedFaceSubSet: declare class StepShape_ConnectedFaceSubSet extends StepShape_ConnectedFaceSet

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aConnectedFaceSet_CfsFaces: NCollection_HArray1_handle_StepShape_Face, aParentFaceSet: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString, aCfsFaces: NCollection_HArray1_handle_StepShape_Face): void;
Init(aName: TCollection_HAsciiString): void;

ParentFaceSet(): StepShape_ConnectedFaceSet;

SetParentFaceSet(ParentFaceSet: StepShape_ConnectedFaceSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_CsgPrimitive: declare class StepShape_CsgPrimitive extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Sphere(): StepShape_Sphere;

Block(): StepShape_Block;

RightAngularWedge(): StepShape_RightAngularWedge;

Torus(): StepShape_Torus;

RightCircularCone(): StepShape_RightCircularCone;

RightCircularCylinder(): StepShape_RightCircularCylinder;

delete(): void;

[Symbol.dispose](): void;

StepShape_CsgSelect: declare class StepShape_CsgSelect

constructor

SetTypeOfContent(aTypeOfContent: number): void;

TypeOfContent(): number;

BooleanResult(): StepShape_BooleanResult;

SetBooleanResult(aBooleanResult: StepShape_BooleanResult): void;

CsgPrimitive(): StepShape_CsgPrimitive;

SetCsgPrimitive(aCsgPrimitive: StepShape_CsgPrimitive): void;

delete(): void;

[Symbol.dispose](): void;

StepShape_CsgShapeRepresentation: declare class StepShape_CsgShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_DefinitionalRepresentationAndShapeRepresentation: declare class StepShape_DefinitionalRepresentationAndShapeRepresentation extends StepRepr_DefinitionalRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalCharacteristic: declare class StepShape_DimensionalCharacteristic extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

DimensionalLocation(): StepShape_DimensionalLocation;

DimensionalSize(): StepShape_DimensionalSize;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalCharacteristicRepresentation: declare class StepShape_DimensionalCharacteristicRepresentation extends Standard_Transient

constructor

Init(aDimension: StepShape_DimensionalCharacteristic, aRepresentation: StepShape_ShapeDimensionRepresentation): void;

Dimension(): StepShape_DimensionalCharacteristic;

SetDimension(Dimension: StepShape_DimensionalCharacteristic): void;

Representation(): StepShape_ShapeDimensionRepresentation;

SetRepresentation(Representation: StepShape_ShapeDimensionRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalLocation: declare class StepShape_DimensionalLocation extends StepRepr_ShapeAspectRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalLocationWithPath: declare class StepShape_DimensionalLocationWithPath extends StepShape_DimensionalLocation

constructor

Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aPath: StepRepr_ShapeAspect): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;
Init(aShapeAspectRelationship_Name: TCollection_HAsciiString, hasShapeAspectRelationship_Description: boolean, aShapeAspectRelationship_Description: TCollection_HAsciiString, aShapeAspectRelationship_RelatingShapeAspect: StepRepr_ShapeAspect, aShapeAspectRelationship_RelatedShapeAspect: StepRepr_ShapeAspect, aPath: StepRepr_ShapeAspect): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

Path(): StepRepr_ShapeAspect;

SetPath(Path: StepRepr_ShapeAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalSize: declare class StepShape_DimensionalSize extends Standard_Transient

constructor

Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

AppliesTo(): StepRepr_ShapeAspect;

SetAppliesTo(AppliesTo: StepRepr_ShapeAspect): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DimensionalSizeWithPath: declare class StepShape_DimensionalSizeWithPath extends StepShape_DimensionalSize

constructor

Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aPath: StepRepr_ShapeAspect): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;
Init(aDimensionalSize_AppliesTo: StepRepr_ShapeAspect, aDimensionalSize_Name: TCollection_HAsciiString, aPath: StepRepr_ShapeAspect): void;
Init(aAppliesTo: StepRepr_ShapeAspect, aName: TCollection_HAsciiString): void;

Path(): StepRepr_ShapeAspect;

SetPath(Path: StepRepr_ShapeAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_DirectedDimensionalLocation: declare class StepShape_DirectedDimensionalLocation extends StepShape_DimensionalLocation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepShape_EdgeBasedWireframeModel: declare class StepShape_EdgeBasedWireframeModel extends StepGeom_GeometricRepresentationItem

constructor

Init(aRepresentationItem_Name: TCollection_HAsciiString, aEbwmBoundary: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(aRepresentationItem_Name: TCollection_HAsciiString, aEbwmBoundary: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet): void;
Init(aName: TCollection_HAsciiString): void;

EbwmBoundary(): NCollection_HArray1_handle_StepShape_ConnectedEdgeSet;

SetEbwmBoundary(EbwmBoundary: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_EdgeBasedWireframeShapeRepresentation: declare class StepShape_EdgeBasedWireframeShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_EdgeCurve: declare class StepShape_EdgeCurve extends StepShape_Edge

constructor

Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex, aEdgeGeometry: StepGeom_Curve, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex, aEdgeGeometry: StepGeom_Curve, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex, aEdgeGeometry: StepGeom_Curve, aSameSense: boolean): void;
Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
Init(aName: TCollection_HAsciiString): void;

SetEdgeGeometry(aEdgeGeometry: StepGeom_Curve): void;

EdgeGeometry(): StepGeom_Curve;

SetSameSense(aSameSense: boolean): void;

SameSense(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepShape_EdgeLoop: declare class StepShape_EdgeLoop extends StepShape_Loop

constructor

Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
Init(aName: TCollection_HAsciiString): void;

SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

EdgeListValue(num: number): StepShape_OrientedEdge;

NbEdgeList(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
