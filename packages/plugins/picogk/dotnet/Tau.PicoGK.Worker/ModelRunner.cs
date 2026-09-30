using System.Diagnostics;
using System.Numerics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;
using PicoGK;

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
    float[]? Tangents = null);

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
    MaterialResources? Resources = null);

internal static class ModelRunner
{
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

    internal static ModelExecutionResult Execute(
        CompiledModel compiled,
        string artifactRoot,
        JsonElement? parameters = null,
        CancellationToken cancellation = default)
    {
        var values = CompilationService.BindParameters(
            compiled,
            parameters ?? JsonSerializer.SerializeToElement(new Dictionary<string, object?>()));
        var unload = Stopwatch.StartNew();
        var recycleAfterResponse = false;
        if (retainedAssemblyBytes is not null && !ReferenceEquals(retainedAssemblyBytes, compiled.Assembly))
        {
            recycleAfterResponse = Collect(ReleaseRetained());
        }
        unload.Stop();
        var assembly = Retain(compiled);
        var invoke = Stopwatch.StartNew();
        var execution = RunAndExtract(assembly, artifactRoot, values, cancellation);
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

    private static bool Collect(WeakReference context)
    {
        for (var attempt = 0; attempt < 8 && context.IsAlive; attempt++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
        }
        return context.IsAlive;
    }

    private static ModelExecutionResult RunAndExtract(
        Assembly assembly,
        string artifactRoot,
        IReadOnlyDictionary<string, object?> values,
        CancellationToken cancellation)
    {
        using var host = new HostedLibraryHost(artifactRoot, cancellation);
        using (Library.UseHost(host))
        {
            ApplyParameters(assembly, values);
            InvokeEntryPoint(assembly.EntryPoint!);
        }
        return host.TakeResult();
    }

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

    internal static void InvokeEntryPoint(MethodInfo entryPoint)
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
                exitCode = exitTask.GetAwaiter().GetResult();
            }
            else if (result is Task task)
            {
                task.GetAwaiter().GetResult();
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
    {
        var sourceVertices = Enumerable.Range(0, positions.Length / 3).ToList();
        var creaseCosine = MathF.Cos(MathF.PI / 6);
        var faces = new Vector3[indices.Length / 3];
        var directions = new Vector3[faces.Length];
        var incident = new List<int>?[positions.Length / 3];
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            var a = checked((int)indices[triangle]) * 3;
            var b = checked((int)indices[triangle + 1]) * 3;
            var c = checked((int)indices[triangle + 2]) * 3;
            var ab = new Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
            var ac = new Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
            var face = Vector3.Cross(ab, ac);
            faces[triangle / 3] = face;
            directions[triangle / 3] = face.LengthSquared() > 0 ? Vector3.Normalize(face) : Vector3.Zero;
            for (var corner = triangle; corner < triangle + 3; corner++)
                (incident[indices[corner]] ??= []).Add(corner);
        }

        var remapped = new uint[indices.Length];
        var visited = new bool[indices.Length];
        var expanded = new List<float>(positions);
        var sums = new List<Vector3>(new Vector3[incident.Length]);
        var fan = new List<int>();
        for (var vertex = 0; vertex < incident.Length; vertex++)
        {
            var first = true;
            foreach (var seed in incident[vertex] ?? [])
            {
                if (visited[seed]) continue;
                var target = vertex;
                if (!first)
                {
                    target = sums.Count;
                    expanded.Add(positions[vertex * 3]);
                    expanded.Add(positions[vertex * 3 + 1]);
                    expanded.Add(positions[vertex * 3 + 2]);
                    sums.Add(Vector3.Zero);
                    sourceVertices.Add(vertex);
                }
                first = false;
                fan.Clear();
                fan.Add(seed);
                visited[seed] = true;
                // ponytail: quadratic in vertex valence, normally ~6; use an edge map if unusually dense fans dominate.
                for (var next = 0; next < fan.Count; next++)
                {
                    var corner = fan[next];
                    remapped[corner] = checked((uint)target);
                    sums[target] += faces[corner / 3];
                    var triangle = corner / 3 * 3;
                    var edgeA = indices[triangle + (corner + 1) % 3];
                    var edgeB = indices[triangle + (corner + 2) % 3];
                    foreach (var candidate in incident[vertex]!)
                    {
                        if (visited[candidate] || Vector3.Dot(directions[corner / 3], directions[candidate / 3]) < creaseCosine) continue;
                        var other = candidate / 3 * 3;
                        var otherA = indices[other + (candidate + 1) % 3];
                        var otherB = indices[other + (candidate + 2) % 3];
                        // Sharing only a point does not make disconnected surfaces a smooth fan.
                        if (edgeA != otherA && edgeA != otherB && edgeB != otherA && edgeB != otherB) continue;
                        visited[candidate] = true;
                        fan.Add(candidate);
                    }
                }
            }
        }
        sources = sourceVertices.ToArray();
        positions = expanded.ToArray();
        indices = remapped;
        var normals = new float[positions.Length];
        for (var vertex = 0; vertex < sums.Count; vertex++)
        {
            var normal = Vector3.Normalize(sums[vertex]);
            if (!float.IsFinite(normal.X)) normal = Vector3.UnitZ;
            normals[vertex * 3] = normal.X;
            normals[vertex * 3 + 1] = normal.Y;
            normals[vertex * 3 + 2] = normal.Z;
        }
        return normals;
    }

    private static WorkerException RuntimeError(string message) =>
        new(new Issue(message, "CS_TAU_RUNTIME", "runtime", "error"));

}
