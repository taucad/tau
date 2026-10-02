# PicoGK — CAD authoring — PicoGK

34 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
public class ActiveVoxelCounterScalar : ITraverseScalarField

  public static int nCount(ScalarField oField)

  public void InformActiveValue(in Vector3 vecPosition, float fValue)

// Category: CAD authoring
public class AddVectorFieldToViewer : ITraverseVectorField

  public static void AddToViewer(Viewer oViewer, VectorField oField, ColorFloat clr, int nStep = 10, float fArrow = 1f, int nGroup = 0)

  public void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)

// Category: CAD authoring
public class Animation

  public interface IAction

    void Do(float fTime)

  public enum EType

    Once

    Repeat

    Wiggle

  public Animation(IAction xAction, float fDurationInSeconds, EType eType, Easing.EEasing eEasing)

  public void End()

  public bool bAnimate(float fCurrentTime)

// Category: CAD authoring
public class AnimationQueue

  public AnimationQueue()

  public void Clear()

  public bool bPulse()

  public bool bIsIdle()

  public void Add(Animation oAnim)

// Category: CAD authoring
// 2D Bounding Box object
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct BBox2

  // Minimum coordinate of the bounding box
  public Vector2 vecMin = new();

  // Maximum coordinate of the bounding box
  public Vector2 vecMax = new();

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

// Category: CAD authoring
// 3D bounding box
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct BBox3

  // Minimum coordinate of the bounding box
  public Vector3 vecMin = new();

  // Maximum coordinate of the bounding box
  public Vector3 vecMax = new();

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
  public void Include(BBox2 oBox, float fZ = 0.0f)

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

// Category: CAD authoring
// ASCII CLI (Common Layer Interface) I/O based on https://www.hmilch.net/downloads/cli_format.html#:~:text=CLI%20is%20intended%20as%20a,data%20structure%20of%20the%20machine
public static class CliIo

  // Format options for CLI writer
  public enum EFormat

    // Uses an intentionally-empty first layer to allow the CLI reader to infer the layer height
    UseEmptyFirstLayer

    // The first layer contains outlines (default)
    FirstLayerWithContent

  // Result of a CLI import
  public class Result

    // The stack of slices that were imported
    public PolySliceStack oSlices = new();

    // The bounding box of the slices contained in the file
    public BBox3 oBBoxFile = new();

    // Was the file binary?
    public bool bBinary = false;

    // Units used in the header
    public float fUnitsHeader = 0.0f;

    // Was the file aligned at 32 bit boundaries?
    public bool b32BitAlign = false;

    // Version number of the CLI export
    public UInt32 nVersion = 0;

    // Date string read from the header
    public string strHeaderDate = "";

    // Number of layers in the file
    public UInt32 nLayers = 0;

    // Warnings that were encountered during the file reading
    public string strWarnings = "";

    public Result()

  // Write a stack of PolySlices to a CLI file
  // Throws: System.Exception: Throws and exception if no valid slices or file IO issues were encountered
  public static void WriteSlicesToCliFile(PolySliceStack oSlices, string strFilePath, EFormat eFormat, string strDate = "", float fUnitsInMM = 0.0f, IProgress? xProgress = null)
  //   oSlices: Stack of PolySlice objects
  //   strFilePath: Path and filename of the CLI file
  //   eFormat: Format options
  //   strDate: Optional date (if empty, current date is used)
  //   fUnitsInMM: Units to be used (in MM), 1000f results in coordinates to be written in meters
  //   xProgress: Optional progress reporting interface

  // Read PolySlice objects from a CLI file
  // Throws: System.ArgumentException: Thrown if file contains invalid parameters
  // Throws: System.NotSupportedException: Thrown if unsupported features encountered, notably binary is not supported
  public static Result oSlicesFromCliFile(string strFilePath)
  //   strFilePath: Path and filename of the file to read

