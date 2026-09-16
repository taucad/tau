# PicoGK — PicoGK

42 top-level symbols. Signatures are verbatim csharp.

ActiveVoxelCounterScalar

  public static int nCount(ScalarField oField)

  protected ActiveVoxelCounterScalar(ScalarField oField)

  protected void Run()

  public void InformActiveValue(in Vector3 vecPosition, float fValue)

AddVectorFieldToViewer

  public static void AddToViewer(Viewer oViewer, VectorField oField, ColorFloat clr, int nStep = 10, float fArrow = 1, int nGroup = 0)

  protected AddVectorFieldToViewer(Viewer oViewer, VectorField oField, ColorFloat clr, int nStep, float fArrow, int nGroup)

  protected void Run()

  public void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)

Animation

  IAction

    void Do(float fTime)

  EType

    Once: Once

    Repeat: Repeat

    Wiggle: Wiggle

  public Animation(Animation.IAction xAction, float fDurationInSeconds, Animation.EType eType, Easing.EEasing eEasing)

  public void End()

  public bool bAnimate(float fCurrentTime)

AnimationQueue

  public AnimationQueue()

  public void Clear()

  public bool bPulse()

  public bool bIsIdle()

  public void Add(Animation oAnim)

// 2D Bounding Box object
BBox2

  // Minimum coordinate of the bounding box
  vecMin: Vector2

  // Maximum coordinate of the bounding box
  vecMax: Vector2

  // Creates an empty Bounding Box
  public BBox2()
  public BBox2(float fMinX, float fMinY, float fMaxX, float fMaxY)
  public BBox2(in Vector2 vecSetMin, in Vector2 vecSetMax)

  // Is the BoundingBox empty?
  public bool bIsEmpty()

  // Checks whether point is inside the bounding box
  public bool bContains(Vector2 vec)

  // Include the specified vector in the bounding box
  public void Include(Vector2 vec)
  public void Include(BBox2 oBox)

  // Grows the bounding box by the specified value on each side I.E
  public void Grow(float fGrowBy)

  // Returns the size of the Bounding Box
  public Vector2 vecSize()

  // Center point of the bounding box
  public Vector2 vecCenter()

  // A string representation of the Bounding Box
  public override string ToString()

