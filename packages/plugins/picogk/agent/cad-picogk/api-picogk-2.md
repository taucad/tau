# PicoGK — PicoGK (2)

27 top-level symbols. Signatures are verbatim csharp.

// The Library object encapsulates an instance of a PicoGK library configuration
Library

nStringLength: int

// Voxel size in millimeters
fVoxelSize: float

GlobalInstance

    oViewer: Viewer

    oLibrary: Library

    xLog: LogFile

    public GlobalInstance(float fVoxelSizeMM, string strLogPath = "", string strViewerTitle = "PicoGK", string strViewerEnvironment = "")

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

fVoxelSizeMM: float

strLogFolder: string

// Create a new Library instance, using the specified voxel size in MM
public Library(float fVoxelSizeMM)
// fVoxelSizeMM: Voxel size in MM

// Return the total memory usage of all objects created with this Library instance
public long nTotalMemUsage()

// Returns the total memory usage of all Mesh objects created with this Library instance
public long nMeshesMemUsage()

// Returns the total memory usage of all Lattice objects created with this Library instance
public long nLatticesMemUsage()

// Returns the total memory usage of all PolyLine objects created with this Library instance
public long nPolyLinesMemUsage()

// Returns the total memory usage of all Voxels objects created with this Library instance
public long nVoxelsMemUsage()

// Returns the total memory usage of all VdbFile objects created with this Library instance
public long nVdbFilesMemUsage()

// Returns the total memory usage of all ScalarField objects created with this Library instance
public long nScalarFieldsMemUsage()

// Returns the total memory usage of all VectorField objects created with this Library instance
public long nVectorFieldsMemUsage()

// Returns the total memory usage of all VdbFile metadata objects created with this Library instance
public long nVdbMetasMemUsage()

// Returns the number of Mesh objects created with this Library instance
public long nMeshesAllocated()

// Returns the number of Lattice objects created with this Library instance
public long nLatticesAllocated()

// Returns the number of PolyLine objects created with this Library instance
public long nPolyLinesAllocated()

// Returns the number of Voxels objects created with this Library instance
public long nVoxelsAllocated()

// Returns the number of VdbFile objects created with this Library instance
public long nVdbFilesAllocated()

// Returns the number of ScalarField objects created with this Library instance
public long nScalarFieldsAllocated()

// Returns the number of VectorField objects created with this Library instance
public long nVectorFieldsAllocated()

// Returns the number of VdbFile metadata objects created with this Library instance
public long nVdbMetasAllocated()

// Convert voxel index coordinates to world coordinates in millimeters
public Vector3 vecVoxelsToMm(int x, int y, int z)
// x: x coordinate in voxel units
// y: y coordinate in voxel units
// z: z coordinate in voxel units

// Convert world (millimeter) units to voxel units
public void MmToVoxels(Vector3 vecMm, out int x, out int y, out int z)
// vecMm: 3D coordinate in world (millimeter) space
// x: x coordinate in voxel units
// y: y coordinate in voxel units
// z: z coordinate in voxel units

// The Library implements the Dispose pattern, so you can use it with `using`
public void Dispose()
protected virtual void Dispose(bool bDisposing)

public static Library oLibrary()

public static void RegisterGlobalLibrary(Library oLibrary)

public static void UnregisterGlobalLibrary()

public static Viewer oViewer()

public static void RegisterGlobalViewer(Viewer oViewer)

public static void UnregisterGlobalViewer()

public static ILog xLog()

public static void RegisterGlobalLog(ILog xLog)

public static void UnregisterGlobalLog()

// This is the one library function that you call to run your code it sets up the PicoGK library, with the specified voxel size and builds the PicoGK environment with viewer, log and other internals The fnTask you pass is called after everything is set up correctly inside of fnTask, you do your processing, displaying it in Library::oTheViewer and logging info with Library::Log()
public static void Go(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath = "", bool bEndAppWithTask = false, string strWindowTitle = "PicoGK", string strLightsFile = "")
// fVoxelSizeMM: Voxel size in millimeters
// fnTask: The task to execute
// strLogFilePath: Filename of the logfile
// bEndAppWithTask: If true, the viewer exits when your task is done
// strWindowTitle: The title of your viewer window
// strLightsFile: A specific lighting environment to load

