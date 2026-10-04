using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tau.PicoGK.Worker;

internal sealed record PrototypeRange(
    string Id, string Kind,
    long PositionOffset, int PositionCount,
    long NormalOffset, int NormalCount,
    long IndexOffset, int IndexCount, int IndexComponentType,
    long TexCoordOffset = 0, int TexCoordCount = 0,
    long TangentOffset = 0, int TangentCount = 0);

internal sealed record SceneOccurrence(
    string Id, string PrototypeId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Name,
    float[] Matrix, float[] Color, float Metallic, float Roughness,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Material = null);

internal sealed record ImageRange(long Offset, int ByteLength, string MimeType, string? Name);

internal sealed record BuildResult(
    string ArtifactPath,
    long ByteLength,
    string Sha256,
    IReadOnlyList<PrototypeRange> Prototypes,
    IReadOnlyList<SceneOccurrence> Occurrences,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] JsonElement? Mechanism,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<Issue>? Warnings,
    bool RecycleAfterResponse,
    WorkerTimings Timings,
    WorkerMetrics Metrics,
    IReadOnlyList<ImageRange>? Images = null,
    IReadOnlyList<Dictionary<string, object?>>? Textures = null,
    IReadOnlyList<Dictionary<string, object?>>? Samplers = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] WorkCounters? WorkCounters = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ComputeReuseManifest = null);

