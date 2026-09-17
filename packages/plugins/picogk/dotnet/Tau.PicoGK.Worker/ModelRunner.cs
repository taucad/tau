using System.Diagnostics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using System.Text.Json;
using PicoGK;

namespace Tau.PicoGK.Worker;

internal sealed record ExtractedComponent(
    string Id,
    string Kind,
    string Name,
    float[] Color,
    float Metallic,
    float Roughness,
    float[] Positions,
    float[] Normals,
    uint[] Indices);

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
    ModelTimings Timings);

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
        JsonElement? parameters = null)
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
        var execution = RunAndExtract(assembly, artifactRoot, values);
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
        IReadOnlyDictionary<string, object?> values)
    {
        using var host = new HostedLibraryHost(artifactRoot);
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

    internal static float[] VertexNormals(float[] positions, uint[] indices)
    {
        var normals = new float[positions.Length];
        for (var index = 0; index < indices.Length; index += 3)
        {
            var a = checked((int)indices[index]) * 3;
            var b = checked((int)indices[index + 1]) * 3;
            var c = checked((int)indices[index + 2]) * 3;
            var ab = new System.Numerics.Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
            var ac = new System.Numerics.Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
            var normal = System.Numerics.Vector3.Cross(ab, ac);
            foreach (var vertex in new[] { a, b, c })
            {
                normals[vertex] += normal.X;
                normals[vertex + 1] += normal.Y;
                normals[vertex + 2] += normal.Z;
            }
        }
        for (var index = 0; index < normals.Length; index += 3)
        {
            var normal = System.Numerics.Vector3.Normalize(new(normals[index], normals[index + 1], normals[index + 2]));
            if (!float.IsFinite(normal.X))
            {
                normal = System.Numerics.Vector3.UnitZ;
            }
            normals[index] = normal.X;
            normals[index + 1] = normal.Y;
            normals[index + 2] = normal.Z;
        }
        return normals;
    }

    private static WorkerException RuntimeError(string message) =>
        new(new Issue(message, "CS_TAU_RUNTIME", "runtime", "error"));

}
