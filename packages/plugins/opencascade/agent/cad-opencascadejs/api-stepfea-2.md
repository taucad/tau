# libcascade — StepFEA (2)

41 top-level symbols. Signatures are verbatim typescript.

StepFEA_FeaShellMembraneStiffness: declare class StepFEA_FeaShellMembraneStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaShellMembraneStiffness.constructor (constructor)
  constructor();

  // StepFEA_FeaShellMembraneStiffness.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor42d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaShellMembraneStiffness.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor42d;

  // StepFEA_FeaShellMembraneStiffness.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor42d): void;

  // StepFEA_FeaShellMembraneStiffness.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaShellMembraneStiffness.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaShellMembraneStiffness.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaShellMembraneStiffness.delete (method)
  delete(): void;

  // StepFEA_FeaShellMembraneStiffness.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaShellShearStiffness: declare class StepFEA_FeaShellShearStiffness extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaShellShearStiffness.constructor (constructor)
  constructor();

  // StepFEA_FeaShellShearStiffness.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor22d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaShellShearStiffness.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor22d;

  // StepFEA_FeaShellShearStiffness.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor22d): void;

  // StepFEA_FeaShellShearStiffness.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaShellShearStiffness.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaShellShearStiffness.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaShellShearStiffness.delete (method)
  delete(): void;

  // StepFEA_FeaShellShearStiffness.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaSurfaceSectionGeometricRelationship: declare class StepFEA_FeaSurfaceSectionGeometricRelationship extends Standard_Transient

  // StepFEA_FeaSurfaceSectionGeometricRelationship.constructor (constructor)
  constructor();

  // StepFEA_FeaSurfaceSectionGeometricRelationship.Init (method)
  Init(aSectionRef: StepElement_SurfaceSection, aItem: StepElement_AnalysisItemWithinRepresentation): void;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.SectionRef (method)
  SectionRef(): StepElement_SurfaceSection;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.SetSectionRef (method)
  SetSectionRef(SectionRef: StepElement_SurfaceSection): void;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.Item (method)
  Item(): StepElement_AnalysisItemWithinRepresentation;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.SetItem (method)
  SetItem(Item: StepElement_AnalysisItemWithinRepresentation): void;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.delete (method)
  delete(): void;

  // StepFEA_FeaSurfaceSectionGeometricRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion: declare class StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion extends StepFEA_FeaMaterialPropertyRepresentationItem

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.constructor (constructor)
  constructor();

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFeaConstants: StepFEA_SymmetricTensor23d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.FeaConstants (method)
  FeaConstants(): StepFEA_SymmetricTensor23d;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.SetFeaConstants (method)
  SetFeaConstants(FeaConstants: StepFEA_SymmetricTensor23d): void;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.delete (method)
  delete(): void;

  // StepFEA_FeaTangentialCoefficientOfLinearThermalExpansion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FreedomAndCoefficient: declare class StepFEA_FreedomAndCoefficient extends Standard_Transient

  // StepFEA_FreedomAndCoefficient.constructor (constructor)
  constructor();

  // StepFEA_FreedomAndCoefficient.Init (method)
  Init(aFreedom: StepFEA_DegreeOfFreedom, aA: StepElement_MeasureOrUnspecifiedValue): void;

  // StepFEA_FreedomAndCoefficient.Freedom (method)
  Freedom(): StepFEA_DegreeOfFreedom;

  // StepFEA_FreedomAndCoefficient.SetFreedom (method)
  SetFreedom(Freedom: StepFEA_DegreeOfFreedom): void;

  // StepFEA_FreedomAndCoefficient.A (method)
  A(): StepElement_MeasureOrUnspecifiedValue;

  // StepFEA_FreedomAndCoefficient.SetA (method)
  SetA(A: StepElement_MeasureOrUnspecifiedValue): void;

  // StepFEA_FreedomAndCoefficient.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FreedomAndCoefficient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FreedomAndCoefficient.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FreedomAndCoefficient.delete (method)
  delete(): void;

  // StepFEA_FreedomAndCoefficient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_FreedomsList: declare class StepFEA_FreedomsList extends Standard_Transient

  // StepFEA_FreedomsList.constructor (constructor)
  constructor();

  // StepFEA_FreedomsList.Init (method)
  Init(aFreedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

  // StepFEA_FreedomsList.Freedoms (method)
  Freedoms(): NCollection_HArray1_StepFEA_DegreeOfFreedom;

  // StepFEA_FreedomsList.SetFreedoms (method)
  SetFreedoms(Freedoms: NCollection_HArray1_StepFEA_DegreeOfFreedom): void;

  // StepFEA_FreedomsList.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_FreedomsList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_FreedomsList.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_FreedomsList.delete (method)
  delete(): void;

  // StepFEA_FreedomsList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_GeometricNode: declare class StepFEA_GeometricNode extends StepFEA_NodeRepresentation

  // StepFEA_GeometricNode.constructor (constructor)
  constructor();

  // StepFEA_GeometricNode.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_GeometricNode.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_GeometricNode.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_GeometricNode.delete (method)
  delete(): void;

  // StepFEA_GeometricNode.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_Node: declare class StepFEA_Node extends StepFEA_NodeRepresentation

  // StepFEA_Node.constructor (constructor)
  constructor();

  // StepFEA_Node.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_Node.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_Node.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_Node.delete (method)
  delete(): void;

  // StepFEA_Node.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeDefinition: declare class StepFEA_NodeDefinition extends StepRepr_ShapeAspect

  // StepFEA_NodeDefinition.constructor (constructor)
  constructor();

  // StepFEA_NodeDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeDefinition.delete (method)
  delete(): void;

  // StepFEA_NodeDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeGroup: declare class StepFEA_NodeGroup extends StepFEA_FeaGroup

  // StepFEA_NodeGroup.constructor (constructor)
  constructor();

  // StepFEA_NodeGroup.Init (method)
  Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aFeaGroup_ModelRef: StepFEA_FeaModel, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aGroup_Name: TCollection_HAsciiString, aGroup_Description: TCollection_HAsciiString, aModelRef: StepFEA_FeaModel): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepFEA_NodeGroup.Nodes (method)
  Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

  // StepFEA_NodeGroup.SetNodes (method)
  SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

  // StepFEA_NodeGroup.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeGroup.delete (method)
  delete(): void;

  // StepFEA_NodeGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeRepresentation: declare class StepFEA_NodeRepresentation extends StepRepr_Representation

  // StepFEA_NodeRepresentation.constructor (constructor)
  constructor();

  // StepFEA_NodeRepresentation.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aModelRef: StepFEA_FeaModel): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_NodeRepresentation.ModelRef (method)
  ModelRef(): StepFEA_FeaModel;

  // StepFEA_NodeRepresentation.SetModelRef (method)
  SetModelRef(ModelRef: StepFEA_FeaModel): void;

  // StepFEA_NodeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeRepresentation.delete (method)
  delete(): void;

  // StepFEA_NodeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeSet: declare class StepFEA_NodeSet extends StepGeom_GeometricRepresentationItem

  // StepFEA_NodeSet.constructor (constructor)
  constructor();

  // StepFEA_NodeSet.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aNodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_NodeSet.Nodes (method)
  Nodes(): NCollection_HArray1_handle_StepFEA_NodeRepresentation;

  // StepFEA_NodeSet.SetNodes (method)
  SetNodes(Nodes: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;

  // StepFEA_NodeSet.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeSet.delete (method)
  delete(): void;

  // StepFEA_NodeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeWithSolutionCoordinateSystem: declare class StepFEA_NodeWithSolutionCoordinateSystem extends StepFEA_Node

  // StepFEA_NodeWithSolutionCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_NodeWithSolutionCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeWithSolutionCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeWithSolutionCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeWithSolutionCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_NodeWithSolutionCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_NodeWithVector: declare class StepFEA_NodeWithVector extends StepFEA_Node

  // StepFEA_NodeWithVector.constructor (constructor)
  constructor();

  // StepFEA_NodeWithVector.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_NodeWithVector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_NodeWithVector.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_NodeWithVector.delete (method)
  delete(): void;

  // StepFEA_NodeWithVector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ParametricCurve3dElementCoordinateDirection: declare class StepFEA_ParametricCurve3dElementCoordinateDirection extends StepFEA_FeaRepresentationItem

  // StepFEA_ParametricCurve3dElementCoordinateDirection.constructor (constructor)
  constructor();

  // StepFEA_ParametricCurve3dElementCoordinateDirection.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientation: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.Orientation (method)
  Orientation(): StepGeom_Direction;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.SetOrientation (method)
  SetOrientation(Orientation: StepGeom_Direction): void;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.delete (method)
  delete(): void;

  // StepFEA_ParametricCurve3dElementCoordinateDirection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ParametricCurve3dElementCoordinateSystem: declare class StepFEA_ParametricCurve3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_ParametricCurve3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_ParametricCurve3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aDirection: StepFEA_ParametricCurve3dElementCoordinateDirection): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.Direction (method)
  Direction(): StepFEA_ParametricCurve3dElementCoordinateDirection;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.SetDirection (method)
  SetDirection(Direction: StepFEA_ParametricCurve3dElementCoordinateDirection): void;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_ParametricCurve3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_ParametricSurface3dElementCoordinateSystem: declare class StepFEA_ParametricSurface3dElementCoordinateSystem extends StepFEA_FeaRepresentationItem

  // StepFEA_ParametricSurface3dElementCoordinateSystem.constructor (constructor)
  constructor();

  // StepFEA_ParametricSurface3dElementCoordinateSystem.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aAxis: number, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.Axis (method)
  Axis(): number;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.SetAxis (method)
  SetAxis(Axis: number): void;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.Angle (method)
  Angle(): number;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.SetAngle (method)
  SetAngle(Angle: number): void;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.delete (method)
  delete(): void;

  // StepFEA_ParametricSurface3dElementCoordinateSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_Surface3dElementRepresentation: declare class StepFEA_Surface3dElementRepresentation extends StepFEA_ElementRepresentation

  // StepFEA_Surface3dElementRepresentation.constructor (constructor)
  constructor();

  // StepFEA_Surface3dElementRepresentation.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Surface3dElementDescriptor, aProperty: StepElement_SurfaceElementProperty, aMaterial: StepElement_ElementMaterial): void;
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_Surface3dElementRepresentation.ModelRef (method)
  ModelRef(): StepFEA_FeaModel3d;

  // StepFEA_Surface3dElementRepresentation.SetModelRef (method)
  SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

  // StepFEA_Surface3dElementRepresentation.ElementDescriptor (method)
  ElementDescriptor(): StepElement_Surface3dElementDescriptor;

  // StepFEA_Surface3dElementRepresentation.SetElementDescriptor (method)
  SetElementDescriptor(ElementDescriptor: StepElement_Surface3dElementDescriptor): void;

  // StepFEA_Surface3dElementRepresentation.Property (method)
  Property(): StepElement_SurfaceElementProperty;

  // StepFEA_Surface3dElementRepresentation.SetProperty (method)
  SetProperty(Property: StepElement_SurfaceElementProperty): void;

  // StepFEA_Surface3dElementRepresentation.Material (method)
  Material(): StepElement_ElementMaterial;

  // StepFEA_Surface3dElementRepresentation.SetMaterial (method)
  SetMaterial(Material: StepElement_ElementMaterial): void;

  // StepFEA_Surface3dElementRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_Surface3dElementRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_Surface3dElementRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_Surface3dElementRepresentation.delete (method)
  delete(): void;

  // StepFEA_Surface3dElementRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_SymmetricTensor22d: declare class StepFEA_SymmetricTensor22d extends StepData_SelectType

  // StepFEA_SymmetricTensor22d.constructor (constructor)
  constructor();

  // StepFEA_SymmetricTensor22d.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_SymmetricTensor22d.AnisotropicSymmetricTensor22d (method)
  AnisotropicSymmetricTensor22d(): NCollection_HArray1_double;

  // StepFEA_SymmetricTensor22d.delete (method)
  delete(): void;

  // StepFEA_SymmetricTensor22d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_SymmetricTensor23d: declare class StepFEA_SymmetricTensor23d extends StepData_SelectType

  // StepFEA_SymmetricTensor23d.constructor (constructor)
  constructor();

  // StepFEA_SymmetricTensor23d.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_SymmetricTensor23d.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepFEA_SymmetricTensor23d.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepFEA_SymmetricTensor23d.SetIsotropicSymmetricTensor23d (method)
  SetIsotropicSymmetricTensor23d(aVal: number): void;

  // StepFEA_SymmetricTensor23d.IsotropicSymmetricTensor23d (method)
  IsotropicSymmetricTensor23d(): number;

  // StepFEA_SymmetricTensor23d.SetOrthotropicSymmetricTensor23d (method)
  SetOrthotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

  // StepFEA_SymmetricTensor23d.OrthotropicSymmetricTensor23d (method)
  OrthotropicSymmetricTensor23d(): NCollection_HArray1_double;

  // StepFEA_SymmetricTensor23d.SetAnisotropicSymmetricTensor23d (method)
  SetAnisotropicSymmetricTensor23d(aVal: NCollection_HArray1_double): void;

  // StepFEA_SymmetricTensor23d.AnisotropicSymmetricTensor23d (method)
  AnisotropicSymmetricTensor23d(): NCollection_HArray1_double;

  // StepFEA_SymmetricTensor23d.delete (method)
  delete(): void;

  // StepFEA_SymmetricTensor23d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_SymmetricTensor23dMember: declare class StepFEA_SymmetricTensor23dMember extends StepData_SelectArrReal

  // StepFEA_SymmetricTensor23dMember.constructor (constructor)
  constructor();

  // StepFEA_SymmetricTensor23dMember.HasName (method)
  HasName(): boolean;

  // StepFEA_SymmetricTensor23dMember.Name (method)
  Name(): string;

  // StepFEA_SymmetricTensor23dMember.SetName (method)
  SetName(name: string): boolean;

  // StepFEA_SymmetricTensor23dMember.Matches (method)
  Matches(name: string): boolean;

  // StepFEA_SymmetricTensor23dMember.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_SymmetricTensor23dMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_SymmetricTensor23dMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_SymmetricTensor23dMember.delete (method)
  delete(): void;

  // StepFEA_SymmetricTensor23dMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_SymmetricTensor42d: declare class StepFEA_SymmetricTensor42d extends StepData_SelectType

  // StepFEA_SymmetricTensor42d.constructor (constructor)
  constructor();

  // StepFEA_SymmetricTensor42d.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepFEA_SymmetricTensor42d.AnisotropicSymmetricTensor42d (method)
  AnisotropicSymmetricTensor42d(): NCollection_HArray1_double;

  // StepFEA_SymmetricTensor42d.delete (method)
  delete(): void;

  // StepFEA_SymmetricTensor42d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_SymmetricTensor43dMember: declare class StepFEA_SymmetricTensor43dMember extends StepData_SelectArrReal

  // StepFEA_SymmetricTensor43dMember.constructor (constructor)
  constructor();

  // StepFEA_SymmetricTensor43dMember.HasName (method)
  HasName(): boolean;

  // StepFEA_SymmetricTensor43dMember.Name (method)
  Name(): string;

  // StepFEA_SymmetricTensor43dMember.SetName (method)
  SetName(name: string): boolean;

  // StepFEA_SymmetricTensor43dMember.Matches (method)
  Matches(name: string): boolean;

  // StepFEA_SymmetricTensor43dMember.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_SymmetricTensor43dMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_SymmetricTensor43dMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_SymmetricTensor43dMember.delete (method)
  delete(): void;

  // StepFEA_SymmetricTensor43dMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_UnspecifiedValue: typeof StepFEA_UnspecifiedValue[keyof typeof StepFEA_UnspecifiedValue]

  readonly StepFEA_Unspecified: 'StepFEA_Unspecified'

StepFEA_Volume3dElementRepresentation: declare class StepFEA_Volume3dElementRepresentation extends StepFEA_ElementRepresentation

  // StepFEA_Volume3dElementRepresentation.constructor (constructor)
  constructor();

  // StepFEA_Volume3dElementRepresentation.Init (method)
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aElementRepresentation_NodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation, aModelRef: StepFEA_FeaModel3d, aElementDescriptor: StepElement_Volume3dElementDescriptor, aMaterial: StepElement_ElementMaterial): void;
  Init(aRepresentation_Name: TCollection_HAsciiString, aRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, aRepresentation_ContextOfItems: StepRepr_RepresentationContext, aNodeList: NCollection_HArray1_handle_StepFEA_NodeRepresentation): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepFEA_Volume3dElementRepresentation.ModelRef (method)
  ModelRef(): StepFEA_FeaModel3d;

  // StepFEA_Volume3dElementRepresentation.SetModelRef (method)
  SetModelRef(ModelRef: StepFEA_FeaModel3d): void;

  // StepFEA_Volume3dElementRepresentation.ElementDescriptor (method)
  ElementDescriptor(): StepElement_Volume3dElementDescriptor;

  // StepFEA_Volume3dElementRepresentation.SetElementDescriptor (method)
  SetElementDescriptor(ElementDescriptor: StepElement_Volume3dElementDescriptor): void;

  // StepFEA_Volume3dElementRepresentation.Material (method)
  Material(): StepElement_ElementMaterial;

  // StepFEA_Volume3dElementRepresentation.SetMaterial (method)
  SetMaterial(Material: StepElement_ElementMaterial): void;

  // StepFEA_Volume3dElementRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepFEA_Volume3dElementRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepFEA_Volume3dElementRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepFEA_Volume3dElementRepresentation.delete (method)
  delete(): void;

  // StepFEA_Volume3dElementRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepFEA_Array1OfCurveElementEndOffset: NCollection_Array1_handle_StepFEA_CurveElementEndOffset

