# PicoGK — CAD authoring — PicoGK (3)

19 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// OpenVdbFile handles the creation, loading and saving of openvdb .VDB files
// PicoGK.OpenVdbFile (class)
public partial class OpenVdbFile : IDisposable

  // Types of fields in .VDB files
  // PicoGK.OpenVdbFile.EFieldType (enum)
  public enum EFieldType

    // Unsupported data type (for example FOG)
    // PicoGK.OpenVdbFile.EFieldType.Unsupported (enumMember)
    Unsupported = -1

    // PicoGK.Voxels field
    // PicoGK.OpenVdbFile.EFieldType.Voxels (enumMember)
    Voxels = 0

    // PicoGK.ScalarField type
    // PicoGK.OpenVdbFile.EFieldType.ScalarField (enumMember)
    ScalarField = 1

    // PicoGK.ScalerField type
    // PicoGK.OpenVdbFile.EFieldType.VectorField (enumMember)
    VectorField = 2

  // Create an empty openvdb file object
  // PicoGK.OpenVdbFile.OpenVdbFile (constructor)
  public OpenVdbFile()
  public OpenVdbFile(string strFileName)
  public OpenVdbFile(Library libSet)
  public OpenVdbFile(Library libSet, string strFileName)

  // Create a PicoGK library object that is compatible with the specified OpenVDB file, i.e
  // PicoGK.OpenVdbFile.libCreateCompatibleLibraryFor (method)
  public static Library libCreateCompatibleLibraryFor(string strVdbFilePath)

  // Saves the current object with all of its attached fields to a .VDB container
  // Throws: System.IO.IOException: Throws exception if unable to save
  // PicoGK.OpenVdbFile.SaveToFile (method)
  public void SaveToFile(string strFileName)
  //   strFileName: Path and filename to save to

  // Get the Voxels at the index specified
  // Throws: Throws exception if no Voxels found at index
  // PicoGK.OpenVdbFile.voxGet (method)
  public Voxels voxGet(int nIndex)
  public Voxels voxGet(string strName)
  //   nIndex: Index of the field

  // Adds a copy of the specified Voxels to the VdbFile object
  // PicoGK.OpenVdbFile.nAdd (method)
  public int nAdd(Voxels vox, string strFieldName = "")
  public int nAdd(ScalarField oField, string strFieldName = "")
  public int nAdd(VectorField oField, string strFieldName = "")
  //   vox: Voxels to add
  //   strFieldName: Field name (if not specified, autogenerates a unique one

  // Get the ScalarField at the index specified
  // Throws: Throws exception if no ScalarField found at index
  // PicoGK.OpenVdbFile.oGetScalarField (method)
  public ScalarField oGetScalarField(int nIndex)
  public ScalarField oGetScalarField(string strName)
  //   nIndex: Index of the field

  // Get the VectorField at the index specified
  // Throws: Throws exception if no ScalarField found at index
  // PicoGK.OpenVdbFile.oGetVectorField (method)
  public VectorField oGetVectorField(int nIndex)
  public VectorField oGetVectorField(string strName)
  //   nIndex: Index of the field

  // Number of fields stored in the VdbFile container
  // PicoGK.OpenVdbFile.nFieldCount (method)
  public int nFieldCount()

  // Returns the name of the field (if specified) at the given field index
  // Throws: System.Exception: Throws exception if out of range
  // PicoGK.OpenVdbFile.strFieldName (method)
  public string strFieldName(int nIndex)
  //   nIndex: Index of the field

  // Returns the type of the field at the given field index
  // Throws: System.Exception: Throws exception if out of range
  // PicoGK.OpenVdbFile.eFieldType (method)
  public EFieldType eFieldType(int nIndex)
  //   nIndex: Index of the field

  // Returns the field type at the given index as string
  // Throws: System.ArgumentOutOfRangeException: If the field index is out of range, an exception is thrown
  // PicoGK.OpenVdbFile.strFieldType (method)
  public string strFieldType(int nIndex)
  //   nIndex: Index of the field

  // PicoGK.OpenVdbFile.xField (method)
  public IFieldWithMetadata xField(int nIndex)

  // PicoGK.OpenVdbFile.bIsPicoGKCompatible (method)
  public bool bIsPicoGKCompatible()

  // PicoGK.OpenVdbFile.fPicoGKVoxelSizeMM (method)
  public float fPicoGKVoxelSizeMM()

  // PicoGK.OpenVdbFile.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// PicoGK.PolyContour (class)
