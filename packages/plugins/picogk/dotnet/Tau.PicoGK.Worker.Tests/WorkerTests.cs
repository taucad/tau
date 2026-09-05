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
        var checkpoint = Assert.Single(result.Checkpoints);
        Assert.Equal("preview.tga", checkpoint.Path);
        Assert.True(checkpoint.SceneGeneration > 0);
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
        var compute = new ComputeMaterializationCache([]);
        var result = ModelRunner.Execute(CompilationService.Compile(root), Path.Combine(root, "artifacts"), compute: compute);
        Assert.Single(result.Components);
        Assert.NotEmpty(result.Components[0].Positions);
        Assert.True(result.Timings.MeshConstruction >= 0);
        Assert.Single(result.ComputePublications!);

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
            Assert.Throws<WorkerException>(() => backend.RequestScreenShot(Path.Combine(root, "escaped.tga")));

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
            Assert.Single(captured.Checkpoints);
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
    public void CaptureBackendPublishesBoundedReconstructibleFramesBeforeCompletion()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var frames = new List<SceneProgress>();
            using var firstFrame = new ManualResetEventSlim();
            using var backend = new CaptureViewerBackend(
                Path.Combine(root, "progress-artifacts"),
                new SceneCaptureOptions(SceneCaptureMode.Operation, 0, 1),
                progress =>
                {
                    lock (frames) frames.Add(progress);
                    firstFrame.Set();
                });
            using var mesh = Utils.mshCreateCube(new Vector3(2, 2, 2));
            backend.Add(mesh, 1);

            Assert.True(firstFrame.Wait(TimeSpan.FromSeconds(2)));
            Assert.NotEmpty(frames);
            Assert.Equal(1, frames[0].SceneGeneration);
            Assert.Single(frames[0].Upserts);
            backend.Complete();
            var final = Assert.Single(backend.Extract().Components);
            var lastFrame = Assert.Single(frames[^1].Upserts);
            Assert.Equal(final.Name, lastFrame.Name);
            Assert.Equal(final.Positions, lastFrame.Positions);
            Assert.Throws<InvalidOperationException>(() => backend.Add(mesh, 2));
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void CaptureBackendCoalescesRateLimitedOperationFramesAndHonorsExplicitBookmarks()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var operationFrames = new List<SceneProgress>();
            using (var backend = new CaptureViewerBackend(
                Path.Combine(root, "coalesced-progress"),
                new SceneCaptureOptions(SceneCaptureMode.Operation, 10_000, 2),
                operationFrames.Add))
            using (var first = Utils.mshCreateCube(Vector3.One))
            using (var second = Utils.mshCreateCube(Vector3.One))
            {
                backend.Add(first, 1);
                backend.Add(second, 2);
                backend.Complete();
                Assert.Equal(2, operationFrames.Count);
                Assert.Equal(2, operationFrames.SelectMany(frame => frame.Upserts).Select(component => component.Id).Distinct().Count());
            }

            var noOpFrames = new List<SceneProgress>();
            using (var backend = new CaptureViewerBackend(
                Path.Combine(root, "semantic-noop-progress"),
                new SceneCaptureOptions(SceneCaptureMode.Operation, 0, 2),
                noOpFrames.Add))
            using (var stable = Utils.mshCreateCube(Vector3.One))
            {
                backend.Add(stable, 2);
                backend.Poll();
                backend.SetGroupMatrix(2, Matrix4x4.Identity);
                backend.Complete();
                Assert.Single(noOpFrames);
            }

            var explicitFrames = new List<SceneProgress>();
            var artifactRoot = Path.Combine(root, "explicit-progress");
            using var explicitBackend = new CaptureViewerBackend(
                artifactRoot,
                new SceneCaptureOptions(SceneCaptureMode.Explicit, 0, 2),
                explicitFrames.Add);
            using var mesh = Utils.mshCreateCube(Vector3.One);
            explicitBackend.Add(mesh, 1);
            explicitBackend.RequestScreenShot(Path.Combine(artifactRoot, "bookmark.tga"));
            explicitBackend.Complete();
            var bookmark = Assert.Single(explicitFrames).Bookmark;
            Assert.Equal("bookmark.tga", bookmark?.Path);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void HostedViewerPulsesFiniteGroupAnimationAtBoundedCadence()
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
        var frames = new List<(long Milliseconds, SceneProgress Progress)>();
        var clock = System.Diagnostics.Stopwatch.StartNew();

        var result = ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "animation-artifacts"),
            capture: new SceneCaptureOptions(SceneCaptureMode.Operation, 12, 16),
            onProgress: progress => frames.Add((clock.ElapsedMilliseconds, progress)));

        Assert.InRange(frames.Count, 3, 12);
        Assert.All(frames.Zip(frames.Skip(1)), pair =>
            Assert.True(pair.First.Progress.SceneGeneration < pair.Second.Progress.SceneGeneration));
        Assert.All(frames.Skip(1).SkipLast(1).Zip(frames.Skip(2).SkipLast(1)), pair =>
            Assert.True(pair.Second.Milliseconds - pair.First.Milliseconds >= 8));
        Assert.True(AxisExtent(frames[0].Progress.Upserts[0].Positions, 0) < 3f);
        Assert.True(AxisExtent(result.Components[0].Positions, 0) > 5f);
        Assert.True(AxisExtent(result.Components[0].Positions, 1) < 3f);
    }

    [Fact]
    public void HostedViewerPublishesSupportedPresentationAndRejectsUnavailableEnvironment()
    {
        Assert.True(CaptureViewerBackend.PresentationEquals(new ScenePresentation(), new ScenePresentation()));
        Assert.False(CaptureViewerBackend.PresentationEquals(new ScenePresentation(), new ScenePresentation([1, 1, 1, 1])));
        Assert.False(CaptureViewerBackend.PresentationEquals(new ScenePresentation([1, 1, 1, 1]), new ScenePresentation()));
        Assert.False(CaptureViewerBackend.PresentationEquals(
            new ScenePresentation([1, 1, 1, 1]),
            new ScenePresentation([0, 0, 0, 1])));
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
        var frames = new List<SceneProgress>();
        ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "presentation-artifacts"),
            capture: new SceneCaptureOptions(SceneCaptureMode.Operation, 0, 16),
            onProgress: frames.Add);

        var presentation = frames.Select(frame => frame.Presentation).Last(value => value is not null)!;
        Assert.Equal([0.1f, 0.2f, 0.3f, 0.4f], presentation.Background!);
        Assert.InRange(presentation.FieldOfViewDegrees!.Value, 59.99f, 60.01f);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => { }, strLightsFile: \"environment.zip\");");
        var unsupported = Assert.Throws<WorkerException>(() => ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "environment-artifacts")));
        Assert.Equal("CS_TAU_VIEWER_CAPABILITY", unsupported.Issues[0].Code);
    }

    [Fact]
    public void ProgressiveCaptureUsesStableIdsAndTransfersOnlyChangedComponents()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    var retained = Utils.mshCreateCube(new Vector3(2, 3, 4));
    var changing = Utils.mshCreateCube(new Vector3(5, 6, 7));
    viewer.Add(retained, 1);
    viewer.RequestScreenShot(System.IO.Path.Combine(Library.strLogFolder, "retained.tga"));
    viewer.Add(changing, 2);
    viewer.RequestScreenShot(System.IO.Path.Combine(Library.strLogFolder, "added.tga"));
    viewer.SetObjectMatrix(changing, Matrix4x4.CreateTranslation(9, 0, 0));
    viewer.RequestScreenShot(System.IO.Path.Combine(Library.strLogFolder, "moved.tga"));
    viewer.RequestScreenShot(System.IO.Path.Combine(Library.strLogFolder, "unchanged.tga"));
    viewer.Remove(retained);
    viewer.RequestScreenShot(System.IO.Path.Combine(Library.strLogFolder, "removed.tga"));
});
""");
        var progress = new List<SceneProgress>();

        var result = ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "delta-artifacts"),
            capture: new SceneCaptureOptions(SceneCaptureMode.Explicit, 0, 16),
            onProgress: progress.Add);

        Assert.Equal(5, progress.Count);
        Assert.Equal(SceneProgressOperation.Reset, progress[0].Operation);
        var retainedId = Assert.Single(progress[0].Upserts).Id;
        Assert.Empty(progress[0].RemovedComponentIds);
        Assert.Equal(SceneProgressOperation.Delta, progress[1].Operation);
        var changingId = Assert.Single(progress[1].Upserts).Id;
        Assert.NotEqual(retainedId, changingId);
        Assert.Equal(changingId, Assert.Single(progress[2].Upserts).Id);
        Assert.Empty(progress[3].Upserts);
        Assert.Empty(progress[3].RemovedComponentIds);
        Assert.Empty(progress[4].Upserts);
        Assert.Equal([retainedId], progress[4].RemovedComponentIds);
        Assert.Equal(changingId, Assert.Single(result.Components).Id);

        var reconstructed = new Dictionary<string, ExtractedComponent>(StringComparer.Ordinal);
        foreach (var update in progress)
        {
            if (update.Operation == SceneProgressOperation.Reset) reconstructed.Clear();
            foreach (var removed in update.RemovedComponentIds) reconstructed.Remove(removed);
            foreach (var upsert in update.Upserts) reconstructed[upsert.Id] = upsert;
        }
        var terminal = Assert.Single(result.Components);
        var streamed = Assert.Single(reconstructed.Values);
        Assert.Equal(terminal, streamed);
        Assert.Equal(terminal.Positions, streamed.Positions);
        Assert.Equal(terminal.Normals, streamed.Normals);
        Assert.Equal(terminal.Indices, streamed.Indices);
    }

    [Fact]
    public void ProgressiveCaptureDoesNotAdvanceTheBaseForSemanticNoOps()
    {
        Write("main.cs", """
