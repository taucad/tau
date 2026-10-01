# PicoGK — PicoGK

42 top-level symbols. Signatures are verbatim csharp.

ActiveVoxelCounterScalar

  // PicoGK.ActiveVoxelCounterScalar.nCount (method)
  public static int nCount(ScalarField oField)

  // PicoGK.ActiveVoxelCounterScalar.ActiveVoxelCounterScalar (constructor)
  protected ActiveVoxelCounterScalar(ScalarField oField)

  // PicoGK.ActiveVoxelCounterScalar.Run (method)
  protected void Run()

  // PicoGK.ActiveVoxelCounterScalar.InformActiveValue (method)
  public void InformActiveValue(in Vector3 vecPosition, float fValue)

AddVectorFieldToViewer

  // PicoGK.AddVectorFieldToViewer.AddToViewer (method)
  public static void AddToViewer(Viewer oViewer, VectorField oField, ColorFloat clr, int nStep = 10, float fArrow = 1, int nGroup = 0)

  // PicoGK.AddVectorFieldToViewer.AddVectorFieldToViewer (constructor)
  protected AddVectorFieldToViewer(Viewer oViewer, VectorField oField, ColorFloat clr, int nStep, float fArrow, int nGroup)

  // PicoGK.AddVectorFieldToViewer.Run (method)
  protected void Run()

  // PicoGK.AddVectorFieldToViewer.InformActiveValue (method)
  public void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)

Animation

  IAction

    // PicoGK.Animation.IAction.Do (method)
    void Do(float fTime)

  EType

    Once: Once

    Repeat: Repeat

    Wiggle: Wiggle

  // PicoGK.Animation.Animation (constructor)
  public Animation(Animation.IAction xAction, float fDurationInSeconds, Animation.EType eType, Easing.EEasing eEasing)

  // PicoGK.Animation.End (method)
  public void End()

  // PicoGK.Animation.bAnimate (method)
  public bool bAnimate(float fCurrentTime)

AnimationQueue

  // PicoGK.AnimationQueue.AnimationQueue (constructor)
  public AnimationQueue()

  // PicoGK.AnimationQueue.Clear (method)
  public void Clear()

  // PicoGK.AnimationQueue.bPulse (method)
  public bool bPulse()

  // PicoGK.AnimationQueue.bIsIdle (method)
  public bool bIsIdle()

  // PicoGK.AnimationQueue.Add (method)
  public void Add(Animation oAnim)

// 2D Bounding Box object
BBox2

  // Minimum coordinate of the bounding box
  vecMin: Vector2

  // Maximum coordinate of the bounding box
  vecMax: Vector2

  // Creates an empty Bounding Box
  // PicoGK.BBox2.BBox2 (constructor)
  public BBox2()
  public BBox2(float fMinX, float fMinY, float fMaxX, float fMaxY)
  public BBox2(in Vector2 vecSetMin, in Vector2 vecSetMax)

  // Is the BoundingBox empty?
  // PicoGK.BBox2.bIsEmpty (method)
  public bool bIsEmpty()

  // Checks whether point is inside the bounding box
  // PicoGK.BBox2.bContains (method)
  public bool bContains(Vector2 vec)

  // Include the specified vector in the bounding box
  // PicoGK.BBox2.Include (method)
  public void Include(Vector2 vec)
  public void Include(BBox2 oBox)

  // Grows the bounding box by the specified value on each side I.E
  // PicoGK.BBox2.Grow (method)
  public void Grow(float fGrowBy)

  // Returns the size of the Bounding Box
  // PicoGK.BBox2.vecSize (method)
  public Vector2 vecSize()

  // Center point of the bounding box
  // PicoGK.BBox2.vecCenter (method)
  public Vector2 vecCenter()

  // A string representation of the Bounding Box
  // PicoGK.BBox2.ToString (method)
  public override string ToString()

