# libcascade — STEPConstruct (2)

3 top-level symbols. Signatures are verbatim typescript.

// Provides basic functionalities for tools which are intended for encoding/decoding specific STEP constructs
STEPConstruct_Tool: declare class STEPConstruct_Tool

constructor

// Returns currently loaded WorkSession
WS(): XSControl_WorkSession;

// Returns current model (Null if not loaded)
Model(): Interface_InterfaceModel;

// Returns TransientProcess (reading
TransientProcess(): Transfer_TransientProcess;

// Returns FinderProcess (writing
FinderProcess(): Transfer_FinderProcess;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for creation (encoding) and decoding (for writing and reading accordingly) context defining units and tolerances (uncerntanties)
STEPConstruct_UnitContext: declare class STEPConstruct_UnitContext

constructor

// Creates new context (units are MM and radians, uncertainty equal to Tol3d)
Init(Tol3d: number, theModel: StepData_StepModel, theLocalFactors?: StepData_Factors): void;

// Returns True if Init was called successfully
IsDone(): boolean;

// Returns context (or Null if not done)
Value(): StepGeom_GeomRepContextAndGlobUnitAssCtxAndGlobUncertaintyAssCtx;

// Computes the length, plane angle and solid angle conversion factor
ComputeFactors(aContext: StepRepr_GlobalUnitAssignedContext, theLocalFactors: StepData_Factors): number;
ComputeFactors(aUnit: StepBasic_NamedUnit, theLocalFactors: StepData_Factors): number;
ComputeFactors(aContext: StepRepr_GlobalUnitAssignedContext, theLocalFactors: StepData_Factors): number;
ComputeFactors(aUnit: StepBasic_NamedUnit, theLocalFactors: StepData_Factors): number;

// Computes the uncertainty value (for length)
ComputeTolerance(aContext: StepRepr_GlobalUncertaintyAssignedContext): number;

// Returns the lengthFactor
LengthFactor(): number;

// Returns the planeAngleFactor
PlaneAngleFactor(): number;

// Returns the solidAngleFactor
SolidAngleFactor(): number;

// Returns the Uncertainty value (for length) It has been converted with LengthFactor
Uncertainty(): number;

// Returns the areaFactor
AreaFactor(): number;

// Returns the volumeFactor
VolumeFactor(): number;

// Tells if a Uncertainty (for length) is recorded
HasUncertainty(): boolean;

// Returns true if ComputeFactors has calculated a LengthFactor
LengthDone(): boolean;

// Returns true if ComputeFactors has calculated a PlaneAngleFactor
PlaneAngleDone(): boolean;

// Returns true if ComputeFactors has calculated a SolidAngleFactor
SolidAngleDone(): boolean;

// Returns true if areaFactor is computed
AreaDone(): boolean;

// Returns true if volumeFactor is computed
VolumeDone(): boolean;

// Returns a message for a given status (0 - empty) This message can then be added as warning for transfer
StatusMessage(status: number): string;

// Convert SI prefix defined by enumeration to corresponding real factor (e.g
static ConvertSiPrefix(aPrefix: StepBasic_SiPrefix): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides tools for access (write and read) the validation properties on shapes in the STEP file
STEPConstruct_ValidationProps: declare class STEPConstruct_ValidationProps extends STEPConstruct_Tool

constructor

// Load worksession
Init(WS: XSControl_WorkSession): boolean;

// General method for adding (writing) a validation property for shape which should be already mapped on writing itself
AddProp(Shape: TopoDS_Shape, Prop: StepRepr_RepresentationItem, Descr: string, instance: boolean): boolean;
AddProp(target: StepRepr_CharacterizedDefinition, Context: StepRepr_RepresentationContext, Prop: StepRepr_RepresentationItem, Descr: string): boolean;
AddProp(Shape: TopoDS_Shape, Prop: StepRepr_RepresentationItem, Descr: string, instance: boolean): boolean;
AddProp(target: StepRepr_CharacterizedDefinition, Context: StepRepr_RepresentationContext, Prop: StepRepr_RepresentationItem, Descr: string): boolean;

// Adds surface area property for given shape (already mapped)
AddArea(Shape: TopoDS_Shape, Area: number): boolean;

// Adds volume property for given shape (already mapped)
AddVolume(Shape: TopoDS_Shape, Vol: number): boolean;

// Adds centroid property for given shape (already mapped)
AddCentroid(Shape: TopoDS_Shape, Pnt: gp_Pnt, instance?: boolean): boolean;

// Finds target STEP entity to which validation props should be assigned, and corresponding context, starting from shape Returns True if success, False in case of fail
FindTarget(S: TopoDS_Shape, target: StepRepr_CharacterizedDefinition, instance: boolean): { returnValue: boolean; Context: StepRepr_RepresentationContext; [Symbol.dispose](): void };
// target: Mutated in place

// Searches for entities of the type PropertyDefinitionRepresentation in the model and fills the sequence by them
LoadProps(seq: NCollection_Sequence_handle_Standard_Transient): boolean;
// seq: Mutated in place

// Returns CDSR associated with given PpD or NULL if not found (when, try GetPropSDR)
GetPropNAUO(PD: StepRepr_PropertyDefinition): StepRepr_NextAssemblyUsageOccurrence;

// Returns SDR associated with given PpD or NULL if not found (when, try GetPropCDSR)
GetPropPD(PD: StepRepr_PropertyDefinition): StepBasic_ProductDefinition;

// Returns Shape associated with given SDR or Null Shape if not found
GetPropShape(ProdDef: StepBasic_ProductDefinition): TopoDS_Shape;
GetPropShape(PD: StepRepr_PropertyDefinition): TopoDS_Shape;
GetPropShape(ProdDef: StepBasic_ProductDefinition): TopoDS_Shape;
GetPropShape(PD: StepRepr_PropertyDefinition): TopoDS_Shape;

// Returns value of Real-Valued property (Area or Volume) If Property is neither Area nor Volume, returns False Else returns True and isArea indicates whether property is area or volume
GetPropReal(item: StepRepr_RepresentationItem, Val: number, isArea: boolean, theLocalFactors: StepData_Factors): { returnValue: boolean; Val: number; isArea: boolean };

// Returns value of Centroid property (or False if it is not)
GetPropPnt(item: StepRepr_RepresentationItem, Context: StepRepr_RepresentationContext, Pnt: gp_Pnt, theLocalFactors: StepData_Factors): boolean;
// Pnt: Mutated in place

// Sets current assembly shape SDR (for FindCDSR calls)
SetAssemblyShape(shape: TopoDS_Shape): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
