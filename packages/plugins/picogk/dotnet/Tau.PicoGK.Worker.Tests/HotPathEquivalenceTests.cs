using System.Numerics;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

// Each hot-path rewrite is held to the output of the code it replaced.
public sealed partial class WorkerTests
{
    [Fact]
    public void CountingEdgeSortOrdersKeysAndKeepsEachKeysCornersLikeTheComparisonSort()
    {
        var random = new Random(20261023);
        foreach (var (vertexCount, edgeCount) in new[] { (1, 0), (1, 1), (2, 2), (5, 40), (300, 2000), (70000, 9000) })
        {
            var edges = new ulong[edgeCount];
            for (var index = 0; index < edgeCount; index++)
            {
                if (random.Next(9) == 0)
                {
                    edges[index] = ulong.MaxValue;
                    continue;
                }
                var first = (uint)random.Next(vertexCount);
                var second = (uint)random.Next(vertexCount);
                edges[index] = ((ulong)Math.Min(first, second) << 32) | Math.Max(first, second);
            }
            var corners = Enumerable.Range(0, edgeCount).ToArray();
            var expectedEdges = (ulong[])edges.Clone();
            var expectedCorners = (int[])corners.Clone();
            Array.Sort(expectedEdges, expectedCorners);
            ModelRunner.SortEdges(edges, corners, vertexCount);
            Assert.Equal(expectedEdges, edges);
            // Pairing reads each key's corners as a set; the corners stay attached to their keys.
            Assert.Equal(Group(expectedEdges, expectedCorners), Group(edges, corners));
        }

        static string[] Group(ulong[] edges, int[] corners) => edges.Zip(corners)
            .GroupBy(pair => pair.First)
            .Select(group => $"{group.Key}:{string.Join(',', group.Select(pair => pair.Second).Order())}")
            .ToArray();
    }

    [Fact]
    public void SingleWalkSyntaxDepthRefusesExactlyWhereAncestorCountingDid()
    {
        string Nested(int depth) => "var value = " + new string('(', depth) + "1" + new string(')', depth) + ";";
        string Directive(int depth) => "#if " + new string('(', depth) + "A" + new string(')', depth) + "\nclass C {}\n#endif\n";
        string Documented(int depth) => "/// <summary>" + string.Concat(Enumerable.Repeat("<b>", depth)) + "x" +
            string.Concat(Enumerable.Repeat("</b>", depth)) + "</summary>\nclass D {}\n";
        foreach (var source in new[] { 495, 500, 503, 504, 505, 506, 510 }.SelectMany(depth =>
                     new[] { Nested(depth), Directive(depth + 4), Documented(depth) }))
        {
            var tree = CSharpSyntaxTree.ParseText(source,
                new CSharpParseOptions(documentationMode: DocumentationMode.Diagnose));
            var ancestors = tree.GetRoot().DescendantNodes(descendIntoTrivia: true)
                .Select(node => node.Ancestors().Count())
                .DefaultIfEmpty(0)
                .Max();
            if (ancestors > 512)
            {
                var error = Assert.Throws<WorkerException>(() => CompilationService.AssertSyntaxDepth(tree));
                Assert.Equal("CS_TAU_COMPILATION", error.Issues[0].Code);
            }
            else
            {
                CompilationService.AssertSyntaxDepth(tree);
            }
        }
    }

