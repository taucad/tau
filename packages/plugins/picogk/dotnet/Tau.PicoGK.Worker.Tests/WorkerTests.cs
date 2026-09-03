using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using PicoGK;
using Tau.PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed class WorkerTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"tau-picogk-csharp-{Guid.NewGuid():N}");

    public WorkerTests() => Directory.CreateDirectory(root);

    public void Dispose() => Directory.Delete(root, recursive: true);

    [Fact]
    public void AuthoringModelValidatesAndTransfersOwnership()
    {
        var firstGeometry = new DisposableGeometry();
        var secondGeometry = new DisposableGeometry();
        var first = new TauComponent(" First ", firstGeometry, "AABBCC", TauGeometryKind.Mesh);
        var second = new TauComponent("Second", secondGeometry, "#11223344", TauGeometryKind.Voxels);
        Assert.Equal("First", first.Name);
        Assert.Equal("#aabbccff", first.Color);
        Assert.Equal("#11223344", second.Color);
        using (var model = TauModel.Create(first, second))
        {
            Assert.Equal([first, second], model.Components);
            Assert.Throws<InvalidOperationException>(() => TauModel.Create(first));
            model.Dispose();
        }
        Assert.True(firstGeometry.Disposed);
        Assert.True(secondGeometry.Disposed);
        first.Dispose();
    }

    [Fact]
    public void AuthoringModelRejectsInvalidComponents()
    {
        Assert.Throws<ArgumentNullException>(() => new TauComponent("x", null!, "#ffffff", TauGeometryKind.Mesh));
        Assert.Throws<ArgumentException>(() => new TauComponent(" ", new DisposableGeometry(), "#ffffff", TauGeometryKind.Mesh));
        Assert.Throws<ArgumentNullException>(() => new TauComponent("x", new DisposableGeometry(), null!, TauGeometryKind.Mesh));
        foreach (var color in new[] { "#fff", "#gggggg", "#123456789" })
            Assert.Throws<ArgumentException>(() => new TauComponent("x", new DisposableGeometry(), color, TauGeometryKind.Mesh));
        Assert.Throws<ArgumentNullException>(() => TauModel.Create(null!));
        Assert.Throws<ArgumentException>(() => TauModel.Create());
        Assert.Throws<ArgumentNullException>(() => TauModel.Create([null!]));
        var shared = new DisposableGeometry();
        Assert.Throws<ArgumentException>(() => TauModel.Create(
            new TauComponent("a", shared, "#ffffff", TauGeometryKind.Mesh),
            new TauComponent("b", shared, "#ffffff", TauGeometryKind.Mesh)));
        Assert.Throws<ArgumentException>(() => TauModel.Create(
            new TauComponent("same", new DisposableGeometry(), "#ffffff", TauGeometryKind.Mesh),
            new TauComponent("same", new DisposableGeometry(), "#ffffff", TauGeometryKind.Mesh)));
    }

    [Fact]
    public void CompilationExtractsOrderedScalarAndEnumParametersDeterministically()
    {
        Write("main.cs", Canonical(@"
public enum Finish { Rough, Smooth }
public bool Enabled { get; init; } = true;
[Display(Name = ""Radius"", Description = ""mm"", Order = -1), Range(2, 20)] public double RadiusMm { get; init; } = 8;
public int Count { get; init; } = 2;
[Range(typeof(int), ""1"", ""2"")] public int AlternateRange { get; init; } = 1;
public string Label { get; init; } = ""part"";
public Finish FinishMode { get; init; } = Finish.Smooth;"));
        var first = CompilationService.Compile(root);
        var second = CompilationService.Compile(root);
        Assert.False(first.Timings.CacheHit);
        Assert.True(second.Timings.CacheHit);
        Assert.All(new[] { first.Timings.SourceRead, first.Timings.Parse, first.Timings.Analyze, first.Timings.Emit }, value => Assert.True(value >= 0));
        Assert.Equal(first.Assembly, second.Assembly);
        Assert.Equal(first.Pdb, second.Pdb);
        Assert.Equal(1f, first.Defaults["VoxelSizeMm"]);
        Assert.Equal("Smooth", first.Defaults["FinishMode"]);
        var properties = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(first.JsonSchema["properties"]);
        Assert.Equal("Radius", Assert.IsAssignableFrom<IDictionary<string, object?>>(properties["RadiusMm"])["title"]);
        Assert.Equal(new[] { "Rough", "Smooth" }, Assert.IsAssignableFrom<IDictionary<string, object?>>(properties["FinishMode"])["enum"]);

        Write("main.cs", Canonical("public int Changed { get; init; } = 7;"));
        Assert.False(CompilationService.Compile(root).Timings.CacheHit);
    }

    [Fact]
    public void CompilationSupportsMultipleFilesAndReportsSourceDiagnostics()
    {
        Write("main.cs", Canonical("public int Count { get; init; } = Helper.Value;"));
        Write("Helper.cs", "public static class Helper { public const int Value = 3; }");
        Assert.Equal(3, CompilationService.Compile(root).Defaults["Count"]);
        Write("Helper.cs", "public static class Helper {");
        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));
        Assert.Equal("CS1513", error.Issues[0].Code);
        Assert.Equal("Helper.cs", error.Issues[0].Location?.FileName);
        Assert.True(error.Issues[0].Location?.StartLineNumber > 0);
    }

    [Theory]
    [MemberData(nameof(InvalidContracts))]
    public void CompilationRejectsInvalidContracts(string source, string message)
    {
        Write("main.cs", source);
        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root));
        Assert.Contains(message, error.Message, StringComparison.Ordinal);
    }

    public static TheoryData<string, string> InvalidContracts => new()
    {
        { "public static class Model {}", "Params" },
        { "public record Nested { public sealed record Params { public float VoxelSizeMm { get; init; } = 1f; } } public static class Model {}", "exactly one" },
        { "public sealed record Params(float VoxelSizeMm); public static class Model {}", "non-positional" },
        { Canonical("private int Hidden { get; init; } = 1;"), "public init" },
        { Canonical("public int Mutable { get; set; } = 1;"), "public init" },
        { Canonical("public int Readonly { get; } = 1;"), "public init" },
        { Canonical("public System.DateTime When { get; init; } = default;"), "unsupported type" },
        { Canonical("public float Missing { get; init; }"), "compile-time default" },
        { Canonical("public string Missing { get; init; } = null!;"), "non-null" },
        { Canonical("public float VoxelSizeMm { get; init; } = 0f;", includeVoxel: false), "positive finite" },
        { Canonical("[Range(2, 1)] public float Radius { get; init; } = 1f;"), "Range" },
        { Canonical("[Range(2, 3)] public float Radius { get; init; } = 1f;"), "violates" },
        { Canonical("[Range(1, 2)] public string Label { get; init; } = \"x\";"), "requires a numeric" },
        { "public sealed record Params { public float VoxelSizeMm { get; init; } = 1f; }", "Model" },
        { "public sealed record Params { public float VoxelSizeMm { get; init; } = 1f; } public static class Model { public static object Build(Params p) => new(); }", "Build" },
        { "public sealed record Params { public float VoxelSizeMm { get; init; } = 1f; } public static class Model { private static Tau.PicoGK.TauModel Build(Params p) => null!; public static Tau.PicoGK.TauModel Build() => null!; public static Tau.PicoGK.TauModel Build(string p) => null!; }", "Build" },
    };

    [Fact]
    public void CompilationEnforcesProjectLimits()
    {
        Assert.Contains("no C#", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);
        for (var index = 0; index < 257; index++) Write($"{index}.cs", "public static class C" + index + " {}");
        Assert.Contains("256", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);
        Directory.Delete(root, recursive: true);
        Directory.CreateDirectory(root);
        Write("main.cs", new string(' ', 1024 * 1024 + 1));
        Assert.Contains("byte limit", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message);
    }

    [Fact]
    public void ParameterBindingUsesDefaultsAndValidatesEveryWireType()
    {
        Write("main.cs", Canonical(@"
public enum Finish { Rough, Smooth }
public bool Enabled { get; init; } = true;
[Range(1, 5)] public int Count { get; init; } = 2;
public double Ratio { get; init; } = 0.5;
public string Label { get; init; } = ""part"";
public Finish FinishMode { get; init; } = Finish.Rough;"));
        var definitions = CompilationService.Compile(root).Contract.Parameters;
        var values = ModelRunner.BindParameters(definitions, Json("""{"VoxelSizeMm":2,"Enabled":false,"Count":4,"Ratio":1.25,"Label":"ok","FinishMode":"Smooth"}"""));
        Assert.Equal(2f, values["VoxelSizeMm"]);
        Assert.Equal(false, values["Enabled"]);
        Assert.Equal("Smooth", values["FinishMode"]);
        Assert.Equal("Rough", ModelRunner.BindParameters(definitions, Json("{}"))["FinishMode"]);

        foreach (var json in new[]
        {
            "[]", "{\"Unknown\":1}", "{\"Count\":6}", "{\"Count\":1.2}", "{\"Enabled\":1}",
            "{\"Ratio\":\"x\"}", "{\"Label\":1}", "{\"FinishMode\":\"Other\"}", "{\"FinishMode\":1}", "{\"VoxelSizeMm\":0}"
        }) Assert.Throws<WorkerException>(() => ModelRunner.BindParameters(definitions, Json(json)));
    }

    [Fact]
    public void NormalsAndArtifactLayoutAreDeterministicAndValidated()
    {
        var positions = new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5 };
        var normals = ModelRunner.VertexNormals(positions, [0, 1, 2]);
        Assert.Equal(new float[] { 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 }, normals);
        var components = new[] { new ExtractedComponent("triangle", "#ffffffff", positions[..9], normals[..9], [0, 1, 2]) };
        var execution = new ModelExecutionResult(components, true, new ModelTimings(0, 0, 0, 0, 0));
        var result = MeshArtifactWriter.Write(
            root,
            execution,
            new WorkerDiagnostics(
                new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
                new WorkerMetrics(1, 2, 3)));
        Assert.True(result.RecycleAfterResponse);
        Assert.Equal(84, result.ByteLength);
        Assert.Equal(0, result.Components[0].PositionOffset);
        Assert.Equal(36, result.Components[0].NormalOffset);
        Assert.Equal(72, result.Components[0].IndexOffset);
        Assert.Equal("triangle", result.Components[0].Name);
        Assert.Equal("#ffffffff", result.Components[0].Color);
        Assert.Equal(9, result.Components[0].PositionCount);
        Assert.Equal(9, result.Components[0].NormalCount);
        Assert.Equal(3, result.Components[0].IndexCount);
        Assert.Equal(1, result.Metrics.ManagedHeapBytes);
        Assert.Equal(2, result.Metrics.PicoGkNativeBytes);
        Assert.Equal(3, result.Metrics.ProcessWorkingSetBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(result.ArtifactPath))).ToLowerInvariant(), result.Sha256);
    }

    [Fact]
    public void ModelRunnerJitsAndExtractsRealMeshAndVoxelComponents()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
