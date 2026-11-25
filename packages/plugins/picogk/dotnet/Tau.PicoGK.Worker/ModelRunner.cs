using System.Diagnostics;
using System.Numerics;
using System.Reflection;
using System.Runtime.CompilerServices;
#if !PICOGK_BROWSER
using System.Runtime.Loader;
#endif
using System.Text.Json;
using System.Text.Json.Serialization;
using PicoGK;
#if PICOGK_BROWSER
using PicoVoxel.Sdf.Generator;
#endif

namespace Tau.PicoGK.Worker;

internal sealed record ExtractedComponent(
    string Id,
    string Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Name,
    float[] Color,
    float Metallic,
    float Roughness,
    float[] Positions,
    float[] Normals,
    uint[] Indices,
    JsonElement? Material = null,
    float[]? TexCoords = null,
    float[]? Tangents = null)
{
    internal Matrix4x4 Matrix { get; init; } = Matrix4x4.Identity;
    internal object PrototypeIdentity { get; init; } = new();
}

internal sealed record ModelTimings(
    double EntryPointInvoke,
    double LibraryInitialize,
    double MeshConstruction,
    double MeshExtraction,
    double NormalGeneration,
    double Unload);

internal sealed record ModelExecutionResult(
    IReadOnlyList<ExtractedComponent> Components,
    long PicoGkNativeBytes,
    bool RecycleAfterResponse,
    ModelTimings Timings,
    JsonElement? Mechanism,
    IReadOnlyList<Issue> Warnings,
    MaterialResources? Resources = null, WorkCounters? WorkCounters = null,
    IReadOnlyList<TauComputeStableRecord>? ComputeRecords = null,
    // The voxel edge length in millimetres `Library.Go` ran the model with; null without a library.
    float? VoxelSize = null,
    // The display meshing the host applied to captured Voxels; null for the uniform mesh.
    MeshingOptions? Meshing = null);

/// <summary>Display meshing for captured Voxels: OpenVDB adaptivity in (0, 1) and its relax pass.</summary>
internal sealed record MeshingOptions(float Adaptivity, bool Relax);

internal sealed record LayoutStability(float MinimumArea, float MaximumEdgeSum, float CreaseMargin, float MinimumFanArea, int MaximumFanFaces, float UvAxisMargin);

internal static class ModelRunner
{
#if PICOGK_BROWSER
    private static byte[]? retainedAssemblyBytes;
    private static Assembly? retainedAssembly;

    /// <summary>
    /// Registers the signed-distance methods the generator lifted, once, right after the author's assembly
    /// is loaded.
    /// </summary>
    /// <remarks>
    /// Explicitly, by name: no author static constructor runs to install anything, and a compilation the
    /// generator found nothing in still carries the entry point, so there is no conditional path here. A
    /// field the generator refused is simply absent and keeps the per-voxel callback.
    /// </remarks>
    private static void RegisterGeneratedTapes(Assembly author)
    {
        var registry = author.GetType(GeneratedRegistryType, throwOnError: false)
            ?? throw RuntimeError("The compiled C# assembly carries no signed-distance registry.");
        (registry.GetMethod(GeneratedRegistryMethod, BindingFlags.Public | BindingFlags.Static)
            ?? throw RuntimeError("The signed-distance registry carries no registration entry point."))
            .Invoke(null, null);
    }

    private const string GeneratedRegistryType = SdfTapeGenerator.RegistryTypeName;
    private const string GeneratedRegistryMethod = SdfTapeGenerator.RegistryMethodName;

