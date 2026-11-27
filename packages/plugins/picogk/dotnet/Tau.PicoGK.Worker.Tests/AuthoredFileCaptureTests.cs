using System.Security.Cryptography;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed class AuthoredFileCaptureTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "tau-authored-" + Guid.NewGuid().ToString("N"));
    private string Workspace => Path.Combine(root, "project");
    private string Artifacts => Path.Combine(root, "artifacts");

    public AuthoredFileCaptureTests() => Directory.CreateDirectory(Workspace);
    public void Dispose() => Directory.Delete(root, recursive: true);

    [Fact]
    public void CapturesExactCopiesAndSkipsUntouchedInputs()
    {
        File.WriteAllBytes(Path.Combine(Workspace, "input.stl"), [1, 2]);
        using var capture = new AuthoredFileCapture(Workspace, Artifacts);
        Directory.CreateDirectory(Path.Combine(capture.OutputRoot, "nested"));
        File.WriteAllBytes(Path.Combine(capture.OutputRoot, "nested", "part.STL"), [0, 255, 0, 128]);
        File.WriteAllBytes(Path.Combine(Workspace, "field.vdb"), [3, 4, 5]);
        File.WriteAllText(Path.Combine(capture.OutputRoot, "PicoGK.log"), "not geometry");
        var files = capture.Complete();
        Assert.Equal(2, files.Count);
        var mesh = Assert.Single(files, file => file.Name == "nested/part.STL");
        Assert.Equal("model/stl", mesh.MimeType);
        Assert.Equal(4, mesh.ByteLength);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(new byte[] { 0, 255, 0, 128 })), mesh.Sha256);
        // The build's own output moves into the receipt; a later write at its old path is a new file.
        Assert.False(File.Exists(Path.Combine(capture.OutputRoot, "nested", "part.STL")));
        File.WriteAllBytes(Path.Combine(capture.OutputRoot, "nested", "part.STL"), [9]);
        Assert.Equal(new byte[] { 0, 255, 0, 128 }, File.ReadAllBytes(mesh.ArtifactPath));
        // A file written into the workspace stays the author's; the receipt owns a copy.
        var field = Assert.Single(files, file => file.Name == "field.vdb");
        Assert.Equal("application/vnd.openvdb", field.MimeType);
        Assert.Equal(Convert.ToHexStringLower(SHA256.HashData(new byte[] { 3, 4, 5 })), field.Sha256);
        File.WriteAllBytes(Path.Combine(Workspace, "field.vdb"), [6]);
        Assert.Equal(new byte[] { 3, 4, 5 }, File.ReadAllBytes(field.ArtifactPath));
        Assert.Throws<InvalidOperationException>(() => capture.Complete());
        capture.Dispose();
        Assert.False(Directory.Exists(capture.OutputRoot));
        Assert.True(File.Exists(mesh.ArtifactPath));
    }

    [Fact]
    public void CapturesChangedInputAndEmptyFile()
    {
        var input = Path.Combine(Workspace, "input.stl");
        File.WriteAllBytes(input, [1]);
        using var capture = new AuthoredFileCapture(Workspace, Artifacts);
        File.WriteAllBytes(input, []);
        var file = Assert.Single(capture.Complete());
        Assert.Equal(0, file.ByteLength);
        Assert.Empty(File.ReadAllBytes(file.ArtifactPath));
    }

    [Fact]
    public void RefusesAmbiguousNamesAndRemovesFailedRun()
    {
        var capture = new AuthoredFileCapture(Workspace, Artifacts);
        File.WriteAllBytes(Path.Combine(capture.OutputRoot, "part.stl"), [1]);
        File.WriteAllBytes(Path.Combine(Workspace, "part.stl"), [2]);
        Assert.Throws<InvalidOperationException>(() => capture.Complete());
        capture.Dispose();
        Assert.False(Directory.Exists(Path.GetDirectoryName(capture.OutputRoot)));
    }

    [Fact]
    public void RefusesLinksOutsideRun()
    {
        using var capture = new AuthoredFileCapture(Workspace, Artifacts);
        var outside = Path.Combine(root, "outside.stl");
        File.WriteAllBytes(outside, [1]);
        File.CreateSymbolicLink(Path.Combine(capture.OutputRoot, "escape.stl"), outside);
        Assert.Throws<IOException>(() => capture.Complete());
    }

    [Fact]
    public void StreamingDigestMatchesThePlatformAtEveryBlockBoundary()
    {
        var random = new Random(1337);
        var data = new byte[300];
        random.NextBytes(data);
        var hash = new ManagedSha256();
        // Every padding shape (one or two final blocks), split at every chunk size including empty spans.
        for (var length = 0; length <= data.Length; length++)
        {
            foreach (var chunk in new[] { 1, 7, 63, 64, 65, 300 })
            {
                hash.AppendData([]);
                for (var offset = 0; offset < length; offset += chunk)
                    hash.AppendData(data.AsSpan(offset, Math.Min(chunk, length - offset)));
                Assert.Equal(SHA256.HashData(data.AsSpan(0, length)), hash.GetHashAndReset());
            }
        }
        using var platform = new StreamingSha256();
        platform.AppendData(data);
        Assert.Equal(SHA256.HashData(data), platform.GetHashAndReset());
    }

    [Fact]
    public void StreamingFileDigestCrossesChunks()
    {
        var source = Path.Combine(root, "large.bin");
        var bytes = new byte[(1 << 20) * 2 + 17];
        new Random(7).NextBytes(bytes);
        File.WriteAllBytes(source, bytes);
        var expected = Convert.ToHexStringLower(SHA256.HashData(bytes));
        Assert.Equal(expected, StreamingSha256.HexOf(source));
        var target = Path.Combine(root, "copy.bin");
        Assert.Equal(expected, StreamingSha256.CopyAndHex(source, target));
        Assert.Equal(bytes, File.ReadAllBytes(target));
        Assert.Throws<IOException>(() => StreamingSha256.CopyAndHex(source, target));
    }
}
