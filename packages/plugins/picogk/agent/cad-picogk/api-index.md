# PicoGK API index

PicoGK 2.3.0.0 · 1990 symbols · extracted by Roslyn 5.9.0.

Every symbol appears here exactly once. The heading above each block names the file with its signature; grep the skill directory for `name(` to land on the declaration directly.

## CAD authoring — PicoGK — `api-cad-authoring-picogk.md`

PicoGK.ActiveVoxelCounterScalar (class) [2 members] [category: CAD authoring]
  PicoGK.ActiveVoxelCounterScalar.nCount (method)
  PicoGK.ActiveVoxelCounterScalar.InformActiveValue (method)
PicoGK.AddVectorFieldToViewer (class) [2 members] [category: CAD authoring]
  PicoGK.AddVectorFieldToViewer.AddToViewer (method)
  PicoGK.AddVectorFieldToViewer.InformActiveValue (method)
PicoGK.Animation (class) [5 members] [category: CAD authoring]
  PicoGK.Animation.IAction (interface) [1 members]
    PicoGK.Animation.IAction.Do (method)
  PicoGK.Animation.EType (enum) [3 members]
    PicoGK.Animation.EType.Once (enumMember)
    PicoGK.Animation.EType.Repeat (enumMember)
    PicoGK.Animation.EType.Wiggle (enumMember)
  PicoGK.Animation.Animation (constructor)
  PicoGK.Animation.End (method)
  PicoGK.Animation.bAnimate (method)
PicoGK.AnimationQueue (class) [5 members] [category: CAD authoring]
  PicoGK.AnimationQueue.AnimationQueue (constructor)
  PicoGK.AnimationQueue.Clear (method)
  PicoGK.AnimationQueue.bPulse (method)
  PicoGK.AnimationQueue.bIsIdle (method)
  PicoGK.AnimationQueue.Add (method)
PicoGK.BBox2 (struct) [10 members] [category: CAD authoring] — 2D Bounding Box object
  PicoGK.BBox2.vecMin (field) — Minimum coordinate of the bounding box
  PicoGK.BBox2.vecMax (field) — Maximum coordinate of the bounding box
  PicoGK.BBox2.BBox2 (constructor) — Creates an empty Bounding Box
  PicoGK.BBox2.bIsEmpty (method) — Is the BoundingBox empty?
  PicoGK.BBox2.bContains (method) — Checks whether point is inside the bounding box
  PicoGK.BBox2.Include (method) — Include the specified vector in the bounding box
  PicoGK.BBox2.Grow (method) — Grows the bounding box by the specified value on each…
  PicoGK.BBox2.vecSize (method) — Returns the size of the Bounding Box
  PicoGK.BBox2.vecCenter (method) — Center point of the bounding box
  PicoGK.BBox2.ToString (method) — A string representation of the Bounding Box
PicoGK.BBox3 (struct) [13 members] [category: CAD authoring] — 3D bounding box
  PicoGK.BBox3.vecMin (field) — Minimum coordinate of the bounding box
  PicoGK.BBox3.vecMax (field) — Maximum coordinate of the bounding box
  PicoGK.BBox3.BBox3 (constructor) — Create an empty Bounding Box
  PicoGK.BBox3.vecSize (method) — Size of the Bounding Box
  PicoGK.BBox3.bIsEmpty (method) — Is the Bounding Box empty>
  PicoGK.BBox3.bContains (method) — Checks whether the specified point is inside the bounding box
  PicoGK.BBox3.Include (method) — Include the specified vector in the Bounding Box
  PicoGK.BBox3.Grow (method) — Grows the bounding box by the specified value on each…
  PicoGK.BBox3.vecCenter (method) — Return the center of the Bounding Box
  PicoGK.BBox3.oFitInto (method) — Fit the specified Bounding Box into this box, returning Scale…
  PicoGK.BBox3.vecRandomVectorInside (method) — A function to return a random point in a Bounding…
  PicoGK.BBox3.oAsBoundingBox2 (method) — Return the 2D extent of this Bounding Box
  PicoGK.BBox3.ToString (method) — Return the Bounding Box as string
PicoGK.CliIo (class) [4 members] [category: CAD authoring] — ASCII CLI (Common Layer Interface) I/O based on https://www.hmilch.net/downloads/cli_format.html#:~:text=CLI%20is%20intended%20as%20a,data%20structure%20of%20the%20machine
  PicoGK.CliIo.EFormat (enum) [2 members] — Format options for CLI writer
    PicoGK.CliIo.EFormat.UseEmptyFirstLayer (enumMember) — Uses an intentionally-empty first layer to allow the CLI reader…
    PicoGK.CliIo.EFormat.FirstLayerWithContent (enumMember) — The first layer contains outlines (default)
  PicoGK.CliIo.Result (class) [10 members] — Result of a CLI import
    PicoGK.CliIo.Result.oSlices (field) — The stack of slices that were imported
    PicoGK.CliIo.Result.oBBoxFile (field) — The bounding box of the slices contained in the file
    PicoGK.CliIo.Result.bBinary (field) — Was the file binary?
    PicoGK.CliIo.Result.fUnitsHeader (field) — Units used in the header
    PicoGK.CliIo.Result.b32BitAlign (field) — Was the file aligned at 32 bit boundaries?
    PicoGK.CliIo.Result.nVersion (field) — Version number of the CLI export
    PicoGK.CliIo.Result.strHeaderDate (field) — Date string read from the header
    PicoGK.CliIo.Result.nLayers (field) — Number of layers in the file
    PicoGK.CliIo.Result.strWarnings (field) — Warnings that were encountered during the file reading
    PicoGK.CliIo.Result.Result (constructor)
  PicoGK.CliIo.WriteSlicesToCliFile (method) — Write a stack of PolySlices to a CLI file
  PicoGK.CliIo.oSlicesFromCliFile (method) — Read PolySlice objects from a CLI file
PicoGK.ColorBgr24 (struct) [5 members] [category: CAD authoring] — BGR 24 bit color value
  PicoGK.ColorBgr24.B (field) — Blue value (0..255)
  PicoGK.ColorBgr24.G (field) — Green value (0..255)
  PicoGK.ColorBgr24.R (field) — Red value (0..255)
  PicoGK.ColorBgr24.ColorBgr24 (constructor) — Construct a BGR value from 3 bytes
  PicoGK.ColorBgr24.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
PicoGK.ColorBgra32 (struct) [6 members] [category: CAD authoring] — BGRA 32 bit color value
  PicoGK.ColorBgra32.B (field) — Blue value (0..255)
  PicoGK.ColorBgra32.G (field) — Green value (0..255)
  PicoGK.ColorBgra32.R (field) — Red value (0..255)
  PicoGK.ColorBgra32.A (field) — Alpha value (0..255)
  PicoGK.ColorBgra32.ColorBgra32 (constructor) — Construct a 32 bit BGRA color value from 4 bytes
  PicoGK.ColorBgra32.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