// Build-level operation deltas; memory metrics above remain point-in-time snapshots.
internal sealed record WorkCounters(long CapturedSnapshots, long GeometryReadbacks, long InputVertices,
    long InputIndices, long NormalLayouts, long UvLayouts, long MaterialProjections);

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
        var artifact = WriteComponents(artifactRoot, execution.Components, execution.Resources);
        var result = new BuildResult(
            artifact.Path,
            artifact.ByteLength,
            artifact.Sha256,
            artifact.Prototypes,
            artifact.Occurrences,
            execution.Mechanism,
            execution.Warnings.Count == 0 ? null : execution.Warnings,
            execution.RecycleAfterResponse,
            diagnostics.Timings,
            diagnostics.Metrics,
            artifact.Images, execution.Resources?.Textures, execution.Resources?.Samplers, execution.WorkCounters);
        write.Stop();
        return result with
        {
            Timings = diagnostics.Timings with { ArtifactWrite = write.Elapsed.TotalMilliseconds },
        };
    }

    private static (string Path, long ByteLength, string Sha256, IReadOnlyList<PrototypeRange> Prototypes,
    IReadOnlyList<SceneOccurrence> Occurrences, IReadOnlyList<ImageRange> Images) WriteComponents(
        string artifactRoot,
        IReadOnlyList<ExtractedComponent> components, MaterialResources? resources)
    {
        Directory.CreateDirectory(artifactRoot);
        var path = Path.Combine(artifactRoot, $"{Guid.NewGuid():N}.tau-mesh");
        var ranges = new List<PrototypeRange>();
        var occurrences = new List<SceneOccurrence>(components.Count);
        var prototypes = new Dictionary<object, string>(ReferenceEqualityComparer.Instance);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var names = new HashSet<string>(StringComparer.Ordinal);
        var images = new List<ImageRange>();
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
                ValidateOccurrence(component);
                if (!ids.Add(component.Id) || component.Name is not null && !names.Add(component.Name))
                    throw new InvalidDataException("Duplicate PicoGK scene identity or authored name.");
                if (!prototypes.TryGetValue(component.PrototypeIdentity, out var prototypeId))
                {
                    Validate(component);
                    prototypeId = $"prototype:{ranges.Count + 1}";
                    prototypes.Add(component.PrototypeIdentity, prototypeId);
                    Align(stream, digest);
                    var positionOffset = stream.Position;
                    Append(stream, digest, MemoryMarshal.AsBytes<float>(component.Positions));
                    var normalOffset = stream.Position;
                    Append(stream, digest, MemoryMarshal.AsBytes<float>(component.Normals));
                    var indexOffset = stream.Position;
                    var small = component.Indices.All(index => index <= 65534);
                    if (small)
                    {
                        var indices = Array.ConvertAll(component.Indices, index => checked((ushort)index));
                        Append(stream, digest, MemoryMarshal.AsBytes<ushort>(indices));
                    }
                    else Append(stream, digest, MemoryMarshal.AsBytes<uint>(component.Indices));
                    Align(stream, digest);
                    var texCoordOffset = stream.Position;
                    Append(stream, digest, MemoryMarshal.AsBytes<float>(component.TexCoords ?? []));
                    var tangentOffset = stream.Position;
                    Append(stream, digest, MemoryMarshal.AsBytes<float>(component.Tangents ?? []));
                    ranges.Add(new PrototypeRange(prototypeId, component.Kind,
                        positionOffset, component.Positions.Length, normalOffset, component.Normals.Length,
                        indexOffset, component.Indices.Length, small ? 5123 : 5125,
                        texCoordOffset, component.TexCoords?.Length ?? 0, tangentOffset, component.Tangents?.Length ?? 0));
                }
                var m = component.Matrix;
                occurrences.Add(new SceneOccurrence(component.Id, prototypeId, component.Name,
                    [m.M11, m.M12, m.M13, m.M14, m.M21, m.M22, m.M23, m.M24,
                     m.M31, m.M32, m.M33, m.M34, m.M41, m.M42, m.M43, m.M44],
                    component.Color, component.Metallic, component.Roughness, component.Material));
            }
            foreach (var image in resources?.Images ?? [])
            {
                Align(stream, digest);
                images.Add(new ImageRange(stream.Position, image.Data.Length, image.MimeType, image.Name));
                Append(stream, digest, image.Data);
            }
            byteLength = stream.Position;
        }
        return (path, byteLength, Convert.ToHexString(digest.GetHashAndReset()).ToLowerInvariant(), ranges, occurrences, images);
    }

    private static void ValidateOccurrence(ExtractedComponent component)
    {
        if (!component.Id.StartsWith("component:picogk-", StringComparison.Ordinal) ||
            !int.TryParse(component.Id[17..], out var ordinal) || ordinal < 1 ||
            component.Name is not null && (string.IsNullOrWhiteSpace(component.Name) || component.Name.Trim() != component.Name) ||
            !CaptureViewerBackend.AffineFinite(component.Matrix) ||
            component.Color.Length != 4 || component.Color.Any(value => !float.IsFinite(value) || value < 0 || value > 1) ||
            !float.IsFinite(component.Metallic) || component.Metallic < 0 || component.Metallic > 1 ||
            !float.IsFinite(component.Roughness) || component.Roughness < 0 || component.Roughness > 1)
            throw new InvalidDataException("Invalid PicoGK scene occurrence.");
    }

    private static void Validate(ExtractedComponent component)
    {
        var vertices = component.Positions.Length / 3;
        if (!component.Id.StartsWith("component:picogk-", StringComparison.Ordinal) ||
            !int.TryParse(component.Id[17..], out var ordinal) || ordinal < 1 ||
            component.Name is not null && (string.IsNullOrWhiteSpace(component.Name) || component.Name.Trim() != component.Name) ||
            !CaptureViewerBackend.AffineFinite(component.Matrix) || component.Positions.Length == 0 ||
            component.Positions.Length % 3 != 0 || component.Indices.Length == 0 ||
            component.Kind is not ("triangles" or "lines") ||
            component.Kind == "triangles" && (component.Normals.Length != component.Positions.Length || component.Indices.Length % 3 != 0) ||
            component.Kind == "lines" && (component.Normals.Length != 0 || component.Indices.Length % 2 != 0 || vertices < 2) ||
            component.Indices.Any(index => index >= vertices) ||
            component.Positions.Any(value => !float.IsFinite(value)) || component.Normals.Any(value => !float.IsFinite(value)) ||
            component.Color.Length != 4 || component.Color.Any(value => !float.IsFinite(value) || value < 0 || value > 1) ||
            !float.IsFinite(component.Metallic) || component.Metallic < 0 || component.Metallic > 1 ||
            !float.IsFinite(component.Roughness) || component.Roughness < 0 || component.Roughness > 1 ||
            component.TexCoords is { } uv && (component.Kind != "triangles" || uv.Length != vertices * 2 || uv.Any(value => !float.IsFinite(value))) ||
            component.Tangents is { } tangents && (component.Kind != "triangles" || tangents.Length != vertices * 4 ||
                tangents.Any(value => !float.IsFinite(value))))
            throw new InvalidDataException("Invalid PicoGK scene prototype or occurrence.");
    }

    private static void Align(Stream stream, IncrementalHash digest)
    {
        var padding = (int)((4 - stream.Position % 4) % 4);
        if (padding != 0) Append(stream, digest, new byte[padding]);
    }

    private static void Append(Stream stream, IncrementalHash digest, ReadOnlySpan<byte> bytes)
    {
        stream.Write(bytes);
        digest.AppendData(bytes);
    }
}