// 3D bounding box
BBox3

  // Minimum coordinate of the bounding box
  vecMin: Vector3

  // Maximum coordinate of the bounding box
  vecMax: Vector3

  // Create an empty Bounding Box
  // PicoGK.BBox3.BBox3 (constructor)
  public BBox3()
  public BBox3(float fMinX, float fMinY, float fMinZ, float fMaxX, float fMaxY, float fMaxZ)
  public BBox3(in Vector3 vecSetMin, in Vector3 vecSetMax)

  // Size of the Bounding Box
  // PicoGK.BBox3.vecSize (method)
  public Vector3 vecSize()

  // Is the Bounding Box empty>
  // PicoGK.BBox3.bIsEmpty (method)
  public bool bIsEmpty()

  // Checks whether the specified point is inside the bounding box
  // PicoGK.BBox3.bContains (method)
  public bool bContains(Vector3 vec)

  // Include the specified vector in the Bounding Box
  // PicoGK.BBox3.Include (method)
  public void Include(Vector3 vec)
  public void Include(BBox3 oBox)
  public void Include(BBox2 oBox, float fZ = 0)

  // Grows the bounding box by the specified value on each side I.E
  // PicoGK.BBox3.Grow (method)
  public void Grow(float fGrowBy)

  // Return the center of the Bounding Box
  // PicoGK.BBox3.vecCenter (method)
  public Vector3 vecCenter()

  // Fit the specified Bounding Box into this box, returning Scale and Offset
  // PicoGK.BBox3.oFitInto (method)
  public BBox3 oFitInto(in BBox3 oBounds, out float fScale, out Vector3 vecOffset)
  //   oBounds: Bounding box to fit into this box
  //   fScale: How much does it need to be scaled?
  //   vecOffset: How much does it need to be offset after scale

  // A function to return a random point in a Bounding Box
  // PicoGK.BBox3.vecRandomVectorInside (method)
  public Vector3 vecRandomVectorInside(ref Random oRand)
  //   oRand: Random number generator to use

  // Return the 2D extent of this Bounding Box
  // PicoGK.BBox3.oAsBoundingBox2 (method)
  public BBox2 oAsBoundingBox2()

  // Return the Bounding Box as string
  // PicoGK.BBox3.ToString (method)
  public override string ToString()

// ASCII CLI (Common Layer Interface) I/O based on https://www.hmilch.net/downloads/cli_format.html#:~:text=CLI%20is%20intended%20as%20a,data%20structure%20of%20the%20machine
CliIo

  // Format options for CLI writer
  EFormat

    // Uses an intentionally-empty first layer to allow the CLI reader to infer the layer height
    UseEmptyFirstLayer: UseEmptyFirstLayer

    // The first layer contains outlines (default)
    FirstLayerWithContent: FirstLayerWithContent

  // Result of a CLI import
  Result

    // The stack of slices that were imported
    oSlices: PolySliceStack

    // The bounding box of the slices contained in the file
    oBBoxFile: BBox3

    // Was the file binary?
    bBinary: bool

    // Units used in the header
    fUnitsHeader: float

    // Was the file aligned at 32 bit boundaries?
    b32BitAlign: bool

    // Version number of the CLI export
    nVersion: uint

    // Date string read from the header
    strHeaderDate: string

    // Number of layers in the file
    nLayers: uint

    // Warnings that were encountered during the file reading
    strWarnings: string

  // Write a stack of PolySlices to a CLI file
  // PicoGK.CliIo.WriteSlicesToCliFile (method)
  public static void WriteSlicesToCliFile(PolySliceStack oSlices, string strFilePath, CliIo.EFormat eFormat, string strDate = "", float fUnitsInMM = 0, IProgress? xProgress = null)
  //   oSlices: Stack of PolySlice objects
  //   strFilePath: Path and filename of the CLI file
  //   eFormat: Format options
  //   strDate: Optional date (if empty, current date is used)
  //   fUnitsInMM: Units to be used (in MM), 1000f results in coordinates to be written in meters
  //   xProgress: Optional progress reporting interface

  // Read PolySlice objects from a CLI file
  // PicoGK.CliIo.oSlicesFromCliFile (method)
  public static CliIo.Result oSlicesFromCliFile(string strFilePath)
  //   strFilePath: Path and filename of the file to read

// BGR 24 bit color value
ColorBgr24

  // Blue value (0..255)
  B: byte

  // Green value (0..255)
  G: byte

  // Red value (0..255)
  R: byte

  // Construct a BGR value from 3 bytes
  // PicoGK.ColorBgr24.ColorBgr24 (constructor)
  public ColorBgr24(byte byB, byte byG, byte byR)
  public ColorBgr24(ColorFloat clr)
  //   byB: Blue value
  //   byG: Green value
  //   byR: Red value

  // Allows you to pass a ColorFloat to any function that needs a ColorBgr24
  // PicoGK.ColorBgr24.op_Implicit (method)
  public static implicit operator ColorBgr24(ColorFloat clr)
  //   clr: The ColorFloat to use

