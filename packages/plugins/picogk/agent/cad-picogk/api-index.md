# PicoGK API index

PicoGK 2.3.0.0 · 2083 symbols · extracted by Roslyn 5.9.0.

Every symbol appears here exactly once. The heading above each block names the file with its signature.

## PicoGK — `api-picogk.md`

ActiveVoxelCounterScalar (class) [4 members]
  ActiveVoxelCounterScalar.nCount (method)
  ActiveVoxelCounterScalar.ActiveVoxelCounterScalar (constructor)
  ActiveVoxelCounterScalar.Run (method)
  ActiveVoxelCounterScalar.InformActiveValue (method)
AddVectorFieldToViewer (class) [4 members]
  AddVectorFieldToViewer.AddToViewer (method)
  AddVectorFieldToViewer.AddVectorFieldToViewer (constructor)
  AddVectorFieldToViewer.Run (method)
  AddVectorFieldToViewer.InformActiveValue (method)
Animation (class) [5 members]
  Animation.IAction (interface)
  Animation.EType (enum)
  Animation.Animation (constructor)
  Animation.End (method)
  Animation.bAnimate (method)
AnimationQueue (class) [5 members]
  AnimationQueue.AnimationQueue (constructor)
  AnimationQueue.Clear (method)
  AnimationQueue.bPulse (method)
  AnimationQueue.bIsIdle (method)
  AnimationQueue.Add (method)
BBox2 (struct) [10 members] — 2D Bounding Box object
  BBox2.vecMin (field) — Minimum coordinate of the bounding box
  BBox2.vecMax (field) — Maximum coordinate of the bounding box
  BBox2.BBox2 (constructor) — Creates an empty Bounding Box
  BBox2.bIsEmpty (method) — Is the BoundingBox empty?
  BBox2.bContains (method) — Checks whether point is inside the bounding box
  BBox2.Include (method) — Include the specified vector in the bounding box
  BBox2.Grow (method) — Grows the bounding box by the specified value on each…
  BBox2.vecSize (method) — Returns the size of the Bounding Box
  BBox2.vecCenter (method) — Center point of the bounding box
  BBox2.ToString (method) — A string representation of the Bounding Box
BBox3 (struct) [13 members] — 3D bounding box
  BBox3.vecMin (field) — Minimum coordinate of the bounding box
  BBox3.vecMax (field) — Maximum coordinate of the bounding box
  BBox3.BBox3 (constructor) — Create an empty Bounding Box
  BBox3.vecSize (method) — Size of the Bounding Box
  BBox3.bIsEmpty (method) — Is the Bounding Box empty>
  BBox3.bContains (method) — Checks whether the specified point is inside the bounding box
  BBox3.Include (method) — Include the specified vector in the Bounding Box
  BBox3.Grow (method) — Grows the bounding box by the specified value on each…
  BBox3.vecCenter (method) — Return the center of the Bounding Box
  BBox3.oFitInto (method) — Fit the specified Bounding Box into this box, returning Scale…
  BBox3.vecRandomVectorInside (method) — A function to return a random point in a Bounding…
  BBox3.oAsBoundingBox2 (method) — Return the 2D extent of this Bounding Box
  BBox3.ToString (method) — Return the Bounding Box as string
CliIo (class) [4 members] — ASCII CLI (Common Layer Interface) I/O based on https://www.hmilch.net/downloads/cli_format.html#:~:text=CLI%20is%20intended%20as%20a,data%20structure%20of%20the%20machine
  CliIo.EFormat (enum) — Format options for CLI writer
  CliIo.Result (class) — Result of a CLI import
  CliIo.WriteSlicesToCliFile (method) — Write a stack of PolySlices to a CLI file
  CliIo.oSlicesFromCliFile (method) — Read PolySlice objects from a CLI file
ColorBgr24 (struct) [5 members] — BGR 24 bit color value
  ColorBgr24.B (field) — Blue value (0..255)
  ColorBgr24.G (field) — Green value (0..255)
  ColorBgr24.R (field) — Red value (0..255)
  ColorBgr24.ColorBgr24 (constructor) — Construct a BGR value from 3 bytes
  ColorBgr24.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
ColorBgra32 (struct) [6 members] — BGRA 32 bit color value
  ColorBgra32.B (field) — Blue value (0..255)
  ColorBgra32.G (field) — Green value (0..255)
  ColorBgra32.R (field) — Red value (0..255)
  ColorBgra32.A (field) — Alpha value (0..255)
  ColorBgra32.ColorBgra32 (constructor) — Construct a 32 bit BGRA color value from 4 bytes
  ColorBgra32.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
