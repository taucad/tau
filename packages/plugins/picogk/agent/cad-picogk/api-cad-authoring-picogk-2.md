# PicoGK — CAD authoring — PicoGK (2)

23 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// A lattice of beams (and spheres)
public partial class Lattice : IDisposable

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

// Category: CAD authoring
// The Library object encapsulates an instance of a PicoGK library configuration
public partial class Library : IDisposable

  public const int nStringLength = 255;

  // Voxel size in millimeters
  public readonly float fVoxelSize;

  public class GlobalInstance : IDisposable

    public Viewer oViewer { get; }

    public Library oLibrary { get; }

    public LogFile xLog { get; }

    public GlobalInstance(float fVoxelSizeMM, string strLogPath = "", string strViewerTitle = "PicoGK", string strViewerEnvironment = "")

    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  public static float fVoxelSizeMM { get; }

  public static string strLogFolder { get; }

  // Return deduplicated logical owned storage retained by this Library instance
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
  //   x: x coordinate in voxel units
  //   y: y coordinate in voxel units
  //   z: z coordinate in voxel units

  // Convert world (millimeter) units to voxel units
  public void MmToVoxels(Vector3 vecMm, out int x, out int y, out int z)
  //   vecMm: 3D coordinate in world (millimeter) space
  //   x: x coordinate in voxel units
  //   y: y coordinate in voxel units
  //   z: z coordinate in voxel units

  // The Library implements the Dispose pattern, so you can use it with `using`
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  // Return the borrowed library for the current Go task
  // Remarks: The host owns this library. Author code must keep it within the task lifetime and leave disposal and registration to the host.
  public static Library oLibrary()

  // Return the borrowed viewer for the current Go task
  // Remarks: The host owns this viewer. Author code uses it to publish geometry within the task and leaves disposal and registration to the host.
  public static Viewer oViewer()

  public static ILog xLog()

  public static void RegisterGlobalLog(ILog xLog)

  public static void UnregisterGlobalLog()

  // This is the one library function that you call to run your code it sets up the PicoGK library, with the specified voxel size and builds the PicoGK environment with viewer, log and other internals The fnTask you pass is called after everything is set up correctly inside of fnTask, you do your processing, displaying it in Library::oTheViewer and logging info with Library::Log()
  // Throws: System.Exception: Throws an exception, for a number of scenarios, for example, if the library cannot be found, folders, etc. cannot be created, etc. Always handle the exception to understand what's going on.
  public static void Go(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath = "", bool bEndAppWithTask = false, string strWindowTitle = "PicoGK", string strLightsFile = "")
  //   fVoxelSizeMM: Voxel size in millimeters
  //   fnTask: The task to execute
  //   strLogFilePath: Filename of the logfile
  //   bEndAppWithTask: If true, the viewer exits when your task is done
  //   strWindowTitle: The title of your viewer window
  //   strLightsFile: A specific lighting environment to load

  public static void Log(string strFormat, params object[] args)

  // Checks whether the task started using Go() should continue, and returns true if that's the case or false otherwise
  public static bool bContinueTask(bool bAppExitOnly = false)
  //   bAppExitOnly: If true, the bContinueTask function will only take into consideration if the application is about to exit

  // Requests the task started by the Go() function to end
  public static void EndTask()

  // Cancels any pending request to end the task
  public static void CancelEndTaskRequest()

  public static string strFindLightSetupFile(out string strSearched)

  // Returns the library name (from the C++ side)
  public static string strName()

  // Returns the library version (from the C++ side)
  public static string strVersion()

  // Returns internal build info, such as build date/time of the C++ library
  public static string strBuildInfo()

// Category: CAD authoring
// A simple logging class which outputs to the console
public class LogConsole : ILog

  // Implementation of a simple logging class that outputs to the console
  public void Log(in string strFormat, params object[] args)

  public LogConsole()