public class PolyContour

  // PicoGK.PolyContour.EWinding (enum)
  public enum EWinding

    // PicoGK.PolyContour.EWinding.UNKNOWN (enumMember)
    UNKNOWN

    // PicoGK.PolyContour.EWinding.CLOCKWISE (enumMember)
    CLOCKWISE

    // PicoGK.PolyContour.EWinding.COUNTERCLOCKWISE (enumMember)
    COUNTERCLOCKWISE

  // PicoGK.PolyContour.strWindingAsString (method)
  public static string strWindingAsString(EWinding eWinding)

  // PicoGK.PolyContour.eDetectWinding (method)
  public static EWinding eDetectWinding(List<Vector2> oVertices)

  // PicoGK.PolyContour.PolyContour (constructor)
  public PolyContour(IEnumerable<Vector2> oVertices, EWinding eWinding = EWinding.UNKNOWN)

  // PicoGK.PolyContour.AddVertex (method)
  public void AddVertex(Vector2 vec)

  // PicoGK.PolyContour.DetectWinding (method)
  public void DetectWinding()

  // PicoGK.PolyContour.eWinding (method)
  public EWinding eWinding()

  // PicoGK.PolyContour.oVertices (method)
  public List<Vector2> oVertices()

  // Makes sure that the last coordinate is identical to the first coordinate, to close the loop
  // PicoGK.PolyContour.Close (method)
  public void Close()

  // PicoGK.PolyContour.AsSvgPolyline (method)
  public void AsSvgPolyline(out string str)

  // PicoGK.PolyContour.AsSvgPath (method)
  public void AsSvgPath(out string str)

  // PicoGK.PolyContour.oBBox (method)
  public BBox2 oBBox()

  // PicoGK.PolyContour.nCount (method)
  public int nCount()

  // PicoGK.PolyContour.vecVertex (method)
  public Vector2 vecVertex(int n)

// Category: CAD authoring
// A colored 3D polyline for use in the viewer
// PicoGK.PolyLine (class)
public partial class PolyLine : IDisposable

  // Creates a new empty PolyLine, using the global library instance
  // PicoGK.PolyLine.PolyLine (constructor)
  public PolyLine(ColorFloat clr)
  public PolyLine(Library libSet, ColorFloat clr)

  // Add a vertex to the polyline
  // PicoGK.PolyLine.nAddVertex (method)
  public int nAddVertex(in Vector3 vec)
  //   vec: The specified vertex

  // Adds all vertices from a container
  // PicoGK.PolyLine.Add (method)
  public void Add(IEnumerable<Vector3> avec)
  //   avec: Container containing vertices

  // Return number of vertices in the PolyLine
  // PicoGK.PolyLine.nVertexCount (method)
  public int nVertexCount()

  // Get the vertex in the polyline at the specified vertex index
  // PicoGK.PolyLine.vecVertexAt (method)
  public Vector3 vecVertexAt(int nIndex)
  //   nIndex: Vertex index to retrieve

  // Return the color of the PolyLine
  // PicoGK.PolyLine.GetColor (method)
  public void GetColor(out ColorFloat clr)
  //   clr: PolyLine color

  // Return BoundingBox of PolyLine
  // PicoGK.PolyLine.oBoundingBox (method)
  public BBox3 oBoundingBox()

  // Adds an arrow to the tip of the current polyline The arrow points in the direction of the last polyline segment, unless you explicitly set a direction If you do not supply a direction, and there are less than two vertices in the polyline segment, the arrow points in Z+ The polyline ends in the tip of the arrow, so you can cascade multiple arrows
  // PicoGK.PolyLine.AddArrow (method)
  public void AddArrow(float fSizeMM = 1.0f, Vector3? _vecDir = null)
  //   fSizeMM: Optional size of the base of the arrow, and the distance from the tip
  //   _vecDir: Optional direction of the arrow

  // Add a cross at the end of a polyline
  // PicoGK.PolyLine.AddCross (method)
  public void AddCross(float fSizeMM = 1.0f)
  //   fSizeMM: Size of the cross

  // PicoGK.PolyLine.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// PicoGK.PolySlice (class)