PicoGK.ColorFloat (struct) [11 members] [category: CAD authoring] — A floating point color value with R,G,B,A values
  PicoGK.ColorFloat.R (field) — Red value (1 is full color)
  PicoGK.ColorFloat.G (field) — Green value (1 is full color)
  PicoGK.ColorFloat.B (field) — Blue value (1 is full color)
  PicoGK.ColorFloat.A (field) — Alpha value (1 is opaque, 0 is transparent)
  PicoGK.ColorFloat.ColorFloat (constructor) — Create a color from a hex string #FF0000 is red,…
  PicoGK.ColorFloat.op_Implicit (method) — Allows you to pass a hex string to any function…
  PicoGK.ColorFloat.strAsHexCode (method) — Returns the color as a hex code such as "FF"…
  PicoGK.ColorFloat.strAsABGRHexCode (method) — Returns the color value as an ABGR hex code (always…
  PicoGK.ColorFloat.ToString (method) — Returns the color as hex string
  PicoGK.ColorFloat.clrWeighted (method) — Weighted linear interpolation between two colors
  PicoGK.ColorFloat.clrRandom (method) — Return a random color
PicoGK.ColorHLS (struct) [5 members] [category: CAD authoring] — A color value in HSV space
  PicoGK.ColorHLS.H (field) — Hue value (0..360º)
  PicoGK.ColorHLS.L (field) — Lightness value (0..1)
  PicoGK.ColorHLS.S (field) — Saturation value (0..1)
  PicoGK.ColorHLS.ColorHLS (constructor) — Create an HLS color from its three components
  PicoGK.ColorHLS.op_Implicit (method) — Implicit conversion from ColorFloat to ColorHLS
PicoGK.ColorHSV (struct) [5 members] [category: CAD authoring] — Hue Saturation Value (HSV) color
  PicoGK.ColorHSV.H (field) — Hue (0..360º)
  PicoGK.ColorHSV.S (field) — Saturation (0..1)
  PicoGK.ColorHSV.V (field) — Value component
  PicoGK.ColorHSV.ColorHSV (constructor) — Create an HSV value from its three components
  PicoGK.ColorHSV.op_Implicit (method) — Implicit conversion that allows you to pass a ColorFloat to…
PicoGK.ColorRgb24 (struct) [5 members] [category: CAD authoring] — 24 bit RGB color
  PicoGK.ColorRgb24.R (field) — Red value (0..255)
  PicoGK.ColorRgb24.G (field) — Green value (0..255)
  PicoGK.ColorRgb24.B (field) — Blue value (0..255)
  PicoGK.ColorRgb24.ColorRgb24 (constructor) — Construct a 24 bit RGB value from 3 byes
  PicoGK.ColorRgb24.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
PicoGK.ColorRgba32 (struct) [6 members] [category: CAD authoring] — 32 bit RGBA color
  PicoGK.ColorRgba32.R (field) — Red value (0..255)
  PicoGK.ColorRgba32.G (field) — Green value (0..255)
  PicoGK.ColorRgba32.B (field) — Blue value (0..255)
  PicoGK.ColorRgba32.A (field) — Alpha value 0..255 (255 is opaque)
  PicoGK.ColorRgba32.ColorRgba32 (constructor) — Create a color from 3 or 4 bytes
  PicoGK.ColorRgba32.op_Implicit (method) — Allows you to pass a ColorFloat to any function that…
PicoGK.Config (class) [2 members] [category: CAD authoring]
  PicoGK.Config.strPicoGKLib (constant)
  PicoGK.Config.Config (constructor)
PicoGK.CsvTable (class) [11 members] [category: CAD authoring]
  PicoGK.CsvTable.CsvTable (constructor)
  PicoGK.CsvTable.Save (method)
  PicoGK.CsvTable.nRowCount (method)
  PicoGK.CsvTable.nMaxColumnCount (method)
  PicoGK.CsvTable.strGetAt (method)
  PicoGK.CsvTable.SetKeyColumn (method)
  PicoGK.CsvTable.bGetAt (method)
  PicoGK.CsvTable.bFindColumn (method)
  PicoGK.CsvTable.strColumnId (method)
  PicoGK.CsvTable.SetColumnIds (method)
  PicoGK.CsvTable.AddRow (method)
PicoGK.Easing (class) [12 members] [category: CAD authoring] — Easing functions — they take a float value from 0..1…
  PicoGK.Easing.EEasing (enum) [10 members]
    PicoGK.Easing.EEasing.LINEAR (enumMember)
    PicoGK.Easing.EEasing.SINE_IN (enumMember)
    PicoGK.Easing.EEasing.SINE_OUT (enumMember)
    PicoGK.Easing.EEasing.SINE_INOUT (enumMember)
    PicoGK.Easing.EEasing.QUAD_IN (enumMember)
    PicoGK.Easing.EEasing.QUAD_OUT (enumMember)
    PicoGK.Easing.EEasing.QUAD_INOUT (enumMember)
    PicoGK.Easing.EEasing.CUBIC_IN (enumMember)
    PicoGK.Easing.EEasing.CUBIC_OUT (enumMember)
    PicoGK.Easing.EEasing.CUBIC_INOUT (enumMember)
  PicoGK.Easing.fEaseSineIn (method)
  PicoGK.Easing.fEaseSineOut (method)
  PicoGK.Easing.fEaseSineInOut (method)
  PicoGK.Easing.fEaseQuadIn (method)
  PicoGK.Easing.fEaseQuadOut (method)
  PicoGK.Easing.fEaseQuadInOut (method)
  PicoGK.Easing.fEaseCubicIn (method)
  PicoGK.Easing.fEaseCubicOut (method)
  PicoGK.Easing.fEaseCubicInOut (method)
  PicoGK.Easing.fEasingFunction (method)
  PicoGK.Easing.Easing (constructor)
PicoGK.FieldMetadata (class) [11 members] [category: CAD authoring] — Metadata table containing parameters associated with field types like Voxels,…
  PicoGK.FieldMetadata.EType (enum) [4 members] — Type of the data items in the metadata table
    PicoGK.FieldMetadata.EType.UNKNOWN (enumMember)
    PicoGK.FieldMetadata.EType.STRING (enumMember)
    PicoGK.FieldMetadata.EType.FLOAT (enumMember)
    PicoGK.FieldMetadata.EType.VECTOR (enumMember)
  PicoGK.FieldMetadata.nCount (method) — Number of items in the metadata table
  PicoGK.FieldMetadata.bGetNameAt (method) — Attempts to retrieve the name of the parameter at the…
  PicoGK.FieldMetadata.eTypeAt (method) — Returns the type of the value with the specified name
  PicoGK.FieldMetadata.strTypeAt (method) — Returns the human readable type of the parameter with the…
  PicoGK.FieldMetadata.strTypeName (method) — Translate the type enum to a string
  PicoGK.FieldMetadata.bGetValueAt (method) — Try to get the value of a parameter
  PicoGK.FieldMetadata.SetValue (method) — Set string value in the metadata table
  PicoGK.FieldMetadata.RemoveValue (method) — Remove a value from the metadata table
  PicoGK.FieldMetadata.ToString (method) — Converts the contents of the metadata table to a string
  PicoGK.FieldMetadata.Dispose (method)
PicoGK.IBoundedImplicit (interface) [1 members] [category: CAD authoring] — Interface for a bounded implicit function
  PicoGK.IBoundedImplicit.oBounds (property) — Access the bounding box of the implicit function
PicoGK.IDataTable (interface) [7 members] [category: CAD authoring]
  PicoGK.IDataTable.nMaxColumnCount (method)
  PicoGK.IDataTable.strColumnId (method)
  PicoGK.IDataTable.bFindColumn (method)
  PicoGK.IDataTable.nRowCount (method)
  PicoGK.IDataTable.strGetAt (method)
  PicoGK.IDataTable.SetColumnIds (method)
  PicoGK.IDataTable.AddRow (method)
PicoGK.IFieldWithMetadata (interface) [1 members] [category: CAD authoring]
  PicoGK.IFieldWithMetadata.oMetaData (method) — Return metadata borrowed from this field owner
PicoGK.IImplicit (interface) [1 members] [category: CAD authoring] — Function signature for signed distance implicts
  PicoGK.IImplicit.fSignedDistance (method) — Return the signed distance to the iso surface
PicoGK.ILog (interface) [1 members] [category: CAD authoring] — Logging interface which allows you to output diagnostics
  PicoGK.ILog.Log (method) — This function allows you to output information using the standard…
PicoGK.IProgress (interface) [1 members] [category: CAD authoring] — A generic progress reporting interface
  PicoGK.IProgress.Progress (method) — Report progress from 0..1
PicoGK.ITraverseScalarField (interface) [1 members] [category: CAD authoring] — An interface used to traverse the active values of a…
  PicoGK.ITraverseScalarField.InformActiveValue (method) — Called for every active value in the ScalarField object
PicoGK.ITraverseVectorField (interface) [1 members] [category: CAD authoring] — An interface to allow traversal of all active values in…
  PicoGK.ITraverseVectorField.InformActiveValue (method) — Called for every active value in the VectorField object
PicoGK.Image (class) [25 members] [category: CAD authoring]
  PicoGK.Image.EType (enum) [3 members]
    PicoGK.Image.EType.BW (enumMember)
    PicoGK.Image.EType.GRAY (enumMember)
    PicoGK.Image.EType.COLOR (enumMember)
  PicoGK.Image.nWidth (field)
  PicoGK.Image.nHeight (field)
  PicoGK.Image.eType (field)
  PicoGK.Image.clrValue (method)
  PicoGK.Image.fValue (method)
  PicoGK.Image.bValue (method)
  PicoGK.Image.SetValue (method)
  PicoGK.Image.byGetValue (method)
  PicoGK.Image.sGetBgr24 (method)
  PicoGK.Image.SetBgr24 (method)
  PicoGK.Image.sGetBgra32 (method)
  PicoGK.Image.SetBgra32 (method)
  PicoGK.Image.sGetRgb24 (method)
  PicoGK.Image.sGetRgba32 (method)
  PicoGK.Image.SetRgb24 (method)
  PicoGK.Image.SetRgba32 (method)
  PicoGK.Image.clrGetAtNormalized (method) — Returns the interpolated color value at a normalized coordinate going…
  PicoGK.Image.DrawLine (method)
  PicoGK.Image.imgFromSKBitmap (method)
  PicoGK.Image.op_Implicit (method)
  PicoGK.Image.SavePng (method)
  PicoGK.Image.SaveJpg (method)
  PicoGK.Image.SaveTga (method)
  PicoGK.Image.imgLoadFromFile (method)
PicoGK.ImageBWAbstract (class) [4 members] [category: CAD authoring]
  PicoGK.ImageBWAbstract.ImageBWAbstract (constructor)
  PicoGK.ImageBWAbstract.fValue (method)
  PicoGK.ImageBWAbstract.clrValue (method)
  PicoGK.ImageBWAbstract.SetValue (method)
PicoGK.ImageColor (class) [3 members] [category: CAD authoring]
  PicoGK.ImageColor.ImageColor (constructor)
  PicoGK.ImageColor.SetValue (method)
  PicoGK.ImageColor.clrValue (method)
PicoGK.ImageColorAbstract (class) [4 members] [category: CAD authoring]
  PicoGK.ImageColorAbstract.ImageColorAbstract (constructor)
  PicoGK.ImageColorAbstract.fValue (method)
  PicoGK.ImageColorAbstract.bValue (method)
  PicoGK.ImageColorAbstract.SetValue (method)
PicoGK.ImageGrayScale (class) [6 members] [category: CAD authoring]
  PicoGK.ImageGrayScale.m_afValues (field)
  PicoGK.ImageGrayScale.ImageGrayScale (constructor)
  PicoGK.ImageGrayScale.SetValue (method)
  PicoGK.ImageGrayScale.fValue (method)
  PicoGK.ImageGrayScale.imgGetColorCodedSDF (method)
  PicoGK.ImageGrayScale.imgGetInterpolated (method)
PicoGK.ImageGrayscaleAbstract (class) [5 members] [category: CAD authoring]
  PicoGK.ImageGrayscaleAbstract.ImageGrayscaleAbstract (constructor)
  PicoGK.ImageGrayscaleAbstract.clrValue (method)
  PicoGK.ImageGrayscaleAbstract.bValue (method)
  PicoGK.ImageGrayscaleAbstract.SetValue (method)
  PicoGK.ImageGrayscaleAbstract.bContainsActivePixels (method) — Returns whether the image has any pixels set to a…
PicoGK.ImageRgb24 (class) [5 members] [category: CAD authoring]
  PicoGK.ImageRgb24.ImageRgb24 (constructor)
  PicoGK.ImageRgb24.clrValue (method)
  PicoGK.ImageRgb24.SetValue (method)
  PicoGK.ImageRgb24.SetRgb24 (method)
  PicoGK.ImageRgb24.sGetRgb24 (method)
PicoGK.ImageRgba32 (class) [5 members] [category: CAD authoring]
  PicoGK.ImageRgba32.ImageRgba32 (constructor)
  PicoGK.ImageRgba32.clrValue (method)
  PicoGK.ImageRgba32.SetValue (method)
  PicoGK.ImageRgba32.SetRgba32 (method)
  PicoGK.ImageRgba32.sGetRgba32 (method)

## CAD authoring — PicoGK (2) — `api-cad-authoring-picogk-2.md`

PicoGK.Lattice (class) [4 members] [category: CAD authoring] — A lattice of beams (and spheres)
  PicoGK.Lattice.Lattice (constructor) — Creates a new empty Lattice, using the global library instance
  PicoGK.Lattice.AddSphere (method) — Add a sphere to the lattice
  PicoGK.Lattice.AddBeam (method) — Add a beam to the lattice
  PicoGK.Lattice.Dispose (method)
PicoGK.Library (class) [39 members] [category: CAD authoring] — The Library object encapsulates an instance of a PicoGK library…
  PicoGK.Library.nStringLength (constant)
  PicoGK.Library.fVoxelSize (field) — Voxel size in millimeters
  PicoGK.Library.GlobalInstance (class) [5 members]
    PicoGK.Library.GlobalInstance.oViewer (property)
    PicoGK.Library.GlobalInstance.oLibrary (property)
    PicoGK.Library.GlobalInstance.xLog (property)
    PicoGK.Library.GlobalInstance.GlobalInstance (constructor)
    PicoGK.Library.GlobalInstance.Dispose (method)
  PicoGK.Library.fVoxelSizeMM (property)
  PicoGK.Library.strLogFolder (property)
  PicoGK.Library.nTotalMemUsage (method) — Return deduplicated logical owned storage retained by this Library instance
  PicoGK.Library.nMeshesMemUsage (method) — Returns the total memory usage of all Mesh objects created…
  PicoGK.Library.nLatticesMemUsage (method) — Returns the total memory usage of all Lattice objects created…
  PicoGK.Library.nPolyLinesMemUsage (method) — Returns the total memory usage of all PolyLine objects created…
  PicoGK.Library.nVoxelsMemUsage (method) — Returns the total memory usage of all Voxels objects created…
  PicoGK.Library.nVdbFilesMemUsage (method) — Returns the total memory usage of all VdbFile objects created…
  PicoGK.Library.nScalarFieldsMemUsage (method) — Returns the total memory usage of all ScalarField objects created…
  PicoGK.Library.nVectorFieldsMemUsage (method) — Returns the total memory usage of all VectorField objects created…
  PicoGK.Library.nVdbMetasMemUsage (method) — Returns the total memory usage of all VdbFile metadata objects…
  PicoGK.Library.nMeshesAllocated (method) — Returns the number of Mesh objects created with this Library…
  PicoGK.Library.nLatticesAllocated (method) — Returns the number of Lattice objects created with this Library…
  PicoGK.Library.nPolyLinesAllocated (method) — Returns the number of PolyLine objects created with this Library…
  PicoGK.Library.nVoxelsAllocated (method) — Returns the number of Voxels objects created with this Library…
  PicoGK.Library.nVdbFilesAllocated (method) — Returns the number of VdbFile objects created with this Library…
  PicoGK.Library.nScalarFieldsAllocated (method) — Returns the number of ScalarField objects created with this Library…
  PicoGK.Library.nVectorFieldsAllocated (method) — Returns the number of VectorField objects created with this Library…
  PicoGK.Library.nVdbMetasAllocated (method) — Returns the number of VdbFile metadata objects created with this…
  PicoGK.Library.vecVoxelsToMm (method) — Convert voxel index coordinates to world coordinates in millimeters
  PicoGK.Library.MmToVoxels (method) — Convert world (millimeter) units to voxel units
  PicoGK.Library.Dispose (method) — The Library implements the Dispose pattern, so you can use…
  PicoGK.Library.oLibrary (method) — Return the borrowed library for the current Go task
  PicoGK.Library.oViewer (method) — Return the borrowed viewer for the current Go task
  PicoGK.Library.xLog (method)
  PicoGK.Library.RegisterGlobalLog (method)
  PicoGK.Library.UnregisterGlobalLog (method)
  PicoGK.Library.Go (method) — This is the one library function that you call to…
  PicoGK.Library.Log (method)
  PicoGK.Library.bContinueTask (method) — Checks whether the task started using Go() should continue, and…
  PicoGK.Library.EndTask (method) — Requests the task started by the Go() function to end
  PicoGK.Library.CancelEndTaskRequest (method) — Cancels any pending request to end the task
  PicoGK.Library.strFindLightSetupFile (method)
  PicoGK.Library.strName (method) — Returns the library name (from the C++ side)
  PicoGK.Library.strVersion (method) — Returns the library version (from the C++ side)
  PicoGK.Library.strBuildInfo (method) — Returns internal build info, such as build date/time of the…
PicoGK.LogConsole (class) [2 members] [category: CAD authoring] — A simple logging class which outputs to the console
  PicoGK.LogConsole.Log (method) — Implementation of a simple logging class that outputs to the…
  PicoGK.LogConsole.LogConsole (constructor)
PicoGK.LogFile (class) [4 members] [category: CAD authoring]
  PicoGK.LogFile.LogFile (constructor)
  PicoGK.LogFile.Log (method)
  PicoGK.LogFile.LogTime (method)
  PicoGK.LogFile.Dispose (method)
PicoGK.LogProgress (class) [3 members] [category: CAD authoring] — A progress reporting class that outputs to a log interface
  PicoGK.LogProgress.LogProgress (constructor) — Initialize a new progress reporting object
  PicoGK.LogProgress.Progress (method) — Report progress from 0..1
  PicoGK.LogProgress.Dispose (method) — Cleanup (just reports that the task is finished)
PicoGK.Material (class) [27 members] [category: CAD authoring] — Typed Material appearance
  PicoGK.Material.Name (property)
  PicoGK.Material.Color (property)
  PicoGK.Material.Metallic (property)
  PicoGK.Material.Roughness (property)
  PicoGK.Material.ColorTexture (property)
  PicoGK.Material.MetallicRoughnessTexture (property)
  PicoGK.Material.NormalTexture (property)
  PicoGK.Material.NormalScale (property)
  PicoGK.Material.OcclusionTexture (property)
  PicoGK.Material.OcclusionStrength (property)
  PicoGK.Material.Emissive (property)
  PicoGK.Material.EmissiveStrength (property)
  PicoGK.Material.EmissiveTexture (property)
  PicoGK.Material.AlphaMode (property)
  PicoGK.Material.AlphaCutoff (property)
  PicoGK.Material.DoubleSided (property)
  PicoGK.Material.Unlit (property)
  PicoGK.Material.Ior (property)
  PicoGK.Material.Dispersion (property)
  PicoGK.Material.Anisotropy (property)
  PicoGK.Material.Clearcoat (property)
  PicoGK.Material.Iridescence (property)
  PicoGK.Material.Sheen (property)
  PicoGK.Material.Specular (property)
  PicoGK.Material.Transmission (property)
  PicoGK.Material.Volume (property)
  PicoGK.Material.Material (constructor)
PicoGK.MaterialAlphaMode (enum) [3 members] [category: CAD authoring] — Typed MaterialAlphaMode appearance
  PicoGK.MaterialAlphaMode.Opaque (enumMember)
  PicoGK.MaterialAlphaMode.Mask (enumMember)
  PicoGK.MaterialAlphaMode.Blend (enumMember)
PicoGK.MaterialAnisotropy (class) [4 members] [category: CAD authoring] — Typed MaterialAnisotropy appearance
  PicoGK.MaterialAnisotropy.Strength (property)
  PicoGK.MaterialAnisotropy.Rotation (property)
  PicoGK.MaterialAnisotropy.Texture (property)
  PicoGK.MaterialAnisotropy.MaterialAnisotropy (constructor)
PicoGK.MaterialClearcoat (class) [7 members] [category: CAD authoring] — Typed MaterialClearcoat appearance
  PicoGK.MaterialClearcoat.Factor (property)
  PicoGK.MaterialClearcoat.Roughness (property)
  PicoGK.MaterialClearcoat.Texture (property)
  PicoGK.MaterialClearcoat.RoughnessTexture (property)
  PicoGK.MaterialClearcoat.NormalTexture (property)
  PicoGK.MaterialClearcoat.NormalScale (property)
  PicoGK.MaterialClearcoat.MaterialClearcoat (constructor)
PicoGK.MaterialImage (class) [4 members] [category: CAD authoring] — Encoded image bytes
  PicoGK.MaterialImage.Data (property)
  PicoGK.MaterialImage.Format (property)
  PicoGK.MaterialImage.Name (property)
  PicoGK.MaterialImage.MaterialImage (constructor)
PicoGK.MaterialImageFormat (enum) [4 members] [category: CAD authoring] — Encoded image formats
  PicoGK.MaterialImageFormat.Auto (enumMember)
  PicoGK.MaterialImageFormat.Png (enumMember)
  PicoGK.MaterialImageFormat.Jpeg (enumMember)
  PicoGK.MaterialImageFormat.WebP (enumMember)
PicoGK.MaterialIridescence (class) [7 members] [category: CAD authoring] — Typed MaterialIridescence appearance
  PicoGK.MaterialIridescence.Factor (property)
  PicoGK.MaterialIridescence.Ior (property)
  PicoGK.MaterialIridescence.ThicknessMinimum (property)
  PicoGK.MaterialIridescence.ThicknessMaximum (property)
  PicoGK.MaterialIridescence.Texture (property)
  PicoGK.MaterialIridescence.ThicknessTexture (property)
  PicoGK.MaterialIridescence.MaterialIridescence (constructor)
PicoGK.MaterialMagFilter (enum) [2 members] [category: CAD authoring] — Typed MaterialMagFilter appearance
  PicoGK.MaterialMagFilter.Nearest (enumMember)
  PicoGK.MaterialMagFilter.Linear (enumMember)
PicoGK.MaterialMinFilter (enum) [6 members] [category: CAD authoring] — Typed MaterialMinFilter appearance
  PicoGK.MaterialMinFilter.Nearest (enumMember)
  PicoGK.MaterialMinFilter.Linear (enumMember)
  PicoGK.MaterialMinFilter.NearestMipmapNearest (enumMember)
  PicoGK.MaterialMinFilter.LinearMipmapNearest (enumMember)
  PicoGK.MaterialMinFilter.NearestMipmapLinear (enumMember)
  PicoGK.MaterialMinFilter.LinearMipmapLinear (enumMember)
PicoGK.MaterialSampler (class) [5 members] [category: CAD authoring] — Typed MaterialSampler appearance
  PicoGK.MaterialSampler.WrapS (property)
  PicoGK.MaterialSampler.WrapT (property)
  PicoGK.MaterialSampler.MagFilter (property)
  PicoGK.MaterialSampler.MinFilter (property)
  PicoGK.MaterialSampler.MaterialSampler (constructor)
PicoGK.MaterialSheen (class) [5 members] [category: CAD authoring] — Typed MaterialSheen appearance
  PicoGK.MaterialSheen.Color (property)
  PicoGK.MaterialSheen.Roughness (property)
  PicoGK.MaterialSheen.ColorTexture (property)
  PicoGK.MaterialSheen.RoughnessTexture (property)
  PicoGK.MaterialSheen.MaterialSheen (constructor)
PicoGK.MaterialSpecular (class) [5 members] [category: CAD authoring] — Typed MaterialSpecular appearance
  PicoGK.MaterialSpecular.Factor (property)
  PicoGK.MaterialSpecular.Color (property)
  PicoGK.MaterialSpecular.Texture (property)
  PicoGK.MaterialSpecular.ColorTexture (property)
  PicoGK.MaterialSpecular.MaterialSpecular (constructor)
PicoGK.MaterialTexture (class) [4 members] [category: CAD authoring] — Typed MaterialTexture appearance
  PicoGK.MaterialTexture.Image (property)
  PicoGK.MaterialTexture.Sampler (property)
  PicoGK.MaterialTexture.Transform (property)
  PicoGK.MaterialTexture.MaterialTexture (constructor)
PicoGK.MaterialTextureTransform (class) [4 members] [category: CAD authoring] — Typed MaterialTextureTransform appearance
  PicoGK.MaterialTextureTransform.Offset (property)
  PicoGK.MaterialTextureTransform.Scale (property)
  PicoGK.MaterialTextureTransform.Rotation (property)
  PicoGK.MaterialTextureTransform.MaterialTextureTransform (constructor)
PicoGK.MaterialTransmission (class) [3 members] [category: CAD authoring] — Typed MaterialTransmission appearance
  PicoGK.MaterialTransmission.Factor (property)
  PicoGK.MaterialTransmission.Texture (property)
  PicoGK.MaterialTransmission.MaterialTransmission (constructor)
PicoGK.MaterialVolume (class) [5 members] [category: CAD authoring] — Typed MaterialVolume appearance
  PicoGK.MaterialVolume.Thickness (property)
  PicoGK.MaterialVolume.AttenuationDistance (property)
  PicoGK.MaterialVolume.AttenuationColor (property)
  PicoGK.MaterialVolume.ThicknessTexture (property)
  PicoGK.MaterialVolume.MaterialVolume (constructor)
PicoGK.MaterialWrap (enum) [3 members] [category: CAD authoring] — Typed MaterialWrap appearance
  PicoGK.MaterialWrap.ClampToEdge (enumMember)
  PicoGK.MaterialWrap.MirroredRepeat (enumMember)
  PicoGK.MaterialWrap.Repeat (enumMember)
PicoGK.Mesh (class) [22 members] [category: CAD authoring] — A triangle mesh
  PicoGK.Mesh.EStlUnit (enum) [6 members]
    PicoGK.Mesh.EStlUnit.AUTO (enumMember)
    PicoGK.Mesh.EStlUnit.MM (enumMember)
    PicoGK.Mesh.EStlUnit.CM (enumMember)
    PicoGK.Mesh.EStlUnit.M (enumMember)
    PicoGK.Mesh.EStlUnit.FT (enumMember)
    PicoGK.Mesh.EStlUnit.IN (enumMember)
  PicoGK.Mesh.m_strLoadHeaderData (field)
  PicoGK.Mesh.m_eLoadUnits (field)
  PicoGK.Mesh.Mesh (constructor) — Creates a new empty Mesh, using the global library instance
  PicoGK.Mesh.mshCreateTransformed (method) — Create a transformed mesh by offsetting and scaling it
  PicoGK.Mesh.mshCreateMirrored (method) — Mirrors a mesh at the specified plane
  PicoGK.Mesh.nAddVertex (method) — Add a new vertex to the mesh so that it…
  PicoGK.Mesh.AddVertices (method)
  PicoGK.Mesh.vecVertexAt (method) — Get the vertex at the specified index
  PicoGK.Mesh.nVertexCount (method) — Get the number of vertices in the mesh
  PicoGK.Mesh.nAddTriangle (method) — Add a triangle to the mesh with the specified vertex…
  PicoGK.Mesh.nTriangleCount (method) — Return number of triangles in the mesh
  PicoGK.Mesh.AddQuad (method) — Adds a quad, defined by four corner vertices Helper function,…
  PicoGK.Mesh.oTriangleAt (method) — Get the triangle with the specified index
  PicoGK.Mesh.GetTriangle (method) — Get the triangle with the specified index
  PicoGK.Mesh.Append (method) — Append one mesh to another Note, no deduplication is done…
  PicoGK.Mesh.oBoundingBox (method) — Return the BoundingBox of the Mesh
  PicoGK.Mesh.mshFromStlFile (method) — Loads a mesh from an STL file By default, it…
  PicoGK.Mesh.SaveToStlFile (method) — Saves a Mesh to STL file If eUnit is auto,…
  PicoGK.Mesh.Dispose (method)
  PicoGK.Mesh.bFindTriangleFromSurfacePoint (method)
  PicoGK.Mesh.bPointLiesOnTriangle (method)

## CAD authoring — PicoGK (3) — `api-cad-authoring-picogk-3.md`

PicoGK.OpenVdbFile (class) [16 members] [category: CAD authoring] — OpenVdbFile handles the creation, loading and saving of openvdb .VDB…
  PicoGK.OpenVdbFile.EFieldType (enum) [4 members] — Types of fields in .VDB files
    PicoGK.OpenVdbFile.EFieldType.Unsupported (enumMember) — Unsupported data type (for example FOG)
    PicoGK.OpenVdbFile.EFieldType.Voxels (enumMember) — PicoGK.Voxels field
    PicoGK.OpenVdbFile.EFieldType.ScalarField (enumMember) — PicoGK.ScalarField type
    PicoGK.OpenVdbFile.EFieldType.VectorField (enumMember) — PicoGK.ScalerField type
  PicoGK.OpenVdbFile.OpenVdbFile (constructor) — Create an empty openvdb file object
  PicoGK.OpenVdbFile.libCreateCompatibleLibraryFor (method) — Create a PicoGK library object that is compatible with the…
  PicoGK.OpenVdbFile.SaveToFile (method) — Saves the current object with all of its attached fields…
  PicoGK.OpenVdbFile.voxGet (method) — Get the Voxels at the index specified
  PicoGK.OpenVdbFile.nAdd (method) — Adds a copy of the specified Voxels to the VdbFile…
  PicoGK.OpenVdbFile.oGetScalarField (method) — Get the ScalarField at the index specified
  PicoGK.OpenVdbFile.oGetVectorField (method) — Get the VectorField at the index specified
  PicoGK.OpenVdbFile.nFieldCount (method) — Number of fields stored in the VdbFile container
  PicoGK.OpenVdbFile.strFieldName (method) — Returns the name of the field (if specified) at the…
  PicoGK.OpenVdbFile.eFieldType (method) — Returns the type of the field at the given field…
  PicoGK.OpenVdbFile.strFieldType (method) — Returns the field type at the given index as string
  PicoGK.OpenVdbFile.xField (method)
  PicoGK.OpenVdbFile.bIsPicoGKCompatible (method)
  PicoGK.OpenVdbFile.fPicoGKVoxelSizeMM (method)
  PicoGK.OpenVdbFile.Dispose (method)
PicoGK.PolyContour (class) [14 members] [category: CAD authoring]
  PicoGK.PolyContour.EWinding (enum) [3 members]
    PicoGK.PolyContour.EWinding.UNKNOWN (enumMember)
    PicoGK.PolyContour.EWinding.CLOCKWISE (enumMember)
    PicoGK.PolyContour.EWinding.COUNTERCLOCKWISE (enumMember)
  PicoGK.PolyContour.strWindingAsString (method)
  PicoGK.PolyContour.eDetectWinding (method)
  PicoGK.PolyContour.PolyContour (constructor)
  PicoGK.PolyContour.AddVertex (method)
  PicoGK.PolyContour.DetectWinding (method)
  PicoGK.PolyContour.eWinding (method)
  PicoGK.PolyContour.oVertices (method)
  PicoGK.PolyContour.Close (method) — Makes sure that the last coordinate is identical to the…
  PicoGK.PolyContour.AsSvgPolyline (method)
  PicoGK.PolyContour.AsSvgPath (method)
  PicoGK.PolyContour.oBBox (method)
  PicoGK.PolyContour.nCount (method)
  PicoGK.PolyContour.vecVertex (method)
PicoGK.PolyLine (class) [10 members] [category: CAD authoring] — A colored 3D polyline for use in the viewer
  PicoGK.PolyLine.PolyLine (constructor) — Creates a new empty PolyLine, using the global library instance
  PicoGK.PolyLine.nAddVertex (method) — Add a vertex to the polyline
  PicoGK.PolyLine.Add (method) — Adds all vertices from a container
  PicoGK.PolyLine.nVertexCount (method) — Return number of vertices in the PolyLine
  PicoGK.PolyLine.vecVertexAt (method) — Get the vertex in the polyline at the specified vertex…
  PicoGK.PolyLine.GetColor (method) — Return the color of the PolyLine
  PicoGK.PolyLine.oBoundingBox (method) — Return BoundingBox of PolyLine
  PicoGK.PolyLine.AddArrow (method) — Adds an arrow to the tip of the current polyline…
  PicoGK.PolyLine.AddCross (method) — Add a cross at the end of a polyline
  PicoGK.PolyLine.Dispose (method)
PicoGK.PolySlice (class) [10 members] [category: CAD authoring]
  PicoGK.PolySlice.PolySlice (constructor)
  PicoGK.PolySlice.AddContour (method)
  PicoGK.PolySlice.bIsEmpty (method)
  PicoGK.PolySlice.Close (method)
  PicoGK.PolySlice.SaveToSvgFile (method)
  PicoGK.PolySlice.oFromSdf (method)
  PicoGK.PolySlice.fZPos (method)
  PicoGK.PolySlice.oBBox (method)
  PicoGK.PolySlice.nContours (method)
  PicoGK.PolySlice.oContourAt (method)
PicoGK.PolySliceStack (class) [6 members] [category: CAD authoring]
  PicoGK.PolySliceStack.PolySliceStack (constructor)
  PicoGK.PolySliceStack.AddSlices (method)
  PicoGK.PolySliceStack.AddToViewer (method)
  PicoGK.PolySliceStack.nCount (method)
  PicoGK.PolySliceStack.oSliceAt (method)
  PicoGK.PolySliceStack.oBBox (method)
PicoGK.ProgressCounter (class) [3 members] [category: CAD authoring] — A progress counting class for counting up items to 100%
  PicoGK.ProgressCounter.ProgressCounter (constructor) — Create a new progress counter object
  PicoGK.ProgressCounter.SetItem (method) — Set the item (nItemCount == 100%)
  PicoGK.ProgressCounter.op_Increment (method) — Allow you to use ++ to count up to the…
PicoGK.ProgressNoop (class) [2 members] [category: CAD authoring] — A progress reporting class that does nothing (can be used…
  PicoGK.ProgressNoop.Progress (method) — Progress from 0..1
  PicoGK.ProgressNoop.ProgressNoop (constructor)
PicoGK.SKHelpers (class) [2 members] [category: CAD authoring]
  PicoGK.SKHelpers.oAsSkColor (method)
  PicoGK.SKHelpers.clrAsColorRgba32 (method)
PicoGK.ScalarField (class) [12 members] [category: CAD authoring] — A field of scalar floating point values
  PicoGK.ScalarField.m_oMetadata (field) — Field metadata
  PicoGK.ScalarField.oMetaData (method) — Return metadata borrowed from this field owner
  PicoGK.ScalarField.ScalarField (constructor) — Create an empty scalar field object
  PicoGK.ScalarField.SetValue (method) — Sets the value at the specified position in mm When…
  PicoGK.ScalarField.bGetValue (method) — Get the value at the specified position If the specified…
  PicoGK.ScalarField.RemoveValue (method) — Removes the value at the specified position
  PicoGK.ScalarField.GetVoxelDimensions (method) — Returns the dimensions of the field in discrete voxels
  PicoGK.ScalarField.GetVoxelSlice (method) — Returns a signed distance-field-encoded slice of the voxel field Reuses…
  PicoGK.ScalarField.TraverseActive (method) — Visit each active value in the vector field and call…
  PicoGK.ScalarField.fSignedDistance (method) — Return the scalar value at the specified position as as…
  PicoGK.ScalarField.oBoundingBox (method) — Returns the bounding box of all active voxels in mm…
  PicoGK.ScalarField.Dispose (method)
PicoGK.SdfVisualizer (class) [4 members] [category: CAD authoring]
  PicoGK.SdfVisualizer.imgEncodeFromSdf (method) — Create a color image which encodes the signed distance values…
  PicoGK.SdfVisualizer.bDoesSliceContainDefect (method) — Checks if the scalar field slice contains a defective voxel
  PicoGK.SdfVisualizer.bVisualizeSdfSlicesAsTgaStack (method) — Saves a stack of TGA files, visualizing the signed distance…
  PicoGK.SdfVisualizer.SdfVisualizer (constructor)
PicoGK.SliceViz (class) [4 members] [category: CAD authoring]
  PicoGK.SliceViz.nSliceCount (property) — The number of slices in this voxel field
  PicoGK.SliceViz.SliceViz (constructor)
  PicoGK.SliceViz.Visualize (method) — Visualize the slice in the viewer using a normalized parameter…
  PicoGK.SliceViz.Dispose (method) — Dispose the object (IDispose)
PicoGK.SplitProgress (class) [3 members] [category: CAD authoring] — This class allows you to split progress reporting into multiple…
  PicoGK.SplitProgress.SplitProgress (constructor) — Create a new SplitProgress object
  PicoGK.SplitProgress.Progress (method) — Report progress from 0..1 - this function automatically scales the…
  PicoGK.SplitProgress.op_Increment (method) — Allow you to use ++ to count up to the…
PicoGK.SurfaceNormalFieldExtractor (class) [2 members] [category: CAD authoring]
  PicoGK.SurfaceNormalFieldExtractor.oExtract (method)
  PicoGK.SurfaceNormalFieldExtractor.InformActiveValue (method)
PicoGK.Text (class) [3 members] [category: CAD authoring]
  PicoGK.Text.oDefaultTypeface (property)
  PicoGK.Text.imgRenderText (method)
  PicoGK.Text.Text (constructor)
PicoGK.TgaIo (class) [4 members] [category: CAD authoring]
  PicoGK.TgaIo.SaveTga (method)
  PicoGK.TgaIo.GetFileInfo (method)
  PicoGK.TgaIo.LoadTga (method)
  PicoGK.TgaIo.TgaIo (constructor)
PicoGK.Utils (class) [13 members] [category: CAD authoring]
  PicoGK.Utils.TempFolder (class) [3 members] — Creates a temporary folder with an arbitrary filename in the…
    PicoGK.Utils.TempFolder.strFolder (field)
    PicoGK.Utils.TempFolder.TempFolder (constructor)
    PicoGK.Utils.TempFolder.Dispose (method)
  PicoGK.Utils.mshCreateCube (method) — Helper function to create simple box mesh from a bounding…
  PicoGK.Utils.strStripQuotesFromPath (method) — Strip quotes of a quoted path like "/usr/lib/" -> /usr/lib/
  PicoGK.Utils.strStripExtension (method) — Strips the extension from a filename
  PicoGK.Utils.bWaitForFileExistence (method) — Wait for a file's creation
  PicoGK.Utils.strHomeFolder (method) — Returns the path to the home folder (cross platform compatible)
  PicoGK.Utils.strDocumentsFolder (method) — Returns the path to the documents folder (cross platform compatible)
  PicoGK.Utils.strProjectRootFolder (method) — Returns the path to the source folder of your project,…
  PicoGK.Utils.strPicoGKSourceCodeFolder (method) — Returns the path to the source folder of PicoGK, making…
  PicoGK.Utils.strExecutableFolder (method) — Returns the path in which your current executable resides
  PicoGK.Utils.strDateTimeFilename (method) — Returns a file name in the form 20230930_134500 to be…
  PicoGK.Utils.strShorten (method) — Shorted a string, IF it is too long
  PicoGK.Utils.Utils (constructor)
PicoGK.Vdb2Cli (class) [2 members] [category: CAD authoring] — Helper class to save a voxel field contained in a…
  PicoGK.Vdb2Cli.Convert (method) — Convert a voxel field to a CLI slice file
  PicoGK.Vdb2Cli.Vdb2Cli (constructor)
PicoGK.VectorField (class) [8 members] [category: CAD authoring] — A Field of 3D floating point vectors
  PicoGK.VectorField.m_oMetadata (field) — VectorField metadata
  PicoGK.VectorField.oMetaData (method) — Return metadata borrowed from this field owner
  PicoGK.VectorField.VectorField (constructor) — Create an empty VectorField object
  PicoGK.VectorField.SetValue (method) — Sets the value at the specified position in mm When…
  PicoGK.VectorField.bGetValue (method) — Get the value at the specified position If the specified…
  PicoGK.VectorField.RemoveValue (method) — Removes the value at the specified position
  PicoGK.VectorField.TraverseActive (method) — Visit each active value in the vector field and call…
  PicoGK.VectorField.Dispose (method)
PicoGK.VectorFieldMerge (class) [2 members] [category: CAD authoring]
  PicoGK.VectorFieldMerge.Merge (method)
  PicoGK.VectorFieldMerge.InformActiveValue (method)

## CAD authoring — PicoGK (4) — `api-cad-authoring-picogk-4.md`

PicoGK.Viewer (class) [46 members] [category: CAD authoring] — PicoGK viewer
  PicoGK.Viewer.InfoCallback (type)
  PicoGK.Viewer.UpdateCallback (type)
  PicoGK.Viewer.KeyPressedCallback (type)
  PicoGK.Viewer.MouseMovedCallback (type)
  PicoGK.Viewer.MouseButtonCallback (type)
  PicoGK.Viewer.ScrollWheelCallback (type)
  PicoGK.Viewer.WindowSizelCallback (type)
  PicoGK.Viewer.GpuTex (class) [1 members]
    PicoGK.Viewer.GpuTex.Dispose (method)
  PicoGK.Viewer.ImageQuad (class) [1 members]
    PicoGK.Viewer.ImageQuad.Dispose (method)
  PicoGK.Viewer.SideBar (class) [1 members]
    PicoGK.Viewer.SideBar.Dispose (method)
  PicoGK.Viewer.bIsHosted (property) — True when viewer operations are delegated to an embedding backend
  PicoGK.Viewer.qOrientation (property) — Access to the rotational component (orientation) of the viewer
  PicoGK.Viewer.qOrientationHome (field)
  PicoGK.Viewer.qOrientationTop (field)
  PicoGK.Viewer.qOrientationBottom (field)
  PicoGK.Viewer.qOrientationFront (field)
  PicoGK.Viewer.qOrientationLeft (field)
  PicoGK.Viewer.qOrientationBack (field)
  PicoGK.Viewer.qOrientationRight (field)
  PicoGK.Viewer.IViewerAction (interface) [1 members] — An abstract interface for viewer actions
    PicoGK.Viewer.IViewerAction.Do (method) — Called from inside the main viewer thread to execute the…
  PicoGK.Viewer.AnimGroupMatrixRotate (class) [2 members]
    PicoGK.Viewer.AnimGroupMatrixRotate.AnimGroupMatrixRotate (constructor)
    PicoGK.Viewer.AnimGroupMatrixRotate.Do (method)
  PicoGK.Viewer.AnimViewRotate (class) [2 members] — Animate view rotation
    PicoGK.Viewer.AnimViewRotate.AnimViewRotate (constructor) — Animate movement to a viewer orientation
    PicoGK.Viewer.AnimViewRotate.Do (method)
  PicoGK.Viewer.Dispose (method)
  PicoGK.Viewer.SetMechanism (method) — Capture an application-defined mechanism on a hosted viewer
  PicoGK.Viewer.RequestUpdate (method) — Request a refresh of the viewer
  PicoGK.Viewer.LoadLightSetup (method) — Load the IBL light setup from the specified ZIP file
  PicoGK.Viewer.Add (method) — Add the object to the viewer, using the specified viewer…
  PicoGK.Viewer.Remove (method) — Removes the object from the viewer
  PicoGK.Viewer.SetObjectMatrix (method) — Set the transformation matrix for the specified object
  PicoGK.Viewer.RemoveAllObjects (method) — Remove all objects from the viewer
  PicoGK.Viewer.RequestScreenShot (method) — Request screenshot (TGA), which will be saved to the the…
  PicoGK.Viewer.EnableExperimental (method) — Enable/disable experimental rendering features
  PicoGK.Viewer.SetGroupVisible (method) — Enable or disable the display of a viewer group
  PicoGK.Viewer.SetGroupMaterial (method) — Assign a typed physical material to every object in the…
  PicoGK.Viewer.SetGroupMatrix (method) — Set the group's transformation matrix
  PicoGK.Viewer.EnableOverhangWarning (method) — Enables overhang severity visualization for the specified viewer group
  PicoGK.Viewer.DisableOverhangWarning (method) — Disables the overhang angle warning of the specified group
  PicoGK.Viewer.oBBox (method) — Returns the bounding box of all elements inside the view
  PicoGK.Viewer.SetBackgroundColor (method) — Sets the background color of the viewer
  PicoGK.Viewer.ZoomToFit (method) — Zoom to fit the contents of the viewer
  PicoGK.Viewer.SetFov (method) — Set Vertical Field of View in radians (i.e
  PicoGK.Viewer.bIsIdle (method) — Allows you to query if all viewer actions are complete
  PicoGK.Viewer.AddAnimation (method)
  PicoGK.Viewer.RemoveAllAnimations (method)
  PicoGK.Viewer.AddCross (method) — Marks the supplied coordinate with a cross-shaped polyline
  PicoGK.Viewer.AddArrow (method) — Adds an line ending in an arrow to the viewer
PicoGK.VoxCutViz (class) [4 members] [category: CAD authoring] — Visualizes the result of a voxel filed cut along an…
  PicoGK.VoxCutViz.nSliceCount (property) — Number of slices in the voxel field
  PicoGK.VoxCutViz.VoxCutViz (constructor) — Initializes a new VoxCutViz object with the specified Viewer and…
  PicoGK.VoxCutViz.Cut (method) — Cut the voxel field along the two normalized values (0…
  PicoGK.VoxCutViz.Dispose (method) — Call to stop the visualization (or let the object go…
PicoGK.Voxels (class) [70 members] [category: CAD authoring]
  PicoGK.Voxels.fVoxelSize (property) — Returns the voxel size in millimeters used in the voxel…
  PicoGK.Voxels.ESliceMode (enum) [3 members]
    PicoGK.Voxels.ESliceMode.SignedDistance (enumMember)
    PicoGK.Voxels.ESliceMode.BlackWhite (enumMember)
    PicoGK.Voxels.ESliceMode.Antialiased (enumMember)
  PicoGK.Voxels.ESliceAxis (enum) [3 members]
    PicoGK.Voxels.ESliceAxis.X (enumMember)
    PicoGK.Voxels.ESliceAxis.Y (enumMember)
    PicoGK.Voxels.ESliceAxis.Z (enumMember)
  PicoGK.Voxels.m_oMetadata (field)
  PicoGK.Voxels.oMetaData (method) — Return metadata borrowed from this field owner
  PicoGK.Voxels.Voxels (constructor) — Create a new empty voxels object, using the global library…
  PicoGK.Voxels.voxSphere (method) — Create a new Voxels object using the global library instance,…
  PicoGK.Voxels.voxLatticeBeam (method) — Returns a lattice beam with hemispherical ends internally uses an…
  PicoGK.Voxels.voxMeshShell (method) — Creates a shelled (hollow) Voxels object from a mesh
  PicoGK.Voxels.voxCombineAll (method) — Create a new Voxels object using the global library instance,…
  PicoGK.Voxels.voxFromVdbFile (method) — Create Voxels from a OpenVDB file (.vdb) using the global…
  PicoGK.Voxels.voxDuplicate (method) — Create a duplicate of the current voxel field
  PicoGK.Voxels.mshAsMesh (method) — Return the current voxel field as a mesh
  PicoGK.Voxels.bIsEmpty (method) — Checks whether this Voxels object is empty, i.e
  PicoGK.Voxels.nMemUsage (method) — Returns the amount of memory in bytes used by this…
  PicoGK.Voxels.BoolAdd (method) — Performs a boolean union between two voxel fields Our voxelfield…
  PicoGK.Voxels.voxBoolAdd (method) — Performs a boolean union operation on a copy of the…
  PicoGK.Voxels.BoolAddAll (method) — Performs a boolean union of all voxels supplied in the…
  PicoGK.Voxels.voxBoolAddAll (method) — Performs a boolean union of all voxels supplied in the…
  PicoGK.Voxels.voxCombine (method) — Combines two voxel fields and returns the result using BoolAdd
  PicoGK.Voxels.BoolSubtract (method) — Performs a boolean difference between the two voxel fields Our…
  PicoGK.Voxels.voxBoolSubtract (method) — Performs a boolean difference operation on a copy of the…
  PicoGK.Voxels.BoolSubtractAll (method) — Subtracts on all voxels supplied in the container (List, Array,…
  PicoGK.Voxels.voxBoolSubtractAll (method) — Subtracts on all voxels supplied in the container (List, Array,…
  PicoGK.Voxels.BoolIntersect (method) — Performs a boolean intersection between two voxel fields
  PicoGK.Voxels.voxBoolIntersect (method) — Performs a boolean intersection operation on a copy of the…
  PicoGK.Voxels.op_Addition (method) — Overloaded operators allow you to do things like vox =…
  PicoGK.Voxels.op_Subtraction (method) — Overloaded operators allow you to do things like vox =…
  PicoGK.Voxels.op_BitwiseAnd (method) — Overloaded operator for intersect (boolean AND) vox = vox1 &…
  PicoGK.Voxels.Trim (method) — Intersects the voxel field with the specified bounding box so…
  PicoGK.Voxels.voxTrim (method) — Intersects a copy of the voxel field with the specified…
  PicoGK.Voxels.Offset (method) — Offsets the voxel field by the specified distance
  PicoGK.Voxels.voxOffset (method) — Offsets a copy of the voxel field by the specified…
  PicoGK.Voxels.DoubleOffset (method) — Offsets the voxel field twice, by the specified distances Outwards…
  PicoGK.Voxels.voxDoubleOffset (method) — Offsets a copy of the voxel field twice, by the…
  PicoGK.Voxels.TripleOffset (method) — Offsets the voxel field three times by the specified distance
  PicoGK.Voxels.voxTripleOffset (method) — Offsets a copy of the voxel field three times by…
  PicoGK.Voxels.Smoothen (method) — Same as TripleOffset
  PicoGK.Voxels.voxSmoothen (method) — Same as TripleOffset
  PicoGK.Voxels.OverOffset (method) — Similar to DoubleOffset, but allows you to specify the offsetted…
  PicoGK.Voxels.voxOverOffset (method) — Similar to DoubleOffset, but allows you to specify the offsetted…
  PicoGK.Voxels.Fillet (method) — Creates a fillet-like effect
  PicoGK.Voxels.voxFillet (method) — Creates a fillet-like effect
  PicoGK.Voxels.voxShell (method) — Creates a shell of a voxel field
  PicoGK.Voxels.RenderMesh (method) — Renders a mesh into the voxel field, combining it with…
  PicoGK.Voxels.RenderImplicit (method) — Render an implicit signed distance function into the voxels overwriting…
  PicoGK.Voxels.IntersectImplicit (method) — Render an implicit signed distance function into the voxels but…
  PicoGK.Voxels.voxIntersectImplicit (method) — Same as IntersectImplicit, but uses a copy of the current…
  PicoGK.Voxels.RenderLattice (method) — Renders a lattice into the voxel field, combining it with…
  PicoGK.Voxels.ProjectZSlice (method) — Projects the slices at the start Z position upwards or…
  PicoGK.Voxels.voxProjectZSlice (method) — Makes a copy of the voxel field and applies the…
  PicoGK.Voxels.bIsEqual (method) — Returns true if the voxel fields contain the same content
  PicoGK.Voxels.CalculateProperties (method) — This function evaluates the entire voxel field and returns the…
  PicoGK.Voxels.oCalculateBoundingBox (method) — Calculates the bounding box of a voxel field Note
  PicoGK.Voxels.bIsInside (method) — Returns whether the location specified lies inside the solid domain…
  PicoGK.Voxels.vecSurfaceNormal (method) — Returns the normal of the surface found at the specified…
  PicoGK.Voxels.bClosestPointOnSurface (method) — Returns the closest point from the search point on the…
  PicoGK.Voxels.vecClosestPointOnSurface (method) — Returns the closest point from the search point on the…
  PicoGK.Voxels.bRayCastToSurface (method) — Casts a ray to the surface of a voxel field…
  PicoGK.Voxels.vecRayCastToSurface (method) — Casts a ray to the surface of a voxel field…
  PicoGK.Voxels.GetVoxelDimensions (method) — Returns the dimensions of the voxel field in discrete voxels
  PicoGK.Voxels.vecZSliceOrigin (method) — Query the real world origin of a voxel slice, which…
  PicoGK.Voxels.nSliceCount (method) — Return the number of slices in this voxel field
  PicoGK.Voxels.imgAllocateSlice (method) — Allocate a grayscale image that can hold a voxel slice
  PicoGK.Voxels.GetVoxelSlice (method) — Returns a slice of the voxel field along the specified…
  PicoGK.Voxels.GetInterpolatedVoxelSlice (method) — Returns a signed distance-field-encoded slice of the voxel field Reuses…
  PicoGK.Voxels.oVectorize (method) — Vectorize a Voxels object using Marching Squares
  PicoGK.Voxels.SaveToCliFile (method) — Save the voxel field to a .cli file CLI is…
  PicoGK.Voxels.SaveToVdbFile (method) — Creates a new .vdb file and saves the voxel field…
  PicoGK.Voxels.Dispose (method)

## CAD authoring — PicoGK.Numerics — `api-cad-authoring-picogk-numerics.md`

PicoGK.Numerics.ComparisonExtensions (class) [4 members] [category: CAD authoring] — Extensions that allow for fuzzy comparisons of types
  PicoGK.Numerics.ComparisonExtensions.bAlmostEqual (method) — Fuzzy comparison function to determine equality between two floats Can…
  PicoGK.Numerics.ComparisonExtensions.bAlmostLessOrEqual (method)
  PicoGK.Numerics.ComparisonExtensions.bAlmostMoreOrEqual (method)
  PicoGK.Numerics.ComparisonExtensions.bAlmostZero (method) — Fuzzy test for zero
PicoGK.Numerics.Cylindrical (struct) [7 members] [category: CAD authoring] — A coordinate in a cylindrical coordinate system
  PicoGK.Numerics.Cylindrical.R (field) — Distance from the cylinder's axis
  PicoGK.Numerics.Cylindrical.Phi (field) — Azimuth angle in the XY plane
  PicoGK.Numerics.Cylindrical.Z (field) — Position along the Z axis
  PicoGK.Numerics.Cylindrical.Cylindrical (constructor) — Initialize a new cylindrical coordinate
  PicoGK.Numerics.Cylindrical.vecAsCartesian (method) — Convert a cylindrical coordinate into a cartesian coordinate
  PicoGK.Numerics.Cylindrical.oLerp (method) — Linear interpolation between two Cylindrical coordinates (in Cylindrical coordinate space)
  PicoGK.Numerics.Cylindrical.ToString (method) — Convert the cylindrical coordinate to a string
PicoGK.Numerics.FloatExt (class) [1 members] [category: CAD authoring]
  PicoGK.Numerics.FloatExt.bIsFinite (method) — Checks whether the value is finite, i.e
PicoGK.Numerics.Overhang (struct) [24 members] [category: CAD authoring]
  PicoGK.Numerics.Overhang.uNone (property) — No overhang (0%)
  PicoGK.Numerics.Overhang.uFull (property) — Maximum overhang (100%)
  PicoGK.Numerics.Overhang.fNormalized (property) — Normalized overhang severity from 0..1 - 0.0
  PicoGK.Numerics.Overhang.fPercent (property) — Normalized overhang severity from 0..100% - 0
  PicoGK.Numerics.Overhang.fRad (property) — Overhang angle in radians - 0
  PicoGK.Numerics.Overhang.fDeg (property) — Overhang angle in degrees - 0
  PicoGK.Numerics.Overhang.fDegFromHorizontal (property) — Overhang angle in degrees, measured from the horizontal plane Used…
  PicoGK.Numerics.Overhang.uFromNormalized (method) — Create a new Overhang, using normalized overhang severity from 0..1…
  PicoGK.Numerics.Overhang.uFromPercent (method) — Create a new Overhang, based on percent value (0..100) -…
  PicoGK.Numerics.Overhang.uFromRad (method) — Create a new Overhang, based on radians value (0..Pi/2) -…
  PicoGK.Numerics.Overhang.uFromDeg (method) — Create a new Overhang, based on degrees value (0..90) -…
  PicoGK.Numerics.Overhang.uFromDegFromHorizontal (method) — Create a new Overhang from an angle in degrees, measured…
  PicoGK.Numerics.Overhang.bExceeds (method) — Allows you to write something like uOverhang.bExceeds(Overhang.uFromPercent(50)) You can also…
  PicoGK.Numerics.Overhang.ToString (method)
  PicoGK.Numerics.Overhang.CompareTo (method)
  PicoGK.Numerics.Overhang.Equals (method)
  PicoGK.Numerics.Overhang.GetHashCode (method)
  PicoGK.Numerics.Overhang.op_LessThan (method)
  PicoGK.Numerics.Overhang.op_GreaterThan (method)
  PicoGK.Numerics.Overhang.op_LessThanOrEqual (method)
  PicoGK.Numerics.Overhang.op_GreaterThanOrEqual (method)
  PicoGK.Numerics.Overhang.op_Equality (method)
  PicoGK.Numerics.Overhang.op_Inequality (method)
  PicoGK.Numerics.Overhang.Overhang (constructor)
PicoGK.Numerics.Polar (struct) [6 members] [category: CAD authoring] — A polar coordinate
  PicoGK.Numerics.Polar.R (field) — Distance from the center of the coordinate system
  PicoGK.Numerics.Polar.Phi (field) — Azimuth angle in the XY plane
  PicoGK.Numerics.Polar.Polar (constructor) — Initialize a new polar coordinate
  PicoGK.Numerics.Polar.vecAsCartesian (method) — Return the polar coordinate as a cartesian coordinate
  PicoGK.Numerics.Polar.oLerp (method) — Linear interpolation between two polar coordinates (in Polar coordinate space)
  PicoGK.Numerics.Polar.ToString (method) — Convert the polar coordinate to a string
PicoGK.Numerics.Rad (struct) [48 members] [category: CAD authoring] — This type encapsulates an angle in Radians, with helper functions…
  PicoGK.Numerics.Rad.TwoPi (constant) — Defines 2*Pi, which is constantly being used in Rad angles
  PicoGK.Numerics.Rad.Zero (field) — Zero degrees angles
  PicoGK.Numerics.Rad.Full (field) — 360º angle
  PicoGK.Numerics.Rad.Half (field) — 180º angle
  PicoGK.Numerics.Rad.Quarter (field) — 90º angle
  PicoGK.Numerics.Rad.Deg0 (field) — 0º angle
  PicoGK.Numerics.Rad.Deg360 (field) — 360º angle
  PicoGK.Numerics.Rad.Deg180 (field) — 180º angle
  PicoGK.Numerics.Rad.Deg90 (field) — 90º angle
  PicoGK.Numerics.Rad.Deg45 (field) — 45º angle
  PicoGK.Numerics.Rad.fRad (property) — float value of the angle in radians
  PicoGK.Numerics.Rad.fDeg (property) — angle in degrees
  PicoGK.Numerics.Rad.Rad (constructor) — Initialize a new Rad value from a float radians angle
  PicoGK.Numerics.Rad.rFromRad (method) — Create new Rad value from a float radians angle
  PicoGK.Numerics.Rad.rFromDeg (method) — Create a new Rad value from a floating point angle…
  PicoGK.Numerics.Rad.rFromNormalized (method) — Create a new Rad value from a normalized value 0..1,…
  PicoGK.Numerics.Rad.rNormalizedSigned (method) — Return the angle normalized to the range -π .
  PicoGK.Numerics.Rad.rNormalizedPositive (method) — Return the angle normalized to the range [0, 2π)
  PicoGK.Numerics.Rad.op_Implicit (method) — Implicit conversion from a Rad value into float for seamless…
  PicoGK.Numerics.Rad.op_Explicit (method) — Explicit conversion from float to Rad value
  PicoGK.Numerics.Rad.bAlmostEqual (method) — Test for fuzzy equality
  PicoGK.Numerics.Rad.bAlmostEqualPeriodic (method) — Tests for fuzzy equality of the normalized angle (0º ==…
  PicoGK.Numerics.Rad.bIsFinite (method) — Checks whether the angle value is finite, i.e
  PicoGK.Numerics.Rad.fSin (method) — Returns the sine of the angle
  PicoGK.Numerics.Rad.fCos (method) — Returns the cosine of the angle
  PicoGK.Numerics.Rad.fTan (method) — Returns the tangent of the angle
  PicoGK.Numerics.Rad.rAtan2 (method) — Computes the angle of the vector from the positive X…
  PicoGK.Numerics.Rad.rAtan (method) — Computes the arc tangent of the value
  PicoGK.Numerics.Rad.rAcos (method) — Returns the arc cosine of the value and returns the…
  PicoGK.Numerics.Rad.rAcosClamped (method) — Returns the arc cosine of the value after clamping it…
  PicoGK.Numerics.Rad.rAsin (method) — Returns the arc sine of the value and returns the…
  PicoGK.Numerics.Rad.rAsinClamped (method) — Returns the arc cosine of the value after clamping it…
  PicoGK.Numerics.Rad.op_Addition (method)
  PicoGK.Numerics.Rad.op_Subtraction (method)
  PicoGK.Numerics.Rad.op_Multiply (method)
  PicoGK.Numerics.Rad.op_Division (method)
  PicoGK.Numerics.Rad.op_UnaryPlus (method)
  PicoGK.Numerics.Rad.op_UnaryNegation (method)
  PicoGK.Numerics.Rad.ToString (method)
  PicoGK.Numerics.Rad.CompareTo (method)
  PicoGK.Numerics.Rad.Equals (method)
  PicoGK.Numerics.Rad.GetHashCode (method)
  PicoGK.Numerics.Rad.op_LessThan (method)
  PicoGK.Numerics.Rad.op_GreaterThan (method)
  PicoGK.Numerics.Rad.op_LessThanOrEqual (method)
  PicoGK.Numerics.Rad.op_GreaterThanOrEqual (method)
  PicoGK.Numerics.Rad.op_Equality (method)
  PicoGK.Numerics.Rad.op_Inequality (method)
PicoGK.Numerics.Spherical (struct) [7 members] [category: CAD authoring]
  PicoGK.Numerics.Spherical.R (field) — Distance from the sphere center
  PicoGK.Numerics.Spherical.Phi (field) — Azimuth angle in the XY plane, measured from +X toward…
  PicoGK.Numerics.Spherical.Theta (field) — Polar angle measured from +Z toward the XY plane and…
  PicoGK.Numerics.Spherical.Spherical (constructor) — Initializes a new Spherical coordinate
  PicoGK.Numerics.Spherical.vecAsCartesian (method) — Convert the spherical coordinate to a cartesian coordinate
  PicoGK.Numerics.Spherical.oLerp (method) — Linear interpolation between two Spherical coordinates (in Spherical coordinate space)
  PicoGK.Numerics.Spherical.ToString (method) — Convert the spherical coordinate to a string
PicoGK.Numerics.Tolerances (class) [4 members] [category: CAD authoring] — Default tolerances for comparisons
  PicoGK.Numerics.Tolerances.fDef (constant) — Default tolerance for fuzzy comparisons
  PicoGK.Numerics.Tolerances.fDefSquared (constant) — Default squared tolerance for fuzzy comparisons
  PicoGK.Numerics.Tolerances.fZero (constant) — Default number regarded as zero for fuzzy zero check Chosen…
  PicoGK.Numerics.Tolerances.fZeroSquared (constant) — Default squared number regarded as zero for fuzzy zero check
PicoGK.Numerics.VectorExt (class) [11 members] [category: CAD authoring] — Extensions to the Vector2 and Vector3 System.Numerics types
  PicoGK.Numerics.VectorExt.vecNormalized (method) — Returns the normalized version of this vector (length 1) Can…
  PicoGK.Numerics.VectorExt.vecSafeNormalized (method) — Returns the normalized version of this vector (length 1) Returns…
  PicoGK.Numerics.VectorExt.vecStripZ (method) — Converts a Vector3 into a Vector2 by stripping the Z…
  PicoGK.Numerics.VectorExt.vecAsVector3 (method) — Converts a Vector2 into a Vector3 by adding a Z…
  PicoGK.Numerics.VectorExt.vecPtWorld (method) — Helper function to convert a point to world coordinates using…
  PicoGK.Numerics.VectorExt.vecDirWorld (method) — Helper function to convert a direction to world coordinates using…
  PicoGK.Numerics.VectorExt.vecPtLocal (method) — Helper function to convert a point to local coordinates using…
  PicoGK.Numerics.VectorExt.vecDirLocal (method) — Helper function to convert a direction to local coordinates using…
  PicoGK.Numerics.VectorExt.vecTransformed (method) — Returns a matrix-transformed version of the vector
  PicoGK.Numerics.VectorExt.vecMirrored (method) — Returns a mirrored version of the vector
  PicoGK.Numerics.VectorExt.bIsFinite (method) — Checks whether all vector coordinate values are finite, i.e

## CAD authoring — PicoGK.Shapes — `api-cad-authoring-picogk-shapes.md`

PicoGK.Shapes.Arc2d (struct) [8 members] [category: CAD authoring] — A circular arc in 2D space
  PicoGK.Shapes.Arc2d.vecStart (property) — Start coordinate
  PicoGK.Shapes.Arc2d.vecEnd (property) — End coordinate
  PicoGK.Shapes.Arc2d.vecCenter (property) — Center point
  PicoGK.Shapes.Arc2d.rAngle (property) — Angle in radians (positive is counter clockwise)
  PicoGK.Shapes.Arc2d.fRadius (property) — Radius of the arc
  PicoGK.Shapes.Arc2d.fLength (property)
  PicoGK.Shapes.Arc2d.Arc2d (constructor) — Construct a new 2D arc with the specified start point,…
  PicoGK.Shapes.Arc2d.vecPtAtT (method)
PicoGK.Shapes.Circle (struct) [5 members] [category: CAD authoring] — Class to represent an circle as a normalized path/contour
  PicoGK.Shapes.Circle.fR (property) — Radius of the circle
  PicoGK.Shapes.Circle.fLength (property)
  PicoGK.Shapes.Circle.Circle (constructor) — Create a Circle contour with radius fR
  PicoGK.Shapes.Circle.vecPtAtT (method)
  PicoGK.Shapes.Circle.PtAtT (method)
PicoGK.Shapes.ContourFromPath (class) [4 members] [category: CAD authoring] — This class allows you to use a closed path as…
  PicoGK.Shapes.ContourFromPath.fLength (property)
  PicoGK.Shapes.ContourFromPath.ContourFromPath (constructor) — Create a IContour2d-compatible contour from an existing closed path The…
  PicoGK.Shapes.ContourFromPath.vecPtAtT (method)
  PicoGK.Shapes.ContourFromPath.vecPtAtTLinear (method)
PicoGK.Shapes.ContourSampler2d (class) [4 members] [category: CAD authoring] — Implements a way to adaptively sample a contour to retrieve…
  PicoGK.Shapes.ContourSampler2d.ISampleable (interface) [1 members] — This interface enables a contour to be sampled in linear…
    PicoGK.Shapes.ContourSampler2d.ISampleable.vecPtAtTLinear (method) — Return the uncorrected position at linear t (uncorrected)
  PicoGK.Shapes.ContourSampler2d.fTotalLength (property) — Return sum of all arc segement lengths
  PicoGK.Shapes.ContourSampler2d.ContourSampler2d (constructor) — Adaptively sample the contour to map the linear time to…
  PicoGK.Shapes.ContourSampler2d.fArcTFromLinearT (method) — Convert from linear t to arc-length t
PicoGK.Shapes.Ellipse (class) [8 members] [category: CAD authoring] — Class to represent an ellipse as a normalized path/contour
  PicoGK.Shapes.Ellipse.fPhi (property) — Rotation angle of the ellipse
  PicoGK.Shapes.Ellipse.rPhi (property) — Rotation angle of the ellipse
  PicoGK.Shapes.Ellipse.fA (property) — Half-length of the ellipse in A
  PicoGK.Shapes.Ellipse.fB (property) — Half-length of the ellipse in B
  PicoGK.Shapes.Ellipse.fLength (property)
  PicoGK.Shapes.Ellipse.Ellipse (constructor) — Constructor using axis A vector and axis B length
  PicoGK.Shapes.Ellipse.vecPtAtTLinear (method)
  PicoGK.Shapes.Ellipse.vecPtAtT (method)
PicoGK.Shapes.Frame3d (struct) [32 members] [category: CAD authoring] — The Frame3d object stores a local coordinate system, i.e
  PicoGK.Shapes.Frame3d.frmWorld (field) — Local frame representing the world coordinate system
  PicoGK.Shapes.Frame3d.vecPos (property) — Position of the origin of the Frame3d
  PicoGK.Shapes.Frame3d.vecLx (property) — Direction of the local X axis in world coordinates
  PicoGK.Shapes.Frame3d.vecLy (property) — Direction of the local Y axis in world coordinates
  PicoGK.Shapes.Frame3d.vecLz (property) — Direction of the local Z axis in world coordinates
  PicoGK.Shapes.Frame3d.frmFromPos (method) — Create a Frame3d at the specified position with axes aligned…
  PicoGK.Shapes.Frame3d.frmFromZX (method) — Create a Frame3d at the specified position with local axes…
  PicoGK.Shapes.Frame3d.Frame3d (constructor) — Creates a local coordinate system with world-aligned axes at the…
  PicoGK.Shapes.Frame3d.frmFromMatrix4x4 (method) — Creates a Frame3d from a System.Numerics row-vector rigid transform
  PicoGK.Shapes.Frame3d.vecPtToWorld (method) — Convert a local coordinate to world coordinates
  PicoGK.Shapes.Frame3d.vecDirToWorld (method) — Convert a local direction to a world direction
  PicoGK.Shapes.Frame3d.vecPtFromWorld (method) — Return local coordinate from world coordinates
  PicoGK.Shapes.Frame3d.vecDirFromWorld (method) — Return local direction from world direction
  PicoGK.Shapes.Frame3d.frmCompose (method) — Create a combined Frame3d from this frame and another
  PicoGK.Shapes.Frame3d.frmInverse (method) — Create an inverted Frame3d object
  PicoGK.Shapes.Frame3d.frmMovedLocal (method) — Move the origin of the Frame3d object by the specified…
  PicoGK.Shapes.Frame3d.frmMovedLocalX (method) — Move the Frame3d origin by the specified distance in X…
  PicoGK.Shapes.Frame3d.frmMovedLocalY (method) — Move the Frame3d origin by the specified distance in Y…
  PicoGK.Shapes.Frame3d.frmMovedLocalZ (method) — Move the Frame3d origin by the specified distance in Z…
  PicoGK.Shapes.Frame3d.frmRotatedWorld (method) — Rotate the Frame3d around an arbitrary (world-space) axis through the…
  PicoGK.Shapes.Frame3d.frmMovedWorld (method) — Move the origin of the Frame3d object by the specified…
  PicoGK.Shapes.Frame3d.frmMovedWorldX (method) — Move the Frame3d origin by the specified distance in X…
  PicoGK.Shapes.Frame3d.frmMovedWorldY (method) — Move the Frame3d origin by the specified distance in Y…
  PicoGK.Shapes.Frame3d.frmMovedWorldZ (method) — Move the Frame3d origin by the specified distance in Z…
  PicoGK.Shapes.Frame3d.matAsMatrix4x4 (method) — Convert the Frame3d transformation to an equivalent Matrix4x4 transform (basis…
  PicoGK.Shapes.Frame3d.frmRepositioned (method) — Return a frame which has been repositioned to the supplied…
  PicoGK.Shapes.Frame3d.AsRigid (method) — Return the transformation as Quaternion plus Origin
  PicoGK.Shapes.Frame3d.matComposeWithScale (method) — Helper function to drawing a scaled quad aligned to this…
  PicoGK.Shapes.Frame3d.op_Multiply (method) — Convert local point to a world coordinate (same as vecToWorld)…
  PicoGK.Shapes.Frame3d.frmInterpolate (method) — Interpolate between two Frame3d pos/orientations
  PicoGK.Shapes.Frame3d.Equals (method) — Test for equality (IEquatable)
  PicoGK.Shapes.Frame3d.GetHashCode (method) — Create hash code (IEquatable)
PicoGK.Shapes.IContour2d (interface) [2 members] [category: CAD authoring] — Interface to represent a normalized closed contour in 2D which…
  PicoGK.Shapes.IContour2d.PtAtT (method) — Function to return both point and normal at t
  PicoGK.Shapes.IContour2d.vecSampleNormalAt (method) — Sample the normal at fT Helper function used by PtAtT
PicoGK.Shapes.IContour3d (interface) [1 members] [category: CAD authoring] — A two dimensional closed contour aligned in a plane in…
  PicoGK.Shapes.IContour3d.PtAtT (method) — Returns the point and normal at position t (0..1) As…
PicoGK.Shapes.IPath2d (interface) [2 members] [category: CAD authoring] — Interface to represent a normalized path in 2D space which…
  PicoGK.Shapes.IPath2d.fLength (property) — Length of the entire contour
  PicoGK.Shapes.IPath2d.vecPtAtT (method) — Returns the point at position t (0..1) As t increases…
PicoGK.Shapes.IPath3d (interface) [2 members] [category: CAD authoring] — Interface to represent a normalized path in 2D space which…
  PicoGK.Shapes.IPath3d.fLength (property) — Length of the entire contour
  PicoGK.Shapes.IPath3d.vecPtAtT (method) — Returns the point at position t (0..1) As t increases…
PicoGK.Shapes.Line2d (struct) [5 members] [category: CAD authoring] — A 2d line
  PicoGK.Shapes.Line2d.vecA (property) — Start coordinate
  PicoGK.Shapes.Line2d.vecB (property) — End coordinate
  PicoGK.Shapes.Line2d.fLength (property)
  PicoGK.Shapes.Line2d.Line2d (constructor) — Construct a line with the specified start and end coordinates
  PicoGK.Shapes.Line2d.vecPtAtT (method)
PicoGK.Shapes.OrientedContour (class) [4 members] [category: CAD authoring] — Represents an oriented 2D contour placed in 3D space by…
  PicoGK.Shapes.OrientedContour.fLength (property)
  PicoGK.Shapes.OrientedContour.OrientedContour (constructor) — Create an oriented contour from a 2D contour and a…
  PicoGK.Shapes.OrientedContour.vecPtAtT (method)
  PicoGK.Shapes.OrientedContour.PtAtT (method)
PicoGK.Shapes.OrientedPath (class) [3 members] [category: CAD authoring] — Interface to represent a normalized 2D path oriented in space…
  PicoGK.Shapes.OrientedPath.fLength (property)
  PicoGK.Shapes.OrientedPath.OrientedPath (constructor)
  PicoGK.Shapes.OrientedPath.vecPtAtT (method)
PicoGK.Shapes.Path2d (class) [8 members] [category: CAD authoring] — A compound path which consists of a list of other…
  PicoGK.Shapes.Path2d.fLength (property)
  PicoGK.Shapes.Path2d.Add (method) — Add another path to the compound path Note, the start…
  PicoGK.Shapes.Path2d.AddLine (method) — Append a line to the specified coordinate
  PicoGK.Shapes.Path2d.AddLineRel (method) — Append a line relative to current end point
  PicoGK.Shapes.Path2d.AddArc (method) — Append an arc with the specified center and angle The…
  PicoGK.Shapes.Path2d.AddArcRel (method) — Add an arc with the specified center, relative to the…
  PicoGK.Shapes.Path2d.vecPtAtT (method)
  PicoGK.Shapes.Path2d.Path2d (constructor)
PicoGK.Shapes.Supershape (class) [5 members] [category: CAD authoring] — Implements the supershape formula for interesting 2D contours
  PicoGK.Shapes.Supershape.fLength (property)
  PicoGK.Shapes.Supershape.oRoundedPolygon (method) — Helper function to create simple rounded polygons based on the…
  PicoGK.Shapes.Supershape.Supershape (constructor) — Constructor for a supershape with superformula parameters and rotation
  PicoGK.Shapes.Supershape.vecPtAtT (method)
  PicoGK.Shapes.Supershape.vecPtAtTLinear (method)

## Selected BCL reference — System — `api-selected-bcl-reference-system.md`

System.Array (class) [41 members] [category: Selected BCL reference]
  System.Array.Length (property)
  System.Array.LongLength (property)
  System.Array.Rank (property)
  System.Array.SyncRoot (property)
  System.Array.IsReadOnly (property)
  System.Array.IsFixedSize (property)
  System.Array.IsSynchronized (property)
  System.Array.MaxLength (property)
  System.Array.Initialize (method)
  System.Array.AsReadOnly (method)
  System.Array.Resize (method)
  System.Array.CreateInstance (method)
  System.Array.CreateInstanceFromArrayType (method)
  System.Array.Copy (method)
  System.Array.ConstrainedCopy (method)
  System.Array.Clear (method)
  System.Array.GetLength (method)
  System.Array.GetUpperBound (method)
  System.Array.GetLowerBound (method)
  System.Array.GetValue (method)
  System.Array.SetValue (method)
  System.Array.GetLongLength (method)
  System.Array.Clone (method)
  System.Array.BinarySearch (method)
  System.Array.ConvertAll (method)
  System.Array.CopyTo (method)
  System.Array.Empty (method)
  System.Array.Exists (method)
  System.Array.Fill (method)
  System.Array.Find (method)
  System.Array.FindAll (method)
  System.Array.FindIndex (method)
  System.Array.FindLast (method)
  System.Array.FindLastIndex (method)
  System.Array.ForEach (method)
  System.Array.IndexOf (method)
  System.Array.LastIndexOf (method)
  System.Array.Reverse (method)
  System.Array.Sort (method)
  System.Array.TrueForAll (method)
  System.Array.GetEnumerator (method)
System.Console (class) [48 members] [category: Selected BCL reference]
  System.Console.In (property)
  System.Console.InputEncoding (property)
  System.Console.OutputEncoding (property)
  System.Console.KeyAvailable (property)
  System.Console.Out (property)
  System.Console.Error (property)
  System.Console.IsInputRedirected (property)
  System.Console.IsOutputRedirected (property)
  System.Console.IsErrorRedirected (property)
  System.Console.CursorSize (property)
  System.Console.NumberLock (property)
  System.Console.CapsLock (property)
  System.Console.BackgroundColor (property)
  System.Console.ForegroundColor (property)
  System.Console.BufferWidth (property)
  System.Console.BufferHeight (property)
  System.Console.WindowLeft (property)
  System.Console.WindowTop (property)
  System.Console.WindowWidth (property)
  System.Console.WindowHeight (property)
  System.Console.LargestWindowWidth (property)
  System.Console.LargestWindowHeight (property)
  System.Console.CursorVisible (property)
  System.Console.CursorLeft (property)
  System.Console.CursorTop (property)
  System.Console.Title (property)
  System.Console.TreatControlCAsInput (property)
  System.Console.CancelKeyPress (field)
  System.Console.ReadKey (method)
  System.Console.ResetColor (method)
  System.Console.SetBufferSize (method)
  System.Console.SetWindowPosition (method)
  System.Console.SetWindowSize (method)
  System.Console.GetCursorPosition (method)
  System.Console.Beep (method)
  System.Console.MoveBufferArea (method)
  System.Console.Clear (method)
  System.Console.SetCursorPosition (method)
  System.Console.OpenStandardInput (method)
  System.Console.OpenStandardOutput (method)
  System.Console.OpenStandardError (method)
  System.Console.SetIn (method)
  System.Console.SetOut (method)
  System.Console.SetError (method)
  System.Console.Read (method)
  System.Console.ReadLine (method)
  System.Console.WriteLine (method)
  System.Console.Write (method)

## Selected BCL reference — System (2) — `api-selected-bcl-reference-system-2.md`

System.Convert (class) [31 members] [category: Selected BCL reference]
  System.Convert.DBNull (field)
  System.Convert.GetTypeCode (method)
  System.Convert.IsDBNull (method)
  System.Convert.ChangeType (method)
  System.Convert.ToBoolean (method)
  System.Convert.ToChar (method)
  System.Convert.ToSByte (method)
  System.Convert.ToByte (method)
  System.Convert.ToInt16 (method)
  System.Convert.ToUInt16 (method)
  System.Convert.ToInt32 (method)
  System.Convert.ToUInt32 (method)
  System.Convert.ToInt64 (method)
  System.Convert.ToUInt64 (method)
  System.Convert.ToSingle (method)
  System.Convert.ToDouble (method)
  System.Convert.ToDecimal (method)
  System.Convert.ToDateTime (method)
  System.Convert.ToString (method)
  System.Convert.ToBase64String (method)
  System.Convert.ToBase64CharArray (method)
  System.Convert.TryToBase64Chars (method)
  System.Convert.FromBase64String (method)
  System.Convert.TryFromBase64String (method)
  System.Convert.TryFromBase64Chars (method)
  System.Convert.FromBase64CharArray (method)
  System.Convert.FromHexString (method)
  System.Convert.ToHexString (method)
  System.Convert.TryToHexString (method)
  System.Convert.ToHexStringLower (method)
  System.Convert.TryToHexStringLower (method)
System.Math (class) [46 members] [category: Selected BCL reference]
  System.Math.E (constant)
  System.Math.PI (constant)
  System.Math.Tau (constant)
  System.Math.Acos (method)
  System.Math.Acosh (method)
  System.Math.Asin (method)
  System.Math.Asinh (method)
  System.Math.Atan (method)
  System.Math.Atanh (method)
  System.Math.Atan2 (method)
  System.Math.Cbrt (method)
  System.Math.Ceiling (method)
  System.Math.Cos (method)
  System.Math.Cosh (method)
  System.Math.Exp (method)
  System.Math.Floor (method)
  System.Math.FusedMultiplyAdd (method)
  System.Math.Log (method)
  System.Math.Log2 (method)
  System.Math.Log10 (method)
  System.Math.Pow (method)
  System.Math.Sin (method)
  System.Math.SinCos (method)
  System.Math.Sinh (method)
  System.Math.Sqrt (method)
  System.Math.Tan (method)
  System.Math.Tanh (method)
  System.Math.Abs (method)
  System.Math.BigMul (method)
  System.Math.BitDecrement (method)
  System.Math.BitIncrement (method)
  System.Math.CopySign (method)
  System.Math.DivRem (method)
  System.Math.Clamp (method)
  System.Math.IEEERemainder (method)
  System.Math.ILogB (method)
  System.Math.Max (method)
  System.Math.MaxMagnitude (method)
  System.Math.Min (method)
  System.Math.MinMagnitude (method)
  System.Math.ReciprocalEstimate (method)
  System.Math.ReciprocalSqrtEstimate (method)
  System.Math.Round (method)
  System.Math.Sign (method)
  System.Math.Truncate (method)
  System.Math.ScaleB (method)
System.MathF (class) [43 members] [category: Selected BCL reference]
  System.MathF.E (constant)
  System.MathF.PI (constant)
  System.MathF.Tau (constant)
  System.MathF.Acos (method)
  System.MathF.Acosh (method)
  System.MathF.Asin (method)
  System.MathF.Asinh (method)
  System.MathF.Atan (method)
  System.MathF.Atanh (method)
  System.MathF.Atan2 (method)
  System.MathF.Cbrt (method)
  System.MathF.Ceiling (method)
  System.MathF.Cos (method)
  System.MathF.Cosh (method)
  System.MathF.Exp (method)
  System.MathF.Floor (method)
  System.MathF.FusedMultiplyAdd (method)
  System.MathF.Log (method)
  System.MathF.Log2 (method)
  System.MathF.Log10 (method)
  System.MathF.Pow (method)
  System.MathF.Sin (method)
  System.MathF.SinCos (method)
  System.MathF.Sinh (method)
  System.MathF.Sqrt (method)
  System.MathF.Tan (method)
  System.MathF.Tanh (method)
  System.MathF.Abs (method)
  System.MathF.BitDecrement (method)
  System.MathF.BitIncrement (method)
  System.MathF.CopySign (method)
  System.MathF.IEEERemainder (method)
  System.MathF.ILogB (method)
  System.MathF.Max (method)
  System.MathF.MaxMagnitude (method)
  System.MathF.Min (method)
  System.MathF.MinMagnitude (method)
  System.MathF.ReciprocalEstimate (method)
  System.MathF.ReciprocalSqrtEstimate (method)
  System.MathF.Round (method)
  System.MathF.Sign (method)
  System.MathF.Truncate (method)
  System.MathF.ScaleB (method)

## Selected BCL reference — System (3) — `api-selected-bcl-reference-system-3.md`

System.Random (class) [11 members] [category: Selected BCL reference]
  System.Random.Shared (property)
  System.Random.Random (constructor)
  System.Random.Next (method)
  System.Random.NextInt64 (method)
  System.Random.NextSingle (method)
  System.Random.NextDouble (method)
  System.Random.NextBytes (method)
  System.Random.GetItems (method)
  System.Random.Shuffle (method)
  System.Random.GetString (method)
  System.Random.GetHexString (method)
System.String (class) [54 members] [category: Selected BCL reference]
  System.String.Empty (field)
  System.String.this[int index] (property)
  System.String.Length (property)
  System.String.Intern (method)
  System.String.IsInterned (method)
  System.String.Compare (method)
  System.String.CompareOrdinal (method)
  System.String.CompareTo (method)
  System.String.EndsWith (method)
  System.String.Equals (method)
  System.String.op_Equality (method)
  System.String.op_Inequality (method)
  System.String.GetHashCode (method)
  System.String.StartsWith (method)
  System.String.String (constructor)
  System.String.Create (method)
  System.String.op_Implicit (method)
  System.String.Clone (method)
  System.String.Copy (method)
  System.String.CopyTo (method)
  System.String.TryCopyTo (method)
  System.String.ToCharArray (method)
  System.String.IsNullOrEmpty (method)
  System.String.IsNullOrWhiteSpace (method)
  System.String.GetPinnableReference (method)
  System.String.ToString (method)
  System.String.GetEnumerator (method)
  System.String.EnumerateRunes (method)
  System.String.GetTypeCode (method)
  System.String.IsNormalized (method)
  System.String.Normalize (method)
  System.String.Concat (method)
  System.String.Format (method)
  System.String.Insert (method)
  System.String.Join (method)
  System.String.PadLeft (method)
  System.String.PadRight (method)
  System.String.Remove (method)
  System.String.Replace (method)
  System.String.ReplaceLineEndings (method)
  System.String.Split (method)
  System.String.Substring (method)
  System.String.ToLower (method)
  System.String.ToLowerInvariant (method)
  System.String.ToUpper (method)
  System.String.ToUpperInvariant (method)
  System.String.Trim (method)
  System.String.TrimStart (method)
  System.String.TrimEnd (method)
  System.String.Contains (method)
  System.String.IndexOf (method)
  System.String.IndexOfAny (method)
  System.String.LastIndexOf (method)
  System.String.LastIndexOfAny (method)

## Selected BCL reference — System.Collections.Generic — `api-selected-bcl-reference-system-collections-generic.md`

System.Collections.Generic.Dictionary (class) [25 members] [category: Selected BCL reference]
  System.Collections.Generic.Dictionary.Comparer (property)
  System.Collections.Generic.Dictionary.Count (property)
  System.Collections.Generic.Dictionary.Capacity (property)
  System.Collections.Generic.Dictionary.Keys (property)
  System.Collections.Generic.Dictionary.Values (property)
  System.Collections.Generic.Dictionary.this[TKey key] (property)
  System.Collections.Generic.Dictionary.AlternateLookup (struct) [7 members]
    System.Collections.Generic.Dictionary.AlternateLookup.Dictionary (property)
    System.Collections.Generic.Dictionary.AlternateLookup.this[TAlternateKey key] (property)
    System.Collections.Generic.Dictionary.AlternateLookup.AlternateLookup (constructor)
    System.Collections.Generic.Dictionary.AlternateLookup.TryGetValue (method)
    System.Collections.Generic.Dictionary.AlternateLookup.ContainsKey (method)
    System.Collections.Generic.Dictionary.AlternateLookup.Remove (method)
    System.Collections.Generic.Dictionary.AlternateLookup.TryAdd (method)
  System.Collections.Generic.Dictionary.Enumerator (struct) [4 members]
    System.Collections.Generic.Dictionary.Enumerator.Current (property)
    System.Collections.Generic.Dictionary.Enumerator.Enumerator (constructor)
    System.Collections.Generic.Dictionary.Enumerator.MoveNext (method)
    System.Collections.Generic.Dictionary.Enumerator.Dispose (method)
  System.Collections.Generic.Dictionary.KeyCollection (class) [6 members]
    System.Collections.Generic.Dictionary.KeyCollection.Count (property)
    System.Collections.Generic.Dictionary.KeyCollection.Enumerator (struct) [4 members]
      System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Current (property)
      System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Enumerator (constructor)
      System.Collections.Generic.Dictionary.KeyCollection.Enumerator.Dispose (method)
      System.Collections.Generic.Dictionary.KeyCollection.Enumerator.MoveNext (method)
    System.Collections.Generic.Dictionary.KeyCollection.KeyCollection (constructor)
    System.Collections.Generic.Dictionary.KeyCollection.GetEnumerator (method)
    System.Collections.Generic.Dictionary.KeyCollection.CopyTo (method)
    System.Collections.Generic.Dictionary.KeyCollection.Contains (method)
  System.Collections.Generic.Dictionary.ValueCollection (class) [5 members]
    System.Collections.Generic.Dictionary.ValueCollection.Count (property)
    System.Collections.Generic.Dictionary.ValueCollection.Enumerator (struct) [4 members]
      System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Current (property)
      System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Enumerator (constructor)
      System.Collections.Generic.Dictionary.ValueCollection.Enumerator.Dispose (method)
      System.Collections.Generic.Dictionary.ValueCollection.Enumerator.MoveNext (method)
    System.Collections.Generic.Dictionary.ValueCollection.ValueCollection (constructor)
    System.Collections.Generic.Dictionary.ValueCollection.GetEnumerator (method)
    System.Collections.Generic.Dictionary.ValueCollection.CopyTo (method)
  System.Collections.Generic.Dictionary.Dictionary (constructor)
  System.Collections.Generic.Dictionary.Add (method)
  System.Collections.Generic.Dictionary.Clear (method)
  System.Collections.Generic.Dictionary.ContainsKey (method)
  System.Collections.Generic.Dictionary.ContainsValue (method)
  System.Collections.Generic.Dictionary.GetEnumerator (method)
  System.Collections.Generic.Dictionary.GetObjectData (method)
  System.Collections.Generic.Dictionary.GetAlternateLookup (method)
  System.Collections.Generic.Dictionary.TryGetAlternateLookup (method)
  System.Collections.Generic.Dictionary.OnDeserialization (method)
  System.Collections.Generic.Dictionary.Remove (method)
  System.Collections.Generic.Dictionary.TryGetValue (method)
  System.Collections.Generic.Dictionary.TryAdd (method)
  System.Collections.Generic.Dictionary.EnsureCapacity (method)
  System.Collections.Generic.Dictionary.TrimExcess (method)
System.Collections.Generic.HashSet (class) [31 members] [category: Selected BCL reference]
  System.Collections.Generic.HashSet.Count (property)
  System.Collections.Generic.HashSet.Capacity (property)
  System.Collections.Generic.HashSet.Comparer (property)
  System.Collections.Generic.HashSet.AlternateLookup (struct) [6 members]
    System.Collections.Generic.HashSet.AlternateLookup.Set (property)
    System.Collections.Generic.HashSet.AlternateLookup.AlternateLookup (constructor)
    System.Collections.Generic.HashSet.AlternateLookup.Add (method)
    System.Collections.Generic.HashSet.AlternateLookup.Remove (method)
    System.Collections.Generic.HashSet.AlternateLookup.Contains (method)
    System.Collections.Generic.HashSet.AlternateLookup.TryGetValue (method)
  System.Collections.Generic.HashSet.Enumerator (struct) [4 members]
    System.Collections.Generic.HashSet.Enumerator.Current (property)
    System.Collections.Generic.HashSet.Enumerator.Enumerator (constructor)
    System.Collections.Generic.HashSet.Enumerator.MoveNext (method)
    System.Collections.Generic.HashSet.Enumerator.Dispose (method)
  System.Collections.Generic.HashSet.HashSet (constructor)
  System.Collections.Generic.HashSet.Clear (method)
  System.Collections.Generic.HashSet.Contains (method)
  System.Collections.Generic.HashSet.Remove (method)
  System.Collections.Generic.HashSet.GetAlternateLookup (method)
  System.Collections.Generic.HashSet.TryGetAlternateLookup (method)
  System.Collections.Generic.HashSet.GetEnumerator (method)
  System.Collections.Generic.HashSet.GetObjectData (method)
  System.Collections.Generic.HashSet.OnDeserialization (method)
  System.Collections.Generic.HashSet.Add (method)
  System.Collections.Generic.HashSet.TryGetValue (method)
  System.Collections.Generic.HashSet.UnionWith (method)
  System.Collections.Generic.HashSet.IntersectWith (method)
  System.Collections.Generic.HashSet.ExceptWith (method)
  System.Collections.Generic.HashSet.SymmetricExceptWith (method)
  System.Collections.Generic.HashSet.IsSubsetOf (method)
  System.Collections.Generic.HashSet.IsProperSubsetOf (method)
  System.Collections.Generic.HashSet.IsSupersetOf (method)
  System.Collections.Generic.HashSet.IsProperSupersetOf (method)
  System.Collections.Generic.HashSet.Overlaps (method)
  System.Collections.Generic.HashSet.SetEquals (method)
  System.Collections.Generic.HashSet.CopyTo (method)
  System.Collections.Generic.HashSet.RemoveWhere (method)
  System.Collections.Generic.HashSet.EnsureCapacity (method)
  System.Collections.Generic.HashSet.TrimExcess (method)
  System.Collections.Generic.HashSet.CreateSetComparer (method)
System.Collections.Generic.List (class) [37 members] [category: Selected BCL reference]
  System.Collections.Generic.List.Capacity (property)
  System.Collections.Generic.List.Count (property)
  System.Collections.Generic.List.this[int index] (property)
  System.Collections.Generic.List.Enumerator (struct) [4 members]
    System.Collections.Generic.List.Enumerator.Current (property)
    System.Collections.Generic.List.Enumerator.Enumerator (constructor)
    System.Collections.Generic.List.Enumerator.Dispose (method)
    System.Collections.Generic.List.Enumerator.MoveNext (method)
  System.Collections.Generic.List.List (constructor)
  System.Collections.Generic.List.Add (method)
  System.Collections.Generic.List.AddRange (method)
  System.Collections.Generic.List.AsReadOnly (method)
  System.Collections.Generic.List.BinarySearch (method)
  System.Collections.Generic.List.Clear (method)
  System.Collections.Generic.List.Contains (method)
  System.Collections.Generic.List.ConvertAll (method)
  System.Collections.Generic.List.CopyTo (method)
  System.Collections.Generic.List.EnsureCapacity (method)
  System.Collections.Generic.List.Exists (method)
  System.Collections.Generic.List.Find (method)
  System.Collections.Generic.List.FindAll (method)
  System.Collections.Generic.List.FindIndex (method)
  System.Collections.Generic.List.FindLast (method)
  System.Collections.Generic.List.FindLastIndex (method)
  System.Collections.Generic.List.ForEach (method)
  System.Collections.Generic.List.GetEnumerator (method)
  System.Collections.Generic.List.GetRange (method)
  System.Collections.Generic.List.Slice (method)
  System.Collections.Generic.List.IndexOf (method)
  System.Collections.Generic.List.Insert (method)
  System.Collections.Generic.List.InsertRange (method)
  System.Collections.Generic.List.LastIndexOf (method)
  System.Collections.Generic.List.Remove (method)
  System.Collections.Generic.List.RemoveAll (method)
  System.Collections.Generic.List.RemoveAt (method)
  System.Collections.Generic.List.RemoveRange (method)
  System.Collections.Generic.List.Reverse (method)
  System.Collections.Generic.List.Sort (method)
  System.Collections.Generic.List.ToArray (method)
  System.Collections.Generic.List.TrimExcess (method)
  System.Collections.Generic.List.TrueForAll (method)

## Selected BCL reference — System.Numerics — `api-selected-bcl-reference-system-numerics.md`

System.Numerics.Matrix3x2 (struct) [40 members] [category: Selected BCL reference]
  System.Numerics.Matrix3x2.M11 (field)
  System.Numerics.Matrix3x2.M12 (field)
  System.Numerics.Matrix3x2.M21 (field)
  System.Numerics.Matrix3x2.M22 (field)
  System.Numerics.Matrix3x2.M31 (field)
  System.Numerics.Matrix3x2.M32 (field)
  System.Numerics.Matrix3x2.Identity (property)
  System.Numerics.Matrix3x2.IsIdentity (property)
  System.Numerics.Matrix3x2.Translation (property)
  System.Numerics.Matrix3x2.X (property)
  System.Numerics.Matrix3x2.Y (property)
  System.Numerics.Matrix3x2.Z (property)
  System.Numerics.Matrix3x2.this[int row] (property)
  System.Numerics.Matrix3x2.this[int row, int column] (property)
  System.Numerics.Matrix3x2.Matrix3x2 (constructor)
  System.Numerics.Matrix3x2.op_Addition (method)
  System.Numerics.Matrix3x2.op_Equality (method)
  System.Numerics.Matrix3x2.op_Inequality (method)
  System.Numerics.Matrix3x2.op_Multiply (method)
  System.Numerics.Matrix3x2.op_Subtraction (method)
  System.Numerics.Matrix3x2.op_UnaryNegation (method)
  System.Numerics.Matrix3x2.Add (method)
  System.Numerics.Matrix3x2.Create (method)
  System.Numerics.Matrix3x2.CreateRotation (method)
  System.Numerics.Matrix3x2.CreateScale (method)
  System.Numerics.Matrix3x2.CreateSkew (method)
  System.Numerics.Matrix3x2.CreateTranslation (method)
  System.Numerics.Matrix3x2.Invert (method)
  System.Numerics.Matrix3x2.Lerp (method)
  System.Numerics.Matrix3x2.Multiply (method)
  System.Numerics.Matrix3x2.Negate (method)
  System.Numerics.Matrix3x2.Subtract (method)
  System.Numerics.Matrix3x2.Equals (method)
  System.Numerics.Matrix3x2.GetDeterminant (method)
  System.Numerics.Matrix3x2.GetElement (method)
  System.Numerics.Matrix3x2.GetRow (method)
  System.Numerics.Matrix3x2.GetHashCode (method)
  System.Numerics.Matrix3x2.ToString (method)
  System.Numerics.Matrix3x2.WithElement (method)
  System.Numerics.Matrix3x2.WithRow (method)
System.Numerics.Matrix4x4 (struct) [81 members] [category: Selected BCL reference]
  System.Numerics.Matrix4x4.M11 (field)
  System.Numerics.Matrix4x4.M12 (field)
  System.Numerics.Matrix4x4.M13 (field)
  System.Numerics.Matrix4x4.M14 (field)
  System.Numerics.Matrix4x4.M21 (field)
  System.Numerics.Matrix4x4.M22 (field)
  System.Numerics.Matrix4x4.M23 (field)
  System.Numerics.Matrix4x4.M24 (field)
  System.Numerics.Matrix4x4.M31 (field)
  System.Numerics.Matrix4x4.M32 (field)
  System.Numerics.Matrix4x4.M33 (field)
  System.Numerics.Matrix4x4.M34 (field)
  System.Numerics.Matrix4x4.M41 (field)
  System.Numerics.Matrix4x4.M42 (field)
  System.Numerics.Matrix4x4.M43 (field)
  System.Numerics.Matrix4x4.M44 (field)
  System.Numerics.Matrix4x4.Identity (property)
  System.Numerics.Matrix4x4.IsIdentity (property)
  System.Numerics.Matrix4x4.Translation (property)
  System.Numerics.Matrix4x4.X (property)
  System.Numerics.Matrix4x4.Y (property)
  System.Numerics.Matrix4x4.Z (property)
  System.Numerics.Matrix4x4.W (property)
  System.Numerics.Matrix4x4.this[int row] (property)
  System.Numerics.Matrix4x4.this[int row, int column] (property)
  System.Numerics.Matrix4x4.Matrix4x4 (constructor)
  System.Numerics.Matrix4x4.op_Addition (method)
  System.Numerics.Matrix4x4.op_Equality (method)
  System.Numerics.Matrix4x4.op_Inequality (method)
  System.Numerics.Matrix4x4.op_Multiply (method)
  System.Numerics.Matrix4x4.op_Subtraction (method)
  System.Numerics.Matrix4x4.op_UnaryNegation (method)
  System.Numerics.Matrix4x4.Add (method)
  System.Numerics.Matrix4x4.Create (method)
  System.Numerics.Matrix4x4.CreateBillboard (method)
  System.Numerics.Matrix4x4.CreateBillboardLeftHanded (method)
  System.Numerics.Matrix4x4.CreateConstrainedBillboard (method)
  System.Numerics.Matrix4x4.CreateConstrainedBillboardLeftHanded (method)
  System.Numerics.Matrix4x4.CreateFromAxisAngle (method)
  System.Numerics.Matrix4x4.CreateFromQuaternion (method)
  System.Numerics.Matrix4x4.CreateFromYawPitchRoll (method)
  System.Numerics.Matrix4x4.CreateLookAt (method)
  System.Numerics.Matrix4x4.CreateLookAtLeftHanded (method)
  System.Numerics.Matrix4x4.CreateLookTo (method)
  System.Numerics.Matrix4x4.CreateLookToLeftHanded (method)
  System.Numerics.Matrix4x4.CreateOrthographic (method)
  System.Numerics.Matrix4x4.CreateOrthographicLeftHanded (method)
  System.Numerics.Matrix4x4.CreateOrthographicOffCenter (method)
  System.Numerics.Matrix4x4.CreateOrthographicOffCenterLeftHanded (method)
  System.Numerics.Matrix4x4.CreatePerspective (method)
  System.Numerics.Matrix4x4.CreatePerspectiveLeftHanded (method)
  System.Numerics.Matrix4x4.CreatePerspectiveFieldOfView (method)
  System.Numerics.Matrix4x4.CreatePerspectiveFieldOfViewLeftHanded (method)
  System.Numerics.Matrix4x4.CreatePerspectiveOffCenter (method)
  System.Numerics.Matrix4x4.CreatePerspectiveOffCenterLeftHanded (method)
  System.Numerics.Matrix4x4.CreateReflection (method)
  System.Numerics.Matrix4x4.CreateRotationX (method)
  System.Numerics.Matrix4x4.CreateRotationY (method)
  System.Numerics.Matrix4x4.CreateRotationZ (method)
  System.Numerics.Matrix4x4.CreateScale (method)
  System.Numerics.Matrix4x4.CreateShadow (method)
  System.Numerics.Matrix4x4.CreateTranslation (method)
  System.Numerics.Matrix4x4.CreateViewport (method)
  System.Numerics.Matrix4x4.CreateViewportLeftHanded (method)
  System.Numerics.Matrix4x4.CreateWorld (method)
  System.Numerics.Matrix4x4.Decompose (method)
  System.Numerics.Matrix4x4.Invert (method)
  System.Numerics.Matrix4x4.Lerp (method)
  System.Numerics.Matrix4x4.Multiply (method)
  System.Numerics.Matrix4x4.Negate (method)
  System.Numerics.Matrix4x4.Subtract (method)
  System.Numerics.Matrix4x4.Transform (method)
  System.Numerics.Matrix4x4.Transpose (method)
  System.Numerics.Matrix4x4.Equals (method)
  System.Numerics.Matrix4x4.GetDeterminant (method)
  System.Numerics.Matrix4x4.GetElement (method)
  System.Numerics.Matrix4x4.GetRow (method)
  System.Numerics.Matrix4x4.GetHashCode (method)
  System.Numerics.Matrix4x4.ToString (method)
  System.Numerics.Matrix4x4.WithElement (method)
  System.Numerics.Matrix4x4.WithRow (method)
System.Numerics.Plane (struct) [15 members] [category: Selected BCL reference]
  System.Numerics.Plane.Normal (field)
  System.Numerics.Plane.D (field)
  System.Numerics.Plane.Plane (constructor)
  System.Numerics.Plane.Create (method)
  System.Numerics.Plane.CreateFromVertices (method)
  System.Numerics.Plane.Dot (method)
  System.Numerics.Plane.DotCoordinate (method)
  System.Numerics.Plane.DotNormal (method)
  System.Numerics.Plane.Normalize (method)
  System.Numerics.Plane.Transform (method)
  System.Numerics.Plane.op_Equality (method)
  System.Numerics.Plane.op_Inequality (method)
  System.Numerics.Plane.Equals (method)
  System.Numerics.Plane.GetHashCode (method)
  System.Numerics.Plane.ToString (method)
System.Numerics.Quaternion (struct) [37 members] [category: Selected BCL reference]
  System.Numerics.Quaternion.X (field)
  System.Numerics.Quaternion.Y (field)
  System.Numerics.Quaternion.Z (field)
  System.Numerics.Quaternion.W (field)
  System.Numerics.Quaternion.Zero (property)
  System.Numerics.Quaternion.Identity (property)
  System.Numerics.Quaternion.this[int index] (property)
  System.Numerics.Quaternion.IsIdentity (property)
  System.Numerics.Quaternion.Quaternion (constructor)
  System.Numerics.Quaternion.op_Addition (method)
  System.Numerics.Quaternion.op_Division (method)
  System.Numerics.Quaternion.op_Equality (method)
  System.Numerics.Quaternion.op_Inequality (method)
  System.Numerics.Quaternion.op_Multiply (method)
  System.Numerics.Quaternion.op_Subtraction (method)
  System.Numerics.Quaternion.op_UnaryNegation (method)
  System.Numerics.Quaternion.Add (method)
  System.Numerics.Quaternion.Concatenate (method)
  System.Numerics.Quaternion.Conjugate (method)
  System.Numerics.Quaternion.Create (method)
  System.Numerics.Quaternion.CreateFromAxisAngle (method)
  System.Numerics.Quaternion.CreateFromRotationMatrix (method)
  System.Numerics.Quaternion.CreateFromYawPitchRoll (method)
  System.Numerics.Quaternion.Divide (method)
  System.Numerics.Quaternion.Dot (method)
  System.Numerics.Quaternion.Inverse (method)
  System.Numerics.Quaternion.Lerp (method)
  System.Numerics.Quaternion.Multiply (method)
  System.Numerics.Quaternion.Negate (method)
  System.Numerics.Quaternion.Normalize (method)
  System.Numerics.Quaternion.Slerp (method)
  System.Numerics.Quaternion.Subtract (method)
  System.Numerics.Quaternion.Equals (method)
  System.Numerics.Quaternion.GetHashCode (method)
  System.Numerics.Quaternion.Length (method)
  System.Numerics.Quaternion.LengthSquared (method)
  System.Numerics.Quaternion.ToString (method)

## Selected BCL reference — System.Numerics (2) — `api-selected-bcl-reference-system-numerics-2.md`

System.Numerics.Vector2 (struct) [135 members] [category: Selected BCL reference]
  System.Numerics.Vector2.X (field)
  System.Numerics.Vector2.Y (field)
  System.Numerics.Vector2.AllBitsSet (property)
  System.Numerics.Vector2.E (property)
  System.Numerics.Vector2.Epsilon (property)
  System.Numerics.Vector2.NaN (property)
  System.Numerics.Vector2.NegativeInfinity (property)
  System.Numerics.Vector2.NegativeZero (property)
  System.Numerics.Vector2.One (property)
  System.Numerics.Vector2.Pi (property)
  System.Numerics.Vector2.PositiveInfinity (property)
  System.Numerics.Vector2.Tau (property)
  System.Numerics.Vector2.UnitX (property)
  System.Numerics.Vector2.UnitY (property)
  System.Numerics.Vector2.Zero (property)
  System.Numerics.Vector2.this[int index] (property)
  System.Numerics.Vector2.Vector2 (constructor)
  System.Numerics.Vector2.op_Addition (method)
  System.Numerics.Vector2.op_Division (method)
  System.Numerics.Vector2.op_Equality (method)
  System.Numerics.Vector2.op_Inequality (method)
  System.Numerics.Vector2.op_Multiply (method)
  System.Numerics.Vector2.op_Subtraction (method)
  System.Numerics.Vector2.op_UnaryNegation (method)
  System.Numerics.Vector2.op_BitwiseAnd (method)
  System.Numerics.Vector2.op_BitwiseOr (method)
  System.Numerics.Vector2.op_ExclusiveOr (method)
  System.Numerics.Vector2.op_LeftShift (method)
  System.Numerics.Vector2.op_OnesComplement (method)
  System.Numerics.Vector2.op_RightShift (method)
  System.Numerics.Vector2.op_UnaryPlus (method)
  System.Numerics.Vector2.op_UnsignedRightShift (method)
  System.Numerics.Vector2.Abs (method)
  System.Numerics.Vector2.Add (method)
  System.Numerics.Vector2.All (method)
  System.Numerics.Vector2.AllWhereAllBitsSet (method)
  System.Numerics.Vector2.AndNot (method)
  System.Numerics.Vector2.Any (method)
  System.Numerics.Vector2.AnyWhereAllBitsSet (method)
  System.Numerics.Vector2.BitwiseAnd (method)
  System.Numerics.Vector2.BitwiseOr (method)
  System.Numerics.Vector2.Clamp (method)
  System.Numerics.Vector2.ClampNative (method)
  System.Numerics.Vector2.ConditionalSelect (method)
  System.Numerics.Vector2.CopySign (method)
  System.Numerics.Vector2.Cos (method)
  System.Numerics.Vector2.Count (method)
  System.Numerics.Vector2.CountWhereAllBitsSet (method)
  System.Numerics.Vector2.Create (method)
  System.Numerics.Vector2.CreateScalar (method)
  System.Numerics.Vector2.CreateScalarUnsafe (method)
  System.Numerics.Vector2.Cross (method)
  System.Numerics.Vector2.DegreesToRadians (method)
  System.Numerics.Vector2.Distance (method)
  System.Numerics.Vector2.DistanceSquared (method)
  System.Numerics.Vector2.Divide (method)
  System.Numerics.Vector2.Dot (method)
  System.Numerics.Vector2.Exp (method)
  System.Numerics.Vector2.Equals (method)
  System.Numerics.Vector2.EqualsAll (method)
  System.Numerics.Vector2.EqualsAny (method)
  System.Numerics.Vector2.FusedMultiplyAdd (method)
  System.Numerics.Vector2.GreaterThan (method)
  System.Numerics.Vector2.GreaterThanAll (method)
  System.Numerics.Vector2.GreaterThanAny (method)
  System.Numerics.Vector2.GreaterThanOrEqual (method)
  System.Numerics.Vector2.GreaterThanOrEqualAll (method)
  System.Numerics.Vector2.GreaterThanOrEqualAny (method)
  System.Numerics.Vector2.Hypot (method)
  System.Numerics.Vector2.IndexOf (method)
  System.Numerics.Vector2.IndexOfWhereAllBitsSet (method)
  System.Numerics.Vector2.IsEvenInteger (method)
  System.Numerics.Vector2.IsFinite (method)
  System.Numerics.Vector2.IsInfinity (method)
  System.Numerics.Vector2.IsInteger (method)
  System.Numerics.Vector2.IsNaN (method)
  System.Numerics.Vector2.IsNegative (method)
  System.Numerics.Vector2.IsNegativeInfinity (method)
  System.Numerics.Vector2.IsNormal (method)
  System.Numerics.Vector2.IsOddInteger (method)
  System.Numerics.Vector2.IsPositive (method)
  System.Numerics.Vector2.IsPositiveInfinity (method)
  System.Numerics.Vector2.IsSubnormal (method)
  System.Numerics.Vector2.IsZero (method)
  System.Numerics.Vector2.LastIndexOf (method)
  System.Numerics.Vector2.LastIndexOfWhereAllBitsSet (method)
  System.Numerics.Vector2.Lerp (method)
  System.Numerics.Vector2.LessThan (method)
  System.Numerics.Vector2.LessThanAll (method)
  System.Numerics.Vector2.LessThanAny (method)
  System.Numerics.Vector2.LessThanOrEqual (method)
  System.Numerics.Vector2.LessThanOrEqualAll (method)
  System.Numerics.Vector2.LessThanOrEqualAny (method)
  System.Numerics.Vector2.Load (method)
  System.Numerics.Vector2.LoadAligned (method)
  System.Numerics.Vector2.LoadAlignedNonTemporal (method)
  System.Numerics.Vector2.LoadUnsafe (method)
  System.Numerics.Vector2.Log (method)
  System.Numerics.Vector2.Log2 (method)
  System.Numerics.Vector2.Max (method)
  System.Numerics.Vector2.MaxMagnitude (method)
  System.Numerics.Vector2.MaxMagnitudeNumber (method)
  System.Numerics.Vector2.MaxNative (method)
  System.Numerics.Vector2.MaxNumber (method)
  System.Numerics.Vector2.Min (method)
  System.Numerics.Vector2.MinMagnitude (method)
  System.Numerics.Vector2.MinMagnitudeNumber (method)
  System.Numerics.Vector2.MinNative (method)
  System.Numerics.Vector2.MinNumber (method)
  System.Numerics.Vector2.Multiply (method)
  System.Numerics.Vector2.MultiplyAddEstimate (method)
  System.Numerics.Vector2.Negate (method)
  System.Numerics.Vector2.None (method)
  System.Numerics.Vector2.NoneWhereAllBitsSet (method)
  System.Numerics.Vector2.Normalize (method)
  System.Numerics.Vector2.OnesComplement (method)
  System.Numerics.Vector2.RadiansToDegrees (method)
  System.Numerics.Vector2.Reflect (method)
  System.Numerics.Vector2.Round (method)
  System.Numerics.Vector2.Shuffle (method)
  System.Numerics.Vector2.Sin (method)
  System.Numerics.Vector2.SinCos (method)
  System.Numerics.Vector2.SquareRoot (method)
  System.Numerics.Vector2.Subtract (method)
  System.Numerics.Vector2.Sum (method)
  System.Numerics.Vector2.Transform (method)
  System.Numerics.Vector2.TransformNormal (method)
  System.Numerics.Vector2.Truncate (method)
  System.Numerics.Vector2.Xor (method)
  System.Numerics.Vector2.CopyTo (method)
  System.Numerics.Vector2.TryCopyTo (method)
  System.Numerics.Vector2.GetHashCode (method)
  System.Numerics.Vector2.Length (method)
  System.Numerics.Vector2.LengthSquared (method)
  System.Numerics.Vector2.ToString (method)

## Selected BCL reference — System.Numerics (3) — `api-selected-bcl-reference-system-numerics-3.md`

System.Numerics.Vector3 (struct) [137 members] [category: Selected BCL reference]
  System.Numerics.Vector3.X (field)
  System.Numerics.Vector3.Y (field)
  System.Numerics.Vector3.Z (field)
  System.Numerics.Vector3.AllBitsSet (property)
  System.Numerics.Vector3.E (property)
  System.Numerics.Vector3.Epsilon (property)
  System.Numerics.Vector3.NaN (property)
  System.Numerics.Vector3.NegativeInfinity (property)
  System.Numerics.Vector3.NegativeZero (property)
  System.Numerics.Vector3.One (property)
  System.Numerics.Vector3.Pi (property)
  System.Numerics.Vector3.PositiveInfinity (property)
  System.Numerics.Vector3.Tau (property)
  System.Numerics.Vector3.UnitX (property)
  System.Numerics.Vector3.UnitY (property)
  System.Numerics.Vector3.UnitZ (property)
  System.Numerics.Vector3.Zero (property)
  System.Numerics.Vector3.this[int index] (property)
  System.Numerics.Vector3.Vector3 (constructor)
  System.Numerics.Vector3.op_Addition (method)
  System.Numerics.Vector3.op_Division (method)
  System.Numerics.Vector3.op_Equality (method)
  System.Numerics.Vector3.op_Inequality (method)
  System.Numerics.Vector3.op_Multiply (method)
  System.Numerics.Vector3.op_Subtraction (method)
  System.Numerics.Vector3.op_UnaryNegation (method)
  System.Numerics.Vector3.op_BitwiseAnd (method)
  System.Numerics.Vector3.op_BitwiseOr (method)
  System.Numerics.Vector3.op_ExclusiveOr (method)
  System.Numerics.Vector3.op_LeftShift (method)
  System.Numerics.Vector3.op_OnesComplement (method)
  System.Numerics.Vector3.op_RightShift (method)
  System.Numerics.Vector3.op_UnaryPlus (method)
  System.Numerics.Vector3.op_UnsignedRightShift (method)
  System.Numerics.Vector3.Abs (method)
  System.Numerics.Vector3.Add (method)
  System.Numerics.Vector3.All (method)
  System.Numerics.Vector3.AllWhereAllBitsSet (method)
  System.Numerics.Vector3.AndNot (method)
  System.Numerics.Vector3.Any (method)
  System.Numerics.Vector3.AnyWhereAllBitsSet (method)
  System.Numerics.Vector3.BitwiseAnd (method)
  System.Numerics.Vector3.BitwiseOr (method)
  System.Numerics.Vector3.Clamp (method)
  System.Numerics.Vector3.ClampNative (method)
  System.Numerics.Vector3.ConditionalSelect (method)
  System.Numerics.Vector3.CopySign (method)
  System.Numerics.Vector3.Cos (method)
  System.Numerics.Vector3.Count (method)
  System.Numerics.Vector3.CountWhereAllBitsSet (method)
  System.Numerics.Vector3.Create (method)
  System.Numerics.Vector3.CreateScalar (method)
  System.Numerics.Vector3.CreateScalarUnsafe (method)
  System.Numerics.Vector3.Cross (method)
  System.Numerics.Vector3.DegreesToRadians (method)
  System.Numerics.Vector3.Distance (method)
  System.Numerics.Vector3.DistanceSquared (method)
  System.Numerics.Vector3.Divide (method)
  System.Numerics.Vector3.Dot (method)
  System.Numerics.Vector3.Exp (method)
  System.Numerics.Vector3.Equals (method)
  System.Numerics.Vector3.EqualsAll (method)
  System.Numerics.Vector3.EqualsAny (method)
  System.Numerics.Vector3.FusedMultiplyAdd (method)
  System.Numerics.Vector3.GreaterThan (method)
  System.Numerics.Vector3.GreaterThanAll (method)
  System.Numerics.Vector3.GreaterThanAny (method)
  System.Numerics.Vector3.GreaterThanOrEqual (method)
  System.Numerics.Vector3.GreaterThanOrEqualAll (method)
  System.Numerics.Vector3.GreaterThanOrEqualAny (method)
  System.Numerics.Vector3.Hypot (method)
  System.Numerics.Vector3.IndexOf (method)
  System.Numerics.Vector3.IndexOfWhereAllBitsSet (method)
  System.Numerics.Vector3.IsEvenInteger (method)
  System.Numerics.Vector3.IsFinite (method)
  System.Numerics.Vector3.IsInfinity (method)
  System.Numerics.Vector3.IsInteger (method)
  System.Numerics.Vector3.IsNaN (method)
  System.Numerics.Vector3.IsNegative (method)
  System.Numerics.Vector3.IsNegativeInfinity (method)
  System.Numerics.Vector3.IsNormal (method)
  System.Numerics.Vector3.IsOddInteger (method)
  System.Numerics.Vector3.IsPositive (method)
  System.Numerics.Vector3.IsPositiveInfinity (method)
  System.Numerics.Vector3.IsSubnormal (method)
  System.Numerics.Vector3.IsZero (method)
  System.Numerics.Vector3.LastIndexOf (method)
  System.Numerics.Vector3.LastIndexOfWhereAllBitsSet (method)
  System.Numerics.Vector3.Lerp (method)
  System.Numerics.Vector3.LessThan (method)
  System.Numerics.Vector3.LessThanAll (method)
  System.Numerics.Vector3.LessThanAny (method)
  System.Numerics.Vector3.LessThanOrEqual (method)
  System.Numerics.Vector3.LessThanOrEqualAll (method)
  System.Numerics.Vector3.LessThanOrEqualAny (method)
  System.Numerics.Vector3.Load (method)
  System.Numerics.Vector3.LoadAligned (method)
  System.Numerics.Vector3.LoadAlignedNonTemporal (method)
  System.Numerics.Vector3.LoadUnsafe (method)
  System.Numerics.Vector3.Log (method)
  System.Numerics.Vector3.Log2 (method)
  System.Numerics.Vector3.Max (method)
  System.Numerics.Vector3.MaxMagnitude (method)
  System.Numerics.Vector3.MaxMagnitudeNumber (method)
  System.Numerics.Vector3.MaxNative (method)
  System.Numerics.Vector3.MaxNumber (method)
  System.Numerics.Vector3.Min (method)
  System.Numerics.Vector3.MinMagnitude (method)
  System.Numerics.Vector3.MinMagnitudeNumber (method)
  System.Numerics.Vector3.MinNative (method)
  System.Numerics.Vector3.MinNumber (method)
  System.Numerics.Vector3.Multiply (method)
  System.Numerics.Vector3.MultiplyAddEstimate (method)
  System.Numerics.Vector3.Negate (method)
  System.Numerics.Vector3.None (method)
  System.Numerics.Vector3.NoneWhereAllBitsSet (method)
  System.Numerics.Vector3.Normalize (method)
  System.Numerics.Vector3.OnesComplement (method)
  System.Numerics.Vector3.RadiansToDegrees (method)
  System.Numerics.Vector3.Reflect (method)
  System.Numerics.Vector3.Round (method)
  System.Numerics.Vector3.Shuffle (method)
  System.Numerics.Vector3.Sin (method)
  System.Numerics.Vector3.SinCos (method)
  System.Numerics.Vector3.SquareRoot (method)
  System.Numerics.Vector3.Subtract (method)
  System.Numerics.Vector3.Sum (method)
  System.Numerics.Vector3.Transform (method)
  System.Numerics.Vector3.TransformNormal (method)
  System.Numerics.Vector3.Truncate (method)
  System.Numerics.Vector3.Xor (method)
  System.Numerics.Vector3.CopyTo (method)
  System.Numerics.Vector3.TryCopyTo (method)
  System.Numerics.Vector3.GetHashCode (method)
  System.Numerics.Vector3.Length (method)
  System.Numerics.Vector3.LengthSquared (method)
  System.Numerics.Vector3.ToString (method)

## Selected BCL reference — System.Numerics (4) — `api-selected-bcl-reference-system-numerics-4.md`

System.Numerics.Vector4 (struct) [137 members] [category: Selected BCL reference]
  System.Numerics.Vector4.X (field)
  System.Numerics.Vector4.Y (field)
  System.Numerics.Vector4.Z (field)
  System.Numerics.Vector4.W (field)
  System.Numerics.Vector4.AllBitsSet (property)
  System.Numerics.Vector4.E (property)
  System.Numerics.Vector4.Epsilon (property)
  System.Numerics.Vector4.NaN (property)
  System.Numerics.Vector4.NegativeInfinity (property)
  System.Numerics.Vector4.NegativeZero (property)
  System.Numerics.Vector4.One (property)
  System.Numerics.Vector4.Pi (property)
  System.Numerics.Vector4.PositiveInfinity (property)
  System.Numerics.Vector4.Tau (property)
  System.Numerics.Vector4.UnitX (property)
  System.Numerics.Vector4.UnitY (property)
  System.Numerics.Vector4.UnitZ (property)
  System.Numerics.Vector4.UnitW (property)
  System.Numerics.Vector4.Zero (property)
  System.Numerics.Vector4.this[int index] (property)
  System.Numerics.Vector4.Vector4 (constructor)
  System.Numerics.Vector4.op_Addition (method)
  System.Numerics.Vector4.op_Division (method)
  System.Numerics.Vector4.op_Equality (method)
  System.Numerics.Vector4.op_Inequality (method)
  System.Numerics.Vector4.op_Multiply (method)
  System.Numerics.Vector4.op_Subtraction (method)
  System.Numerics.Vector4.op_UnaryNegation (method)
  System.Numerics.Vector4.op_BitwiseAnd (method)
  System.Numerics.Vector4.op_BitwiseOr (method)
  System.Numerics.Vector4.op_ExclusiveOr (method)
  System.Numerics.Vector4.op_LeftShift (method)
  System.Numerics.Vector4.op_OnesComplement (method)
  System.Numerics.Vector4.op_RightShift (method)
  System.Numerics.Vector4.op_UnaryPlus (method)
  System.Numerics.Vector4.op_UnsignedRightShift (method)
  System.Numerics.Vector4.Abs (method)
  System.Numerics.Vector4.Add (method)
  System.Numerics.Vector4.All (method)
  System.Numerics.Vector4.AllWhereAllBitsSet (method)
  System.Numerics.Vector4.AndNot (method)
  System.Numerics.Vector4.Any (method)
  System.Numerics.Vector4.AnyWhereAllBitsSet (method)
  System.Numerics.Vector4.BitwiseAnd (method)
  System.Numerics.Vector4.BitwiseOr (method)
  System.Numerics.Vector4.Clamp (method)
  System.Numerics.Vector4.ClampNative (method)
  System.Numerics.Vector4.ConditionalSelect (method)
  System.Numerics.Vector4.CopySign (method)
  System.Numerics.Vector4.Cos (method)
  System.Numerics.Vector4.Count (method)
  System.Numerics.Vector4.CountWhereAllBitsSet (method)
  System.Numerics.Vector4.Create (method)
  System.Numerics.Vector4.CreateScalar (method)
  System.Numerics.Vector4.CreateScalarUnsafe (method)
  System.Numerics.Vector4.Cross (method)
  System.Numerics.Vector4.DegreesToRadians (method)
  System.Numerics.Vector4.Distance (method)
  System.Numerics.Vector4.DistanceSquared (method)
  System.Numerics.Vector4.Divide (method)
  System.Numerics.Vector4.Dot (method)
  System.Numerics.Vector4.Exp (method)
  System.Numerics.Vector4.Equals (method)
  System.Numerics.Vector4.EqualsAll (method)
  System.Numerics.Vector4.EqualsAny (method)
  System.Numerics.Vector4.FusedMultiplyAdd (method)
  System.Numerics.Vector4.GreaterThan (method)
  System.Numerics.Vector4.GreaterThanAll (method)
  System.Numerics.Vector4.GreaterThanAny (method)
  System.Numerics.Vector4.GreaterThanOrEqual (method)
  System.Numerics.Vector4.GreaterThanOrEqualAll (method)
  System.Numerics.Vector4.GreaterThanOrEqualAny (method)
  System.Numerics.Vector4.Hypot (method)
  System.Numerics.Vector4.IndexOf (method)
  System.Numerics.Vector4.IndexOfWhereAllBitsSet (method)
  System.Numerics.Vector4.IsEvenInteger (method)
  System.Numerics.Vector4.IsFinite (method)
  System.Numerics.Vector4.IsInfinity (method)
  System.Numerics.Vector4.IsInteger (method)
  System.Numerics.Vector4.IsNaN (method)
  System.Numerics.Vector4.IsNegative (method)
  System.Numerics.Vector4.IsNegativeInfinity (method)
  System.Numerics.Vector4.IsNormal (method)
  System.Numerics.Vector4.IsOddInteger (method)
  System.Numerics.Vector4.IsPositive (method)
  System.Numerics.Vector4.IsPositiveInfinity (method)
  System.Numerics.Vector4.IsSubnormal (method)
  System.Numerics.Vector4.IsZero (method)
  System.Numerics.Vector4.LastIndexOf (method)
  System.Numerics.Vector4.LastIndexOfWhereAllBitsSet (method)
  System.Numerics.Vector4.Lerp (method)
  System.Numerics.Vector4.LessThan (method)
  System.Numerics.Vector4.LessThanAll (method)
  System.Numerics.Vector4.LessThanAny (method)
  System.Numerics.Vector4.LessThanOrEqual (method)
  System.Numerics.Vector4.LessThanOrEqualAll (method)
  System.Numerics.Vector4.LessThanOrEqualAny (method)
  System.Numerics.Vector4.Load (method)
  System.Numerics.Vector4.LoadAligned (method)
  System.Numerics.Vector4.LoadAlignedNonTemporal (method)
  System.Numerics.Vector4.LoadUnsafe (method)
  System.Numerics.Vector4.Log (method)
  System.Numerics.Vector4.Log2 (method)
  System.Numerics.Vector4.Max (method)
  System.Numerics.Vector4.MaxMagnitude (method)
  System.Numerics.Vector4.MaxMagnitudeNumber (method)
  System.Numerics.Vector4.MaxNative (method)
  System.Numerics.Vector4.MaxNumber (method)
  System.Numerics.Vector4.Min (method)
  System.Numerics.Vector4.MinMagnitude (method)
  System.Numerics.Vector4.MinMagnitudeNumber (method)
  System.Numerics.Vector4.MinNative (method)
  System.Numerics.Vector4.MinNumber (method)
  System.Numerics.Vector4.Multiply (method)
  System.Numerics.Vector4.MultiplyAddEstimate (method)
  System.Numerics.Vector4.Negate (method)
  System.Numerics.Vector4.None (method)
  System.Numerics.Vector4.NoneWhereAllBitsSet (method)
  System.Numerics.Vector4.Normalize (method)
  System.Numerics.Vector4.OnesComplement (method)
  System.Numerics.Vector4.RadiansToDegrees (method)
  System.Numerics.Vector4.Round (method)
  System.Numerics.Vector4.Shuffle (method)
  System.Numerics.Vector4.Sin (method)
  System.Numerics.Vector4.SinCos (method)
  System.Numerics.Vector4.SquareRoot (method)
  System.Numerics.Vector4.Subtract (method)
  System.Numerics.Vector4.Sum (method)
  System.Numerics.Vector4.Transform (method)
  System.Numerics.Vector4.Truncate (method)
  System.Numerics.Vector4.Xor (method)
  System.Numerics.Vector4.CopyTo (method)
  System.Numerics.Vector4.TryCopyTo (method)
  System.Numerics.Vector4.GetHashCode (method)
  System.Numerics.Vector4.Length (method)
  System.Numerics.Vector4.LengthSquared (method)
  System.Numerics.Vector4.ToString (method)
