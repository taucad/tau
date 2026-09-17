using System.Security.Cryptography;
using System.Diagnostics;

namespace Tau.PicoGK.Worker;

internal sealed record ComponentRange(
    string Id,
    string Kind,
    string Name,
    float[] Color,
    float Metallic,
    float Roughness,
    long PositionOffset,
    int PositionCount,
    long NormalOffset,
    int NormalCount,
    long IndexOffset,
    int IndexCount);

internal sealed record BuildResult(
    string ArtifactPath,
    long ByteLength,
    string Sha256,
    IReadOnlyList<ComponentRange> Components,
    bool RecycleAfterResponse,
    WorkerTimings Timings,
    WorkerMetrics Metrics);

internal sealed record WorkerTimings(
    bool CompileCacheHit,
    double SourceRead,
    double Parse,
    double Analyze,
    double Emit,
    double LibraryInitialize,
    double EntryPointInvoke,
    double MeshConstruction,
    double MeshExtraction,
    double NormalGeneration,
    double ArtifactWrite,
    double Unload);
internal sealed record WorkerMetrics(
    long ManagedHeapBytes,
    long PicoGkNativeBytes,
    long ProcessWorkingSetBytes);
internal sealed record WorkerDiagnostics(WorkerTimings Timings, WorkerMetrics Metrics);

internal static class MeshArtifactWriter
{
    internal static BuildResult Write(
        string artifactRoot,
        ModelExecutionResult execution,
        WorkerDiagnostics diagnostics)
    {
        var write = Stopwatch.StartNew();
        var artifact = WriteComponents(artifactRoot, execution.Components);
        var result = new BuildResult(
            artifact.Path,
            artifact.ByteLength,
            artifact.Sha256,
            artifact.Components,
            execution.RecycleAfterResponse,
            diagnostics.Timings,
            diagnostics.Metrics);
        write.Stop();
        return result with
        {
            Timings = diagnostics.Timings with { ArtifactWrite = write.Elapsed.TotalMilliseconds },
        };
    }

    private static (string Path, long ByteLength, string Sha256, IReadOnlyList<ComponentRange> Components) WriteComponents(
        string artifactRoot,
        IReadOnlyList<ExtractedComponent> components)
    {
        Directory.CreateDirectory(artifactRoot);
        var path = Path.Combine(artifactRoot, $"{Guid.NewGuid():N}.tau-mesh");
        var ranges = new List<ComponentRange>(components.Count);
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new BinaryWriter(stream))
        {
            foreach (var component in components)
            {
                var positionOffset = stream.Position;
                foreach (var value in component.Positions) writer.Write(value);
                var normalOffset = stream.Position;
                foreach (var value in component.Normals) writer.Write(value);
                var indexOffset = stream.Position;
                foreach (var value in component.Indices) writer.Write(value);
                ranges.Add(new ComponentRange(
                    component.Id,
                    component.Kind,
                    component.Name,
                    component.Color,
                    component.Metallic,
                    component.Roughness,
                    positionOffset,
                    component.Positions.Length,
                    normalOffset,
                    component.Normals.Length,
                    indexOffset,
                    component.Indices.Length));
            }
        }
        using var input = File.OpenRead(path);
        return (
            path,
            input.Length,
            Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant(),
            ranges);
    }
}
