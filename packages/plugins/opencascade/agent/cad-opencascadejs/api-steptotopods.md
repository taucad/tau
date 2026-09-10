# libcascade — StepToTopoDS

8 top-level symbols. Signatures are verbatim typescript.

// This package implements the mapping between AP214 Shape representation and CAS.CAD Shape Representation
StepToTopoDS: declare class StepToTopoDS

constructor

static DecodeBuilderError(Error: StepToTopoDS_BuilderError): TCollection_HAsciiString;

static DecodeShellError(Error: StepToTopoDS_TranslateShellError): TCollection_HAsciiString;

static DecodeFaceError(Error: StepToTopoDS_TranslateFaceError): TCollection_HAsciiString;

static DecodeEdgeError(Error: StepToTopoDS_TranslateEdgeError): TCollection_HAsciiString;

static DecodeVertexError(Error: StepToTopoDS_TranslateVertexError): TCollection_HAsciiString;

static DecodeVertexLoopError(Error: StepToTopoDS_TranslateVertexLoopError): TCollection_HAsciiString;

static DecodePolyLoopError(Error: StepToTopoDS_TranslatePolyLoopError): TCollection_HAsciiString;

static DecodeGeometricToolError(Error: StepToTopoDS_GeometricToolError): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_Builder: declare class StepToTopoDS_Builder extends StepToTopoDS_Root

constructor

Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(S: StepShape_EdgeBasedWireframeModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(S: StepShape_FaceBasedSurfaceModel, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors): void;
Init(theManifoldSolid: StepShape_ManifoldSolidBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theBRepWithVoids: StepShape_BrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFB: StepShape_FacetedBrep, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFBABWV: StepShape_FacetedBrepAndBrepWithVoids, theTP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTSS: StepVisual_TessellatedSurfaceSet, theTP: Transfer_TransientProcess, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_ShellBasedSurfaceModel, TP: Transfer_TransientProcess, NMTool: StepToTopoDS_NMTool, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theTF: StepVisual_TessellatedFace, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors): { theHasGeom: boolean };
Init(S: StepShape_GeometricSet, TP: Transfer_TransientProcess, theLocalFactors: StepData_Factors, RA: Transfer_ActorOfTransientProcess, isManifold: boolean, theProgress: Message_ProgressRange): void;
Init(theTSo: StepVisual_TessellatedSolid, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };
Init(theTSh: StepVisual_TessellatedShell, theTP: Transfer_TransientProcess, theReadTessellatedWhenNoBRepOnly: boolean, theHasGeom: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): { theHasGeom: boolean };

Value(): TopoDS_Shape;

Error(): StepToTopoDS_BuilderError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_BuilderError: typeof StepToTopoDS_BuilderError[keyof typeof StepToTopoDS_BuilderError]

// This class contains some algorithmic services specific to the mapping STEP to CAS.CADE
StepToTopoDS_GeometricTool: declare class StepToTopoDS_GeometricTool

constructor

static PCurve(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, last: number): { returnValue: number; PC: StepGeom_Pcurve; [Symbol.dispose](): void };

static IsSeamCurve(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, E: StepShape_Edge, EL: StepShape_EdgeLoop): boolean;

static IsLikeSeam(SC: StepGeom_SurfaceCurve, S: StepGeom_Surface, E: StepShape_Edge, EL: StepShape_EdgeLoop): boolean;

static UpdateParam3d(C: Geom_Curve, w1: number, w2: number, preci: number): { returnValue: boolean; w1: number; w2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepToTopoDS_GeometricToolError: typeof StepToTopoDS_GeometricToolError[keyof typeof StepToTopoDS_GeometricToolError]

// Produces instances by Transformation of a basic item
StepToTopoDS_MakeTransformed: declare class StepToTopoDS_MakeTransformed extends StepToTopoDS_Root

constructor

// Computes a transformation to pass from an Origin placement to a Target placement
Compute(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): boolean;
Compute(Operator: StepGeom_CartesianTransformationOperator3d, theLocalFactors: StepData_Factors): boolean;
Compute(Origin: StepGeom_Axis2Placement3d, Target: StepGeom_Axis2Placement3d, theLocalFactors: StepData_Factors): boolean;
Compute(Operator: StepGeom_CartesianTransformationOperator3d, theLocalFactors: StepData_Factors): boolean;

// Returns the computed transformation (Identity if not yet or if failed)
Transformation(): gp_Trsf;

// Applies the computed transformation to a shape Returns False if the transformation is Identity
Transform(shape: TopoDS_Shape): boolean;
// shape: Mutated in place

// Translates a MappedItem
TranslateMappedItem(mapit: StepRepr_MappedItem, TP: Transfer_TransientProcess, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides data to process non-manifold topology when reading from STEP
StepToTopoDS_NMTool: declare class StepToTopoDS_NMTool

constructor

Init(MapOfRI: NCollection_DataMap_handle_StepRepr_RepresentationItem_TopoDS_Shape, MapOfRINames: NCollection_DataMap_TCollection_AsciiString_TopoDS_Shape): void;

SetActive(isActive: boolean): void;

IsActive(): boolean;

CleanUp(): void;

IsBound(RI: StepRepr_RepresentationItem): boolean;
IsBound(RIName: TCollection_AsciiString): boolean;
IsBound(RI: StepRepr_RepresentationItem): boolean;
IsBound(RIName: TCollection_AsciiString): boolean;

Bind(RI: StepRepr_RepresentationItem, S: TopoDS_Shape): void;
Bind(RIName: TCollection_AsciiString, S: TopoDS_Shape): void;
Bind(RI: StepRepr_RepresentationItem, S: TopoDS_Shape): void;
Bind(RIName: TCollection_AsciiString, S: TopoDS_Shape): void;

Find(RI: StepRepr_RepresentationItem): TopoDS_Shape;
Find(RIName: TCollection_AsciiString): TopoDS_Shape;
Find(RI: StepRepr_RepresentationItem): TopoDS_Shape;
Find(RIName: TCollection_AsciiString): TopoDS_Shape;

RegisterNMEdge(Edge: TopoDS_Shape): void;

IsSuspectedAsClosing(BaseShell: TopoDS_Shape, SuspectedShell: TopoDS_Shape): boolean;

IsPureNMShell(Shell: TopoDS_Shape): boolean;

SetIDEASCase(IDEASCase: boolean): void;

IsIDEASCase(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores a pair of Points from step
StepToTopoDS_PointPair: declare class StepToTopoDS_PointPair

constructor

GetPoint1(): StepGeom_CartesianPoint;

GetPoint2(): StepGeom_CartesianPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