public class PolySlice

  // PicoGK.PolySlice.PolySlice (constructor)
  public PolySlice(float fZPos)

  // PicoGK.PolySlice.AddContour (method)
  public void AddContour(PolyContour oPoly)

  // PicoGK.PolySlice.bIsEmpty (method)
  public bool bIsEmpty()

  // PicoGK.PolySlice.Close (method)
  public void Close()

  // PicoGK.PolySlice.SaveToSvgFile (method)
  public void SaveToSvgFile(string strPath, bool bSolid, BBox2? oBBoxToUse = null)

  // PicoGK.PolySlice.oFromSdf (method)
  public static PolySlice oFromSdf(Image img, float fZPos, Vector2 vecOffset, float fScale)

  // PicoGK.PolySlice.fZPos (method)
  public float fZPos()

  // PicoGK.PolySlice.oBBox (method)
  public BBox2 oBBox()

  // PicoGK.PolySlice.nContours (method)
  public int nContours()

  // PicoGK.PolySlice.oContourAt (method)
  public PolyContour oContourAt(int i)

// Category: CAD authoring
// PicoGK.PolySliceStack (class)
public class PolySliceStack

  // PicoGK.PolySliceStack.PolySliceStack (constructor)
  public PolySliceStack()
  public PolySliceStack(List<PolySlice> oSlices)

  // PicoGK.PolySliceStack.AddSlices (method)
  public void AddSlices(List<PolySlice> oSlices)

  // PicoGK.PolySliceStack.AddToViewer (method)
  public void AddToViewer(Library lib, Viewer oViewer, ColorFloat? clrOutside = null, ColorFloat? clrInside = null, ColorFloat? clrDegenerate = null, int nGroup = 0)

  // PicoGK.PolySliceStack.nCount (method)
  public int nCount()

  // PicoGK.PolySliceStack.oSliceAt (method)
  public PolySlice oSliceAt(int n)

  // PicoGK.PolySliceStack.oBBox (method)
  public BBox3 oBBox()

// Category: CAD authoring
// A progress counting class for counting up items to 100%
// PicoGK.ProgressCounter (class)
public class ProgressCounter

  // Create a new progress counter object
  // PicoGK.ProgressCounter.ProgressCounter (constructor)
  public ProgressCounter(IProgress xProgress, int nItemCount)
  //   xProgress: Progress reporting interface to use
  //   nItemCount: Number of items representing 100%

  // Set the item (nItemCount == 100%)
  // PicoGK.ProgressCounter.SetItem (method)
  public void SetItem(int nItem)

  // Allow you to use ++ to count up to the next item
  // PicoGK.ProgressCounter.op_Increment (method)
  public static ProgressCounter operator ++(ProgressCounter pc)

// Category: CAD authoring
// A progress reporting class that does nothing (can be used as default)
// PicoGK.ProgressNoop (class)
public class ProgressNoop : IProgress

  // Progress from 0..1
  // PicoGK.ProgressNoop.Progress (method)
  public void Progress(float f)

  // PicoGK.ProgressNoop.ProgressNoop (constructor)
  public ProgressNoop()

// Category: CAD authoring
// PicoGK.SKHelpers (class)
public static class SKHelpers

  // PicoGK.SKHelpers.oAsSkColor (method)
  public static SKColor oAsSkColor(this ColorRgba32 clr)
  public static SKColor oAsSkColor(this ColorFloat clr)

  // PicoGK.SKHelpers.clrAsColorRgba32 (method)
  public static ColorRgba32 clrAsColorRgba32(this SKColor clr)