    [Fact]
    public void TemplateCompilationEmitsAndDiagnosesExactlyAsAFreshCompilation()
    {
        var service = typeof(CompilationService);
        var template = ((Lazy<CSharpCompilation>)service.GetField("Template", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!).Value;
        var references = CompilationService.CreateReferences(AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string);
        var options = new CSharpCompilationOptions(
            OutputKind.ConsoleApplication,
            optimizationLevel: OptimizationLevel.Release,
            deterministic: true,
            allowUnsafe: false);
        Assert.Equal(options, template.Options);
        Assert.Equal("TauUserModel", template.AssemblyName);
        Assert.Empty(template.SyntaxTrees);
        foreach (var source in new[]
                 {
                     "using PicoGK; using System.Numerics; Library.Go(1f, () => { using var s = Voxels.voxSphere(Library.oLibrary(), Vector3.Zero, 4f); Library.oViewer().Add(s); }); public static class Params { public static float Radius { get; set; } = 4; }",
                     "int x = \"text\"; Missing.Call(); class C { void M() { undefined(); } }",
                     "class Broken {",
                 })
        {
            var tree = CSharpSyntaxTree.ParseText(SourceText.From(source, Encoding.UTF8), path: "main.cs");
            var fresh = CSharpCompilation.Create("TauUserModel", [tree], references, options);
            var derived = template.AddSyntaxTrees(tree);
            // Method bodies bind concurrently, so even one compilation's diagnostic order varies run to run; compare the set.
            Assert.Equal(Describe(fresh.GetDiagnostics()).Order(), Describe(derived.GetDiagnostics()).Order());
            var (freshEmit, freshBytes) = Emit(fresh);
            var (derivedEmit, derivedBytes) = Emit(derived);
            Assert.Equal(freshEmit.Success, derivedEmit.Success);
            // Emit reports method-body errors in completion order, so only their set is stable; refusals use GetDiagnostics.
            Assert.Equal(Describe(freshEmit.Diagnostics).Order(), Describe(derivedEmit.Diagnostics).Order());
            Assert.Equal(freshBytes, derivedBytes);
            // A failed emit is refused with GetDiagnostics' errors, in its order, as before.
            Assert.Equal(freshEmit.Success, !fresh.GetDiagnostics().Any(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error));
        }

        static string[] Describe(IEnumerable<Diagnostic> diagnostics) => diagnostics.Select(diagnostic => diagnostic.ToString()).ToArray();

        static (Microsoft.CodeAnalysis.Emit.EmitResult Result, byte[] Bytes) Emit(CSharpCompilation compilation)
        {
            using var assembly = new MemoryStream();
            using var pdb = new MemoryStream();
            var result = compilation.Emit(assembly, pdbStream: pdb);
            return (result, [.. assembly.ToArray(), .. pdb.ToArray()]);
        }
    }

    [Fact]
    public void CompileRefusesWithCompilationErrorsBeforeParameterAnalysis()
    {
        Write("main.cs", "int x = \"text\"; public static class Params { public static int Value { get; set; } = 1; public static int Other { get; set; } = 2; }");
        var error = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
        Assert.Equal("CS0029", error.Issues[0].Code);
        Assert.Equal(1, error.Issues[0].Location!.StartLineNumber);
    }

    [Fact]
    public void ProtocolFramesParseOnceIntoARequestOrTheirRefusal()
    {
        var oversized = Program.ParseFrame(new string(' ', 1_048_577));
        Assert.True(oversized.Oversized);
        Assert.Null(oversized.Request);
        var malformed = Program.ParseFrame("{");
        Assert.False(malformed.Oversized);
        Assert.Null(malformed.Request);
        Assert.False(string.IsNullOrEmpty(malformed.Error));
        Assert.Equal("Request was null.", Program.ParseFrame("null").Error);
        var cancel = Program.ParseFrame("""{"protocolVersion":8,"requestId":"a","method":"cancel","params":{}}""");
        Assert.Equal("cancel", cancel.Request!.Method);
        Assert.Null(cancel.Error);
    }

    [Fact]
    public void BuildMeshingParsesOnlyTheDeclaredShape()
    {
        Assert.Null(Program.ParseMeshing(Json("""{"entryPath":"main.cs"}""")));
        Assert.Null(Program.ParseMeshing(Json("""{"meshing":{"adaptivity":0,"relax":true}}""")));
        Assert.Equal(new MeshingOptions(.5f, true), Program.ParseMeshing(Json("""{"meshing":{"adaptivity":0.5,"relax":true}}""")));
        Assert.Equal(new MeshingOptions(.25f, false), Program.ParseMeshing(Json("""{"meshing":{"relax":false,"adaptivity":0.25}}""")));
        foreach (var invalid in new[]
                 {
                     """{"meshing":null}""", """{"meshing":0.5}""", """{"meshing":{}}""",
                     """{"meshing":{"adaptivity":"0.5","relax":false}}""", """{"meshing":{"adaptivity":1,"relax":false}}""",
                     """{"meshing":{"adaptivity":-0.1,"relax":false}}""", """{"meshing":{"adaptivity":1e39,"relax":false}}""",
                     """{"meshing":{"adaptivity":0.5}}""", """{"meshing":{"adaptivity":0.5,"relax":"yes"}}""",
                     """{"meshing":{"adaptivity":0.5,"relax":false,"extra":1}}""",
                 })
        {
            var error = Assert.Throws<WorkerException>(() => Program.ParseMeshing(Json(invalid)));
            Assert.Equal("CS_TAU_PROTOCOL", error.Issues[0].Code);
        }
    }

    [Fact]
    public void AdaptiveMeshingReducesCapturedVoxelsAndIsEchoedInTheBuild()
    {
        Write("main.cs", "using PicoGK;using System.Numerics;Library.Go(.5f,()=>{using var shape=Voxels.voxSphere(Library.oLibrary(),Vector3.Zero,8f);Library.oViewer().Add(shape);});");
        var compiled = CompilationService.Compile(root, "main.cs");
        var uniform = ModelRunner.Execute(compiled, Path.Combine(root, "uniform"));
        var adaptive = ModelRunner.Execute(compiled, Path.Combine(root, "adaptive"), meshing: new MeshingOptions(.5f, false));
        var relaxed = ModelRunner.Execute(compiled, Path.Combine(root, "relaxed"), meshing: new MeshingOptions(.5f, true));
        var again = ModelRunner.Execute(compiled, Path.Combine(root, "again"));
        Assert.Null(uniform.Meshing);
        Assert.Equal(new MeshingOptions(.5f, false), adaptive.Meshing);
        Assert.True(adaptive.Components[0].Indices.Length < uniform.Components[0].Indices.Length);
        Assert.Equal(new MeshingOptions(.5f, true), relaxed.Meshing);
        Assert.NotEmpty(relaxed.Components[0].Indices);
        // Meshing belongs to one build: the next uniform build is the uniform mesh again.
        Assert.Equal(uniform.Components[0].Positions, again.Components[0].Positions);
        Assert.Equal(uniform.Components[0].Indices, again.Components[0].Indices);

        string Build(object? meshing)
        {
            var input = JsonSerializer.Serialize(new { protocolVersion = 8, requestId = "m", method = "build", @params = meshing is null ? (object)new { entryPath = "main.cs", parameters = new { } } : new { entryPath = "main.cs", parameters = new { }, meshing } }) + "\n";
            var output = new StringWriter();
            Assert.Equal(0, Program.Run(["--workspace", root, "--artifacts", root, "--parent-pid", Environment.ProcessId.ToString()], new StringReader(input), output, new StringWriter()));
            return output.ToString().TrimEnd('\n').Split('\n')[^1];
        }
        var echoed = JsonDocument.Parse(Build(new { adaptivity = .5, relax = true })).RootElement.GetProperty("result").GetProperty("meshing");
        Assert.Equal(.5f, echoed.GetProperty("adaptivity").GetSingle());
        Assert.True(echoed.GetProperty("relax").GetBoolean());
        Assert.False(JsonDocument.Parse(Build(null)).RootElement.GetProperty("result").TryGetProperty("meshing", out _));
    }

    [Fact]
    public void LibraryMeshingRefusesValuesOutsideItsRange()
    {
        using var library = new Library(1f);
        foreach (var value in new[] { -.1f, 1f, float.NaN, float.PositiveInfinity })
            Assert.Throws<ArgumentOutOfRangeException>(() => library.TauSetMeshing(value, false));
        library.TauSetMeshing(0f, true);
    }

    [Fact]
    public void PendingMeshElementsCountTowardOwnedMemoryAndMatchPerElementBuilding()
    {
        using var library = new Library(1f);
        var empty = library.nTotalMemUsage();
        using var mesh = new Mesh(library);
        Assert.Equal(0, mesh.nAddVertex(Vector3.Zero));
        Assert.Equal(1, mesh.nAddVertex(Vector3.UnitX));
        Assert.Equal(2, mesh.nAddVertex(Vector3.UnitY));
        Assert.Equal(0, mesh.nAddTriangle(0, 1, 2));
        var pending = library.nTotalMemUsage();
        Assert.True(pending > empty);
        Assert.Equal(3, mesh.nVertexCount());
        Assert.Equal(pending, library.nTotalMemUsage());
        for (var index = 0; index < 100; index++) Assert.Equal(3 + index, mesh.nAddVertex(new Vector3(index, 1, 2)));
        Assert.Equal(1, mesh.nAddTriangle(3, 4, 5));
        using var disposed = new Mesh(library);
        disposed.nAddVertex(Vector3.One);
        disposed.Dispose();
        Assert.Equal(103, mesh.nVertexCount());
        Assert.Equal(2, mesh.nTriangleCount());
        Assert.Equal(new Vector3(99, 1, 2), mesh.vecVertexAt(102));
    }
}