ColorFloat (struct) [11 members] — A floating point color value with R,G,B,A values
  ColorFloat.R (field) — Red value (1 is full color)
  ColorFloat.G (field) — Green value (1 is full color)
  ColorFloat.B (field) — Blue value (1 is full color)
  ColorFloat.A (field) — Alpha value (1 is opaque, 0 is transparent)
  ColorFloat.ColorFloat (constructor) — Create a color from a hex string #FF0000 is red,…
  ColorFloat.op_Implicit (method) — Allows you to pass a hex string to any function…
  ColorFloat.strAsHexCode (method) — Returns the color as a hex code such as "FF"…
  ColorFloat.strAsABGRHexCode (method) — Returns the color value as an ABGR hex code (always…
  ColorFloat.ToString (method) — Returns the color as hex string
  ColorFloat.clrWeighted (method) — Weighted linear interpolation between two colors
  ColorFloat.clrRandom (method) — Return a random color
ColorHLS (struct) [5 members] — A color value in HSV space
  ColorHLS.H (field) — Hue value (0..360º)
  ColorHLS.L (field) — Lightness value (0..1)
  ColorHLS.S (field) — Saturation value (0..1)
  ColorHLS.ColorHLS (constructor) — Create an HLS color from its three components
  ColorHLS.op_Implicit (method) — Implicit conversion from ColorFloat to ColorHLS
ColorHSV (struct) [5 members] — Hue Saturation Value (HSV) color
  ColorHSV.H (field) — Hue (0..360º)
  ColorHSV.S (field) — Saturation (0..1)
  ColorHSV.V (field) — Value component
  ColorHSV.ColorHSV (constructor) — Create an HSV value from its three components
  ColorHSV.op_Implicit (method) — Implicit conversion that allows you to pass a ColorFloat to…
ColorRgb24 (struct) [5 members] — 24 bit RGB color
  ColorRgb24.R (field) — Red value (0..255)
  ColorRgb24.G (field) — Green value (0..255)
  ColorRgb24.B (field) — Blue value (0..255)
  ColorRgb24.ColorRgb24 (constructor) — Construct a 24 bit RGB value from 3 byes
  ColorRgb24.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
ColorRgba32 (struct) [6 members] — 32 bit RGBA color
  ColorRgba32.R (field) — Red value (0..255)
  ColorRgba32.G (field) — Green value (0..255)
  ColorRgba32.B (field) — Blue value (0..255)
  ColorRgba32.A (field) — Alpha value 0..255 (255 is opaque)
  ColorRgba32.ColorRgba32 (constructor) — Create a color from 3 or 4 bytes
  ColorRgba32.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
Config (class) [1 members]
  Config.strPicoGKLib (constant)
Coord (struct) [4 members]
  Coord.X (field)
  Coord.Y (field)
  Coord.Z (field)
  Coord.Coord (constructor)
CsvTable (class) [11 members]
  CsvTable.CsvTable (constructor)
  CsvTable.Save (method)
  CsvTable.nRowCount (method)
  CsvTable.nMaxColumnCount (method)
  CsvTable.strGetAt (method)
  CsvTable.SetKeyColumn (method)
  CsvTable.bGetAt (method)
  CsvTable.bFindColumn (method)
  CsvTable.strColumnId (method)
  CsvTable.SetColumnIds (method)
  CsvTable.AddRow (method)
Easing (class) [11 members] — Easing functions — they take a float value from 0..1…
  Easing.EEasing (enum)
  Easing.fEaseSineIn (method)
  Easing.fEaseSineOut (method)
  Easing.fEaseSineInOut (method)
  Easing.fEaseQuadIn (method)
  Easing.fEaseQuadOut (method)
  Easing.fEaseQuadInOut (method)
  Easing.fEaseCubicIn (method)
  Easing.fEaseCubicOut (method)
  Easing.fEaseCubicInOut (method)
  Easing.fEasingFunction (method)
FieldMetadata (class) [14 members] — Metadata table containing parameters associated with field types like Voxels,…
  FieldMetadata.EType (enum) — Type of the data items in the metadata table
  FieldMetadata.lib (field)
  FieldMetadata.nCount (method) — Number of items in the metadata table
  FieldMetadata.bGetNameAt (method) — Attempts to retrieve the name of the parameter at the…
  FieldMetadata.eTypeAt (method) — Returns the type of the value with the specified name
  FieldMetadata.strTypeAt (method) — Returns the human readable type of the parameter with the…
  FieldMetadata.strTypeName (method) — Translate the type enum to a string
  FieldMetadata.bGetValueAt (method) — Try to get the value of a parameter
  FieldMetadata.SetValue (method) — Set string value in the metadata table
  FieldMetadata.RemoveValue (method) — Remove a value from the metadata table
  FieldMetadata.ToString (method) — Converts the contents of the metadata table to a string
  FieldMetadata.FieldMetadata (constructor) — Internal constructor used by the Voxels, ScalarField and VectorField accessor…
  FieldMetadata.GuardInternalFields (method) — This function tests whether you are attempting to set internal…
  FieldMetadata.Dispose (method)
GpuTexHandle (struct) [2 members]
  GpuTexHandle.Value (property)
  GpuTexHandle.GpuTexHandle (constructor)
GuiSideBarHandle (struct) [2 members]
  GuiSideBarHandle.Value (property)
  GuiSideBarHandle.GuiSideBarHandle (constructor)
IBoundedImplicit (interface) [1 members] — Interface for a bounded implicit function
  IBoundedImplicit.oBounds (property) — Access the bounding box of the implicit function
IDataTable (interface) [7 members]
  IDataTable.nMaxColumnCount (method)
  IDataTable.strColumnId (method)
  IDataTable.bFindColumn (method)
  IDataTable.nRowCount (method)
  IDataTable.strGetAt (method)
  IDataTable.SetColumnIds (method)
  IDataTable.AddRow (method)
IFieldWithMetadata (interface) [1 members]
  IFieldWithMetadata.oMetaData (method)
IImplicit (interface) [1 members] — Function signature for signed distance implicts
  IImplicit.fSignedDistance (method) — Return the signed distance to the iso surface
ILibraryHost (interface) [2 members] — Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  ILibraryHost.DefaultLogFilePath (property) — Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  ILibraryHost.Run (method) — Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
ILog (interface) [1 members] — Logging interface which allows you to output diagnostics
  ILog.Log (method) — This function allows you to output information using the standard…
IProgress (interface) [1 members] — A generic progress reporting interface
  IProgress.Progress (method) — Report progress from 0..1
ITraverseScalarField (interface) [1 members] — An interface used to traverse the active values of a…
  ITraverseScalarField.InformActiveValue (method) — Called for every active value in the ScalarField object
ITraverseVectorField (interface) [1 members] — An interface to allow traversal of all active values in…
  ITraverseVectorField.InformActiveValue (method) — Called for every active value in the VectorField object
IViewerBackend (interface) [20 members] — Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native…
  IViewerBackend.IsIdle (property)
  IViewerBackend.Orientation (property)
  IViewerBackend.Poll (method)
  IViewerBackend.RequestUpdate (method)
  IViewerBackend.LoadLightSetup (method)
  IViewerBackend.SetBackgroundColor (method)
  IViewerBackend.SetFieldOfView (method)
  IViewerBackend.ZoomToFit (method)
  IViewerBackend.Add (method)
  IViewerBackend.Remove (method)
  IViewerBackend.SetObjectMatrix (method)
  IViewerBackend.RemoveAllObjects (method)
  IViewerBackend.RequestScreenShot (method)
  IViewerBackend.EnableExperimental (method)
  IViewerBackend.SetGroupVisible (method)
  IViewerBackend.SetGroupMaterial (method)
  IViewerBackend.SetGroupMatrix (method)
  IViewerBackend.EnableOverhangWarning (method)
  IViewerBackend.DisableOverhangWarning (method)
  IViewerBackend.GetBoundingBox (method)
Image (class) [26 members]
  Image.EType (enum)
  Image.nWidth (field)
  Image.nHeight (field)
  Image.eType (field)
  Image.clrValue (method)
  Image.fValue (method)
  Image.bValue (method)
  Image.SetValue (method)
  Image.byGetValue (method)
  Image.sGetBgr24 (method)
  Image.SetBgr24 (method)
  Image.sGetBgra32 (method)
  Image.SetBgra32 (method)
  Image.sGetRgb24 (method)
  Image.sGetRgba32 (method)
  Image.SetRgb24 (method)
  Image.SetRgba32 (method)
  Image.clrGetAtNormalized (method) — Returns the interpolated color value at a normalized coordinate going…
  Image.DrawLine (method)
  Image.Image (constructor)
  Image.imgFromSKBitmap (method)
  Image.op_Implicit (method)
  Image.SavePng (method)
  Image.SaveJpg (method)
  Image.SaveTga (method)
  Image.imgLoadFromFile (method)
ImageBWAbstract (class) [4 members]
  ImageBWAbstract.ImageBWAbstract (constructor)
  ImageBWAbstract.fValue (method)
  ImageBWAbstract.clrValue (method)
  ImageBWAbstract.SetValue (method)
ImageColor (class) [3 members]
  ImageColor.ImageColor (constructor)
  ImageColor.SetValue (method)
  ImageColor.clrValue (method)
ImageColorAbstract (class) [4 members]
  ImageColorAbstract.ImageColorAbstract (constructor)
  ImageColorAbstract.fValue (method)
  ImageColorAbstract.bValue (method)
  ImageColorAbstract.SetValue (method)
ImageGrayScale (class) [6 members]
  ImageGrayScale.m_afValues (field)
  ImageGrayScale.ImageGrayScale (constructor)
  ImageGrayScale.SetValue (method)
  ImageGrayScale.fValue (method)
  ImageGrayScale.imgGetColorCodedSDF (method)
  ImageGrayScale.imgGetInterpolated (method)
ImageGrayscaleAbstract (class) [5 members]
  ImageGrayscaleAbstract.ImageGrayscaleAbstract (constructor)
  ImageGrayscaleAbstract.clrValue (method)
  ImageGrayscaleAbstract.bValue (method)
  ImageGrayscaleAbstract.SetValue (method)
  ImageGrayscaleAbstract.bContainsActivePixels (method) — Returns whether the image has any pixels set to a…
ImageRgb24 (class) [5 members]
  ImageRgb24.ImageRgb24 (constructor)
  ImageRgb24.clrValue (method)
  ImageRgb24.SetValue (method)
  ImageRgb24.SetRgb24 (method)
  ImageRgb24.sGetRgb24 (method)
ImageRgba32 (class) [5 members]
  ImageRgba32.ImageRgba32 (constructor)
  ImageRgba32.clrValue (method)
  ImageRgba32.SetValue (method)
  ImageRgba32.SetRgba32 (method)
  ImageRgba32.sGetRgba32 (method)
LatHandle (struct) [2 members]
  LatHandle.Value (property)
  LatHandle.LatHandle (constructor)
Lattice (class) [5 members] — A lattice of beams (and spheres)
  Lattice.lib (field)
  Lattice.Lattice (constructor) — Creates a new empty Lattice, using the global library instance
  Lattice.AddSphere (method) — Add a sphere to the lattice
  Lattice.AddBeam (method) — Add a beam to the lattice
  Lattice.Dispose (method)
LibHandle (struct) [2 members]
  LibHandle.Value (property)
  LibHandle.LibHandle (constructor)

## PicoGK (2) — `api-picogk-2.md`

Library (class) [45 members] — The Library object encapsulates an instance of a PicoGK library…
  Library.nStringLength (constant)
  Library.fVoxelSize (field) — Voxel size in millimeters
  Library.GlobalInstance (class)
  Library.fVoxelSizeMM (property)
  Library.strLogFolder (property)
  Library.Library (constructor) — Create a new Library instance, using the specified voxel size…
  Library.nTotalMemUsage (method) — Return the total memory usage of all objects created with…
  Library.nMeshesMemUsage (method) — Returns the total memory usage of all Mesh objects created…
  Library.nLatticesMemUsage (method) — Returns the total memory usage of all Lattice objects created…
  Library.nPolyLinesMemUsage (method) — Returns the total memory usage of all PolyLine objects created…
  Library.nVoxelsMemUsage (method) — Returns the total memory usage of all Voxels objects created…
  Library.nVdbFilesMemUsage (method) — Returns the total memory usage of all VdbFile objects created…
  Library.nScalarFieldsMemUsage (method) — Returns the total memory usage of all ScalarField objects created…
  Library.nVectorFieldsMemUsage (method) — Returns the total memory usage of all VectorField objects created…
  Library.nVdbMetasMemUsage (method) — Returns the total memory usage of all VdbFile metadata objects…
  Library.nMeshesAllocated (method) — Returns the number of Mesh objects created with this Library…
  Library.nLatticesAllocated (method) — Returns the number of Lattice objects created with this Library…
  Library.nPolyLinesAllocated (method) — Returns the number of PolyLine objects created with this Library…
  Library.nVoxelsAllocated (method) — Returns the number of Voxels objects created with this Library…
  Library.nVdbFilesAllocated (method) — Returns the number of VdbFile objects created with this Library…
  Library.nScalarFieldsAllocated (method) — Returns the number of ScalarField objects created with this Library…
  Library.nVectorFieldsAllocated (method) — Returns the number of VectorField objects created with this Library…
  Library.nVdbMetasAllocated (method) — Returns the number of VdbFile metadata objects created with this…
  Library.vecVoxelsToMm (method) — Convert voxel index coordinates to world coordinates in millimeters
  Library.MmToVoxels (method) — Convert world (millimeter) units to voxel units
  Library.Dispose (method) — The Library implements the Dispose pattern, so you can use…
  Library.oLibrary (method)
  Library.RegisterGlobalLibrary (method)
  Library.UnregisterGlobalLibrary (method)
  Library.oViewer (method)
  Library.RegisterGlobalViewer (method)
  Library.UnregisterGlobalViewer (method)
  Library.xLog (method)
  Library.RegisterGlobalLog (method)
  Library.UnregisterGlobalLog (method)
  Library.Go (method) — This is the one library function that you call to…
  Library.Log (method)
  Library.bContinueTask (method) — Checks whether the task started using Go() should continue, and…
  Library.EndTask (method) — Requests the task started by the Go() function to end
  Library.CancelEndTaskRequest (method) — Cancels any pending request to end the task
  Library.strFindLightSetupFile (method)
  Library.UseHost (method) — Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding…
  Library.strName (method) — Returns the library name (from the C++ side)
  Library.strVersion (method) — Returns the library version (from the C++ side)
  Library.strBuildInfo (method) — Returns internal build info, such as build date/time of the…
LogConsole (class) [1 members] — A simple logging class which outputs to the console
  LogConsole.Log (method) — Implementation of a simple logging class that outputs to the…
LogFile (class) [4 members]
  LogFile.LogFile (constructor)
  LogFile.Log (method)
  LogFile.LogTime (method)
  LogFile.Dispose (method)
LogProgress (class) [3 members] — A progress reporting class that outputs to a log interface
  LogProgress.LogProgress (constructor) — Initialize a new progress reporting object
  LogProgress.Progress (method) — Report progress from 0..1
  LogProgress.Dispose (method) — Cleanup (just reports that the task is finished)
Mesh (class) [23 members] — A triangle mesh
  Mesh.EStlUnit (enum)
  Mesh.m_strLoadHeaderData (field)
  Mesh.m_eLoadUnits (field)
  Mesh.lib (field)
  Mesh.Mesh (constructor) — Creates a new empty Mesh, using the global library instance
  Mesh.mshCreateTransformed (method) — Create a transformed mesh by offsetting and scaling it
  Mesh.mshCreateMirrored (method) — Mirrors a mesh at the specified plane
  Mesh.nAddVertex (method) — Add a new vertex to the mesh so that it…
  Mesh.AddVertices (method)
  Mesh.vecVertexAt (method) — Get the vertex at the specified index
  Mesh.nVertexCount (method) — Get the number of vertices in the mesh
  Mesh.nAddTriangle (method) — Add a triangle to the mesh with the specified vertex…
  Mesh.nTriangleCount (method) — Return number of triangles in the mesh
  Mesh.AddQuad (method) — Adds a quad, defined by four corner vertices Helper function,…
  Mesh.oTriangleAt (method) — Get the triangle with the specified index
  Mesh.GetTriangle (method) — Get the triangle with the specified index
  Mesh.Append (method) — Append one mesh to another Note, no deduplication is done…
  Mesh.oBoundingBox (method) — Return the BoundingBox of the Mesh
  Mesh.mshFromStlFile (method) — Loads a mesh from an STL file By default, it…
  Mesh.SaveToStlFile (method) — Saves a Mesh to STL file If eUnit is auto,…
  Mesh.Dispose (method)
  Mesh.bFindTriangleFromSurfacePoint (method)
  Mesh.bPointLiesOnTriangle (method)
MshHandle (struct) [2 members]
  MshHandle.Value (property)
  MshHandle.MshHandle (constructor)
OpenVdbFile (class) [18 members] — OpenVdbFile handles the creation, loading and saving of openvdb .VDB…
  OpenVdbFile.EFieldType (enum) — Types of fields in .VDB files
  OpenVdbFile.lib (field)
  OpenVdbFile.OpenVdbFile (constructor) — Create an empty openvdb file object
  OpenVdbFile.libCreateCompatibleLibraryFor (method) — Create a PicoGK library object that is compatible with the…
  OpenVdbFile.SaveToFile (method) — Saves the current object with all of its attached fields…
  OpenVdbFile.voxGet (method) — Get the Voxels at the index specified
  OpenVdbFile.nAdd (method) — Adds a copy of the specified Voxels to the VdbFile…
  OpenVdbFile.oGetScalarField (method) — Get the ScalarField at the index specified
  OpenVdbFile.oGetVectorField (method) — Get the VectorField at the index specified
  OpenVdbFile.nFieldCount (method) — Number of fields stored in the VdbFile container
  OpenVdbFile.strFieldName (method) — Returns the name of the field (if specified) at the…
  OpenVdbFile.eFieldType (method) — Returns the type of the field at the given field…
  OpenVdbFile.strFieldType (method) — Returns the field type at the given index as string
  OpenVdbFile.xField (method)
  OpenVdbFile.bIsPicoGKCompatible (method)
  OpenVdbFile.fPicoGKVoxelSizeMM (method)
  OpenVdbFile._hCreate (method)
  OpenVdbFile.Dispose (method)
PicoGKAllocException (class) [1 members]
  PicoGKAllocException.PicoGKAllocException (constructor)
PicoGKLibraryMismatchException (class) [1 members]
  PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor)
PolyContour (class) [14 members]
  PolyContour.EWinding (enum)
  PolyContour.strWindingAsString (method)
  PolyContour.eDetectWinding (method)
  PolyContour.PolyContour (constructor)
  PolyContour.AddVertex (method)
  PolyContour.DetectWinding (method)
  PolyContour.eWinding (method)
  PolyContour.oVertices (method)
  PolyContour.Close (method) — Makes sure that the last coordinate is identical to the…
  PolyContour.AsSvgPolyline (method)
  PolyContour.AsSvgPath (method)
  PolyContour.oBBox (method)
  PolyContour.nCount (method)
  PolyContour.vecVertex (method)
PolyHandle (struct) [2 members]
  PolyHandle.Value (property)
  PolyHandle.PolyHandle (constructor)
