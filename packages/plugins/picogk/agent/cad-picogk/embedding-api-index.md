# PicoGK authoring API index

PicoGK 2.3.0.0 · 232 symbols · extracted by Roslyn 5.9.0.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Subclass-only — PicoGK.ActiveVoxelCounterScalar — `embedding-api-subclass-only-picogk-activevoxelcounterscalar.md`

ActiveVoxelCounterScalar (constructor) [category: Subclass-only] [id: csharp:PicoGK.ActiveVoxelCounterScalar.ActiveVoxelCounterScalar]
Run (method) [category: Subclass-only] [id: csharp:PicoGK.ActiveVoxelCounterScalar.Run]

## Subclass-only — PicoGK.AddVectorFieldToViewer — `embedding-api-subclass-only-picogk-addvectorfieldtoviewer.md`

AddVectorFieldToViewer (constructor) [category: Subclass-only] [id: csharp:PicoGK.AddVectorFieldToViewer.AddVectorFieldToViewer]
Run (method) [category: Subclass-only] [id: csharp:PicoGK.AddVectorFieldToViewer.Run]

## Advanced embedding/native — PicoGK — `embedding-api-advanced-embedding-native-picogk.md`

Coord (struct) [4 members] [category: Advanced embedding/native] [id: csharp:PicoGK.Coord]
  Coord.X (field) [id: csharp:PicoGK.Coord.X]
  Coord.Y (field) [id: csharp:PicoGK.Coord.Y]
  Coord.Z (field) [id: csharp:PicoGK.Coord.Z]
  Coord.Coord (constructor) [id: csharp:PicoGK.Coord.Coord]
GpuTexHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.GpuTexHandle]
  GpuTexHandle.Value (property) [id: csharp:PicoGK.GpuTexHandle.Value]
  GpuTexHandle.GpuTexHandle (constructor) [id: csharp:PicoGK.GpuTexHandle.GpuTexHandle]
GuiSideBarHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.GuiSideBarHandle]
  GuiSideBarHandle.Value (property) [id: csharp:PicoGK.GuiSideBarHandle.Value]
  GuiSideBarHandle.GuiSideBarHandle (constructor) [id: csharp:PicoGK.GuiSideBarHandle.GuiSideBarHandle]
ILibraryHost (interface) [2 members] [category: Advanced embedding/native] — Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) [id: csharp:PicoGK.ILibraryHost]
  ILibraryHost.DefaultLogFilePath (property) — Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default [id: csharp:PicoGK.ILibraryHost.DefaultLogFilePath]
  ILibraryHost.Run (method) — Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) [id: csharp:PicoGK.ILibraryHost.Run]
IViewerBackend (interface) [21 members] [category: Advanced embedding/native] — Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native… [id: csharp:PicoGK.IViewerBackend]
  IViewerBackend.IsIdle (property) [id: csharp:PicoGK.IViewerBackend.IsIdle]
  IViewerBackend.Orientation (property) [id: csharp:PicoGK.IViewerBackend.Orientation]
  IViewerBackend.Poll (method) [id: csharp:PicoGK.IViewerBackend.Poll]
  IViewerBackend.RequestUpdate (method) [id: csharp:PicoGK.IViewerBackend.RequestUpdate]
  IViewerBackend.LoadLightSetup (method) [id: csharp:PicoGK.IViewerBackend.LoadLightSetup]
  IViewerBackend.SetBackgroundColor (method) [id: csharp:PicoGK.IViewerBackend.SetBackgroundColor]
  IViewerBackend.SetFieldOfView (method) [id: csharp:PicoGK.IViewerBackend.SetFieldOfView]
  IViewerBackend.ZoomToFit (method) [id: csharp:PicoGK.IViewerBackend.ZoomToFit]
  IViewerBackend.Add (method) [id: csharp:PicoGK.IViewerBackend.Add]
  IViewerBackend.Remove (method) [id: csharp:PicoGK.IViewerBackend.Remove]
  IViewerBackend.SetObjectMatrix (method) [id: csharp:PicoGK.IViewerBackend.SetObjectMatrix]
  IViewerBackend.RemoveAllObjects (method) [id: csharp:PicoGK.IViewerBackend.RemoveAllObjects]
  IViewerBackend.SetMechanism (method) [id: csharp:PicoGK.IViewerBackend.SetMechanism]
  IViewerBackend.RequestScreenShot (method) [id: csharp:PicoGK.IViewerBackend.RequestScreenShot]
  IViewerBackend.EnableExperimental (method) [id: csharp:PicoGK.IViewerBackend.EnableExperimental]
  IViewerBackend.SetGroupVisible (method) [id: csharp:PicoGK.IViewerBackend.SetGroupVisible]
  IViewerBackend.SetGroupMaterial (method) [id: csharp:PicoGK.IViewerBackend.SetGroupMaterial]
  IViewerBackend.SetGroupMatrix (method) [id: csharp:PicoGK.IViewerBackend.SetGroupMatrix]
  IViewerBackend.EnableOverhangWarning (method) [id: csharp:PicoGK.IViewerBackend.EnableOverhangWarning]
  IViewerBackend.DisableOverhangWarning (method) [id: csharp:PicoGK.IViewerBackend.DisableOverhangWarning]
  IViewerBackend.GetBoundingBox (method) [id: csharp:PicoGK.IViewerBackend.GetBoundingBox]
LatHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.LatHandle]
  LatHandle.Value (property) [id: csharp:PicoGK.LatHandle.Value]
  LatHandle.LatHandle (constructor) [id: csharp:PicoGK.LatHandle.LatHandle]
LibHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.LibHandle]
  LibHandle.Value (property) [id: csharp:PicoGK.LibHandle.Value]
  LibHandle.LibHandle (constructor) [id: csharp:PicoGK.LibHandle.LibHandle]
MshHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.MshHandle]
  MshHandle.Value (property) [id: csharp:PicoGK.MshHandle.Value]
  MshHandle.MshHandle (constructor) [id: csharp:PicoGK.MshHandle.MshHandle]
PicoGKAllocException (class) [1 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PicoGKAllocException]
  PicoGKAllocException.PicoGKAllocException (constructor) [id: csharp:PicoGK.PicoGKAllocException.PicoGKAllocException]
PicoGKLibraryMismatchException (class) [1 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PicoGKLibraryMismatchException]
  PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor) [id: csharp:PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException]
PolyHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PolyHandle]
  PolyHandle.Value (property) [id: csharp:PicoGK.PolyHandle.Value]
  PolyHandle.PolyHandle (constructor) [id: csharp:PicoGK.PolyHandle.PolyHandle]
QuadHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.QuadHandle]
  QuadHandle.Value (property) [id: csharp:PicoGK.QuadHandle.Value]
  QuadHandle.QuadHandle (constructor) [id: csharp:PicoGK.QuadHandle.QuadHandle]
ScalarFieldHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarFieldHandle]
  ScalarFieldHandle.Value (property) [id: csharp:PicoGK.ScalarFieldHandle.Value]
  ScalarFieldHandle.ScalarFieldHandle (constructor) [id: csharp:PicoGK.ScalarFieldHandle.ScalarFieldHandle]
Triangle (struct) [4 members] [category: Advanced embedding/native] [id: csharp:PicoGK.Triangle]
  Triangle.A (field) [id: csharp:PicoGK.Triangle.A]
  Triangle.B (field) [id: csharp:PicoGK.Triangle.B]
  Triangle.C (field) [id: csharp:PicoGK.Triangle.C]
  Triangle.Triangle (constructor) [id: csharp:PicoGK.Triangle.Triangle]
VdbHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VdbHandle]
  VdbHandle.Value (property) [id: csharp:PicoGK.VdbHandle.Value]
  VdbHandle.VdbHandle (constructor) [id: csharp:PicoGK.VdbHandle.VdbHandle]
VdbMetaHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VdbMetaHandle]
  VdbMetaHandle.Value (property) [id: csharp:PicoGK.VdbMetaHandle.Value]
  VdbMetaHandle.VdbMetaHandle (constructor) [id: csharp:PicoGK.VdbMetaHandle.VdbMetaHandle]
VectorFieldHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VectorFieldHandle]
  VectorFieldHandle.Value (property) [id: csharp:PicoGK.VectorFieldHandle.Value]
  VectorFieldHandle.VectorFieldHandle (constructor) [id: csharp:PicoGK.VectorFieldHandle.VectorFieldHandle]
VoxHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VoxHandle]
  VoxHandle.Value (property) [id: csharp:PicoGK.VoxHandle.Value]
  VoxHandle.VoxHandle (constructor) [id: csharp:PicoGK.VoxHandle.VoxHandle]

## Diagnostics — PicoGK.Diagnostics — `embedding-api-diagnostics-picogk-diagnostics.md`

TestCliOutput (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestCliOutput]
  TestCliOutput.Run (method) — Test function, generates a unique voxel object and tests vectorization… [id: csharp:PicoGK.Diagnostics.TestCliOutput.Run]
TestProgress (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestProgress]
  TestProgress.Test (method) [id: csharp:PicoGK.Diagnostics.TestProgress.Test]
TestVectorAndComparison (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestVectorAndComparison]
  TestVectorAndComparison.Test (method) [id: csharp:PicoGK.Diagnostics.TestVectorAndComparison.Test]

## Advanced embedding/native — PicoGK.FieldMetadata — `embedding-api-advanced-embedding-native-picogk-fieldmetadata.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.FieldMetadata.lib]
FieldMetadata (constructor) [category: Advanced embedding/native] — Internal constructor used by the Voxels, ScalarField and VectorField accessor… [id: csharp:PicoGK.FieldMetadata.FieldMetadata]

## Subclass-only — PicoGK.FieldMetadata — `embedding-api-subclass-only-picogk-fieldmetadata.md`

GuardInternalFields (method) [category: Subclass-only] — This function tests whether you are attempting to set internal… [id: csharp:PicoGK.FieldMetadata.GuardInternalFields]

## Subclass-only — PicoGK.Image — `embedding-api-subclass-only-picogk-image.md`

Image (constructor) [category: Subclass-only] [id: csharp:PicoGK.Image.Image]

## Advanced embedding/native — PicoGK.Lattice — `embedding-api-advanced-embedding-native-picogk-lattice.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Lattice.lib]

## Advanced embedding/native — PicoGK.Library — `embedding-api-advanced-embedding-native-picogk-library.md`

Library (constructor) [category: Advanced embedding/native] — Create a new Library instance, using the specified voxel size… [id: csharp:PicoGK.Library.Library]
RegisterGlobalLibrary (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.RegisterGlobalLibrary]
UnregisterGlobalLibrary (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.UnregisterGlobalLibrary]
RegisterGlobalViewer (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.RegisterGlobalViewer]
UnregisterGlobalViewer (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.UnregisterGlobalViewer]
UseHost (method) [category: Advanced embedding/native] — Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding… [id: csharp:PicoGK.Library.UseHost]

## Advanced embedding/native — PicoGK.Mesh — `embedding-api-advanced-embedding-native-picogk-mesh.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Mesh.lib]

## Advanced embedding/native — PicoGK.OpenVdbFile — `embedding-api-advanced-embedding-native-picogk-openvdbfile.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.OpenVdbFile.lib]
_hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.OpenVdbFile._hCreate]

## Advanced embedding/native — PicoGK.PolyLine — `embedding-api-advanced-embedding-native-picogk-polyline.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.PolyLine.lib]
_hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.PolyLine._hCreate]

## Advanced embedding/native — PicoGK.ScalarField — `embedding-api-advanced-embedding-native-picogk-scalarfield.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.ScalarField.lib]
_hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreate]
_hCreateCopy (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreateCopy]
_hCreateFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreateFromVoxels]
_hBuildFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hBuildFromVoxels]

## Subclass-only — PicoGK.SurfaceNormalFieldExtractor — `embedding-api-subclass-only-picogk-surfacenormalfieldextractor.md`

SurfaceNormalFieldExtractor (constructor) [category: Subclass-only] [id: csharp:PicoGK.SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor]
Run (method) [category: Subclass-only] [id: csharp:PicoGK.SurfaceNormalFieldExtractor.Run]

## Advanced embedding/native — PicoGK.VectorField — `embedding-api-advanced-embedding-native-picogk-vectorfield.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.VectorField.lib]
_hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreate]
_hCreateCopy (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreateCopy]
_hCreateFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreateFromVoxels]
_hBuildFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hBuildFromVoxels]

## Subclass-only — PicoGK.VectorFieldMerge — `embedding-api-subclass-only-picogk-vectorfieldmerge.md`

