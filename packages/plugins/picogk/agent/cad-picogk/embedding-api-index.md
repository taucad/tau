# PicoGK embedding API index

PicoGK 2.3.0.0 · 232 symbols · extracted by Roslyn 5.9.0.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## Subclass-only — PicoGK.ActiveVoxelCounterScalar — `embedding-api-subclass-only-picogk-activevoxelcounterscalar.md`

PicoGK.ActiveVoxelCounterScalar.ActiveVoxelCounterScalar (constructor) [category: Subclass-only]
PicoGK.ActiveVoxelCounterScalar.Run (method) [category: Subclass-only]

## Subclass-only — PicoGK.AddVectorFieldToViewer — `embedding-api-subclass-only-picogk-addvectorfieldtoviewer.md`

PicoGK.AddVectorFieldToViewer.AddVectorFieldToViewer (constructor) [category: Subclass-only]
PicoGK.AddVectorFieldToViewer.Run (method) [category: Subclass-only]

## Advanced embedding/native — PicoGK — `embedding-api-advanced-embedding-native-picogk.md`

PicoGK.Coord (struct) [4 members] [category: Advanced embedding/native]
  PicoGK.Coord.X (field)
  PicoGK.Coord.Y (field)
  PicoGK.Coord.Z (field)
  PicoGK.Coord.Coord (constructor)
PicoGK.GpuTexHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.GpuTexHandle.Value (property)
  PicoGK.GpuTexHandle.GpuTexHandle (constructor)
PicoGK.GuiSideBarHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.GuiSideBarHandle.Value (property)
  PicoGK.GuiSideBarHandle.GuiSideBarHandle (constructor)
PicoGK.ILibraryHost (interface) [2 members] [category: Advanced embedding/native] — Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  PicoGK.ILibraryHost.DefaultLogFilePath (property) — Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  PicoGK.ILibraryHost.Run (method) — Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
PicoGK.IViewerBackend (interface) [21 members] [category: Advanced embedding/native] — Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native…
  PicoGK.IViewerBackend.IsIdle (property)
  PicoGK.IViewerBackend.Orientation (property)
  PicoGK.IViewerBackend.Poll (method)
  PicoGK.IViewerBackend.RequestUpdate (method)
  PicoGK.IViewerBackend.LoadLightSetup (method)
  PicoGK.IViewerBackend.SetBackgroundColor (method)
  PicoGK.IViewerBackend.SetFieldOfView (method)
  PicoGK.IViewerBackend.ZoomToFit (method)
  PicoGK.IViewerBackend.Add (method)
  PicoGK.IViewerBackend.Remove (method)
  PicoGK.IViewerBackend.SetObjectMatrix (method)
  PicoGK.IViewerBackend.RemoveAllObjects (method)
  PicoGK.IViewerBackend.SetMechanism (method)
  PicoGK.IViewerBackend.RequestScreenShot (method)
  PicoGK.IViewerBackend.EnableExperimental (method)
  PicoGK.IViewerBackend.SetGroupVisible (method)
  PicoGK.IViewerBackend.SetGroupMaterial (method)
  PicoGK.IViewerBackend.SetGroupMatrix (method)
  PicoGK.IViewerBackend.EnableOverhangWarning (method)
  PicoGK.IViewerBackend.DisableOverhangWarning (method)
  PicoGK.IViewerBackend.GetBoundingBox (method)
PicoGK.LatHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.LatHandle.Value (property)
  PicoGK.LatHandle.LatHandle (constructor)
PicoGK.LibHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.LibHandle.Value (property)
  PicoGK.LibHandle.LibHandle (constructor)
PicoGK.MshHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.MshHandle.Value (property)
  PicoGK.MshHandle.MshHandle (constructor)
PicoGK.PicoGKAllocException (class) [1 members] [category: Advanced embedding/native]
  PicoGK.PicoGKAllocException.PicoGKAllocException (constructor)
PicoGK.PicoGKLibraryMismatchException (class) [1 members] [category: Advanced embedding/native]
  PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor)
PicoGK.PolyHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.PolyHandle.Value (property)
  PicoGK.PolyHandle.PolyHandle (constructor)