    // Browser assemblies cannot unload. Parameter edits reuse this assembly; source edits
    // must replace the owning worker before another assembly is admitted.
    internal static async Task<ModelExecutionResult> ExecuteAsync(
        CompiledModel compiled,
        string artifactRoot,
        JsonElement? parameters = null,
        CancellationToken cancellation = default,
        ComputeWorkerSession? compute = null,
        MeshingOptions? meshing = null)
    {
        cancellation.ThrowIfCancellationRequested();
        if (retainedAssemblyBytes is not null && !ReferenceEquals(retainedAssemblyBytes, compiled.Assembly))
            throw RuntimeError("A C# source edit requires a new browser worker.");
        var values = CompilationService.BindParameters(
            compiled, parameters ?? JsonSerializer.SerializeToElement(new Dictionary<string, object?>()));
        if (retainedAssembly is null)
        {
            retainedAssembly = Assembly.Load(compiled.Assembly, compiled.Pdb);
            retainedAssemblyBytes = compiled.Assembly;
            RegisterGeneratedTapes(retainedAssembly);
        }
        var invoke = Stopwatch.StartNew();
        using var host = new HostedLibraryHost(artifactRoot, cancellation, compute, meshing);
        using (Library.UseHost(host))
        {
            ApplyParameters(retainedAssembly, values);
            var entry = compiled.EntryPoint;
            var method = retainedAssembly.GetType(entry.TypeName, throwOnError: true)!.GetMethod(
                entry.MethodName, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                binder: null, types: entry.HasArguments ? [typeof(string[])] : Type.EmptyTypes, modifiers: null)
                ?? throw RuntimeError("The compiled C# entry point could not be resolved.");
            await InvokeEntryPointAsync(method);
        }
        cancellation.ThrowIfCancellationRequested();
        invoke.Stop();
        var execution = host.TakeResult();
        return execution with { Timings = execution.Timings with { EntryPointInvoke = invoke.Elapsed.TotalMilliseconds } };
    }
#else
    /*
     * D25: the collectible load context is retained across builds and reloaded only when the
     * compilation changed. `CompilationService` caches by source hash and hands back the same
     * assembly bytes for an unchanged project, so reference identity on those bytes is the reload
     * signal. A parameter edit therefore pays no assembly load, no unload and no collection drain.
     *
     * The trade is that the user's own statics survive a parameter edit. `Params` does not: every
     * declared parameter is rewritten from `BindParameters`, which fills unsupplied ones with their
     * defaults.
     */
    // Held apart rather than in one tuple: reading a field of a tuple copies the whole thing into
    // the reading frame, which would root the very context the reload is about to collect.
    private static byte[]? retainedAssemblyBytes;
    private static AssemblyLoadContext? retainedContext;
    private static Assembly? retainedAssembly;
    /*
     * CH9: a source edit releases the previous context before its build and collects it only after the
     * response, so the drains no longer delay the edit's first result. A context still alive after them
     * asks the host to recycle this worker after the next response.
     */
    private static WeakReference? releasedContext;
    private static bool recycleAfterNextResponse;

    internal static ModelExecutionResult Execute(
        CompiledModel compiled,
        string artifactRoot,
        JsonElement? parameters = null,
        CancellationToken cancellation = default,
        ComputeWorkerSession? compute = null,
        MeshingOptions? meshing = null)
    {
        var values = CompilationService.BindParameters(
            compiled,
            parameters ?? JsonSerializer.SerializeToElement(new Dictionary<string, object?>()));
        var unload = Stopwatch.StartNew();
        // A release whose response was never written (its build failed) is collected here instead.
        CollectReleased();
        var recycleAfterResponse = recycleAfterNextResponse;
        recycleAfterNextResponse = false;
        if (retainedAssemblyBytes is not null && !ReferenceEquals(retainedAssemblyBytes, compiled.Assembly))
        {
            releasedContext = ReleaseRetained();
        }
        unload.Stop();
        var assembly = Retain(compiled);
        var invoke = Stopwatch.StartNew();
        var execution = RunAndExtract(assembly, artifactRoot, values, cancellation, compute, meshing);
        invoke.Stop();
        return execution with
        {
            RecycleAfterResponse = recycleAfterResponse,
            Timings = execution.Timings with
            {
                EntryPointInvoke = invoke.Elapsed.TotalMilliseconds,
                Unload = unload.Elapsed.TotalMilliseconds,
            },
        };
    }

    private static Assembly Retain(CompiledModel compiled)
    {
        if (retainedAssembly is not null)
        {
            return retainedAssembly;
        }
        var context = new AssemblyLoadContext($"PicoGkProgram_{Guid.NewGuid():N}", isCollectible: true);
        using var assemblyStream = new MemoryStream(compiled.Assembly, writable: false);
        using var pdbStream = new MemoryStream(compiled.Pdb, writable: false);
        retainedAssembly = context.LoadFromStream(assemblyStream, pdbStream);
        retainedContext = context;
        retainedAssemblyBytes = compiled.Assembly;
        return retainedAssembly;
    }

    // The context must not survive in any live frame while it is collected, so the only strong
    // references — the static and this frame's copy — are dropped before the caller collects.
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static WeakReference ReleaseRetained()
    {
        var context = retainedContext!;
        retainedContext = null;
        retainedAssembly = null;
        retainedAssemblyBytes = null;
        var weak = new WeakReference(context);
        context.Unload();
        return weak;
    }

    /// <summary>
    /// Collects the context the last source edit released, after its response was written.
    /// </summary>
    /// <returns>Whether that context survived the drains, so the next response recycles the worker.</returns>
    internal static bool CollectReleased()
    {
        if (releasedContext is not { } context) return false;
        releasedContext = null;
        for (var attempt = 0; attempt < 8 && context.IsAlive; attempt++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
        }
        recycleAfterNextResponse = context.IsAlive;
        return recycleAfterNextResponse;
    }

