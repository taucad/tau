using System.Buffers.Binary;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PicoGK;
using PicoGK.Numerics;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed class WorkerTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"tau-picogk-csharp-{Guid.NewGuid():N}");

    public WorkerTests() => Directory.CreateDirectory(root);

    public void Dispose() => Directory.Delete(root, recursive: true);

    [Fact]
    public void ManagedHeapMetricExcludesAllocationsSinceLastCollection()
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        Assert.True(GC.TryStartNoGCRegion(16 * 1024 * 1024));
        long before;
        long after;
        long expected;
        try
        {
            var collection = GC.GetGCMemoryInfo();
            expected = collection.HeapSizeBytes - collection.FragmentedBytes;
            before = Program.ManagedHeapBytesAfterCollection();
            var pendingOutput = new byte[1024 * 1024];
            after = Program.ManagedHeapBytesAfterCollection();
            GC.KeepAlive(pendingOutput);
        }
        finally
        {
            GC.EndNoGCRegion();
        }
        Assert.Equal(before, after);
        Assert.Equal(expected, after);
    }

    [Fact]
    public void CompilationAcceptsStandardConsoleFormsAndCachesDeterministically()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
await Task.Yield();
Library.Go(1f, () => Library.oViewer().Add(Utils.mshCreateCube(new Vector3(3, 4, 5))));
""");
        Write("Helper.cs", "public static class Helper { public const int Value = 3; }");

        var first = CompilationService.Compile(root);
        var second = CompilationService.Compile(root);

        Assert.False(first.Timings.CacheHit);
        Assert.True(second.Timings.CacheHit);
        Assert.All(new[] { first.Timings.SourceRead, first.Timings.Parse, first.Timings.Analyze, first.Timings.Emit }, value => Assert.True(value >= 0));
        Assert.Equal(first.Assembly, second.Assembly);
        Assert.Equal(first.Pdb, second.Pdb);
        Assert.Empty(first.Defaults);
        Assert.Equal("object", first.JsonSchema["type"]);

        Write("Helper.cs", "public static class Helper { public const int Value = 4; }");
        Assert.False(CompilationService.Compile(root).Timings.CacheHit);
    }

    [Fact]
    public void CompilationExtractsAndBindsOptionalStaticParameters()
    {
        Write("main.cs", """
using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () => { });

public enum Finish { Matte, Glossy }

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;

    [Range(1, 100)]
    [Display(Name = "Radius", Order = 1)]
    public static int RadiusMm { get; set; } = 20;

    public static bool Enabled { get; set; } = true;
    public static string Color { get; set; } = "4f7dd9";
    public static Finish Finish { get; set; } = Finish.Matte;
    public static double Tolerance { get; set; } = 0.01;
}
""");

        var compiled = CompilationService.Compile(root);

        Assert.Equal(0.5f, Assert.IsType<float>(compiled.Defaults["VoxelSizeMm"]));
        Assert.Equal(20, Assert.IsType<int>(compiled.Defaults["RadiusMm"]));
        Assert.True(Assert.IsType<bool>(compiled.Defaults["Enabled"]));
        Assert.Equal("4f7dd9", compiled.Defaults["Color"]);
        Assert.Equal("Matte", compiled.Defaults["Finish"]);
        Assert.Equal(0.01d, compiled.Defaults["Tolerance"]);
        var properties = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(compiled.JsonSchema["properties"]);
        Assert.Equal(["VoxelSizeMm", "RadiusMm", "Color", "Enabled", "Finish", "Tolerance"], properties.Keys);
        var voxel = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(properties["VoxelSizeMm"]);
        Assert.Equal("number", voxel["type"]);
        Assert.Equal(0.05d, voxel["minimum"]);
        Assert.Equal(5d, voxel["maximum"]);
        Assert.Equal("Voxel size", voxel["title"]);
        Assert.Equal("OpenVDB voxel size in millimetres", voxel["description"]);
        var finish = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(properties["Finish"]);
        Assert.Equal(new[] { "Matte", "Glossy" }, Assert.IsAssignableFrom<IReadOnlyList<string>>(finish["enum"]));

        var values = CompilationService.BindParameters(compiled, Json("""{"VoxelSizeMm":1.25,"RadiusMm":30,"Enabled":false,"Color":"ff0000","Finish":"Glossy","Tolerance":0.02}"""));
        Assert.Equal(1.25f, values["VoxelSizeMm"]);
        Assert.Equal(30, values["RadiusMm"]);
        Assert.Equal(false, values["Enabled"]);
        Assert.Equal("ff0000", values["Color"]);
        Assert.Equal("Glossy", values["Finish"]);
        Assert.Equal(0.02d, values["Tolerance"]);

        foreach (var supplied in new[]
        {
            "[]",
            "{\"Unknown\":1}",
            "{\"RadiusMm\":0}",
            "{\"RadiusMm\":101}",
            "{\"RadiusMm\":1.5}",
            "{\"Enabled\":1}",
            "{\"VoxelSizeMm\":\"large\"}",
            "{\"Tolerance\":\"small\"}",
            "{\"Tolerance\":1e400}",
            "{\"Color\":1}",
            "{\"Finish\":\"Polished\"}",
            "{\"Finish\":1}",
        })
        {
            Assert.Equal("CS_TAU_PARAMETERS", Assert.Throws<WorkerException>(() =>
                CompilationService.BindParameters(compiled, Json(supplied))).Issues[0].Code);
        }
    }

    [Fact]
    public void ModelRunnerAppliesSelectedParametersBeforeTheStandardEntryPoint()
    {
        Write("main.cs", """
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
{
    var height = Params.Finish == Finish.Glossy ? 7f : 2f;
    var size = Params.Enabled ? new Vector3(Params.WidthMm, 4f, height) : Vector3.One;
    Library.oViewer().SetGroupMaterial(0, Params.Color, 0f, 0.7f);
    Library.oViewer().Add(Utils.mshCreateCube(size));
});

