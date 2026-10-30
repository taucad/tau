using System.Security.Cryptography;

namespace Tau.PicoGK.Worker;

// Both runtimes use this collector, so the two offer the same authored STL and VDB exports.
// Receipts own copies, never paths an author can overwrite in a subsequent build.
internal sealed class AuthoredFileCapture : IDisposable
{
    private readonly string workspace;
    private readonly string root;
    private readonly Dictionary<string, string> inputs;
    private bool completed;

    internal AuthoredFileCapture(string workspace, string artifacts)
    {
        this.workspace = Path.GetFullPath(workspace);
        root = Path.Combine(Path.GetFullPath(artifacts), "authored", Guid.NewGuid().ToString("N"));
        OutputRoot = Path.Combine(root, "work");
        inputs = GeometryFiles(this.workspace).ToDictionary(path => path, Digest, StringComparer.Ordinal);
        Directory.CreateDirectory(OutputRoot);
    }

    internal string OutputRoot { get; }

    internal IReadOnlyList<AuthoredFile> Complete()
    {
        if (completed) throw new InvalidOperationException("Authored files were already captured.");
        var files = new List<AuthoredFile>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var source in GeometryFiles(OutputRoot).Concat(GeometryFiles(workspace)))
        {
            var digest = Digest(source);
            if (inputs.TryGetValue(source, out var input) && input == digest) continue;
            var owner = source.StartsWith(OutputRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal)
                ? OutputRoot : workspace;
            var name = Path.GetRelativePath(owner, source).Replace(Path.DirectorySeparatorChar, '/');
            if (!names.Add(name)) throw new InvalidOperationException($"Conflicting authored output name: {name}.");
            var target = Path.Combine(root, "files", name);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(source, target);
            files.Add(new AuthoredFile(target, name, new FileInfo(target).Length, Digest(target),
                Path.GetExtension(name).Equals(".stl", StringComparison.OrdinalIgnoreCase) ? "model/stl" : "application/vnd.openvdb"));
        }
        completed = true;
        return files;
    }

    public void Dispose()
    {
        // Failed builds publish nothing. Successful receipts survive until the transport consumes them.
        if (Directory.Exists(completed ? OutputRoot : root))
            Directory.Delete(completed ? OutputRoot : root, recursive: true);
    }

    private static IEnumerable<string> GeometryFiles(string root)
    {
        foreach (var path in Directory.EnumerateFileSystemEntries(root).Order(StringComparer.Ordinal))
        {
            var attributes = File.GetAttributes(path);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Symbolic links are not admitted as authored outputs.");
            if ((attributes & FileAttributes.Directory) != 0)
            {
                foreach (var file in GeometryFiles(path)) yield return file;
            }
            else if (Path.GetExtension(path).Equals(".stl", StringComparison.OrdinalIgnoreCase)
                || Path.GetExtension(path).Equals(".vdb", StringComparison.OrdinalIgnoreCase))
                yield return path;
        }
    }

    private static string Digest(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexStringLower(SHA256.HashData(stream));
    }
}

internal sealed record AuthoredFile(string ArtifactPath, string Name, long ByteLength, string Sha256, string MimeType);