public static void Log(string strFormat, params object[] args)

// Checks whether the task started using Go() should continue, and returns true if that's the case or false otherwise
public static bool bContinueTask(bool bAppExitOnly = false)
// bAppExitOnly: If true, the bContinueTask function will only take into consideration if the application is about to exit

// Requests the task started by the Go() function to end
public static void EndTask()

// Cancels any pending request to end the task
public static void CancelEndTaskRequest()

public static string strFindLightSetupFile(out string strSearched)

// Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding application
public static IDisposable UseHost(ILibraryHost xHost)

// Returns the library name (from the C++ side)
public static string strName()

// Returns the library version (from the C++ side)
public static string strVersion()

// Returns internal build info, such as build date/time of the C++ library
public static string strBuildInfo()

// A simple logging class which outputs to the console
LogConsole

// Implementation of a simple logging class that outputs to the console
public void Log(in string strFormat, params object[] args)

LogFile

public LogFile(in string strFileName = "", in bool bOutputToConsole = true)

public void Log(in string strFormat, params object[] args)

public void LogTime()

public void Dispose()
protected virtual void Dispose(bool bDisposing)

// A progress reporting class that outputs to a log interface
LogProgress

// Initialize a new progress reporting object
public LogProgress(ILog xLog, string strInfo = "Progress", float fIntervalSeconds = 1)
// xLog: Log interface to output to
// strInfo: Identifying string
// fIntervalSeconds: Minimum interval to leave between reporting entries

// Report progress from 0..1
public void Progress(float f)

// Cleanup (just reports that the task is finished)
public void Dispose()

// A triangle mesh
Mesh

EStlUnit

    AUTO: AUTO

    MM: MM

    CM: CM

    M: M

    FT: FT

    IN: IN

m_strLoadHeaderData: string

m_eLoadUnits: Mesh.EStlUnit

lib: Library

// Creates a new empty Mesh, using the global library instance
public Mesh()
public Mesh(Library libSet)
public Mesh(in Voxels vox)

// Create a transformed mesh by offsetting and scaling it
public Mesh mshCreateTransformed(Vector3 vecScale, Vector3 vecOffset)
public Mesh mshCreateTransformed(Matrix4x4 matTrans)
// vecScale: Scale the mesh (first step)
// vecOffset: Offset the mesh (second step)

