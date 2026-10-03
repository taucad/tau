# PicoGK authoring API index

PicoGK 2.3.0.0 · 232 symbols · extracted by Roslyn 5.9.0.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## Subclass-only — PicoGK.ActiveVoxelCounterScalar — `embedding-api-subclass-only-picogk-activevoxelcounterscalar.md`

PicoGK.ActiveVoxelCounterScalar.ActiveVoxelCounterScalar (constructor) [category: Subclass-only] [id: csharp:PicoGK.ActiveVoxelCounterScalar.ActiveVoxelCounterScalar]
PicoGK.ActiveVoxelCounterScalar.Run (method) [category: Subclass-only] [id: csharp:PicoGK.ActiveVoxelCounterScalar.Run]

## Subclass-only — PicoGK.AddVectorFieldToViewer — `embedding-api-subclass-only-picogk-addvectorfieldtoviewer.md`

PicoGK.AddVectorFieldToViewer.AddVectorFieldToViewer (constructor) [category: Subclass-only] [id: csharp:PicoGK.AddVectorFieldToViewer.AddVectorFieldToViewer]
PicoGK.AddVectorFieldToViewer.Run (method) [category: Subclass-only] [id: csharp:PicoGK.AddVectorFieldToViewer.Run]

## Advanced embedding/native — PicoGK — `embedding-api-advanced-embedding-native-picogk.md`

PicoGK.Coord (struct) [4 members] [category: Advanced embedding/native] [id: csharp:PicoGK.Coord]
  PicoGK.Coord.X (field) [id: csharp:PicoGK.Coord.X]
  PicoGK.Coord.Y (field) [id: csharp:PicoGK.Coord.Y]
  PicoGK.Coord.Z (field) [id: csharp:PicoGK.Coord.Z]
  PicoGK.Coord.Coord (constructor) [id: csharp:PicoGK.Coord.Coord]
PicoGK.GpuTexHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.GpuTexHandle]
  PicoGK.GpuTexHandle.Value (property) [id: csharp:PicoGK.GpuTexHandle.Value]
  PicoGK.GpuTexHandle.GpuTexHandle (constructor) [id: csharp:PicoGK.GpuTexHandle.GpuTexHandle]
PicoGK.GuiSideBarHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.GuiSideBarHandle]
  PicoGK.GuiSideBarHandle.Value (property) [id: csharp:PicoGK.GuiSideBarHandle.Value]
  PicoGK.GuiSideBarHandle.GuiSideBarHandle (constructor) [id: csharp:PicoGK.GuiSideBarHandle.GuiSideBarHandle]
PicoGK.ILibraryHost (interface) [2 members] [category: Advanced embedding/native] — Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) [id: csharp:PicoGK.ILibraryHost]
  PicoGK.ILibraryHost.DefaultLogFilePath (property) — Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default [id: csharp:PicoGK.ILibraryHost.DefaultLogFilePath]
  PicoGK.ILibraryHost.Run (method) — Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) [id: csharp:PicoGK.ILibraryHost.Run]