PolyLine (class) [12 members] — A colored 3D polyline for use in the viewer
  PolyLine.lib (field)
  PolyLine.PolyLine (constructor) — Creates a new empty PolyLine, using the global library instance
  PolyLine.nAddVertex (method) — Add a vertex to the polyline
  PolyLine.Add (method) — Adds all vertices from a container
  PolyLine.nVertexCount (method) — Return number of vertices in the PolyLine
  PolyLine.vecVertexAt (method) — Get the vertex in the polyline at the specified vertex…
  PolyLine.GetColor (method) — Return the color of the PolyLine
  PolyLine.oBoundingBox (method) — Return BoundingBox of PolyLine
  PolyLine.AddArrow (method) — Adds an arrow to the tip of the current polyline…
  PolyLine.AddCross (method) — Add a cross at the end of a polyline
  PolyLine._hCreate (method)
  PolyLine.Dispose (method)
PolySlice (class) [10 members]
  PolySlice.PolySlice (constructor)
  PolySlice.AddContour (method)
  PolySlice.bIsEmpty (method)
  PolySlice.Close (method)
  PolySlice.SaveToSvgFile (method)
  PolySlice.oFromSdf (method)
  PolySlice.fZPos (method)
  PolySlice.oBBox (method)
  PolySlice.nContours (method)
  PolySlice.oContourAt (method)
PolySliceStack (class) [6 members]
  PolySliceStack.PolySliceStack (constructor)
  PolySliceStack.AddSlices (method)
  PolySliceStack.AddToViewer (method)
  PolySliceStack.nCount (method)
  PolySliceStack.oSliceAt (method)
  PolySliceStack.oBBox (method)
ProgressCounter (class) [3 members] — A progress counting class for counting up items to 100%
  ProgressCounter.ProgressCounter (constructor) — Create a new progress counter object
  ProgressCounter.SetItem (method) — Set the item (nItemCount == 100%)
  ProgressCounter.op_Increment (method) — Allow you to use ++ to count up to the…