public enum Finish { Matte, Glossy }
public static class Params
{
    [Range(0.05, 5.0)] public static float VoxelSizeMm { get; set; } = 1f;
    [Range(1, 20)] public static int WidthMm { get; set; } = 3;
    public static bool Enabled { get; set; } = true;
    public static string Color { get; set; } = "4f7dd9";
    public static Finish Finish { get; set; } = Finish.Matte;
}
""");

        var result = ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "parameter-artifacts"),
            Json("""{"VoxelSizeMm":0.5,"WidthMm":9,"Color":"ff0000","Finish":"Glossy"}"""));

        var component = Assert.Single(result.Components);
        Assert.Equal([1f, 0f, 0f, 1f], component.Color);
        Assert.InRange(AxisExtent(component.Positions, 0), 8.99f, 9.01f);
        Assert.InRange(AxisExtent(component.Positions, 1), 3.99f, 4.01f);
        Assert.InRange(AxisExtent(component.Positions, 2), 6.99f, 7.01f);
    }

    [Fact]
    public void ARepeatedBuildOfOneCompilationReusesTheLoadedAssembly()
    {
        Write("main.cs", """
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Edits.Count++;
Library.Go(1f, () =>
{
    Library.oViewer().Add(Utils.mshCreateCube(new Vector3(Edits.Count, Params.WidthMm, 2f)));
});

public static class Edits { public static int Count; }
public static class Params
{
    [Range(1, 20)] public static int WidthMm { get; set; } = 3;
}
""");
        var compiled = CompilationService.Compile(root);

        var first = ModelRunner.Execute(compiled, Path.Combine(root, "retain-artifacts"), Json("""{"WidthMm":4}"""));
        var second = ModelRunner.Execute(compiled, Path.Combine(root, "retain-artifacts"), Json("""{"WidthMm":5}"""));

        // D25: a parameter edit reloads nothing, so the model's own static counts up across the two
        // builds, while its declared parameter is rebound from the request every time.
        Assert.InRange(AxisExtent(Assert.Single(first.Components).Positions, 0), 0.99f, 1.01f);
        Assert.InRange(AxisExtent(Assert.Single(first.Components).Positions, 1), 3.99f, 4.01f);
        Assert.InRange(AxisExtent(Assert.Single(second.Components).Positions, 0), 1.99f, 2.01f);
        Assert.InRange(AxisExtent(Assert.Single(second.Components).Positions, 1), 4.99f, 5.01f);
        Assert.False(second.RecycleAfterResponse);
    }

    [Fact]
    public void InvalidOptInParameterContractsFailAtTheirSource()
    {
        foreach (var (property, expected) in new[]
        {
            ("public static decimal Value { get; set; } = 1m;", "unsupported type"),
            ("public static int Value => 1;", "auto-property"),
            ("public static int Value { get; } = 1;", "readable and writable auto-property"),
            ("public static int Value { set { } }", "auto-property"),
            ("public static int Value { private get; set; } = 1;", "readable and writable"),
            ("public static int Value { get; set; }", "compile-time constant"),
            ("public static int Value { get => 1; set { } }", "auto-property"),
            ("public static int Value { get => 1; set => _ = value; }", "auto-property"),
            ("public static int Value { get; private set; } = 1;", "readable and writable"),
            ("public static int Value { get; set; } = int.Parse(\"1\");", "compile-time constant"),
            ("[Range(2, 1)] public static int Value { get; set; } = 1;", "Range"),
            ("[Range(double.NaN, 1)] public static double Value { get; set; } = 1;", "Range"),
            ("[Range(0, double.PositiveInfinity)] public static double Value { get; set; } = 1;", "Range"),
            ("[Range(typeof(int), \"1\", \"3\")] public static int Value { get; set; } = 1;", "Range"),
            ("[Range(2, 3)] public static int Value { get; set; } = 1;", "violates"),
            ("[Range(1, 2)] public static int Value { get; set; } = 3;", "violates"),
            ("public static float Value { get; set; } = float.NaN;", "violates"),
            ("[Range(1, 3)] public static string Value { get; set; } = \"one\";", "numeric"),
            ("public static DayOfWeek Value { get; set; } = DayOfWeek.Monday;", "unsupported type"),
            ("public static Finish Value { get; set; } = (Finish)9; } public enum Finish { Matte, Glossy", "declared enum member"),
            ("public static string Value { get; set; } = null;", "non-null"),
        })
        {
            Write("main.cs", $$"""