PicoGK.QuadHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.QuadHandle.Value (property)
  PicoGK.QuadHandle.QuadHandle (constructor)
PicoGK.ScalarFieldHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.ScalarFieldHandle.Value (property)
  PicoGK.ScalarFieldHandle.ScalarFieldHandle (constructor)
PicoGK.Triangle (struct) [4 members] [category: Advanced embedding/native]
  PicoGK.Triangle.A (field)
  PicoGK.Triangle.B (field)
  PicoGK.Triangle.C (field)
  PicoGK.Triangle.Triangle (constructor)
PicoGK.VdbHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.VdbHandle.Value (property)
  PicoGK.VdbHandle.VdbHandle (constructor)
PicoGK.VdbMetaHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.VdbMetaHandle.Value (property)
  PicoGK.VdbMetaHandle.VdbMetaHandle (constructor)
PicoGK.VectorFieldHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.VectorFieldHandle.Value (property)
  PicoGK.VectorFieldHandle.VectorFieldHandle (constructor)
PicoGK.VoxHandle (struct) [2 members] [category: Advanced embedding/native]
  PicoGK.VoxHandle.Value (property)
  PicoGK.VoxHandle.VoxHandle (constructor)

## Diagnostics — PicoGK.Diagnostics — `embedding-api-diagnostics-picogk-diagnostics.md`

PicoGK.Diagnostics.TestCliOutput (class) [1 members] [category: Diagnostics]
  PicoGK.Diagnostics.TestCliOutput.Run (method) — Test function, generates a unique voxel object and tests vectorization…
PicoGK.Diagnostics.TestProgress (class) [1 members] [category: Diagnostics]
  PicoGK.Diagnostics.TestProgress.Test (method)
PicoGK.Diagnostics.TestVectorAndComparison (class) [1 members] [category: Diagnostics]
  PicoGK.Diagnostics.TestVectorAndComparison.Test (method)

## Advanced embedding/native — PicoGK.FieldMetadata — `embedding-api-advanced-embedding-native-picogk-fieldmetadata.md`

PicoGK.FieldMetadata.lib (field) [category: Advanced embedding/native] — Borrowed library owner
PicoGK.FieldMetadata.FieldMetadata (constructor) [category: Advanced embedding/native] — Internal constructor used by the Voxels, ScalarField and VectorField accessor…

## Subclass-only — PicoGK.FieldMetadata — `embedding-api-subclass-only-picogk-fieldmetadata.md`

PicoGK.FieldMetadata.GuardInternalFields (method) [category: Subclass-only] — This function tests whether you are attempting to set internal…

## Subclass-only — PicoGK.Image — `embedding-api-subclass-only-picogk-image.md`

PicoGK.Image.Image (constructor) [category: Subclass-only]

## Advanced embedding/native — PicoGK.Lattice — `embedding-api-advanced-embedding-native-picogk-lattice.md`

PicoGK.Lattice.lib (field) [category: Advanced embedding/native] — Borrowed library owner

## Advanced embedding/native — PicoGK.Library — `embedding-api-advanced-embedding-native-picogk-library.md`

PicoGK.Library.Library (constructor) [category: Advanced embedding/native] — Create a new Library instance, using the specified voxel size…
PicoGK.Library.RegisterGlobalLibrary (method) [category: Advanced embedding/native]
PicoGK.Library.UnregisterGlobalLibrary (method) [category: Advanced embedding/native]
PicoGK.Library.RegisterGlobalViewer (method) [category: Advanced embedding/native]
PicoGK.Library.UnregisterGlobalViewer (method) [category: Advanced embedding/native]
PicoGK.Library.UseHost (method) [category: Advanced embedding/native] — Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding…

## Advanced embedding/native — PicoGK.Mesh — `embedding-api-advanced-embedding-native-picogk-mesh.md`

PicoGK.Mesh.lib (field) [category: Advanced embedding/native] — Borrowed library owner

## Advanced embedding/native — PicoGK.OpenVdbFile — `embedding-api-advanced-embedding-native-picogk-openvdbfile.md`

