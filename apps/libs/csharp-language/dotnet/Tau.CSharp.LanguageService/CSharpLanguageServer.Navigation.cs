using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Rename;
using Microsoft.CodeAnalysis.Text;

namespace Tau.CSharp.LanguageService;

public sealed partial class CSharpLanguageServer
{
    private async Task<(Document Document, SourceText Text, int Offset)> LocateAsync(
        TextDocumentIdentifier identifier,
        Position position,
        CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(identifier.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        return (document, text, Positions.ToOffset(text, position));
    }

    private async Task<ISymbol?> SymbolAtAsync(Document document, int offset, CancellationToken cancellationToken)
    {
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        if (model is null)
        {
            return null;
        }
        var symbol = await SymbolFinder.FindSymbolAtPositionAsync(model, offset, workspace.Solution.Workspace, cancellationToken).ConfigureAwait(false);
        // A caret just after an identifier (end of word) still names it, as editors place it after typing.
        if (symbol is null && offset > 0)
        {
            symbol = await SymbolFinder.FindSymbolAtPositionAsync(model, offset - 1, workspace.Solution.Workspace, cancellationToken).ConfigureAwait(false);
        }
        return symbol switch
        {
            IMethodSymbol { ReducedFrom: { } reduced } => reduced,
            IAliasSymbol alias => alias.Target,
            _ => symbol,
        };
    }

    private async Task<List<Location>> DefinitionAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        return symbol is null ? [] : await LocationsOfAsync(symbol, cancellationToken).ConfigureAwait(false);
    }