PicoGK.IViewerBackend (interface) [21 members] [category: Advanced embedding/native] — Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native… [id: csharp:PicoGK.IViewerBackend]
  PicoGK.IViewerBackend.IsIdle (property) [id: csharp:PicoGK.IViewerBackend.IsIdle]
  PicoGK.IViewerBackend.Orientation (property) [id: csharp:PicoGK.IViewerBackend.Orientation]
  PicoGK.IViewerBackend.Poll (method) [id: csharp:PicoGK.IViewerBackend.Poll]
  PicoGK.IViewerBackend.RequestUpdate (method) [id: csharp:PicoGK.IViewerBackend.RequestUpdate]
  PicoGK.IViewerBackend.LoadLightSetup (method) [id: csharp:PicoGK.IViewerBackend.LoadLightSetup]
  PicoGK.IViewerBackend.SetBackgroundColor (method) [id: csharp:PicoGK.IViewerBackend.SetBackgroundColor]
  PicoGK.IViewerBackend.SetFieldOfView (method) [id: csharp:PicoGK.IViewerBackend.SetFieldOfView]
  PicoGK.IViewerBackend.ZoomToFit (method) [id: csharp:PicoGK.IViewerBackend.ZoomToFit]
  PicoGK.IViewerBackend.Add (method) [id: csharp:PicoGK.IViewerBackend.Add]
  PicoGK.IViewerBackend.Remove (method) [id: csharp:PicoGK.IViewerBackend.Remove]
  PicoGK.IViewerBackend.SetObjectMatrix (method) [id: csharp:PicoGK.IViewerBackend.SetObjectMatrix]
  PicoGK.IViewerBackend.RemoveAllObjects (method) [id: csharp:PicoGK.IViewerBackend.RemoveAllObjects]
  PicoGK.IViewerBackend.SetMechanism (method) [id: csharp:PicoGK.IViewerBackend.SetMechanism]
  PicoGK.IViewerBackend.RequestScreenShot (method) [id: csharp:PicoGK.IViewerBackend.RequestScreenShot]
  PicoGK.IViewerBackend.EnableExperimental (method) [id: csharp:PicoGK.IViewerBackend.EnableExperimental]
  PicoGK.IViewerBackend.SetGroupVisible (method) [id: csharp:PicoGK.IViewerBackend.SetGroupVisible]
  PicoGK.IViewerBackend.SetGroupMaterial (method) [id: csharp:PicoGK.IViewerBackend.SetGroupMaterial]
  PicoGK.IViewerBackend.SetGroupMatrix (method) [id: csharp:PicoGK.IViewerBackend.SetGroupMatrix]
  PicoGK.IViewerBackend.EnableOverhangWarning (method) [id: csharp:PicoGK.IViewerBackend.EnableOverhangWarning]
  PicoGK.IViewerBackend.DisableOverhangWarning (method) [id: csharp:PicoGK.IViewerBackend.DisableOverhangWarning]
  PicoGK.IViewerBackend.GetBoundingBox (method) [id: csharp:PicoGK.IViewerBackend.GetBoundingBox]
PicoGK.LatHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.LatHandle]
  PicoGK.LatHandle.Value (property) [id: csharp:PicoGK.LatHandle.Value]
  PicoGK.LatHandle.LatHandle (constructor) [id: csharp:PicoGK.LatHandle.LatHandle]
PicoGK.LibHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.LibHandle]
  PicoGK.LibHandle.Value (property) [id: csharp:PicoGK.LibHandle.Value]
  PicoGK.LibHandle.LibHandle (constructor) [id: csharp:PicoGK.LibHandle.LibHandle]
PicoGK.MshHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.MshHandle]
  PicoGK.MshHandle.Value (property) [id: csharp:PicoGK.MshHandle.Value]
  PicoGK.MshHandle.MshHandle (constructor) [id: csharp:PicoGK.MshHandle.MshHandle]
PicoGK.PicoGKAllocException (class) [1 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PicoGKAllocException]
  PicoGK.PicoGKAllocException.PicoGKAllocException (constructor) [id: csharp:PicoGK.PicoGKAllocException.PicoGKAllocException]
PicoGK.PicoGKLibraryMismatchException (class) [1 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PicoGKLibraryMismatchException]
  PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor) [id: csharp:PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException]
PicoGK.PolyHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.PolyHandle]
  PicoGK.PolyHandle.Value (property) [id: csharp:PicoGK.PolyHandle.Value]
  PicoGK.PolyHandle.PolyHandle (constructor) [id: csharp:PicoGK.PolyHandle.PolyHandle]
PicoGK.QuadHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.QuadHandle]
  PicoGK.QuadHandle.Value (property) [id: csharp:PicoGK.QuadHandle.Value]
  PicoGK.QuadHandle.QuadHandle (constructor) [id: csharp:PicoGK.QuadHandle.QuadHandle]