// Category: CAD authoring
// A field of scalar floating point values
// PicoGK.ScalarField (class)
public partial class ScalarField : IFieldWithMetadata, IImplicit, IDisposable

  // Field metadata
  // PicoGK.ScalarField.m_oMetadata (field)
  public FieldMetadata m_oMetadata;

  // Return metadata borrowed from this field owner
  // Remarks: The field disposes its metadata. Keep the metadata within the field lifetime and leave its disposal to that field.
  // PicoGK.ScalarField.oMetaData (method)
  public FieldMetadata oMetaData()

  // Create an empty scalar field object
  // PicoGK.ScalarField.ScalarField (constructor)
  public ScalarField()
  public ScalarField(Library libSet)
  public ScalarField(in ScalarField oSource)
  public ScalarField(Voxels vox)
  public ScalarField(Voxels vox, float fValue, float fSdThreshold = 0.5f)

  // Sets the value at the specified position in mm When you set a value, the position gets "activated" When no value is set, the position doesn't contain a value, and bGetValue returns false
  // PicoGK.ScalarField.SetValue (method)
  public void SetValue(Vector3 vecPosition, float fValue)
  //   vecPosition: Position in mm
  //   fValue: Value

  // Get the value at the specified position If the specified position doesn't contain a value the function returns false
  // PicoGK.ScalarField.bGetValue (method)
  public bool bGetValue(Vector3 vecPosition, out float fValue)
  //   vecPosition: Position in mm
  //   fValue: Value at position

  // Removes the value at the specified position
  // PicoGK.ScalarField.RemoveValue (method)
  public void RemoveValue(Vector3 vecPosition)
  //   vecPosition: Position of the value in space

  // Returns the dimensions of the field in discrete voxels
  // PicoGK.ScalarField.GetVoxelDimensions (method)
  public void GetVoxelDimensions(out int nXOrigin, out int nYOrigin, out int nZOrigin, out int nXSize, out int nYSize, out int nZSize)
  public void GetVoxelDimensions(out int nXSize, out int nYSize, out int nZSize)
  //   nXOrigin: X origin of the field in voxels
  //   nYOrigin: Y origin of the field in voxels
  //   nZOrigin: Z origin of the field in voxels
  //   nXSize: Size in x direction in voxels
  //   nYSize: Size in y direction in voxels
  //   nZSize: Size in z direction in voxels

  // Returns a signed distance-field-encoded slice of the voxel field Reuses the supplied image when its dimensions match the observed field
  // PicoGK.ScalarField.GetVoxelSlice (method)
  public void GetVoxelSlice(in int nZSlice, ref ImageGrayScale img)
  //   nZSlice: Slice to retrieve
  //   img: Reusable grayscale image

  // Visit each active value in the vector field and call the InformActiveValue methot of the ITraverseScalarField interface
  // PicoGK.ScalarField.TraverseActive (method)
  public void TraverseActive(ITraverseScalarField xTraverse)
  //   xTraverse: The interface containing the callback

  // Return the scalar value at the specified position as as signed distance value
  // PicoGK.ScalarField.fSignedDistance (method)
  public float fSignedDistance(in Vector3 vecPosition)
  //   vecPosition: Position to sample

  // Returns the bounding box of all active voxels in mm coordinates
  // PicoGK.ScalarField.oBoundingBox (method)
  public BBox3 oBoundingBox()

  // PicoGK.ScalarField.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// PicoGK.SdfVisualizer (class)
