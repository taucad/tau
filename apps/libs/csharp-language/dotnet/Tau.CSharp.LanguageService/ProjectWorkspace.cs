using System.Collections.Immutable;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;

namespace Tau.CSharp.LanguageService;

/// <summary>
/// The Roslyn solution for one Tau project. It mirrors the PicoGK compiler's source selection: each program file
/// (top-level statements or a static <c>Main</c>) compiles with every helper file and never with another program.
/// Helpers are linked documents in every program project; with no program, one project holds every file.
/// </summary>
internal sealed class ProjectWorkspace : IDisposable
{
    private const int MaximumFiles = 1000;
    private const int MaximumTextLength = 4 * 1024 * 1024;

    private static readonly Lazy<MefHostServices> Host = new(() => MefHostServices.Create(FeatureAssemblies));

    private readonly AdhocWorkspace workspace = new(Host.Value);
    private readonly ReferenceSet references;
    private readonly Dictionary<string, SourceFile> files = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> uriByPath = new(StringComparer.Ordinal);
    private readonly Dictionary<string, ImmutableArray<DocumentId>> documents = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DocumentId> contexts = new(StringComparer.Ordinal);
    private readonly HashSet<string> dirty = new(StringComparer.Ordinal);
    private string topology = "";

    internal ProjectWorkspace(ReferenceSet references)
    {
        this.references = references;
    }

    /// <summary>The assemblies composed into the MEF host, which also export code fix and refactoring providers.</summary>
    internal static IEnumerable<System.Reflection.Assembly> FeatureAssemblies =>
        [.. MefHostServices.DefaultAssemblies, typeof(RoslynHost.BrowserPersistentStorageConfiguration).Assembly];

    internal Solution Solution => workspace.CurrentSolution;

    internal IEnumerable<string> Uris => files.Keys;

    public void Dispose() => workspace.Dispose();

    /// <summary>Replace or patch the closed-file snapshot. Open documents keep their editor text.</summary>
    internal void SetWorkspaceFiles(IEnumerable<WorkspaceFile> snapshot, bool replace)
    {
        var listed = new HashSet<string>(StringComparer.Ordinal);
        foreach (var file in snapshot)
        {
            if (!IsCSharpUri(file.Uri))
            {
                continue;
            }
            listed.Add(file.Uri);
            if (file.Text is null)
            {
                RemoveClosedText(file.Uri);
                continue;
            }
            var entry = GetOrAdd(file.Uri);
            entry.ClosedText = SourceText.From(file.Text);
            dirty.Add(file.Uri);
        }
        if (replace)
        {
            foreach (var uri in files.Keys.Where(uri => !listed.Contains(uri)).ToArray())
            {
                RemoveClosedText(uri);
            }
        }
        Synchronize();
    }

    internal void Open(string uri, int version, string text)
    {
        var entry = GetOrAdd(uri);
        entry.OpenText = SourceText.From(text);
        entry.OpenVersion = version;
        dirty.Add(uri);
        Synchronize();
    }

    internal void Change(string uri, int? version, IReadOnlyList<TextDocumentContentChangeEvent> changes)
    {
        if (!files.TryGetValue(uri, out var entry) || entry.OpenText is null)
        {
            throw new LspException(LspException.InvalidParams, $"Document is not open: {uri}");
        }
        var text = entry.OpenText;
        foreach (var change in changes)
        {
            text = change.Range is null
                ? SourceText.From(change.Text)
                : text.WithChanges(new TextChange(Positions.ToSpan(text, change.Range), change.Text));
        }
        entry.OpenText = text;
        entry.OpenVersion = version ?? entry.OpenVersion + 1;
        dirty.Add(uri);
        Synchronize();
    }

    internal void Close(string uri)
    {
        if (!files.TryGetValue(uri, out var entry))
        {
            return;
        }
        entry.OpenText = null;
        entry.OpenVersion = null;
        if (entry.ClosedText is null)
        {
            Remove(uri);
        }
        else
        {
            dirty.Add(uri);
        }
        Synchronize();
    }