// 3D bounding box
BBox3

  // Minimum coordinate of the bounding box
  vecMin: Vector3

  // Maximum coordinate of the bounding box
  vecMax: Vector3

  // Create an empty Bounding Box
  public BBox3()
  public BBox3(float fMinX, float fMinY, float fMinZ, float fMaxX, float fMaxY, float fMaxZ)
  public BBox3(in Vector3 vecSetMin, in Vector3 vecSetMax)

  // Size of the Bounding Box
  public Vector3 vecSize()

  // Is the Bounding Box empty>
  public bool bIsEmpty()

  // Checks whether the specified point is inside the bounding box
  public bool bContains(Vector3 vec)

  // Include the specified vector in the Bounding Box
  public void Include(Vector3 vec)
  public void Include(BBox3 oBox)
  public void Include(BBox2 oBox, float fZ = 0)

  // Grows the bounding box by the specified value on each side I.E
  public void Grow(float fGrowBy)

  // Return the center of the Bounding Box
  public Vector3 vecCenter()

  // Fit the specified Bounding Box into this box, returning Scale and Offset
  public BBox3 oFitInto(in BBox3 oBounds, out float fScale, out Vector3 vecOffset)
  //   oBounds: Bounding box to fit into this box
  //   fScale: How much does it need to be scaled?
  //   vecOffset: How much does it need to be offset after scale

  // A function to return a random point in a Bounding Box
  public Vector3 vecRandomVectorInside(ref Random oRand)
  //   oRand: Random number generator to use

  // Return the 2D extent of this Bounding Box
  public BBox2 oAsBoundingBox2()

  // Return the Bounding Box as string
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
  public static void WriteSlicesToCliFile(PolySliceStack oSlices, string strFilePath, CliIo.EFormat eFormat, string strDate = "", float fUnitsInMM = 0, IProgress? xProgress = null)
  //   oSlices: Stack of PolySlice objects
  //   strFilePath: Path and filename of the CLI file
  //   eFormat: Format options
  //   strDate: Optional date (if empty, current date is used)
  //   fUnitsInMM: Units to be used (in MM), 1000f results in coordinates to be written in meters
  //   xProgress: Optional progress reporting interface

  // Read PolySlice objects from a CLI file
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
  public ColorBgr24(byte byB, byte byG, byte byR)
  public ColorBgr24(ColorFloat clr)
  //   byB: Blue value
  //   byG: Green value
  //   byR: Red value

  // Allows you to pass a ColorFloat to any function that needs a ColorBgr24
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
  public ColorBgra32(byte byB, byte byG, byte byR, byte byA = 255)
  public ColorBgra32(ColorFloat clr)
  //   byB: Blue value (0..255)
  //   byG: Green value (0..255)
  //   byR: Red value (0..255)
  //   byA: Alpha value (0..255)

  // Allows you to pass a ColorFloat to any function that needs a ColorBgra32
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
  public static implicit operator ColorFloat(string hex)
  //   hex: Hexcode string

  // Returns the color as a hex code such as "FF" for white, "AAAA" for transparent gray "AABBCC" for an RGB color value or "DDEEFF99" for a RGBA value
  public string strAsHexCode()

  // Returns the color value as an ABGR hex code (always 8 chars)
  public string strAsABGRHexCode()

  // Returns the color as hex string
  public override string ToString()

  // Weighted linear interpolation between two colors
  public static ColorFloat clrWeighted(ColorFloat clr1, ColorFloat clr2, float fWeight)
  //   clr1: First color
  //   clr2: Second color
  //   fWeight: Weight 0..1 to interpolate the color from First...Second

  // Return a random color
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
  public ColorHLS(float fH, float fL, float fS)
  public ColorHLS(ColorFloat clr)
  //   fH: Hue (0..360º)
  //   fL: Lightness (0..1)
  //   fS: Saturation (0..1)

  // Implicit conversion from ColorFloat to ColorHLS
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
  public ColorHSV(float fH, float fS, float fV)
  public ColorHSV(ColorFloat clr)

  // Implicit conversion that allows you to pass a ColorFloat to any function requiring and HSV color
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
  public ColorRgb24(byte byR, byte byG, byte byB)
  public ColorRgb24(ColorFloat clr)
  //   byR: Red value
  //   byG: Green value
  //   byB: Blue value

  // Allows you to pass a ColorFloat to any function that needs a ColorRgb24
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
  public ColorRgba32(byte byR, byte byG, byte byB, byte byA = 255)
  public ColorRgba32(ColorFloat clr)
  //   byR: Red color 0..255
  //   byG: Green color 0..255
  //   byB: Blue color 0..255
  //   byA: Alpha channel 0..255 (255 is opaque)

  // Allows you to pass a ColorFloat to any function that needs a ColorRgba32
  public static implicit operator ColorRgba32(ColorFloat clr)
  //   clr: The ColorFloat to use

Config

  strPicoGKLib: string

Coord

  X: int

  Y: int

  Z: int

  public Coord(int x, int y, int z)

CsvTable

  public CsvTable(IEnumerable<string>? astrColumnIDs = null)
  public CsvTable(string strFilePath, string strDelimiters = ",")

  public void Save(string strFilePath, string strDelimiter = ",")

  public int nRowCount()

  public int nMaxColumnCount()

  public string strGetAt(int nRow, int nColumn)

  public void SetKeyColumn(int nColumn)

  public bool bGetAt(in string strKey, ref float fVal)
  public bool bGetAt(in string strKey, ref string strVal)

  public bool bFindColumn(string strColumnName, out int nColumn)

  public string strColumnId(int nColumn)

  public void SetColumnIds(IEnumerable<string> astrIds)

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

  public static float fEaseSineIn(float x)

  public static float fEaseSineOut(float x)

  public static float fEaseSineInOut(float x)

  public static float fEaseQuadIn(float x)

  public static float fEaseQuadOut(float x)

  public static float fEaseQuadInOut(float x)

  public static float fEaseCubicIn(float x)

  public static float fEaseCubicOut(float x)

  public static float fEaseCubicInOut(float x)

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
  public int nCount()

  // Attempts to retrieve the name of the parameter at the index supplied
  public bool bGetNameAt(int nIndex, out string strValueName)
  //   nIndex: Index value of the parameter
  //   strValueName: Name of the parameter at this position

  // Returns the type of the value with the specified name
  public FieldMetadata.EType eTypeAt(string strName)
  //   strName: Name of the parameter to retrieve

  // Returns the human readable type of the parameter with the specified name
  public string strTypeAt(string strName)
  //   strName: Name of the parameter

  // Translate the type enum to a string
  public string strTypeName(FieldMetadata.EType eType)
  //   eType: Type to translate

  // Try to get the value of a parameter
  public bool bGetValueAt(string strFieldName, out string strValue)
  public bool bGetValueAt(string strFieldName, out float fValue)
  public bool bGetValueAt(string strFieldName, out Vector3 vecValue)
  //   strFieldName: Name of the parameter
  //   strValue: Value returned

  // Set string value in the metadata table
  public void SetValue(string strFieldName, string strValue)
  public void SetValue(string strFieldName, float fValue)
  public void SetValue(string strFieldName, Vector3 vecValue)
  //   strFieldName: Name of the parameter
  //   strValue: Value to set

  // Remove a value from the metadata table
  public void RemoveValue(string strFieldName)
  //   strFieldName: Name of the value

  // Converts the contents of the metadata table to a string
  public override string? ToString()

  // Internal constructor used by the Voxels, ScalarField and VectorField accessor function
  public FieldMetadata(Library oLibrary, VdbMetaHandle hSource)
  //   oLibrary: Library instance to use
  //   hSource: This pointer

  // This function tests whether you are attempting to set internal metadata fields from your code — this can mess up openvdb and internal PicoGK functionality
  protected void GuardInternalFields(string strFieldName)
  //   strFieldName: Field name you are trying to set

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