public class SdfVisualizer

  // Create a color image which encodes the signed distance values contained in the ScalarField
  // PicoGK.SdfVisualizer.imgEncodeFromSdf (method)
  public static ImageColor imgEncodeFromSdf(ScalarField oField, float fBackgroundValue, int nSlice, ColorFloat? _clrBackground = null, ColorFloat? _clrSurface = null, ColorFloat? _clrInside = null, ColorFloat? _clrOutside = null, ColorFloat? _clrDefect = null)
  //   oField: Scalar field to visualize
  //   fBackgroundValue: Background value, usually 3.0f
  //   nSlice: Slice to visualize
  //   _clrBackground: Color used for background value voxels
  //   _clrSurface: Color used for surface value voxels
  //   _clrInside: Color used for the voxels on the inside
  //   _clrOutside: Color used for the voxels on the outside
  //   _clrDefect: Color used for defective voxels

  // Checks if the scalar field slice contains a defective voxel
  // PicoGK.SdfVisualizer.bDoesSliceContainDefect (method)
  public static bool bDoesSliceContainDefect(ScalarField oField, int nSlice)
  //   oField: Field to analyze
  //   nSlice: Slice to analyze

  // Saves a stack of TGA files, visualizing the signed distance field contained in the ScalarField
  // PicoGK.SdfVisualizer.bVisualizeSdfSlicesAsTgaStack (method)
  public static bool bVisualizeSdfSlicesAsTgaStack(ScalarField oField, float fBackgroundValue, string strPath, string strFilePrefix = "Sdf_", bool bOnlyDefective = false, ColorFloat? _clrBackground = null, ColorFloat? _clrSurface = null, ColorFloat? _clrInside = null, ColorFloat? _clrOutside = null, ColorFloat? _clrDefect = null)
  //   oField: Scalar SDF to visualize (you can build one from if a Voxels object if needed
  //   fBackgroundValue: Background value (usually 3.0f)
  //   strPath: Path to write the image stack to
  //   strFilePrefix: File prefix to use, before slice number is appended
  //   bOnlyDefective: Write only frames that contain defective values (such as NaN, Infinity)
  //   _clrBackground: Color used for background value voxels
  //   _clrSurface: Color used for surface value voxels
  //   _clrInside: Color used for the voxels on the inside
  //   _clrOutside: Color used for the voxels on the outside
  //   _clrDefect: Color used for defective voxels

  // PicoGK.SdfVisualizer.SdfVisualizer (constructor)
  public SdfVisualizer()

// Category: CAD authoring
// PicoGK.SliceViz (class)
public class SliceViz : IDisposable

  // The number of slices in this voxel field
  // PicoGK.SliceViz.nSliceCount (property)
  public int nSliceCount { get; }

  // PicoGK.SliceViz.SliceViz (constructor)
  public SliceViz(Viewer oViewer, Voxels vox, Voxels.ESliceAxis eAxis = Voxels.ESliceAxis.Z)

  // Visualize the slice in the viewer using a normalized parameter from 0..1
  // PicoGK.SliceViz.Visualize (method)
  public void Visualize(float fNormalized)
  public void Visualize(int nSlice)

  // Dispose the object (IDispose)
  // PicoGK.SliceViz.Dispose (method)
  public void Dispose()

// Category: CAD authoring
// This class allows you to split progress reporting into multiple subtasks
// PicoGK.SplitProgress (class)
public class SplitProgress : IProgress

  // Create a new SplitProgress object
  // PicoGK.SplitProgress.SplitProgress (constructor)
  public SplitProgress(IProgress xProgress, int nSubTasks)
  //   xProgress: Progress reporting interface to use
  //   nSubTasks: Number of subtasks, each with their independet 0..1 progress

  // Report progress from 0..1 - this function automatically scales the value to reflect the current subtask
  // PicoGK.SplitProgress.Progress (method)
  public void Progress(float f)

  // Allow you to use ++ to count up to the next subtask
  // PicoGK.SplitProgress.op_Increment (method)
  public static SplitProgress operator ++(SplitProgress pc)

// Category: CAD authoring
// PicoGK.SurfaceNormalFieldExtractor (class)
public class SurfaceNormalFieldExtractor : ITraverseScalarField

  // PicoGK.SurfaceNormalFieldExtractor.oExtract (method)
  public static VectorField oExtract(Voxels vox, float fSurfaceThresholdVx = 0.5f, Vector3? vecDirectionFilter = null, float fDirectionFilterTolerance = 0f, Vector3? vecScaleBy = null)

  // PicoGK.SurfaceNormalFieldExtractor.InformActiveValue (method)
  public void InformActiveValue(in Vector3 vecPosition, float fValue)

