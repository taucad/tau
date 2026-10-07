---
name: cad-picogk
description: Guides PicoGK C# geometry, PBR materials, textures, named parts and mechanisms. Use for PicoGK modeling, appearance or moving-part requests in Tau Desktop.
---

# PicoGK C# authoring

## Contract

1. Author `main.cs` with local C# helpers/assets and public `PicoGK`; no Tau wrapper.
2. Create/publish geometry inside `Library.Go(voxelSizeMm, task)` using `Library.oViewer().Add(...)`.
3. The final viewer state is the model. `Remove`, `SetGroupVisible`, and `RemoveAllObjects` change it. Tau hosted Add owns a snapshot before returning; ordinary using statements may dispose temporary geometry. Add the same object again after a mutation to replace its published snapshot. Native Add captures geometry before return; its queue owns that data through processing/teardown.

## Canonical pattern

```csharp
using System.Numerics;
using PicoGK;

Library.Go(1.0f, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20.0f), "Hub");
});
```

Tau captures the final scene as mesh topology, not precise BRep. Smaller voxels raise memory and runtime cost sharply. Use project-relative assets.

## Materials

For PBR or textures, read `materials-reference.md`. Assign `PicoGK.Material` with `Viewer.SetGroupMaterial(groupId, material)`; the legacy overload remains valid. Appearance does not certify material grade.

## Part names and mechanisms

Use unique `Viewer.Add(geometry, name, nGroupID)` labels, indexed in loops. Groups control appearance/transforms; slash labels do not create assemblies. Unnamed parts get `Shape N`.

For motion, read `kinematics-reference.md`. Keep moving parts separate; call `Viewer.SetMechanism(source)` inside `Library.Go` with JSON-equivalent data using canonical keys or PascalCase structural properties and exact part names. Give each independent motion a clip. Use millimetre/Z-up; Tau converts metadata with the GLB. PicoGK `Animation` does not declare Tau motion.

Fix model-evaluation warnings. Verify named hover, clip direction/travel, followers and Reset; check changed parameters or filtered views. Use GeoSpec for clearance only with qualified evidence for the full requirement; unavailable evidence remains unsupported. Playback does not prove clearance.

## Interactive parameters

Optional `Params` property initializers are standalone defaults; Tau overrides selected values. Use `bool`, `int`, `float`, `double`, `string`, or local enums. Use `Range` and `Display` attributes. Defaults must be finite, non-null compile-time constants; avoid an explicit static constructor.

```csharp
using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
    Library.oViewer().Add(Voxels.voxSphere(System.Numerics.Vector3.Zero, 20f), "Hub"));

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;
}
```

## Wrong / Correct

- Wrong: `Voxels.voxBox(…)` or `Voxels.voxField(…)`; neither exists. Correct: a box is `new Voxels(Utils.mshCreateCube(new BBox3(min, max)))`; a field or SDF is an `IImplicit`/`IBoundedImplicit` passed to `new Voxels(implicit, bounds)`.
- Wrong: searching for a cylinder primitive; there is none. Correct: a cylinder is a flat-capped beam, `var lat = new Lattice(); lat.AddBeam(a, r, b, r, bRoundCap: false); var vox = new Voxels(lat);`, and a sphere is `Voxels.voxSphere(center, r)`.
- Wrong: geometry created outside `Library.Go`. Correct: build and `Add` inside the task lambda.

## Verify

Test with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.cs' })`; Tau captures mesh evidence.

## Runtime and reference

`runtime-reference.md` covers lifetimes, backends and errors. `api-index.md` covers PicoGK authoring and the selected .NET types; `embedding-api-index.md` covers host/native, diagnostics and subclasses.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### CAD authoring — PicoGK