// BGRA 32 bit color value
ColorBgra32

  // Blue value (0..255)
  B: byte

  // Green value (0..255)
  G: byte

  // Red value (0..255)
  R: byte

  // Alpha value (0..255)
  A: byte

  // Construct a 32 bit BGRA color value from 4 bytes
  // PicoGK.ColorBgra32.ColorBgra32 (constructor)
  public ColorBgra32(byte byB, byte byG, byte byR, byte byA = 255)
  public ColorBgra32(ColorFloat clr)
  //   byB: Blue value (0..255)
  //   byG: Green value (0..255)
  //   byR: Red value (0..255)
  //   byA: Alpha value (0..255)

  // Allows you to pass a ColorFloat to any function that needs a ColorBgra32
  // PicoGK.ColorBgra32.op_Implicit (method)
  public static implicit operator ColorBgra32(ColorFloat clr)
  //   clr: The ColorFloat to use

// A floating point color value with R,G,B,A values
ColorFloat

  // Red value (1 is full color)
  R: float

  // Green value (1 is full color)
  G: float

  // Blue value (1 is full color)
  B: float

  // Alpha value (1 is opaque, 0 is transparent)
  A: float

  // Create a color from a hex string #FF0000 is red, for example (# is optional) #FF000000 is a fully transparent color (0 is transparent FF/1.0 is full opaque) #FF is grayscale (white) #FF99 is semi-transparent white
  // PicoGK.ColorFloat.ColorFloat (constructor)
  public ColorFloat(string strHex)
  public ColorFloat(float fGray, float fAlpha = 1)
  public ColorFloat(float fR, float fG, float fB, float fAlpha = 1)
  public ColorFloat(ColorRgb24 clr)
  public ColorFloat(ColorRgba32 clr)
  public ColorFloat(ColorBgr24 clr)
  public ColorFloat(ColorBgra32 clr)
  public ColorFloat(ColorFloat clr, float fAlphaOverride)
  public ColorFloat(ColorHSV clrHSV)
  public ColorFloat(ColorHLS clrHLS)
  //   strHex: A 6 character or 8 character string with the color

  // Allows you to pass a hex string to any function that requires a FloatColor
  // PicoGK.ColorFloat.op_Implicit (method)
  public static implicit operator ColorFloat(string hex)
  //   hex: Hexcode string

  // Returns the color as a hex code such as "FF" for white, "AAAA" for transparent gray "AABBCC" for an RGB color value or "DDEEFF99" for a RGBA value
  // PicoGK.ColorFloat.strAsHexCode (method)
  public string strAsHexCode()

  // Returns the color value as an ABGR hex code (always 8 chars)
  // PicoGK.ColorFloat.strAsABGRHexCode (method)
  public string strAsABGRHexCode()

  // Returns the color as hex string
  // PicoGK.ColorFloat.ToString (method)
  public override string ToString()

  // Weighted linear interpolation between two colors
  // PicoGK.ColorFloat.clrWeighted (method)
  public static ColorFloat clrWeighted(ColorFloat clr1, ColorFloat clr2, float fWeight)
  //   clr1: First color
  //   clr2: Second color
  //   fWeight: Weight 0..1 to interpolate the color from First...Second

  // Return a random color
  // PicoGK.ColorFloat.clrRandom (method)
  public static ColorFloat clrRandom(Random? oRand = null)

// A color value in HSV space
ColorHLS

  // Hue value (0..360º)
  H: float

  // Lightness value (0..1)
  L: float

  // Saturation value (0..1)
  S: float

  // Create an HLS color from its three components
  // PicoGK.ColorHLS.ColorHLS (constructor)
  public ColorHLS(float fH, float fL, float fS)
  public ColorHLS(ColorFloat clr)
  //   fH: Hue (0..360º)
  //   fL: Lightness (0..1)
  //   fS: Saturation (0..1)

  // Implicit conversion from ColorFloat to ColorHLS
  // PicoGK.ColorHLS.op_Implicit (method)
  public static implicit operator ColorHLS(ColorFloat clr)
  public static implicit operator ColorFloat(ColorHLS clrHLS)
  //   clr: ColorFloat to be converted to ColorHLS

// Hue Saturation Value (HSV) color
ColorHSV

  // Hue (0..360º)
  H: float

  // Saturation (0..1)
  S: float

  // Value component
  V: float

  // Create an HSV value from its three components
  // PicoGK.ColorHSV.ColorHSV (constructor)
  public ColorHSV(float fH, float fS, float fV)
  public ColorHSV(ColorFloat clr)

  // Implicit conversion that allows you to pass a ColorFloat to any function requiring and HSV color
  // PicoGK.ColorHSV.op_Implicit (method)
  public static implicit operator ColorHSV(ColorFloat clr)
  public static implicit operator ColorFloat(ColorHSV clrHSV)
  //   clr: ColorFloat to be converted to HSV

