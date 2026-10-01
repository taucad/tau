# PicoGK — PicoGK (2)

37 top-level symbols. Signatures are verbatim csharp.

// The Library object encapsulates an instance of a PicoGK library configuration
Library

  nStringLength: int

  // Voxel size in millimeters
  fVoxelSize: float

  GlobalInstance

    oViewer: Viewer

    oLibrary: Library

    xLog: LogFile

    // PicoGK.Library.GlobalInstance.GlobalInstance (constructor)
    public GlobalInstance(float fVoxelSizeMM, string strLogPath = "", string strViewerTitle = "PicoGK", string strViewerEnvironment = "")

    // PicoGK.Library.GlobalInstance.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  fVoxelSizeMM: float

  strLogFolder: string

  // Create a new Library instance, using the specified voxel size in MM
  // PicoGK.Library.Library (constructor)
  public Library(float fVoxelSizeMM)
  //   fVoxelSizeMM: Voxel size in MM

  // Return the total memory usage of all objects created with this Library instance
  // PicoGK.Library.nTotalMemUsage (method)
  public long nTotalMemUsage()

  // Returns the total memory usage of all Mesh objects created with this Library instance
  // PicoGK.Library.nMeshesMemUsage (method)
  public long nMeshesMemUsage()

  // Returns the total memory usage of all Lattice objects created with this Library instance
  // PicoGK.Library.nLatticesMemUsage (method)
  public long nLatticesMemUsage()

  // Returns the total memory usage of all PolyLine objects created with this Library instance
  // PicoGK.Library.nPolyLinesMemUsage (method)
  public long nPolyLinesMemUsage()

  // Returns the total memory usage of all Voxels objects created with this Library instance
  // PicoGK.Library.nVoxelsMemUsage (method)
  public long nVoxelsMemUsage()

  // Returns the total memory usage of all VdbFile objects created with this Library instance
  // PicoGK.Library.nVdbFilesMemUsage (method)
  public long nVdbFilesMemUsage()

  // Returns the total memory usage of all ScalarField objects created with this Library instance
  // PicoGK.Library.nScalarFieldsMemUsage (method)
  public long nScalarFieldsMemUsage()

  // Returns the total memory usage of all VectorField objects created with this Library instance
  // PicoGK.Library.nVectorFieldsMemUsage (method)
  public long nVectorFieldsMemUsage()

  // Returns the total memory usage of all VdbFile metadata objects created with this Library instance
  // PicoGK.Library.nVdbMetasMemUsage (method)
  public long nVdbMetasMemUsage()

  // Returns the number of Mesh objects created with this Library instance
  // PicoGK.Library.nMeshesAllocated (method)
  public long nMeshesAllocated()

  // Returns the number of Lattice objects created with this Library instance
  // PicoGK.Library.nLatticesAllocated (method)
  public long nLatticesAllocated()

  // Returns the number of PolyLine objects created with this Library instance
  // PicoGK.Library.nPolyLinesAllocated (method)
  public long nPolyLinesAllocated()

  // Returns the number of Voxels objects created with this Library instance
  // PicoGK.Library.nVoxelsAllocated (method)
  public long nVoxelsAllocated()

  // Returns the number of VdbFile objects created with this Library instance
  // PicoGK.Library.nVdbFilesAllocated (method)
  public long nVdbFilesAllocated()

  // Returns the number of ScalarField objects created with this Library instance
  // PicoGK.Library.nScalarFieldsAllocated (method)
  public long nScalarFieldsAllocated()

  // Returns the number of VectorField objects created with this Library instance
  // PicoGK.Library.nVectorFieldsAllocated (method)
  public long nVectorFieldsAllocated()

  // Returns the number of VdbFile metadata objects created with this Library instance
  // PicoGK.Library.nVdbMetasAllocated (method)
  public long nVdbMetasAllocated()

  // Convert voxel index coordinates to world coordinates in millimeters
  // PicoGK.Library.vecVoxelsToMm (method)
  public Vector3 vecVoxelsToMm(int x, int y, int z)
  //   x: x coordinate in voxel units
  //   y: y coordinate in voxel units
  //   z: z coordinate in voxel units

  // Convert world (millimeter) units to voxel units
  // PicoGK.Library.MmToVoxels (method)
  public void MmToVoxels(Vector3 vecMm, out int x, out int y, out int z)
  //   vecMm: 3D coordinate in world (millimeter) space
  //   x: x coordinate in voxel units
  //   y: y coordinate in voxel units
  //   z: z coordinate in voxel units

  // The Library implements the Dispose pattern, so you can use it with `using`
  // PicoGK.Library.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // PicoGK.Library.oLibrary (method)
  public static Library oLibrary()

  // PicoGK.Library.RegisterGlobalLibrary (method)
  public static void RegisterGlobalLibrary(Library oLibrary)

  // PicoGK.Library.UnregisterGlobalLibrary (method)
  public static void UnregisterGlobalLibrary()

  // PicoGK.Library.oViewer (method)
  public static Viewer oViewer()

  // PicoGK.Library.RegisterGlobalViewer (method)
  public static void RegisterGlobalViewer(Viewer oViewer)

  // PicoGK.Library.UnregisterGlobalViewer (method)
  public static void UnregisterGlobalViewer()

  // PicoGK.Library.xLog (method)
  public static ILog xLog()

  // PicoGK.Library.RegisterGlobalLog (method)
  public static void RegisterGlobalLog(ILog xLog)

  // PicoGK.Library.UnregisterGlobalLog (method)
  public static void UnregisterGlobalLog()

  // This is the one library function that you call to run your code it sets up the PicoGK library, with the specified voxel size and builds the PicoGK environment with viewer, log and other internals The fnTask you pass is called after everything is set up correctly inside of fnTask, you do your processing, displaying it in Library::oTheViewer and logging info with Library::Log()
  // PicoGK.Library.Go (method)
  public static void Go(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath = "", bool bEndAppWithTask = false, string strWindowTitle = "PicoGK", string strLightsFile = "")
  //   fVoxelSizeMM: Voxel size in millimeters
  //   fnTask: The task to execute
  //   strLogFilePath: Filename of the logfile
  //   bEndAppWithTask: If true, the viewer exits when your task is done
  //   strWindowTitle: The title of your viewer window
  //   strLightsFile: A specific lighting environment to load

  // PicoGK.Library.Log (method)
  public static void Log(string strFormat, params object[] args)

  // Checks whether the task started using Go() should continue, and returns true if that's the case or false otherwise
  // PicoGK.Library.bContinueTask (method)
  public static bool bContinueTask(bool bAppExitOnly = false)
  //   bAppExitOnly: If true, the bContinueTask function will only take into consideration if the application is about to exit

  // Requests the task started by the Go() function to end
  // PicoGK.Library.EndTask (method)
  public static void EndTask()

  // Cancels any pending request to end the task
  // PicoGK.Library.CancelEndTaskRequest (method)
  public static void CancelEndTaskRequest()

  // PicoGK.Library.strFindLightSetupFile (method)
  public static string strFindLightSetupFile(out string strSearched)

  // Temporarily route PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) through a host supplied by an embedding application
  // PicoGK.Library.UseHost (method)
  public static IDisposable UseHost(ILibraryHost xHost)

  // Returns the library name (from the C++ side)
  // PicoGK.Library.strName (method)
  public static string strName()

  // Returns the library version (from the C++ side)
  // PicoGK.Library.strVersion (method)
  public static string strVersion()

  // Returns internal build info, such as build date/time of the C++ library
  // PicoGK.Library.strBuildInfo (method)
  public static string strBuildInfo()