// Mirrors a mesh at the specified plane
public Mesh mshCreateMirrored(Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
// vecPlanePoint: A point through which the mirror plane passes
// vecPlaneNormal: The normal vector of the mirror plane

// Add a new vertex to the mesh so that it can be used in mesh triangles
public int nAddVertex(in Vector3 vec)
// vec: The vertex to add

public void AddVertices(in IEnumerable<Vector3> avecVertices, out int[] anVertexIndex)

// Get the vertex at the specified index
public Vector3 vecVertexAt(int nVertex)
// nVertex: The vertex index

// Get the number of vertices in the mesh
public int nVertexCount()

// Add a triangle to the mesh with the specified vertex indices
public int nAddTriangle(in Triangle t)
public int nAddTriangle(int A, int B, int C)
public int nAddTriangle(in Vector3 vecA, in Vector3 vecB, in Vector3 vecC)
// t: Triangle with the vertex indices set to existing vertices

// Return number of triangles in the mesh
public int nTriangleCount()

// Adds a quad, defined by four corner vertices Helper function, which calls nAddTriangle in the background
public void AddQuad(int n0, int n1, int n2, int n3, bool bFlipped = false)
public void AddQuad(in Vector3 vec0, in Vector3 vec1, in Vector3 vec2, in Vector3 vec3, bool bFlipped = false)

// Get the triangle with the specified index
public Triangle oTriangleAt(int nTriangle)
// nTriangle: Triangle index in the mesh

// Get the triangle with the specified index
public void GetTriangle(int nTriangle, out Vector3 vecA, out Vector3 vecB, out Vector3 vecC)
// nTriangle: Triangle index in the mesh
// vecA: First vertex in the triangle
// vecB: Second vertex in the triangle
// vecC: Third vertex in the triangle

// Append one mesh to another Note, no deduplication is done and no "boolean" The source mesh remains unchanged
public void Append(Mesh msh)

// Return the BoundingBox of the Mesh
public BBox3 oBoundingBox()

// Loads a mesh from an STL file By default, it tries to find a UNITS= info in the header and uses that to scale the mesh automatically to mm
public static Mesh mshFromStlFile(string strFilePath, Mesh.EStlUnit eLoadUnit = AUTO, float fPostScale = 1, Vector3? vecPostOffsetMM = null, Library? libSet = null)
public static Mesh mshFromStlFile(FileStream oFile, Mesh.EStlUnit eLoadUnit = AUTO, float fPostScale = 1, Vector3? vecPostOffsetMM = null, Library? lib = null)
// strFilePath: Path to the file
// eLoadUnit: Units to load
// fPostScale: Scale parameter to be applied before offset
// vecPostOffsetMM: Offset parameter to be applied last
// libSet: Library instance to use

// Saves a Mesh to STL file If eUnit is auto, then, if this mesh was loaded from an STL before the same units as before are being used (stored in public property m_eLoadUnits)
public void SaveToStlFile(string strFilePath, Mesh.EStlUnit eUnit = AUTO, Vector3? vecOffsetMM = null, float fScale = 1)
public void SaveToStlFile(FileStream oFile, Mesh.EStlUnit eUnit = AUTO, Vector3? vecOffsetMM = null, float fScale = 1)
// strFilePath: File path
// eUnit: If loaded previously, defaults to original units
// vecOffsetMM: Offset applied while still in mm units
// fScale: Scale applied after offset, while still in mm units

public void Dispose()
protected virtual void Dispose(bool bDisposing)

public bool bFindTriangleFromSurfacePoint(Vector3 vecSurfacePoint, out int nTriangle)

public static bool bPointLiesOnTriangle(Vector3 vecP, Vector3 vecA, Vector3 vecB, Vector3 vecC)

MshHandle

Value: long

public MshHandle(long Value)

// OpenVdbFile handles the creation, loading and saving of openvdb .VDB files
OpenVdbFile

// Types of fields in .VDB files
EFieldType

    // Unsupported data type (for example FOG)
    Unsupported: Unsupported

    // PicoGK.Voxels field
    Voxels: Voxels

    // PicoGK.ScalarField type
    ScalarField: ScalarField

    // PicoGK.ScalerField type
    VectorField: VectorField

lib: Library

// Create an empty openvdb file object
public OpenVdbFile()
public OpenVdbFile(string strFileName)
public OpenVdbFile(Library libSet)
public OpenVdbFile(Library libSet, string strFileName)

// Create a PicoGK library object that is compatible with the specified OpenVDB file, i.e
public static Library libCreateCompatibleLibraryFor(string strVdbFilePath)

// Saves the current object with all of its attached fields to a .VDB container
public void SaveToFile(string strFileName)
// strFileName: Path and filename to save to

// Get the Voxels at the index specified
public Voxels voxGet(int nIndex)
public Voxels voxGet(string strName)
// nIndex: Index of the field

// Adds a copy of the specified Voxels to the VdbFile object
public int nAdd(Voxels vox, string strFieldName = "")
public int nAdd(ScalarField oField, string strFieldName = "")
public int nAdd(VectorField oField, string strFieldName = "")
// vox: Voxels to add
// strFieldName: Field name (if not specified, autogenerates a unique one

// Get the ScalarField at the index specified
public ScalarField oGetScalarField(int nIndex)
public ScalarField oGetScalarField(string strName)
// nIndex: Index of the field

// Get the VectorField at the index specified
public VectorField oGetVectorField(int nIndex)
public VectorField oGetVectorField(string strName)
// nIndex: Index of the field

// Number of fields stored in the VdbFile container
public int nFieldCount()

// Returns the name of the field (if specified) at the given field index
public string strFieldName(int nIndex)
// nIndex: Index of the field

// Returns the type of the field at the given field index
public OpenVdbFile.EFieldType eFieldType(int nIndex)
// nIndex: Index of the field

// Returns the field type at the given index as string
public string strFieldType(int nIndex)
// nIndex: Index of the field

public IFieldWithMetadata xField(int nIndex)

public bool bIsPicoGKCompatible()

public float fPicoGKVoxelSizeMM()

public static extern VdbHandle \_hCreate(LibHandle hLib)

public void Dispose()
protected virtual void Dispose(bool bDisposing)

PicoGKAllocException

public PicoGKAllocException()
public PicoGKAllocException(string? message)

PicoGKLibraryMismatchException

public PicoGKLibraryMismatchException()
public PicoGKLibraryMismatchException(string? message)

PolyContour

EWinding

    UNKNOWN: UNKNOWN

    CLOCKWISE: CLOCKWISE

    COUNTERCLOCKWISE: COUNTERCLOCKWISE

public static string strWindingAsString(PolyContour.EWinding eWinding)

public static PolyContour.EWinding eDetectWinding(List<Vector2> oVertices)

public PolyContour(IEnumerable<Vector2> oVertices, PolyContour.EWinding eWinding = UNKNOWN)

public void AddVertex(Vector2 vec)

public void DetectWinding()

public PolyContour.EWinding eWinding()

public List<Vector2> oVertices()

// Makes sure that the last coordinate is identical to the first coordinate, to close the loop
public void Close()

public void AsSvgPolyline(out string str)

public void AsSvgPath(out string str)

public BBox2 oBBox()

public int nCount()

public Vector2 vecVertex(int n)

PolyHandle

Value: long

public PolyHandle(long Value)

// A colored 3D polyline for use in the viewer
PolyLine

lib: Library

// Creates a new empty PolyLine, using the global library instance
public PolyLine(ColorFloat clr)
public PolyLine(Library libSet, ColorFloat clr)

// Add a vertex to the polyline
public int nAddVertex(in Vector3 vec)
// vec: The specified vertex

// Adds all vertices from a container
public void Add(IEnumerable<Vector3> avec)
// avec: Container containing vertices

// Return number of vertices in the PolyLine
public int nVertexCount()

// Get the vertex in the polyline at the specified vertex index
public Vector3 vecVertexAt(int nIndex)
// nIndex: Vertex index to retrieve

// Return the color of the PolyLine
public void GetColor(out ColorFloat clr)
// clr: PolyLine color

// Return BoundingBox of PolyLine
public BBox3 oBoundingBox()

// Adds an arrow to the tip of the current polyline The arrow points in the direction of the last polyline segment, unless you explicitly set a direction If you do not supply a direction, and there are less than two vertices in the polyline segment, the arrow points in Z+ The polyline ends in the tip of the arrow, so you can cascade multiple arrows
public void AddArrow(float fSizeMM = 1, Vector3? \_vecDir = null)
// fSizeMM: Optional size of the base of the arrow, and the distance from the tip
// \_vecDir: Optional direction of the arrow

// Add a cross at the end of a polyline
public void AddCross(float fSizeMM = 1)
// fSizeMM: Size of the cross

public static extern PolyHandle \_hCreate(LibHandle hLib, in ColorFloat clr)

public void Dispose()
protected virtual void Dispose(bool bDisposing)

PolySlice

public PolySlice(float fZPos)

public void AddContour(PolyContour oPoly)

public bool bIsEmpty()

public void Close()

public void SaveToSvgFile(string strPath, bool bSolid, BBox2? oBBoxToUse = null)

public static PolySlice oFromSdf(Image img, float fZPos, Vector2 vecOffset, float fScale)

public float fZPos()

public BBox2 oBBox()

public int nContours()

public PolyContour oContourAt(int i)

PolySliceStack

public PolySliceStack()
public PolySliceStack(List<PolySlice> oSlices)

public void AddSlices(List<PolySlice> oSlices)

public void AddToViewer(Library lib, Viewer oViewer, ColorFloat? clrOutside = null, ColorFloat? clrInside = null, ColorFloat? clrDegenerate = null, int nGroup = 0)

public int nCount()

public PolySlice oSliceAt(int n)

public BBox3 oBBox()

// A progress counting class for counting up items to 100%
ProgressCounter

// Create a new progress counter object
public ProgressCounter(IProgress xProgress, int nItemCount)
// xProgress: Progress reporting interface to use
// nItemCount: Number of items representing 100%

// Set the item (nItemCount == 100%)
public void SetItem(int nItem)

// Allow you to use ++ to count up to the next item
public static ProgressCounter operator ++(ProgressCounter pc)

// A progress reporting class that does nothing (can be used as default)
ProgressNoop

// Progress from 0..1
public void Progress(float f)

QuadHandle

Value: nint

public QuadHandle(nint Value)

SKHelpers

public static SKColor oAsSkColor(ColorRgba32 clr)
public static SKColor oAsSkColor(ColorFloat clr)

public static ColorRgba32 clrAsColorRgba32(SKColor clr)

// A field of scalar floating point values
ScalarField

// Field metadata
m_oMetadata: FieldMetadata

lib: Library

public FieldMetadata oMetaData()

// Create an empty scalar field object
public ScalarField()
public ScalarField(Library libSet)
public ScalarField(in ScalarField oSource)
public ScalarField(Voxels vox)
public ScalarField(Voxels vox, float fValue, float fSdThreshold = 0.5)

// Sets the value at the specified position in mm When you set a value, the position gets "activated" When no value is set, the position doesn't contain a value, and bGetValue returns false
public void SetValue(Vector3 vecPosition, float fValue)
// vecPosition: Position in mm
// fValue: Value

// Get the value at the specified position If the specified position doesn't contain a value the function returns false
public bool bGetValue(Vector3 vecPosition, out float fValue)
// vecPosition: Position in mm
// fValue: Value at position

// Removes the value at the specified position
public void RemoveValue(Vector3 vecPosition)
// vecPosition: Position of the value in space

// Returns the dimensions of the field in discrete voxels
public void GetVoxelDimensions(out int nXOrigin, out int nYOrigin, out int nZOrigin, out int nXSize, out int nYSize, out int nZSize)
public void GetVoxelDimensions(out int nXSize, out int nYSize, out int nZSize)
// nXOrigin: X origin of the field in voxels
// nYOrigin: Y origin of the field in voxels
// nZOrigin: Z origin of the field in voxels
// nXSize: Size in x direction in voxels
// nYSize: Size in y direction in voxels
// nZSize: Size in z direction in voxels

// Returns a signed distance-field-encoded slice of the voxel field To use it, use GetVoxelDimensions to find out the size of the voxel field in voxel units
public void GetVoxelSlice(in int nZSlice, ref ImageGrayScale img)
// nZSlice: Slice to retrieve
// img: Pre-allocated grayscale image to receive the values

// Visit each active value in the vector field and call the InformActiveValue methot of the ITraverseScalarField interface
public void TraverseActive(ITraverseScalarField xTraverse)
// xTraverse: The interface containing the callback

// Return the scalar value at the specified position as as signed distance value
public float fSignedDistance(in Vector3 vecPosition)
// vecPosition: Position to sample

// Returns the bounding box of all active voxels in mm coordinates
public BBox3 oBoundingBox()

public static extern ScalarFieldHandle \_hCreate(LibHandle hLib)

public static extern ScalarFieldHandle \_hCreateCopy(LibHandle hLib, ScalarFieldHandle hSource)

public static extern ScalarFieldHandle \_hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

public static extern ScalarFieldHandle \_hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, float fScalarValue, float fSdThreshold)