```csharp
// The Library object encapsulates an instance of a PicoGK library configuration
public partial class Library : IDisposable
  // The Library implements the Dispose pattern, so you can use it with `using`
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)
  // Return the borrowed library for the current Go task
  public static Library oLibrary()
  // Return the borrowed viewer for the current Go task
  public static Viewer oViewer()
  // This is the one library function that you call to run your code it…
  public static void Go(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath = "", bool bEndAppWithTask = false, string strWindowTitle = "PicoGK", string strLightsFile = "")
  public static void Log(string strFormat, params object[] args)
  // … 34 more members in the API reference

public partial class Voxels : IFieldWithMetadata, IDisposable
  // Create a new empty voxels object, using the global library instance
  public Voxels()
  public Voxels(in IImplicit xImplicit, in BBox3 oBounds)
  public Voxels(in IBoundedImplicit xImplicit)
  public Voxels(Library libSet)
  public Voxels(in Voxels voxSource)
  public Voxels(in ScalarField oSource)
  public Voxels(Library libSet, in IImplicit xImplicit, in BBox3 oBounds)
  public Voxels(Library libSet, in IBoundedImplicit xImplicit)
  public Voxels(in Mesh msh)
  public Voxels(in Lattice lat)
  // Create a new Voxels object using the global library instance, rendering a sphere with…
  public static Voxels voxSphere(Vector3 vecCenter, float fRadius)
  public static Voxels voxSphere(Library libSet, Vector3 vecCenter, float fRadius)
  // Returns a lattice beam with hemispherical ends internally uses an optimized internal function, so…
  public static Voxels voxLatticeBeam(Vector3 vec1, float fRadius1, Vector3 vec2, float fRadius2)
  public static Voxels voxLatticeBeam(Library libSet, Vector3 vec1, float fRadius1, Vector3 vec2, float fRadius2)
  // Creates a shelled (hollow) Voxels object from a mesh
  public static Voxels voxMeshShell(Mesh msh, float fRadius)
  public static Voxels voxMeshShell(Library libSet, Mesh msh, float fRadius)
  // Return the current voxel field as a mesh
  public Mesh mshAsMesh()
  // Performs a boolean union between two voxel fields Our voxelfield will have all the…
  public void BoolAdd(in Voxels voxOperand)
  // Performs a boolean union operation on a copy of the current voxel field and…
  public Voxels voxBoolAdd(in Voxels voxOperand)
  // Combines two voxel fields and returns the result using BoolAdd
  public static Voxels voxCombine(in Voxels vox1, in Voxels vox2)
  // Performs a boolean difference between the two voxel fields Our voxel field's voxel will…
  public void BoolSubtract(in Voxels voxOperand)
  // Performs a boolean difference operation on a copy of the current voxel field and…
  public Voxels voxBoolSubtract(in Voxels voxOperand)
  // Performs a boolean intersection between two voxel fields
  public void BoolIntersect(in Voxels voxOperand)
  // Performs a boolean intersection operation on a copy of the current voxel field and…
  public Voxels voxBoolIntersect(in Voxels voxOperand)
  // Intersects the voxel field with the specified bounding box so all voxels outside the…
  public void Trim(BBox3 oBox)
  // Offsets the voxel field by the specified distance
  public void Offset(float fDistMM)
  // Offsets a copy of the voxel field by the specified distance
  public Voxels voxOffset(float fDistMM)
  // Creates a fillet-like effect
  public void Fillet(float fRoundingMM)
  // Renders a mesh into the voxel field, combining it with the existing content
  public void RenderMesh(in Mesh msh)
  // Render an implicit signed distance function into the voxels overwriting the existing content with…
  public void RenderImplicit(in IImplicit xImp, in BBox3 oBounds)
  // Render an implicit signed distance function into the voxels but using the existing voxels…
  public void IntersectImplicit(in IImplicit xImp)
  // Same as IntersectImplicit, but uses a copy of the current voxel field and returns…
  public Voxels voxIntersectImplicit(in IImplicit xImp)
  // This function evaluates the entire voxel field and returns the volume of all voxels…
  public void CalculateProperties(out float fVolumeCubicMM, out BBox3 oBBox)
  // Returns whether the location specified lies inside the solid domain of the voxel field…
  public bool bIsInside(Vector3 vecTestPoint)
  // … 48 more members in the API reference

public interface IFieldWithMetadata
  // Return metadata borrowed from this field owner
  public FieldMetadata oMetaData()

// Function signature for signed distance implicts
public interface IImplicit
  // Return the signed distance to the iso surface
  public abstract float fSignedDistance(in Vector3 vec)

// Interface for a bounded implicit function
public interface IBoundedImplicit : IImplicit
  // Access the bounding box of the implicit function
  BBox3 oBounds { get; }

// A triangle mesh
public partial class Mesh : IDisposable
  // Creates a new empty Mesh, using the global library instance
  public Mesh()
  public Mesh(Library libSet)
  public Mesh(in Voxels vox)
  // Create a transformed mesh by offsetting and scaling it
  public Mesh mshCreateTransformed(Vector3 vecScale, Vector3 vecOffset)
  public Mesh mshCreateTransformed(Matrix4x4 matTrans)
  // Add a new vertex to the mesh so that it can be used in…
  public int nAddVertex(in Vector3 vec)
  // Get the vertex at the specified index
  public Vector3 vecVertexAt(int nVertex)
  // Get the number of vertices in the mesh
  public int nVertexCount()
  // Add a triangle to the mesh with the specified vertex indices
  public int nAddTriangle(in Triangle t)
  public int nAddTriangle(int A, int B, int C)
  public int nAddTriangle(in Vector3 vecA, in Vector3 vecB, in Vector3 vecC)
  // Return number of triangles in the mesh
  public int nTriangleCount()
  // Adds a quad, defined by four corner vertices Helper function, which calls nAddTriangle in…
  public void AddQuad(int n0, int n1, int n2, int n3, bool bFlipped = false)
  public void AddQuad(in Vector3 vec0, in Vector3 vec1, in Vector3 vec2, in Vector3 vec3, bool bFlipped = false)
  // Get the triangle with the specified index
  public Triangle oTriangleAt(int nTriangle)
  // Get the triangle with the specified index
  public void GetTriangle(int nTriangle, out Vector3 vecA, out Vector3 vecB, out Vector3 vecC)
  // Append one mesh to another Note, no deduplication is done and no "boolean" The…
  public void Append(Mesh msh)
  // Saves a Mesh to STL file If eUnit is auto, then, if this mesh…
  public void SaveToStlFile(string strFilePath, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
  public void SaveToStlFile(FileStream oFile, EStlUnit eUnit = EStlUnit.AUTO, Vector3? vecOffsetMM = null, float fScale = 1.0f)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)
  // … 9 more members in the API reference

// A lattice of beams (and spheres)
public partial class Lattice : IDisposable
  // Creates a new empty Lattice, using the global library instance
  public Lattice()
  public Lattice(Library libSet)
  // Add a sphere to the lattice
  public void AddSphere(in Vector3 vecCenter, float fRadius)
  // Add a beam to the lattice
  public void AddBeam(in Vector3 vecA, float fRadA, in Vector3 vecB, float fRadB, bool bRoundCap = true)
  public void AddBeam(in Vector3 vecA, in Vector3 vecB, float fRadA, float fRadB, bool bRoundCap = true)
  public void Dispose()
  protected virtual void Dispose(bool bDisposing)

// PicoGK viewer
public partial class Viewer : IDisposable
  // Capture an application-defined mechanism on a hosted viewer
  public void SetMechanism(object source)
  // Add the object to the viewer, using the specified viewer group
  public void Add(in Voxels vox, string name, int nGroupID = 0)
  public void Add(in Voxels vox, int nGroupID = 0)
  public void Add(Mesh msh, string name, int nGroupID = 0)
  public void Add(Mesh msh, int nGroupID = 0)
  public void Add(PolyLine oPoly, string name, int nGroupID = 0)
  public void Add(PolyLine oPoly, int nGroupID = 0)
  // Assign a typed physical material to every object in the hosted group
  public void SetGroupMaterial(int groupId, Material material)
  public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  // Sets the background color of the viewer
  public void SetBackgroundColor(ColorFloat clr)
  // … 42 more members in the API reference

// 3D bounding box
[StructLayout(LayoutKind.Sequential, Pack = 1)]
  // Create an empty Bounding Box
  public BBox3()
  public BBox3(float fMinX, float fMinY, float fMinZ, float fMaxX, float fMaxY, float fMaxZ)
  public BBox3(in Vector3 vecSetMin, in Vector3 vecSetMax)
  // Include the specified vector in the Bounding Box
  public void Include(Vector3 vec)
  public void Include(BBox3 oBox)
  public void Include(BBox2 oBox, float fZ = 0.0f)
  // … 11 more members in the API reference

// Typed Material appearance
public sealed record Material
  public string? Name { get; init; }
  public ColorFloat Color { get; init; } = new("FFFFFF");
  public float Metallic { get; init; }
  public float Roughness { get; init; } = .35f;
  public MaterialVolume? Volume { get; init; }
  public Material()
  // … 21 more members in the API reference

// A floating point color value with R,G,B,A values
[StructLayout(LayoutKind.Sequential, Pack = 1)]
  // Blue value (1 is full color)
  public float B;
  // Alpha value (1 is opaque, 0 is transparent)
  public float A;
  // Create a color from a hex string #FF0000 is red, for example (# is…
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
  // Allows you to pass a hex string to any function that requires a FloatColor
  public static implicit operator ColorFloat(string hex)
  // … 7 more members in the API reference

public class AnimationQueue
  public AnimationQueue()
  public void Clear()
  public bool bPulse()
  public bool bIsIdle()
  public void Add(Animation oAnim)
```

