# PicoGK — Advanced embedding/native — PicoGK

18 top-level symbols. Signatures are verbatim csharp.

// Category: Advanced embedding/native
// PicoGK.Coord (struct)
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public partial struct Coord

  // PicoGK.Coord.X (field)
  public int X;

  // PicoGK.Coord.Y (field)
  public int Y;

  // PicoGK.Coord.Z (field)
  public int Z;

  // PicoGK.Coord.Coord (constructor)
  public Coord(int x, int y, int z)
  public Coord()

// Category: Advanced embedding/native
// PicoGK.GpuTexHandle (struct)
public readonly record struct GpuTexHandle(IntPtr Value)

  // PicoGK.GpuTexHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.GpuTexHandle.GpuTexHandle (constructor)
  public GpuTexHandle(nint Value)
  public GpuTexHandle()

// Category: Advanced embedding/native
// PicoGK.GuiSideBarHandle (struct)
public readonly record struct GuiSideBarHandle(IntPtr Value)

  // PicoGK.GuiSideBarHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.GuiSideBarHandle.GuiSideBarHandle (constructor)
  public GuiSideBarHandle(nint Value)
  public GuiSideBarHandle()

// Category: Advanced embedding/native
// Host for the process-global lifecycle established by PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
// PicoGK.ILibraryHost (interface)
public interface ILibraryHost

  // Log path used when callers keep PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String) 's default
  // PicoGK.ILibraryHost.DefaultLogFilePath (property)
  string DefaultLogFilePath { get; }

  // Run one PicoGK task with the arguments supplied to PicoGK.Library.Go(System.Single,System.Threading.ThreadStart,System.String,System.Boolean,System.String,System.String)
  // PicoGK.ILibraryHost.Run (method)
  void Run(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath, bool bEndAppWithTask, string strWindowTitle, string strLightsFile)

// Category: Advanced embedding/native
// Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native window
// PicoGK.IViewerBackend (interface)
public interface IViewerBackend : IDisposable

  // PicoGK.IViewerBackend.IsIdle (property)
  bool IsIdle { get; }

  // PicoGK.IViewerBackend.Orientation (property)
  Quaternion Orientation { get; set; }

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

// Category: Advanced embedding/native
// PicoGK.LatHandle (struct)
public readonly record struct LatHandle(long Value)

  // PicoGK.LatHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.LatHandle.LatHandle (constructor)
  public LatHandle(long Value)
  public LatHandle()

// Category: Advanced embedding/native
// PicoGK.LibHandle (struct)
public readonly record struct LibHandle(long Value)

  // PicoGK.LibHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.LibHandle.LibHandle (constructor)
  public LibHandle(long Value)
  public LibHandle()

// Category: Advanced embedding/native
// PicoGK.MshHandle (struct)
public readonly record struct MshHandle(long Value)

  // PicoGK.MshHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.MshHandle.MshHandle (constructor)
  public MshHandle(long Value)
  public MshHandle()

// Category: Advanced embedding/native
// PicoGK.PicoGKAllocException (class)
public class PicoGKAllocException : Exception

  // PicoGK.PicoGKAllocException.PicoGKAllocException (constructor)
  public PicoGKAllocException()
  public PicoGKAllocException(string? message)

// Category: Advanced embedding/native
// PicoGK.PicoGKLibraryMismatchException (class)
public class PicoGKLibraryMismatchException : Exception

  // PicoGK.PicoGKLibraryMismatchException.PicoGKLibraryMismatchException (constructor)
  public PicoGKLibraryMismatchException()
  public PicoGKLibraryMismatchException(string? message)

// Category: Advanced embedding/native
// PicoGK.PolyHandle (struct)
public readonly record struct PolyHandle(long Value)

  // PicoGK.PolyHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.PolyHandle.PolyHandle (constructor)
  public PolyHandle(long Value)
  public PolyHandle()

// Category: Advanced embedding/native
// PicoGK.QuadHandle (struct)
public readonly record struct QuadHandle(IntPtr Value)

  // PicoGK.QuadHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.QuadHandle.QuadHandle (constructor)
  public QuadHandle(nint Value)
  public QuadHandle()

// Category: Advanced embedding/native
// PicoGK.ScalarFieldHandle (struct)
public readonly record struct ScalarFieldHandle(IntPtr Value)

  // PicoGK.ScalarFieldHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.ScalarFieldHandle.ScalarFieldHandle (constructor)
  public ScalarFieldHandle(nint Value)
  public ScalarFieldHandle()

// Category: Advanced embedding/native
// PicoGK.Triangle (struct)
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public partial struct Triangle

  // PicoGK.Triangle.A (field)
  public int A;

  // PicoGK.Triangle.B (field)
  public int B;

  // PicoGK.Triangle.C (field)
  public int C;

  // PicoGK.Triangle.Triangle (constructor)
  public Triangle(int a, int b, int c)
  public Triangle()

// Category: Advanced embedding/native
// PicoGK.VdbHandle (struct)
public readonly record struct VdbHandle(long Value)

  // PicoGK.VdbHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.VdbHandle.VdbHandle (constructor)
  public VdbHandle(long Value)
  public VdbHandle()

// Category: Advanced embedding/native
// PicoGK.VdbMetaHandle (struct)
public readonly record struct VdbMetaHandle(IntPtr Value)

  // PicoGK.VdbMetaHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.VdbMetaHandle.VdbMetaHandle (constructor)
  public VdbMetaHandle(nint Value)
  public VdbMetaHandle()

// Category: Advanced embedding/native
// PicoGK.VectorFieldHandle (struct)
public readonly record struct VectorFieldHandle(IntPtr Value)

  // PicoGK.VectorFieldHandle.Value (property)
  public nint Value { get; init; }

  // PicoGK.VectorFieldHandle.VectorFieldHandle (constructor)
  public VectorFieldHandle(nint Value)
  public VectorFieldHandle()

// Category: Advanced embedding/native
// PicoGK.VoxHandle (struct)
public readonly record struct VoxHandle(long Value)

  // PicoGK.VoxHandle.Value (property)
  public long Value { get; init; }

  // PicoGK.VoxHandle.VoxHandle (constructor)
  public VoxHandle(long Value)
  public VoxHandle()
