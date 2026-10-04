# PicoGK — CAD authoring — PicoGK (2)

23 top-level symbols. Signatures are verbatim csharp.

// Category: CAD authoring
// A lattice of beams (and spheres)
// PicoGK.Lattice (class)
public partial class Lattice : IDisposable

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

// Category: CAD authoring
// The Library object encapsulates an instance of a PicoGK library configuration
// PicoGK.Library (class)
public partial class Library : IDisposable

  // PicoGK.Library.nStringLength (constant)
  public const int nStringLength = 255;

  // Voxel size in millimeters
  // PicoGK.Library.fVoxelSize (field)
  public readonly float fVoxelSize;

  // PicoGK.Library.GlobalInstance (class)
  public class GlobalInstance : IDisposable

    // PicoGK.Library.GlobalInstance.oViewer (property)
    public Viewer oViewer { get; }

    // PicoGK.Library.GlobalInstance.oLibrary (property)
    public Library oLibrary { get; }

    // PicoGK.Library.GlobalInstance.xLog (property)
    public LogFile xLog { get; }

    // PicoGK.Library.GlobalInstance.GlobalInstance (constructor)
    public GlobalInstance(float fVoxelSizeMM, string strLogPath = "", string strViewerTitle = "PicoGK", string strViewerEnvironment = "")

    // PicoGK.Library.GlobalInstance.Dispose (method)
    public void Dispose()
    protected virtual void Dispose(bool bDisposing)

  // PicoGK.Library.fVoxelSizeMM (property)
  public static float fVoxelSizeMM { get; }

  // PicoGK.Library.strLogFolder (property)
  public static string strLogFolder { get; }

  // Return deduplicated logical owned storage retained by this Library instance
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

  // Return the borrowed library for the current Go task
  // Remarks: The host owns this library. Author code must keep it within the task lifetime and leave disposal and registration to the host.
  // PicoGK.Library.oLibrary (method)
  public static Library oLibrary()

  // Return the borrowed viewer for the current Go task
  // Remarks: The host owns this viewer. Author code uses it to publish geometry within the task and leaves disposal and registration to the host.
  // PicoGK.Library.oViewer (method)
  public static Viewer oViewer()

  // PicoGK.Library.xLog (method)
  public static ILog xLog()

  // PicoGK.Library.RegisterGlobalLog (method)
  public static void RegisterGlobalLog(ILog xLog)

  // PicoGK.Library.UnregisterGlobalLog (method)
  public static void UnregisterGlobalLog()

  // This is the one library function that you call to run your code it sets up the PicoGK library, with the specified voxel size and builds the PicoGK environment with viewer, log and other internals The fnTask you pass is called after everything is set up correctly inside of fnTask, you do your processing, displaying it in Library::oTheViewer and logging info with Library::Log()
  // Throws: System.Exception: Throws an exception, for a number of scenarios, for example, if the library cannot be found, folders, etc. cannot be created, etc. Always handle the exception to understand what's going on.
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

  // Returns the library name (from the C++ side)
  // PicoGK.Library.strName (method)
  public static string strName()

  // Returns the library version (from the C++ side)
  // PicoGK.Library.strVersion (method)
  public static string strVersion()

  // Returns internal build info, such as build date/time of the C++ library
  // PicoGK.Library.strBuildInfo (method)
  public static string strBuildInfo()

// Category: CAD authoring
// A simple logging class which outputs to the console
// PicoGK.LogConsole (class)
public class LogConsole : ILog

  // Implementation of a simple logging class that outputs to the console
  // PicoGK.LogConsole.Log (method)
  public void Log(in string strFormat, params object[] args)

  // PicoGK.LogConsole.LogConsole (constructor)
  public LogConsole()

