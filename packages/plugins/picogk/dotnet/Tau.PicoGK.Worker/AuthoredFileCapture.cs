namespace Tau.PicoGK.Worker;

// Both runtimes use this collector, so the two offer the same authored STL and VDB exports.
// Receipts own their bytes, never paths an author can overwrite in a subsequent build.
//
// Capture costs no memory beyond the files themselves (D4). The browser's filesystem lives in the
// worker, so a copy is a second resident file; files in this build's own output directory are
// therefore moved into the receipt directory, which a rename does without touching their bytes.
// Files the model wrote into the workspace are copied, since the workspace is the author's. Each
// receipt is hashed once, in the pass that makes it, with a constant-memory digest.
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
        inputs = GeometryFiles(this.workspace).ToDictionary(path => path, StreamingSha256.HexOf, StringComparer.Ordinal);
        Directory.CreateDirectory(OutputRoot);
    }

    internal string OutputRoot { get; }

    internal IReadOnlyList<AuthoredFile> Complete()
    {
        if (completed) throw new InvalidOperationException("Authored files were already captured.");
        var files = new List<AuthoredFile>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Both trees are listed before any file leaves them: the receipts directory is not inside
        // either, but a move must not run under a live enumeration of its source directory.
        var outputs = GeometryFiles(OutputRoot).ToList();
        var written = GeometryFiles(workspace).ToList();
        foreach (var source in outputs.Concat(written))
        {
            var owned = source.StartsWith(OutputRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal);
            if (!owned && inputs.TryGetValue(source, out var input) && input == StreamingSha256.HexOf(source)) continue;
            var name = Path.GetRelativePath(owned ? OutputRoot : workspace, source).Replace(Path.DirectorySeparatorChar, '/');
            if (!names.Add(name)) throw new InvalidOperationException($"Conflicting authored output name: {name}.");
            var target = Path.Combine(root, "files", name);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            string digest;
            if (owned)
            {
                File.Move(source, target);
                digest = StreamingSha256.HexOf(target);
            }
            else digest = StreamingSha256.CopyAndHex(source, target);
            files.Add(new AuthoredFile(target, name, new FileInfo(target).Length, digest,
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
}

internal sealed record AuthoredFile(string ArtifactPath, string Name, long ByteLength, string Sha256, string MimeType);
