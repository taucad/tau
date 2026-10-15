// Lane W9 oracle (native dependency charter, D35, I14): the headless half of "a created PicoGK project runs outside
// Tau". Upstream Library.Go always opens PicoGK's OpenGL viewer, which a CI runner cannot create, so the workflow
// swaps this entry in for the project's main.cs, keeps the project's own .csproj and packages.lock.json, and runs it:
// the locked NuGet PicoGK loads its native engine, voxelizes a sphere and exports an STL that the check asserts.
// Usage: dotnet run --no-restore -- <out.stl>
using System.Numerics;
using PicoGK;

const float radiusMm = 10f;
var stlPath = args.Length == 1 ? args[0] : throw new ArgumentException("Usage: dotnet run -- <out.stl>");

using var library = new Library(0.5f);
Library.RegisterGlobalLibrary(library);
var sphere = Voxels.voxSphere(Vector3.Zero, radiusMm);
sphere.CalculateProperties(out float volumeMm3, out BBox3 bounds);
var mesh = sphere.mshAsMesh();
mesh.SaveToStlFile(stlPath);
Library.UnregisterGlobalLibrary();

var expectedMm3 = 4f / 3f * MathF.PI * radiusMm * radiusMm * radiusMm;
var stlBytes = new FileInfo(stlPath).Length;
Console.WriteLine(
    $"PicoGK sphere r={radiusMm} mm: volume {volumeMm3:F1} mm3 (analytic {expectedMm3:F1}), bounds {bounds}, " +
    $"{mesh.nTriangleCount()} triangles, STL {stlBytes} B");
// Binary STL: an 80-byte header, a 4-byte count and 50 bytes per triangle.
var ok = MathF.Abs(volumeMm3 - expectedMm3) / expectedMm3 < 0.03f
    && mesh.nTriangleCount() > 0
    && stlBytes == 84 + 50L * mesh.nTriangleCount();
return ok ? 0 : 1;