// Category: CAD authoring
// PicoGK.LogFile (class)
public class LogFile : IDisposable, ILog

  // PicoGK.LogFile.LogFile (constructor)
  public LogFile(in string strFileName = "", in bool bOutputToConsole = true)

  // PicoGK.LogFile.Log (method)
  public void Log(in string strFormat, params object[] args)

  // PicoGK.LogFile.LogTime (method)
  public void LogTime()

  // PicoGK.LogFile.Dispose (method)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// Category: CAD authoring
// A progress reporting class that outputs to a log interface
// PicoGK.LogProgress (class)
public class LogProgress : IProgress, IDisposable

  // Initialize a new progress reporting object
  // PicoGK.LogProgress.LogProgress (constructor)
  public LogProgress(ILog xLog, string strInfo = "Progress", float fIntervalSeconds = 1f)
  //   xLog: Log interface to output to
  //   strInfo: Identifying string
  //   fIntervalSeconds: Minimum interval to leave between reporting entries

  // Report progress from 0..1
  // PicoGK.LogProgress.Progress (method)
  public void Progress(float f)

  // Cleanup (just reports that the task is finished)
  // PicoGK.LogProgress.Dispose (method)
  public void Dispose()

// Category: CAD authoring
// Typed Material appearance
// PicoGK.Material (class)
public sealed record Material

  // PicoGK.Material.Name (property)
  public string? Name { get; init; }

  // PicoGK.Material.Color (property)
  public ColorFloat Color { get; init; } = new("FFFFFF");

  // PicoGK.Material.Metallic (property)
  public float Metallic { get; init; }

  // PicoGK.Material.Roughness (property)
  public float Roughness { get; init; } = .35f;

  // PicoGK.Material.ColorTexture (property)
  public MaterialTexture? ColorTexture { get; init; }

  // PicoGK.Material.MetallicRoughnessTexture (property)
  public MaterialTexture? MetallicRoughnessTexture { get; init; }

  // PicoGK.Material.NormalTexture (property)
  public MaterialTexture? NormalTexture { get; init; }

  // PicoGK.Material.NormalScale (property)
  public float NormalScale { get; init; } = 1;

  // PicoGK.Material.OcclusionTexture (property)
  public MaterialTexture? OcclusionTexture { get; init; }

  // PicoGK.Material.OcclusionStrength (property)
  public float OcclusionStrength { get; init; } = 1;

  // PicoGK.Material.Emissive (property)
  public ColorFloat Emissive { get; init; } = new("000000");

  // PicoGK.Material.EmissiveStrength (property)
  public float EmissiveStrength { get; init; } = 1;

  // PicoGK.Material.EmissiveTexture (property)
  public MaterialTexture? EmissiveTexture { get; init; }

  // PicoGK.Material.AlphaMode (property)
  public MaterialAlphaMode? AlphaMode { get; init; }

  // PicoGK.Material.AlphaCutoff (property)
  public float AlphaCutoff { get; init; } = .5f;

  // PicoGK.Material.DoubleSided (property)
  public bool DoubleSided { get; init; } = true;

  // PicoGK.Material.Unlit (property)
  public bool Unlit { get; init; }

  // PicoGK.Material.Ior (property)
  public float? Ior { get; init; }

  // PicoGK.Material.Dispersion (property)
  public float? Dispersion { get; init; }

  // PicoGK.Material.Anisotropy (property)
  public MaterialAnisotropy? Anisotropy { get; init; }

  // PicoGK.Material.Clearcoat (property)
  public MaterialClearcoat? Clearcoat { get; init; }

  // PicoGK.Material.Iridescence (property)
  public MaterialIridescence? Iridescence { get; init; }

  // PicoGK.Material.Sheen (property)
  public MaterialSheen? Sheen { get; init; }

  // PicoGK.Material.Specular (property)
  public MaterialSpecular? Specular { get; init; }

  // PicoGK.Material.Transmission (property)
  public MaterialTransmission? Transmission { get; init; }

  // PicoGK.Material.Volume (property)
  public MaterialVolume? Volume { get; init; }

  // PicoGK.Material.Material (constructor)
  public Material()