public void Dispose()
protected virtual void Dispose(bool bDisposing)

ScalarFieldHandle

Value: nint

public ScalarFieldHandle(nint Value)

SdfVisualizer

// Create a color image which encodes the signed distance values contained in the ScalarField
public static ImageColor imgEncodeFromSdf(ScalarField oField, float fBackgroundValue, int nSlice, ColorFloat? \_clrBackground = null, ColorFloat? \_clrSurface = null, ColorFloat? \_clrInside = null, ColorFloat? \_clrOutside = null, ColorFloat? \_clrDefect = null)
// oField: Scalar field to visualize
// fBackgroundValue: Background value, usually 3.0f
// nSlice: Slice to visualize
// \_clrBackground: Color used for background value voxels
// \_clrSurface: Color used for surface value voxels
// \_clrInside: Color used for the voxels on the inside
// \_clrOutside: Color used for the voxels on the outside
// \_clrDefect: Color used for defective voxels

// Checks if the scalar field slice contains a defective voxel
public static bool bDoesSliceContainDefect(ScalarField oField, int nSlice)
// oField: Field to analyze
// nSlice: Slice to analyze

// Saves a stack of TGA files, visualizing the signed distance field contained in the ScalarField
public static bool bVisualizeSdfSlicesAsTgaStack(ScalarField oField, float fBackgroundValue, string strPath, string strFilePrefix = "Sdf\_", bool bOnlyDefective = false, ColorFloat? \_clrBackground = null, ColorFloat? \_clrSurface = null, ColorFloat? \_clrInside = null, ColorFloat? \_clrOutside = null, ColorFloat? \_clrDefect = null)
// oField: Scalar SDF to visualize (you can build one from if a Voxels object if needed
// fBackgroundValue: Background value (usually 3.0f)
// strPath: Path to write the image stack to
// strFilePrefix: File prefix to use, before slice number is appended
// bOnlyDefective: Write only frames that contain defective values (such as NaN, Infinity)
// \_clrBackground: Color used for background value voxels
// \_clrSurface: Color used for surface value voxels
// \_clrInside: Color used for the voxels on the inside
// \_clrOutside: Color used for the voxels on the outside
// \_clrDefect: Color used for defective voxels