using Tau.PicoGK;
public sealed record Params
{
    public enum Finish { Rough, Smooth }
    public float VoxelSizeMm { get; init; } = 2f;
    public float RadiusMm { get; init; } = 4f;
    public Finish FinishMode { get; init; } = Finish.Smooth;
    public static int IgnoredStatic { get; } = 1;
}
public static class Model
{
    public static TauModel Build(Params p) => TauModel.Create(
        TauComponent.FromMesh("Box", Utils.mshCreateCube(new Vector3(4, 6, 8)), "#112233"),
        TauComponent.FromVoxels("Sphere", Voxels.voxSphere(Vector3.Zero, p.RadiusMm), "#abcdef80"));
}
""");
        var compiled = CompilationService.Compile(root);
        Assert.Equal("Params", compiled.Contract.ParamsType.Name);
        Assert.Equal("Build", compiled.Contract.BuildMethod.Name);
        var values = ModelRunner.BindParameters(compiled.Contract.Parameters, Json("""{"RadiusMm":5,"FinishMode":"Rough"}"""));
        using var library = new Library(2f);
        Library.RegisterGlobalLibrary(library);
        Library.RegisterGlobalLog(new LogConsole());
        try
        {
            var result = ModelRunner.Execute(compiled, values);
            Assert.False(result.RecycleAfterResponse);
            Assert.All(new[]
            {
                result.Timings.ModelInvoke,
                result.Timings.MeshConstruction,
                result.Timings.MeshExtraction,
                result.Timings.NormalGeneration,
                result.Timings.Unload,
            }, value => Assert.True(value >= 0));
            Assert.Equal(new[] { "Box", "Sphere" }, result.Components.Select(component => component.Name));
            Assert.All(result.Components, component =>
            {
                Assert.NotEmpty(component.Positions);
                Assert.Equal(component.Positions.Length, component.Normals.Length);
                Assert.NotEmpty(component.Indices);
            });
        }
        finally
        {
            Library.UnregisterGlobalLog();
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void ModelRunnerPreservesUserExceptionsAndRejectsNullModels()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            Write("main.cs", Canonical(string.Empty).Replace(
                "throw new System.NotImplementedException()",
                "throw new System.InvalidOperationException(\"model exploded\")",
                StringComparison.Ordinal));
            var throwing = CompilationService.Compile(root);
            var values = ModelRunner.BindParameters(throwing.Contract.Parameters, Json("{}"));
            Assert.Contains("model exploded", Assert.Throws<InvalidOperationException>(() => ModelRunner.Execute(throwing, values)).Message);
            Assert.Contains("not found", Assert.Throws<WorkerException>(() => ModelRunner.Execute(
                throwing,
                new Dictionary<string, object?>(values) { ["Unknown"] = 1 })).Message);

            Write("main.cs", Canonical(string.Empty).Replace(
                "throw new System.NotImplementedException()",
                "null!",
                StringComparison.Ordinal));
            var nullModel = CompilationService.Compile(root);
            values = ModelRunner.BindParameters(nullModel.Contract.Parameters, Json("{}"));
            Assert.Contains("returned null", Assert.Throws<WorkerException>(() => ModelRunner.Execute(nullModel, values)).Message);
        }
        finally
        {
            Library.UnregisterGlobalLibrary();
        }
    }

    [Fact]
    public void ProgramHandlesProtocolAndArgumentBoundaries()
    {
        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "artifacts"), "--parent-pid", Environment.ProcessId.ToString() };
        var parsed = Program.ParseArguments(arguments);
        Assert.Equal(Path.GetFullPath(root), parsed.Workspace);
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["workspace", root]));
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["--workspace"]));
        Assert.Throws<ArgumentException>(() => Program.ParseArguments(["--workspace", root, "--workspace", root]));
        Assert.Throws<KeyNotFoundException>(() => Program.ParseArguments(["--workspace", root]));

        var output = new StringWriter();
        var error = new StringWriter();
        Assert.Equal(0, Program.Run(arguments, new StringReader("""{"protocolVersion":1,"requestId":"1","method":"shutdown","params":{}}"""), output, error));
        Assert.Contains("\"type\":\"ready\"", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("\"shutdown\":true", output.ToString(), StringComparison.Ordinal);

        Assert.Equal(2, Program.Run(arguments, new StringReader("{"), new StringWriter(), error));
        Assert.NotEmpty(error.ToString());
        Assert.Equal(2, Program.Run(arguments, new StringReader("null"), new StringWriter(), new StringWriter()));
        Assert.Equal(2, Program.Run(arguments, new StringReader("""{"protocolVersion":2,"requestId":"1","method":"x","params":{}}"""), new StringWriter(), new StringWriter()));
        Assert.Equal(2, Program.Run(arguments, new StringReader(new string('x', 1_048_577)), new StringWriter(), new StringWriter()));

        output = new StringWriter();
        Assert.Equal(0, Program.Run(arguments, new StringReader("""{"protocolVersion":1,"requestId":"2","method":"unknown","params":{}}"""), output, new StringWriter()));
        Assert.Contains("CS_TAU_PROTOCOL", output.ToString(), StringComparison.Ordinal);
        output = new StringWriter();
        Assert.Equal(0, Program.Run(arguments, new StringReader("""{"protocolVersion":1,"requestId":"3","method":"analyze","params":{}}"""), output, new StringWriter()));
        Assert.Contains("CS_TAU_RUNTIME", output.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("\"location\":null", output.ToString(), StringComparison.Ordinal);

        var originalInput = Console.In;
        var originalOutput = Console.Out;
        var originalError = Console.Error;
        try
        {
            Console.SetIn(new StringReader("""{"protocolVersion":1,"requestId":"main","method":"shutdown","params":{}}"""));
            var mainOutput = new StringWriter();
            Console.SetOut(mainOutput);
            Console.SetError(new StringWriter());
            var main = typeof(Program).GetMethod("Main", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            Assert.Equal(0, main.Invoke(null, [arguments]));
            Assert.Contains("\"shutdown\":true", mainOutput.ToString(), StringComparison.Ordinal);
        }
        finally
        {
            Console.SetIn(originalInput);
            Console.SetOut(originalOutput);
            Console.SetError(originalError);
        }
    }

    [Fact]
    public void ProgramValidatesEntryPathsAndAnalyzesAProject()
    {
        Write("main.cs", Canonical(string.Empty));
        var valid = Json("""{"entryPath":"main.cs"}""");
        Program.ValidateEntryPath(valid, root);
        foreach (var json in new[] { "{}", "{\"entryPath\":\"\"}", "{\"entryPath\":\"../outside.cs\"}", "{\"entryPath\":\"missing.cs\"}", "{\"entryPath\":\"main.txt\"}" })
            Assert.ThrowsAny<Exception>(() => Program.ValidateEntryPath(Json(json), root));

        var arguments = new[] { "--workspace", root, "--artifacts", Path.Combine(root, "artifacts"), "--parent-pid", Environment.ProcessId.ToString() };
        var output = new StringWriter();
        Assert.Equal(0, Program.Run(arguments, new StringReader("""{"protocolVersion":1,"requestId":"4","method":"analyze","params":{"entryPath":"main.cs"}}"""), output, new StringWriter()));
        Assert.Contains("defaultParameters", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("timings", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void ProgramBuildsRealPicoGkAndRunsItsParentWatchdog()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
using Tau.PicoGK;
public sealed record Params { public float VoxelSizeMm { get; init; } = 2f; }
public static class Model
{
    public static TauModel Build(Params p) => TauModel.Create(
        TauComponent.FromMesh("Box", Utils.mshCreateCube(new Vector3(3, 4, 5))));
}
""");
        var artifacts = Path.Combine(root, "artifacts");
        var arguments = new[] { "--workspace", root, "--artifacts", artifacts, "--parent-pid", Environment.ProcessId.ToString() };
        var output = new StringWriter();
        var request = """{"protocolVersion":1,"requestId":"5","method":"build","params":{"entryPath":"main.cs","parameters":{}}}""";
        Assert.Equal(0, Program.Run(arguments, new StringReader(request), output, new StringWriter()));
        Assert.Contains("artifactPath", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("modelInvoke", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("meshExtraction", output.ToString(), StringComparison.Ordinal);
        Assert.Contains("artifactWrite", output.ToString(), StringComparison.Ordinal);
        Assert.Single(Directory.GetFiles(artifacts, "*.tau-mesh"));

        Assert.True(Program.ParentIsAlive(Environment.ProcessId));
        Assert.False(Program.ParentIsAlive(int.MaxValue));
        var terminated = new ManualResetEventSlim();
        var checks = new Queue<bool>([true, false]);
        var watcher = Program.StartParentWatch(1, terminated.Set, _ => checks.Dequeue(), pollMilliseconds: 1);
        Assert.True(terminated.Wait(TimeSpan.FromSeconds(1)));
        watcher.Join();

        Assert.False(Program.DisposeLibrary(null, new StringWriter()));
        var cleanupError = new StringWriter();
        Assert.True(Program.DisposeLibrary(new ThrowingDisposable(), cleanupError));
        Assert.Contains("cleanup failed", cleanupError.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public void CompilationCoversDepthConstructorAndDiagnosticBounds()
    {
        var nested = string.Concat(Enumerable.Repeat("(", 520)) + "1" + string.Concat(Enumerable.Repeat(")", 520));
        Write("main.cs", Canonical($"public int Deep {{ get; init; }} = {nested};"));
        Assert.Contains("depth", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message, StringComparison.OrdinalIgnoreCase);

        Write("main.cs", Canonical("private Params() {}"));
        Assert.Contains("parameterless", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message, StringComparison.OrdinalIgnoreCase);

        Write("main.cs", Canonical(string.Join(Environment.NewLine, Enumerable.Range(0, 257).Select(index => $"public int P{index} {{ get; init; }} = Missing{index};"))));
        Assert.Contains("diagnostics", Assert.Throws<WorkerException>(() => CompilationService.Compile(root)).Message, StringComparison.OrdinalIgnoreCase);
        Assert.Throws<InvalidOperationException>(() => CompilationService.CreateReferences(null));
    }

    [Fact]
    public void ProtocolErrorsRetainStructuredIssues()
    {
        var issue = new Issue("bad", "CS_TEST", "validation", "error", new Location("main.cs", 2, 3));
        var single = new WorkerException(issue);
        var multiple = new WorkerException([issue, issue]);
        Assert.Equal([issue], single.Issues);
        Assert.Equal("bad; bad", multiple.Message);
    }

    private void Write(string path, string content)
    {
        var target = Path.Combine(root, path);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllText(target, content);
    }

    private static JsonElement Json(string value) => JsonDocument.Parse(value).RootElement.Clone();

    private static string Canonical(string properties, bool includeVoxel = true) => $$"""
using System.ComponentModel.DataAnnotations;
using Tau.PicoGK;
public sealed record Params
{
    {{(includeVoxel ? "public float VoxelSizeMm { get; init; } = 1f;" : string.Empty)}}
    {{properties}}
}
public static class Model
{
    public static TauModel Build(Params p) => throw new System.NotImplementedException();
}
""";

    private sealed class DisposableGeometry : IDisposable
    {
        public bool Disposed { get; private set; }
        public void Dispose() => Disposed = true;
    }

    private sealed class ThrowingDisposable : IDisposable
    {
        public void Dispose() => throw new InvalidOperationException("cleanup failed");
    }
}