GpuTexHandle

  Value: nint

  public GpuTexHandle(nint Value)

GuiSideBarHandle

  Value: nint

  public GuiSideBarHandle(nint Value)

// Interface for a bounded implicit function
IBoundedImplicit

  // Access the bounding box of the implicit function
  oBounds: BBox3

IDataTable

  int nMaxColumnCount()

  string strColumnId(int nColumn)

  bool bFindColumn(string strColumnName, out int nColumn)

  int nRowCount()

  string strGetAt(int nRow, int nColumn)

  void SetColumnIds(IEnumerable<string> astrIds)

  void AddRow(IEnumerable<string> astrData)

IFieldWithMetadata

  FieldMetadata oMetaData()

// Function signature for signed distance implicts
IImplicit

  // Return the signed distance to the iso surface
  float fSignedDistance(in Vector3 vec)
  //   vec: Real world point to sample

// Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
ILibraryHost

  // Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  DefaultLogFilePath: string

  // Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  void Run(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath, bool bEndAppWithTask, string strWindowTitle, string strLightsFile)

// Logging interface which allows you to output diagnostics
ILog

  // This function allows you to output information using the standard string functions, i.e
  void Log(in string strFormat, params object[] args)

// A generic progress reporting interface
IProgress

  // Report progress from 0..1
  void Progress(float f)

// An interface used to traverse the active values of a ScalarField
ITraverseScalarField

  // Called for every active value in the ScalarField object
  void InformActiveValue(in Vector3 vecPosition, float fValue)
  //   vecPosition: Position in the field
  //   fValue: Value at the postion

// An interface to allow traversal of all active values in a VectorField
ITraverseVectorField

  // Called for every active value in the VectorField object
  void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)
  //   vecPosition: Position in the VectorField
  //   vecValue: Value at position

// Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native window
IViewerBackend

  IsIdle: bool

  Orientation: Quaternion

  bool Poll()

  void RequestUpdate()

  void LoadLightSetup(byte[] abyDiffuseDds, byte[] abySpecularDds)

  void SetBackgroundColor(ColorFloat color)

  void SetFieldOfView(float radians)

  void ZoomToFit()

  void Add(Voxels vox, int nGroupID)
  void Add(Mesh msh, int nGroupID)
  void Add(PolyLine poly, int nGroupID)

  void Remove(Voxels vox)
  void Remove(Mesh msh)
  void Remove(PolyLine poly)

  void SetObjectMatrix(Voxels vox, Matrix4x4 mat)
  void SetObjectMatrix(Mesh msh, Matrix4x4 mat)
  void SetObjectMatrix(PolyLine poly, Matrix4x4 mat)

  void RemoveAllObjects()

  void RequestScreenShot(string strScreenShotPath)

  void EnableExperimental(bool bEnable)

  void SetGroupVisible(int nGroupID, bool bVisible)

  void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)

  void SetGroupMatrix(int nGroupID, Matrix4x4 mat)

  void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError)

  void DisableOverhangWarning(int nGroupID)

  BBox3 GetBoundingBox()