    internal int? OpenVersion(string uri) => files.TryGetValue(uri, out var entry) ? entry.OpenVersion : null;

    internal bool IsOpen(string uri) => files.TryGetValue(uri, out var entry) && entry.OpenText is not null;

    /// <summary>The document a request for <paramref name="uri"/> binds in: its own program, or the first program.</summary>
    internal Document GetDocument(string uri) =>
        contexts.TryGetValue(uri, out var id) && Solution.GetDocument(id) is { } document
            ? document
            : throw new LspException(LspException.InvalidParams, $"Unknown C# document: {uri}");

    internal Document? TryGetDocument(string uri) =>
        contexts.TryGetValue(uri, out var id) ? Solution.GetDocument(id) : null;

    internal ImmutableArray<DocumentId> LinkedDocuments(string uri) =>
        documents.TryGetValue(uri, out var ids) ? ids : [];

    /// <summary>Map a Roslyn source location back to the editor URI, or <c>null</c> for synthetic trees.</summary>
    internal string? UriForPath(string? path) => path is not null && uriByPath.TryGetValue(path, out var uri) ? uri : null;

    internal static string PathFromUri(string uri)
    {
        if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeFile)
        {
            throw new LspException(LspException.InvalidParams, $"Expected a file URI: {uri}");
        }
        return Uri.UnescapeDataString(parsed.AbsolutePath).TrimStart('/');
    }

    private static bool IsCSharpUri(string uri) => uri.EndsWith(".cs", StringComparison.OrdinalIgnoreCase);

    private SourceFile GetOrAdd(string uri)
    {
        if (files.TryGetValue(uri, out var entry))
        {
            return entry;
        }
        if (files.Count >= MaximumFiles)
        {
            throw new LspException(LspException.RequestFailed, $"The C# workspace exceeds {MaximumFiles} files.");
        }
        var path = PathFromUri(uri);
        entry = new SourceFile(uri, path);
        files.Add(uri, entry);
        uriByPath[path] = uri;
        return entry;
    }

    private void RemoveClosedText(string uri)
    {
        if (!files.TryGetValue(uri, out var entry))
        {
            return;
        }
        entry.ClosedText = null;
        if (entry.OpenText is null)
        {
            Remove(uri);
        }
    }

    private void Remove(string uri)
    {
        if (files.Remove(uri, out var entry))
        {
            uriByPath.Remove(entry.Path);
            dirty.Add(uri);
        }
    }

    private void Synchronize()
    {
        if (dirty.Count == 0)
        {
            return;
        }
        long total = 0;
        foreach (var file in files.Values)
        {
            total += file.Text.Length;
        }
        if (total > MaximumTextLength)
        {
            throw new LspException(LspException.RequestFailed, "The C# workspace exceeds the 4 MiB source limit.");
        }
        foreach (var uri in dirty)
        {
            if (files.TryGetValue(uri, out var file))
            {
                file.Reparse();
            }
        }
        var programs = files.Values.Where(file => file.IsProgram).OrderBy(file => file.Path, StringComparer.Ordinal).ToArray();
        var key = string.Join('\n', programs.Select(file => file.Uri)) + "\0" +
            string.Join('\n', files.Keys.Order(StringComparer.Ordinal));
        if (key != topology)
        {
            Rebuild(programs);
            topology = key;
        }
        else
        {
            var solution = Solution;
            foreach (var uri in dirty)
            {
                var file = files[uri];
                foreach (var id in documents[uri])
                {
                    solution = solution.WithDocumentSyntaxRoot(id, file.Tree.GetRoot(), PreservationMode.PreserveIdentity);
                }
            }
            Apply(solution);
        }
        dirty.Clear();
    }

    private void Rebuild(IReadOnlyList<SourceFile> programs)
    {
        documents.Clear();
        contexts.Clear();
        var helpers = files.Values.Where(file => !file.IsProgram).OrderBy(file => file.Path, StringComparer.Ordinal).ToArray();
        var projects = new List<ProjectInfo>();
        var linked = files.Keys.ToDictionary(uri => uri, _ => ImmutableArray.CreateBuilder<DocumentId>(), StringComparer.Ordinal);
        IEnumerable<SourceFile[]> groups = programs.Count == 0
            ? [helpers]
            : programs.Select(program => (SourceFile[])[program, .. helpers]);
        foreach (var group in groups)
        {
            var projectId = ProjectId.CreateNewId();
            var infos = new List<DocumentInfo>
            {
                DocumentInfo.Create(
                    DocumentId.CreateNewId(projectId),
                    "TauImplicitUsings.g.cs",
                    loader: TextLoader.From(TextAndVersion.Create(SourceText.From(CompilerContract.ImplicitUsings), VersionStamp.Create())),
                    filePath: CompilerContract.ImplicitUsingsPath),
            };
            foreach (var file in group)
            {
                var id = DocumentId.CreateNewId(projectId, file.Path);
                infos.Add(DocumentInfo.Create(
                    id,
                    Path.GetFileName(file.Path),
                    loader: TextLoader.From(TextAndVersion.Create(file.Text, VersionStamp.Create(), file.Path)),
                    filePath: file.Path));
                linked[file.Uri].Add(id);
                if (file.IsProgram || !contexts.ContainsKey(file.Uri))
                {
                    contexts[file.Uri] = id;
                }
            }
            projects.Add(ProjectInfo.Create(
                projectId,
                VersionStamp.Create(),
                group.FirstOrDefault(file => file.IsProgram)?.Path ?? "Helpers",
                "TauUserModel",
                LanguageNames.CSharp,
                compilationOptions: CompilerContract.CompilationOptions,
                parseOptions: CompilerContract.ParseOptions,
                documents: infos,
                metadataReferences: references.References));
        }
        foreach (var (uri, builder) in linked)
        {
            documents[uri] = builder.ToImmutable();
        }
        workspace.ClearSolution();
        workspace.AddSolution(SolutionInfo.Create(SolutionId.CreateNewId(), VersionStamp.Create(), projects: projects));
        var solution = Solution;
        foreach (var (uri, ids) in documents)
        {
            foreach (var id in ids)
            {
                solution = solution.WithDocumentSyntaxRoot(id, files[uri].Tree.GetRoot(), PreservationMode.PreserveIdentity);
            }
        }
        Apply(solution);
    }

    private void Apply(Solution solution)
    {
        if (!workspace.TryApplyChanges(solution))
        {
            throw new LspException(LspException.RequestFailed, "Roslyn refused the C# workspace update.");
        }
    }

    private sealed class SourceFile(string uri, string path)
    {
        private SourceText? parsedText;

        internal string Uri { get; } = uri;

        internal string Path { get; } = path;

        internal SourceText? ClosedText { get; set; }

        internal SourceText? OpenText { get; set; }

        internal int? OpenVersion { get; set; }

        internal SourceText Text => OpenText ?? ClosedText ?? SourceText.From("");

        internal SyntaxTree Tree { get; private set; } = CSharpSyntaxTree.ParseText("", CompilerContract.ParseOptions, path);

        internal bool IsProgram { get; private set; }

        /// <summary>Reparse incrementally from the previous tree and reclassify the file as a program or helper.</summary>
        internal void Reparse()
        {
            var text = Text;
            if (ReferenceEquals(text, parsedText))
            {
                return;
            }
            Tree = parsedText is null
                ? CSharpSyntaxTree.ParseText(text, CompilerContract.ParseOptions, Path)
                : Tree.WithChangedText(text);
            parsedText = text;
            var root = Tree.GetCompilationUnitRoot();
            IsProgram = root.Members.OfType<GlobalStatementSyntax>().Any() ||
                root.DescendantNodes(node => node is not BlockSyntax and not ArrowExpressionClauseSyntax)
                    .OfType<MethodDeclarationSyntax>()
                    .Any(method => method.Identifier.ValueText == "Main" && method.Modifiers.Any(SyntaxKind.StaticKeyword));
        }
    }
}