// 24 bit RGB color
ColorRgb24

  // Red value (0..255)
  R: byte

  // Green value (0..255)
  G: byte

  // Blue value (0..255)
  B: byte

  // Construct a 24 bit RGB value from 3 byes
  // PicoGK.ColorRgb24.ColorRgb24 (constructor)
  public ColorRgb24(byte byR, byte byG, byte byB)
  public ColorRgb24(ColorFloat clr)
  //   byR: Red value
  //   byG: Green value
  //   byB: Blue value

  // Allows you to pass a ColorFloat to any function that needs a ColorRgb24
  // PicoGK.ColorRgb24.op_Implicit (method)
  public static implicit operator ColorRgb24(ColorFloat clr)
  //   clr: The ColorFloat to use

// 32 bit RGBA color
ColorRgba32

  // Red value (0..255)
  R: byte

  // Green value (0..255)
  G: byte

  // Blue value (0..255)
  B: byte

  // Alpha value 0..255 (255 is opaque)
  A: byte

  // Create a color from 3 or 4 bytes
  // PicoGK.ColorRgba32.ColorRgba32 (constructor)
  public ColorRgba32(byte byR, byte byG, byte byB, byte byA = 255)
  public ColorRgba32(ColorFloat clr)
  //   byR: Red color 0..255
  //   byG: Green color 0..255
  //   byB: Blue color 0..255
  //   byA: Alpha channel 0..255 (255 is opaque)

  // Allows you to pass a ColorFloat to any function that needs a ColorRgba32
  // PicoGK.ColorRgba32.op_Implicit (method)
  public static implicit operator ColorRgba32(ColorFloat clr)
  //   clr: The ColorFloat to use

Config

  strPicoGKLib: string

Coord

  X: int

  Y: int

  Z: int

  // PicoGK.Coord.Coord (constructor)
  public Coord(int x, int y, int z)

CsvTable

  // PicoGK.CsvTable.CsvTable (constructor)
  public CsvTable(IEnumerable<string>? astrColumnIDs = null)
  public CsvTable(string strFilePath, string strDelimiters = ",")

  // PicoGK.CsvTable.Save (method)
  public void Save(string strFilePath, string strDelimiter = ",")

  // PicoGK.CsvTable.nRowCount (method)
  public int nRowCount()

  // PicoGK.CsvTable.nMaxColumnCount (method)
  public int nMaxColumnCount()

  // PicoGK.CsvTable.strGetAt (method)
  public string strGetAt(int nRow, int nColumn)

  // PicoGK.CsvTable.SetKeyColumn (method)
  public void SetKeyColumn(int nColumn)

  // PicoGK.CsvTable.bGetAt (method)
  public bool bGetAt(in string strKey, ref float fVal)
  public bool bGetAt(in string strKey, ref string strVal)

  // PicoGK.CsvTable.bFindColumn (method)
  public bool bFindColumn(string strColumnName, out int nColumn)

  // PicoGK.CsvTable.strColumnId (method)
  public string strColumnId(int nColumn)

  // PicoGK.CsvTable.SetColumnIds (method)
  public void SetColumnIds(IEnumerable<string> astrIds)

  // PicoGK.CsvTable.AddRow (method)
  public void AddRow(IEnumerable<string> astrData)

// Easing functions — they take a float value from 0..1 and output an "eased" curve of the values, also from 0..1
Easing

  EEasing

    LINEAR: LINEAR

    SINE_IN: SINE_IN

    SINE_OUT: SINE_OUT

    SINE_INOUT: SINE_INOUT

    QUAD_IN: QUAD_IN

    QUAD_OUT: QUAD_OUT

    QUAD_INOUT: QUAD_INOUT

    CUBIC_IN: CUBIC_IN

    CUBIC_OUT: CUBIC_OUT

    CUBIC_INOUT: CUBIC_INOUT

  // PicoGK.Easing.fEaseSineIn (method)
  public static float fEaseSineIn(float x)

  // PicoGK.Easing.fEaseSineOut (method)
  public static float fEaseSineOut(float x)

  // PicoGK.Easing.fEaseSineInOut (method)
  public static float fEaseSineInOut(float x)

  // PicoGK.Easing.fEaseQuadIn (method)
  public static float fEaseQuadIn(float x)

  // PicoGK.Easing.fEaseQuadOut (method)
  public static float fEaseQuadOut(float x)

  // PicoGK.Easing.fEaseQuadInOut (method)
  public static float fEaseQuadInOut(float x)

  // PicoGK.Easing.fEaseCubicIn (method)
  public static float fEaseCubicIn(float x)

  // PicoGK.Easing.fEaseCubicOut (method)
  public static float fEaseCubicOut(float x)

  // PicoGK.Easing.fEaseCubicInOut (method)
  public static float fEaseCubicInOut(float x)

  // PicoGK.Easing.fEasingFunction (method)
  public static float fEasingFunction(float x, Easing.EEasing eEasing)