// Category: CAD authoring
// BGR 24 bit color value
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct ColorBgr24

  // Blue value (0..255)
  public byte B;

  // Green value (0..255)
  public byte G;

  // Red value (0..255)
  public byte R;

  // Construct a BGR value from 3 bytes
  public ColorBgr24(byte byB, byte byG, byte byR)
  public ColorBgr24(ColorFloat clr)
  public ColorBgr24()
  //   byB: Blue value
  //   byG: Green value
  //   byR: Red value

  // Allows you to pass a ColorFloat to any function that needs a ColorBgr24
  public static implicit operator ColorBgr24(ColorFloat clr)
  //   clr: The ColorFloat to use

// Category: CAD authoring
// BGRA 32 bit color value
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct ColorBgra32

  // Blue value (0..255)
  public byte B;

  // Green value (0..255)
  public byte G;

  // Red value (0..255)
  public byte R;

  // Alpha value (0..255)
  public byte A;

  // Construct a 32 bit BGRA color value from 4 bytes
  public ColorBgra32(byte byB, byte byG, byte byR, byte byA = 255)
  public ColorBgra32(ColorFloat clr)
  public ColorBgra32()
  //   byB: Blue value (0..255)
  //   byG: Green value (0..255)
  //   byR: Red value (0..255)
  //   byA: Alpha value (0..255)

  // Allows you to pass a ColorFloat to any function that needs a ColorBgra32
  public static implicit operator ColorBgra32(ColorFloat clr)
  //   clr: The ColorFloat to use

// Category: CAD authoring
// A floating point color value with R,G,B,A values
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public partial struct ColorFloat

  // Red value (1 is full color)
  public float R;

  // Green value (1 is full color)
  public float G;

  // Blue value (1 is full color)
  public float B;

  // Alpha value (1 is opaque, 0 is transparent)
  public float A;

  // Create a color from a hex string #FF0000 is red, for example (# is optional) #FF000000 is a fully transparent color (0 is transparent FF/1.0 is full opaque) #FF is grayscale (white) #FF99 is semi-transparent white
  // Throws: System.ArgumentException: Throws an exception if different sizes
  public ColorFloat(string strHex)
  public ColorFloat(float fGray, float fAlpha = 1.0f)
  public ColorFloat(float fR, float fG, float fB, float fAlpha = 1.0f)
  public ColorFloat(ColorRgb24 clr)
  public ColorFloat(ColorRgba32 clr)
  public ColorFloat(ColorBgr24 clr)
  public ColorFloat(ColorBgra32 clr)
  public ColorFloat(ColorFloat clr, float fAlphaOverride)
  public ColorFloat(ColorHSV clrHSV)
  public ColorFloat(ColorHLS clrHLS)
  public ColorFloat()
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

// Category: CAD authoring
// A color value in HSV space
public struct ColorHLS

  // Hue value (0..360º)
  public float H;

  // Lightness value (0..1)
  public float L;

  // Saturation value (0..1)
  public float S;

  // Create an HLS color from its three components
  public ColorHLS(float fH, float fL, float fS)
  public ColorHLS(ColorFloat clr)
  public ColorHLS()
  //   fH: Hue (0..360º)
  //   fL: Lightness (0..1)
  //   fS: Saturation (0..1)

  // Implicit conversion from ColorFloat to ColorHLS
  public static implicit operator ColorHLS(ColorFloat clr)
  public static implicit operator ColorFloat(ColorHLS clrHLS)
  //   clr: ColorFloat to be converted to ColorHLS

// Category: CAD authoring
// Hue Saturation Value (HSV) color
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct ColorHSV

  // Hue (0..360º)
  public float H;

  // Saturation (0..1)
  public float S;

  // Value component
  public float V;

  // Create an HSV value from its three components
  public ColorHSV(float fH, float fS, float fV)
  public ColorHSV(ColorFloat clr)
  public ColorHSV()

  // Implicit conversion that allows you to pass a ColorFloat to any function requiring and HSV color
  public static implicit operator ColorHSV(ColorFloat clr)
  public static implicit operator ColorFloat(ColorHSV clrHSV)
  //   clr: ColorFloat to be converted to HSV