// A simple logging class which outputs to the console
LogConsole

  // Implementation of a simple logging class that outputs to the console
  // PicoGK.LogConsole.Log (method)
  public void Log(in string strFormat, params object[] args)

LogFile

  // PicoGK.LogFile.LogFile (constructor)
  public LogFile(in string strFileName = "", in bool bOutputToConsole = true)

  // PicoGK.LogFile.Log (method)
  public void Log(in string strFormat, params object[] args)

  // PicoGK.LogFile.LogTime (method)
  public void LogTime()

  // PicoGK.LogFile.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// A progress reporting class that outputs to a log interface
LogProgress

  // Initialize a new progress reporting object
  // PicoGK.LogProgress.LogProgress (constructor)
  public LogProgress(ILog xLog, string strInfo = "Progress", float fIntervalSeconds = 1)
  //   xLog: Log interface to output to
  //   strInfo: Identifying string
  //   fIntervalSeconds: Minimum interval to leave between reporting entries

  // Report progress from 0..1
  // PicoGK.LogProgress.Progress (method)
  public void Progress(float f)

  // Cleanup (just reports that the task is finished)
  // PicoGK.LogProgress.Dispose (method)
  public void Dispose()

// Typed Material appearance
Material

  Name: string?

  Color: ColorFloat

  Metallic: float

  Roughness: float

  ColorTexture: MaterialTexture?

  MetallicRoughnessTexture: MaterialTexture?

  NormalTexture: MaterialTexture?

  NormalScale: float

  OcclusionTexture: MaterialTexture?

  OcclusionStrength: float

  Emissive: ColorFloat

  EmissiveStrength: float

  EmissiveTexture: MaterialTexture?

  AlphaMode: MaterialAlphaMode?

  AlphaCutoff: float

  DoubleSided: bool

  Unlit: bool

  Ior: float?

  Dispersion: float?

  Anisotropy: MaterialAnisotropy?

  Clearcoat: MaterialClearcoat?

  Iridescence: MaterialIridescence?

  Sheen: MaterialSheen?

  Specular: MaterialSpecular?

  Transmission: MaterialTransmission?

  Volume: MaterialVolume?