using System.ComponentModel.DataAnnotations;
System.Console.WriteLine(0);
public static class Params { {{property}} }
""");
            var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));
            Assert.Equal("CS_TAU_PARAMETERS", error.Issues[0].Code);
            Assert.Contains(expected, error.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal("main.cs", error.Issues[0].Location?.FileName);
        }

        foreach (var source in new[]
        {
            "System.Console.WriteLine(ExistingApp.Params.Value); namespace ExistingApp { public static class Params { public static int Value => 1; } }",
            "System.Console.WriteLine(Params.Value); public class Params { public static int Value => 1; }",
            "System.Console.WriteLine(Params.Value); internal static class Params { public static int Value => 1; }",
            "System.Console.WriteLine(Params.Value); public static class Params { public static int Value { get; set; } = 1; private static int Hidden { get; set; } = 2; }",
        })
        {
            Write("main.cs", source);
            var defaults = CompilationService.Compile(root).Defaults;
            if (source.Contains("private static", StringComparison.Ordinal))
            {
                Assert.Equal(new[] { "Value" }, defaults.Keys);
            }
            else
            {
                Assert.Empty(defaults);
            }
        }

        Write("main.cs", "System.Console.WriteLine(Params.Value); public static class Params { static Params() { } public static int Value { get; set; } = 1; }");
        var constructorError = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));
        Assert.Equal("CS_TAU_PARAMETERS", constructorError.Issues[0].Code);
        Assert.Contains("static constructor", constructorError.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CompilationReportsActualBoundedSourceDiagnostics()
    {
        Write("main.cs", string.Join(Environment.NewLine, Enumerable.Range(0, 257).Select(index => $"Missing{index} value{index};")));

        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));

        Assert.Equal(256, error.Issues.Count);
        Assert.All(error.Issues, issue => Assert.StartsWith("CS", issue.Code, StringComparison.Ordinal));
        Assert.DoesNotContain(error.Issues, issue => issue.Code == "CS_TAU_COMPILATION");
        Assert.Equal("main.cs", error.Issues[0].Location?.FileName);
        Assert.True(error.Issues[0].Location?.StartLineNumber > 0);

        Write("main.cs", "public static class Broken {");
        error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));
        Assert.Equal("CS1513", error.Issues[0].Code);
    }

    [Fact]
    public void CompilationEnforcesProjectAndSyntaxLimits()
    {
        Assert.Contains("no C#", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);
        for (var index = 0; index < 257; index++)
        {
            Write($"{index}.cs", $"public static class C{index} {{ }}");
        }
        Assert.Contains("256", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);

        Directory.Delete(root, recursive: true);
        Directory.CreateDirectory(root);
        Write("main.cs", new string(' ', 1024 * 1024 + 1));
        Assert.Contains("byte limit", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);

        Write("main.cs", string.Concat(Enumerable.Repeat("(", 520)) + "1" + string.Concat(Enumerable.Repeat(")", 520)) + ";");
        Assert.Contains("depth", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message, StringComparison.OrdinalIgnoreCase);
        Assert.Throws<InvalidOperationException>(() => CompilationService.CreateReferences(null));
    }

    [Fact]
    public void PinnedShapeKernelAndHeatXCorpusIsLicensedByteExactAndCompiles()
    {
        var fixture = Environment.GetEnvironmentVariable("TAU_PICOGK_COMPATIBILITY_FIXTURE");
        Assert.True(Directory.Exists(fixture));
        using var provenance = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(fixture!, "PROVENANCE.json")));
        var sourceCount = 0;
        foreach (var source in provenance.RootElement.GetProperty("sources").EnumerateArray())
        {
            Assert.Equal("Apache-2.0", source.GetProperty("license").GetString());
            Assert.True(File.Exists(Path.Combine(fixture, source.GetProperty("licenseFile").GetString()!)));
            var sourceRoot = Path.Combine(fixture, source.GetProperty("sourceRoot").GetString()!);
            foreach (var file in source.GetProperty("files").EnumerateArray())
            {
                var path = Path.Combine(sourceRoot, file.GetProperty("path").GetString()!);
                Assert.Equal(
                    file.GetProperty("sha256").GetString(),
                    Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant());
                sourceCount++;
            }
        }
        Assert.Equal(63, sourceCount);

        var compiled = CompilationService.Compile(fixture);

        Assert.NotEmpty(compiled.Assembly);
        Assert.Empty(compiled.Defaults);
    }

    [Fact]
    public void PinnedOfficialPicoGkExamplesRunWithoutSourceChanges()
    {
        var fixture = Environment.GetEnvironmentVariable("TAU_PICOGK_OFFICIAL_EXAMPLES_FIXTURE");
        Assert.True(Directory.Exists(fixture));
        using var provenance = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(fixture!, "PROVENANCE.json")));
        Assert.Equal("CC0-1.0", provenance.RootElement.GetProperty("license").GetString());
        foreach (var file in provenance.RootElement.GetProperty("files").EnumerateArray())
        {
            var path = Path.Combine(fixture, file.GetProperty("path").GetString()!);
            Assert.Equal(
                file.GetProperty("sha256").GetString(),
                Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant());
        }

        var result = ModelRunner.Execute(CompilationService.Compile(fixture), Path.Combine(root, "official-artifacts"));

        Assert.Equal(6, result.Components.Count);
        Assert.All(result.Components, component => Assert.Equal("triangles", component.Kind));
    }

    [Fact]
    public void PinnedRoverWheelCorpusIsLicensedAndByteExact()
    {
        var fixture = Environment.GetEnvironmentVariable("TAU_PICOGK_ROVER_FIXTURE");
        Assert.True(Directory.Exists(fixture));
        using var provenance = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(fixture!, "PROVENANCE.json")));
        Assert.Equal("Apache-2.0", provenance.RootElement.GetProperty("license").GetString());
        Assert.True(File.Exists(Path.Combine(fixture, provenance.RootElement.GetProperty("licenseFile").GetString()!)));
        var files = provenance.RootElement.GetProperty("files").EnumerateArray().ToArray();
        Assert.Equal(18, files.Length);
        foreach (var file in files)
        {
            var path = Path.Combine(fixture, file.GetProperty("path").GetString()!);
            Assert.Equal(
                file.GetProperty("sha256").GetString(),
                Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))).ToLowerInvariant());
        }
    }

    [Fact]
    public void ModelRunnerExecutesStandardPicoGkAndCapturesFinalViewerScene()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;

Library.Go(2f, () =>
{
    var discarded = Utils.mshCreateCube(new Vector3(1, 1, 1));
    Library.oViewer().Add(discarded, 9);
    Library.oViewer().RemoveAllObjects();

    var box = Utils.mshCreateCube(new Vector3(3, 4, 5));
    Library.oViewer().SetGroupMaterial(2, new ColorFloat("11223380"), 0.25f, 0.75f);
    Library.oViewer().SetGroupMatrix(2, Matrix4x4.CreateTranslation(10, 0, 0));
    Library.oViewer().Add(box, 2);

    var hidden = Voxels.voxSphere(Vector3.Zero, 3);
    Library.oViewer().Add(hidden, 3);
    Library.oViewer().SetGroupVisible(3, false);

    var line = new PolyLine("abcdef");
    line.Add([Vector3.Zero, Vector3.UnitZ, new Vector3(0, 0, 2)]);
    Library.oViewer().Add(line, 4);
    Library.oViewer().SetObjectMatrix(line, Matrix4x4.CreateTranslation(0, 5, 0));
    Library.oViewer().RequestScreenShot(Path.Combine(Library.strLogFolder, "preview.tga"));
});
""");

        var result = ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"));

        Assert.False(result.RecycleAfterResponse);
        Assert.True(result.PicoGkNativeBytes > 0);
        Assert.Equal(new[] { "triangles", "lines" }, result.Components.Select(component => component.Kind));
        var mesh = result.Components[0];
        Assert.Equal([0x11 / 255f, 0x22 / 255f, 0x33 / 255f, 0x80 / 255f], mesh.Color);
        Assert.Equal(0.25f, mesh.Metallic);
        Assert.Equal(0.75f, mesh.Roughness);
        Assert.True(mesh.Positions.Max() >= 10);
        Assert.Equal(mesh.Positions.Length, mesh.Normals.Length);
        Assert.NotEmpty(mesh.Indices);
        var line = result.Components[1];
        Assert.Empty(line.Normals);
        Assert.Equal(new uint[] { 0, 1, 1, 2 }, line.Indices);
        Assert.Contains(5f, line.Positions);
        Assert.All(new[]
        {
            result.Timings.EntryPointInvoke,
            result.Timings.LibraryInitialize,
            result.Timings.MeshConstruction,
            result.Timings.MeshExtraction,
            result.Timings.NormalGeneration,
            result.Timings.Unload,
        }, value => Assert.True(value >= 0));
    }

    [Fact]
    public void ModelRunnerCapturesVoxelsAndPreservesUserFailures()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