// Category: CAD authoring
// 24 bit RGB color
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct ColorRgb24

  // Red value (0..255)
  public byte R;

  // Green value (0..255)
  public byte G;

  // Blue value (0..255)
  public byte B;

  // Construct a 24 bit RGB value from 3 byes
  public ColorRgb24(byte byR, byte byG, byte byB)
  public ColorRgb24(ColorFloat clr)
  public ColorRgb24()
  //   byR: Red value
  //   byG: Green value
  //   byB: Blue value

  // Allows you to pass a ColorFloat to any function that needs a ColorRgb24
  public static implicit operator ColorRgb24(ColorFloat clr)
  //   clr: The ColorFloat to use

// Category: CAD authoring
// 32 bit RGBA color
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct ColorRgba32

  // Red value (0..255)
  public byte R;

  // Green value (0..255)
  public byte G;

  // Blue value (0..255)
  public byte B;

  // Alpha value 0..255 (255 is opaque)
  public byte A;

  // Create a color from 3 or 4 bytes
  public ColorRgba32(byte byR, byte byG, byte byB, byte byA = 255)
  public ColorRgba32(ColorFloat clr)
  public ColorRgba32()
  //   byR: Red color 0..255
  //   byG: Green color 0..255
  //   byB: Blue color 0..255
  //   byA: Alpha channel 0..255 (255 is opaque)

  // Allows you to pass a ColorFloat to any function that needs a ColorRgba32
  public static implicit operator ColorRgba32(ColorFloat clr)
  //   clr: The ColorFloat to use

// Category: CAD authoring
public partial class Config

  public const string strPicoGKLib = "picogk.26.2";

  public Config()

// Category: CAD authoring
public class CsvTable : IDataTable

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

// Category: CAD authoring
// Easing functions — they take a float value from 0..1 and output an "eased" curve of the values, also from 0..1
public class Easing

  public enum EEasing

    LINEAR

    SINE_IN

    SINE_OUT

    SINE_INOUT

    QUAD_IN

    QUAD_OUT

    QUAD_INOUT

    CUBIC_IN

    CUBIC_OUT

    CUBIC_INOUT

  public static float fEaseSineIn(float x)

  public static float fEaseSineOut(float x)

  public static float fEaseSineInOut(float x)

  public static float fEaseQuadIn(float x)

  public static float fEaseQuadOut(float x)

  public static float fEaseQuadInOut(float x)

  public static float fEaseCubicIn(float x)

  public static float fEaseCubicOut(float x)

  public static float fEaseCubicInOut(float x)

  public static float fEasingFunction(float x, EEasing eEasing)

  public Easing()

// Category: CAD authoring
// Metadata table containing parameters associated with field types like Voxels, ScalarFields, VectorFields
public partial class FieldMetadata : IDisposable

  // Type of the data items in the metadata table
  public enum EType

    UNKNOWN = -1

    STRING = 0

    FLOAT

    VECTOR

  // Number of items in the metadata table
  public int nCount()

  // Attempts to retrieve the name of the parameter at the index supplied
  public bool bGetNameAt(int nIndex, out string strValueName)
  //   nIndex: Index value of the parameter
  //   strValueName: Name of the parameter at this position

  // Returns the type of the value with the specified name
  public EType eTypeAt(string strName)
  //   strName: Name of the parameter to retrieve

  // Returns the human readable type of the parameter with the specified name
  public string strTypeAt(string strName)
  //   strName: Name of the parameter

  // Translate the type enum to a string
  public string strTypeName(EType eType)
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

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// Interface for a bounded implicit function
public interface IBoundedImplicit : IImplicit

  // Access the bounding box of the implicit function
  BBox3 oBounds { get; }

// Category: CAD authoring
public interface IDataTable

  int nMaxColumnCount()

  string strColumnId(int nColumn)

  bool bFindColumn(string strColumnName, out int nColumn)

  int nRowCount()

  string strGetAt(int nRow, int nColumn)

  void SetColumnIds(IEnumerable<string> astrIds)

  void AddRow(IEnumerable<string> astrData)

// Category: CAD authoring
public interface IFieldWithMetadata

  // Return metadata borrowed from this field owner
  // Remarks: The field disposes its metadata. Keep the metadata within the field lifetime and leave its disposal to that field.
  public FieldMetadata oMetaData()

// Category: CAD authoring
// Function signature for signed distance implicts
public interface IImplicit

  // Return the signed distance to the iso surface
  public abstract float fSignedDistance(in Vector3 vec)
  //   vec: Real world point to sample