Image

  EType

    BW: BW

    GRAY: GRAY

    COLOR: COLOR

  nWidth: int

  nHeight: int

  eType: Image.EType

  public abstract ColorFloat clrValue(int x, int y)

  public abstract float fValue(int x, int y)

  public abstract bool bValue(int x, int y)

  public abstract void SetValue(int x, int y, in ColorFloat clr)
  public abstract void SetValue(int x, int y, float fGray)
  public abstract void SetValue(int x, int y, bool bValue)
  public virtual void SetValue(int x, int y, byte byValue)

  public virtual byte byGetValue(int x, int y)

  public virtual ColorBgr24 sGetBgr24(int x, int y)

  public virtual void SetBgr24(int x, int y, ColorBgr24 sClr)

  public virtual ColorBgra32 sGetBgra32(int x, int y)

  public virtual void SetBgra32(int x, int y, ColorBgra32 sClr)

  public virtual ColorRgb24 sGetRgb24(int x, int y)

  public virtual ColorRgba32 sGetRgba32(int x, int y)

  public virtual void SetRgb24(int x, int y, ColorRgb24 sClr)

  public virtual void SetRgba32(int x, int y, ColorRgba32 sClr)

  // Returns the interpolated color value at a normalized coordinate going from 0..1
  public ColorFloat clrGetAtNormalized(float fTX, float fTY)
  //   fTX: X coordinate 0..1
  //   fTY: Y coordinate 0..1

  public void DrawLine(int x0, int y0, int x1, int y1, ColorFloat clr)
  public void DrawLine(int x0, int y0, int x1, int y1, float fGrayscale)
  public void DrawLine(int x0, int y0, int x1, int y1, bool bValue)

  protected Image(int _nWidth, int _nHeight, Image.EType _eType)

  public static ImageRgba32 imgFromSKBitmap(SKBitmap oSKBitmap)

  public static implicit operator SKBitmap(Image img)

  public void SavePng(string strFileName, int iQuality = 100)

  public void SaveJpg(string strFileName, int iQuality = 100)

  public void SaveTga(string strFileName)

  public static Image imgLoadFromFile(string strFileName)

ImageBWAbstract

  public ImageBWAbstract(int _nWidth, int _nHeight)

  public override float fValue(int x, int y)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, float fValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

ImageColor

  public ImageColor(int _nWidth, int _nHeight)
  public ImageColor(Image imgSource)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override ColorFloat clrValue(int x, int y)

ImageColorAbstract

  public ImageColorAbstract(int _iWidth, int _iHeight)

  public override float fValue(int x, int y)

  public override bool bValue(int x, int y)

  public override void SetValue(int x, int y, float f)
  public override void SetValue(int x, int y, bool bValue)

ImageGrayScale

  m_afValues: float[]

  public ImageGrayScale(int _nWidth, int _nHeight)

  public override void SetValue(int x, int y, float fGray)

  public override float fValue(int x, int y)

  public ImageColor imgGetColorCodedSDF(float fBackground)

  public static ImageGrayScale imgGetInterpolated(ImageGrayScale oImg1, ImageGrayScale oImg2, float fWeight = 0.5)

ImageGrayscaleAbstract

  public ImageGrayscaleAbstract(int _nWidth, int _nHeight)

  public override ColorFloat clrValue(int x, int y)

  public override bool bValue(int x, int y)

  public override void SetValue(int x, int y, bool bValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // Returns whether the image has any pixels set to a value smaller or equal to the specified value This is useful to find out if a signed distance field slice contains any active voxels
  public bool bContainsActivePixels(float fThreshold = 0)

ImageRgb24

  public ImageRgb24(int _nWidth, int _nHeight)
  public ImageRgb24(Image imgSource)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override void SetRgb24(int x, int y, ColorRgb24 clr)

  public override ColorRgb24 sGetRgb24(int x, int y)

ImageRgba32

  public ImageRgba32(int _nWidth, int _nHeight)
  public ImageRgba32(Image imgSource)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override void SetRgba32(int x, int y, ColorRgba32 clr)

  public override ColorRgba32 sGetRgba32(int x, int y)

LatHandle

  Value: long

  public LatHandle(long Value)

// A lattice of beams (and spheres)
Lattice

  lib: Library

  // Creates a new empty Lattice, using the global library instance
  public Lattice()
  public Lattice(Library libSet)

  // Add a sphere to the lattice
  public void AddSphere(in Vector3 vecCenter, float fRadius)
  //   vecCenter: Center point
  //   fRadius: Radius of the sphere

  // Add a beam to the lattice
  public void AddBeam(in Vector3 vecA, float fRadA, in Vector3 vecB, float fRadB, bool bRoundCap = true)
  public void AddBeam(in Vector3 vecA, in Vector3 vecB, float fRadA, float fRadB, bool bRoundCap = true)
  //   vecA: Starting point of the beam
  //   fRadA: Radius at starting point
  //   vecB: End point of the beam
  //   fRadB: Radius at end point
  //   bRoundCap: If true, beam has a hemispherical cap

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

LibHandle

  Value: long

  public LibHandle(long Value)