PicoGK.OpenVdbFile.lib (field) [category: Advanced embedding/native] — Borrowed library owner
PicoGK.OpenVdbFile._hCreate (method) [category: Advanced embedding/native]

## Advanced embedding/native — PicoGK.PolyLine — `embedding-api-advanced-embedding-native-picogk-polyline.md`

PicoGK.PolyLine.lib (field) [category: Advanced embedding/native] — Borrowed library owner
PicoGK.PolyLine._hCreate (method) [category: Advanced embedding/native]

## Advanced embedding/native — PicoGK.ScalarField — `embedding-api-advanced-embedding-native-picogk-scalarfield.md`

PicoGK.ScalarField.lib (field) [category: Advanced embedding/native] — Borrowed library owner
PicoGK.ScalarField._hCreate (method) [category: Advanced embedding/native]
PicoGK.ScalarField._hCreateCopy (method) [category: Advanced embedding/native]
PicoGK.ScalarField._hCreateFromVoxels (method) [category: Advanced embedding/native]
PicoGK.ScalarField._hBuildFromVoxels (method) [category: Advanced embedding/native]

## Subclass-only — PicoGK.SurfaceNormalFieldExtractor — `embedding-api-subclass-only-picogk-surfacenormalfieldextractor.md`

PicoGK.SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor (constructor) [category: Subclass-only]
PicoGK.SurfaceNormalFieldExtractor.Run (method) [category: Subclass-only]

## Advanced embedding/native — PicoGK.VectorField — `embedding-api-advanced-embedding-native-picogk-vectorfield.md`

PicoGK.VectorField.lib (field) [category: Advanced embedding/native] — Borrowed library owner
PicoGK.VectorField._hCreate (method) [category: Advanced embedding/native]
PicoGK.VectorField._hCreateCopy (method) [category: Advanced embedding/native]
PicoGK.VectorField._hCreateFromVoxels (method) [category: Advanced embedding/native]
PicoGK.VectorField._hBuildFromVoxels (method) [category: Advanced embedding/native]

## Subclass-only — PicoGK.VectorFieldMerge — `embedding-api-subclass-only-picogk-vectorfieldmerge.md`

PicoGK.VectorFieldMerge.VectorFieldMerge (constructor) [category: Subclass-only]
PicoGK.VectorFieldMerge.Run (method) [category: Subclass-only]

## Native viewer — PicoGK.Viewer.GpuTex — `embedding-api-native-viewer-picogk-viewer-gputex.md`

PicoGK.Viewer.GpuTex.GpuTex (constructor) [category: Native viewer]
PicoGK.Viewer.GpuTex.ReplaceWith (method) [category: Native viewer]

## Native viewer — PicoGK.Viewer.ImageQuad — `embedding-api-native-viewer-picogk-viewer-imagequad.md`

PicoGK.Viewer.ImageQuad.ImageQuad (constructor) [category: Native viewer]
PicoGK.Viewer.ImageQuad.UpdateImage (method) [category: Native viewer]
PicoGK.Viewer.ImageQuad.UpdateMatrix (method) [category: Native viewer]

## Native viewer — PicoGK.Viewer.SideBar — `embedding-api-native-viewer-picogk-viewer-sidebar.md`

PicoGK.Viewer.SideBar.SideBar (constructor) [category: Native viewer]

## Native viewer — PicoGK.Viewer — `embedding-api-native-viewer-picogk-viewer.md`

PicoGK.Viewer.Camera (class) [10 members] [category: Native viewer] — Abstract camera class to interact with the view
  PicoGK.Viewer.Camera.EDragType (enum) [3 members] — Drag, Spin, Pan the camera
    PicoGK.Viewer.Camera.EDragType.Rotate (enumMember) — Rotate the camera (up/down)
    PicoGK.Viewer.Camera.EDragType.Spin (enumMember) — Spin the camera around the view vector
    PicoGK.Viewer.Camera.EDragType.Pan (enumMember) — Move the camera up/down
  PicoGK.Viewer.Camera.qOrientation (property)
  PicoGK.Viewer.Camera.matVP (property)
  PicoGK.Viewer.Camera.vecEye (property)
  PicoGK.Viewer.Camera.SetViewPort (method)
  PicoGK.Viewer.Camera.LookAt (method)
  PicoGK.Viewer.Camera.ZoomToFit (method)
  PicoGK.Viewer.Camera.Scroll (method)
  PicoGK.Viewer.Camera.MouseDrag (method)
  PicoGK.Viewer.Camera.Camera (constructor) [category: Subclass-only]