// Metadata table containing parameters associated with field types like Voxels, ScalarFields, VectorFields
FieldMetadata

  // Type of the data items in the metadata table
  EType

    UNKNOWN: UNKNOWN

    STRING: STRING

    FLOAT: FLOAT

    VECTOR: VECTOR

  lib: Library

  // Number of items in the metadata table
  // PicoGK.FieldMetadata.nCount (method)
  public int nCount()

  // Attempts to retrieve the name of the parameter at the index supplied
  // PicoGK.FieldMetadata.bGetNameAt (method)
  public bool bGetNameAt(int nIndex, out string strValueName)
  //   nIndex: Index value of the parameter
  //   strValueName: Name of the parameter at this position

  // Returns the type of the value with the specified name
  // PicoGK.FieldMetadata.eTypeAt (method)
  public FieldMetadata.EType eTypeAt(string strName)
  //   strName: Name of the parameter to retrieve

  // Returns the human readable type of the parameter with the specified name
  // PicoGK.FieldMetadata.strTypeAt (method)
  public string strTypeAt(string strName)
  //   strName: Name of the parameter

  // Translate the type enum to a string
  // PicoGK.FieldMetadata.strTypeName (method)
  public string strTypeName(FieldMetadata.EType eType)
  //   eType: Type to translate

  // Try to get the value of a parameter
  // PicoGK.FieldMetadata.bGetValueAt (method)
  public bool bGetValueAt(string strFieldName, out string strValue)
  public bool bGetValueAt(string strFieldName, out float fValue)
  public bool bGetValueAt(string strFieldName, out Vector3 vecValue)
  //   strFieldName: Name of the parameter
  //   strValue: Value returned

  // Set string value in the metadata table
  // PicoGK.FieldMetadata.SetValue (method)
  public void SetValue(string strFieldName, string strValue)
  public void SetValue(string strFieldName, float fValue)
  public void SetValue(string strFieldName, Vector3 vecValue)
  //   strFieldName: Name of the parameter
  //   strValue: Value to set

  // Remove a value from the metadata table
  // PicoGK.FieldMetadata.RemoveValue (method)
  public void RemoveValue(string strFieldName)
  //   strFieldName: Name of the value

  // Converts the contents of the metadata table to a string
  // PicoGK.FieldMetadata.ToString (method)
  public override string? ToString()

  // Internal constructor used by the Voxels, ScalarField and VectorField accessor function
  // PicoGK.FieldMetadata.FieldMetadata (constructor)
  public FieldMetadata(Library oLibrary, VdbMetaHandle hSource)
  //   oLibrary: Library instance to use
  //   hSource: This pointer

  // This function tests whether you are attempting to set internal metadata fields from your code — this can mess up openvdb and internal PicoGK functionality
  // PicoGK.FieldMetadata.GuardInternalFields (method)
  protected void GuardInternalFields(string strFieldName)
  //   strFieldName: Field name you are trying to set

  // PicoGK.FieldMetadata.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

GpuTexHandle

  Value: nint

  // PicoGK.GpuTexHandle.GpuTexHandle (constructor)
  public GpuTexHandle(nint Value)

GuiSideBarHandle

  Value: nint

  // PicoGK.GuiSideBarHandle.GuiSideBarHandle (constructor)
  public GuiSideBarHandle(nint Value)

// Interface for a bounded implicit function
IBoundedImplicit

  // Access the bounding box of the implicit function
  oBounds: BBox3

IDataTable

  // PicoGK.IDataTable.nMaxColumnCount (method)
  int nMaxColumnCount()

  // PicoGK.IDataTable.strColumnId (method)
  string strColumnId(int nColumn)

  // PicoGK.IDataTable.bFindColumn (method)
  bool bFindColumn(string strColumnName, out int nColumn)

  // PicoGK.IDataTable.nRowCount (method)
  int nRowCount()

  // PicoGK.IDataTable.strGetAt (method)
  string strGetAt(int nRow, int nColumn)

  // PicoGK.IDataTable.SetColumnIds (method)
  void SetColumnIds(IEnumerable<string> astrIds)

  // PicoGK.IDataTable.AddRow (method)
  void AddRow(IEnumerable<string> astrData)