// Typed MaterialAlphaMode appearance
MaterialAlphaMode

  Opaque: Opaque

  Mask: Mask

  Blend: Blend

// Typed MaterialAnisotropy appearance
MaterialAnisotropy

  Strength: float

  Rotation: float

  Texture: MaterialTexture?

// Typed MaterialClearcoat appearance
MaterialClearcoat

  Factor: float

  Roughness: float

  Texture: MaterialTexture?

  RoughnessTexture: MaterialTexture?

  NormalTexture: MaterialTexture?

  NormalScale: float

// Typed MaterialImage appearance
MaterialImage

  Data: byte[]

  Format: MaterialImageFormat

  Name: string?

// Typed MaterialImageFormat appearance
MaterialImageFormat

  Png: Png

  Jpeg: Jpeg

  WebP: WebP

// Typed MaterialIridescence appearance
MaterialIridescence

  Factor: float

  Ior: float

  ThicknessMinimum: float

  ThicknessMaximum: float

  Texture: MaterialTexture?

  ThicknessTexture: MaterialTexture?

// Typed MaterialMagFilter appearance
MaterialMagFilter

  Nearest: Nearest

  Linear: Linear

// Typed MaterialMinFilter appearance
MaterialMinFilter

  Nearest: Nearest

  Linear: Linear

  NearestMipmapNearest: NearestMipmapNearest

  LinearMipmapNearest: LinearMipmapNearest

  NearestMipmapLinear: NearestMipmapLinear

  LinearMipmapLinear: LinearMipmapLinear

// Typed MaterialSampler appearance
MaterialSampler

  WrapS: MaterialWrap

  WrapT: MaterialWrap

  MagFilter: MaterialMagFilter?

  MinFilter: MaterialMinFilter?

// Typed MaterialSheen appearance
MaterialSheen

  Color: ColorFloat

  Roughness: float

  ColorTexture: MaterialTexture?

  RoughnessTexture: MaterialTexture?

// Typed MaterialSpecular appearance
MaterialSpecular

  Factor: float

  Color: ColorFloat

  Texture: MaterialTexture?

  ColorTexture: MaterialTexture?

// Typed MaterialTexture appearance
MaterialTexture

  Image: MaterialImage

  Sampler: MaterialSampler?

  Transform: MaterialTextureTransform?

// Typed MaterialTextureTransform appearance
MaterialTextureTransform

  Offset: Vector2

  Scale: Vector2

  Rotation: float

// Typed MaterialTransmission appearance
MaterialTransmission

  Factor: float

  Texture: MaterialTexture?

// Typed MaterialVolume appearance
MaterialVolume

  Thickness: float

  AttenuationDistance: float?

  AttenuationColor: ColorFloat

  ThicknessTexture: MaterialTexture?