Library.Go(2f, () => Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 3)));
""");
        var result = ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"));
        Assert.Single(result.Components);
        Assert.NotEmpty(result.Components[0].Positions);
        Assert.True(result.Timings.MeshConstruction >= 0);

        Write("main.cs", "throw new InvalidOperationException(\"model exploded\");");
        Assert.Contains("model exploded", Assert.Throws<InvalidOperationException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"))).Message);

        Write("main.cs", "System.Console.WriteLine(\"no scene\");");
        Assert.Equal("CS_TAU_NO_SCENE", Assert.Throws<WorkerException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"))).Issues[0].Code);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => { });");
        Assert.Equal("CS_TAU_EMPTY_SCENE", Assert.Throws<WorkerException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"))).Issues[0].Code);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => throw new InvalidOperationException(\"task exploded\"));");
        Assert.Contains("task exploded", Assert.Throws<InvalidOperationException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"))).Message);
    }

    [Fact]
    public void CaptureBackendSupportsViewerStateAndDisposalBoundaries()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var artifactRoot = Path.Combine(root, "backend-artifacts");
            var backend = new CaptureViewerBackend(artifactRoot);
            Assert.True(backend.IsIdle);
            Assert.False(backend.Poll());
            backend.RequestUpdate();
            AssertUnsupported(() => backend.LoadLightSetup([], []));
            AssertUnsupported(() => backend.EnableExperimental(true));
            AssertUnsupported(() => backend.EnableOverhangWarning(0, Overhang.uFromDeg(30), Overhang.uFromDeg(45)));
            AssertUnsupported(() => backend.DisableOverhangWarning(0));
            AssertUnsupported(backend.ZoomToFit);
            AssertUnsupported(() => _ = backend.Orientation);
            AssertUnsupported(() => backend.Orientation = Quaternion.Identity);
            Assert.Equal("CS_TAU_VIEWER_PRESENTATION", Assert.Throws<WorkerException>(() => backend.SetFieldOfView(0)).Issues[0].Code);
            Assert.Equal("CS_TAU_VIEWER_PRESENTATION", Assert.Throws<WorkerException>(() => backend.SetFieldOfView(float.NaN)).Issues[0].Code);
            Assert.Equal("CS_TAU_VIEWER_PRESENTATION", Assert.Throws<WorkerException>(() => backend.SetFieldOfView(7)).Issues[0].Code);
            backend.RequestScreenShot(Path.Combine(artifactRoot, "ignored.tga"));

            using var mesh = Utils.mshCreateCube(new Vector3(2, 4, 6));
            backend.SetObjectMatrix(mesh, Matrix4x4.CreateTranslation(1, 2, 3));
            backend.Add(mesh, 0);
            using var voxels = Voxels.voxSphere(Vector3.Zero, 2);
            backend.SetObjectMatrix(voxels, Matrix4x4.Identity);
            backend.Add(voxels, 1);
            var emptyLine = new PolyLine("ffffff");
            backend.Add(emptyLine, 2);
            var line = new PolyLine("00ff00");
            line.Add([Vector3.Zero, Vector3.One]);
            backend.Add(line, 3);
            backend.SetObjectMatrix(line, Matrix4x4.Identity);
            var bounds = backend.GetBoundingBox();
            Assert.False(bounds.bIsEmpty());
            Assert.True(bounds.vecMin.X >= -2);
            var captured = backend.Extract();
            Assert.Equal(3, captured.Components.Count);
            Assert.Equal("group-0-object-1", captured.Components[0].Name);
            backend.Remove(voxels);
            backend.Remove(voxels);
            backend.Remove(line);
            backend.SetGroupVisible(0, false);
            Assert.True(backend.GetBoundingBox().bIsEmpty());
            backend.SetGroupVisible(0, true);
            backend.Remove(mesh);
            Assert.True(backend.GetBoundingBox().bIsEmpty());
            backend.RemoveAllObjects();
            backend.Dispose();
            backend.Dispose();
            Assert.Throws<ObjectDisposedException>(() => backend.Add(mesh, 0));
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void CaptureBackendMatchesNativeIdentityOrderingAndSnapshotsGeometryAtAddApplication()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var backend = new CaptureViewerBackend(Path.Combine(root, "parity-artifacts"));
            using var first = Utils.mshCreateCube(new Vector3(2, 2, 2));
            using var second = Utils.mshCreateCube(new Vector3(1, 1, 1));

            backend.SetObjectMatrix(first, Matrix4x4.CreateTranslation(100, 0, 0));
            backend.Add(first, 1);
            backend.Add(second, 2);
            backend.Add(first, 3);
            var duplicate = backend.Extract();

            Assert.Equal(2, duplicate.Components.Count);
            Assert.Equal("group-2-object-2", duplicate.Components[0].Name);
            Assert.Equal("component:picogk-2", duplicate.Components[0].Id);
            Assert.Equal("group-3-object-1", duplicate.Components[1].Name);
            Assert.Equal("component:picogk-1", duplicate.Components[1].Id);
            Assert.True(duplicate.Components[1].Positions.Max() < 100);

            var line = new PolyLine("ffffff");
            line.Add([Vector3.Zero, Vector3.One]);
            backend.Add(line, 4);
            Assert.Equal(6, backend.Extract().Components[2].Positions.Length);
            line.nAddVertex(new Vector3(2, 2, 2));
            Assert.Equal(6, backend.Extract().Components[2].Positions.Length);

            backend.SetObjectMatrix(first, Matrix4x4.CreateTranslation(10, 0, 0));
            var transformed = backend.Extract();
            Assert.True(transformed.Components[1].Positions.Max() >= 10);
            backend.Dispose();
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void HostedViewerAppliesFiniteGroupAnimationBeforeTheFinalScene()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    viewer.Add(Utils.mshCreateCube(new Vector3(2, 6, 4)), 7);
    viewer.AddAnimation(new Animation(
        new Viewer.AnimGroupMatrixRotate(viewer, 7, Matrix4x4.Identity, Vector3.UnitZ, 90f),
        0.04f,
        Animation.EType.Once,
        Easing.EEasing.LINEAR));
    System.Threading.Thread.Sleep(90);
});
""");
        var result = ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "animation-artifacts"));

        Assert.True(AxisExtent(result.Components[0].Positions, 0) > 5f);
        Assert.True(AxisExtent(result.Components[0].Positions, 1) < 3f);
    }

    [Fact]
    public void HostedViewerAcceptsPresentationCallsAndRejectsUnavailableEnvironment()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    Library.oViewer().SetBackgroundColor(new ColorFloat(0.1f, 0.2f, 0.3f, 0.4f));
    Library.oViewer().SetFov(float.Pi / 3f);
    Library.oViewer().Add(Utils.mshCreateCube(Vector3.One));
});
""");
        var accepted = ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "presentation-artifacts"));
        Assert.Single(accepted.Components);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => { }, strLightsFile: \"environment.zip\");");
        var unsupported = Assert.Throws<WorkerException>(() => ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "environment-artifacts")));
        Assert.Equal("CS_TAU_VIEWER_CAPABILITY", unsupported.Issues[0].Code);
    }

    [Fact]
    public void NormalsAndMixedArtifactLayoutAreDeterministic()
    {
        var positions = new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5 };
        var normals = ModelRunner.VertexNormals(positions, [0, 1, 2]);
        Assert.Equal(new float[] { 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 }, normals);
        var components = new[]
        {
            new ExtractedComponent("component:picogk-1", "triangles", "triangle", [1, 0, 0, 1], 0.2f, 0.8f, positions[..9], normals[..9], [0, 1, 2]),
            new ExtractedComponent("component:picogk-2", "lines", "line", [0, 1, 0, 1], 0, 1, [0, 0, 0, 1, 1, 1], [], [0, 1]),
        };
        var execution = new ModelExecutionResult(components, 2, true, new ModelTimings(0, 0, 0, 0, 0, 0));
        var result = MeshArtifactWriter.Write(
            root,
            execution,
            new WorkerDiagnostics(
                new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                new WorkerMetrics(1, 2, 3)));

        Assert.True(result.RecycleAfterResponse);
        Assert.Equal(116, result.ByteLength);
        Assert.Equal("triangles", result.Components[0].Kind);
        Assert.Equal("lines", result.Components[1].Kind);
        Assert.Equal(0, result.Components[0].PositionOffset);
        Assert.Equal(36, result.Components[0].NormalOffset);
        Assert.Equal(72, result.Components[0].IndexOffset);
        Assert.Equal(84, result.Components[1].PositionOffset);
        Assert.Equal(108, result.Components[1].NormalOffset);
        Assert.Equal(108, result.Components[1].IndexOffset);
        Assert.Equal(1, result.Metrics.ManagedHeapBytes);
        Assert.Equal(2, result.Metrics.PicoGkNativeBytes);
        Assert.Equal(3, result.Metrics.ProcessWorkingSetBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(result.ArtifactPath))).ToLowerInvariant(), result.Sha256);
    }

    [Fact]
    public void ProgramHandlesProtocolBuildAndValidationBoundaries()
    {
        Write("main.cs", """