IFieldWithMetadata

  // PicoGK.IFieldWithMetadata.oMetaData (method)
  FieldMetadata oMetaData()

// Function signature for signed distance implicts
IImplicit

  // Return the signed distance to the iso surface
  // PicoGK.IImplicit.fSignedDistance (method)
  float fSignedDistance(in Vector3 vec)
  //   vec: Real world point to sample

// Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
ILibraryHost

  // Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  DefaultLogFilePath: string

  // Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  // PicoGK.ILibraryHost.Run (method)
  void Run(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath, bool bEndAppWithTask, string strWindowTitle, string strLightsFile)

// Logging interface which allows you to output diagnostics
ILog

  // This function allows you to output information using the standard string functions, i.e
  // PicoGK.ILog.Log (method)
  void Log(in string strFormat, params object[] args)

// A generic progress reporting interface
IProgress

  // Report progress from 0..1
  // PicoGK.IProgress.Progress (method)
  void Progress(float f)

// An interface used to traverse the active values of a ScalarField
ITraverseScalarField

  // Called for every active value in the ScalarField object
  // PicoGK.ITraverseScalarField.InformActiveValue (method)
  void InformActiveValue(in Vector3 vecPosition, float fValue)
  //   vecPosition: Position in the field
  //   fValue: Value at the postion

// An interface to allow traversal of all active values in a VectorField
ITraverseVectorField

  // Called for every active value in the VectorField object
  // PicoGK.ITraverseVectorField.InformActiveValue (method)
  void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)
  //   vecPosition: Position in the VectorField
  //   vecValue: Value at position

// Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native window
IViewerBackend

  IsIdle: bool

  Orientation: Quaternion

  // PicoGK.IViewerBackend.Poll (method)
  bool Poll()

  // PicoGK.IViewerBackend.RequestUpdate (method)
  void RequestUpdate()

  // PicoGK.IViewerBackend.LoadLightSetup (method)
  void LoadLightSetup(byte[] abyDiffuseDds, byte[] abySpecularDds)

  // PicoGK.IViewerBackend.SetBackgroundColor (method)
  void SetBackgroundColor(ColorFloat color)

  // PicoGK.IViewerBackend.SetFieldOfView (method)
  void SetFieldOfView(float radians)

  // PicoGK.IViewerBackend.ZoomToFit (method)
  void ZoomToFit()

  // PicoGK.IViewerBackend.Add (method)
  void Add(Voxels vox, int nGroupID)
  void Add(Voxels vox, string name, int nGroupID)
  void Add(Mesh msh, int nGroupID)
  void Add(Mesh msh, string name, int nGroupID)
  void Add(PolyLine poly, int nGroupID)
  void Add(PolyLine poly, string name, int nGroupID)

  // PicoGK.IViewerBackend.Remove (method)
  void Remove(Voxels vox)
  void Remove(Mesh msh)
  void Remove(PolyLine poly)

  // PicoGK.IViewerBackend.SetObjectMatrix (method)
  void SetObjectMatrix(Voxels vox, Matrix4x4 mat)
  void SetObjectMatrix(Mesh msh, Matrix4x4 mat)
  void SetObjectMatrix(PolyLine poly, Matrix4x4 mat)

  // PicoGK.IViewerBackend.RemoveAllObjects (method)
  void RemoveAllObjects()

  // PicoGK.IViewerBackend.SetMechanism (method)
  void SetMechanism(object source)

  // PicoGK.IViewerBackend.RequestScreenShot (method)
  void RequestScreenShot(string strScreenShotPath)

  // PicoGK.IViewerBackend.EnableExperimental (method)
  void EnableExperimental(bool bEnable)

  // PicoGK.IViewerBackend.SetGroupVisible (method)
  void SetGroupVisible(int nGroupID, bool bVisible)

  // PicoGK.IViewerBackend.SetGroupMaterial (method)
  void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  void SetGroupMaterial(int groupId, Material material)

  // PicoGK.IViewerBackend.SetGroupMatrix (method)
  void SetGroupMatrix(int nGroupID, Matrix4x4 mat)

  // PicoGK.IViewerBackend.EnableOverhangWarning (method)
  void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError)

  // PicoGK.IViewerBackend.DisableOverhangWarning (method)
  void DisableOverhangWarning(int nGroupID)

  // PicoGK.IViewerBackend.GetBoundingBox (method)
  BBox3 GetBoundingBox()

