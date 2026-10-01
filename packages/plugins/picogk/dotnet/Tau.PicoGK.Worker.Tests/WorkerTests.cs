using System.Buffers.Binary;
using System.Collections;
using System.Numerics;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using PicoGK;
using PicoGK.Numerics;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests : IDisposable
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

        var first = CompilationService.Compile(root, "main.cs");
        var second = CompilationService.Compile(root, "main.cs");

        Assert.False(first.Timings.CacheHit);
        Assert.True(second.Timings.CacheHit);
        Assert.All(new[] { first.Timings.SourceRead, first.Timings.Parse, first.Timings.Analyze, first.Timings.Emit }, value => Assert.True(value >= 0));
        Assert.Equal(first.Assembly, second.Assembly);
        Assert.Equal(first.Pdb, second.Pdb);
        Assert.Empty(first.Defaults);
        Assert.Equal("object", first.JsonSchema["type"]);

        Write("Helper.cs", "public static class Helper { public const int Value = 4; }");
        Assert.False(CompilationService.Compile(root, "main.cs").Timings.CacheHit);
    }

    // Two independent programs in one project, as a person or an agent writes them: each declares its
    // own top-level statements, `Params` and `ModelPart`, and both build on one shared helper.
    private void WriteTwoPrograms(float helperScale = 1f)
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
Library.Go(Params.VoxelSizeMm, () => Library.oViewer().Add(Shared.Box(Params.Part == ModelPart.Base ? Params.SizeMm : 1f)));
public enum ModelPart { Base, Lid }
public static class Params
{
    public static float VoxelSizeMm { get; set; } = 1f;
    public static float SizeMm { get; set; } = 10f;
    public static ModelPart Part { get; set; } = ModelPart.Base;
}
""");
        Write("regions/other.cs", """
using System.Numerics;
using PicoGK;
Library.Go(Params.VoxelSizeMm, () => Library.oViewer().Add(Shared.Box(Params.Part == ModelPart.Relief ? Params.SizeMm : 2f)));
public enum ModelPart { Relief, Frame, Label }
public static class Params
{
    public static float VoxelSizeMm { get; set; } = 1f;
    public static float SizeMm { get; set; } = 20f;
    public static ModelPart Part { get; set; } = ModelPart.Relief;
}
""");
        Write("Shared.cs", $$"""
using System.Numerics;
using PicoGK;
public static class Shared
{
    public static Mesh Box(float size) => Utils.mshCreateCube(new Vector3(size * {{helperScale}}f, 4f, 4f));
}
public class Runner { public void Main() { } public static void Other() { } }
""");
    }

    private float BuiltWidth(string entryPath, string parameters = "{}") =>
        AxisExtent(
            Assert.Single(ModelRunner.Execute(
                CompilationService.Compile(root, entryPath),
                Path.Combine(root, "entry-artifacts"),
                Json(parameters)).Components).Positions,
            0);

    [Fact]
    public void EachProgramCompilesAloneWithTheSharedHelpersAndItsOwnParameters()
    {
        WriteTwoPrograms();

        Assert.Equal(["Shared.cs", "main.cs"], CompilationService.SelectSources(root, "main.cs"));
        Assert.Equal(["Shared.cs", "regions/other.cs"], CompilationService.SelectSources(root, "regions/other.cs"));
        Assert.Equal(10f, CompilationService.Compile(root, "main.cs").Defaults["SizeMm"]);
        var other = CompilationService.Compile(root, "regions/other.cs");
        Assert.Equal(20f, other.Defaults["SizeMm"]);
        Assert.Equal(["Relief", "Frame", "Label"], other.Parameters.Single(parameter => parameter.Name == "Part").EnumValues);

        // Switching back and forth keeps each model's geometry, and an override stays with its entry.
        Assert.InRange(BuiltWidth("main.cs"), 9.99f, 10.01f);
        Assert.InRange(BuiltWidth("regions/other.cs"), 19.99f, 20.01f);
        Assert.InRange(BuiltWidth("main.cs", """{"SizeMm":5}"""), 4.99f, 5.01f);
        Assert.InRange(BuiltWidth("regions/other.cs"), 19.99f, 20.01f);
        Assert.InRange(BuiltWidth("regions/other.cs", """{"Part":"Frame"}"""), 1.99f, 2.01f);
        Assert.InRange(BuiltWidth("main.cs"), 9.99f, 10.01f);
        Assert.Throws<WorkerException>(() => CompilationService.BindParameters(
            CompilationService.Compile(root, "main.cs"), Json("""{"Part":"Relief"}""")));

        // The shared helper is a source of both programs, so an edit to it reaches both.
        WriteTwoPrograms(helperScale: 2f);
        Assert.InRange(BuiltWidth("main.cs"), 19.99f, 20.01f);
        Assert.InRange(BuiltWidth("regions/other.cs"), 39.99f, 40.01f);
    }

    [Fact]
    public void ASyntaxErrorInAnotherProgramLeavesThisOneRunning()
    {
        WriteTwoPrograms();
        Write("regions/other.cs", """