PicoGK.ScalarFieldHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarFieldHandle]
  PicoGK.ScalarFieldHandle.Value (property) [id: csharp:PicoGK.ScalarFieldHandle.Value]
  PicoGK.ScalarFieldHandle.ScalarFieldHandle (constructor) [id: csharp:PicoGK.ScalarFieldHandle.ScalarFieldHandle]
PicoGK.Triangle (struct) [4 members] [category: Advanced embedding/native] [id: csharp:PicoGK.Triangle]
  PicoGK.Triangle.A (field) [id: csharp:PicoGK.Triangle.A]
  PicoGK.Triangle.B (field) [id: csharp:PicoGK.Triangle.B]
  PicoGK.Triangle.C (field) [id: csharp:PicoGK.Triangle.C]
  PicoGK.Triangle.Triangle (constructor) [id: csharp:PicoGK.Triangle.Triangle]
PicoGK.VdbHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VdbHandle]
  PicoGK.VdbHandle.Value (property) [id: csharp:PicoGK.VdbHandle.Value]
  PicoGK.VdbHandle.VdbHandle (constructor) [id: csharp:PicoGK.VdbHandle.VdbHandle]
PicoGK.VdbMetaHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VdbMetaHandle]
  PicoGK.VdbMetaHandle.Value (property) [id: csharp:PicoGK.VdbMetaHandle.Value]
  PicoGK.VdbMetaHandle.VdbMetaHandle (constructor) [id: csharp:PicoGK.VdbMetaHandle.VdbMetaHandle]
PicoGK.VectorFieldHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VectorFieldHandle]
  PicoGK.VectorFieldHandle.Value (property) [id: csharp:PicoGK.VectorFieldHandle.Value]
  PicoGK.VectorFieldHandle.VectorFieldHandle (constructor) [id: csharp:PicoGK.VectorFieldHandle.VectorFieldHandle]
PicoGK.VoxHandle (struct) [2 members] [category: Advanced embedding/native] [id: csharp:PicoGK.VoxHandle]
  PicoGK.VoxHandle.Value (property) [id: csharp:PicoGK.VoxHandle.Value]
  PicoGK.VoxHandle.VoxHandle (constructor) [id: csharp:PicoGK.VoxHandle.VoxHandle]

## Diagnostics — PicoGK.Diagnostics — `embedding-api-diagnostics-picogk-diagnostics.md`

PicoGK.Diagnostics.TestCliOutput (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestCliOutput]
  PicoGK.Diagnostics.TestCliOutput.Run (method) — Test function, generates a unique voxel object and tests vectorization… [id: csharp:PicoGK.Diagnostics.TestCliOutput.Run]
PicoGK.Diagnostics.TestProgress (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestProgress]
  PicoGK.Diagnostics.TestProgress.Test (method) [id: csharp:PicoGK.Diagnostics.TestProgress.Test]
PicoGK.Diagnostics.TestVectorAndComparison (class) [1 members] [category: Diagnostics] [id: csharp:PicoGK.Diagnostics.TestVectorAndComparison]
  PicoGK.Diagnostics.TestVectorAndComparison.Test (method) [id: csharp:PicoGK.Diagnostics.TestVectorAndComparison.Test]

## Advanced embedding/native — PicoGK.FieldMetadata — `embedding-api-advanced-embedding-native-picogk-fieldmetadata.md`

PicoGK.FieldMetadata.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.FieldMetadata.lib]
PicoGK.FieldMetadata.FieldMetadata (constructor) [category: Advanced embedding/native] — Internal constructor used by the Voxels, ScalarField and VectorField accessor… [id: csharp:PicoGK.FieldMetadata.FieldMetadata]

## Subclass-only — PicoGK.FieldMetadata — `embedding-api-subclass-only-picogk-fieldmetadata.md`

PicoGK.FieldMetadata.GuardInternalFields (method) [category: Subclass-only] — This function tests whether you are attempting to set internal… [id: csharp:PicoGK.FieldMetadata.GuardInternalFields]