// Typed MaterialWrap appearance
MaterialWrap

  ClampToEdge: ClampToEdge

  MirroredRepeat: MirroredRepeat

  Repeat: Repeat

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
  // PicoGK.Mesh.Mesh (constructor)
  public Mesh()
  public Mesh(Library libSet)
  public Mesh(in Voxels vox)

  // Create a transformed mesh by offsetting and scaling it
  // PicoGK.Mesh.mshCreateTransformed (method)
  public Mesh mshCreateTransformed(Vector3 vecScale, Vector3 vecOffset)
  public Mesh mshCreateTransformed(Matrix4x4 matTrans)
  //   vecScale: Scale the mesh (first step)
  //   vecOffset: Offset the mesh (second step)

  // Mirrors a mesh at the specified plane
  // PicoGK.Mesh.mshCreateMirrored (method)
  public Mesh mshCreateMirrored(Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
  //   vecPlanePoint: A point through which the mirror plane passes
  //   vecPlaneNormal: The normal vector of the mirror plane

  // Add a new vertex to the mesh so that it can be used in mesh triangles
  // PicoGK.Mesh.nAddVertex (method)
  public int nAddVertex(in Vector3 vec)
  //   vec: The vertex to add

  // PicoGK.Mesh.AddVertices (method)
  public void AddVertices(in IEnumerable<Vector3> avecVertices, out int[] anVertexIndex)

  // Get the vertex at the specified index
  // PicoGK.Mesh.vecVertexAt (method)
  public Vector3 vecVertexAt(int nVertex)
  //   nVertex: The vertex index

  // Get the number of vertices in the mesh
  // PicoGK.Mesh.nVertexCount (method)
  public int nVertexCount()

  // Add a triangle to the mesh with the specified vertex indices
  // PicoGK.Mesh.nAddTriangle (method)
  public int nAddTriangle(in Triangle t)
  public int nAddTriangle(int A, int B, int C)
  public int nAddTriangle(in Vector3 vecA, in Vector3 vecB, in Vector3 vecC)
  //   t: Triangle with the vertex indices set to existing vertices

  // Return number of triangles in the mesh
  // PicoGK.Mesh.nTriangleCount (method)
  public int nTriangleCount()

  // Adds a quad, defined by four corner vertices Helper function, which calls nAddTriangle in the background
  // PicoGK.Mesh.AddQuad (method)
  public void AddQuad(int n0, int n1, int n2, int n3, bool bFlipped = false)
  public void AddQuad(in Vector3 vec0, in Vector3 vec1, in Vector3 vec2, in Vector3 vec3, bool bFlipped = false)

  // Get the triangle with the specified index
  // PicoGK.Mesh.oTriangleAt (method)
  public Triangle oTriangleAt(int nTriangle)
  //   nTriangle: Triangle index in the mesh

  // Get the triangle with the specified index
  // PicoGK.Mesh.GetTriangle (method)
  public void GetTriangle(int nTriangle, out Vector3 vecA, out Vector3 vecB, out Vector3 vecC)
  //   nTriangle: Triangle index in the mesh
  //   vecA: First vertex in the triangle
  //   vecB: Second vertex in the triangle
  //   vecC: Third vertex in the triangle

  // Append one mesh to another Note, no deduplication is done and no "boolean" The source mesh remains unchanged
  // PicoGK.Mesh.Append (method)
  public void Append(Mesh msh)

  // Return the BoundingBox of the Mesh
  // PicoGK.Mesh.oBoundingBox (method)
  public BBox3 oBoundingBox()

  // Loads a mesh from an STL file By default, it tries to find a UNITS= info in the header and uses that to scale the mesh automatically to mm
  // PicoGK.Mesh.mshFromStlFile (method)
  public static Mesh mshFromStlFile(string strFilePath, Mesh.EStlUnit eLoadUnit = AUTO, float fPostScale = 1, Vector3? vecPostOffsetMM = null, Library? libSet = null)
  public static Mesh mshFromStlFile(FileStream oFile, Mesh.EStlUnit eLoadUnit = AUTO, float fPostScale = 1, Vector3? vecPostOffsetMM = null, Library? lib = null)
  //   strFilePath: Path to the file
  //   eLoadUnit: Units to load
  //   fPostScale: Scale parameter to be applied before offset
  //   vecPostOffsetMM: Offset parameter to be applied last
  //   libSet: Library instance to use

  // Saves a Mesh to STL file If eUnit is auto, then, if this mesh was loaded from an STL before the same units as before are being used (stored in public property m_eLoadUnits)
  // PicoGK.Mesh.SaveToStlFile (method)
  public void SaveToStlFile(string strFilePath, Mesh.EStlUnit eUnit = AUTO, Vector3? vecOffsetMM = null, float fScale = 1)
  public void SaveToStlFile(FileStream oFile, Mesh.EStlUnit eUnit = AUTO, Vector3? vecOffsetMM = null, float fScale = 1)
  //   strFilePath: File path
  //   eUnit: If loaded previously, defaults to original units
  //   vecOffsetMM: Offset applied while still in mm units
  //   fScale: Scale applied after offset, while still in mm units

  // PicoGK.Mesh.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // PicoGK.Mesh.bFindTriangleFromSurfacePoint (method)
  public bool bFindTriangleFromSurfacePoint(Vector3 vecSurfacePoint, out int nTriangle)

  // PicoGK.Mesh.bPointLiesOnTriangle (method)
  public static bool bPointLiesOnTriangle(Vector3 vecP, Vector3 vecA, Vector3 vecB, Vector3 vecC)

MshHandle

  Value: long

  // PicoGK.MshHandle.MshHandle (constructor)
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
  // PicoGK.OpenVdbFile.OpenVdbFile (constructor)
  public OpenVdbFile()
  public OpenVdbFile(string strFileName)
  public OpenVdbFile(Library libSet)
  public OpenVdbFile(Library libSet, string strFileName)

  // Create a PicoGK library object that is compatible with the specified OpenVDB file, i.e
  // PicoGK.OpenVdbFile.libCreateCompatibleLibraryFor (method)
  public static Library libCreateCompatibleLibraryFor(string strVdbFilePath)

  // Saves the current object with all of its attached fields to a .VDB container
  // PicoGK.OpenVdbFile.SaveToFile (method)
  public void SaveToFile(string strFileName)
  //   strFileName: Path and filename to save to

  // Get the Voxels at the index specified
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
  // PicoGK.OpenVdbFile.oGetScalarField (method)
  public ScalarField oGetScalarField(int nIndex)
  public ScalarField oGetScalarField(string strName)
  //   nIndex: Index of the field

  // Get the VectorField at the index specified
  // PicoGK.OpenVdbFile.oGetVectorField (method)
  public VectorField oGetVectorField(int nIndex)
  public VectorField oGetVectorField(string strName)
  //   nIndex: Index of the field

  // Number of fields stored in the VdbFile container
  // PicoGK.OpenVdbFile.nFieldCount (method)
  public int nFieldCount()

  // Returns the name of the field (if specified) at the given field index
  // PicoGK.OpenVdbFile.strFieldName (method)
  public string strFieldName(int nIndex)
  //   nIndex: Index of the field

  // Returns the type of the field at the given field index
  // PicoGK.OpenVdbFile.eFieldType (method)
  public OpenVdbFile.EFieldType eFieldType(int nIndex)
  //   nIndex: Index of the field

  // Returns the field type at the given index as string
  // PicoGK.OpenVdbFile.strFieldType (method)
  public string strFieldType(int nIndex)
  //   nIndex: Index of the field

  // PicoGK.OpenVdbFile.xField (method)
  public IFieldWithMetadata xField(int nIndex)

  // PicoGK.OpenVdbFile.bIsPicoGKCompatible (method)
  public bool bIsPicoGKCompatible()

  // PicoGK.OpenVdbFile.fPicoGKVoxelSizeMM (method)
  public float fPicoGKVoxelSizeMM()

  // PicoGK.OpenVdbFile._hCreate (method)
  public static extern VdbHandle _hCreate(LibHandle hLib)

  // PicoGK.OpenVdbFile.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

PicoGKAllocException

  // PicoGK.PicoGKAllocException.PicoGKAllocException (constructor)
  public PicoGKAllocException()
  public PicoGKAllocException(string? message)

PicoGKLibraryMismatchException

  // PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor)
  public PicoGKLibraryMismatchException()
  public PicoGKLibraryMismatchException(string? message)

PolyContour

  EWinding

    UNKNOWN: UNKNOWN

    CLOCKWISE: CLOCKWISE

    COUNTERCLOCKWISE: COUNTERCLOCKWISE

  // PicoGK.PolyContour.strWindingAsString (method)
  public static string strWindingAsString(PolyContour.EWinding eWinding)

  // PicoGK.PolyContour.eDetectWinding (method)
  public static PolyContour.EWinding eDetectWinding(List<Vector2> oVertices)

  // PicoGK.PolyContour.PolyContour (constructor)
  public PolyContour(IEnumerable<Vector2> oVertices, PolyContour.EWinding eWinding = UNKNOWN)

  // PicoGK.PolyContour.AddVertex (method)
  public void AddVertex(Vector2 vec)

  // PicoGK.PolyContour.DetectWinding (method)
  public void DetectWinding()

  // PicoGK.PolyContour.eWinding (method)
  public PolyContour.EWinding eWinding()

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

PolyHandle

  Value: long

  // PicoGK.PolyHandle.PolyHandle (constructor)
  public PolyHandle(long Value)

// A colored 3D polyline for use in the viewer
PolyLine

  lib: Library

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
  public void AddArrow(float fSizeMM = 1, Vector3? _vecDir = null)
  //   fSizeMM: Optional size of the base of the arrow, and the distance from the tip
  //   _vecDir: Optional direction of the arrow

  // Add a cross at the end of a polyline
  // PicoGK.PolyLine.AddCross (method)
  public void AddCross(float fSizeMM = 1)
  //   fSizeMM: Size of the cross

  // PicoGK.PolyLine._hCreate (method)
  public static extern PolyHandle _hCreate(LibHandle hLib, in ColorFloat clr)

  // PicoGK.PolyLine.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

PolySlice

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

PolySliceStack

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

// A progress counting class for counting up items to 100%
ProgressCounter

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

// A progress reporting class that does nothing (can be used as default)
ProgressNoop

  // Progress from 0..1
  // PicoGK.ProgressNoop.Progress (method)
  public void Progress(float f)

QuadHandle

  Value: nint

  // PicoGK.QuadHandle.QuadHandle (constructor)
  public QuadHandle(nint Value)

SKHelpers

  // PicoGK.SKHelpers.oAsSkColor (method)
  public static SKColor oAsSkColor(ColorRgba32 clr)
  public static SKColor oAsSkColor(ColorFloat clr)

  // PicoGK.SKHelpers.clrAsColorRgba32 (method)
  public static ColorRgba32 clrAsColorRgba32(SKColor clr)

// A field of scalar floating point values
ScalarField

  // Field metadata
  m_oMetadata: FieldMetadata

  lib: Library

  // PicoGK.ScalarField.oMetaData (method)
  public FieldMetadata oMetaData()

  // Create an empty scalar field object
  // PicoGK.ScalarField.ScalarField (constructor)
  public ScalarField()
  public ScalarField(Library libSet)
  public ScalarField(in ScalarField oSource)
  public ScalarField(Voxels vox)
  public ScalarField(Voxels vox, float fValue, float fSdThreshold = 0.5)

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

  // Returns a signed distance-field-encoded slice of the voxel field To use it, use GetVoxelDimensions to find out the size of the voxel field in voxel units
  // PicoGK.ScalarField.GetVoxelSlice (method)
  public void GetVoxelSlice(in int nZSlice, ref ImageGrayScale img)
  //   nZSlice: Slice to retrieve
  //   img: Pre-allocated grayscale image to receive the values

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

  // PicoGK.ScalarField._hCreate (method)
  public static extern ScalarFieldHandle _hCreate(LibHandle hLib)

  // PicoGK.ScalarField._hCreateCopy (method)
  public static extern ScalarFieldHandle _hCreateCopy(LibHandle hLib, ScalarFieldHandle hSource)

  // PicoGK.ScalarField._hCreateFromVoxels (method)
  public static extern ScalarFieldHandle _hCreateFromVoxels(LibHandle hLib, VoxHandle hVoxels)

  // PicoGK.ScalarField._hBuildFromVoxels (method)
  public static extern ScalarFieldHandle _hBuildFromVoxels(LibHandle hLib, VoxHandle hVoxels, float fScalarValue, float fSdThreshold)

  // PicoGK.ScalarField.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

ScalarFieldHandle

  Value: nint

  // PicoGK.ScalarFieldHandle.ScalarFieldHandle (constructor)
  public ScalarFieldHandle(nint Value)