VectorFieldMerge (constructor) [category: Subclass-only] [id: csharp:PicoGK.VectorFieldMerge.VectorFieldMerge]
Run (method) [category: Subclass-only] [id: csharp:PicoGK.VectorFieldMerge.Run]

## Native viewer — PicoGK.Viewer.GpuTex — `embedding-api-native-viewer-picogk-viewer-gputex.md`

GpuTex (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.GpuTex.GpuTex]
ReplaceWith (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.GpuTex.ReplaceWith]

## Native viewer — PicoGK.Viewer.ImageQuad — `embedding-api-native-viewer-picogk-viewer-imagequad.md`

ImageQuad (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.ImageQuad]
UpdateImage (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.UpdateImage]
UpdateMatrix (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.UpdateMatrix]

## Native viewer — PicoGK.Viewer.SideBar — `embedding-api-native-viewer-picogk-viewer-sidebar.md`

SideBar (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.SideBar.SideBar]

## Native viewer — PicoGK.Viewer — `embedding-api-native-viewer-picogk-viewer.md`

Camera (class) [10 members] [category: Native viewer] — Abstract camera class to interact with the view [id: csharp:PicoGK.Viewer.Camera]
  Camera.EDragType (enum) [3 members] — Drag, Spin, Pan the camera [id: csharp:PicoGK.Viewer.Camera.EDragType]
    Camera.EDragType.Rotate (enumMember) — Rotate the camera (up/down) [id: csharp:PicoGK.Viewer.Camera.EDragType.Rotate]
    Camera.EDragType.Spin (enumMember) — Spin the camera around the view vector [id: csharp:PicoGK.Viewer.Camera.EDragType.Spin]
    Camera.EDragType.Pan (enumMember) — Move the camera up/down [id: csharp:PicoGK.Viewer.Camera.EDragType.Pan]
  Camera.qOrientation (property) [id: csharp:PicoGK.Viewer.Camera.qOrientation]
  Camera.matVP (property) [id: csharp:PicoGK.Viewer.Camera.matVP]
  Camera.vecEye (property) [id: csharp:PicoGK.Viewer.Camera.vecEye]
  Camera.SetViewPort (method) [id: csharp:PicoGK.Viewer.Camera.SetViewPort]
  Camera.LookAt (method) [id: csharp:PicoGK.Viewer.Camera.LookAt]
  Camera.ZoomToFit (method) [id: csharp:PicoGK.Viewer.Camera.ZoomToFit]
  Camera.Scroll (method) [id: csharp:PicoGK.Viewer.Camera.Scroll]
  Camera.MouseDrag (method) [id: csharp:PicoGK.Viewer.Camera.MouseDrag]
  Camera.Camera (constructor) [category: Subclass-only] [id: csharp:PicoGK.Viewer.Camera.Camera]
CamPerspectiveArcball (class) [10 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.CamPerspectiveArcball]
  CamPerspectiveArcball.matVP (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.matVP]
  CamPerspectiveArcball.vecEye (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.vecEye]
  CamPerspectiveArcball.qOrientation (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.qOrientation]
  CamPerspectiveArcball.CamPerspectiveArcball (constructor) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball]
  CamPerspectiveArcball.SetVerticalFov (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov]
  CamPerspectiveArcball.SetViewPort (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.SetViewPort]
  CamPerspectiveArcball.LookAt (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.LookAt]
  CamPerspectiveArcball.ZoomToFit (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit]
  CamPerspectiveArcball.MouseDrag (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.MouseDrag]
  CamPerspectiveArcball.Scroll (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.Scroll]
IKeyHandler (interface) [1 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.IKeyHandler]
  IKeyHandler.bHandleEvent (method) [id: csharp:PicoGK.Viewer.IKeyHandler.bHandleEvent]