ProgressNoop (class) [1 members] — A progress reporting class that does nothing (can be used…
  ProgressNoop.Progress (method) — Progress from 0..1
QuadHandle (struct) [2 members]
  QuadHandle.Value (property)
  QuadHandle.QuadHandle (constructor)
SKHelpers (class) [2 members]
  SKHelpers.oAsSkColor (method)
  SKHelpers.clrAsColorRgba32 (method)
ScalarField (class) [17 members] — A field of scalar floating point values
  ScalarField.m_oMetadata (field) — Field metadata
  ScalarField.lib (field)
  ScalarField.oMetaData (method)
  ScalarField.ScalarField (constructor) — Create an empty scalar field object
  ScalarField.SetValue (method) — Sets the value at the specified position in mm When…
  ScalarField.bGetValue (method) — Get the value at the specified position If the specified…
  ScalarField.RemoveValue (method) — Removes the value at the specified position
  ScalarField.GetVoxelDimensions (method) — Returns the dimensions of the field in discrete voxels
  ScalarField.GetVoxelSlice (method) — Returns a signed distance-field-encoded slice of the voxel field To…
  ScalarField.TraverseActive (method) — Visit each active value in the vector field and call…
  ScalarField.fSignedDistance (method) — Return the scalar value at the specified position as as…
  ScalarField.oBoundingBox (method) — Returns the bounding box of all active voxels in mm…
  ScalarField._hCreate (method)
  ScalarField._hCreateCopy (method)
  ScalarField._hCreateFromVoxels (method)
  ScalarField._hBuildFromVoxels (method)
  ScalarField.Dispose (method)
ScalarFieldHandle (struct) [2 members]
  ScalarFieldHandle.Value (property)
  ScalarFieldHandle.ScalarFieldHandle (constructor)
SdfVisualizer (class) [3 members]
  SdfVisualizer.imgEncodeFromSdf (method) — Create a color image which encodes the signed distance values…
  SdfVisualizer.bDoesSliceContainDefect (method) — Checks if the scalar field slice contains a defective voxel
  SdfVisualizer.bVisualizeSdfSlicesAsTgaStack (method) — Saves a stack of TGA files, visualizing the signed distance…
SliceViz (class) [4 members]
  SliceViz.nSliceCount (property) — The number of slices in this voxel field
  SliceViz.SliceViz (constructor)
  SliceViz.Visualize (method) — Visualize the slice in the viewer using a normalized parameter…
  SliceViz.Dispose (method) — Dispose the object (IDispose)
SplitProgress (class) [3 members] — This class allows you to split progress reporting into multiple…
  SplitProgress.SplitProgress (constructor) — Create a new SplitProgress object
  SplitProgress.Progress (method) — Report progress from 0..1 - this function automatically scales the…
  SplitProgress.op_Increment (method) — Allow you to use ++ to count up to the…
SurfaceNormalFieldExtractor (class) [4 members]
  SurfaceNormalFieldExtractor.oExtract (method)
  SurfaceNormalFieldExtractor.SurfaceNormalFieldExtractor (constructor)
  SurfaceNormalFieldExtractor.Run (method)
  SurfaceNormalFieldExtractor.InformActiveValue (method)
Text (class) [2 members]
  Text.oDefaultTypeface (property)
  Text.imgRenderText (method)
TgaIo (class) [3 members]
  TgaIo.SaveTga (method)
  TgaIo.GetFileInfo (method)
  TgaIo.LoadTga (method)
Triangle (struct) [4 members]
  Triangle.A (field)
  Triangle.B (field)
  Triangle.C (field)
  Triangle.Triangle (constructor)

## PicoGK (3) — `api-picogk-3.md`

Utils (class) [12 members]
  Utils.TempFolder (class) — Creates a temporary folder with an arbitrary filename in the…
  Utils.mshCreateCube (method) — Helper function to create simple box mesh from a bounding…
  Utils.strStripQuotesFromPath (method) — Strip quotes of a quoted path like "/usr/lib/" -> /usr/lib/
  Utils.strStripExtension (method) — Strips the extension from a filename
  Utils.bWaitForFileExistence (method) — Wait for a file's creation
  Utils.strHomeFolder (method) — Returns the path to the home folder (cross platform compatible)
  Utils.strDocumentsFolder (method) — Returns the path to the documents folder (cross platform compatible)
  Utils.strProjectRootFolder (method) — Returns the path to the source folder of your project,…
  Utils.strPicoGKSourceCodeFolder (method) — Returns the path to the source folder of PicoGK, making…
  Utils.strExecutableFolder (method) — Returns the path in which your current executable resides
  Utils.strDateTimeFilename (method) — Returns a file name in the form 20230930_134500 to be…
  Utils.strShorten (method) — Shorted a string, IF it is too long
Vdb2Cli (class) [1 members] — Helper class to save a voxel field contained in a…
  Vdb2Cli.Convert (method) — Convert a voxel field to a CLI slice file
VdbHandle (struct) [2 members]
  VdbHandle.Value (property)
  VdbHandle.VdbHandle (constructor)
VdbMetaHandle (struct) [2 members]
  VdbMetaHandle.Value (property)
  VdbMetaHandle.VdbMetaHandle (constructor)
VectorField (class) [13 members] — A Field of 3D floating point vectors
  VectorField.m_oMetadata (field) — VectorField metadata
  VectorField.lib (field)
  VectorField.oMetaData (method)
  VectorField.VectorField (constructor) — Create an empty VectorField object
  VectorField.SetValue (method) — Sets the value at the specified position in mm When…
  VectorField.bGetValue (method) — Get the value at the specified position If the specified…
  VectorField.RemoveValue (method) — Removes the value at the specified position
  VectorField.TraverseActive (method) — Visit each active value in the vector field and call…
  VectorField._hCreate (method)
  VectorField._hCreateCopy (method)
  VectorField._hCreateFromVoxels (method)
  VectorField._hBuildFromVoxels (method)
  VectorField.Dispose (method)
VectorFieldHandle (struct) [2 members]
  VectorFieldHandle.Value (property)
  VectorFieldHandle.VectorFieldHandle (constructor)
VectorFieldMerge (class) [4 members]
  VectorFieldMerge.Merge (method)
  VectorFieldMerge.VectorFieldMerge (constructor)
  VectorFieldMerge.Run (method)
  VectorFieldMerge.InformActiveValue (method)
Viewer (class) [61 members] — PicoGK viewer
  Viewer.InfoCallback (type)
  Viewer.UpdateCallback (type)
  Viewer.KeyPressedCallback (type)
  Viewer.MouseMovedCallback (type)
  Viewer.MouseButtonCallback (type)
  Viewer.ScrollWheelCallback (type)
  Viewer.WindowSizelCallback (type)
  Viewer.GpuTex (class)
  Viewer.ImageQuad (class)
  Viewer.SideBar (class)
  Viewer.bIsHosted (property) — True when viewer operations are delegated to an embedding backend
  Viewer.qOrientation (property) — Access to the rotational component (orientation) of the viewer
  Viewer.qOrientationHome (field)
  Viewer.qOrientationTop (field)
  Viewer.qOrientationBottom (field)
  Viewer.qOrientationFront (field)
  Viewer.qOrientationLeft (field)
  Viewer.qOrientationBack (field)
  Viewer.qOrientationRight (field)
  Viewer.IViewerAction (interface) — An abstract interface for viewer actions
  Viewer.AnimGroupMatrixRotate (class)
  Viewer.AnimViewRotate (class) — Animate view rotation
  Viewer.Camera (class) — Abstract camera class to interact with the view
  Viewer.CamPerspectiveArcball (class)
  Viewer.IKeyHandler (interface)
  Viewer.EKeys (enum)
  Viewer.KeyAction (class)
  Viewer.KeyHandler (class)
  Viewer._hCreate (method)
  Viewer.Dispose (method)
  Viewer.Viewer (constructor) — Initialize a hosted Viewer that delegates display operations without creating…
  Viewer.bPoll (method) — Run this function in your main thread while it returns…
  Viewer.RequestUpdate (method) — Request a refresh of the viewer
  Viewer.LoadLightSetup (method) — Load the IBL light setup from the specified ZIP file
  Viewer.Add (method) — Add the object to the viewer, using the specified viewer…
  Viewer.Remove (method) — Removes the object from the viewer
  Viewer.SetObjectMatrix (method) — Set the transformation matrix for the specified object
  Viewer.RemoveAllObjects (method) — Remove all objects from the viewer
  Viewer.RequestScreenShot (method) — Request screenshot (TGA), which will be saved to the the…
  Viewer.EnableExperimental (method) — Enable/disable experimental rendering features
  Viewer.SetGroupVisible (method) — Enable or disable the display of a viewer group
  Viewer.SetGroupMaterial (method) — Set the material for this viewer group
  Viewer.SetGroupMatrix (method) — Set the group's transformation matrix
  Viewer.EnableOverhangWarning (method) — Enables overhang severity visualization for the specified viewer group
  Viewer.DisableOverhangWarning (method) — Disables the overhang angle warning of the specified group
  Viewer.oBBox (method) — Returns the bounding box of all elements inside the view
  Viewer.SetBackgroundColor (method) — Sets the background color of the viewer
  Viewer.ZoomToFit (method) — Zoom to fit the contents of the viewer
  Viewer.SetFov (method) — Set Vertical Field of View in radians (i.e
  Viewer.bIsIdle (method) — Allows you to query if all viewer actions are complete
  Viewer.AddAnimation (method)
  Viewer.RemoveAllAnimations (method)
  Viewer.AddKeyHandler (method)
  Viewer.StartTimeLapse (method)
  Viewer.PauseTimeLapse (method)
  Viewer.ResumeTimeLapse (method)
  Viewer.StopTimeLapse (method)
  Viewer.AddCross (method) — Marks the supplied coordinate with a cross-shaped polyline
  Viewer.AddArrow (method) — Adds an line ending in an arrow to the viewer
  Viewer.oCreateSideBarLeft (method)
  Viewer.oCreateSideBarRight (method)
VoxCutViz (class) [4 members] — Visualizes the result of a voxel filed cut along an…
  VoxCutViz.nSliceCount (property) — Number of slices in the voxel field
  VoxCutViz.VoxCutViz (constructor) — Initializes a new VoxCutViz object with the specified Viewer and…
  VoxCutViz.Cut (method) — Cut the voxel field along the two normalized values (0…
  VoxCutViz.Dispose (method) — Call to stop the visualization (or let the object go…
VoxHandle (struct) [2 members]
  VoxHandle.Value (property)
  VoxHandle.VoxHandle (constructor)

## PicoGK (4) — `api-picogk-4.md`

Voxels (class) [71 members]
  Voxels.fVoxelSize (property) — Returns the voxel size in millimeters used in the voxel…
  Voxels.ESliceMode (enum)
  Voxels.ESliceAxis (enum)
  Voxels.m_oMetadata (field)
  Voxels.lib (field)
  Voxels.oMetaData (method)
  Voxels.Voxels (constructor) — Create a new empty voxels object, using the global library…
  Voxels.voxSphere (method) — Create a new Voxels object using the global library instance,…
  Voxels.voxLatticeBeam (method) — Returns a lattice beam with hemispherical ends internally uses an…
  Voxels.voxMeshShell (method) — Creates a shelled (hollow) Voxels object from a mesh
  Voxels.voxCombineAll (method) — Create a new Voxels object using the global library instance,…
  Voxels.voxFromVdbFile (method) — Create Voxels from a OpenVDB file (.vdb) using the global…
  Voxels.voxDuplicate (method) — Create a duplicate of the current voxel field
  Voxels.mshAsMesh (method) — Return the current voxel field as a mesh
  Voxels.bIsEmpty (method) — Checks whether this Voxels object is empty, i.e
  Voxels.nMemUsage (method) — Returns the amount of memory in bytes used by this…
  Voxels.BoolAdd (method) — Performs a boolean union between two voxel fields Our voxelfield…
  Voxels.voxBoolAdd (method) — Performs a boolean union operation on a copy of the…
  Voxels.BoolAddAll (method) — Performs a boolean union of all voxels supplied in the…
  Voxels.voxBoolAddAll (method) — Performs a boolean union of all voxels supplied in the…
  Voxels.voxCombine (method) — Combines two voxel fields and returns the result using BoolAdd
  Voxels.BoolSubtract (method) — Performs a boolean difference between the two voxel fields Our…
  Voxels.voxBoolSubtract (method) — Performs a boolean difference operation on a copy of the…
  Voxels.BoolSubtractAll (method) — Subtracts on all voxels supplied in the container (List, Array,…
  Voxels.voxBoolSubtractAll (method) — Subtracts on all voxels supplied in the container (List, Array,…
  Voxels.BoolIntersect (method) — Performs a boolean intersection between two voxel fields
  Voxels.voxBoolIntersect (method) — Performs a boolean intersection operation on a copy of the…
  Voxels.op_Addition (method) — Overloaded operators allow you to do things like vox =…
  Voxels.op_Subtraction (method) — Overloaded operators allow you to do things like vox =…
  Voxels.op_BitwiseAnd (method) — Overloaded operator for intersect (boolean AND) vox = vox1 &…
  Voxels.Trim (method) — Intersects the voxel field with the specified bounding box so…
  Voxels.voxTrim (method) — Intersects a copy of the voxel field with the specified…
  Voxels.Offset (method) — Offsets the voxel field by the specified distance
  Voxels.voxOffset (method) — Offsets a copy of the voxel field by the specified…
  Voxels.DoubleOffset (method) — Offsets the voxel field twice, by the specified distances Outwards…
  Voxels.voxDoubleOffset (method) — Offsets a copy of the voxel field twice, by the…
  Voxels.TripleOffset (method) — Offsets the voxel field three times by the specified distance
  Voxels.voxTripleOffset (method) — Offsets a copy of the voxel field three times by…
  Voxels.Smoothen (method) — Same as TripleOffset
  Voxels.voxSmoothen (method) — Same as TripleOffset
  Voxels.OverOffset (method) — Similar to DoubleOffset, but allows you to specify the offsetted…
  Voxels.voxOverOffset (method) — Similar to DoubleOffset, but allows you to specify the offsetted…
  Voxels.Fillet (method) — Creates a fillet-like effect
  Voxels.voxFillet (method) — Creates a fillet-like effect
  Voxels.voxShell (method) — Creates a shell of a voxel field
  Voxels.RenderMesh (method) — Renders a mesh into the voxel field, combining it with…
  Voxels.RenderImplicit (method) — Render an implicit signed distance function into the voxels overwriting…
  Voxels.IntersectImplicit (method) — Render an implicit signed distance function into the voxels but…
  Voxels.voxIntersectImplicit (method) — Same as IntersectImplicit, but uses a copy of the current…
  Voxels.RenderLattice (method) — Renders a lattice into the voxel field, combining it with…
  Voxels.ProjectZSlice (method) — Projects the slices at the start Z position upwards or…
  Voxels.voxProjectZSlice (method) — Makes a copy of the voxel field and applies the…
  Voxels.bIsEqual (method) — Returns true if the voxel fields contain the same content
  Voxels.CalculateProperties (method) — This function evaluates the entire voxel field and returns the…
  Voxels.oCalculateBoundingBox (method) — Calculates the bounding box of a voxel field Note
  Voxels.bIsInside (method) — Returns whether the location specified lies inside the solid domain…
  Voxels.vecSurfaceNormal (method) — Returns the normal of the surface found at the specified…
  Voxels.bClosestPointOnSurface (method) — Returns the closest point from the search point on the…
  Voxels.vecClosestPointOnSurface (method) — Returns the closest point from the search point on the…
  Voxels.bRayCastToSurface (method) — Casts a ray to the surface of a voxel field…
  Voxels.vecRayCastToSurface (method) — Casts a ray to the surface of a voxel field…
  Voxels.GetVoxelDimensions (method) — Returns the dimensions of the voxel field in discrete voxels
  Voxels.vecZSliceOrigin (method) — Query the real world origin of a voxel slice, which…
  Voxels.nSliceCount (method) — Return the number of slices in this voxel field
  Voxels.imgAllocateSlice (method) — Allocate a grayscale image that can hold a voxel slice
  Voxels.GetVoxelSlice (method) — Returns a slice of the voxel field along the specified…
  Voxels.GetInterpolatedVoxelSlice (method) — Returns a signed distance-field-encoded slice of the voxel field To…
  Voxels.oVectorize (method) — Vectorize a Voxels object using Marching Squares
  Voxels.SaveToCliFile (method) — Save the voxel field to a .cli file CLI is…
  Voxels.SaveToVdbFile (method) — Creates a new .vdb file and saves the voxel field…
  Voxels.Dispose (method)

## PicoGK.Diagnostics — `api-picogk-diagnostics.md`

TestCliOutput (class) [1 members]
  TestCliOutput.Run (method) — Test function, generates a unique voxel object and tests vectorization…
TestProgress (class) [1 members]
  TestProgress.Test (method)
TestVectorAndComparison (class) [1 members]
  TestVectorAndComparison.Test (method)

## PicoGK.Numerics — `api-picogk-numerics.md`

ComparisonExtensions (class) [4 members] — Extensions that allow for fuzzy comparisons of types
  ComparisonExtensions.bAlmostEqual (method) — Fuzzy comparison function to determine equality between two floats Can…
  ComparisonExtensions.bAlmostLessOrEqual (method)
  ComparisonExtensions.bAlmostMoreOrEqual (method)
  ComparisonExtensions.bAlmostZero (method) — Fuzzy test for zero
Cylindrical (struct) [7 members] — A coordinate in a cylindrical coordinate system
  Cylindrical.R (field) — Distance from the cylinder's axis
  Cylindrical.Phi (field) — Azimuth angle in the XY plane
  Cylindrical.Z (field) — Position along the Z axis
  Cylindrical.Cylindrical (constructor) — Initialize a new cylindrical coordinate
  Cylindrical.vecAsCartesian (method) — Convert a cylindrical coordinate into a cartesian coordinate
  Cylindrical.oLerp (method) — Linear interpolation between two Cylindrical coordinates (in Cylindrical coordinate space)
  Cylindrical.ToString (method) — Convert the cylindrical coordinate to a string
FloatExt (class) [1 members]
  FloatExt.bIsFinite (method) — Checks whether the value is finite, i.e
Overhang (struct) [23 members]
  Overhang.uNone (property) — No overhang (0%)
  Overhang.uFull (property) — Maximum overhang (100%)
  Overhang.fNormalized (property) — Normalized overhang severity from 0..1 - 0.0
  Overhang.fPercent (property) — Normalized overhang severity from 0..100% - 0
  Overhang.fRad (property) — Overhang angle in radians - 0
  Overhang.fDeg (property) — Overhang angle in degrees - 0
  Overhang.fDegFromHorizontal (property) — Overhang angle in degrees, measured from the horizontal plane Used…
  Overhang.uFromNormalized (method) — Create a new Overhang, using normalized overhang severity from 0..1…
  Overhang.uFromPercent (method) — Create a new Overhang, based on percent value (0..100) -…
  Overhang.uFromRad (method) — Create a new Overhang, based on radians value (0..Pi/2) -…
  Overhang.uFromDeg (method) — Create a new Overhang, based on degrees value (0..90) -…
  Overhang.uFromDegFromHorizontal (method) — Create a new Overhang from an angle in degrees, measured…
  Overhang.bExceeds (method) — Allows you to write something like uOverhang.bExceeds(Overhang.uFromPercent(50)) You can also…
  Overhang.ToString (method)
  Overhang.CompareTo (method)
  Overhang.Equals (method)
  Overhang.GetHashCode (method)
  Overhang.op_LessThan (method)
  Overhang.op_GreaterThan (method)
  Overhang.op_LessThanOrEqual (method)
  Overhang.op_GreaterThanOrEqual (method)
  Overhang.op_Equality (method)
  Overhang.op_Inequality (method)
Polar (struct) [6 members] — A polar coordinate
  Polar.R (field) — Distance from the center of the coordinate system
  Polar.Phi (field) — Azimuth angle in the XY plane
  Polar.Polar (constructor) — Initialize a new polar coordinate
  Polar.vecAsCartesian (method) — Return the polar coordinate as a cartesian coordinate
  Polar.oLerp (method) — Linear interpolation between two polar coordinates (in Polar coordinate space)
  Polar.ToString (method) — Convert the polar coordinate to a string
Rad (struct) [48 members] — This type encapsulates an angle in Radians, with helper functions…
  Rad.TwoPi (constant) — Defines 2*Pi, which is constantly being used in Rad angles
  Rad.Zero (field) — Zero degrees angles
  Rad.Full (field) — 360º angle
  Rad.Half (field) — 180º angle
  Rad.Quarter (field) — 90º angle
  Rad.Deg0 (field) — 0º angle
  Rad.Deg360 (field) — 360º angle
  Rad.Deg180 (field) — 180º angle
  Rad.Deg90 (field) — 90º angle
  Rad.Deg45 (field) — 45º angle
  Rad.fRad (property) — float value of the angle in radians
  Rad.fDeg (property) — angle in degrees
  Rad.Rad (constructor) — Initialize a new Rad value from a float radians angle
  Rad.rFromRad (method) — Create new Rad value from a float radians angle
  Rad.rFromDeg (method) — Create a new Rad value from a floating point angle…
  Rad.rFromNormalized (method) — Create a new Rad value from a normalized value 0..1,…
  Rad.rNormalizedSigned (method) — Return the angle normalized to the range -π .
  Rad.rNormalizedPositive (method) — Return the angle normalized to the range [0, 2π)
  Rad.op_Implicit (method) — Implicit conversion from a Rad value into float for seamless…
  Rad.op_Explicit (method) — Explicit conversion from float to Rad value
  Rad.bAlmostEqual (method) — Test for fuzzy equality
  Rad.bAlmostEqualPeriodic (method) — Tests for fuzzy equality of the normalized angle (0º ==…
  Rad.bIsFinite (method) — Checks whether the angle value is finite, i.e
  Rad.fSin (method) — Returns the sine of the angle
  Rad.fCos (method) — Returns the cosine of the angle
  Rad.fTan (method) — Returns the tangent of the angle
  Rad.rAtan2 (method) — Computes the angle of the vector from the positive X…
  Rad.rAtan (method) — Computes the arc tangent of the value
  Rad.rAcos (method) — Returns the arc cosine of the value and returns the…
  Rad.rAcosClamped (method) — Returns the arc cosine of the value after clamping it…
  Rad.rAsin (method) — Returns the arc sine of the value and returns the…
  Rad.rAsinClamped (method) — Returns the arc cosine of the value after clamping it…
  Rad.op_Addition (method)
  Rad.op_Subtraction (method)
  Rad.op_Multiply (method)
  Rad.op_Division (method)
  Rad.op_UnaryPlus (method)
  Rad.op_UnaryNegation (method)
  Rad.ToString (method)
  Rad.CompareTo (method)
  Rad.Equals (method)
  Rad.GetHashCode (method)
  Rad.op_LessThan (method)
  Rad.op_GreaterThan (method)
  Rad.op_LessThanOrEqual (method)
  Rad.op_GreaterThanOrEqual (method)
  Rad.op_Equality (method)
  Rad.op_Inequality (method)
Spherical (struct) [7 members]
  Spherical.R (field) — Distance from the sphere center
  Spherical.Phi (field) — Azimuth angle in the XY plane, measured from +X toward…
  Spherical.Theta (field) — Polar angle measured from +Z toward the XY plane and…
  Spherical.Spherical (constructor) — Initializes a new Spherical coordinate
  Spherical.vecAsCartesian (method) — Convert the spherical coordinate to a cartesian coordinate
  Spherical.oLerp (method) — Linear interpolation between two Spherical coordinates (in Spherical coordinate space)
  Spherical.ToString (method) — Convert the spherical coordinate to a string
Tolerances (class) [4 members] — Default tolerances for comparisons
  Tolerances.fDef (constant) — Default tolerance for fuzzy comparisons
  Tolerances.fDefSquared (constant) — Default squared tolerance for fuzzy comparisons
  Tolerances.fZero (constant) — Default number regarded as zero for fuzzy zero check Chosen…
  Tolerances.fZeroSquared (constant) — Default squared number regarded as zero for fuzzy zero check
VectorExt (class) [11 members] — Extensions to the Vector2 and Vector3 System.Numerics types
  VectorExt.vecNormalized (method) — Returns the normalized version of this vector (length 1) Can…
  VectorExt.vecSafeNormalized (method) — Returns the normalized version of this vector (length 1) Returns…
  VectorExt.vecStripZ (method) — Converts a Vector3 into a Vector2 by stripping the Z…
  VectorExt.vecAsVector3 (method) — Converts a Vector2 into a Vector3 by adding a Z…
  VectorExt.vecPtWorld (method) — Helper function to convert a point to world coordinates using…
  VectorExt.vecDirWorld (method) — Helper function to convert a direction to world coordinates using…
  VectorExt.vecPtLocal (method) — Helper function to convert a point to local coordinates using…
  VectorExt.vecDirLocal (method) — Helper function to convert a direction to local coordinates using…
  VectorExt.vecTransformed (method) — Returns a matrix-transformed version of the vector
  VectorExt.vecMirrored (method) — Returns a mirrored version of the vector
  VectorExt.bIsFinite (method) — Checks whether all vector coordinate values are finite, i.e

## PicoGK.Shapes — `api-picogk-shapes.md`

Arc2d (struct) [8 members] — A circular arc in 2D space
  Arc2d.vecStart (property) — Start coordinate
  Arc2d.vecEnd (property) — End coordinate
  Arc2d.vecCenter (property) — Center point
  Arc2d.rAngle (property) — Angle in radians (positive is counter clockwise)
  Arc2d.fRadius (property) — Radius of the arc
  Arc2d.fLength (property)
  Arc2d.Arc2d (constructor) — Construct a new 2D arc with the specified start point,…
  Arc2d.vecPtAtT (method)
Circle (struct) [5 members] — Class to represent an circle as a normalized path/contour
  Circle.fR (property) — Radius of the circle
  Circle.fLength (property)
  Circle.Circle (constructor) — Create a Circle contour with radius fR
  Circle.vecPtAtT (method)
  Circle.PtAtT (method)
ContourFromPath (class) [4 members] — This class allows you to use a closed path as…
  ContourFromPath.fLength (property)
  ContourFromPath.ContourFromPath (constructor) — Create a IContour2d-compatible contour from an existing closed path The…
  ContourFromPath.vecPtAtT (method)
  ContourFromPath.vecPtAtTLinear (method)
ContourSampler2d (class) [4 members] — Implements a way to adaptively sample a contour to retrieve…
  ContourSampler2d.ISampleable (interface) — This interface enables a contour to be sampled in linear…
  ContourSampler2d.fTotalLength (property) — Return sum of all arc segement lengths
  ContourSampler2d.ContourSampler2d (constructor) — Adaptively sample the contour to map the linear time to…
  ContourSampler2d.fArcTFromLinearT (method) — Convert from linear t to arc-length t
Ellipse (class) [8 members] — Class to represent an ellipse as a normalized path/contour
  Ellipse.fPhi (property) — Rotation angle of the ellipse
  Ellipse.rPhi (property) — Rotation angle of the ellipse
  Ellipse.fA (property) — Half-length of the ellipse in A
  Ellipse.fB (property) — Half-length of the ellipse in B
  Ellipse.fLength (property)
  Ellipse.Ellipse (constructor) — Constructor using axis A vector and axis B length
  Ellipse.vecPtAtTLinear (method)
  Ellipse.vecPtAtT (method)
Frame3d (struct) [32 members] — The Frame3d object stores a local coordinate system, i.e
  Frame3d.frmWorld (field) — Local frame representing the world coordinate system
  Frame3d.vecPos (property) — Position of the origin of the Frame3d
  Frame3d.vecLx (property) — Direction of the local X axis in world coordinates
  Frame3d.vecLy (property) — Direction of the local Y axis in world coordinates
  Frame3d.vecLz (property) — Direction of the local Z axis in world coordinates
  Frame3d.frmFromPos (method) — Create a Frame3d at the specified position with axes aligned…
  Frame3d.frmFromZX (method) — Create a Frame3d at the specified position with local axes…
  Frame3d.Frame3d (constructor) — Creates a local coordinate system with world-aligned axes at the…
  Frame3d.frmFromMatrix4x4 (method) — Creates a Frame3d from a System.Numerics row-vector rigid transform
  Frame3d.vecPtToWorld (method) — Convert a local coordinate to world coordinates
  Frame3d.vecDirToWorld (method) — Convert a local direction to a world direction
  Frame3d.vecPtFromWorld (method) — Return local coordinate from world coordinates
  Frame3d.vecDirFromWorld (method) — Return local direction from world direction
  Frame3d.frmCompose (method) — Create a combined Frame3d from this frame and another
  Frame3d.frmInverse (method) — Create an inverted Frame3d object
  Frame3d.frmMovedLocal (method) — Move the origin of the Frame3d object by the specified…
  Frame3d.frmMovedLocalX (method) — Move the Frame3d origin by the specified distance in X…
  Frame3d.frmMovedLocalY (method) — Move the Frame3d origin by the specified distance in Y…
  Frame3d.frmMovedLocalZ (method) — Move the Frame3d origin by the specified distance in Z…
  Frame3d.frmRotatedWorld (method) — Rotate the Frame3d around an arbitrary (world-space) axis through the…
  Frame3d.frmMovedWorld (method) — Move the origin of the Frame3d object by the specified…
  Frame3d.frmMovedWorldX (method) — Move the Frame3d origin by the specified distance in X…
  Frame3d.frmMovedWorldY (method) — Move the Frame3d origin by the specified distance in Y…
  Frame3d.frmMovedWorldZ (method) — Move the Frame3d origin by the specified distance in Z…
  Frame3d.matAsMatrix4x4 (method) — Convert the Frame3d transformation to an equivalent Matrix4x4 transform (basis…
  Frame3d.frmRepositioned (method) — Return a frame which has been repositioned to the supplied…
  Frame3d.AsRigid (method) — Return the transformation as Quaternion plus Origin
  Frame3d.matComposeWithScale (method) — Helper function to drawing a scaled quad aligned to this…
  Frame3d.op_Multiply (method) — Convert local point to a world coordinate (same as vecToWorld)…
  Frame3d.frmInterpolate (method) — Interpolate between two Frame3d pos/orientations
  Frame3d.Equals (method) — Test for equality (IEquatable)
  Frame3d.GetHashCode (method) — Create hash code (IEquatable)
IContour2d (interface) [2 members] — Interface to represent a normalized closed contour in 2D which…
  IContour2d.PtAtT (method) — Function to return both point and normal at t
  IContour2d.vecSampleNormalAt (method) — Sample the normal at fT Helper function used by PtAtT
IContour3d (interface) [1 members] — A two dimensional closed contour aligned in a plane in…
  IContour3d.PtAtT (method) — Returns the point and normal at position t (0..1) As…
IPath2d (interface) [2 members] — Interface to represent a normalized path in 2D space which…
  IPath2d.fLength (property) — Length of the entire contour
  IPath2d.vecPtAtT (method) — Returns the point at position t (0..1) As t increases…
IPath3d (interface) [2 members] — Interface to represent a normalized path in 2D space which…
  IPath3d.fLength (property) — Length of the entire contour
  IPath3d.vecPtAtT (method) — Returns the point at position t (0..1) As t increases…
Line2d (struct) [5 members] — A 2d line
  Line2d.vecA (property) — Start coordinate
  Line2d.vecB (property) — End coordinate
  Line2d.fLength (property)
  Line2d.Line2d (constructor) — Construct a line with the specified start and end coordinates
  Line2d.vecPtAtT (method)
OrientedContour (class) [4 members] — Represents an oriented 2D contour placed in 3D space by…
  OrientedContour.fLength (property)
  OrientedContour.OrientedContour (constructor) — Create an oriented contour from a 2D contour and a…
  OrientedContour.vecPtAtT (method)
  OrientedContour.PtAtT (method)
OrientedPath (class) [3 members] — Interface to represent a normalized 2D path oriented in space…
  OrientedPath.fLength (property)
  OrientedPath.OrientedPath (constructor)
  OrientedPath.vecPtAtT (method)
Path2d (class) [7 members] — A compound path which consists of a list of other…
  Path2d.fLength (property)
  Path2d.Add (method) — Add another path to the compound path Note, the start…
  Path2d.AddLine (method) — Append a line to the specified coordinate
  Path2d.AddLineRel (method) — Append a line relative to current end point
  Path2d.AddArc (method) — Append an arc with the specified center and angle The…
  Path2d.AddArcRel (method) — Add an arc with the specified center, relative to the…
  Path2d.vecPtAtT (method)
Supershape (class) [5 members] — Implements the supershape formula for interesting 2D contours
  Supershape.fLength (property)
  Supershape.oRoundedPolygon (method) — Helper function to create simple rounded polygons based on the…
  Supershape.Supershape (constructor) — Constructor for a supershape with superformula parameters and rotation
  Supershape.vecPtAtT (method)
  Supershape.vecPtAtTLinear (method)

## System — `api-system.md`

Array (class) [41 members]
  Array.Length (property)
  Array.LongLength (property)
  Array.Rank (property)
  Array.SyncRoot (property)
  Array.IsReadOnly (property)
  Array.IsFixedSize (property)
  Array.IsSynchronized (property)
  Array.MaxLength (property)
  Array.Initialize (method)
  Array.AsReadOnly (method)
  Array.Resize (method)
  Array.CreateInstance (method)
  Array.CreateInstanceFromArrayType (method)
  Array.Copy (method)
  Array.ConstrainedCopy (method)
  Array.Clear (method)
  Array.GetLength (method)
  Array.GetUpperBound (method)
  Array.GetLowerBound (method)
  Array.GetValue (method)
  Array.SetValue (method)
  Array.GetLongLength (method)
  Array.Clone (method)
  Array.BinarySearch (method)
  Array.ConvertAll (method)
  Array.CopyTo (method)
  Array.Empty (method)
  Array.Exists (method)
  Array.Fill (method)
  Array.Find (method)
  Array.FindAll (method)
  Array.FindIndex (method)
  Array.FindLast (method)
  Array.FindLastIndex (method)
  Array.ForEach (method)
  Array.IndexOf (method)
  Array.LastIndexOf (method)
  Array.Reverse (method)
  Array.Sort (method)
  Array.TrueForAll (method)
  Array.GetEnumerator (method)
Console (class) [47 members]
  Console.In (property)
  Console.InputEncoding (property)
  Console.OutputEncoding (property)
  Console.KeyAvailable (property)
  Console.Out (property)
  Console.Error (property)
  Console.IsInputRedirected (property)
  Console.IsOutputRedirected (property)
  Console.IsErrorRedirected (property)
  Console.CursorSize (property)
  Console.NumberLock (property)
  Console.CapsLock (property)
  Console.BackgroundColor (property)
  Console.ForegroundColor (property)
  Console.BufferWidth (property)
  Console.BufferHeight (property)
  Console.WindowLeft (property)
  Console.WindowTop (property)
  Console.WindowWidth (property)
  Console.WindowHeight (property)
  Console.LargestWindowWidth (property)
  Console.LargestWindowHeight (property)
  Console.CursorVisible (property)
  Console.CursorLeft (property)
  Console.CursorTop (property)
  Console.Title (property)
  Console.TreatControlCAsInput (property)
  Console.ReadKey (method)
  Console.ResetColor (method)
  Console.SetBufferSize (method)
  Console.SetWindowPosition (method)
  Console.SetWindowSize (method)
  Console.GetCursorPosition (method)
  Console.Beep (method)
  Console.MoveBufferArea (method)
  Console.Clear (method)
  Console.SetCursorPosition (method)
  Console.OpenStandardInput (method)
  Console.OpenStandardOutput (method)
  Console.OpenStandardError (method)
  Console.SetIn (method)
  Console.SetOut (method)
  Console.SetError (method)
  Console.Read (method)
  Console.ReadLine (method)
  Console.WriteLine (method)
  Console.Write (method)
Convert (class) [31 members]
  Convert.DBNull (field)
  Convert.GetTypeCode (method)
  Convert.IsDBNull (method)
  Convert.ChangeType (method)
  Convert.ToBoolean (method)
  Convert.ToChar (method)
  Convert.ToSByte (method)
  Convert.ToByte (method)
  Convert.ToInt16 (method)
  Convert.ToUInt16 (method)
  Convert.ToInt32 (method)
  Convert.ToUInt32 (method)
  Convert.ToInt64 (method)
  Convert.ToUInt64 (method)
  Convert.ToSingle (method)
  Convert.ToDouble (method)
  Convert.ToDecimal (method)
  Convert.ToDateTime (method)
  Convert.ToString (method)
  Convert.ToBase64String (method)
  Convert.ToBase64CharArray (method)
  Convert.TryToBase64Chars (method)
  Convert.FromBase64String (method)
  Convert.TryFromBase64String (method)
  Convert.TryFromBase64Chars (method)
  Convert.FromBase64CharArray (method)
  Convert.FromHexString (method)
  Convert.ToHexString (method)
  Convert.TryToHexString (method)
  Convert.ToHexStringLower (method)
  Convert.TryToHexStringLower (method)

## System (2) — `api-system-2.md`

Math (class) [46 members]
  Math.E (constant)
  Math.PI (constant)
  Math.Tau (constant)
  Math.Acos (method)
  Math.Acosh (method)
  Math.Asin (method)
  Math.Asinh (method)
  Math.Atan (method)
  Math.Atanh (method)
  Math.Atan2 (method)
  Math.Cbrt (method)
  Math.Ceiling (method)
  Math.Cos (method)
  Math.Cosh (method)
  Math.Exp (method)
  Math.Floor (method)
  Math.FusedMultiplyAdd (method)
  Math.Log (method)
  Math.Log2 (method)
  Math.Log10 (method)
  Math.Pow (method)
  Math.Sin (method)
  Math.SinCos (method)
  Math.Sinh (method)
  Math.Sqrt (method)
  Math.Tan (method)
  Math.Tanh (method)
  Math.Abs (method)
  Math.BigMul (method)
  Math.BitDecrement (method)
  Math.BitIncrement (method)
  Math.CopySign (method)
  Math.DivRem (method)
  Math.Clamp (method)
  Math.IEEERemainder (method)
  Math.ILogB (method)
  Math.Max (method)
  Math.MaxMagnitude (method)
  Math.Min (method)
  Math.MinMagnitude (method)
  Math.ReciprocalEstimate (method)
  Math.ReciprocalSqrtEstimate (method)
  Math.Round (method)
  Math.Sign (method)
  Math.Truncate (method)
  Math.ScaleB (method)
MathF (class) [43 members]
  MathF.E (constant)
  MathF.PI (constant)
  MathF.Tau (constant)
  MathF.Acos (method)
  MathF.Acosh (method)
  MathF.Asin (method)
  MathF.Asinh (method)
  MathF.Atan (method)
  MathF.Atanh (method)
  MathF.Atan2 (method)
  MathF.Cbrt (method)
  MathF.Ceiling (method)
  MathF.Cos (method)
  MathF.Cosh (method)
  MathF.Exp (method)
  MathF.Floor (method)
  MathF.FusedMultiplyAdd (method)
  MathF.Log (method)
  MathF.Log2 (method)
  MathF.Log10 (method)
  MathF.Pow (method)
  MathF.Sin (method)
  MathF.SinCos (method)
  MathF.Sinh (method)
  MathF.Sqrt (method)
  MathF.Tan (method)
  MathF.Tanh (method)
  MathF.Abs (method)
  MathF.BitDecrement (method)
  MathF.BitIncrement (method)
  MathF.CopySign (method)
  MathF.IEEERemainder (method)
  MathF.ILogB (method)
  MathF.Max (method)
  MathF.MaxMagnitude (method)
  MathF.Min (method)
  MathF.MinMagnitude (method)
  MathF.ReciprocalEstimate (method)
  MathF.ReciprocalSqrtEstimate (method)
  MathF.Round (method)
  MathF.Sign (method)
  MathF.Truncate (method)
  MathF.ScaleB (method)
Random (class) [12 members]
  Random.Shared (property)
  Random.Random (constructor)
  Random.Next (method)
  Random.NextInt64 (method)
  Random.NextSingle (method)
  Random.NextDouble (method)
  Random.NextBytes (method)
  Random.GetItems (method)
  Random.Shuffle (method)
  Random.GetString (method)
  Random.GetHexString (method)
  Random.Sample (method)
String (class) [54 members]
  String.Empty (field)
  String.this[] (property)
  String.Length (property)
  String.Intern (method)
  String.IsInterned (method)
  String.Compare (method)
  String.CompareOrdinal (method)
  String.CompareTo (method)
  String.EndsWith (method)
  String.Equals (method)
  String.op_Equality (method)
  String.op_Inequality (method)
  String.GetHashCode (method)
  String.StartsWith (method)
  String.String (constructor)
  String.Create (method)
  String.op_Implicit (method)
  String.Clone (method)
  String.Copy (method)
  String.CopyTo (method)
  String.TryCopyTo (method)
  String.ToCharArray (method)
  String.IsNullOrEmpty (method)
  String.IsNullOrWhiteSpace (method)
  String.GetPinnableReference (method)
  String.ToString (method)
  String.GetEnumerator (method)
  String.EnumerateRunes (method)
  String.GetTypeCode (method)
  String.IsNormalized (method)
  String.Normalize (method)
  String.Concat (method)
  String.Format (method)
  String.Insert (method)
  String.Join (method)
  String.PadLeft (method)
  String.PadRight (method)
  String.Remove (method)
  String.Replace (method)
  String.ReplaceLineEndings (method)
  String.Split (method)
  String.Substring (method)
  String.ToLower (method)
  String.ToLowerInvariant (method)
  String.ToUpper (method)
  String.ToUpperInvariant (method)
  String.Trim (method)
  String.TrimStart (method)
  String.TrimEnd (method)
  String.Contains (method)
  String.IndexOf (method)
  String.IndexOfAny (method)
  String.LastIndexOf (method)
  String.LastIndexOfAny (method)

## System.Collections.Generic — `api-system-collections-generic.md`

Dictionary (class) [25 members]
  Dictionary.Comparer (property)
  Dictionary.Count (property)
  Dictionary.Capacity (property)
  Dictionary.Keys (property)
  Dictionary.Values (property)
  Dictionary.this[] (property)
  Dictionary.AlternateLookup (struct)
  Dictionary.Enumerator (struct)
  Dictionary.KeyCollection (class)
  Dictionary.ValueCollection (class)
  Dictionary.Dictionary (constructor)
  Dictionary.Add (method)
  Dictionary.Clear (method)
  Dictionary.ContainsKey (method)
  Dictionary.ContainsValue (method)
  Dictionary.GetEnumerator (method)
  Dictionary.GetObjectData (method)
  Dictionary.GetAlternateLookup (method)
  Dictionary.TryGetAlternateLookup (method)
  Dictionary.OnDeserialization (method)
  Dictionary.Remove (method)
  Dictionary.TryGetValue (method)
  Dictionary.TryAdd (method)
  Dictionary.EnsureCapacity (method)
  Dictionary.TrimExcess (method)
HashSet (class) [31 members]
  HashSet.Count (property)
  HashSet.Capacity (property)
  HashSet.Comparer (property)
  HashSet.AlternateLookup (struct)
  HashSet.Enumerator (struct)
  HashSet.HashSet (constructor)
  HashSet.Clear (method)
  HashSet.Contains (method)
  HashSet.Remove (method)
  HashSet.GetAlternateLookup (method)
  HashSet.TryGetAlternateLookup (method)
  HashSet.GetEnumerator (method)
  HashSet.GetObjectData (method)
  HashSet.OnDeserialization (method)
  HashSet.Add (method)
  HashSet.TryGetValue (method)
  HashSet.UnionWith (method)
  HashSet.IntersectWith (method)
  HashSet.ExceptWith (method)
  HashSet.SymmetricExceptWith (method)
  HashSet.IsSubsetOf (method)
  HashSet.IsProperSubsetOf (method)
  HashSet.IsSupersetOf (method)
  HashSet.IsProperSupersetOf (method)
  HashSet.Overlaps (method)
  HashSet.SetEquals (method)
  HashSet.CopyTo (method)
  HashSet.RemoveWhere (method)
  HashSet.EnsureCapacity (method)
  HashSet.TrimExcess (method)
  HashSet.CreateSetComparer (method)
List (class) [37 members]
  List.Capacity (property)
  List.Count (property)
  List.this[] (property)
  List.Enumerator (struct)
  List.List (constructor)
  List.Add (method)
  List.AddRange (method)
  List.AsReadOnly (method)
  List.BinarySearch (method)
  List.Clear (method)
  List.Contains (method)
  List.ConvertAll (method)
  List.CopyTo (method)
  List.EnsureCapacity (method)
  List.Exists (method)
  List.Find (method)
  List.FindAll (method)
  List.FindIndex (method)
  List.FindLast (method)
  List.FindLastIndex (method)
  List.ForEach (method)
  List.GetEnumerator (method)
  List.GetRange (method)
  List.Slice (method)
  List.IndexOf (method)
  List.Insert (method)
  List.InsertRange (method)
  List.LastIndexOf (method)
  List.Remove (method)
  List.RemoveAll (method)
  List.RemoveAt (method)
  List.RemoveRange (method)
  List.Reverse (method)
  List.Sort (method)
  List.ToArray (method)
  List.TrimExcess (method)
  List.TrueForAll (method)

## System.Numerics — `api-system-numerics.md`

Matrix3x2 (struct) [40 members]
  Matrix3x2.M11 (field)
  Matrix3x2.M12 (field)
  Matrix3x2.M21 (field)
  Matrix3x2.M22 (field)
  Matrix3x2.M31 (field)
  Matrix3x2.M32 (field)
  Matrix3x2.Identity (property)
  Matrix3x2.IsIdentity (property)
  Matrix3x2.Translation (property)
  Matrix3x2.X (property)
  Matrix3x2.Y (property)
  Matrix3x2.Z (property)
  Matrix3x2.this[] (property)
  Matrix3x2.this[] (property)
  Matrix3x2.Matrix3x2 (constructor)
  Matrix3x2.op_Addition (method)
  Matrix3x2.op_Equality (method)
  Matrix3x2.op_Inequality (method)
  Matrix3x2.op_Multiply (method)
  Matrix3x2.op_Subtraction (method)
  Matrix3x2.op_UnaryNegation (method)
  Matrix3x2.Add (method)
  Matrix3x2.Create (method)
  Matrix3x2.CreateRotation (method)
  Matrix3x2.CreateScale (method)
  Matrix3x2.CreateSkew (method)
  Matrix3x2.CreateTranslation (method)
  Matrix3x2.Invert (method)
  Matrix3x2.Lerp (method)
  Matrix3x2.Multiply (method)
  Matrix3x2.Negate (method)
  Matrix3x2.Subtract (method)
  Matrix3x2.Equals (method)
  Matrix3x2.GetDeterminant (method)
  Matrix3x2.GetElement (method)
  Matrix3x2.GetRow (method)
  Matrix3x2.GetHashCode (method)
  Matrix3x2.ToString (method)
  Matrix3x2.WithElement (method)
  Matrix3x2.WithRow (method)
Matrix4x4 (struct) [81 members]
  Matrix4x4.M11 (field)
  Matrix4x4.M12 (field)
  Matrix4x4.M13 (field)
  Matrix4x4.M14 (field)
  Matrix4x4.M21 (field)
  Matrix4x4.M22 (field)
  Matrix4x4.M23 (field)
  Matrix4x4.M24 (field)
  Matrix4x4.M31 (field)
  Matrix4x4.M32 (field)
  Matrix4x4.M33 (field)
  Matrix4x4.M34 (field)
  Matrix4x4.M41 (field)
  Matrix4x4.M42 (field)
  Matrix4x4.M43 (field)
  Matrix4x4.M44 (field)
  Matrix4x4.Identity (property)
  Matrix4x4.IsIdentity (property)
  Matrix4x4.Translation (property)
  Matrix4x4.X (property)
  Matrix4x4.Y (property)
  Matrix4x4.Z (property)
  Matrix4x4.W (property)
  Matrix4x4.this[] (property)
  Matrix4x4.this[] (property)
  Matrix4x4.Matrix4x4 (constructor)
  Matrix4x4.op_Addition (method)
  Matrix4x4.op_Equality (method)
  Matrix4x4.op_Inequality (method)
  Matrix4x4.op_Multiply (method)
  Matrix4x4.op_Subtraction (method)
  Matrix4x4.op_UnaryNegation (method)
  Matrix4x4.Add (method)
  Matrix4x4.Create (method)
  Matrix4x4.CreateBillboard (method)
  Matrix4x4.CreateBillboardLeftHanded (method)
  Matrix4x4.CreateConstrainedBillboard (method)
  Matrix4x4.CreateConstrainedBillboardLeftHanded (method)
  Matrix4x4.CreateFromAxisAngle (method)
  Matrix4x4.CreateFromQuaternion (method)
  Matrix4x4.CreateFromYawPitchRoll (method)
  Matrix4x4.CreateLookAt (method)
  Matrix4x4.CreateLookAtLeftHanded (method)
  Matrix4x4.CreateLookTo (method)
  Matrix4x4.CreateLookToLeftHanded (method)
  Matrix4x4.CreateOrthographic (method)
  Matrix4x4.CreateOrthographicLeftHanded (method)
  Matrix4x4.CreateOrthographicOffCenter (method)
  Matrix4x4.CreateOrthographicOffCenterLeftHanded (method)
  Matrix4x4.CreatePerspective (method)
  Matrix4x4.CreatePerspectiveLeftHanded (method)
  Matrix4x4.CreatePerspectiveFieldOfView (method)
  Matrix4x4.CreatePerspectiveFieldOfViewLeftHanded (method)
  Matrix4x4.CreatePerspectiveOffCenter (method)
  Matrix4x4.CreatePerspectiveOffCenterLeftHanded (method)
  Matrix4x4.CreateReflection (method)
  Matrix4x4.CreateRotationX (method)
  Matrix4x4.CreateRotationY (method)
  Matrix4x4.CreateRotationZ (method)
  Matrix4x4.CreateScale (method)
  Matrix4x4.CreateShadow (method)
  Matrix4x4.CreateTranslation (method)
  Matrix4x4.CreateViewport (method)
  Matrix4x4.CreateViewportLeftHanded (method)
  Matrix4x4.CreateWorld (method)
  Matrix4x4.Decompose (method)
  Matrix4x4.Invert (method)
  Matrix4x4.Lerp (method)
  Matrix4x4.Multiply (method)
  Matrix4x4.Negate (method)
  Matrix4x4.Subtract (method)
  Matrix4x4.Transform (method)
  Matrix4x4.Transpose (method)
  Matrix4x4.Equals (method)
  Matrix4x4.GetDeterminant (method)
  Matrix4x4.GetElement (method)
  Matrix4x4.GetRow (method)
  Matrix4x4.GetHashCode (method)
  Matrix4x4.ToString (method)
  Matrix4x4.WithElement (method)
  Matrix4x4.WithRow (method)
Plane (struct) [15 members]
  Plane.Normal (field)
  Plane.D (field)
  Plane.Plane (constructor)
  Plane.Create (method)
  Plane.CreateFromVertices (method)
  Plane.Dot (method)
  Plane.DotCoordinate (method)
  Plane.DotNormal (method)
  Plane.Normalize (method)
  Plane.Transform (method)
  Plane.op_Equality (method)
  Plane.op_Inequality (method)
  Plane.Equals (method)
  Plane.GetHashCode (method)
  Plane.ToString (method)
Quaternion (struct) [37 members]
  Quaternion.X (field)
  Quaternion.Y (field)
  Quaternion.Z (field)
  Quaternion.W (field)
  Quaternion.Zero (property)
  Quaternion.Identity (property)
  Quaternion.this[] (property)
  Quaternion.IsIdentity (property)
  Quaternion.Quaternion (constructor)
  Quaternion.op_Addition (method)
  Quaternion.op_Division (method)
  Quaternion.op_Equality (method)
  Quaternion.op_Inequality (method)
  Quaternion.op_Multiply (method)
  Quaternion.op_Subtraction (method)
  Quaternion.op_UnaryNegation (method)
  Quaternion.Add (method)
  Quaternion.Concatenate (method)
  Quaternion.Conjugate (method)
  Quaternion.Create (method)
  Quaternion.CreateFromAxisAngle (method)
  Quaternion.CreateFromRotationMatrix (method)
  Quaternion.CreateFromYawPitchRoll (method)
  Quaternion.Divide (method)
  Quaternion.Dot (method)
  Quaternion.Inverse (method)
  Quaternion.Lerp (method)
  Quaternion.Multiply (method)
  Quaternion.Negate (method)
  Quaternion.Normalize (method)
  Quaternion.Slerp (method)
  Quaternion.Subtract (method)
  Quaternion.Equals (method)
  Quaternion.GetHashCode (method)
  Quaternion.Length (method)
  Quaternion.LengthSquared (method)
  Quaternion.ToString (method)
Vector2 (struct) [135 members]
  Vector2.X (field)
  Vector2.Y (field)
  Vector2.AllBitsSet (property)
  Vector2.E (property)
  Vector2.Epsilon (property)
  Vector2.NaN (property)
  Vector2.NegativeInfinity (property)
  Vector2.NegativeZero (property)
  Vector2.One (property)
  Vector2.Pi (property)
  Vector2.PositiveInfinity (property)
  Vector2.Tau (property)
  Vector2.UnitX (property)
  Vector2.UnitY (property)
  Vector2.Zero (property)
  Vector2.this[] (property)
  Vector2.Vector2 (constructor)
  Vector2.op_Addition (method)
  Vector2.op_Division (method)
  Vector2.op_Equality (method)
  Vector2.op_Inequality (method)
  Vector2.op_Multiply (method)
  Vector2.op_Subtraction (method)
  Vector2.op_UnaryNegation (method)
  Vector2.op_BitwiseAnd (method)
  Vector2.op_BitwiseOr (method)
  Vector2.op_ExclusiveOr (method)
  Vector2.op_LeftShift (method)
  Vector2.op_OnesComplement (method)
  Vector2.op_RightShift (method)
  Vector2.op_UnaryPlus (method)
  Vector2.op_UnsignedRightShift (method)
  Vector2.Abs (method)
  Vector2.Add (method)
  Vector2.All (method)
  Vector2.AllWhereAllBitsSet (method)
  Vector2.AndNot (method)
  Vector2.Any (method)
  Vector2.AnyWhereAllBitsSet (method)
  Vector2.BitwiseAnd (method)
  Vector2.BitwiseOr (method)
  Vector2.Clamp (method)
  Vector2.ClampNative (method)
  Vector2.ConditionalSelect (method)
  Vector2.CopySign (method)
  Vector2.Cos (method)
  Vector2.Count (method)
  Vector2.CountWhereAllBitsSet (method)
  Vector2.Create (method)
  Vector2.CreateScalar (method)
  Vector2.CreateScalarUnsafe (method)
  Vector2.Cross (method)
  Vector2.DegreesToRadians (method)
  Vector2.Distance (method)
  Vector2.DistanceSquared (method)
  Vector2.Divide (method)
  Vector2.Dot (method)
  Vector2.Exp (method)
  Vector2.Equals (method)
  Vector2.EqualsAll (method)
  Vector2.EqualsAny (method)
  Vector2.FusedMultiplyAdd (method)
  Vector2.GreaterThan (method)
  Vector2.GreaterThanAll (method)
  Vector2.GreaterThanAny (method)
  Vector2.GreaterThanOrEqual (method)
  Vector2.GreaterThanOrEqualAll (method)
  Vector2.GreaterThanOrEqualAny (method)
  Vector2.Hypot (method)
  Vector2.IndexOf (method)
  Vector2.IndexOfWhereAllBitsSet (method)
  Vector2.IsEvenInteger (method)
  Vector2.IsFinite (method)
  Vector2.IsInfinity (method)
  Vector2.IsInteger (method)
  Vector2.IsNaN (method)
  Vector2.IsNegative (method)
  Vector2.IsNegativeInfinity (method)
  Vector2.IsNormal (method)
  Vector2.IsOddInteger (method)
  Vector2.IsPositive (method)
  Vector2.IsPositiveInfinity (method)
  Vector2.IsSubnormal (method)
  Vector2.IsZero (method)
  Vector2.LastIndexOf (method)
  Vector2.LastIndexOfWhereAllBitsSet (method)
  Vector2.Lerp (method)
  Vector2.LessThan (method)
  Vector2.LessThanAll (method)
  Vector2.LessThanAny (method)
  Vector2.LessThanOrEqual (method)
  Vector2.LessThanOrEqualAll (method)
  Vector2.LessThanOrEqualAny (method)
  Vector2.Load (method)
  Vector2.LoadAligned (method)
  Vector2.LoadAlignedNonTemporal (method)
  Vector2.LoadUnsafe (method)
  Vector2.Log (method)
  Vector2.Log2 (method)
  Vector2.Max (method)
  Vector2.MaxMagnitude (method)
  Vector2.MaxMagnitudeNumber (method)
  Vector2.MaxNative (method)
  Vector2.MaxNumber (method)
  Vector2.Min (method)
  Vector2.MinMagnitude (method)
  Vector2.MinMagnitudeNumber (method)
  Vector2.MinNative (method)
  Vector2.MinNumber (method)
  Vector2.Multiply (method)
  Vector2.MultiplyAddEstimate (method)
  Vector2.Negate (method)
  Vector2.None (method)
  Vector2.NoneWhereAllBitsSet (method)
  Vector2.Normalize (method)
  Vector2.OnesComplement (method)
  Vector2.RadiansToDegrees (method)
  Vector2.Reflect (method)
  Vector2.Round (method)
  Vector2.Shuffle (method)
  Vector2.Sin (method)
  Vector2.SinCos (method)
  Vector2.SquareRoot (method)
  Vector2.Subtract (method)
  Vector2.Sum (method)
  Vector2.Transform (method)
  Vector2.TransformNormal (method)
  Vector2.Truncate (method)
  Vector2.Xor (method)
  Vector2.CopyTo (method)
  Vector2.TryCopyTo (method)
  Vector2.GetHashCode (method)
  Vector2.Length (method)
  Vector2.LengthSquared (method)
  Vector2.ToString (method)

## System.Numerics (2) — `api-system-numerics-2.md`

Vector3 (struct) [137 members]
  Vector3.X (field)
  Vector3.Y (field)
  Vector3.Z (field)
  Vector3.AllBitsSet (property)
  Vector3.E (property)
  Vector3.Epsilon (property)
  Vector3.NaN (property)
  Vector3.NegativeInfinity (property)
  Vector3.NegativeZero (property)
  Vector3.One (property)
  Vector3.Pi (property)
  Vector3.PositiveInfinity (property)
  Vector3.Tau (property)
  Vector3.UnitX (property)
  Vector3.UnitY (property)
  Vector3.UnitZ (property)
  Vector3.Zero (property)
  Vector3.this[] (property)
  Vector3.Vector3 (constructor)
  Vector3.op_Addition (method)
  Vector3.op_Division (method)
  Vector3.op_Equality (method)
  Vector3.op_Inequality (method)
  Vector3.op_Multiply (method)
  Vector3.op_Subtraction (method)
  Vector3.op_UnaryNegation (method)
  Vector3.op_BitwiseAnd (method)
  Vector3.op_BitwiseOr (method)
  Vector3.op_ExclusiveOr (method)
  Vector3.op_LeftShift (method)
  Vector3.op_OnesComplement (method)
  Vector3.op_RightShift (method)
  Vector3.op_UnaryPlus (method)
  Vector3.op_UnsignedRightShift (method)
  Vector3.Abs (method)
  Vector3.Add (method)
  Vector3.All (method)
  Vector3.AllWhereAllBitsSet (method)
  Vector3.AndNot (method)
  Vector3.Any (method)
  Vector3.AnyWhereAllBitsSet (method)
  Vector3.BitwiseAnd (method)
  Vector3.BitwiseOr (method)
  Vector3.Clamp (method)
  Vector3.ClampNative (method)
  Vector3.ConditionalSelect (method)
  Vector3.CopySign (method)
  Vector3.Cos (method)
  Vector3.Count (method)
  Vector3.CountWhereAllBitsSet (method)
  Vector3.Create (method)
  Vector3.CreateScalar (method)
  Vector3.CreateScalarUnsafe (method)
  Vector3.Cross (method)
  Vector3.DegreesToRadians (method)
  Vector3.Distance (method)
  Vector3.DistanceSquared (method)
  Vector3.Divide (method)
  Vector3.Dot (method)
  Vector3.Exp (method)
  Vector3.Equals (method)
  Vector3.EqualsAll (method)
  Vector3.EqualsAny (method)
  Vector3.FusedMultiplyAdd (method)
  Vector3.GreaterThan (method)
  Vector3.GreaterThanAll (method)
  Vector3.GreaterThanAny (method)
  Vector3.GreaterThanOrEqual (method)
  Vector3.GreaterThanOrEqualAll (method)
  Vector3.GreaterThanOrEqualAny (method)
  Vector3.Hypot (method)
  Vector3.IndexOf (method)
  Vector3.IndexOfWhereAllBitsSet (method)
  Vector3.IsEvenInteger (method)
  Vector3.IsFinite (method)
  Vector3.IsInfinity (method)
  Vector3.IsInteger (method)
  Vector3.IsNaN (method)
  Vector3.IsNegative (method)
  Vector3.IsNegativeInfinity (method)
  Vector3.IsNormal (method)
  Vector3.IsOddInteger (method)
  Vector3.IsPositive (method)
  Vector3.IsPositiveInfinity (method)
  Vector3.IsSubnormal (method)
  Vector3.IsZero (method)
  Vector3.LastIndexOf (method)
  Vector3.LastIndexOfWhereAllBitsSet (method)
  Vector3.Lerp (method)
  Vector3.LessThan (method)
  Vector3.LessThanAll (method)
  Vector3.LessThanAny (method)
  Vector3.LessThanOrEqual (method)
  Vector3.LessThanOrEqualAll (method)
  Vector3.LessThanOrEqualAny (method)
  Vector3.Load (method)
  Vector3.LoadAligned (method)
  Vector3.LoadAlignedNonTemporal (method)
  Vector3.LoadUnsafe (method)
  Vector3.Log (method)
  Vector3.Log2 (method)
  Vector3.Max (method)
  Vector3.MaxMagnitude (method)
  Vector3.MaxMagnitudeNumber (method)
  Vector3.MaxNative (method)
  Vector3.MaxNumber (method)
  Vector3.Min (method)
  Vector3.MinMagnitude (method)
  Vector3.MinMagnitudeNumber (method)
  Vector3.MinNative (method)
  Vector3.MinNumber (method)
  Vector3.Multiply (method)
  Vector3.MultiplyAddEstimate (method)
  Vector3.Negate (method)
  Vector3.None (method)
  Vector3.NoneWhereAllBitsSet (method)
  Vector3.Normalize (method)
  Vector3.OnesComplement (method)
  Vector3.RadiansToDegrees (method)
  Vector3.Reflect (method)
  Vector3.Round (method)
  Vector3.Shuffle (method)
  Vector3.Sin (method)
  Vector3.SinCos (method)
  Vector3.SquareRoot (method)
  Vector3.Subtract (method)
  Vector3.Sum (method)
  Vector3.Transform (method)
  Vector3.TransformNormal (method)
  Vector3.Truncate (method)
  Vector3.Xor (method)
  Vector3.CopyTo (method)
  Vector3.TryCopyTo (method)
  Vector3.GetHashCode (method)
  Vector3.Length (method)
  Vector3.LengthSquared (method)
  Vector3.ToString (method)
Vector4 (struct) [137 members]
  Vector4.X (field)
  Vector4.Y (field)
  Vector4.Z (field)
  Vector4.W (field)
  Vector4.AllBitsSet (property)
  Vector4.E (property)
  Vector4.Epsilon (property)
  Vector4.NaN (property)
  Vector4.NegativeInfinity (property)
  Vector4.NegativeZero (property)
  Vector4.One (property)
  Vector4.Pi (property)
  Vector4.PositiveInfinity (property)
  Vector4.Tau (property)
  Vector4.UnitX (property)
  Vector4.UnitY (property)
  Vector4.UnitZ (property)
  Vector4.UnitW (property)
  Vector4.Zero (property)
  Vector4.this[] (property)
  Vector4.Vector4 (constructor)
  Vector4.op_Addition (method)
  Vector4.op_Division (method)
  Vector4.op_Equality (method)
  Vector4.op_Inequality (method)
  Vector4.op_Multiply (method)
  Vector4.op_Subtraction (method)
  Vector4.op_UnaryNegation (method)
  Vector4.op_BitwiseAnd (method)
  Vector4.op_BitwiseOr (method)
  Vector4.op_ExclusiveOr (method)
  Vector4.op_LeftShift (method)
  Vector4.op_OnesComplement (method)
  Vector4.op_RightShift (method)
  Vector4.op_UnaryPlus (method)
  Vector4.op_UnsignedRightShift (method)
  Vector4.Abs (method)
  Vector4.Add (method)
  Vector4.All (method)
  Vector4.AllWhereAllBitsSet (method)
  Vector4.AndNot (method)
  Vector4.Any (method)
  Vector4.AnyWhereAllBitsSet (method)
  Vector4.BitwiseAnd (method)
  Vector4.BitwiseOr (method)
  Vector4.Clamp (method)
  Vector4.ClampNative (method)
  Vector4.ConditionalSelect (method)
  Vector4.CopySign (method)
  Vector4.Cos (method)
  Vector4.Count (method)
  Vector4.CountWhereAllBitsSet (method)
  Vector4.Create (method)
  Vector4.CreateScalar (method)
  Vector4.CreateScalarUnsafe (method)
  Vector4.Cross (method)
  Vector4.DegreesToRadians (method)
  Vector4.Distance (method)
  Vector4.DistanceSquared (method)
  Vector4.Divide (method)
  Vector4.Dot (method)
  Vector4.Exp (method)
  Vector4.Equals (method)
  Vector4.EqualsAll (method)
  Vector4.EqualsAny (method)
  Vector4.FusedMultiplyAdd (method)
  Vector4.GreaterThan (method)
  Vector4.GreaterThanAll (method)
  Vector4.GreaterThanAny (method)
  Vector4.GreaterThanOrEqual (method)
  Vector4.GreaterThanOrEqualAll (method)
  Vector4.GreaterThanOrEqualAny (method)
  Vector4.Hypot (method)
  Vector4.IndexOf (method)
  Vector4.IndexOfWhereAllBitsSet (method)
  Vector4.IsEvenInteger (method)
  Vector4.IsFinite (method)
  Vector4.IsInfinity (method)
  Vector4.IsInteger (method)
  Vector4.IsNaN (method)
  Vector4.IsNegative (method)
  Vector4.IsNegativeInfinity (method)
  Vector4.IsNormal (method)
  Vector4.IsOddInteger (method)
  Vector4.IsPositive (method)
  Vector4.IsPositiveInfinity (method)
  Vector4.IsSubnormal (method)
  Vector4.IsZero (method)
  Vector4.LastIndexOf (method)
  Vector4.LastIndexOfWhereAllBitsSet (method)
  Vector4.Lerp (method)
  Vector4.LessThan (method)
  Vector4.LessThanAll (method)
  Vector4.LessThanAny (method)
  Vector4.LessThanOrEqual (method)
  Vector4.LessThanOrEqualAll (method)
  Vector4.LessThanOrEqualAny (method)
  Vector4.Load (method)
  Vector4.LoadAligned (method)
  Vector4.LoadAlignedNonTemporal (method)
  Vector4.LoadUnsafe (method)
  Vector4.Log (method)
  Vector4.Log2 (method)
  Vector4.Max (method)
  Vector4.MaxMagnitude (method)
  Vector4.MaxMagnitudeNumber (method)
  Vector4.MaxNative (method)
  Vector4.MaxNumber (method)
  Vector4.Min (method)
  Vector4.MinMagnitude (method)
  Vector4.MinMagnitudeNumber (method)
  Vector4.MinNative (method)
  Vector4.MinNumber (method)
  Vector4.Multiply (method)
  Vector4.MultiplyAddEstimate (method)
  Vector4.Negate (method)
  Vector4.None (method)
  Vector4.NoneWhereAllBitsSet (method)
  Vector4.Normalize (method)
  Vector4.OnesComplement (method)
  Vector4.RadiansToDegrees (method)
  Vector4.Round (method)
  Vector4.Shuffle (method)
  Vector4.Sin (method)
  Vector4.SinCos (method)
  Vector4.SquareRoot (method)
  Vector4.Subtract (method)
  Vector4.Sum (method)
  Vector4.Transform (method)
  Vector4.Truncate (method)
  Vector4.Xor (method)
  Vector4.CopyTo (method)
  Vector4.TryCopyTo (method)
  Vector4.GetHashCode (method)
  Vector4.Length (method)
  Vector4.LengthSquared (method)
  Vector4.ToString (method)