StepFEA_Array1OfCurveElementEndRelease: NCollection_Array1_handle_StepFEA_CurveElementEndRelease

StepFEA_Array1OfCurveElementInterval: NCollection_Array1_handle_StepFEA_CurveElementInterval

StepFEA_Array1OfDegreeOfFreedom: NCollection_Array1_StepFEA_DegreeOfFreedom

StepFEA_Array1OfElementRepresentation: NCollection_Array1_handle_StepFEA_ElementRepresentation

StepFEA_Array1OfNodeRepresentation: NCollection_Array1_handle_StepFEA_NodeRepresentation

StepFEA_HArray1OfCurveElementEndOffset: NCollection_HArray1_handle_StepFEA_CurveElementEndOffset

StepFEA_HArray1OfCurveElementEndRelease: NCollection_HArray1_handle_StepFEA_CurveElementEndRelease

StepFEA_HArray1OfCurveElementInterval: NCollection_HArray1_handle_StepFEA_CurveElementInterval

StepFEA_HArray1OfDegreeOfFreedom: NCollection_HArray1_StepFEA_DegreeOfFreedom

StepFEA_HArray1OfElementRepresentation: NCollection_HArray1_handle_StepFEA_ElementRepresentation

StepFEA_HArray1OfNodeRepresentation: NCollection_HArray1_handle_StepFEA_NodeRepresentation

StepFEA_HSequenceOfElementGeometricRelationship: NCollection_HSequence_handle_StepFEA_ElementGeometricRelationship

StepFEA_HSequenceOfElementRepresentation: NCollection_HSequence_handle_StepFEA_ElementRepresentation

StepFEA_SequenceOfElementGeometricRelationship: NCollection_Sequence_handle_StepFEA_ElementGeometricRelationship

StepFEA_SequenceOfElementRepresentation: NCollection_Sequence_handle_StepFEA_ElementRepresentation