PicoGK.Viewer.CamPerspectiveArcball (class) [10 members] [category: Native viewer]
  PicoGK.Viewer.CamPerspectiveArcball.matVP (property)
  PicoGK.Viewer.CamPerspectiveArcball.vecEye (property)
  PicoGK.Viewer.CamPerspectiveArcball.qOrientation (property)
  PicoGK.Viewer.CamPerspectiveArcball.CamPerspectiveArcball (constructor)
  PicoGK.Viewer.CamPerspectiveArcball.SetVerticalFov (method)
  PicoGK.Viewer.CamPerspectiveArcball.SetViewPort (method)
  PicoGK.Viewer.CamPerspectiveArcball.LookAt (method)
  PicoGK.Viewer.CamPerspectiveArcball.ZoomToFit (method)
  PicoGK.Viewer.CamPerspectiveArcball.MouseDrag (method)
  PicoGK.Viewer.CamPerspectiveArcball.Scroll (method)
PicoGK.Viewer.IKeyHandler (interface) [1 members] [category: Native viewer]
  PicoGK.Viewer.IKeyHandler.bHandleEvent (method)
PicoGK.Viewer.EKeys (enum) [63 members] [category: Native viewer]
  PicoGK.Viewer.EKeys.Key_Space (enumMember)
  PicoGK.Viewer.EKeys.Key_0 (enumMember)
  PicoGK.Viewer.EKeys.Key_1 (enumMember)
  PicoGK.Viewer.EKeys.Key_2 (enumMember)
  PicoGK.Viewer.EKeys.Key_3 (enumMember)
  PicoGK.Viewer.EKeys.Key_4 (enumMember)
  PicoGK.Viewer.EKeys.Key_5 (enumMember)
  PicoGK.Viewer.EKeys.Key_6 (enumMember)
  PicoGK.Viewer.EKeys.Key_7 (enumMember)
  PicoGK.Viewer.EKeys.Key_8 (enumMember)
  PicoGK.Viewer.EKeys.Key_9 (enumMember)
  PicoGK.Viewer.EKeys.Key_A (enumMember)
  PicoGK.Viewer.EKeys.Key_B (enumMember)
  PicoGK.Viewer.EKeys.Key_C (enumMember)
  PicoGK.Viewer.EKeys.Key_D (enumMember)
  PicoGK.Viewer.EKeys.Key_E (enumMember)
  PicoGK.Viewer.EKeys.Key_F (enumMember)
  PicoGK.Viewer.EKeys.Key_G (enumMember)
  PicoGK.Viewer.EKeys.Key_H (enumMember)
  PicoGK.Viewer.EKeys.Key_I (enumMember)
  PicoGK.Viewer.EKeys.Key_J (enumMember)
  PicoGK.Viewer.EKeys.Key_K (enumMember)
  PicoGK.Viewer.EKeys.Key_L (enumMember)
  PicoGK.Viewer.EKeys.Key_M (enumMember)
  PicoGK.Viewer.EKeys.Key_N (enumMember)
  PicoGK.Viewer.EKeys.Key_O (enumMember)
  PicoGK.Viewer.EKeys.Key_P (enumMember)
  PicoGK.Viewer.EKeys.Key_Q (enumMember)
  PicoGK.Viewer.EKeys.Key_R (enumMember)
  PicoGK.Viewer.EKeys.Key_S (enumMember)
  PicoGK.Viewer.EKeys.Key_T (enumMember)
  PicoGK.Viewer.EKeys.Key_U (enumMember)
  PicoGK.Viewer.EKeys.Key_V (enumMember)
  PicoGK.Viewer.EKeys.Key_W (enumMember)
  PicoGK.Viewer.EKeys.Key_X (enumMember)
  PicoGK.Viewer.EKeys.Key_Y (enumMember)
  PicoGK.Viewer.EKeys.Key_Z (enumMember)
  PicoGK.Viewer.EKeys.Key_ESC (enumMember)
  PicoGK.Viewer.EKeys.Key_Enter (enumMember)
  PicoGK.Viewer.EKeys.Key_Tab (enumMember)
  PicoGK.Viewer.EKeys.Key_Backspace (enumMember)
  PicoGK.Viewer.EKeys.Key_Insert (enumMember)
  PicoGK.Viewer.EKeys.Key_Delete (enumMember)
  PicoGK.Viewer.EKeys.Key_Right (enumMember)
  PicoGK.Viewer.EKeys.Key_Left (enumMember)
  PicoGK.Viewer.EKeys.Key_Down (enumMember)
  PicoGK.Viewer.EKeys.Key_Up (enumMember)
  PicoGK.Viewer.EKeys.Key_PgUp (enumMember)
  PicoGK.Viewer.EKeys.Key_PgDn (enumMember)
  PicoGK.Viewer.EKeys.Key_Home (enumMember)
  PicoGK.Viewer.EKeys.Key_End (enumMember)
  PicoGK.Viewer.EKeys.Key_F1 (enumMember)
  PicoGK.Viewer.EKeys.Key_F2 (enumMember)
  PicoGK.Viewer.EKeys.Key_F3 (enumMember)
  PicoGK.Viewer.EKeys.Key_F4 (enumMember)
  PicoGK.Viewer.EKeys.Key_F5 (enumMember)
  PicoGK.Viewer.EKeys.Key_F6 (enumMember)
  PicoGK.Viewer.EKeys.Key_F7 (enumMember)
  PicoGK.Viewer.EKeys.Key_F8 (enumMember)
  PicoGK.Viewer.EKeys.Key_F9 (enumMember)
  PicoGK.Viewer.EKeys.Key_F10 (enumMember)
  PicoGK.Viewer.EKeys.Key_F11 (enumMember)
  PicoGK.Viewer.EKeys.Key_F12 (enumMember)