## Subclass-only — PicoGK.Image — `embedding-api-subclass-only-picogk-image.md`

PicoGK.Image.Image (constructor) [category: Subclass-only] [id: csharp:PicoGK.Image.Image]

## Advanced embedding/native — PicoGK.Lattice — `embedding-api-advanced-embedding-native-picogk-lattice.md`

PicoGK.Lattice.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Lattice.lib]

## Advanced embedding/native — PicoGK.Library — `embedding-api-advanced-embedding-native-picogk-library.md`

PicoGK.Library.Library (constructor) [category: Advanced embedding/native] — Create a new Library instance, using the specified voxel size… [id: csharp:PicoGK.Library.Library]
PicoGK.Library.RegisterGlobalLibrary (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.RegisterGlobalLibrary]
PicoGK.Library.UnregisterGlobalLibrary (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.UnregisterGlobalLibrary]
PicoGK.Library.RegisterGlobalViewer (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.RegisterGlobalViewer]
PicoGK.Library.UnregisterGlobalViewer (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Library.UnregisterGlobalViewer]
PicoGK.Library.UseHost (method) [category: Advanced embedding/native] — Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding… [id: csharp:PicoGK.Library.UseHost]

## Advanced embedding/native — PicoGK.Mesh — `embedding-api-advanced-embedding-native-picogk-mesh.md`

PicoGK.Mesh.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Mesh.lib]

## Advanced embedding/native — PicoGK.OpenVdbFile — `embedding-api-advanced-embedding-native-picogk-openvdbfile.md`

PicoGK.OpenVdbFile.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.OpenVdbFile.lib]
PicoGK.OpenVdbFile._hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.OpenVdbFile._hCreate]

## Advanced embedding/native — PicoGK.PolyLine — `embedding-api-advanced-embedding-native-picogk-polyline.md`

PicoGK.PolyLine.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.PolyLine.lib]
PicoGK.PolyLine._hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.PolyLine._hCreate]

## Advanced embedding/native — PicoGK.ScalarField — `embedding-api-advanced-embedding-native-picogk-scalarfield.md`

PicoGK.ScalarField.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.ScalarField.lib]
PicoGK.ScalarField._hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreate]
PicoGK.ScalarField._hCreateCopy (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreateCopy]
PicoGK.ScalarField._hCreateFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hCreateFromVoxels]
PicoGK.ScalarField._hBuildFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.ScalarField._hBuildFromVoxels]

## Subclass-only — PicoGK.SurfaceNormalFieldExtractor — `embedding-api-subclass-only-picogk-surfacenormalfieldextractor.md`

PicoGK.SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor (constructor) [category: Subclass-only] [id: csharp:PicoGK.SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor]
PicoGK.SurfaceNormalFieldExtractor.Run (method) [category: Subclass-only] [id: csharp:PicoGK.SurfaceNormalFieldExtractor.Run]

## Advanced embedding/native — PicoGK.VectorField — `embedding-api-advanced-embedding-native-picogk-vectorfield.md`

PicoGK.VectorField.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.VectorField.lib]
PicoGK.VectorField._hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreate]
PicoGK.VectorField._hCreateCopy (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreateCopy]
PicoGK.VectorField._hCreateFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hCreateFromVoxels]
PicoGK.VectorField._hBuildFromVoxels (method) [category: Advanced embedding/native] [id: csharp:PicoGK.VectorField._hBuildFromVoxels]

## Subclass-only — PicoGK.VectorFieldMerge — `embedding-api-subclass-only-picogk-vectorfieldmerge.md`

PicoGK.VectorFieldMerge.VectorFieldMerge (constructor) [category: Subclass-only] [id: csharp:PicoGK.VectorFieldMerge.VectorFieldMerge]
PicoGK.VectorFieldMerge.Run (method) [category: Subclass-only] [id: csharp:PicoGK.VectorFieldMerge.Run]