// Category: CAD authoring
// PicoGK.Text (class)
public class Text

  // PicoGK.Text.oDefaultTypeface (property)
  static public SKTypeface oDefaultTypeface { get; }

  // PicoGK.Text.imgRenderText (method)
  static public ImageRgba32 imgRenderText(string strText, int nFontHeight, int nPadding = 10, ColorFloat? _clrBackground = null, ColorFloat? _clrText = null, SKTypeface? _oTypeface = null)

  // PicoGK.Text.Text (constructor)
  public Text()

// Category: CAD authoring
// PicoGK.TgaIo (class)
public class TgaIo

  // PicoGK.TgaIo.SaveTga (method)
  public static void SaveTga(string strFilename, in Image img)
  public static void SaveTga(in BinaryWriter oWriter, in Image img)

  // PicoGK.TgaIo.GetFileInfo (method)
  public static void GetFileInfo(string strFilename, out Image.EType eType, out int nWidth, out int nHeight)
  public static void GetFileInfo(in BinaryReader oReader, out Image.EType eType, out int nWidth, out int nHeight)

  // PicoGK.TgaIo.LoadTga (method)
  public static void LoadTga(string strFilename, out Image img)
  public static void LoadTga(in BinaryReader oReader, out Image img)

  // PicoGK.TgaIo.TgaIo (constructor)
  public TgaIo()

// Category: CAD authoring
// PicoGK.Utils (class)
public partial class Utils

  // Creates a temporary folder with an arbitrary filename in the system's default temp directory, which is guaranteed to be writable (we don't check this, but the system should guarantee it) Use the "using" syntax to automatically cleanup after the object runs out of scope
  // PicoGK.Utils.TempFolder (class)
  public class TempFolder : IDisposable

    // PicoGK.Utils.TempFolder.strFolder (field)
    public string strFolder;

    // PicoGK.Utils.TempFolder.TempFolder (constructor)
    public TempFolder()

    // PicoGK.Utils.TempFolder.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  // Helper function to create simple box mesh from a bounding box
  // PicoGK.Utils.mshCreateCube (method)
  static public Mesh mshCreateCube(BBox3 oBox)
  static public Mesh mshCreateCube(Vector3? vecScale = null, Vector3? vecOffsetMM = null)
  static public Mesh mshCreateCube(Library lib, BBox3 oBox)
  static public Mesh mshCreateCube(Library lib, Vector3? vecScale = null, Vector3? vecOffsetMM = null)

  // Strip quotes of a quoted path like "/usr/lib/" -> /usr/lib/
  // PicoGK.Utils.strStripQuotesFromPath (method)
  static public string strStripQuotesFromPath(string strPath)

  // Strips the extension from a filename
  // PicoGK.Utils.strStripExtension (method)
  static public string strStripExtension(string strPath)

  // Wait for a file's creation
  // PicoGK.Utils.bWaitForFileExistence (method)
  static public bool bWaitForFileExistence(string strFile, float fTimeOut = 1000000f)

  // Returns the path to the home folder (cross platform compatible)
  // Throws: System.Exception: Excepts, if not found
  // PicoGK.Utils.strHomeFolder (method)
  static public string strHomeFolder()

  // Returns the path to the documents folder (cross platform compatible)
  // Throws: System.Exception: Excepts, if unable to find
  // PicoGK.Utils.strDocumentsFolder (method)
  static public string strDocumentsFolder()

  // Returns the path to the source folder of your project, under the assumption that the executable .NET DLL is in its usual place
  // PicoGK.Utils.strProjectRootFolder (method)
  static public string strProjectRootFolder()

  // Returns the path to the source folder of PicoGK, making the following Assumptions
  // PicoGK.Utils.strPicoGKSourceCodeFolder (method)
  static public string strPicoGKSourceCodeFolder()

  // Returns the path in which your current executable resides
  // PicoGK.Utils.strExecutableFolder (method)
  static public string strExecutableFolder()

  // Returns a file name in the form 20230930_134500 to be used in log files etc
  // PicoGK.Utils.strDateTimeFilename (method)
  static public string strDateTimeFilename(in string strPrefix, in string strPostfix)
  //   strPrefix: Prepended before the date/time stamp
  //   strPostfix: Appended after the date/time stamp

  // Shorted a string, IF it is too long
  // PicoGK.Utils.strShorten (method)
  public static string strShorten(string str, int iMaxCharacters)
  //   str: String to shorten (if too long)
  //   iMaxCharacters: Number of max characters in the string

  // PicoGK.Utils.Utils (constructor)
  public Utils()