PicoGK.Viewer.KeyAction (class) [3 members] [category: Native viewer]
  PicoGK.Viewer.KeyAction.KeyAction (constructor)
  PicoGK.Viewer.KeyAction.bKeyEquals (method)
  PicoGK.Viewer.KeyAction.Do (method)
PicoGK.Viewer.KeyHandler (class) [3 members] [category: Native viewer]
  PicoGK.Viewer.KeyHandler.AddAction (method)
  PicoGK.Viewer.KeyHandler.bHandleEvent (method)
  PicoGK.Viewer.KeyHandler.KeyHandler (constructor)
PicoGK.Viewer.AddKeyHandler (method) [category: Native viewer]
PicoGK.Viewer.StartTimeLapse (method) [category: Native viewer]
PicoGK.Viewer.PauseTimeLapse (method) [category: Native viewer]
PicoGK.Viewer.ResumeTimeLapse (method) [category: Native viewer]
PicoGK.Viewer.StopTimeLapse (method) [category: Native viewer]
PicoGK.Viewer.oCreateSideBarLeft (method) [category: Native viewer]
PicoGK.Viewer.oCreateSideBarRight (method) [category: Native viewer]

## Advanced embedding/native — PicoGK.Viewer — `embedding-api-advanced-embedding-native-picogk-viewer.md`

PicoGK.Viewer._hCreate (method) [category: Advanced embedding/native]
PicoGK.Viewer.Viewer (constructor) [category: Advanced embedding/native] — Initialize a hosted Viewer that delegates display operations without creating…
PicoGK.Viewer.bPoll (method) [category: Advanced embedding/native] — Run this function in your main thread while it returns…

## Advanced embedding/native — PicoGK.Voxels — `embedding-api-advanced-embedding-native-picogk-voxels.md`

PicoGK.Voxels.lib (field) [category: Advanced embedding/native] — Borrowed library owner

## Subclass-only — System.Random — `embedding-api-subclass-only-system-random.md`

System.Random.Sample (method) [category: Subclass-only]