// Category: CAD authoring
public class LogFile : IDisposable, ILog

  public LogFile(in string strFileName = "", in bool bOutputToConsole = true)

  public void Log(in string strFormat, params object[] args)

  public void LogTime()

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// A progress reporting class that outputs to a log interface
public class LogProgress : IProgress, IDisposable

  // Initialize a new progress reporting object
  public LogProgress(ILog xLog, string strInfo = "Progress", float fIntervalSeconds = 1f)
  //   xLog: Log interface to output to
  //   strInfo: Identifying string
  //   fIntervalSeconds: Minimum interval to leave between reporting entries

  // Report progress from 0..1
  public void Progress(float f)

  // Cleanup (just reports that the task is finished)
  public void Dispose()

// Category: CAD authoring
// Typed Material appearance
public sealed record Material

  public string? Name { get; init; }

  public ColorFloat Color { get; init; } = new("FFFFFF");

  public float Metallic { get; init; }

  public float Roughness { get; init; } = .35f;

  public MaterialTexture? ColorTexture { get; init; }

  public MaterialTexture? MetallicRoughnessTexture { get; init; }

  public MaterialTexture? NormalTexture { get; init; }

  public float NormalScale { get; init; } = 1;

  public MaterialTexture? OcclusionTexture { get; init; }

  public float OcclusionStrength { get; init; } = 1;

  public ColorFloat Emissive { get; init; } = new("000000");

  public float EmissiveStrength { get; init; } = 1;

  public MaterialTexture? EmissiveTexture { get; init; }

  public MaterialAlphaMode? AlphaMode { get; init; }

  public float AlphaCutoff { get; init; } = .5f;

  public bool DoubleSided { get; init; } = true;

  public bool Unlit { get; init; }

  public float? Ior { get; init; }

  public float? Dispersion { get; init; }

  public MaterialAnisotropy? Anisotropy { get; init; }

  public MaterialClearcoat? Clearcoat { get; init; }

  public MaterialIridescence? Iridescence { get; init; }

  public MaterialSheen? Sheen { get; init; }

  public MaterialSpecular? Specular { get; init; }

  public MaterialTransmission? Transmission { get; init; }

  public MaterialVolume? Volume { get; init; }

  public Material()

// Category: CAD authoring
// Typed MaterialAlphaMode appearance
public enum MaterialAlphaMode

  Opaque

  Mask

  Blend

// Category: CAD authoring
// Typed MaterialAnisotropy appearance
public sealed record MaterialAnisotropy

  public float Strength { get; init; }

  public float Rotation { get; init; }

  public MaterialTexture? Texture { get; init; }

  public MaterialAnisotropy()

// Category: CAD authoring
// Typed MaterialClearcoat appearance
public sealed record MaterialClearcoat

  public float Factor { get; init; }

  public float Roughness { get; init; }

  public MaterialTexture? Texture { get; init; }

  public MaterialTexture? RoughnessTexture { get; init; }

  public MaterialTexture? NormalTexture { get; init; }

  public float NormalScale { get; init; } = 1;

  public MaterialClearcoat()

// Category: CAD authoring
// Encoded image bytes
// Remarks: The record is a shallow descriptor: with copies retain the same mutable Data array. Typed group material assignment synchronously owns encoded bytes and validates the complete image. Omitted Format infers PNG, JPEG or WebP; an explicit format must match. Record equality is not image-content identity.
public sealed record MaterialImage

  public required byte[] Data { get; init; }

  public MaterialImageFormat Format { get; init; } = MaterialImageFormat.Auto;

  public string? Name { get; init; }

  public MaterialImage()

// Category: CAD authoring
// Encoded image formats
public enum MaterialImageFormat

  Auto = -1

  Png = 0

  Jpeg = 1

  WebP = 2