// Category: CAD authoring
// Logging interface which allows you to output diagnostics
public interface ILog

  // This function allows you to output information using the standard string functions, i.e
  void Log(in string strFormat, params object[] args)

// Category: CAD authoring
// A generic progress reporting interface
public interface IProgress

  // Report progress from 0..1
  void Progress(float f)

// Category: CAD authoring
// An interface used to traverse the active values of a ScalarField
public interface ITraverseScalarField

  // Called for every active value in the ScalarField object
  public abstract void InformActiveValue(in Vector3 vecPosition, float fValue)
  //   vecPosition: Position in the field
  //   fValue: Value at the postion

// Category: CAD authoring
// An interface to allow traversal of all active values in a VectorField
public interface ITraverseVectorField

  // Called for every active value in the VectorField object
  public abstract void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)
  //   vecPosition: Position in the VectorField
  //   vecValue: Value at position

// Category: CAD authoring
public abstract partial class Image

  public enum EType

    BW

    GRAY

    COLOR

  public readonly int nWidth;

  public readonly int nHeight;

  public readonly EType eType;

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

  public static ImageRgba32 imgFromSKBitmap(SKBitmap oSKBitmap)

  public static implicit operator SKBitmap(Image img)

  public void SavePng(string strFileName, int iQuality = 100)

  public void SaveJpg(string strFileName, int iQuality = 100)

  public void SaveTga(string strFileName)

  public static Image imgLoadFromFile(string strFileName)

// Category: CAD authoring
public abstract partial class ImageBWAbstract : Image

  public ImageBWAbstract(int _nWidth, int _nHeight)

  public override float fValue(int x, int y)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, float fValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

// Category: CAD authoring
public partial class ImageColor : ImageColorAbstract

  public ImageColor(int _nWidth, int _nHeight)
  public ImageColor(Image imgSource)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override ColorFloat clrValue(int x, int y)

// Category: CAD authoring
public abstract partial class ImageColorAbstract : Image

  public ImageColorAbstract(int _iWidth, int _iHeight)

  public override float fValue(int x, int y)

  public override bool bValue(int x, int y)

  public override void SetValue(int x, int y, float f)
  public override void SetValue(int x, int y, bool bValue)

// Category: CAD authoring
public partial class ImageGrayScale : ImageGrayscaleAbstract

  public float[] m_afValues;

  public ImageGrayScale(int _nWidth, int _nHeight)

  public override void SetValue(int x, int y, float fGray)

  public override float fValue(int x, int y)

  public ImageColor imgGetColorCodedSDF(float fBackground)

  public static ImageGrayScale imgGetInterpolated(ImageGrayScale oImg1, ImageGrayScale oImg2, float fWeight = 0.5f)

// Category: CAD authoring
public abstract partial class ImageGrayscaleAbstract : Image

  public ImageGrayscaleAbstract(int _nWidth, int _nHeight)

  public override ColorFloat clrValue(int x, int y)

  public override bool bValue(int x, int y)

  public override void SetValue(int x, int y, bool bValue)
  public override void SetValue(int x, int y, in ColorFloat clr)

  // Returns whether the image has any pixels set to a value smaller or equal to the specified value This is useful to find out if a signed distance field slice contains any active voxels
  public bool bContainsActivePixels(float fThreshold = 0.0f)

// Category: CAD authoring
public partial class ImageRgb24 : ImageColorAbstract

  public ImageRgb24(int _nWidth, int _nHeight)
  public ImageRgb24(Image imgSource)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override void SetRgb24(int x, int y, ColorRgb24 clr)

  public override ColorRgb24 sGetRgb24(int x, int y)

// Category: CAD authoring
public partial class ImageRgba32 : ImageColorAbstract

  public ImageRgba32(int _nWidth, int _nHeight)
  public ImageRgba32(Image imgSource)

  public override ColorFloat clrValue(int x, int y)

  public override void SetValue(int x, int y, in ColorFloat clr)

  public override void SetRgba32(int x, int y, ColorRgba32 clr)

  public override ColorRgba32 sGetRgba32(int x, int y)