EKeys (enum) [63 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.EKeys]
  EKeys.Key_Space (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Space]
  EKeys.Key_0 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_0]
  EKeys.Key_1 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_1]
  EKeys.Key_2 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_2]
  EKeys.Key_3 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_3]
  EKeys.Key_4 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_4]
  EKeys.Key_5 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_5]
  EKeys.Key_6 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_6]
  EKeys.Key_7 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_7]
  EKeys.Key_8 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_8]
  EKeys.Key_9 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_9]
  EKeys.Key_A (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_A]
  EKeys.Key_B (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_B]
  EKeys.Key_C (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_C]
  EKeys.Key_D (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_D]
  EKeys.Key_E (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_E]
  EKeys.Key_F (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F]
  EKeys.Key_G (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_G]
  EKeys.Key_H (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_H]
  EKeys.Key_I (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_I]
  EKeys.Key_J (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_J]
  EKeys.Key_K (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_K]
  EKeys.Key_L (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_L]
  EKeys.Key_M (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_M]
  EKeys.Key_N (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_N]
  EKeys.Key_O (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_O]
  EKeys.Key_P (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_P]
  EKeys.Key_Q (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Q]
  EKeys.Key_R (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_R]
  EKeys.Key_S (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_S]
  EKeys.Key_T (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_T]
  EKeys.Key_U (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_U]
  EKeys.Key_V (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_V]
  EKeys.Key_W (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_W]
  EKeys.Key_X (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_X]
  EKeys.Key_Y (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Y]
  EKeys.Key_Z (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Z]
  EKeys.Key_ESC (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_ESC]
  EKeys.Key_Enter (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Enter]
  EKeys.Key_Tab (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Tab]
  EKeys.Key_Backspace (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Backspace]
  EKeys.Key_Insert (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Insert]
  EKeys.Key_Delete (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Delete]
  EKeys.Key_Right (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Right]
  EKeys.Key_Left (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Left]
  EKeys.Key_Down (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Down]
  EKeys.Key_Up (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Up]
  EKeys.Key_PgUp (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_PgUp]
  EKeys.Key_PgDn (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_PgDn]
  EKeys.Key_Home (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Home]
  EKeys.Key_End (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_End]
  EKeys.Key_F1 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F1]
  EKeys.Key_F2 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F2]
  EKeys.Key_F3 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F3]
  EKeys.Key_F4 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F4]
  EKeys.Key_F5 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F5]
  EKeys.Key_F6 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F6]
  EKeys.Key_F7 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F7]
  EKeys.Key_F8 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F8]
  EKeys.Key_F9 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F9]
  EKeys.Key_F10 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F10]
  EKeys.Key_F11 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F11]
  EKeys.Key_F12 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F12]
KeyAction (class) [3 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.KeyAction]
  KeyAction.KeyAction (constructor) [id: csharp:PicoGK.Viewer.KeyAction.KeyAction]
  KeyAction.bKeyEquals (method) [id: csharp:PicoGK.Viewer.KeyAction.bKeyEquals]
  KeyAction.Do (method) [id: csharp:PicoGK.Viewer.KeyAction.Do]
KeyHandler (class) [3 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.KeyHandler]
  KeyHandler.AddAction (method) [id: csharp:PicoGK.Viewer.KeyHandler.AddAction]
  KeyHandler.bHandleEvent (method) [id: csharp:PicoGK.Viewer.KeyHandler.bHandleEvent]
  KeyHandler.KeyHandler (constructor) [id: csharp:PicoGK.Viewer.KeyHandler.KeyHandler]
AddKeyHandler (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.AddKeyHandler]
StartTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.StartTimeLapse]
PauseTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.PauseTimeLapse]
ResumeTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ResumeTimeLapse]
StopTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.StopTimeLapse]
oCreateSideBarLeft (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.oCreateSideBarLeft]
oCreateSideBarRight (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.oCreateSideBarRight]

## Advanced embedding/native — PicoGK.Viewer — `embedding-api-advanced-embedding-native-picogk-viewer.md`

_hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Viewer._hCreate]
Viewer (constructor) [category: Advanced embedding/native] — Initialize a hosted Viewer that delegates display operations without creating… [id: csharp:PicoGK.Viewer.Viewer]
bPoll (method) [category: Advanced embedding/native] — Run this function in your main thread while it returns… [id: csharp:PicoGK.Viewer.bPoll]

## Advanced embedding/native — PicoGK.Voxels — `embedding-api-advanced-embedding-native-picogk-voxels.md`

lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Voxels.lib]

## Subclass-only — System.Random — `embedding-api-subclass-only-system-random.md`

Sample (method) [category: Subclass-only] [id: csharp:System.Random.Sample]