// Category: CAD authoring
// Typed MaterialIridescence appearance
public sealed record MaterialIridescence

  public float Factor { get; init; }

  public float Ior { get; init; } = 1.3f;

  public float ThicknessMinimum { get; init; } = 100;

  public float ThicknessMaximum { get; init; } = 400;

  public MaterialTexture? Texture { get; init; }

  public MaterialTexture? ThicknessTexture { get; init; }

  public MaterialIridescence()

// Category: CAD authoring
// Typed MaterialMagFilter appearance
public enum MaterialMagFilter

  Nearest = 9728

  Linear = 9729

// Category: CAD authoring
// Typed MaterialMinFilter appearance
public enum MaterialMinFilter

  Nearest = 9728

  Linear = 9729

  NearestMipmapNearest = 9984

  LinearMipmapNearest = 9985

  NearestMipmapLinear = 9986

  LinearMipmapLinear = 9987

// Category: CAD authoring
// Typed MaterialSampler appearance
public sealed record MaterialSampler

  public MaterialWrap WrapS { get; init; } = MaterialWrap.Repeat;

  public MaterialWrap WrapT { get; init; } = MaterialWrap.Repeat;

  public MaterialMagFilter? MagFilter { get; init; }

  public MaterialMinFilter? MinFilter { get; init; }

  public MaterialSampler()

// Category: CAD authoring
// Typed MaterialSheen appearance
public sealed record MaterialSheen

  public ColorFloat Color { get; init; } = new("000000");

  public float Roughness { get; init; }

  public MaterialTexture? ColorTexture { get; init; }

  public MaterialTexture? RoughnessTexture { get; init; }

  public MaterialSheen()

// Category: CAD authoring
// Typed MaterialSpecular appearance
public sealed record MaterialSpecular

  public float Factor { get; init; } = 1;

  public ColorFloat Color { get; init; } = new("FFFFFF");

  public MaterialTexture? Texture { get; init; }

  public MaterialTexture? ColorTexture { get; init; }

  public MaterialSpecular()

// Category: CAD authoring
// Typed MaterialTexture appearance
public sealed record MaterialTexture

  public required MaterialImage Image { get; init; }

  public MaterialSampler? Sampler { get; init; }

  public MaterialTextureTransform? Transform { get; init; }

  public MaterialTexture()

// Category: CAD authoring
// Typed MaterialTextureTransform appearance
public sealed record MaterialTextureTransform

  public Vector2 Offset { get; init; }

  public Vector2 Scale { get; init; } = Vector2.One;

  public float Rotation { get; init; }

  public MaterialTextureTransform()

// Category: CAD authoring
// Typed MaterialTransmission appearance
public sealed record MaterialTransmission

  public float Factor { get; init; }

  public MaterialTexture? Texture { get; init; }

  public MaterialTransmission()

// Category: CAD authoring
// Typed MaterialVolume appearance
public sealed record MaterialVolume

  public float Thickness { get; init; }

  public float? AttenuationDistance { get; init; }

  public ColorFloat AttenuationColor { get; init; } = new("FFFFFF");

  public MaterialTexture? ThicknessTexture { get; init; }

  public MaterialVolume()

// Category: CAD authoring
// Typed MaterialWrap appearance
public enum MaterialWrap

  ClampToEdge = 33071

  MirroredRepeat = 33648

  Repeat = 10497