using System.IO;
using System.Numerics;
using PicoGK;
Library.Go(2f, () =>
{
    var viewer = Library.oViewer();
    viewer.Add(Utils.mshCreateCube(new Vector3(3, 4, 5)));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "first.tga"));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "unchanged.tga"));
});
""");
        var artifacts = Path.Combine(root, "artifacts");
        var arguments = new[] { "--workspace", root, "--artifacts", artifacts, "--parent-pid", Environment.ProcessId.ToString() };
        var parsed = Program.ParseArguments(arguments);
        Assert.Equal(Path.GetFullPath(root), parsed.Workspace);
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["workspace", root]));
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["--workspace"]));
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["--workspace", root, "--workspace", root]));
        Assert.Throws<KeyNotFoundException>(() => Program.ParseArguments(["--workspace", root]));

        var output = Run(arguments, """
{"protocolVersion":4,"requestId":"1","method":"analyze","params":{"entryPath":"main.cs"}}
{"protocolVersion":4,"requestId":"2","method":"build","params":{"entryPath":"main.cs","parameters":{}}}
{"protocolVersion":4,"requestId":"3","method":"shutdown","params":{}}
""");
        Assert.Contains("\"type\":\"ready\"", output);
        Assert.Contains("\"defaultParameters\":{}", output);
        Assert.Contains("\"artifactPath\"", output);
        Assert.Contains("\"entryPointInvoke\"", output);
        Assert.Contains("\"shutdown\":true", output);
        Assert.Single(Directory.GetFiles(artifacts, "*.tau-mesh"));
        Assert.DoesNotContain("\"type\":\"event\"", output);

        foreach (var parameters in new[] { "[]", "{\"unexpected\":1}" })
        {
            Assert.Throws<WorkerException>(() => CompilationService.BindParameters(CompilationService.Compile(root), Json(parameters)));
        }
        CompilationService.BindParameters(CompilationService.Compile(root), Json("{}"));
    }

    [Fact]
    public void ProgramRejectsMalformedProtocolPathsAndUnknownMethods()
    {
        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "artifacts"), "--parent-pid", Environment.ProcessId.ToString() };
        var error = new StringWriter();
        Assert.Equal(2, Program.Run(arguments, new StringReader("{"), new StringWriter(), error));
        Assert.NotEmpty(error.ToString());
        Assert.Equal(2, Program.Run(arguments, new StringReader("null"), new StringWriter(), new StringWriter()));
        Assert.Equal(2, Program.Run(arguments, new StringReader("{\"protocolVersion\":3,\"requestId\":\"1\",\"method\":\"x\",\"params\":{}}"), new StringWriter(), new StringWriter()));
        Assert.Equal(2, Program.Run(arguments, new StringReader(new string('x', 1_048_577)), new StringWriter(), new StringWriter()));

        var output = Run(arguments, "{\"protocolVersion\":4,\"requestId\":\"2\",\"method\":\"unknown\",\"params\":{}}");
        Assert.Contains("CS_TAU_PROTOCOL", output);
        output = Run(arguments, "{\"protocolVersion\":4,\"requestId\":\"3\",\"method\":\"analyze\",\"params\":{}}");
        Assert.Contains("CS_TAU_RUNTIME", output);
        Assert.DoesNotContain("\"location\":null", output);

        Write("main.cs", "System.Console.WriteLine(1);");
        var valid = Json("{\"entryPath\":\"main.cs\"}");
        Program.ValidateEntryPath(valid, root);
        foreach (var json in new[] { "{}", "{\"entryPath\":\"\"}", "{\"entryPath\":\"../outside.cs\"}", "{\"entryPath\":\"missing.cs\"}", "{\"entryPath\":\"main.txt\"}" })
        {
            Assert.ThrowsAny<Exception>(() => Program.ValidateEntryPath(Json(json), root));
        }
        output = Run(arguments, "{\"protocolVersion\":4,\"requestId\":\"3a\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{}}}");
        Assert.Contains("CS_TAU_NO_SCENE", output);

        Write("main.cs", "using System; using System.Numerics; using PicoGK; Library.Go(1f, () => { Library.oViewer().Add(Utils.mshCreateCube(Vector3.One)); throw new InvalidOperationException(\"failed after start\"); });");
        output = Run(arguments, "{\"protocolVersion\":4,\"requestId\":\"4\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{}}}");
        Assert.Contains("failed after start", output);
    }

    [Fact]
    public void HostScopesWatchdogAndCleanupRestoreProcessState()
    {
        var first = new FakeHost(root);
        var second = new FakeHost(root);
        using (Library.UseHost(first))
        {
            Assert.Throws<InvalidOperationException>(() => Library.UseHost(second));
        }
        using (Library.UseHost(second)) { }
        Assert.Throws<ArgumentNullException>(() => Library.UseHost(null!));

        Assert.True(Program.ParentIsAlive(Environment.ProcessId));
        Assert.False(Program.ParentIsAlive(int.MaxValue));
        var terminated = new ManualResetEventSlim();
        var checks = new Queue<bool>([true, false]);
        var watcher = Program.StartParentWatch(1, terminated.Set, _ => checks.Dequeue(), pollMilliseconds: 1);
        Assert.True(terminated.Wait(TimeSpan.FromSeconds(1)));
        watcher.Join();

        Assert.False(Program.DisposeLibrary(null, new StringWriter()));
        Assert.False(Program.DisposeLibrary(new MemoryStream(), new StringWriter()));
        var cleanupError = new StringWriter();
        Assert.True(Program.DisposeLibrary(new ThrowingDisposable(), cleanupError));
        Assert.Contains("cleanup failed", cleanupError.ToString());

        var issue = new Issue("bad", "CS_TEST", "validation", "error", new Location("main.cs", 2, 3));
        Assert.Equal([issue], new WorkerException(issue).Issues);
        Assert.Equal("bad; bad", new WorkerException([issue, issue]).Message);
    }

    [Fact]
    public void EntryPointInvocationSupportsConsoleSignaturesAsyncAndUserExceptions()
    {
        EntryMethods.Calls = 0;
        ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.NoArguments))!);
        ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.Arguments))!);
        ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.Async))!);
        ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.AsyncZero))!);
        Assert.Equal(4, EntryMethods.Calls);
        Assert.Contains("entry exploded", Assert.Throws<InvalidOperationException>(() =>
            ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.Throws))!)).Message);
        Assert.Throws<WorkerException>(() =>
            ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.WrongArgument))!));
        Assert.Throws<WorkerException>(() =>
            ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.TwoArguments))!));
        var nonZero = Assert.Throws<WorkerException>(() =>
            ModelRunner.InvokeEntryPoint(typeof(EntryMethods).GetMethod(nameof(EntryMethods.NonZero))!));
        Assert.Equal("CS_TAU_EXIT_CODE", nonZero.Issues[0].Code);
    }

    [Fact]
    public void ProgramMainUsesTheRealConsoleProtocolPath()
    {
        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "artifacts"), "--parent-pid", Environment.ProcessId.ToString() };
        var originalInput = Console.In;
        var originalOutput = Console.Out;
        var originalError = Console.Error;
        try
        {
            Console.SetIn(new StringReader("{\"protocolVersion\":4,\"requestId\":\"main\",\"method\":\"shutdown\",\"params\":{}}"));
            var output = new StringWriter();
            Console.SetOut(output);
            Console.SetError(new StringWriter());
            var main = typeof(Program).GetMethod("Main", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            Assert.Equal(0, main.Invoke(null, [arguments]));
            Assert.Contains("\"shutdown\":true", output.ToString());
        }
        finally
        {
            Console.SetIn(originalInput);
            Console.SetOut(originalOutput);
            Console.SetError(originalError);
        }
    }

    private string Run(string[] arguments, string input)
    {
        var output = new StringWriter();
        Assert.Equal(0, Program.Run(arguments, new StringReader(input), output, new StringWriter()));
        return output.ToString();
    }

    private void Write(string path, string content)
    {
        var target = Path.Combine(root, path);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllText(target, content);
    }

    private static JsonElement Json(string value) => JsonDocument.Parse(value).RootElement.Clone();

    private static void AssertUnsupported(Action action) =>
        Assert.Equal("CS_TAU_VIEWER_CAPABILITY", Assert.Throws<WorkerException>(action).Issues[0].Code);

    private static float AxisExtent(float[] positions, int axis)
    {
        var values = positions.Where((_, index) => index % 3 == axis);
        return values.Max() - values.Min();
    }

    private sealed class FakeHost(string root) : ILibraryHost
    {
        public string DefaultLogFilePath => Path.Combine(root, "PicoGK.log");
        public void Run(float fVoxelSizeMM, ThreadStart fnTask, string strLogFilePath, bool bEndAppWithTask, string strWindowTitle, string strLightsFile) => fnTask();
    }

    private sealed class ThrowingDisposable : IDisposable
    {
        public void Dispose() => throw new InvalidOperationException("cleanup failed");
    }

    public static class EntryMethods
    {
        public static int Calls { get; set; }
        public static void NoArguments() => Calls++;
        public static void Arguments(string[] arguments)
        {
            Assert.Empty(arguments);
            Calls++;
        }
        public static async Task Async()
        {
            await Task.Yield();
            Calls++;
        }
        public static async Task<int> AsyncZero()
        {
            await Task.Yield();
            Calls++;
            return 0;
        }
        public static void Throws() => throw new InvalidOperationException("entry exploded");
        public static void WrongArgument(int value) { }
        public static void TwoArguments(string[] arguments, int value) { }
        public static int NonZero() => 7;
    }
}
