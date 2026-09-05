using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tau.PicoGK.Worker;

internal sealed record Request(int ProtocolVersion, string RequestId, string Method, JsonElement Params);

internal sealed record Issue(
    string Message,
    string Code,
    string Type,
    string Severity,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    Location? Location = null);

internal sealed record Location(string FileName, int StartLineNumber, int StartColumn);

internal sealed record ComputeArtifact(
    string CacheKey,
    string Kind,
    string ArtifactPath,
    long ByteLength,
    string Sha256,
    int PositionCount,
    int IndexCount);

internal sealed record ComputeRequest(string ModelDigest, IReadOnlyList<ComputeArtifact> Prepared);

internal sealed class WorkerException : Exception
{
    internal WorkerException(Issue issue) : this([issue]) { }

    internal WorkerException(IReadOnlyList<Issue> issues) : base(string.Join("; ", issues.Select(issue => issue.Message))) =>
        Issues = issues;

    internal IReadOnlyList<Issue> Issues { get; }
}
