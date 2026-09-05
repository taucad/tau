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
    IReadOnlyList<SceneCheckpoint> Checkpoints,
    long PicoGkNativeBytes,
    bool RecycleAfterResponse,
    ModelTimings Timings,
    IReadOnlyList<ComputeSnapshotPublication>? ComputePublications = null);

internal static class ModelRunner
{
    internal static ModelExecutionResult Execute(
        CompiledModel compiled,
        string artifactRoot,
        JsonElement? parameters = null,
        SceneCaptureOptions? capture = null,
        Action<SceneProgress>? onProgress = null,
        ComputeMaterializationCache? compute = null)
    {
        var values = CompilationService.BindParameters(
            compiled,
            parameters ?? JsonSerializer.SerializeToElement(new Dictionary<string, object?>()));
        var (execution, context, entryPointInvoke) = LoadRunAndExtract(
            compiled,
            artifactRoot,
            values,
            capture,
            onProgress,
            compute);
        var unload = Stopwatch.StartNew();
        for (var attempt = 0; attempt < 8 && context.IsAlive; attempt++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
        }
        unload.Stop();
        return execution with
        {
            RecycleAfterResponse = context.IsAlive,
            Timings = execution.Timings with
            {
                EntryPointInvoke = entryPointInvoke,
                Unload = unload.Elapsed.TotalMilliseconds,
            },
        };
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static (ModelExecutionResult, WeakReference, double) LoadRunAndExtract(
        CompiledModel compiled,
        string artifactRoot,
        IReadOnlyDictionary<string, object?> values,
        SceneCaptureOptions? capture,
        Action<SceneProgress>? onProgress,
        ComputeMaterializationCache? compute)
    {
        var context = new AssemblyLoadContext($"PicoGkProgram_{Guid.NewGuid():N}", isCollectible: true);
        ModelExecutionResult execution;
        var invoke = Stopwatch.StartNew();
        try
        {
            using var assemblyStream = new MemoryStream(compiled.Assembly, writable: false);
            using var pdbStream = new MemoryStream(compiled.Pdb, writable: false);
            var assembly = context.LoadFromStream(assemblyStream, pdbStream);
            var entryPoint = assembly.EntryPoint!;
            using var host = new HostedLibraryHost(artifactRoot, capture, onProgress, compute);
            using (Library.UseHost(host))
            {
                ApplyParameters(assembly, values);
                InvokeEntryPoint(entryPoint);
            }
            execution = host.TakeResult();
        }
        finally
        {
            invoke.Stop();
            context.Unload();
        }
        return (execution, new WeakReference(context), invoke.Elapsed.TotalMilliseconds);
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