## Native viewer — PicoGK.Viewer.GpuTex — `embedding-api-native-viewer-picogk-viewer-gputex.md`

PicoGK.Viewer.GpuTex.GpuTex (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.GpuTex.GpuTex]
PicoGK.Viewer.GpuTex.ReplaceWith (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.GpuTex.ReplaceWith]

## Native viewer — PicoGK.Viewer.ImageQuad — `embedding-api-native-viewer-picogk-viewer-imagequad.md`

PicoGK.Viewer.ImageQuad.ImageQuad (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.ImageQuad]
PicoGK.Viewer.ImageQuad.UpdateImage (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.UpdateImage]
PicoGK.Viewer.ImageQuad.UpdateMatrix (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ImageQuad.UpdateMatrix]

## Native viewer — PicoGK.Viewer.SideBar — `embedding-api-native-viewer-picogk-viewer-sidebar.md`

PicoGK.Viewer.SideBar.SideBar (constructor) [category: Native viewer] [id: csharp:PicoGK.Viewer.SideBar.SideBar]

## Native viewer — PicoGK.Viewer — `embedding-api-native-viewer-picogk-viewer.md`

PicoGK.Viewer.Camera (class) [10 members] [category: Native viewer] — Abstract camera class to interact with the view [id: csharp:PicoGK.Viewer.Camera]
  PicoGK.Viewer.Camera.EDragType (enum) [3 members] — Drag, Spin, Pan the camera [id: csharp:PicoGK.Viewer.Camera.EDragType]
    PicoGK.Viewer.Camera.EDragType.Rotate (enumMember) — Rotate the camera (up/down) [id: csharp:PicoGK.Viewer.Camera.EDragType.Rotate]
    PicoGK.Viewer.Camera.EDragType.Spin (enumMember) — Spin the camera around the view vector [id: csharp:PicoGK.Viewer.Camera.EDragType.Spin]
    PicoGK.Viewer.Camera.EDragType.Pan (enumMember) — Move the camera up/down [id: csharp:PicoGK.Viewer.Camera.EDragType.Pan]
  PicoGK.Viewer.Camera.qOrientation (property) [id: csharp:PicoGK.Viewer.Camera.qOrientation]
  PicoGK.Viewer.Camera.matVP (property) [id: csharp:PicoGK.Viewer.Camera.matVP]
  PicoGK.Viewer.Camera.vecEye (property) [id: csharp:PicoGK.Viewer.Camera.vecEye]
  PicoGK.Viewer.Camera.SetViewPort (method) [id: csharp:PicoGK.Viewer.Camera.SetViewPort]
  PicoGK.Viewer.Camera.LookAt (method) [id: csharp:PicoGK.Viewer.Camera.LookAt]
  PicoGK.Viewer.Camera.ZoomToFit (method) [id: csharp:PicoGK.Viewer.Camera.ZoomToFit]
  PicoGK.Viewer.Camera.Scroll (method) [id: csharp:PicoGK.Viewer.Camera.Scroll]
  PicoGK.Viewer.Camera.MouseDrag (method) [id: csharp:PicoGK.Viewer.Camera.MouseDrag]
  PicoGK.Viewer.Camera.Camera (constructor) [category: Subclass-only] [id: csharp:PicoGK.Viewer.Camera.Camera]
PicoGK.Viewer.CamPerspectiveArcball (class) [10 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.CamPerspectiveArcball]
  PicoGK.Viewer.CamPerspectiveArcball.matVP (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.matVP]
  PicoGK.Viewer.CamPerspectiveArcball.vecEye (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.vecEye]
  PicoGK.Viewer.CamPerspectiveArcball.qOrientation (property) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.qOrientation]
  PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball (constructor) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball]
  PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov]
  PicoGK.Viewer.CamPerspectiveArcball.SetViewPort (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.SetViewPort]
  PicoGK.Viewer.CamPerspectiveArcball.LookAt (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.LookAt]
  PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit]
  PicoGK.Viewer.CamPerspectiveArcball.MouseDrag (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.MouseDrag]
  PicoGK.Viewer.CamPerspectiveArcball.Scroll (method) [id: csharp:PicoGK.Viewer.CamPerspectiveArcball.Scroll]