### Advanced embedding/native — PicoGK

```csharp
// Backend for embedding PicoGK's concrete PicoGK.Viewer API without a native window
public interface IViewerBackend : IDisposable
  void SetBackgroundColor(ColorFloat color)
  void Add(Voxels vox, int nGroupID)
  void Add(Voxels vox, string name, int nGroupID)
  void Add(Mesh msh, int nGroupID)
  void Add(Mesh msh, string name, int nGroupID)
  void Add(PolyLine poly, int nGroupID)
  void Add(PolyLine poly, string name, int nGroupID)
  void SetMechanism(object source)
  void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness)
  void SetGroupMaterial(int groupId, Material material)
  BBox3 GetBoundingBox()
  // … 16 more members in the API reference

[StructLayout(LayoutKind.Sequential, Pack = 1)]
  public int A;
  public int B;
  public int C;
  public Triangle(int a, int b, int c)
  public Triangle()

public readonly record struct GpuTexHandle(IntPtr Value)
  public nint Value { get; init; }
  public GpuTexHandle(nint Value)
  public GpuTexHandle()
```

### Advanced embedding/native — PicoGK.Library

```csharp
// Create a new Library instance, using the specified voxel size in MM
public Library(float fVoxelSizeMM)

public static void RegisterGlobalLibrary(Library oLibrary)
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 1990 symbols by file.

- 14 reference files, named in `api-index.md`

Read ranges, not whole files. Never copy a reference into a source file.
