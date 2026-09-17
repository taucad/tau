using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

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
        long byteLength;
        /* W31/D24: the artifact is hashed in the pass that makes it durable. Reading the file back to
         * hash it was a second full pass over every mesh. The scalars are written as whole spans —
         * little-endian, which every supported target is and which the host reader already assumes —
         * instead of one `BinaryWriter` call per float. */
        using var digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            foreach (var component in components)
            {
                var positionOffset = stream.Position;
                Append(stream, digest, MemoryMarshal.AsBytes<float>(component.Positions));
                var normalOffset = stream.Position;
                Append(stream, digest, MemoryMarshal.AsBytes<float>(component.Normals));
                var indexOffset = stream.Position;
                Append(stream, digest, MemoryMarshal.AsBytes<uint>(component.Indices));
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
            byteLength = stream.Position;
        }
        return (path, byteLength, Convert.ToHexString(digest.GetHashAndReset()).ToLowerInvariant(), ranges);
    }

    private static void Append(Stream stream, IncrementalHash digest, ReadOnlySpan<byte> bytes)
    {
        stream.Write(bytes);
        digest.AppendData(bytes);
    }
}