// Category: CAD authoring
// Helper class to save a voxel field contained in a VDB file to a CLI slice file
// PicoGK.Vdb2Cli (class)
public class Vdb2Cli

  // Convert a voxel field to a CLI slice file
  // Throws: System.Exception: Throws exceptions when file(s) cannot be accessed orcreated, or voxel field cannot be found
  // PicoGK.Vdb2Cli.Convert (method)
  public static void Convert(string strVdbFilePath, float fCliLayerHeight, string strCliFilePath = "", string strVoxelFieldName = "", IProgress? xProgress = null)
  //   strVdbFilePath: Path to the VDB file
  //   fCliLayerHeight: Layer height in millimeters
  //   strCliFilePath: Path to the CLI file
  //   strVoxelFieldName: Name of the voxel field, or the first voxel field in the file
  //   xProgress: Progress reporting interface

  // PicoGK.Vdb2Cli.Vdb2Cli (constructor)
  public Vdb2Cli()

// Category: CAD authoring
// A Field of 3D floating point vectors
// PicoGK.VectorField (class)
public partial class VectorField : IFieldWithMetadata, IDisposable

  // VectorField metadata
  // PicoGK.VectorField.m_oMetadata (field)
  public FieldMetadata m_oMetadata;

  // Return metadata borrowed from this field owner
  // Remarks: The field disposes its metadata. Keep the metadata within the field lifetime and leave its disposal to that field.
  // PicoGK.VectorField.oMetaData (method)
  public FieldMetadata oMetaData()

  // Create an empty VectorField object
  // PicoGK.VectorField.VectorField (constructor)
  public VectorField()
  public VectorField(Library libSet)
  public VectorField(in VectorField oSource)
  public VectorField(Voxels vox)
  public VectorField(Voxels vox, Vector3 vecValue, float fSdThreshold = 0.5f)

  // Sets the value at the specified position in mm When you set a value, the position gets "activated" When no value is set, the position doesn't contain a value, and bGetValue returns false
  // PicoGK.VectorField.SetValue (method)
  public void SetValue(Vector3 vecPosition, Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value

  // Get the value at the specified position If the specified position doesn't contain a value the function returns false
  // PicoGK.VectorField.bGetValue (method)
  public bool bGetValue(Vector3 vecPosition, out Vector3 vecValue)
  //   vecPosition: Position in mm
  //   vecValue: Value at position

  // Removes the value at the specified position
  // PicoGK.VectorField.RemoveValue (method)
  public void RemoveValue(Vector3 vecPosition)
  //   vecPosition: Position of the value in space

  // Visit each active value in the vector field and call the InformActiveValue methot of the ITraverseVectorField interface
  // PicoGK.VectorField.TraverseActive (method)
  public void TraverseActive(ITraverseVectorField xTraverse)
  //   xTraverse: The interface containing the callback

  // PicoGK.VectorField.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// PicoGK.VectorFieldMerge (class)
public class VectorFieldMerge : ITraverseVectorField

  // PicoGK.VectorFieldMerge.Merge (method)
  public static void Merge(VectorField oSource, VectorField oTarget)

  // PicoGK.VectorFieldMerge.InformActiveValue (method)
  public void InformActiveValue(in Vector3 vecPosition, in Vector3 vecValue)