// Category: CAD authoring
// Typed MaterialAlphaMode appearance
// PicoGK.MaterialAlphaMode (enum)
public enum MaterialAlphaMode

  // PicoGK.MaterialAlphaMode.Opaque (enumMember)
  Opaque

  // PicoGK.MaterialAlphaMode.Mask (enumMember)
  Mask

  // PicoGK.MaterialAlphaMode.Blend (enumMember)
  Blend

// Category: CAD authoring
// Typed MaterialAnisotropy appearance
// PicoGK.MaterialAnisotropy (class)
public sealed record MaterialAnisotropy

  // PicoGK.MaterialAnisotropy.Strength (property)
  public float Strength { get; init; }

  // PicoGK.MaterialAnisotropy.Rotation (property)
  public float Rotation { get; init; }

  // PicoGK.MaterialAnisotropy.Texture (property)
  public MaterialTexture? Texture { get; init; }

  // PicoGK.MaterialAnisotropy.MaterialAnisotropy (constructor)
  public MaterialAnisotropy()

// Category: CAD authoring
// Typed MaterialClearcoat appearance
// PicoGK.MaterialClearcoat (class)
public sealed record MaterialClearcoat

  // PicoGK.MaterialClearcoat.Factor (property)
  public float Factor { get; init; }

  // PicoGK.MaterialClearcoat.Roughness (property)
  public float Roughness { get; init; }

  // PicoGK.MaterialClearcoat.Texture (property)
  public MaterialTexture? Texture { get; init; }

  // PicoGK.MaterialClearcoat.RoughnessTexture (property)
  public MaterialTexture? RoughnessTexture { get; init; }

  // PicoGK.MaterialClearcoat.NormalTexture (property)
  public MaterialTexture? NormalTexture { get; init; }

  // PicoGK.MaterialClearcoat.NormalScale (property)
  public float NormalScale { get; init; } = 1;

  // PicoGK.MaterialClearcoat.MaterialClearcoat (constructor)
  public MaterialClearcoat()

// Category: CAD authoring
// Encoded image bytes
// Remarks: The record is a shallow descriptor: with copies retain the same mutable Data array. Typed group material assignment synchronously owns encoded bytes and validates the complete image. Omitted Format infers PNG, JPEG or WebP; an explicit format must match. Record equality is not image-content identity.
// PicoGK.MaterialImage (class)
public sealed record MaterialImage

  // PicoGK.MaterialImage.Data (property)
  public required byte[] Data { get; init; }

  // PicoGK.MaterialImage.Format (property)
  public MaterialImageFormat Format { get; init; } = MaterialImageFormat.Auto;

  // PicoGK.MaterialImage.Name (property)
  public string? Name { get; init; }

  // PicoGK.MaterialImage.MaterialImage (constructor)
  public MaterialImage()

// Category: CAD authoring
// Encoded image formats
// PicoGK.MaterialImageFormat (enum)
public enum MaterialImageFormat

  // PicoGK.MaterialImageFormat.Auto (enumMember)
  Auto = -1

  // PicoGK.MaterialImageFormat.Png (enumMember)
  Png = 0

  // PicoGK.MaterialImageFormat.Jpeg (enumMember)
  Jpeg = 1

  // PicoGK.MaterialImageFormat.WebP (enumMember)
  WebP = 2

// Category: CAD authoring
// Typed MaterialIridescence appearance
// PicoGK.MaterialIridescence (class)
public sealed record MaterialIridescence

  // PicoGK.MaterialIridescence.Factor (property)
  public float Factor { get; init; }

  // PicoGK.MaterialIridescence.Ior (property)
  public float Ior { get; init; } = 1.3f;

  // PicoGK.MaterialIridescence.ThicknessMinimum (property)
  public float ThicknessMinimum { get; init; } = 100;

  // PicoGK.MaterialIridescence.ThicknessMaximum (property)
  public float ThicknessMaximum { get; init; } = 400;

  // PicoGK.MaterialIridescence.Texture (property)
  public MaterialTexture? Texture { get; init; }

  // PicoGK.MaterialIridescence.ThicknessTexture (property)
  public MaterialTexture? ThicknessTexture { get; init; }

  // PicoGK.MaterialIridescence.MaterialIridescence (constructor)
  public MaterialIridescence()