PicoGK.Viewer.IKeyHandler (interface) [1 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.IKeyHandler]
  PicoGK.Viewer.IKeyHandler.bHandleEvent (method) [id: csharp:PicoGK.Viewer.IKeyHandler.bHandleEvent]
PicoGK.Viewer.EKeys (enum) [63 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.EKeys]
  PicoGK.Viewer.EKeys.Key_Space (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Space]
  PicoGK.Viewer.EKeys.Key_0 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_0]
  PicoGK.Viewer.EKeys.Key_1 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_1]
  PicoGK.Viewer.EKeys.Key_2 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_2]
  PicoGK.Viewer.EKeys.Key_3 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_3]
  PicoGK.Viewer.EKeys.Key_4 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_4]
  PicoGK.Viewer.EKeys.Key_5 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_5]
  PicoGK.Viewer.EKeys.Key_6 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_6]
  PicoGK.Viewer.EKeys.Key_7 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_7]
  PicoGK.Viewer.EKeys.Key_8 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_8]
  PicoGK.Viewer.EKeys.Key_9 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_9]
  PicoGK.Viewer.EKeys.Key_A (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_A]
  PicoGK.Viewer.EKeys.Key_B (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_B]
  PicoGK.Viewer.EKeys.Key_C (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_C]
  PicoGK.Viewer.EKeys.Key_D (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_D]
  PicoGK.Viewer.EKeys.Key_E (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_E]
  PicoGK.Viewer.EKeys.Key_F (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F]
  PicoGK.Viewer.EKeys.Key_G (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_G]
  PicoGK.Viewer.EKeys.Key_H (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_H]
  PicoGK.Viewer.EKeys.Key_I (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_I]
  PicoGK.Viewer.EKeys.Key_J (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_J]
  PicoGK.Viewer.EKeys.Key_K (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_K]
  PicoGK.Viewer.EKeys.Key_L (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_L]
  PicoGK.Viewer.EKeys.Key_M (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_M]
  PicoGK.Viewer.EKeys.Key_N (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_N]
  PicoGK.Viewer.EKeys.Key_O (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_O]
  PicoGK.Viewer.EKeys.Key_P (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_P]
  PicoGK.Viewer.EKeys.Key_Q (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Q]
  PicoGK.Viewer.EKeys.Key_R (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_R]
  PicoGK.Viewer.EKeys.Key_S (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_S]
  PicoGK.Viewer.EKeys.Key_T (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_T]
  PicoGK.Viewer.EKeys.Key_U (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_U]
  PicoGK.Viewer.EKeys.Key_V (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_V]
  PicoGK.Viewer.EKeys.Key_W (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_W]
  PicoGK.Viewer.EKeys.Key_X (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_X]
  PicoGK.Viewer.EKeys.Key_Y (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Y]
  PicoGK.Viewer.EKeys.Key_Z (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Z]
  PicoGK.Viewer.EKeys.Key_ESC (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_ESC]
  PicoGK.Viewer.EKeys.Key_Enter (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Enter]
  PicoGK.Viewer.EKeys.Key_Tab (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Tab]
  PicoGK.Viewer.EKeys.Key_Backspace (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Backspace]
  PicoGK.Viewer.EKeys.Key_Insert (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Insert]
  PicoGK.Viewer.EKeys.Key_Delete (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Delete]
  PicoGK.Viewer.EKeys.Key_Right (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Right]
  PicoGK.Viewer.EKeys.Key_Left (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Left]
  PicoGK.Viewer.EKeys.Key_Down (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Down]
  PicoGK.Viewer.EKeys.Key_Up (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Up]
  PicoGK.Viewer.EKeys.Key_PgUp (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_PgUp]
  PicoGK.Viewer.EKeys.Key_PgDn (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_PgDn]
  PicoGK.Viewer.EKeys.Key_Home (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_Home]
  PicoGK.Viewer.EKeys.Key_End (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_End]
  PicoGK.Viewer.EKeys.Key_F1 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F1]
  PicoGK.Viewer.EKeys.Key_F2 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F2]
  PicoGK.Viewer.EKeys.Key_F3 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F3]
  PicoGK.Viewer.EKeys.Key_F4 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F4]
  PicoGK.Viewer.EKeys.Key_F5 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F5]
  PicoGK.Viewer.EKeys.Key_F6 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F6]
  PicoGK.Viewer.EKeys.Key_F7 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F7]
  PicoGK.Viewer.EKeys.Key_F8 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F8]
  PicoGK.Viewer.EKeys.Key_F9 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F9]
  PicoGK.Viewer.EKeys.Key_F10 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F10]
  PicoGK.Viewer.EKeys.Key_F11 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F11]
  PicoGK.Viewer.EKeys.Key_F12 (enumMember) [id: csharp:PicoGK.Viewer.EKeys.Key_F12]