// Category: CAD authoring
// A triangle mesh
public partial class Mesh : IDisposable

  public enum EStlUnit

    AUTO

    MM

    CM

    M

    FT

    IN

  public string m_strLoadHeaderData = "";

  public EStlUnit m_eLoadUnits = EStlUnit.AUTO;

  // Creates a new empty Mesh, using the global library instance
  public Mesh()
  public Mesh(Library libSet)
  public Mesh(in Voxels vox)

  // Create a transformed mesh by offsetting and scaling it
  public Mesh mshCreateTransformed(Vector3 vecScale, Vector3 vecOffset)
  public Mesh mshCreateTransformed(Matrix4x4 matTrans)
  //   vecScale: Scale the mesh (first step)
  //   vecOffset: Offset the mesh (second step)

  // Mirrors a mesh at the specified plane
  public Mesh mshCreateMirrored(Vector3 vecPlanePoint, Vector3 vecPlaneNormal)
  //   vecPlanePoint: A point through which the mirror plane passes
  //   vecPlaneNormal: The normal vector of the mirror plane

  // Add a new vertex to the mesh so that it can be used in mesh triangles
  public int nAddVertex(in Vector3 vec)
  //   vec: The vertex to add

  public void AddVertices(in IEnumerable<Vector3> avecVertices, out int[] anVertexIndex)

  // Get the vertex at the specified index
  public Vector3 vecVertexAt(int nVertex)
  //   nVertex: The vertex index

  // Get the number of vertices in the mesh
  public int nVertexCount()

  // Add a triangle to the mesh with the specified vertex indices
  public int nAddTriangle(in Triangle t)
  public int nAddTriangle(int A, int B, int C)
  public int nAddTriangle(in Vector3 vecA, in Vector3 vecB, in Vector3 vecC)
  //   t: Triangle with the vertex indices set to existing vertices

  // Return number of triangles in the mesh
  public int nTriangleCount()

  // Adds a quad, defined by four corner vertices Helper function, which calls nAddTriangle in the background
  public void AddQuad(int n0, int n1, int n2, int n3, bool bFlipped = false)
  public void AddQuad(in Vector3 vec0, in Vector3 vec1, in Vector3 vec2, in Vector3 vec3, bool bFlipped = false)

  // Get the triangle with the specified index
  public Triangle oTriangleAt(int nTriangle)
  //   nTriangle: Triangle index in the mesh

  // Get the triangle with the specified index
  public void GetTriangle(int nTriangle, out Vector3 vecA, out Vector3 vecB, out Vector3 vecC)
  //   nTriangle: Triangle index in the mesh
  //   vecA: First vertex in the triangle
  //   vecB: Second vertex in the triangle
  //   vecC: Third vertex in the triangle

  // Append one mesh to another Note, no deduplication is done and no "boolean" The source mesh remains unchanged
  public void Append(Mesh msh)

  // Return the BoundingBox of the Mesh
  public BBox3 oBoundingBox()

  // Loads a mesh from an STL file By default, it tries to find a UNITS= info in the header and uses that to scale the mesh automatically to mm
  public static Mesh mshFromStlFile(string strFilePath, EStlUnit eLoadUnit = EStlUnit.AUTO, // use units from file, or mm when not spec'd
   float fPostScale = 1.0f, Vector3? vecPostOffsetMM = null, Library? libSet = null)
  public static Mesh mshFromStlFile(FileStream oFile, EStlUnit eLoadUnit = EStlUnit.AUTO, // use units from file, or mm when not spec'd
   float fPostScale = 1.0f, Vector3? vecPostOffsetMM = null, Library? lib = null)
  //   strFilePath: Path to the file
  //   eLoadUnit: Units to load
  //   fPostScale: Scale parameter to be applied before offset
  //   vecPostOffsetMM: Offset parameter to be applied last
  //   libSet: Library instance to use

  // Saves a Mesh to STL file If eUnit is auto, then, if this mesh was loaded from an STL before the same units as before are being used (stored in public property m_eLoadUnits)
  public void SaveToStlFile(string strFilePath, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
  public void SaveToStlFile(FileStream oFile, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
  //   strFilePath: File path
  //   eUnit: If loaded previously, defaults to original units
  //   vecOffsetMM: Offset applied while still in mm units
  //   fScale: Scale applied after offset, while still in mm units

  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

  public bool bFindTriangleFromSurfacePoint(Vector3 vecSurfacePoint, out int nTriangle)

  static public bool bPointLiesOnTriangle(Vector3 vecP, Vector3 vecA, Vector3 vecB, Vector3 vecC)