SliceViz

// The number of slices in this voxel field
nSliceCount: int

public SliceViz(Viewer oViewer, Voxels vox, Voxels.ESliceAxis eAxis = Z)

// Visualize the slice in the viewer using a normalized parameter from 0..1
public void Visualize(float fNormalized)
public void Visualize(int nSlice)

// Dispose the object (IDispose)
public void Dispose()

// This class allows you to split progress reporting into multiple subtasks
SplitProgress

// Create a new SplitProgress object
public SplitProgress(IProgress xProgress, int nSubTasks)
// xProgress: Progress reporting interface to use
// nSubTasks: Number of subtasks, each with their independet 0..1 progress

// Report progress from 0..1 - this function automatically scales the value to reflect the current subtask
public void Progress(float f)

// Allow you to use ++ to count up to the next subtask
public static SplitProgress operator ++(SplitProgress pc)

SurfaceNormalFieldExtractor

public static VectorField oExtract(Voxels vox, float fSurfaceThresholdVx = 0.5, Vector3? vecDirectionFilter = null, float fDirectionFilterTolerance = 0, Vector3? vecScaleBy = null)

protected SurfaceNormalFieldExtractor(Voxels voxSource, VectorField oDestination, float fSurfaceThresholdVx, Vector3 vecDirFilter, float fDirTolerance, Vector3 vecScaleBy)

protected void Run()

public void InformActiveValue(in Vector3 vecPosition, float fValue)

Text

oDefaultTypeface: SKTypeface

public static ImageRgba32 imgRenderText(string strText, int nFontHeight, int nPadding = 10, ColorFloat? \_clrBackground = null, ColorFloat? \_clrText = null, SKTypeface? \_oTypeface = null)

TgaIo

public static void SaveTga(string strFilename, in Image img)
public static void SaveTga(in BinaryWriter oWriter, in Image img)

public static void GetFileInfo(string strFilename, out Image.EType eType, out int nWidth, out int nHeight)
public static void GetFileInfo(in BinaryReader oReader, out Image.EType eType, out int nWidth, out int nHeight)

public static void LoadTga(string strFilename, out Image img)
public static void LoadTga(in BinaryReader oReader, out Image img)

Triangle

A: int

B: int

C: int

public Triangle(int a, int b, int c)