PicoGK.Viewer.KeyAction (class) [3 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.KeyAction]
  PicoGK.Viewer.KeyAction.KeyAction (constructor) [id: csharp:PicoGK.Viewer.KeyAction.KeyAction]
  PicoGK.Viewer.KeyAction.bKeyEquals (method) [id: csharp:PicoGK.Viewer.KeyAction.bKeyEquals]
  PicoGK.Viewer.KeyAction.Do (method) [id: csharp:PicoGK.Viewer.KeyAction.Do]
PicoGK.Viewer.KeyHandler (class) [3 members] [category: Native viewer] [id: csharp:PicoGK.Viewer.KeyHandler]
  PicoGK.Viewer.KeyHandler.AddAction (method) [id: csharp:PicoGK.Viewer.KeyHandler.AddAction]
  PicoGK.Viewer.KeyHandler.bHandleEvent (method) [id: csharp:PicoGK.Viewer.KeyHandler.bHandleEvent]
  PicoGK.Viewer.KeyHandler.KeyHandler (constructor) [id: csharp:PicoGK.Viewer.KeyHandler.KeyHandler]
PicoGK.Viewer.AddKeyHandler (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.AddKeyHandler]
PicoGK.Viewer.StartTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.StartTimeLapse]
PicoGK.Viewer.PauseTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.PauseTimeLapse]
PicoGK.Viewer.ResumeTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.ResumeTimeLapse]
PicoGK.Viewer.StopTimeLapse (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.StopTimeLapse]
PicoGK.Viewer.oCreateSideBarLeft (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.oCreateSideBarLeft]
PicoGK.Viewer.oCreateSideBarRight (method) [category: Native viewer] [id: csharp:PicoGK.Viewer.oCreateSideBarRight]

## Advanced embedding/native — PicoGK.Viewer — `embedding-api-advanced-embedding-native-picogk-viewer.md`

PicoGK.Viewer._hCreate (method) [category: Advanced embedding/native] [id: csharp:PicoGK.Viewer._hCreate]
PicoGK.Viewer.Viewer (constructor) [category: Advanced embedding/native] — Initialize a hosted Viewer that delegates display operations without creating… [id: csharp:PicoGK.Viewer.Viewer]
PicoGK.Viewer.bPoll (method) [category: Advanced embedding/native] — Run this function in your main thread while it returns… [id: csharp:PicoGK.Viewer.bPoll]

## Advanced embedding/native — PicoGK.Voxels — `embedding-api-advanced-embedding-native-picogk-voxels.md`

PicoGK.Voxels.lib (field) [category: Advanced embedding/native] — Borrowed library owner [id: csharp:PicoGK.Voxels.lib]

## Subclass-only — System.Random — `embedding-api-subclass-only-system-random.md`

System.Random.Sample (method) [category: Subclass-only] [id: csharp:System.Random.Sample]