Image

  EType

    BW: BW

    GRAY: GRAY

    COLOR: COLOR

  nWidth: int

  nHeight: int

  eType: Image.EType

  // PicoGK.Image.clrValue (method)
  public abstract ColorFloat clrValue(int x, int y)

  // PicoGK.Image.fValue (method)
  public abstract float fValue(int x, int y)

  // PicoGK.Image.bValue (method)
  public abstract bool bValue(int x, int y)

  // PicoGK.Image.SetValue (method)
  public abstract void SetValue(int x, int y, in ColorFloat clr)
  public abstract void SetValue(int x, int y, float fGray)
  public abstract void SetValue(int x, int y, bool bValue)
  public virtual void SetValue(int x, int y, byte byValue)

  // PicoGK.Image.byGetValue (method)
  public virtual byte byGetValue(int x, int y)

  // PicoGK.Image.sGetBgr24 (method)
  public virtual ColorBgr24 sGetBgr24(int x, int y)

  // PicoGK.Image.SetBgr24 (method)
  public virtual void SetBgr24(int x, int y, ColorBgr24 sClr)

  // PicoGK.Image.sGetBgra32 (method)
  public virtual ColorBgra32 sGetBgra32(int x, int y)

  // PicoGK.Image.SetBgra32 (method)
  public virtual void SetBgra32(int x, int y, ColorBgra32 sClr)

  // PicoGK.Image.sGetRgb24 (method)
  public virtual ColorRgb24 sGetRgb24(int x, int y)

  // PicoGK.Image.sGetRgba32 (method)
  public virtual ColorRgba32 sGetRgba32(int x, int y)

  // PicoGK.Image.SetRgb24 (method)
  public virtual void SetRgb24(int x, int y, ColorRgb24 sClr)

  // PicoGK.Image.SetRgba32 (method)
  public virtual void SetRgba32(int x, int y, ColorRgba32 sClr)

  // Returns the interpolated color value at a normalized coordinate going from 0..1
  // PicoGK.Image.clrGetAtNormalized (method)
  public ColorFloat clrGetAtNormalized(float fTX, float fTY)
  //   fTX: X coordinate 0..1
  //   fTY: Y coordinate 0..1

  // PicoGK.Image.DrawLine (method)
  public void DrawLine(int x0, int y0, int x1, int y1, ColorFloat clr)
  public void DrawLine(int x0, int y0, int x1, int y1, float fGrayscale)
  public void DrawLine(int x0, int y0, int x1, int y1, bool bValue)

  // PicoGK.Image.Image (constructor)
  protected Image(int _nWidth, int _nHeight, Image.EType _eType)

  // PicoGK.Image.imgFromSKBitmap (method)
  public static ImageRgba32 imgFromSKBitmap(SKBitmap oSKBitmap)

  // PicoGK.Image.op_Implicit (method)
  public static implicit operator SKBitmap(Image img)

  // PicoGK.Image.SavePng (method)
  public void SavePng(string strFileName, int iQuality = 100)

  // PicoGK.Image.SaveJpg (method)
  public void SaveJpg(string strFileName, int iQuality = 100)

  // PicoGK.Image.SaveTga (method)
  public void SaveTga(string strFileName)

  // PicoGK.Image.imgLoadFromFile (method)
  public static Image imgLoadFromFile(string strFileName)