    private async Task<List<Location>> TypeDefinitionAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        ITypeSymbol? type = symbol switch
        {
            ILocalSymbol local => local.Type,
            IParameterSymbol parameter => parameter.Type,
            IFieldSymbol field => field.Type,
            IPropertySymbol property => property.Type,
            IEventSymbol @event => @event.Type,
            IMethodSymbol method => method.ReturnType,
            ITypeSymbol typeSymbol => typeSymbol,
            _ => null,
        };
        while (type is IArrayTypeSymbol array)
        {
            type = array.ElementType;
        }
        return type is null or ITypeParameterSymbol ? [] : await LocationsOfAsync(type, cancellationToken).ConfigureAwait(false);
    }

    private async Task<List<Location>> ImplementationAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (symbol is null)
        {
            return [];
        }
        var solution = workspace.Solution;
        IEnumerable<ISymbol> implementations = symbol switch
        {
            INamedTypeSymbol { TypeKind: TypeKind.Interface } type =>
                await SymbolFinder.FindImplementationsAsync(type, solution, cancellationToken: cancellationToken).ConfigureAwait(false),
            INamedTypeSymbol { TypeKind: TypeKind.Class } type =>
                await SymbolFinder.FindDerivedClassesAsync(type, solution, cancellationToken: cancellationToken).ConfigureAwait(false),
            _ when symbol.IsAbstract || symbol.IsVirtual || symbol.ContainingType?.TypeKind == TypeKind.Interface =>
                (await SymbolFinder.FindImplementationsAsync(symbol, solution, cancellationToken: cancellationToken).ConfigureAwait(false))
                    .Concat(await SymbolFinder.FindOverridesAsync(symbol, solution, cancellationToken: cancellationToken).ConfigureAwait(false)),
            _ => [symbol],
        };
        var locations = new List<Location>();
        foreach (var implementation in implementations)
        {
            locations.AddRange(SourceLocations(implementation));
        }
        return Distinct(locations);
    }

    private async Task<List<Location>> ReferencesAsync(ReferenceParams request, CancellationToken cancellationToken)
    {
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (symbol is null)
        {
            return [];
        }
        var locations = new List<Location>();
        foreach (var referenced in await FindReferencesAsync(symbol, null, cancellationToken).ConfigureAwait(false))
        {
            if (request.Context?.IncludeDeclaration != false)
            {
                locations.AddRange(SourceLocations(referenced.Definition));
            }
            foreach (var reference in referenced.Locations.Where(reference => !reference.IsImplicit))
            {
                if (ToLocation(reference.Location) is { } location)
                {
                    locations.Add(location);
                }
            }
        }
        return Distinct(locations);
    }

    private async Task<List<DocumentHighlight>> DocumentHighlightAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, text, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (symbol is null)
        {
            return [];
        }
        var highlights = new Dictionary<TextSpan, DocumentHighlight>();
        foreach (var referenced in await FindReferencesAsync(symbol, document, cancellationToken).ConfigureAwait(false))
        {
            foreach (var location in referenced.Definition.Locations.Where(location => location.SourceTree?.FilePath == document.FilePath))
            {
                highlights.TryAdd(location.SourceSpan, new DocumentHighlight(Positions.ToRange(text, location.SourceSpan), LspKinds.HighlightWrite));
            }
            foreach (var reference in referenced.Locations.Where(reference => !reference.IsImplicit && reference.Document.FilePath == document.FilePath))
            {
                var span = reference.Location.SourceSpan;
                highlights.TryAdd(span, new DocumentHighlight(Positions.ToRange(text, span), LspKinds.HighlightRead));
            }
        }
        return [.. highlights.OrderBy(entry => entry.Key.Start).Select(entry => entry.Value)];
    }

    private async Task<IEnumerable<ReferencedSymbol>> FindReferencesAsync(ISymbol symbol, Document? scope, CancellationToken cancellationToken)
    {
        var solution = workspace.Solution;
        var documents = scope is null ? null : System.Collections.Immutable.ImmutableHashSet.Create(scope);
        var results = new List<ReferencedSymbol>(await SymbolFinder.FindReferencesAsync(symbol, solution, documents, cancellationToken).ConfigureAwait(false));
        // A helper's declarations are distinct symbols in each program's compilation; search the same
        // declaration as every linked program project sees it so references from other programs are included.
        if (symbol.Locations.FirstOrDefault(location => location.IsInSource) is { SourceTree: { } tree } declaration && scope is null)
        {
            var uri = workspace.UriForPath(tree.FilePath);
            foreach (var id in uri is null ? [] : workspace.LinkedDocuments(uri))
            {
                var linked = solution.GetDocument(id);
                if (linked is null || linked.Project.Id == solution.GetDocument(tree)?.Project.Id)
                {
                    continue;
                }
                var model = await linked.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
                var counterpart = model is null
                    ? null
                    : await SymbolFinder.FindSymbolAtPositionAsync(model, declaration.SourceSpan.Start, solution.Workspace, cancellationToken).ConfigureAwait(false);
                if (counterpart is not null)
                {
                    results.AddRange(await SymbolFinder.FindReferencesAsync(counterpart, solution, cancellationToken).ConfigureAwait(false));
                }
            }
        }
        return results;
    }

    private async Task<PrepareRenameResult?> PrepareRenameAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, text, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (symbol is null || !CanRename(symbol))
        {
            return null;
        }
        var root = await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false);
        var token = root!.FindToken(offset);
        if (!token.Span.Contains(offset) && offset > 0)
        {
            token = root.FindToken(offset - 1);
        }
        return token.Span.IsEmpty || !Microsoft.CodeAnalysis.CSharp.SyntaxFacts.IsIdentifierStartCharacter(token.ValueText.FirstOrDefault())
            ? null
            : new PrepareRenameResult(Positions.ToRange(text, token.Span), token.ValueText);
    }

    private static bool CanRename(ISymbol symbol) =>
        symbol.Locations.Any(location => location.IsInSource) &&
        !symbol.IsImplicitlyDeclared &&
        symbol is not INamespaceSymbol { IsGlobalNamespace: true };

    private async Task<WorkspaceEdit> RenameAsync(RenameParams request, CancellationToken cancellationToken)
    {
        if (!Microsoft.CodeAnalysis.CSharp.SyntaxFacts.IsValidIdentifier(request.NewName.TrimStart('@')))
        {
            throw new LspException(LspException.InvalidParams, $"'{request.NewName}' is not a valid C# identifier.");
        }
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var symbol = await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (symbol is null || !CanRename(symbol))
        {
            throw new LspException(LspException.RequestFailed, "This element cannot be renamed.");
        }
        var solution = workspace.Solution;
        var renamed = await Renamer.RenameSymbolAsync(solution, symbol, new SymbolRenameOptions(), request.NewName, cancellationToken).ConfigureAwait(false);
        var edits = await DiffAsync(solution, renamed, cancellationToken).ConfigureAwait(false);
        // Helper declarations used by several programs: rename the counterpart in each linked program so every
        // program's references change, and merge per file.
        foreach (var counterpart in await LinkedCounterpartsAsync(symbol, cancellationToken).ConfigureAwait(false))
        {
            var linked = await Renamer.RenameSymbolAsync(solution, counterpart, new SymbolRenameOptions(), request.NewName, cancellationToken).ConfigureAwait(false);
            foreach (var edit in await DiffAsync(solution, linked, cancellationToken).ConfigureAwait(false))
            {
                var existing = edits.FindIndex(candidate => candidate.TextDocument.Uri == edit.TextDocument.Uri);
                if (existing < 0)
                {
                    edits.Add(edit);
                }
                else
                {
                    edits[existing] = edits[existing] with
                    {
                        Edits = [.. edits[existing].Edits.Concat(edit.Edits).DistinctBy(item => (item.Range, item.NewText))],
                    };
                }
            }
        }
        return new WorkspaceEdit(edits);
    }

    private async Task<List<ISymbol>> LinkedCounterpartsAsync(ISymbol symbol, CancellationToken cancellationToken)
    {
        var counterparts = new List<ISymbol>();
        var solution = workspace.Solution;
        if (symbol.Locations.FirstOrDefault(location => location.IsInSource) is not { SourceTree: { } tree } declaration)
        {
            return counterparts;
        }
        var owner = solution.GetDocument(tree)?.Project.Id;
        var uri = workspace.UriForPath(tree.FilePath);
        foreach (var id in uri is null ? [] : workspace.LinkedDocuments(uri))
        {
            var linked = solution.GetDocument(id);
            if (linked is null || linked.Project.Id == owner)
            {
                continue;
            }
            var model = await linked.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
            if (model is not null && await SymbolFinder.FindSymbolAtPositionAsync(model, declaration.SourceSpan.Start, solution.Workspace, cancellationToken).ConfigureAwait(false) is { } counterpart)
            {
                counterparts.Add(counterpart);
            }
        }
        return counterparts;
    }

    /// <summary>Convert a changed solution into versioned edits, one per editor URI, ignoring linked duplicates.</summary>
    private async Task<List<TextDocumentEdit>> DiffAsync(Solution before, Solution after, CancellationToken cancellationToken)
    {
        var edits = new List<TextDocumentEdit>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var projectChanges in after.GetChanges(before).GetProjectChanges())
        {
            foreach (var id in projectChanges.GetChangedDocuments(onlyGetDocumentsWithTextChanges: true))
            {
                var oldDocument = before.GetDocument(id)!;
                var uri = workspace.UriForPath(oldDocument.FilePath);
                if (uri is null || !seen.Add(uri))
                {
                    continue;
                }
                var newDocument = after.GetDocument(id)!;
                var oldText = await oldDocument.GetTextAsync(cancellationToken).ConfigureAwait(false);
                var changes = await newDocument.GetTextChangesAsync(oldDocument, cancellationToken).ConfigureAwait(false);
                edits.Add(new TextDocumentEdit(
                    new VersionedTextDocumentIdentifier(uri, workspace.OpenVersion(uri)),
                    [.. changes.Select(change => new TextEdit(Positions.ToRange(oldText, change.Span), change.NewText ?? ""))]));
            }
            if (projectChanges.GetAddedDocuments().Any() || projectChanges.GetRemovedDocuments().Any())
            {
                throw new LspException(LspException.RequestFailed, "This change would add or remove files, which the editor applies only as text edits.");
            }
        }
        return edits;
    }

    private async Task<List<Location>> LocationsOfAsync(ISymbol symbol, CancellationToken cancellationToken)
    {
        symbol = symbol.OriginalDefinition;
        if (symbol.Locations.Any(location => location.IsInSource))
        {
            var source = await SymbolFinder.FindSourceDefinitionAsync(symbol, workspace.Solution, cancellationToken).ConfigureAwait(false) ?? symbol;
            return Distinct([.. SourceLocations(source)]);
        }
        if (MetadataAsSource.TopLevelType(symbol) is not { } type || MetadataAsSource.KeyOf(symbol) is not { } key)
        {
            return [];
        }
        var declaration = Declaration(type);
        var position = declaration.Positions.TryGetValue(key, out var found)
            ? found
            : declaration.Positions.GetValueOrDefault(MetadataAsSource.KeyOf(type)!, new Position(0, 0));
        return [new Location(declaration.Uri, new Range(position, position))];
    }

    private DeclarationSource Declaration(INamedTypeSymbol type)
    {
        var uri = MetadataAsSource.UriFor(type);
        if (!declarations.TryGetValue(uri, out var declaration))
        {
            declaration = MetadataAsSource.Generate(type);
            declarations[uri] = declaration;
        }
        return declaration;
    }

    private async Task<MetadataSource> MetadataSourceForAsync(string uri, CancellationToken cancellationToken)
    {
        if (declarations.TryGetValue(uri, out var cached))
        {
            return new MetadataSource(uri, cached.Text);
        }
        if (MetadataAsSource.ParseUri(uri) is not var (assembly, metadataName))
        {
            throw new LspException(LspException.InvalidParams, $"Not a C# metadata URI: {uri}");
        }
        foreach (var project in workspace.Solution.Projects)
        {
            var compilation = await project.GetCompilationAsync(cancellationToken).ConfigureAwait(false);
            foreach (var type in compilation?.GetTypesByMetadataName(metadataName) ?? [])
            {
                if (type.ContainingAssembly.Name == assembly)
                {
                    return new MetadataSource(uri, Declaration(type).Text);
                }
            }
        }
        throw new LspException(LspException.RequestFailed, $"No declaration for {uri}");
    }

    private IEnumerable<Location> SourceLocations(ISymbol symbol) =>
        symbol.Locations.Where(location => location.IsInSource).Select(ToLocation).OfType<Location>();

    private Location? ToLocation(Microsoft.CodeAnalysis.Location location)
    {
        if (!location.IsInSource || workspace.UriForPath(location.SourceTree!.FilePath) is not { } uri)
        {
            return null;
        }
        return new Location(uri, Positions.ToRange(location.GetLineSpan().Span));
    }

    private static List<Location> Distinct(IEnumerable<Location> locations) =>
        [.. locations.DistinctBy(location => (location.Uri, location.Range))];
}