    private static ModelExecutionResult RunAndExtract(
        Assembly assembly,
        string artifactRoot,
        IReadOnlyDictionary<string, object?> values,
        CancellationToken cancellation,
        ComputeWorkerSession? compute,
        MeshingOptions? meshing)
    {
        using var host = new HostedLibraryHost(artifactRoot, cancellation, compute, meshing);
        using (Library.UseHost(host))
        {
            ApplyParameters(assembly, values);
            InvokeEntryPoint(assembly.EntryPoint!);
        }
        return host.TakeResult();
    }

#endif

    private static void ApplyParameters(Assembly assembly, IReadOnlyDictionary<string, object?> values)
    {
        if (values.Count == 0) return;
        var parameterType = assembly.GetType("Params", throwOnError: true)!;
        foreach (var (name, value) in values)
        {
            var property = parameterType.GetProperty(name, BindingFlags.Public | BindingFlags.Static)!;
            var converted = property.PropertyType.IsEnum
                ? Enum.Parse(property.PropertyType, (string)value!, ignoreCase: false)
                : Convert.ChangeType(value, property.PropertyType, System.Globalization.CultureInfo.InvariantCulture);
            property.SetValue(null, converted);
        }
    }

#if PICOGK_BROWSER
    internal static async Task InvokeEntryPointAsync(MethodInfo entryPoint)
#else
    internal static void InvokeEntryPoint(MethodInfo entryPoint)
#endif
    {
        var parameters = entryPoint.GetParameters();
        if (parameters.Length > 1 ||
            parameters.Length == 1 && parameters[0].ParameterType != typeof(string[]))
        {
            throw RuntimeError("C# entry point must accept no arguments or one string[] argument.");
        }

        try
        {
            var arguments = parameters.Length == 0 ? null : new object?[] { Array.Empty<string>() };
            var result = entryPoint.Invoke(null, arguments);
            var exitCode = result is int code ? code : 0;
            if (result is Task<int> exitTask)
            {
#if PICOGK_BROWSER
                exitCode = await exitTask;
#else
                exitCode = exitTask.GetAwaiter().GetResult();
#endif
            }
            else if (result is Task task)
            {
#if PICOGK_BROWSER
                await task;
#else
                task.GetAwaiter().GetResult();
#endif
            }
            if (exitCode != 0)
            {
                throw new WorkerException(new Issue(
                    $"C# program exited with code {exitCode}.",
                    "CS_TAU_EXIT_CODE",
                    "runtime",
                    "error"));
            }
        }
        catch (TargetInvocationException error)
        {
            throw error.InnerException!;
        }
    }

    // One normal per smooth connected triangle fan. Sharp edges need duplicate render vertices;
    // triangle coordinates and winding stay unchanged. Thirty degrees separates hex/chamfer faces
    // while keeping finely tessellated round surfaces smooth.
    internal static float[] VertexNormals(ref float[] positions, ref uint[] indices)
        => VertexNormals(ref positions, ref indices, out _);

    internal static float[] VertexNormals(ref float[] positions, ref uint[] indices, out int[] sources)
        => VertexNormals(ref positions, ref indices, out sources, out _);

    internal static float[] VertexNormals(ref float[] positions, ref uint[] indices, out int[] sources, out LayoutStability stability)
    {
        /* D3: the layout holds no per-corner array beyond its own output and two int scratch arrays.
         * Face vectors and directions are recomputed from the unchanged input wherever they are read,
         * by the one function that computed them, so every value is bit-identical to storing them; and
         * edges are grouped per smaller vertex instead of sorted as 64-bit keys with swap buffers. For a
         * mesh of C corners this keeps about 12 bytes per corner live, where storing faces, directions,
         * keys and the sort's swap buffers kept about 36. */
        var sourcePositions = positions;
        var sourceIndices = indices;
        var minimumArea = float.PositiveInfinity;
        var maximumEdgeSum = 0f;
        var creaseMargin = float.PositiveInfinity;
        var uvAxisMargin = float.PositiveInfinity;
        var vertexCount = positions.Length / 3;
        var creaseCosine = MathF.Cos(MathF.PI / 6);
        // starts[v + 1] counts, then (after the prefix sum) bounds, the corners whose edge's smaller vertex is v.
        var starts = new int[vertexCount + 1];
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            var face = Face(sourcePositions, sourceIndices, triangle / 3, out var ab, out var ac);
            var absolute = Vector3.Abs(face);
            var dominant = MathF.Max(absolute.X, MathF.Max(absolute.Y, absolute.Z));
            var runnerUp = MathF.Max(MathF.Min(absolute.X, absolute.Y), MathF.Min(MathF.Max(absolute.X, absolute.Y), absolute.Z));
            uvAxisMargin = MathF.Min(uvAxisMargin, dominant - runnerUp);
            minimumArea = MathF.Min(minimumArea, face.Length());
            maximumEdgeSum = MathF.Max(maximumEdgeSum, ab.Length() + ac.Length());
            for (var corner = triangle; corner < triangle + 3; corner++)
            {
                var first = indices[corner];
                var second = indices[NextCorner(corner)];
                // Collapsed edges join nothing.
                if (first != second) starts[Math.Min(first, second)]++;
            }
        }
        for (int vertex = 0, total = 0; vertex <= vertexCount; vertex++)
        {
            var count = vertex < vertexCount ? starts[vertex] : 0;
            starts[vertex] = total;
            total += count;
        }
        // Bucket corners by their edge's smaller vertex: starts[v] ends as the end of v's bucket.
        var corners = new int[indices.Length];
        for (var corner = 0; corner < indices.Length; corner++)
        {
            var first = indices[corner];
            var second = indices[NextCorner(corner)];
            if (first != second) corners[starts[Math.Min(first, second)]++] = corner;
        }

