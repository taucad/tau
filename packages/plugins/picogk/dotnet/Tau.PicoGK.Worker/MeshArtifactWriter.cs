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
    IReadOnlyList<SceneCheckpoint> Checkpoints,
    bool RecycleAfterResponse,
    WorkerTimings Timings,
    WorkerMetrics Metrics,
    IReadOnlyList<ComputeArtifact> ComputePublications);

internal sealed record SceneArtifact(
    string ArtifactPath,
    long ByteLength,
    string Sha256,
    IReadOnlyList<ComponentRange> Components);

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
        WorkerDiagnostics diagnostics,
        IReadOnlyList<ComputeSnapshotPublication>? computePublications = null)
    {
        var write = Stopwatch.StartNew();
        var artifact = WriteComponents(artifactRoot, execution.Components);
        var result = new BuildResult(
            artifact.Path,
            artifact.ByteLength,
            artifact.Sha256,
            artifact.Components,
            execution.Checkpoints,
            execution.RecycleAfterResponse,
            diagnostics.Timings,
            diagnostics.Metrics,
            WriteComputePublications(artifactRoot, computePublications ?? []));
        write.Stop();
        return result with
        {
            Timings = diagnostics.Timings with { ArtifactWrite = write.Elapsed.TotalMilliseconds },
        };
    }

    internal static GeometrySnapshot ReadComputeArtifact(ComputeArtifact artifact)
    {
        var bytes = File.ReadAllBytes(artifact.ArtifactPath);
        if (bytes.LongLength != artifact.ByteLength ||
            Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant() != artifact.Sha256)
        {
            throw new InvalidDataException("PicoGK compute artifact digest or length is invalid.");
        }
        var expected = checked((artifact.PositionCount + artifact.IndexCount) * sizeof(float));
        if (artifact.Kind != "triangles" || artifact.PositionCount <= 0 || artifact.IndexCount <= 0 || bytes.Length != expected)
        {
            throw new InvalidDataException("PicoGK compute artifact layout is invalid.");
        }
        var positions = new float[artifact.PositionCount];
        var indices = new uint[artifact.IndexCount];
        using var reader = new BinaryReader(new MemoryStream(bytes, writable: false));
        for (var index = 0; index < positions.Length; index++) positions[index] = reader.ReadSingle();
        for (var index = 0; index < indices.Length; index++) indices[index] = reader.ReadUInt32();
        return new GeometrySnapshot("triangles", positions, indices, null);
    }

    private static IReadOnlyList<ComputeArtifact> WriteComputePublications(
        string artifactRoot,
        IReadOnlyList<ComputeSnapshotPublication> publications)
    {
        var result = new List<ComputeArtifact>(publications.Count);
        foreach (var publication in publications)
        {
            var path = Path.Combine(artifactRoot, $"{Guid.NewGuid():N}.tau-compute");
            using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            using (var writer = new BinaryWriter(stream))
            {
                foreach (var value in publication.Snapshot.Positions) writer.Write(value);
                foreach (var value in publication.Snapshot.Indices) writer.Write(value);
            }
            var bytes = File.ReadAllBytes(path);
            result.Add(new ComputeArtifact(
                publication.CacheKey,
                "triangles",
                path,
                bytes.LongLength,
                Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
                publication.Snapshot.Positions.Length,
                publication.Snapshot.Indices.Length));
        }
        return result;
    }

    internal static SceneArtifact WriteSceneComponents(
        string artifactRoot,
        IReadOnlyList<ExtractedComponent> components)
    {
        if (components.Count == 0) throw new ArgumentException("A scene artifact must contain at least one component.", nameof(components));
        var artifact = WriteComponents(artifactRoot, components);
        return new SceneArtifact(
            artifact.Path,
            artifact.ByteLength,
            artifact.Sha256,
            artifact.Components);
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