using PicoGK;
Library.Go(1f, () => { Library.oViewer().Add(Shared.Box(3f);
public static class Params { public static float SizeMm { get; set; } = 20f; }
""");

        Assert.Equal(["Shared.cs", "main.cs"], CompilationService.SelectSources(root, "main.cs"));
        Assert.InRange(BuiltWidth("main.cs"), 9.99f, 10.01f);
        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "regions/other.cs"));
        Assert.All(error.Issues, issue => Assert.Equal("regions/other.cs", issue.Location?.FileName));
    }

    [Fact]
    public void ClassicMainProgramsAreIndependentEntriesAndKeepTheirPartialHelpers()
    {
        Write("a.cs", """
using PicoGK;
public static partial class Model
{
    public static void Main() => Library.Go(1f, () => Library.oViewer().Add(Box(Params.SizeMm)));
}
public static class Params { public static float SizeMm { get; set; } = 6f; }
""");
        Write("b.cs", """
using PicoGK;
internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        await Task.Yield();
        Library.Go(1f, () => Library.oViewer().Add(Model.Box(Params.SizeMm)));
        return 0;
    }
}
public static class Params { public static float SizeMm { get; set; } = 8f; }
""");
        Write("ModelParts.cs", """
using System.Numerics;
using PicoGK;
public static partial class Model
{
    public static Mesh Box(float size) => Utils.mshCreateCube(new Vector3(size, 1f, 1f));
}
""");

        Assert.Equal(["ModelParts.cs", "a.cs"], CompilationService.SelectSources(root, "a.cs"));
        Assert.Equal(["ModelParts.cs", "b.cs"], CompilationService.SelectSources(root, "b.cs"));
        Assert.InRange(BuiltWidth("a.cs"), 5.99f, 6.01f);
        Assert.InRange(BuiltWidth("b.cs"), 7.99f, 8.01f);
        Assert.InRange(BuiltWidth("a.cs", """{"SizeMm":3}"""), 2.99f, 3.01f);
    }

    [Fact]
    public void EntryAmbiguityIsNamedWhereItIsDecided()
    {
        WriteTwoPrograms();

        // A helper opened on its own has no model of its own to run when two programs could claim it.
        var helper = Assert.Throws<WorkerException>(() => CompilationService.SelectSources(root, "Shared.cs"));
        Assert.Equal("CS_TAU_ENTRY", helper.Issues[0].Code);
        Assert.Contains("main.cs, regions/other.cs", helper.Message, StringComparison.Ordinal);
        Assert.Equal("Shared.cs", helper.Issues[0].Location?.FileName);
        Assert.Equal("CS_TAU_PATH", Assert.Throws<WorkerException>(() => CompilationService.SelectSources(root, "missing.cs")).Issues[0].Code);

        // With one program, a helper runs it, as a console project would.
        File.Delete(Path.Combine(root, "regions/other.cs"));
        Assert.Equal(["Shared.cs", "main.cs"], CompilationService.SelectSources(root, "Shared.cs"));

        // Top-level statements beside a Main method are still one program: C# runs the statements.
        Write("regions/other.cs", "using PicoGK; Library.Go(1f, () => { }); static class Legacy { static void Main() { } }");
        Assert.Equal(["Shared.cs", "regions/other.cs"], CompilationService.SelectSources(root, "regions/other.cs"));

        Write("regions/other.cs", """
static class First { static void Main() { } }
static class Second
{
    static void Main(string[] args) { }
}
""");
        var twoMains = Assert.Throws<WorkerException>(() => CompilationService.SelectSources(root, "regions/other.cs"));
        Assert.Equal("CS_TAU_ENTRY", twoMains.Issues[0].Code);
        Assert.Contains("2 static Main methods (lines 1, 4)", twoMains.Message, StringComparison.Ordinal);
        Assert.Equal(new Location("regions/other.cs", 4, 5), twoMains.Issues[0].Location);
    }

    [Fact]
    public void TheWorkerResolvesAnEntryToTheSourcesItCompiles()
    {
        WriteTwoPrograms();
        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "artifacts"), "--parent-pid", Environment.ProcessId.ToString() };

        var output = Run(arguments, """
{"protocolVersion":7,"requestId":"1","method":"resolve","params":{"entryPath":"./regions/other.cs"}}
{"protocolVersion":7,"requestId":"2","method":"resolve","params":{"entryPath":"Shared.cs"}}
""");

        Assert.Contains("\"sources\":[\"Shared.cs\",\"regions/other.cs\"]", output);
        Assert.Contains("CS_TAU_ENTRY", output);
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

        var compiled = CompilationService.Compile(root, "main.cs");

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
            CompilationService.Compile(root, "main.cs"),
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
        var compiled = CompilationService.Compile(root, "main.cs");

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
            var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
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
            var defaults = CompilationService.Compile(root, "main.cs").Defaults;
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
        var constructorError = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
        Assert.Equal("CS_TAU_PARAMETERS", constructorError.Issues[0].Code);
        Assert.Contains("static constructor", constructorError.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void CompilationReportsActualBoundedSourceDiagnostics()
    {
        Write("main.cs", string.Join(Environment.NewLine, Enumerable.Range(0, 257).Select(index => $"Missing{index} value{index};")));

        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));

        Assert.Equal(256, error.Issues.Count);
        Assert.All(error.Issues, issue => Assert.StartsWith("CS", issue.Code, StringComparison.Ordinal));
        Assert.DoesNotContain(error.Issues, issue => issue.Code == "CS_TAU_COMPILATION");
        Assert.Equal("main.cs", error.Issues[0].Location?.FileName);
        Assert.True(error.Issues[0].Location?.StartLineNumber > 0);

        Write("main.cs", "public static class Broken {");
        error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
        Assert.Equal("CS1513", error.Issues[0].Code);
    }

    [Fact]
    public void CompilationEnforcesProjectAndSyntaxLimits()
    {
        Assert.Contains("no C#", Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs")).Message);
        for (var index = 0; index < 257; index++)
        {
            Write($"{index}.cs", $"public static class C{index} {{ }}");
        }
        Assert.Contains("256", Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs")).Message);

        Directory.Delete(root, recursive: true);
        Directory.CreateDirectory(root);
        Write("main.cs", new string(' ', 1024 * 1024 + 1));
        Assert.Contains("byte limit", Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs")).Message);

        Write("main.cs", string.Concat(Enumerable.Repeat("(", 520)) + "1" + string.Concat(Enumerable.Repeat(")", 520)) + ";");
        Assert.Contains("depth", Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs")).Message, StringComparison.OrdinalIgnoreCase);
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

        var compiled = CompilationService.Compile(fixture, "Program.cs");

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

        var result = ModelRunner.Execute(CompilationService.Compile(fixture, "Program.cs"), Path.Combine(root, "official-artifacts"));

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

        var result = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts"));

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
        var result = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts"));
        Assert.Single(result.Components);
        Assert.NotEmpty(result.Components[0].Positions);
        Assert.True(result.Timings.MeshConstruction >= 0);

        Write("main.cs", "throw new InvalidOperationException(\"model exploded\");");
        Assert.Contains("model exploded", Assert.Throws<InvalidOperationException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts"))).Message);

        Write("main.cs", "System.Console.WriteLine(\"no scene\");");
        Assert.Equal("CS_TAU_NO_SCENE", Assert.Throws<WorkerException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts"))).Issues[0].Code);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => { });");
        Assert.Empty(ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts")).Components);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => throw new InvalidOperationException(\"task exploded\"));");
        Assert.Contains("task exploded", Assert.Throws<InvalidOperationException>(() =>
            ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "artifacts"))).Message);
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
            Assert.Null(captured.Components[0].Name);
            backend.Remove(voxels);
            backend.Remove(voxels);
            backend.Remove(line);
            backend.SetGroupVisible(0, false);
            Assert.True(backend.GetBoundingBox().bIsEmpty());
            backend.SetGroupVisible(0, true);
            backend.Remove(mesh);
            Assert.True(backend.GetBoundingBox().bIsEmpty());
            backend.RemoveAllObjects();
            backend.Complete();
            Assert.Equal(
                "The PicoGK viewer command pump has completed.",
                Assert.Throws<InvalidOperationException>(backend.RequestUpdate).Message);
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
            Assert.Null(duplicate.Components[0].Name);
            Assert.Equal("component:picogk-2", duplicate.Components[0].Id);
            Assert.Null(duplicate.Components[1].Name);
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
    public void NamedOverloadsAndMechanismCaptureFinalSceneWithoutRetainingSource()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
Library.Go(1f, () => {
    var viewer = Library.oViewer();
    var mesh = Utils.mshCreateCube(Vector3.One);
    viewer.Add(mesh, "Assembly/Rotor", 2);
    viewer.Add(mesh, 2); // An unnamed re-add keeps the authored label and object id.
    var line = new PolyLine("abcdef");
    line.Add([Vector3.Zero, Vector3.UnitX]);
    viewer.Add(line, "Assembly/Axis");
    viewer.Add(Voxels.voxSphere(Vector3.Zero, 2), "Assembly/Ball");
    viewer.SetMechanism(new { joints = new[] { new { name = "spin", parent = "Assembly/Rotor" } } });
});
""");
        var result = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "named-artifacts"));
        Assert.Equal(["Assembly/Rotor", "Assembly/Axis", "Assembly/Ball"], result.Components.Select(component => component.Name));
        Assert.Equal(["triangles", "lines", "triangles"], result.Components.Select(component => component.Kind));
        Assert.Equal("component:picogk-1", result.Components[0].Id);
        Assert.Equal("spin", result.Mechanism?.GetProperty("joints")[0].GetProperty("name").GetString());
        Assert.Empty(result.Warnings);
        Assert.Equal(["Assembly/Rotor", "Assembly/Axis", "Assembly/Ball"],
            MeshArtifactWriter.Write(Path.Combine(root, "named-artifacts"), result,
                new WorkerDiagnostics(new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), new WorkerMetrics(0, 0, 0)))
                .Components.Select(component => component.Name));
        Write("main.cs", "using PicoGK; Library.Go(1f, () => { });");
        var next = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "next-artifacts"));
        Assert.False(next.RecycleAfterResponse); // The source type did not root its collectible assembly.
    }

    [Fact]
    public void NamesAndMechanismFollowRemovalClearAndFailureRules()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(Path.Combine(root, "name-lifecycle"));
            using var first = Utils.mshCreateCube(Vector3.One);
            using var second = Utils.mshCreateCube(Vector3.One);
            backend.Add(first, "Part/One", 0);
            backend.Add(second, "Part/One", 0);
            Assert.Equal("CS_TAU_INVALID_NAME", Assert.Throws<WorkerException>(backend.Extract).Issues[0].Code);
            backend.Remove(second);
            backend.Add(first, 0);
            Assert.Equal("Part/One", Assert.Single(backend.Extract().Components).Name);
            var stableId = Assert.Single(backend.Extract().Components).Id;
            backend.Add(first, "Part/Renamed", 0);
            var renamed = Assert.Single(backend.Extract().Components);
            Assert.Equal("Part/Renamed", renamed.Name);
            Assert.Equal(stableId, renamed.Id);
            Assert.Equal("CS_TAU_INVALID_NAME", Assert.Throws<WorkerException>(() => backend.Add(second, " ", 0)).Issues[0].Code);
            var source = new Dictionary<string, int> { ["value"] = 1 };
            backend.SetMechanism(source);
            source["value"] = 99;
            Assert.Equal(1, backend.Extract().Mechanism?.GetProperty("value").GetInt32());
            backend.SetMechanism(new ThrowingMechanism());
            var invalid = backend.Extract();
            Assert.Null(invalid.Mechanism);
            Assert.Equal("CS_TAU_MECHANISM_SERIALIZATION", Assert.Single(invalid.Warnings).Code);
            backend.SetMechanism(new { value = 2 });
            Assert.Equal(2, backend.Extract().Mechanism?.GetProperty("value").GetInt32());
            backend.RemoveAllObjects();
            backend.Add(first, 0);
            var cleared = backend.Extract();
            Assert.Null(Assert.Single(cleared.Components).Name);
            Assert.Null(cleared.Mechanism);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    private sealed class ThrowingMechanism
    {
        public int Value => throw new InvalidOperationException("broken getter");
    }

    private sealed class IndexedMechanism
    {
        public int Value { get; } = 3;
        public int this[int index] => index;
        public int WriteOnly { set { } }
    }

    private enum MechanismMode { Active = 3 }

    private static IEnumerable<int> InfiniteMechanism()
    {
        while (true) yield return 1;
    }

    [Fact]
    public void MechanismProjectionRejectsMalformedJsonAndKeepsSerializableValues()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "mechanism-validation"));
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var mesh = Utils.mshCreateCube(Vector3.One);
            backend.Add(mesh, "Still/Here", 0);
            backend.SetMechanism(new { mode = MechanismMode.Active, details = new IndexedMechanism() });
            Assert.Equal(3, backend.Extract().Mechanism?.GetProperty("mode").GetInt32());
            Assert.Equal(3, backend.Extract().Mechanism?.GetProperty("details").GetProperty("Value").GetInt32());
            backend.SetMechanism(System.Text.Json.Nodes.JsonNode.Parse("{\"joints\":[{\"name\":\"spin\"}]}")!);
            Assert.Equal("spin", backend.Extract().Mechanism?.GetProperty("joints")[0].GetProperty("name").GetString());
            dynamic expando = new System.Dynamic.ExpandoObject();
            expando.joints = new[] { "spin" };
            backend.SetMechanism((object)expando);
            Assert.Equal("spin", backend.Extract().Mechanism?.GetProperty("joints")[0].GetString());

            var cycle = new List<object>();
            cycle.Add(cycle);
            backend.SetMechanism(cycle);
            Assert.Null(backend.Extract().Mechanism);
            backend.SetMechanism(new Hashtable { [1] = "invalid key" });
            Assert.Equal(2, backend.Extract().Warnings.Count);

            object nested = 1;
            for (var index = 0; index < 66; index++) nested = new[] { nested };
            backend.SetMechanism(nested);
            backend.SetMechanism(InfiniteMechanism());
            backend.SetMechanism(new { text = new string('x', 270_000) });
            var invalid = backend.Extract();
            Assert.True(invalid.Warnings.Count == 5, string.Join(" | ", invalid.Warnings.Select(issue => issue.Message)));
            Assert.Null(invalid.Mechanism);
            Assert.Equal("Still/Here", Assert.Single(invalid.Components).Name);

            var execution = new ModelExecutionResult(invalid.Components, 0, false, new ModelTimings(0, 0, 0, 0, 0, 0), invalid.Mechanism, invalid.Warnings);
            var written = MeshArtifactWriter.Write(Path.Combine(root, "mechanism-validation"), execution,
                new WorkerDiagnostics(new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), new WorkerMetrics(0, 0, 0)));
            Assert.Equal(5, written.Warnings?.Count);
            backend.Cancel();
            Assert.Throws<OperationCanceledException>(() => backend.SetMechanism(InfiniteMechanism()));
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
        var result = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "animation-artifacts"));

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
        var accepted = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), Path.Combine(root, "presentation-artifacts"));
        Assert.Single(accepted.Components);

        Write("main.cs", "using PicoGK; Library.Go(1f, () => { }, strLightsFile: \"environment.zip\");");
        var unsupported = Assert.Throws<WorkerException>(() => ModelRunner.Execute(
            CompilationService.Compile(root, "main.cs"),
            Path.Combine(root, "environment-artifacts")));
        Assert.Equal("CS_TAU_VIEWER_CAPABILITY", unsupported.Issues[0].Code);
    }

    [Theory]
    [InlineData(6)]
    [InlineData(64)]
    public void PrismNormalsPreserveFlatFacesAndSmoothRoundSides(int sides)
    {
        var positions = new float[(sides * 2 + 2) * 3];
        for (var ring = 0; ring < 2; ring++)
        for (var side = 0; side < sides; side++)
        {
            var angle = 2 * MathF.PI * side / sides;
            var offset = (ring * sides + side) * 3;
            positions[offset] = MathF.Cos(angle);
            positions[offset + 1] = MathF.Sin(angle);
            positions[offset + 2] = ring;
        }
        positions[(sides * 2 + 1) * 3 + 2] = 1;
        var triangles = new List<uint>();
        for (var side = 0; side < sides; side++)
        {
            var a = (uint)side;
            var b = (uint)((side + 1) % sides);
            var c = a + (uint)sides;
            var d = b + (uint)sides;
            triangles.AddRange([a, b, d, a, d, c, (uint)(sides * 2), b, a, (uint)(sides * 2 + 1), c, d]);
        }
        var indices = triangles.ToArray();
        var original = indices.SelectMany(index => positions.AsSpan((int)index * 3, 3).ToArray()).ToArray();
        float[] normals;
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var mesh = new Mesh();
            for (var vertex = 0; vertex < positions.Length; vertex += 3)
                mesh.nAddVertex(new Vector3(positions[vertex], positions[vertex + 1], positions[vertex + 2]));
            for (var triangle = 0; triangle < indices.Length; triangle += 3)
                mesh.nAddTriangle((int)indices[triangle], (int)indices[triangle + 1], (int)indices[triangle + 2]);
            using var backend = new CaptureViewerBackend(Path.Combine(root, "normal-artifacts"));
            backend.Add(mesh, 0);
            var component = Assert.Single(backend.Extract().Components);
            positions = component.Positions;
            indices = component.Indices;
            normals = component.Normals;
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
        Assert.Equal(original, indices.SelectMany(index => positions.AsSpan((int)index * 3, 3).ToArray()));
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            Vector3 Point(int corner) => new(positions[indices[triangle + corner] * 3], positions[indices[triangle + corner] * 3 + 1], positions[indices[triangle + corner] * 3 + 2]);
            var face = Vector3.Normalize(Vector3.Cross(Point(1) - Point(0), Point(2) - Point(0)));
            for (var corner = 0; corner < 3; corner++)
            {
                var offset = indices[triangle + corner] * 3;
                var actual = new Vector3(normals[offset], normals[offset + 1], normals[offset + 2]);
                var expected = sides == 6 || MathF.Abs(face.Z) > 0.5f
                    ? face
                    : Vector3.Normalize(new Vector3(positions[offset], positions[offset + 1], 0));
                Assert.True(Vector3.Dot(expected, actual) > 0.999f, $"{sides} sides, triangle {triangle / 3}: expected {expected}, got {actual}");
            }
        }
    }

    [Fact]
    public void NormalsKeepPointTouchingFansSeparateAndDegenerateValuesFinite()
    {
        var angle = MathF.PI / 9;
        float[] positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -MathF.Cos(angle), -MathF.Sin(angle), 2, 2, 2, 3, 3, 3];
        uint[] indices = [0, 1, 2, 0, 3, 4, 5, 5, 5];
        var normals = ModelRunner.VertexNormals(ref positions, ref indices);
        Assert.NotEqual(indices[0], indices[3]);
        Vector3 Normal(int corner) => new(normals[indices[corner] * 3], normals[indices[corner] * 3 + 1], normals[indices[corner] * 3 + 2]);
        Assert.Equal(Vector3.UnitZ, Normal(0));
        Assert.True(Vector3.Dot(new Vector3(0, -MathF.Sin(angle), MathF.Cos(angle)), Normal(3)) > 0.999f);
        Assert.All(normals, value => Assert.True(float.IsFinite(value)));
        Assert.Equal(Vector3.UnitZ, Normal(6));
        Assert.Equal(new float[] { 0, 0, 1 }, normals[18..21]); // Unused source vertex.
    }

    [Fact]
    public void BulkReadbackMatchesFallbackAndBoundsCallerBuffers()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var mesh = new Mesh();
            Assert.Empty(mesh.TauCopyGeometry().Positions);
            mesh.nAddVertex(new Vector3(1, 2, 3));
            mesh.nAddVertex(new Vector3(4, 5, 6));
            mesh.nAddVertex(new Vector3(7, 8, 9));
            mesh.nAddTriangle(0, 1, 2);
            var bulk = mesh.TauCopyGeometry(); var fallback = mesh.TauCopyGeometry(false);
            Assert.Equal(1, (int)typeof(Mesh).GetField("m_tauBulkAvailable", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!.GetValue(null)!);
            Assert.Equal(new float[] { 1, 2, 3, 4, 5, 6, 7, 8, 9 }, bulk.Positions);
            Assert.Equal(new uint[] { 0, 1, 2 }, bulk.Indices);
            Assert.Equal(fallback.Positions, bulk.Positions);
            Assert.Equal(fallback.Indices, bulk.Indices);
            var native = NativeLibrary.Load("tau-picogk-readback", typeof(Mesh).Assembly, null);
            try
            {
                var vertices = Marshal.GetDelegateForFunctionPointer<Readback>(NativeLibrary.GetExport(native, "Mesh_GetVertices"));
                var triangles = Marshal.GetDelegateForFunctionPointer<Readback>(NativeLibrary.GetExport(native, "Mesh_GetTriangles"));
                var buffer = Marshal.AllocHGlobal(48);
                try
                {
                    foreach (var read in new[] { vertices, triangles })
                    {
                        for (var offset = 0; offset < 48; offset += 4) Marshal.WriteInt32(buffer, offset, 123456);
                        Assert.Equal(0, read(library.hThis.Value, mesh.hThis.Value, IntPtr.Zero, 100));
                        Assert.Equal(0, read(library.hThis.Value, mesh.hThis.Value, buffer, -1));
                        Assert.Equal(0, read(library.hThis.Value, mesh.hThis.Value, buffer, 0));
                        Assert.Equal(1, read(library.hThis.Value, mesh.hThis.Value, buffer, 1));
                        for (var offset = 12; offset < 48; offset += 4) Assert.Equal(123456, Marshal.ReadInt32(buffer, offset));
                        Assert.Equal(read == vertices ? 3 : 1, read(library.hThis.Value, mesh.hThis.Value, buffer, 100));
                        Assert.Equal(123456, Marshal.ReadInt32(buffer, 36));
                    }
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            finally { NativeLibrary.Free(native); }
            mesh.Dispose();
            Assert.Throws<ObjectDisposedException>(() => mesh.TauCopyGeometry());
            Assert.Throws<ObjectDisposedException>(() => mesh.nAddVertex(Vector3.Zero));
            Assert.Throws<ObjectDisposedException>(() => mesh.nAddTriangle(0, 1, 2));
            using var nonfinite = new Mesh();
            nonfinite.nAddVertex(new Vector3(float.NaN, 0, 0));
            Assert.Equal("PicoGK readback returned a nonfinite vertex.", Assert.Throws<InvalidOperationException>(() => nonfinite.TauCopyGeometry()).Message);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int Readback(long library, long mesh, IntPtr buffer, int capacity);

    [Fact]
    public async Task MeshReadbackFreezesConcurrentMutationAndViewerSnapshots()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var mesh = new Mesh(library);
            mesh.nAddVertex(Vector3.Zero); mesh.nAddVertex(Vector3.UnitX); mesh.nAddVertex(Vector3.UnitY);
            mesh.nAddTriangle(0, 1, 2);
            using var backend = new CaptureViewerBackend(Path.Combine(root, "frozen-mesh"));
            backend.Add(mesh, 0);
            var original = Assert.Single(backend.Extract().Components);
            var mutation = Task.Run(() => {
                for (var index = 0; index < 256; index++) { mesh.nAddVertex(new Vector3(index, 0, 1)); mesh.nAddTriangle(0, 1, index + 3); }
            });
            for (var snapshot = 0; snapshot < 50; snapshot++)
            {
                var geometry = mesh.TauCopyGeometry();
                Assert.All(geometry.Indices, index => Assert.True(index < geometry.Positions.Length / 3));
                Assert.Equal(geometry.Indices, mesh.TauCopyGeometry(false).Indices.Take(geometry.Indices.Length));
            }
            await mutation;
            Assert.Same(original.Positions, Assert.Single(backend.Extract().Components).Positions);
            backend.Add(mesh, 0);
            Assert.Equal(257 * 3, Assert.Single(backend.Extract().Components).Indices.Length);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Fact]
    public void FailedCommandReleasesBarriersAlreadyDrainedIntoItsBatch()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "failed-batch"));
        using var completion = new ManualResetEventSlim();
        using var secondCompletion = new ManualResetEventSlim();
        var ranAfterFailure = false;
        var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
        var applyBatch = typeof(CaptureViewerBackend).GetMethod("ApplyBatch", flags)!;
        var commandType = typeof(CaptureViewerBackend).GetNestedType("ViewerCommand", System.Reflection.BindingFlags.NonPublic)!;
        object Command(Action apply, ManualResetEventSlim? signal = null) => Activator.CreateInstance(commandType, [apply, signal])!;
        var batch = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(commandType))!;
        batch.Add(Command(() => throw new InvalidOperationException("batch failed")));
        batch.Add(Command(() => { }, completion));
        batch.Add(Command(() => ranAfterFailure = true, secondCompletion));
        var failure = Assert.Throws<System.Reflection.TargetInvocationException>(() => applyBatch.Invoke(backend, [batch]));
        Assert.Equal("batch failed", Assert.IsType<InvalidOperationException>(failure.InnerException).Message);
        Assert.True(completion.Wait(TimeSpan.FromSeconds(3)), "A failed command must wake every barrier in its batch.");
        Assert.True(secondCompletion.Wait(TimeSpan.FromSeconds(3)), "Every remaining barrier must wake after the first failure.");
        Assert.False(ranAfterFailure);
        Assert.Equal("batch failed", Assert.Throws<InvalidOperationException>(backend.RequestUpdate).Message);
        Assert.Equal("batch failed", Assert.Throws<InvalidOperationException>(backend.Dispose).Message);
        Assert.Throws<ObjectDisposedException>(() => _ = backend.IsIdle);
        backend.Dispose();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ViewerAdmissionPreservesFailureWhenQueueClosesAfterInitialCheck(bool captureFailure)
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "closing-admission"));
        using var started = new ManualResetEventSlim();
        var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
        var gate = typeof(CaptureViewerBackend).GetField("gate", flags)!.GetValue(backend)!;
        var commands = typeof(CaptureViewerBackend).GetField("commands", flags)!.GetValue(backend)!;
        Exception? admissionError = null;
        var producer = new Thread(() =>
        {
            started.Set();
            try { backend.RequestUpdate(); }
            catch (Exception error) { admissionError = error; }
        }) { IsBackground = true };
        lock (gate)
        {
            producer.Start();
            Assert.True(started.Wait(TimeSpan.FromSeconds(3)));
            // The producer has passed the initial error check and is waiting for this gate.
            Assert.True(SpinWait.SpinUntil(() => (producer.ThreadState & ThreadState.WaitSleepJoin) != 0, TimeSpan.FromSeconds(3)));
            if (captureFailure)
                typeof(CaptureViewerBackend).GetField("pumpError", flags)!.SetValue(backend,
                    System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(new InvalidOperationException("capture failed")));
            commands.GetType().GetMethod("CompleteAdding")!.Invoke(commands, null);
        }
        Assert.True(producer.Join(TimeSpan.FromSeconds(3)), "Closed admission must release the producer.");
        var failure = Assert.IsType<InvalidOperationException>(admissionError);
        if (captureFailure)
        {
            Assert.Equal("capture failed", failure.Message);
            Assert.Equal("capture failed", Assert.Throws<InvalidOperationException>(backend.Dispose).Message);
        }
        else backend.Dispose();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CompletionAndExtractionJoinPumpWhenAnotherCallerHasStartedClosing(bool extract)
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "concurrent-complete"));
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
        // Pause the first closer after marking completed, before it closes the collection.
        typeof(CaptureViewerBackend).GetField("completed", flags)!.SetValue(backend, true);
        var commands = typeof(CaptureViewerBackend).GetField("commands", flags)!.GetValue(backend)!;
        var pump = (Task)typeof(CaptureViewerBackend).GetField("pump", flags)!.GetValue(backend)!;
        var joining = Task.Run(() =>
        {
            started.SetResult();
            if (extract) backend.Extract();
            else backend.Complete();
        });
        try
        {
            await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
            var interval = Task.Delay(TimeSpan.FromMilliseconds(100));
            Assert.Same(interval, await Task.WhenAny(joining, interval));
        }
        finally
        {
            commands.GetType().GetMethod("CompleteAdding")!.Invoke(commands, null);
            await pump.WaitAsync(TimeSpan.FromSeconds(3));
            await joining.WaitAsync(TimeSpan.FromSeconds(3));
        }
        backend.Dispose();
        Assert.Throws<ObjectDisposedException>(() => _ = backend.IsIdle);
    }

    [Fact]
    public void PresentationChangesReuseNormalsAndTextureGeometryButTransformsInvalidateThem()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(Path.Combine(root, "cached-geometry"));
            using var mesh = Utils.mshCreateCube(Vector3.One);
            backend.Add(mesh, "Part", 0);
            var firstScene = backend.Extract();
            var first = Assert.Single(firstScene.Components);
            backend.SetGroupMaterial(0, new ColorFloat("ff0000"), .3f, .4f);
            var recoloredScene = backend.Extract();
            var recolored = Assert.Single(recoloredScene.Components);
            Assert.Equal(new float[] { 1, 0, 0, 1 }, recolored.Color);
            Assert.Equal(.3f, recolored.Metallic);
            Assert.Equal(.4f, recolored.Roughness);
            Assert.Same(first.Positions, recolored.Positions);
            Assert.Same(first.Indices, recolored.Indices);
            Assert.Same(first.Normals, recolored.Normals);
            Assert.Equal(firstScene.NormalGeneration, recoloredScene.NormalGeneration);

            backend.SetGroupMaterial(0, new global::PicoGK.Material { Anisotropy = new() { Strength = .5f } });
            var texturedScene = backend.Extract();
            var textured = Assert.Single(texturedScene.Components);
            Assert.NotNull(textured.TexCoords);
            Assert.NotNull(textured.Tangents);
            Assert.Equal(firstScene.NormalGeneration, texturedScene.NormalGeneration);
            backend.SetGroupMaterial(0, new global::PicoGK.Material { Anisotropy = new() { Strength = .8f } });
            var changedTexture = Assert.Single(backend.Extract().Components);
            Assert.Same(textured.Positions, changedTexture.Positions);
            Assert.Same(textured.Normals, changedTexture.Normals);
            Assert.Same(textured.TexCoords, changedTexture.TexCoords);
            Assert.Same(textured.Tangents, changedTexture.Tangents);
            backend.SetGroupMaterial(0, new ColorFloat("00ff00"), 0, 1);
            Assert.Same(first.Normals, Assert.Single(backend.Extract().Components).Normals);

            var matrix = Matrix4x4.CreateScale(-2, 3, .5f);
            matrix.M21 = .2f;
            backend.SetGroupMatrix(0, matrix);
            var transformed = Assert.Single(backend.Extract().Components);
            Assert.NotSame(first.Normals, transformed.Normals);
            foreach (var corner in Enumerable.Range(0, first.Indices.Length))
            {
                var original = checked((int)first.Indices[corner]) * 3;
                var output = checked((int)transformed.Indices[corner]) * 3;
                var expected = Vector3.Transform(new Vector3(first.Positions[original], first.Positions[original + 1], first.Positions[original + 2]), matrix);
                Assert.Equal(expected, new Vector3(transformed.Positions[output], transformed.Positions[output + 1], transformed.Positions[output + 2]));
            }
            backend.SetGroupMaterial(0, new global::PicoGK.Material { Anisotropy = new() { Strength = .8f } });
            var transformedTexture = Assert.Single(backend.Extract().Components);
            Assert.NotSame(textured.Tangents, transformedTexture.Tangents);
            Assert.NotSame(textured.Normals, transformedTexture.Normals);
            Assert.All(transformedTexture.Tangents!, value => Assert.True(float.IsFinite(value)));
            backend.SetGroupMatrix(0, Matrix4x4.CreateScale(1, 1, 0));
            Assert.All(Assert.Single(backend.Extract().Components).Normals, value => Assert.True(float.IsFinite(value)));
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Fact]
    public void SameDirectionSharedEdgesJoinMatchingEndpoints()
    {
        float[] positions = [0,0,0, 1,0,0, 0,1,0, 0,2,.2f];
        uint[] indices = [0,1,2, 0,1,3];
        var normals = ModelRunner.VertexNormals(ref positions, ref indices);
        Assert.Equal(4 * 3, positions.Length);
        Assert.Equal(indices[0], indices[3]);
        Assert.Equal(indices[1], indices[4]);
        var expected = Vector3.Normalize(new Vector3(0, -.2f, 3));
        Assert.True(Vector3.Distance(expected, new Vector3(normals[0], normals[1], normals[2])) < 1e-6f);
    }

    [Theory]
    [InlineData(128)]
    [InlineData(4096)]
    public void DensePlanarFansRemainSmoothAndPreserveEveryTriangle(int count)
    {
        var positions = new float[(count + 1) * 3];
        var indices = new uint[count * 3];
        for (var side = 0; side < count; side++)
        {
            var angle = MathF.Tau * side / count;
            positions[(side + 1) * 3] = MathF.Cos(angle);
            positions[(side + 1) * 3 + 1] = MathF.Sin(angle);
            indices[side * 3] = 0;
            indices[side * 3 + 1] = (uint)(side + 1);
            indices[side * 3 + 2] = (uint)((side + 1) % count + 1);
        }
        var sourcePositions = positions.ToArray(); var sourceIndices = indices.ToArray();
        var normals = ModelRunner.VertexNormals(ref positions, ref indices, out var sources);
        Assert.Equal(sourcePositions, positions);
        Assert.Equal(sourceIndices, indices);
        Assert.Equal(Enumerable.Range(0, count + 1), sources);
        for (var vertex = 0; vertex <= count; vertex++)
            Assert.Equal(Vector3.UnitZ, new Vector3(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]));
    }

    [Fact]
    public void NonmanifoldEdgesAndDuplicatedPositionSeamsRemainShadingBoundaries()
    {
        float[] positions = [0,0,0, 1,0,0, 0,1,0, 0,2,.1f, 0,3,.2f, 0,0,0, 1,0,0, 0,1,.1f];
        uint[] indices = [0,1,2, 0,1,3, 0,1,4, 5,6,7];
        var sourcePositions = positions.ToArray(); var sourceIndices = indices.ToArray();
        var normals = ModelRunner.VertexNormals(ref positions, ref indices, out var sources);
        Assert.Equal(3, new[] { indices[0], indices[3], indices[6] }.Distinct().Count());
        Assert.NotEqual(indices[0], indices[9]);
        for (var corner = 0; corner < indices.Length; corner++)
        {
            Assert.Equal(sourceIndices[corner], (uint)sources[indices[corner]]);
            for (var axis = 0; axis < 3; axis++)
                Assert.Equal(sourcePositions[sourceIndices[corner] * 3 + axis], positions[indices[corner] * 3 + axis]);
        }
        Assert.All(normals, value => Assert.True(float.IsFinite(value)));
        float[] emptyPositions = []; uint[] emptyIndices = [];
        Assert.Empty(ModelRunner.VertexNormals(ref emptyPositions, ref emptyIndices));
    }

    [Fact]
    public void NormalsAndMixedArtifactLayoutAreDeterministic()
    {
        var positions = new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5 };
        uint[] indices = [0, 1, 2];
        var normals = ModelRunner.VertexNormals(ref positions, ref indices);
        Assert.Equal(new float[] { 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 }, normals);
        var components = new[]
        {
            new ExtractedComponent("component:picogk-1", "triangles", "triangle", [1, 0, 0, 1], 0.2f, 0.8f, positions[..9], normals[..9], [0, 1, 2]),
            new ExtractedComponent("component:picogk-2", "lines", "line", [0, 1, 0, 1], 0, 1, [0, 0, 0, 1, 1, 1], [], [0, 1]),
        };
        var execution = new ModelExecutionResult(components, 2, true, new ModelTimings(0, 0, 0, 0, 0, 0), null, []);
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
{"protocolVersion":7,"requestId":"1","method":"analyze","params":{"entryPath":"main.cs"}}
{"protocolVersion":7,"requestId":"2","method":"build","params":{"entryPath":"main.cs","parameters":{}}}
{"protocolVersion":7,"requestId":"3","method":"shutdown","params":{}}
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
            Assert.Throws<WorkerException>(() => CompilationService.BindParameters(CompilationService.Compile(root, "main.cs"), Json(parameters)));
        }
        CompilationService.BindParameters(CompilationService.Compile(root, "main.cs"), Json("{}"));
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

        var output = Run(arguments, "{\"protocolVersion\":7,\"requestId\":\"2\",\"method\":\"unknown\",\"params\":{}}");
        Assert.Contains("CS_TAU_PROTOCOL", output);
        output = Run(arguments, "{\"protocolVersion\":7,\"requestId\":\"3\",\"method\":\"analyze\",\"params\":{}}");
        Assert.Contains("CS_TAU_RUNTIME", output);
        Assert.DoesNotContain("\"location\":null", output);

        Write("main.cs", "System.Console.WriteLine(1);");
        var valid = Json("{\"entryPath\":\"main.cs\"}");
        Program.ValidateEntryPath(valid, root);
        foreach (var json in new[] { "{}", "{\"entryPath\":\"\"}", "{\"entryPath\":\"../outside.cs\"}", "{\"entryPath\":\"missing.cs\"}", "{\"entryPath\":\"main.txt\"}" })
        {
            Assert.ThrowsAny<Exception>(() => Program.ValidateEntryPath(Json(json), root));
        }
        output = Run(arguments, "{\"protocolVersion\":7,\"requestId\":\"3a\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{}}}");
        Assert.Contains("CS_TAU_NO_SCENE", output);

        Write("main.cs", "using System; using System.Numerics; using PicoGK; Library.Go(1f, () => { Library.oViewer().Add(Utils.mshCreateCube(Vector3.One)); throw new InvalidOperationException(\"failed after start\"); });");
        output = Run(arguments, "{\"protocolVersion\":7,\"requestId\":\"4\",\"method\":\"build\",\"params\":{\"entryPath\":\"main.cs\",\"parameters\":{}}}");
        Assert.Contains("failed after start", output);
    }

    [Fact]
    public void ACancelFrameStopsTheBuildInFlightAndLeavesTheWorkerWarm()
    {
        Write("main.cs", """
using System.ComponentModel.DataAnnotations;
using System.IO;
using System.Numerics;
using System.Threading;
using PicoGK;

Library.Go(2f, () =>
{
    var viewer = Library.oViewer();
    viewer.Add(Utils.mshCreateCube(new Vector3(3, 4, 5)));
    for (var index = 0; index < Params.Iterations; index++)
    {
        File.WriteAllText(Params.SentinelPath, "running");
        viewer.SetGroupMaterial(0, "4f7dd9", 0.2f, 0.7f);
        Thread.Sleep(50);
    }
});

public static class Params
{
    [Range(0, 1000)] public static int Iterations { get; set; } = 0;
    public static string SentinelPath { get; set; } = "";
}
""");
        var sentinel = JsonSerializer.Serialize(Path.Combine(root, "running.txt"));
        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "cancel-artifacts"), "--parent-pid", Environment.ProcessId.ToString() };
        var output = new StringWriter();
        var frames = new[]
        {
            // A cancel with nothing in flight has nothing to stop.
            """{"protocolVersion":7,"requestId":"0","method":"cancel"}""",
            """{"protocolVersion":7,"requestId":"1","method":"build","params":{"entryPath":"main.cs","parameters":{"Iterations":100,"SentinelPath":SENTINEL}}}""".Replace("SENTINEL", sentinel, StringComparison.Ordinal),
            """{"protocolVersion":7,"requestId":"1","method":"cancel"}""",
            """{"protocolVersion":7,"requestId":"2","method":"build","params":{"entryPath":"main.cs","parameters":{"Iterations":0,"SentinelPath":SENTINEL}}}""".Replace("SENTINEL", sentinel, StringComparison.Ordinal),
            """{"protocolVersion":7,"requestId":"3","method":"shutdown","params":{}}""",
        };

        // The cancel is held back until the model is demonstrably running, so it stops a build in flight.
        Assert.Equal(0, Program.Run(arguments, new GatedReader(frames, 2, JsonSerializer.Deserialize<string>(sentinel)!), output, new StringWriter()));

        var responses = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var line in output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var response = JsonDocument.Parse(line).RootElement.Clone();
            if (response.TryGetProperty("requestId", out var requestId)) responses[requestId.GetString()!] = response;
        }
        Assert.Equal("CS_TAU_CANCELLED", responses["1"].GetProperty("error").GetProperty("issues")[0].GetProperty("code").GetString());
        Assert.True(responses["2"].GetProperty("result").GetProperty("byteLength").GetInt32() > 0);
        Assert.True(responses["3"].GetProperty("result").GetProperty("shutdown").GetBoolean());
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
            Console.SetIn(new StringReader("{\"protocolVersion\":7,\"requestId\":\"main\",\"method\":\"shutdown\",\"params\":{}}"));
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

    /// <summary>Holds one frame back until the running model has written its sentinel.</summary>
    private sealed class GatedReader(string[] lines, int gatedIndex, string sentinel) : TextReader
    {
        private int index;

        public override string? ReadLine()
        {
            if (index >= lines.Length) return null;
            if (index == gatedIndex)
            {
                var deadline = DateTime.UtcNow.AddSeconds(10);
                while (!File.Exists(sentinel) && DateTime.UtcNow < deadline) Thread.Sleep(5);
            }
            return lines[index++];
        }
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
