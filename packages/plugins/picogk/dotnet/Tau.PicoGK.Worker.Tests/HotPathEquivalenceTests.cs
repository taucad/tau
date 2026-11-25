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
    public void BucketedVertexNormalsMatchTheStoredFaceAndSortedEdgeLayoutBitForBit()
    {
        var random = new Random(20261119);
        foreach (var (columns, rows, extra) in new[] { (1, 1, 0), (2, 2, 3), (6, 5, 40), (40, 30, 400), (120, 90, 2000) })
        {
            // A height field with random sharp folds, plus triangles that are collapsed, repeat a corner,
            // reuse an existing edge (nonmanifold), or stand alone.
            var positions = new List<float>();
            for (var row = 0; row <= rows; row++)
            for (var column = 0; column <= columns; column++)
                positions.AddRange([column, row, random.Next(4) == 0 ? random.Next(-3, 4) : random.NextSingle() * .1f]);
            var vertexCount = positions.Count / 3;
            var indices = new List<uint>();
            for (var row = 0; row < rows; row++)
            for (var column = 0; column < columns; column++)
            {
                var a = (uint)(row * (columns + 1) + column);
                var b = a + 1;
                var c = a + (uint)columns + 1;
                var d = c + 1;
                indices.AddRange([a, b, d, a, d, c]);
            }
            for (var index = 0; index < extra; index++)
            {
                var a = (uint)random.Next(vertexCount);
                var b = (uint)random.Next(vertexCount);
                var c = (uint)random.Next(vertexCount);
                switch (random.Next(4))
                {
                    case 0: indices.AddRange([a, a, a]); break;
                    case 1: indices.AddRange([a, b, a]); break;
                    case 2 when indices.Count > 0:
                        var triangle = random.Next(indices.Count / 3) * 3;
                        indices.AddRange([indices[triangle + 1], indices[triangle], c]);
                        break;
                    default: indices.AddRange([a, b, c]); break;
                }
            }
            var expectedPositions = positions.ToArray();
            var expectedIndices = indices.ToArray();
            var actualPositions = positions.ToArray();
            var actualIndices = indices.ToArray();
            var expected = ReferenceVertexNormals(ref expectedPositions, ref expectedIndices, out var expectedSources, out var expectedStability);
            var actual = ModelRunner.VertexNormals(ref actualPositions, ref actualIndices, out var actualSources, out var actualStability);
            Assert.Equal(Bits(expected), Bits(actual));
            Assert.Equal(Bits(expectedPositions), Bits(actualPositions));
            Assert.Equal(expectedIndices, actualIndices);
            Assert.Equal(expectedSources, actualSources);
            Assert.Equal(expectedStability, actualStability);
        }

        static uint[] Bits(float[] values) => Array.ConvertAll(values, BitConverter.SingleToUInt32Bits);
    }

    // The layout VertexNormals replaced (CH11), held as the reference its output must equal.
    private static float[] ReferenceVertexNormals(ref float[] positions, ref uint[] indices, out int[] sources, out LayoutStability stability)
    {
        var minimumArea = float.PositiveInfinity;
        var maximumEdgeSum = 0f;
        var creaseMargin = float.PositiveInfinity;
        var uvAxisMargin = float.PositiveInfinity;
        var vertexCount = positions.Length / 3;
        var creaseCosine = MathF.Cos(MathF.PI / 6);
        var faces = new Vector3[indices.Length / 3];
        var directions = new Vector3[faces.Length];
        var edges = new ulong[indices.Length];
        var corners = new int[indices.Length];
        var parents = new int[indices.Length];
        Array.Fill(parents, -1);
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            var a = checked((int)indices[triangle]) * 3;
            var b = checked((int)indices[triangle + 1]) * 3;
            var c = checked((int)indices[triangle + 2]) * 3;
            var ab = new Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
            var ac = new Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
            var face = Vector3.Cross(ab, ac);
            var absolute = Vector3.Abs(face);
            var dominant = MathF.Max(absolute.X, MathF.Max(absolute.Y, absolute.Z));
            var runnerUp = MathF.Max(MathF.Min(absolute.X, absolute.Y), MathF.Min(MathF.Max(absolute.X, absolute.Y), absolute.Z));
            uvAxisMargin = MathF.Min(uvAxisMargin, dominant - runnerUp);
            minimumArea = MathF.Min(minimumArea, face.Length());
            maximumEdgeSum = MathF.Max(maximumEdgeSum, ab.Length() + ac.Length());
            faces[triangle / 3] = face;
            directions[triangle / 3] = face.LengthSquared() > 0 ? Vector3.Normalize(face) : Vector3.Zero;
            for (var corner = triangle; corner < triangle + 3; corner++)
            {
                var first = indices[corner];
                var second = indices[NextCorner(corner)];
                edges[corner] = first == second ? ulong.MaxValue : ((ulong)Math.Min(first, second) << 32) | Math.Max(first, second);
                corners[corner] = corner;
            }
        }

        // Compact edge adjacency: a linear counting sort, with no scan of a vertex's entire fan.
        ReferenceSortEdges(edges, corners, vertexCount);
        for (var start = 0; start < edges.Length;)
        {
            var end = start + 1;
            while (end < edges.Length && edges[end] == edges[start]) end++;
            // Boundary, collapsed and nonmanifold edges are shading boundaries. In particular,
            // do not join an arbitrary pair before discovering a third incident triangle.
            if (end - start == 2 && edges[start] != ulong.MaxValue)
            {
                var first = corners[start];
                var second = corners[start + 1];
                var dot = Vector3.Dot(directions[first / 3], directions[second / 3]);
                creaseMargin = MathF.Min(creaseMargin, MathF.Abs(dot - creaseCosine));
                if (dot >= creaseCosine)
                {
                    var firstEnd = NextCorner(first);
                    var secondEnd = NextCorner(second);
                    if (indices[first] == indices[second])
                    {
                        Join(first, second);
                        Join(firstEnd, secondEnd);
                    }
                    else
                    {
                        Join(first, secondEnd);
                        Join(firstEnd, second);
                    }
                }
            }
            start = end;
        }

        // Reuse the sorted corner buffer as root -> render vertex storage.
        Array.Fill(corners, -1);
        var used = new bool[vertexCount];
        var duplicates = new List<int>();
        var remapped = new uint[indices.Length];
        for (var corner = 0; corner < indices.Length; corner++)
        {
            var root = Find(corner);
            if (corners[root] < 0)
            {
                var source = checked((int)indices[corner]);
                if (!used[source])
                {
                    corners[root] = source;
                    used[source] = true;
                }
                else
                {
                    corners[root] = checked(vertexCount + duplicates.Count);
                    duplicates.Add(source);
                }
            }
            remapped[corner] = checked((uint)corners[root]);
        }
        sources = new int[checked(vertexCount + duplicates.Count)];
        for (var vertex = 0; vertex < vertexCount; vertex++) sources[vertex] = vertex;
        if (duplicates.Count > 0)
        {
            var expanded = new float[checked(sources.Length * 3)];
            positions.CopyTo(expanded, 0);
            for (var duplicate = 0; duplicate < duplicates.Count; duplicate++)
            {
                var target = vertexCount + duplicate;
                var source = duplicates[duplicate];
                sources[target] = source;
                Array.Copy(positions, source * 3, expanded, target * 3, 3);
            }
            positions = expanded;
        }
        indices = remapped;
        var normals = new float[positions.Length];
        var fanFaces = new int[sources.Length];
        var minimumFanArea = float.PositiveInfinity;
        var maximumFanFaces = 0;
        for (var corner = 0; corner < indices.Length; corner++)
        {
            var offset = checked((int)indices[corner]) * 3;
            var face = faces[corner / 3];
            fanFaces[offset / 3]++;
            normals[offset] += face.X;
            normals[offset + 1] += face.Y;
            normals[offset + 2] += face.Z;
        }
        for (var vertex = 0; vertex < sources.Length; vertex++)
        {
            var offset = vertex * 3;
            var sum = new Vector3(normals[offset], normals[offset + 1], normals[offset + 2]);
            if (fanFaces[vertex] > 0)
            {
                minimumFanArea = MathF.Min(minimumFanArea, sum.Length());
                maximumFanFaces = Math.Max(maximumFanFaces, fanFaces[vertex]);
            }
            var normal = Vector3.Normalize(sum);
            if (!float.IsFinite(normal.X)) normal = Vector3.UnitZ;
            normals[offset] = normal.X;
            normals[offset + 1] = normal.Y;
            normals[offset + 2] = normal.Z;
        }
        stability = new LayoutStability(minimumArea, maximumEdgeSum, creaseMargin, minimumFanArea, maximumFanFaces, uvAxisMargin);
        return normals;

        static int NextCorner(int corner) => corner / 3 * 3 + (corner + 1) % 3;

        int Find(int corner)
        {
            var root = corner;
            while (parents[root] >= 0) root = parents[root];
            while (corner != root)
            {
                var next = parents[corner];
                parents[corner] = root;
                corner = next;
            }
            return root;
        }

        void Join(int first, int second)
        {
            first = Find(first);
            second = Find(second);
            if (first == second) return;
            if (parents[first] > parents[second]) (first, second) = (second, first);
            parents[first] += parents[second];
            parents[second] = first;
        }
    }

    /*
     * CH11: orders edge keys (smaller vertex << 32 | larger vertex) ascending, collapsed edges (ulong.MaxValue)
     * last, as Array.Sort(edges, corners) did, with two stable counting passes: by the larger vertex, then by
     * the smaller. Equal keys stay adjacent; the order of the corners inside a key may differ from the
     * comparison sort's, which the pairing below never observes: it reads only pairs, symmetrically, and the
     * union-find partition does not depend on join order.
     */
    private static void ReferenceSortEdges(ulong[] edges, int[] corners, int vertexCount)
    {
        if (edges.Length < 2) return;
        var swapEdges = new ulong[edges.Length];
        var swapCorners = new int[corners.Length];
        var counts = new int[vertexCount + 2];
        CountingPass(edges, corners, swapEdges, swapCorners, counts, vertexCount, high: false);
        Array.Clear(counts);
        CountingPass(swapEdges, swapCorners, edges, corners, counts, vertexCount, high: true);

        static void CountingPass(ulong[] sourceEdges, int[] sourceCorners, ulong[] targetEdges, int[] targetCorners,
            int[] counts, int vertexCount, bool high)
        {
            // Bucket vertexCount holds collapsed edges, after every vertex bucket.
            foreach (var edge in sourceEdges) counts[Bucket(edge, vertexCount, high) + 1]++;
            for (var bucket = 1; bucket < counts.Length; bucket++) counts[bucket] += counts[bucket - 1];
            for (var index = 0; index < sourceEdges.Length; index++)
            {
                var target = counts[Bucket(sourceEdges[index], vertexCount, high)]++;
                targetEdges[target] = sourceEdges[index];
                targetCorners[target] = sourceCorners[index];
            }
        }

        static int Bucket(ulong edge, int vertexCount, bool high) =>
            edge == ulong.MaxValue ? vertexCount : (int)(high ? edge >> 32 : edge & uint.MaxValue);
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