        var parents = new int[indices.Length];
        Array.Fill(parents, -1);
        // Within one bucket, corners sharing the larger vertex share the edge. Sorting (larger << 32 | corner)
        // keys groups them; only an edge with exactly two corners is a smooth candidate. Boundary, collapsed
        // and nonmanifold edges are shading boundaries: do not join an arbitrary pair before discovering a
        // third incident triangle. Pairs are read symmetrically and the union-find partition does not depend
        // on join order, so the bucket order is not observable.
        var keys = new ulong[16];
        for (int vertex = 0, start = 0; vertex < vertexCount; start = starts[vertex++])
        {
            var count = starts[vertex] - start;
            if (count < 2) continue;
            if (keys.Length < count) keys = new ulong[Math.Max(count, keys.Length * 2)];
            for (var index = 0; index < count; index++)
            {
                var corner = corners[start + index];
                var larger = Math.Max(indices[corner], indices[NextCorner(corner)]);
                keys[index] = ((ulong)larger << 32) | (uint)corner;
            }
            var bucket = keys.AsSpan(0, count);
            bucket.Sort();
            for (var run = 0; run < count;)
            {
                var end = run + 1;
                while (end < count && bucket[end] >> 32 == bucket[run] >> 32) end++;
                if (end - run == 2)
                {
                    var first = (int)(uint)bucket[run];
                    var second = (int)(uint)bucket[run + 1];
                    var dot = Vector3.Dot(Direction(first / 3), Direction(second / 3));
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
                run = end;
            }
        }
        keys = [];
        starts = [];

        // Reuse the bucketed corner buffer as root -> render vertex storage.
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
        // Release the scratch before the outputs are allocated.
        corners = [];
        parents = [];
        used = [];
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
        duplicates = [];
        indices = remapped;
        var normals = new float[positions.Length];
        var fanFaces = new int[sources.Length];
        var minimumFanArea = float.PositiveInfinity;
        var maximumFanFaces = 0;
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            var face = Face(sourcePositions, sourceIndices, triangle / 3, out _, out _);
            for (var corner = triangle; corner < triangle + 3; corner++)
            {
                var offset = checked((int)indices[corner]) * 3;
                fanFaces[offset / 3]++;
                normals[offset] += face.X;
                normals[offset + 1] += face.Y;
                normals[offset + 2] += face.Z;
            }
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

        Vector3 Direction(int triangle)
        {
            var face = Face(sourcePositions, sourceIndices, triangle, out _, out _);
            return face.LengthSquared() > 0 ? Vector3.Normalize(face) : Vector3.Zero;
        }

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

    // The unnormalized face vector of one triangle, and its two edges from the first corner. Every
    // reader of a face goes through here, so a recomputed face is bit-identical to the first.
    private static Vector3 Face(float[] positions, uint[] indices, int triangle, out Vector3 ab, out Vector3 ac)
    {
        var a = checked((int)indices[triangle * 3]) * 3;
        var b = checked((int)indices[triangle * 3 + 1]) * 3;
        var c = checked((int)indices[triangle * 3 + 2]) * 3;
        ab = new Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
        ac = new Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
        return Vector3.Cross(ab, ac);
    }

    private static WorkerException RuntimeError(string message) =>
        new(new Issue(message, "CS_TAU_RUNTIME", "runtime", "error"));

}
