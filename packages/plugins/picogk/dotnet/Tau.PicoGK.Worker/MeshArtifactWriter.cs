using System.Security.Cryptography;
using System.Diagnostics;

namespace Tau.PicoGK.Worker;

internal sealed record ComponentRange(
    string Name,
    string Color,
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
    double ModelInvoke,
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
        Directory.CreateDirectory(artifactRoot);
        var path = Path.Combine(artifactRoot, $"{Guid.NewGuid():N}.tau-mesh");
        var ranges = new List<ComponentRange>(execution.Components.Count);
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var writer = new BinaryWriter(stream))
        {
            foreach (var component in execution.Components)
            {
                var positionOffset = stream.Position;
                foreach (var value in component.Positions) writer.Write(value);
                var normalOffset = stream.Position;
                foreach (var value in component.Normals) writer.Write(value);
                var indexOffset = stream.Position;
                foreach (var value in component.Indices) writer.Write(value);
                ranges.Add(new ComponentRange(
                    component.Name,
                    component.Color,
                    positionOffset,
                    component.Positions.Length,
                    normalOffset,
                    component.Normals.Length,
                    indexOffset,
                    component.Indices.Length));
            }
        }
        using var input = File.OpenRead(path);
        var result = new BuildResult(
            path,
            input.Length,
            Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant(),
            ranges,
            execution.RecycleAfterResponse,
            diagnostics.Timings,
            diagnostics.Metrics);
        write.Stop();
        return result with
        {
            Timings = diagnostics.Timings with { ArtifactWrite = write.Elapsed.TotalMilliseconds },
        };
    }
}