// Category: CAD authoring
// Typed MaterialMagFilter appearance
// PicoGK.MaterialMagFilter (enum)
public enum MaterialMagFilter

  // PicoGK.MaterialMagFilter.Nearest (enumMember)
  Nearest = 9728

  // PicoGK.MaterialMagFilter.Linear (enumMember)
  Linear = 9729

// Category: CAD authoring
// Typed MaterialMinFilter appearance
// PicoGK.MaterialMinFilter (enum)
public enum MaterialMinFilter

  // PicoGK.MaterialMinFilter.Nearest (enumMember)
  Nearest = 9728

  // PicoGK.MaterialMinFilter.Linear (enumMember)
  Linear = 9729

  // PicoGK.MaterialMinFilter.NearestMipmapNearest (enumMember)
  NearestMipmapNearest = 9984

  // PicoGK.MaterialMinFilter.LinearMipmapNearest (enumMember)
  LinearMipmapNearest = 9985

  // PicoGK.MaterialMinFilter.NearestMipmapLinear (enumMember)
  NearestMipmapLinear = 9986

  // PicoGK.MaterialMinFilter.LinearMipmapLinear (enumMember)
  LinearMipmapLinear = 9987

// Category: CAD authoring
// Typed MaterialSampler appearance
// PicoGK.MaterialSampler (class)
public sealed record MaterialSampler

  // PicoGK.MaterialSampler.WrapS (property)
  public MaterialWrap WrapS { get; init; } = MaterialWrap.Repeat;

  // PicoGK.MaterialSampler.WrapT (property)
  public MaterialWrap WrapT { get; init; } = MaterialWrap.Repeat;

  // PicoGK.MaterialSampler.MagFilter (property)
  public MaterialMagFilter? MagFilter { get; init; }

  // PicoGK.MaterialSampler.MinFilter (property)
  public MaterialMinFilter? MinFilter { get; init; }

  // PicoGK.MaterialSampler.MaterialSampler (constructor)
  public MaterialSampler()

// Category: CAD authoring
// Typed MaterialSheen appearance
// PicoGK.MaterialSheen (class)
public sealed record MaterialSheen

  // PicoGK.MaterialSheen.Color (property)
  public ColorFloat Color { get; init; } = new("000000");

  // PicoGK.MaterialSheen.Roughness (property)
  public float Roughness { get; init; }

  // PicoGK.MaterialSheen.ColorTexture (property)
  public MaterialTexture? ColorTexture { get; init; }

  // PicoGK.MaterialSheen.RoughnessTexture (property)
  public MaterialTexture? RoughnessTexture { get; init; }

  // PicoGK.MaterialSheen.MaterialSheen (constructor)
  public MaterialSheen()

// Category: CAD authoring
// Typed MaterialSpecular appearance
// PicoGK.MaterialSpecular (class)
public sealed record MaterialSpecular

  // PicoGK.MaterialSpecular.Factor (property)
  public float Factor { get; init; } = 1;

  // PicoGK.MaterialSpecular.Color (property)
  public ColorFloat Color { get; init; } = new("FFFFFF");

  // PicoGK.MaterialSpecular.Texture (property)
  public MaterialTexture? Texture { get; init; }

  // PicoGK.MaterialSpecular.ColorTexture (property)
  public MaterialTexture? ColorTexture { get; init; }

  // PicoGK.MaterialSpecular.MaterialSpecular (constructor)
  public MaterialSpecular()

