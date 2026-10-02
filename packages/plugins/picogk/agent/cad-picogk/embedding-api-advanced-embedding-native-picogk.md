# PicoGK — Advanced embedding/native — PicoGK

18 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public partial struct Coord

  public int X;

  public int Y;

  public int Z;

  public Coord(int x, int y, int z)
  public Coord()

// Category: Advanced embedding/native
public readonly record struct GpuTexHandle(IntPtr Value)

  public nint Value { get; init; }

  public GpuTexHandle(nint Value)
  public GpuTexHandle()

// Category: Advanced embedding/native
public readonly record struct GuiSideBarHandle(IntPtr Value)

  public nint Value { get; init; }

  public GuiSideBarHandle(nint Value)
  public GuiSideBarHandle()

// Category: Advanced embedding/native
// Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
public interface ILibraryHost

  // Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  string DefaultLogFilePath { get; }

  // Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  void Run(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath, bool bEndAppWithTask, string strWindowTitle, string strLightsFile)

// Category: Advanced embedding/native
// Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native window
public interface IViewerBackend : IDisposable

  bool IsIdle { get; }

  Quaternion Orientation { get; set; }

  bool Poll()

  void RequestUpdate()

  void LoadLightSetup(byte[] abyDiffuseDds, byte[] abySpecularDds)

  void SetBackgroundColor(ColorFloat color)

  void SetFieldOfView(float radians)

  void ZoomToFit()

  void Add(Voxels vox, int nGroupID)
  void Add(Voxels vox, string name, int nGroupID)
  void Add(Mesh msh, int nGroupID)
  void Add(Mesh msh, string name, int nGroupID)
  void Add(PolyLine poly, int nGroupID)
  void Add(PolyLine poly, string name, int nGroupID)

  void Remove(Voxels vox)
  void Remove(Mesh msh)
  void Remove(PolyLine poly)

  void SetObjectMatrix(Voxels vox, Matrix4x4 mat)
  void SetObjectMatrix(Mesh msh, Matrix4x4 mat)
  void SetObjectMatrix(PolyLine poly, Matrix4x4 mat)

  void RemoveAllObjects()

  void SetMechanism(object source)

  void RequestScreenShot(string strScreenShotPath)

  void EnableExperimental(bool bEnable)

  void SetGroupVisible(int nGroupID, bool bVisible)

  void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  void SetGroupMaterial(int groupId, Material material)

  void SetGroupMatrix(int nGroupID, Matrix4x4 mat)

  void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError)

  void DisableOverhangWarning(int nGroupID)

  BBox3 GetBoundingBox()

// Category: Advanced embedding/native
public readonly record struct LatHandle(long Value)

  public long Value { get; init; }

  public LatHandle(long Value)
  public LatHandle()

// Category: Advanced embedding/native
public readonly record struct LibHandle(long Value)

  public long Value { get; init; }

  public LibHandle(long Value)
  public LibHandle()

// Category: Advanced embedding/native
public readonly record struct MshHandle(long Value)

  public long Value { get; init; }

  public MshHandle(long Value)
  public MshHandle()

// Category: Advanced embedding/native
public class PicoGKAllocException : Exception

  public PicoGKAllocException()
  public PicoGKAllocException(string? message)

// Category: Advanced embedding/native
public class PicoGKLibraryMismatchException : Exception

  public PicoGKLibraryMismatchException()
  public PicoGKLibraryMismatchException(string? message)

// Category: Advanced embedding/native
public readonly record struct PolyHandle(long Value)

  public long Value { get; init; }

  public PolyHandle(long Value)
  public PolyHandle()

// Category: Advanced embedding/native
public readonly record struct QuadHandle(IntPtr Value)

  public nint Value { get; init; }

  public QuadHandle(nint Value)
  public QuadHandle()

// Category: Advanced embedding/native
public readonly record struct ScalarFieldHandle(IntPtr Value)

  public nint Value { get; init; }

  public ScalarFieldHandle(nint Value)
  public ScalarFieldHandle()

// Category: Advanced embedding/native
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public partial struct Triangle

  public int A;

  public int B;

  public int C;

  public Triangle(int a, int b, int c)
  public Triangle()

// Category: Advanced embedding/native
public readonly record struct VdbHandle(long Value)

  public long Value { get; init; }

  public VdbHandle(long Value)
  public VdbHandle()

// Category: Advanced embedding/native
public readonly record struct VdbMetaHandle(IntPtr Value)

  public nint Value { get; init; }

  public VdbMetaHandle(nint Value)
  public VdbMetaHandle()

// Category: Advanced embedding/native
public readonly record struct VectorFieldHandle(IntPtr Value)

  public nint Value { get; init; }

  public VectorFieldHandle(nint Value)
  public VectorFieldHandle()

// Category: Advanced embedding/native
public readonly record struct VoxHandle(long Value)

  public long Value { get; init; }

  public VoxHandle(long Value)
  public VoxHandle()