ImageBWAbstract

  // PicoGK.ImageBWAbstract.ImageBWAbstract (constructor)
  public ImageBWAbstract(int _nWidth, int _nHeight)

  // PicoGK.ImageBWAbstract.fValue (method)
  public override float fValue(int x, int y)

  // PicoGK.ImageBWAbstract.clrValue (method)
  public override ColorFloat clrValue(int x, int y)

  // PicoGK.ImageBWAbstract.SetValue (method)
  public override void SetValue(int x, int y, float fValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

ImageColor

  // PicoGK.ImageColor.ImageColor (constructor)
  public ImageColor(int _nWidth, int _nHeight)
  public ImageColor(Image imgSource)

  // PicoGK.ImageColor.SetValue (method)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // PicoGK.ImageColor.clrValue (method)
  public override ColorFloat clrValue(int x, int y)

ImageColorAbstract

  // PicoGK.ImageColorAbstract.ImageColorAbstract (constructor)
  public ImageColorAbstract(int _iWidth, int _iHeight)

  // PicoGK.ImageColorAbstract.fValue (method)
  public override float fValue(int x, int y)

  // PicoGK.ImageColorAbstract.bValue (method)
  public override bool bValue(int x, int y)

  // PicoGK.ImageColorAbstract.SetValue (method)
  public override void SetValue(int x, int y, float f)
  public override void SetValue(int x, int y, bool bValue)

ImageGrayScale

  m_afValues: float[]

  // PicoGK.ImageGrayScale.ImageGrayScale (constructor)
  public ImageGrayScale(int _nWidth, int _nHeight)

  // PicoGK.ImageGrayScale.SetValue (method)
  public override void SetValue(int x, int y, float fGray)

  // PicoGK.ImageGrayScale.fValue (method)
  public override float fValue(int x, int y)

  // PicoGK.ImageGrayScale.imgGetColorCodedSDF (method)
  public ImageColor imgGetColorCodedSDF(float fBackground)

  // PicoGK.ImageGrayScale.imgGetInterpolated (method)
  public static ImageGrayScale imgGetInterpolated(ImageGrayScale oImg1, ImageGrayScale oImg2, float fWeight = 0.5)

ImageGrayscaleAbstract

  // PicoGK.ImageGrayscaleAbstract.ImageGrayscaleAbstract (constructor)
  public ImageGrayscaleAbstract(int _nWidth, int _nHeight)

  // PicoGK.ImageGrayscaleAbstract.clrValue (method)
  public override ColorFloat clrValue(int x, int y)

  // PicoGK.ImageGrayscaleAbstract.bValue (method)
  public override bool bValue(int x, int y)

  // PicoGK.ImageGrayscaleAbstract.SetValue (method)
  public override void SetValue(int x, int y, bool bValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // Returns whether the image has any pixels set to a value smaller or equal to the specified value This is useful to find out if a signed distance field slice contains any active voxels
  // PicoGK.ImageGrayscaleAbstract.bContainsActivePixels (method)
  public bool bContainsActivePixels(float fThreshold = 0)

ImageRgb24

  // PicoGK.ImageRgb24.ImageRgb24 (constructor)
  public ImageRgb24(int _nWidth, int _nHeight)
  public ImageRgb24(Image imgSource)

  // PicoGK.ImageRgb24.clrValue (method)
  public override ColorFloat clrValue(int x, int y)

  // PicoGK.ImageRgb24.SetValue (method)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // PicoGK.ImageRgb24.SetRgb24 (method)
  public override void SetRgb24(int x, int y, ColorRgb24 clr)

  // PicoGK.ImageRgb24.sGetRgb24 (method)
  public override ColorRgb24 sGetRgb24(int x, int y)

ImageRgba32

  // PicoGK.ImageRgba32.ImageRgba32 (constructor)
  public ImageRgba32(int _nWidth, int _nHeight)
  public ImageRgba32(Image imgSource)

  // PicoGK.ImageRgba32.clrValue (method)
  public override ColorFloat clrValue(int x, int y)

  // PicoGK.ImageRgba32.SetValue (method)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // PicoGK.ImageRgba32.SetRgba32 (method)
  public override void SetRgba32(int x, int y, ColorRgba32 clr)

  // PicoGK.ImageRgba32.sGetRgba32 (method)
  public override ColorRgba32 sGetRgba32(int x, int y)

LatHandle

  Value: long

  // PicoGK.LatHandle.LatHandle (constructor)
  public LatHandle(long Value)

// A lattice of beams (and spheres)
Lattice

  lib: Library

  // Creates a new empty Lattice, using the global library instance
  // PicoGK.Lattice.Lattice (constructor)
  public Lattice()
  public Lattice(Library libSet)

  // Add a sphere to the lattice
  // PicoGK.Lattice.AddSphere (method)
  public void AddSphere(in Vector3 vecCenter, float fRadius)
  //   vecCenter: Center point
  //   fRadius: Radius of the sphere

  // Add a beam to the lattice
  // PicoGK.Lattice.AddBeam (method)
  public void AddBeam(in Vector3 vecA, float fRadA, in Vector3 vecB, float fRadB, bool bRoundCap = true)
  public void AddBeam(in Vector3 vecA, in Vector3 vecB, float fRadA, float fRadB, bool bRoundCap = true)
  //   vecA: Starting point of the beam
  //   fRadA: Radius at starting point
  //   vecB: End point of the beam
  //   fRadB: Radius at end point
  //   bRoundCap: If true, beam has a hemispherical cap

  // PicoGK.Lattice.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

LibHandle

  Value: long

  // PicoGK.LibHandle.LibHandle (constructor)
  public LibHandle(long Value)