// Category: CAD authoring
// Typed MaterialTexture appearance
// PicoGK.MaterialTexture (class)
public sealed record MaterialTexture

  // PicoGK.MaterialTexture.Image (property)
  public required MaterialImage Image { get; init; }

  // PicoGK.MaterialTexture.Sampler (property)
  public MaterialSampler? Sampler { get; init; }

  // PicoGK.MaterialTexture.Transform (property)
  public MaterialTextureTransform? Transform { get; init; }

  // PicoGK.MaterialTexture.MaterialTexture (constructor)
  public MaterialTexture()

// Category: CAD authoring
// Typed MaterialTextureTransform appearance
// PicoGK.MaterialTextureTransform (class)
public sealed record MaterialTextureTransform

  // PicoGK.MaterialTextureTransform.Offset (property)
  public Vector2 Offset { get; init; }

  // PicoGK.MaterialTextureTransform.Scale (property)
  public Vector2 Scale { get; init; } = Vector2.One;

  // PicoGK.MaterialTextureTransform.Rotation (property)
  public float Rotation { get; init; }

  // PicoGK.MaterialTextureTransform.MaterialTextureTransform (constructor)
  public MaterialTextureTransform()

// Category: CAD authoring
// Typed MaterialTransmission appearance
// PicoGK.MaterialTransmission (class)
public sealed record MaterialTransmission

  // PicoGK.MaterialTransmission.Factor (property)
  public float Factor { get; init; }

  // PicoGK.MaterialTransmission.Texture (property)
  public MaterialTexture? Texture { get; init; }

  // PicoGK.MaterialTransmission.MaterialTransmission (constructor)
  public MaterialTransmission()

// Category: CAD authoring
// Typed MaterialVolume appearance
// PicoGK.MaterialVolume (class)
public sealed record MaterialVolume

  // PicoGK.MaterialVolume.Thickness (property)
  public float Thickness { get; init; }

  // PicoGK.MaterialVolume.AttenuationDistance (property)
  public float? AttenuationDistance { get; init; }

  // PicoGK.MaterialVolume.AttenuationColor (property)
  public ColorFloat AttenuationColor { get; init; } = new("FFFFFF");

  // PicoGK.MaterialVolume.ThicknessTexture (property)
  public MaterialTexture? ThicknessTexture { get; init; }

  // PicoGK.MaterialVolume.MaterialVolume (constructor)
  public MaterialVolume()

// Category: CAD authoring
// Typed MaterialWrap appearance
// PicoGK.MaterialWrap (enum)
public enum MaterialWrap

  // PicoGK.MaterialWrap.ClampToEdge (enumMember)
  ClampToEdge = 33071

  // PicoGK.MaterialWrap.MirroredRepeat (enumMember)
  MirroredRepeat = 33648

  // PicoGK.MaterialWrap.Repeat (enumMember)
  Repeat = 10497

// Category: CAD authoring
// A triangle mesh
// PicoGK.Mesh (class)
public partial class Mesh : IDisposable

  // PicoGK.Mesh.EStlUnit (enum)
  public enum EStlUnit

    // PicoGK.Mesh.EStlUnit.AUTO (enumMember)
    AUTO

    // PicoGK.Mesh.EStlUnit.MM (enumMember)
    MM

    // PicoGK.Mesh.EStlUnit.CM (enumMember)
    CM

    // PicoGK.Mesh.EStlUnit.M (enumMember)
    M

    // PicoGK.Mesh.EStlUnit.FT (enumMember)
    FT

    // PicoGK.Mesh.EStlUnit.IN (enumMember)
    IN

  // PicoGK.Mesh.m_strLoadHeaderData (field)
  public string m_strLoadHeaderData = "";

  // PicoGK.Mesh.m_eLoadUnits (field)
  public EStlUnit m_eLoadUnits = EStlUnit.AUTO;

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
  // PicoGK.Mesh.SaveToStlFile (method)
  public void SaveToStlFile(string strFilePath, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
  public void SaveToStlFile(FileStream oFile, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
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
  static public bool bPointLiesOnTriangle(Vector3 vecP, Vector3 vecA, Vector3 vecB, Vector3 vecC)