using System.IO;
using System.Numerics;
using PicoGK;

Library.Go(1f, () =>
{
    var viewer = Library.oViewer();
    var mesh = Utils.mshCreateCube(new Vector3(2, 3, 4));
    viewer.Add(mesh, 1);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "added.tga"));
    viewer.SetGroupMatrix(1, Matrix4x4.Identity);
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "unchanged.tga"));
    viewer.SetObjectMatrix(mesh, Matrix4x4.CreateTranslation(5, 0, 0));
    viewer.RequestScreenShot(Path.Combine(Library.strLogFolder, "moved.tga"));
});
""");
        var progress = new List<SceneProgress>();

        ModelRunner.Execute(
            CompilationService.Compile(root),
            Path.Combine(root, "semantic-noop-artifacts"),
            capture: new SceneCaptureOptions(SceneCaptureMode.Explicit, 0, 16),
            onProgress: progress.Add);

        Assert.Equal(3, progress.Count);
        Assert.Equal(SceneProgressOperation.Reset, progress[0].Operation);
        Assert.Equal(1, progress[0].SceneGeneration);
        Assert.Equal(SceneProgressOperation.Delta, progress[1].Operation);
        Assert.Equal(1, progress[1].BaseSceneGeneration);
        Assert.Equal(2, progress[1].SceneGeneration);
        Assert.Empty(progress[1].Upserts);
        Assert.Equal("unchanged.tga", progress[1].Bookmark?.Path);
        Assert.Equal(SceneProgressOperation.Delta, progress[2].Operation);
        Assert.Equal(1, progress[2].BaseSceneGeneration);
        Assert.Equal(3, progress[2].SceneGeneration);
        Assert.Single(progress[2].Upserts);
    }

    [Fact]
    public void NormalsAndMixedArtifactLayoutAreDeterministic()
    {
        Assert.Throws<ArgumentException>(() => MeshArtifactWriter.WriteSceneComponents(root, []));
        var positions = new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5 };
        var normals = ModelRunner.VertexNormals(positions, [0, 1, 2]);
        Assert.Equal(new float[] { 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 }, normals);
        var components = new[]
        {
            new ExtractedComponent("component:picogk-1", "triangles", "triangle", [1, 0, 0, 1], 0.2f, 0.8f, positions[..9], normals[..9], [0, 1, 2]),
            new ExtractedComponent("component:picogk-2", "lines", "line", [0, 1, 0, 1], 0, 1, [0, 0, 0, 1, 1, 1], [], [0, 1]),
        };
        var checkpoints = new[] { new SceneCheckpoint("preview.tga", 1) };
        var execution = new ModelExecutionResult(components, checkpoints, 2, true, new ModelTimings(0, 0, 0, 0, 0, 0));
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
        Assert.Equal(checkpoints, result.Checkpoints);
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
    public void VdbContentHashOmitsOnlyValidatedArchiveUuid()
    {
        var bytes = new byte[65];
        BinaryPrimitives.WriteInt64LittleEndian(bytes, 0x56444220);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(8), 225);
        BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(12), 13);
        bytes[20] = 1;
        Encoding.ASCII.GetBytes("01234567-89AB-CDEF-0123-456789ABCDEF").CopyTo(bytes, 21);
        var digest = ComputeMaterializationCache.VdbKey(new MemoryStream([.. bytes]));
        Assert.NotNull(digest);
        var otherUuid = bytes.ToArray();
        Encoding.ASCII.GetBytes("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE").CopyTo(otherUuid, 21);
        Assert.Equal(digest, ComputeMaterializationCache.VdbKey(new MemoryStream(otherUuid)));
        foreach (var offset in new[] { 12, 16, 57, 64 })
        {
            var changed = bytes.ToArray();
            changed[offset]++;
            Assert.NotEqual(digest, ComputeMaterializationCache.VdbKey(new MemoryStream(changed)));
        }
        foreach (var offset in new[] { 0, 8, 20, 29 })
        {
            var invalid = bytes.ToArray();
            invalid[offset] = 0;
            Assert.Null(ComputeMaterializationCache.VdbKey(new MemoryStream(invalid)));
        }
        Assert.Null(ComputeMaterializationCache.VdbKey(new MemoryStream(bytes[..56])));
    }

    [Fact]
    public void VoxelContentHashPreservesPrecisionAndSourceMetadataAndCacheFailuresAreMisses()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var sphere = Voxels.voxSphere(Vector3.Zero, 2);
            sphere.oMetaData().SetValue("is_saved_as_half_float", 1f);
            var cache = new ComputeMaterializationCache([]);
            using var backend = new CaptureViewerBackend(Path.Combine(root, "full-precision"), compute: cache);
            backend.Add(sphere, 0);
            backend.Complete();
            var firstKey = Assert.Single(cache.Publications).CacheKey;
            Assert.True(sphere.oMetaData().bGetValueAt("is_saved_as_half_float", out float flag));
            Assert.Equal(1f, flag);
            sphere.oMetaData().RemoveValue("is_saved_as_half_float");
            var nextCache = new ComputeMaterializationCache([]);
            using var next = new CaptureViewerBackend(Path.Combine(root, "full-precision-next"), compute: nextCache);
            next.Add(sphere, 0);
            next.Complete();
            Assert.Equal(firstKey, Assert.Single(nextCache.Publications).CacheKey);

            var missing = Path.Combine(root, "unavailable-cache");
            var unavailable = new ComputeMaterializationCache([]);
            using var noCache = new CaptureViewerBackend(missing, compute: unavailable);
            Directory.Delete(missing);
            noCache.Add(sphere, 0);
            noCache.Complete();
            Assert.Single(noCache.Extract().Components);
            Assert.Empty(unavailable.Publications);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void ComponentMaterializationUsesGeometryContentInsteadOfCaptureOrder()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var cold = new ComputeMaterializationCache([]);
            using var first = new CaptureViewerBackend(Path.Combine(root, "content-cold"), compute: cold);
            using var small = Voxels.voxSphere(Vector3.Zero, 2);
            first.Add(small, 0);
            first.Complete();
            var firstGeometry = Assert.Single(first.Extract().Components);
            var prepared = cold.Publications.Select(item => (item.CacheKey, item.Snapshot)).ToArray();

            var warm = new ComputeMaterializationCache(prepared);
            using var changed = new CaptureViewerBackend(Path.Combine(root, "content-changed"), compute: warm);
            using var large = Voxels.voxSphere(new Vector3(20, 0, 0), 5);
            using var duplicate = small.voxDuplicate();
            changed.Add(large, 0);
            changed.Add(small, 1);
            changed.Add(duplicate, 2);
            changed.Complete();
            var changedGeometry = changed.Extract().Components;
            Assert.True(changedGeometry[0].Positions.Max() > 20);
            Assert.Equal(firstGeometry.Positions, changedGeometry[1].Positions);
            Assert.Equal(firstGeometry.Positions, changedGeometry[2].Positions);
            Assert.NotSame(changedGeometry[1].Positions, changedGeometry[2].Positions);
            Assert.Single(warm.Publications);
            Assert.NotEqual(prepared[0].CacheKey, warm.Publications[0].CacheKey);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void ComponentMaterializationCacheRoundTripsImmutableBytesAndSkipsVoxelMeshing()
    {
        var snapshot = new GeometrySnapshot("triangles", [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], null);
        var execution = new ModelExecutionResult(
            [new ExtractedComponent("component:picogk-1", "triangles", "part", [1, 1, 1, 1], 0, 1, snapshot.Positions, [0, 0, 1, 0, 0, 1, 0, 0, 1], snapshot.Indices)],
            [], 0, false, new ModelTimings(0, 0, 0, 0, 0, 0),
            [new ComputeSnapshotPublication("1:voxels", snapshot)]);
        var written = MeshArtifactWriter.Write(root, execution, new WorkerDiagnostics(
            new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), new WorkerMetrics(0, 0, 0)),
            execution.ComputePublications);
        var artifact = Assert.Single(written.ComputePublications);
        var restored = MeshArtifactWriter.ReadComputeArtifact(artifact);
        snapshot.Positions[0] = 99;
        Assert.Equal(0, restored.Positions[0]);

        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            var cold = new ComputeMaterializationCache([]);
            using var first = new CaptureViewerBackend(Path.Combine(root, "compute-cold"), compute: cold);
            using var voxels = Voxels.voxSphere(Vector3.Zero, 2);
            first.Add(voxels, 0);
            first.Complete();
            var coldGeometry = Assert.Single(first.Extract().Components);
            var cache = new ComputeMaterializationCache(cold.Publications.Select(item => (item.CacheKey, item.Snapshot)));
            using var backend = new CaptureViewerBackend(Path.Combine(root, "compute-hit"), compute: cache);
            backend.Add(voxels, 0);
            backend.Complete();
            var captured = backend.Extract();
            Assert.Equal(0, captured.MeshConstruction);
            Assert.Empty(cache.Publications);
            Assert.Equal(coldGeometry.Positions, captured.Components[0].Positions);
            Assert.NotSame(coldGeometry.Indices, captured.Components[0].Indices);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }

        File.WriteAllBytes(artifact.ArtifactPath, [9]);
        Assert.Throws<InvalidDataException>(() => MeshArtifactWriter.ReadComputeArtifact(artifact));

        var sameLengthCorruption = artifact with { ArtifactPath = Path.Combine(root, "corrupt.tau-compute") };
        File.WriteAllBytes(sameLengthCorruption.ArtifactPath, new byte[sameLengthCorruption.ByteLength]);
        Assert.Throws<InvalidDataException>(() => MeshArtifactWriter.ReadComputeArtifact(sameLengthCorruption));
        foreach (var invalid in new[]
        {
            artifact with { ArtifactPath = sameLengthCorruption.ArtifactPath, Sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sameLengthCorruption.ArtifactPath))).ToLowerInvariant(), Kind = "lines" },
            artifact with { ArtifactPath = sameLengthCorruption.ArtifactPath, Sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sameLengthCorruption.ArtifactPath))).ToLowerInvariant(), PositionCount = 0 },
            artifact with { ArtifactPath = sameLengthCorruption.ArtifactPath, Sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sameLengthCorruption.ArtifactPath))).ToLowerInvariant(), IndexCount = 0 },
            artifact with { ArtifactPath = sameLengthCorruption.ArtifactPath, Sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sameLengthCorruption.ArtifactPath))).ToLowerInvariant(), PositionCount = 1 },
        })
        {
            Assert.Throws<InvalidDataException>(() => MeshArtifactWriter.ReadComputeArtifact(invalid));
        }

        var emptyCache = new ComputeMaterializationCache([]);
        Assert.False(emptyCache.TryGet("missing", out _));
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var coldBackend = new CaptureViewerBackend(Path.Combine(root, "compute-miss"), compute: emptyCache);
            using var coldMesh = Utils.mshCreateCube(Vector3.One);
            coldBackend.Add(coldMesh, 0);
            coldBackend.Complete();
            Assert.Single(emptyCache.Publications);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void ComputeRequestParsingIsConfinedAndTreatsCorruptionAsAMiss()
    {
        Assert.Null(Program.ParseComputeCache(Json("{}"), root));
        Assert.Throws<WorkerException>(() => Program.ParseComputeCache(Json("{\"compute\":null}"), root));
        Assert.Throws<WorkerException>(() => Program.ParseComputeCache(Json("{\"compute\":{\"modelDigest\":\"bad\",\"prepared\":[]}}"), root));
        Assert.Throws<WorkerException>(() => Program.ParseComputeCache(Json("{\"compute\":{\"modelDigest\":\"sha256:short\",\"prepared\":[]}}"), root));
        Assert.Throws<WorkerException>(() => Program.ParseComputeCache(Json($"{{\"compute\":{{\"modelDigest\":\"sha256:{new string('1', 64)}\"}}}}"), root));
        var path = Path.Combine(root, "prepared.tau-compute");
        var bytes = new byte[24];
        File.WriteAllBytes(path, bytes);
        var digest = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        var descriptor = new ComputeArtifact("1:mesh", "triangles", path, bytes.Length, digest, 3, 3);
        var valid = JsonSerializer.SerializeToElement(new { compute = new ComputeRequest($"sha256:{new string('1', 64)}", [descriptor]) });
        var cache = Program.ParseComputeCache(valid, root)!;
        Assert.True(cache.TryGet("1:mesh", out _));

        var corrupt = descriptor with { Sha256 = new string('0', 64) };
        var ignored = JsonSerializer.SerializeToElement(new { compute = new ComputeRequest($"sha256:{new string('2', 64)}", [corrupt]) });
        Assert.False(Program.ParseComputeCache(ignored, root)!.TryGet("1:mesh", out _));

        var outside = descriptor with { ArtifactPath = Path.Combine(Path.GetTempPath(), "outside.tau-compute") };
        var confined = JsonSerializer.SerializeToElement(new { compute = new ComputeRequest($"sha256:{new string('3', 64)}", [outside]) });
        Assert.False(Program.ParseComputeCache(confined, root)!.TryGet("1:mesh", out _));
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
{"protocolVersion":3,"requestId":"1","method":"analyze","params":{"entryPath":"main.cs"}}
{"protocolVersion":3,"requestId":"2","method":"build","params":{"entryPath":"main.cs","parameters":{},"streamScene":true}}
{"protocolVersion":3,"requestId":"3","method":"shutdown","params":{}}
""");
        Assert.Contains("\"type\":\"ready\"", output);
        Assert.Contains("\"defaultParameters\":{}", output);
        Assert.Contains("\"artifactPath\"", output);
        Assert.Contains("\"entryPointInvoke\"", output);
        Assert.Contains("\"shutdown\":true", output);
        Assert.Single(Directory.GetFiles(artifacts, "*.tau-mesh"));
        var frames = output.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => JsonDocument.Parse(line))
            .ToArray();
        try
        {
            var buildEvent = Array.FindIndex(frames, frame =>
                frame.RootElement.TryGetProperty("type", out var type) && type.GetString() == "event" &&
                frame.RootElement.GetProperty("requestId").GetString() == "2");
            var buildTerminal = Array.FindIndex(frames, frame =>
                !frame.RootElement.TryGetProperty("type", out _) &&
                frame.RootElement.TryGetProperty("requestId", out var id) && id.GetString() == "2");
            Assert.True(buildEvent >= 0);
            Assert.True(buildEvent < buildTerminal);
            Assert.Single(frames, frame =>
                !frame.RootElement.TryGetProperty("type", out _) &&
                frame.RootElement.TryGetProperty("requestId", out var id) && id.GetString() == "2");
            var eventValue = frames[buildEvent].RootElement.GetProperty("event");
            Assert.Equal("reset", eventValue.GetProperty("operation").GetString());
            Assert.Equal(JsonValueKind.Null, eventValue.GetProperty("baseSceneGeneration").ValueKind);
            Assert.Equal(1, eventValue.GetProperty("sceneGeneration").GetInt32());
            Assert.Empty(eventValue.GetProperty("removedComponentIds").EnumerateArray());
            Assert.Equal("component:picogk-1", eventValue.GetProperty("artifact").GetProperty("components")[0].GetProperty("id").GetString());
            Assert.Equal(1, frames[buildEvent].RootElement.GetProperty("sequence").GetInt32());
            Assert.Contains(frames, frame =>
                frame.RootElement.TryGetProperty("type", out var type) && type.GetString() == "event" &&
                frame.RootElement.GetProperty("event").GetProperty("artifact").ValueKind == JsonValueKind.Null);
        }
        finally
        {
            foreach (var frame in frames) frame.Dispose();
        }

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
        Assert.Equal(2, Program.Run(arguments, new StringReader("{\"protocolVersion\":2,\"requestId\":\"1\",\"method\":\"x\",\"params\":{}}"), new StringWriter(), new StringWriter()));
        Assert.Equal(2, Program.Run(arguments, new StringReader(new string('x', 1_048_577)), new StringWriter(), new StringWriter()));

        var output = Run(arguments, "{\"protocolVersion\":3,\"requestId\":\"2\",\"method\":\"unknown\",\"params\":{}}");
        Assert.Contains("CS_TAU_PROTOCOL", output);
        output = Run(arguments, "{\"protocolVersion\":3,\"requestId\":\"3\",\"method\":\"analyze\",\"params\":{}}");
        Assert.Contains("CS_TAU_RUNTIME", output);
        Assert.DoesNotContain("\"location\":null", output);

        Write("main.cs", "System.Console.WriteLine(1);");
        var valid = Json("{\"entryPath\":\"main.cs\"}");
        Program.ValidateEntryPath(valid, root);
        foreach (var json in new[] { "{}", "{\"entryPath\":\"\"}", "{\"entryPath\":\"../outside.cs\"}", "{\"entryPath\":\"missing.cs\"}", "{\"entryPath\":\"main.txt\"}" })
        {
            Assert.ThrowsAny<Exception>(() => Program.ValidateEntryPath(Json(json), root));
        }
        Assert.Equal(SceneCaptureMode.Update, Program.ParseCaptureOptions(Json("{}")).Mode);
        Assert.Equal(
            SceneCaptureMode.Explicit,
            Program.ParseCaptureOptions(Json("{\"capture\":{\"mode\":\"explicit\",\"minimumIntervalMilliseconds\":0,\"maximumPendingCommands\":1}}")).Mode);
        Assert.Throws<WorkerException>(() => Program.ParseCaptureOptions(Json("{\"capture\":{\"mode\":\"unknown\"}}")));
        Assert.Equal(SceneCaptureMode.Operation, Program.ParseCaptureOptions(Json("{\"capture\":{\"mode\":\"operation\"}}")).Mode);
        foreach (var capture in new[]
        {
            "{\"mode\":\"update\",\"minimumIntervalMilliseconds\":-1}",
            "{\"mode\":\"update\",\"minimumIntervalMilliseconds\":10001}",
            "{\"mode\":\"update\",\"maximumPendingCommands\":0}",
            "{\"mode\":\"update\",\"maximumPendingCommands\":4097}",
        })
        {
            Assert.Throws<WorkerException>(() => Program.ParseCaptureOptions(Json($"{{\"capture\":{capture}}}")));
        }

        output = Run(arguments, "{\"protocolVersion\":3,\"requestId\":\"3a\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{},\"streamScene\":false}}");
        Assert.Contains("CS_TAU_NO_SCENE", output);

        Write("main.cs", "using System; using System.Numerics; using PicoGK; Library.Go(1f, () => { Library.oViewer().Add(Utils.mshCreateCube(Vector3.One)); throw new InvalidOperationException(\"failed after start\"); });");
        output = Run(arguments, "{\"protocolVersion\":3,\"requestId\":\"4\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{},\"streamScene\":true}}");
        Assert.Contains("failed after start", output);
        Assert.Empty(Directory.GetDirectories(Path.Combine(root, "artifacts"), "progress-*"));
        Assert.Empty(Directory.GetFiles(Path.Combine(root, "artifacts"), "*.tau-compute"));
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
            Console.SetIn(new StringReader("{\"protocolVersion\":3,\"requestId\":\"main\",\"method\":\"shutdown\",\"params\":{}}"));
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
