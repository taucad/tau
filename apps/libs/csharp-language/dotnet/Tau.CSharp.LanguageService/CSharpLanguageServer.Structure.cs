using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Classification;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Text;
using RoslynDiagnostic = Microsoft.CodeAnalysis.Diagnostic;

namespace Tau.CSharp.LanguageService;

/// <summary>The fixed semantic-token legend and its mapping from Roslyn classifications.</summary>
internal static class SemanticTokenLegend
{
    internal static readonly string[] Types =
    [
        "namespace", "class", "struct", "interface", "enum", "enumMember", "typeParameter", "method", "property",
        "field", "variable", "parameter", "event", "keyword", "string", "number", "comment", "operator", "delegate",
        "record", "label", "macro",
    ];

    internal static readonly string[] Modifiers = ["static", "readonly", "declaration", "defaultLibrary"];

    private static readonly Dictionary<string, int> Index =
        Types.Select((type, index) => (type, index)).ToDictionary(entry => entry.type, entry => entry.index, StringComparer.Ordinal);

    internal static int? TypeOf(string classification) => classification switch
    {
        ClassificationTypeNames.NamespaceName => Index["namespace"],
        ClassificationTypeNames.ClassName => Index["class"],
        ClassificationTypeNames.RecordClassName => Index["record"],
        ClassificationTypeNames.StructName or ClassificationTypeNames.RecordStructName => Index["struct"],
        ClassificationTypeNames.InterfaceName => Index["interface"],
        ClassificationTypeNames.EnumName => Index["enum"],
        ClassificationTypeNames.EnumMemberName => Index["enumMember"],
        ClassificationTypeNames.TypeParameterName => Index["typeParameter"],
        ClassificationTypeNames.MethodName or ClassificationTypeNames.ExtensionMethodName => Index["method"],
        ClassificationTypeNames.PropertyName => Index["property"],
        ClassificationTypeNames.FieldName or ClassificationTypeNames.ConstantName => Index["field"],
        ClassificationTypeNames.LocalName => Index["variable"],
        ClassificationTypeNames.ParameterName => Index["parameter"],
        ClassificationTypeNames.EventName => Index["event"],
        ClassificationTypeNames.DelegateName => Index["delegate"],
        ClassificationTypeNames.LabelName => Index["label"],
        ClassificationTypeNames.Keyword or ClassificationTypeNames.ControlKeyword => Index["keyword"],
        ClassificationTypeNames.PreprocessorKeyword => Index["macro"],
        ClassificationTypeNames.StringLiteral or ClassificationTypeNames.VerbatimStringLiteral => Index["string"],
        ClassificationTypeNames.NumericLiteral => Index["number"],
        ClassificationTypeNames.Comment or ClassificationTypeNames.XmlDocCommentText or
            ClassificationTypeNames.XmlDocCommentDelimiter or ClassificationTypeNames.XmlDocCommentName or
            ClassificationTypeNames.XmlDocCommentAttributeName or ClassificationTypeNames.XmlDocCommentAttributeValue or
            ClassificationTypeNames.XmlDocCommentAttributeQuotes or ClassificationTypeNames.XmlDocCommentAttributeValue or
            ClassificationTypeNames.XmlDocCommentEntityReference or ClassificationTypeNames.XmlDocCommentProcessingInstruction or
            ClassificationTypeNames.XmlDocCommentCDataSection => Index["comment"],
        ClassificationTypeNames.Operator or ClassificationTypeNames.OperatorOverloaded => Index["operator"],
        _ => null,
    };
}

public sealed partial class CSharpLanguageServer
{
    private async Task<DocumentDiagnosticReport> DiagnosticsAsync(DocumentParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        var items = model!.GetDiagnostics(cancellationToken: cancellationToken)
            .Where(diagnostic => diagnostic.Severity != DiagnosticSeverity.Hidden && diagnostic.Location.IsInSource &&
                diagnostic.Location.SourceTree == model.SyntaxTree)
            .OrderBy(diagnostic => diagnostic.Location.SourceSpan.Start)
            .Select(diagnostic => ToDiagnostic(text, diagnostic))
            .ToArray();
        return new DocumentDiagnosticReport("full", items);
    }

    private static Diagnostic ToDiagnostic(SourceText text, RoslynDiagnostic diagnostic)
    {
        var tags = new List<int>();
        if (diagnostic.Descriptor.CustomTags.Contains(WellKnownDiagnosticTags.Unnecessary))
        {
            tags.Add(LspKinds.TagUnnecessary);
        }
        if (diagnostic.Id is "CS0612" or "CS0618" or "CS0619")
        {
            tags.Add(LspKinds.TagDeprecated);
        }
        return new Diagnostic(
            Positions.ToRange(text, diagnostic.Location.SourceSpan),
            diagnostic.Severity switch
            {
                DiagnosticSeverity.Error => LspKinds.DiagnosticError,
                DiagnosticSeverity.Warning => LspKinds.DiagnosticWarning,
                DiagnosticSeverity.Info => LspKinds.DiagnosticInformation,
                _ => LspKinds.DiagnosticHint,
            },
            diagnostic.GetMessage(System.Globalization.CultureInfo.InvariantCulture),
            diagnostic.Id,
            "csharp",
            tags.Count == 0 ? null : tags);
    }

    private async Task<SemanticTokens> SemanticTokensAsync(DocumentParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var spans = await Classifier.GetClassifiedSpansAsync(document, new TextSpan(0, text.Length), cancellationToken).ConfigureAwait(false);
        var tokens = new SortedDictionary<int, (int Length, int Type, int Modifiers)>();
        foreach (var span in spans)
        {
            if (span.ClassificationType == ClassificationTypeNames.StaticSymbol)
            {
                if (tokens.TryGetValue(span.TextSpan.Start, out var existing))
                {
                    tokens[span.TextSpan.Start] = existing with { Modifiers = existing.Modifiers | 1 };
                }
                continue;
            }
            if (SemanticTokenLegend.TypeOf(span.ClassificationType) is not { } type || span.TextSpan.IsEmpty)
            {
                continue;
            }
            var modifiers = tokens.TryGetValue(span.TextSpan.Start, out var prior) ? prior.Modifiers : 0;
            tokens[span.TextSpan.Start] = (span.TextSpan.Length, type, modifiers);
        }
        // Static classifications may precede the span they modify; fold them in after the primary pass.
        foreach (var span in spans.Where(span => span.ClassificationType == ClassificationTypeNames.StaticSymbol))
        {
            if (tokens.TryGetValue(span.TextSpan.Start, out var token))
            {
                tokens[span.TextSpan.Start] = token with { Modifiers = token.Modifiers | 1 };
            }
        }
        var data = new List<int>(tokens.Count * 5);
        var previousLine = 0;
        var previousCharacter = 0;
        foreach (var (start, token) in tokens)
        {
            // LSP tokens never span lines: split multi-line comments and verbatim strings per line.
            var end = start + token.Length;
            var position = start;
            while (position < end)
            {
                var line = text.Lines.GetLineFromPosition(position);
                var segmentEnd = Math.Min(end, line.End);
                if (segmentEnd > position)
                {
                    var lineNumber = line.LineNumber;
                    var character = position - line.Start;
                    data.Add(lineNumber - previousLine);
                    data.Add(lineNumber == previousLine ? character - previousCharacter : character);
                    data.Add(segmentEnd - position);
                    data.Add(token.Type);
                    data.Add(token.Modifiers);
                    previousLine = lineNumber;
                    previousCharacter = character;
                }
                position = line.EndIncludingLineBreak;
            }
        }
        return new SemanticTokens(data);
    }

    private async Task<List<FoldingRange>> FoldingRangesAsync(DocumentParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var root = (CompilationUnitSyntax)(await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false))!;
        var ranges = new List<FoldingRange>();
        void Add(int start, int end, string? kind = null)
        {
            var startLine = text.Lines.GetLineFromPosition(start).LineNumber;
            var endLine = text.Lines.GetLineFromPosition(end).LineNumber;
            if (endLine > startLine)
            {
                ranges.Add(new FoldingRange(startLine, endLine, kind));
            }
        }
        foreach (var node in root.DescendantNodes())
        {
            var (open, close) = node switch
            {
                BlockSyntax block => (block.OpenBraceToken, block.CloseBraceToken),
                BaseTypeDeclarationSyntax type => (type.OpenBraceToken, type.CloseBraceToken),
                NamespaceDeclarationSyntax ns => (ns.OpenBraceToken, ns.CloseBraceToken),
                AccessorListSyntax accessors => (accessors.OpenBraceToken, accessors.CloseBraceToken),
                InitializerExpressionSyntax initializer => (initializer.OpenBraceToken, initializer.CloseBraceToken),
                SwitchStatementSyntax @switch => (@switch.OpenBraceToken, @switch.CloseBraceToken),
                SwitchExpressionSyntax @switch => (@switch.OpenBraceToken, @switch.CloseBraceToken),
                AnonymousObjectCreationExpressionSyntax anonymous => (anonymous.OpenBraceToken, anonymous.CloseBraceToken),
                _ => (default, default),
            };
            if (open.IsKind(SyntaxKind.OpenBraceToken) && !close.IsMissing)
            {
                // Keep the closing brace visible: fold through the line before it.
                var closeLine = text.Lines.GetLineFromPosition(close.SpanStart).LineNumber;
                var openLine = text.Lines.GetLineFromPosition(open.SpanStart).LineNumber;
                if (closeLine - 1 > openLine)
                {
                    ranges.Add(new FoldingRange(openLine, closeLine - 1));
                }
            }
        }
        var usings = root.Usings;
        if (usings.Count > 1)
        {
            Add(usings[0].SpanStart, usings[^1].Span.End, "imports");
        }
        var regions = new Stack<int>();
        foreach (var directive in root.DescendantTrivia().Where(trivia => trivia.HasStructure))
        {
            if (directive.IsKind(SyntaxKind.RegionDirectiveTrivia))
            {
                regions.Push(directive.SpanStart);
            }
            else if (directive.IsKind(SyntaxKind.EndRegionDirectiveTrivia) && regions.Count > 0)
            {
                Add(regions.Pop(), directive.Span.End, "region");
            }
        }
        foreach (var comment in root.DescendantTrivia().Where(trivia => trivia.IsKind(SyntaxKind.MultiLineCommentTrivia) ||
            trivia.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) || trivia.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia)))
        {
            Add(comment.SpanStart, comment.Span.End - (comment.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) ? 1 : 0), "comment");
        }
        return [.. ranges.DistinctBy(range => (range.StartLine, range.EndLine)).OrderBy(range => range.StartLine)];
    }

    private async Task<List<DocumentSymbol>> DocumentSymbolsAsync(DocumentParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var root = (CompilationUnitSyntax)(await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false))!;
        return [.. Symbols(text, root.Members)];
    }

    private static IEnumerable<DocumentSymbol> Symbols(SourceText text, IEnumerable<SyntaxNode> members)
    {
        foreach (var member in members)
        {
            switch (member)
            {
                case BaseNamespaceDeclarationSyntax ns:
                    yield return Symbol(text, ns, ns.Name.ToString(), LspKinds.SymbolNamespace, ns.Name.Span, children: Symbols(text, ns.Members));
                    break;
                case EnumDeclarationSyntax @enum:
                    yield return Symbol(text, @enum, @enum.Identifier.ValueText, LspKinds.SymbolEnum, @enum.Identifier.Span,
                        children: @enum.Members.Select(value => Symbol(text, value, value.Identifier.ValueText, LspKinds.SymbolEnumMember, value.Identifier.Span)));
                    break;
                case TypeDeclarationSyntax type:
                    yield return Symbol(text, type, type.Identifier.ValueText, type switch
                    {
                        InterfaceDeclarationSyntax => LspKinds.SymbolInterface,
                        StructDeclarationSyntax => LspKinds.SymbolStruct,
                        RecordDeclarationSyntax record when record.ClassOrStructKeyword.IsKind(SyntaxKind.StructKeyword) => LspKinds.SymbolStruct,
                        _ => LspKinds.SymbolClass,
                    }, type.Identifier.Span, children: Symbols(text, type.Members));
                    break;
                case DelegateDeclarationSyntax @delegate:
                    yield return Symbol(text, @delegate, @delegate.Identifier.ValueText, LspKinds.SymbolClass, @delegate.Identifier.Span);
                    break;
                case MethodDeclarationSyntax method:
                    yield return Symbol(text, method, method.Identifier.ValueText, LspKinds.SymbolMethod, method.Identifier.Span,
                        $"({string.Join(", ", method.ParameterList.Parameters.Select(parameter => parameter.Type?.ToString()))})",
                        LocalFunctions(text, method.Body ?? (SyntaxNode?)method.ExpressionBody));
                    break;
                case ConstructorDeclarationSyntax constructor:
                    yield return Symbol(text, constructor, constructor.Identifier.ValueText, LspKinds.SymbolConstructor, constructor.Identifier.Span);
                    break;
                case PropertyDeclarationSyntax property:
                    yield return Symbol(text, property, property.Identifier.ValueText, LspKinds.SymbolProperty, property.Identifier.Span, property.Type.ToString());
                    break;
                case IndexerDeclarationSyntax indexer:
                    yield return Symbol(text, indexer, "this[]", LspKinds.SymbolProperty, indexer.ThisKeyword.Span);
                    break;
                case EventDeclarationSyntax @event:
                    yield return Symbol(text, @event, @event.Identifier.ValueText, LspKinds.SymbolEvent, @event.Identifier.Span);
                    break;
                case BaseFieldDeclarationSyntax field:
                    foreach (var variable in field.Declaration.Variables)
                    {
                        yield return Symbol(text, variable, variable.Identifier.ValueText,
                            field is EventFieldDeclarationSyntax ? LspKinds.SymbolEvent
                                : field.Modifiers.Any(SyntaxKind.ConstKeyword) ? LspKinds.SymbolConstant : LspKinds.SymbolField,
                            variable.Identifier.Span, field.Declaration.Type.ToString());
                    }
                    break;
                case OperatorDeclarationSyntax @operator:
                    yield return Symbol(text, @operator, $"operator {@operator.OperatorToken.ValueText}", LspKinds.SymbolOperator, @operator.OperatorToken.Span);
                    break;
                case GlobalStatementSyntax { Statement: LocalFunctionStatementSyntax local }:
                    yield return Symbol(text, local, local.Identifier.ValueText, LspKinds.SymbolFunction, local.Identifier.Span);
                    break;
            }
        }
    }

    private static IEnumerable<DocumentSymbol>? LocalFunctions(SourceText text, SyntaxNode? body)
    {
        var locals = body?.DescendantNodes(node => node is not LocalFunctionStatementSyntax || node == body)
            .OfType<LocalFunctionStatementSyntax>()
            .Select(local => Symbol(text, local, local.Identifier.ValueText, LspKinds.SymbolFunction, local.Identifier.Span))
            .ToArray();
        return locals is { Length: > 0 } ? locals : null;
    }

    private static DocumentSymbol Symbol(
        SourceText text,
        SyntaxNode node,
        string name,
        int kind,
        TextSpan selection,
        string? detail = null,
        IEnumerable<DocumentSymbol>? children = null)
    {
        var list = children?.ToArray();
        return new DocumentSymbol(
            name.Length == 0 ? "?" : name,
            kind,
            Positions.ToRange(text, node.Span),
            Positions.ToRange(text, selection),
            detail,
            list is { Length: > 0 } ? list : null);
    }

    private async Task<List<SymbolInformation>> WorkspaceSymbolsAsync(WorkspaceSymbolParams request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            return [];
        }
        var results = new List<SymbolInformation>();
        foreach (var project in workspace.Solution.Projects)
        {
            foreach (var symbol in await SymbolFinder.FindSourceDeclarationsWithPatternAsync(project, request.Query, SymbolFilter.TypeAndMember, cancellationToken).ConfigureAwait(false))
            {
                foreach (var location in SourceLocations(symbol))
                {
                    results.Add(new SymbolInformation(symbol.Name, SymbolKind(symbol), location, symbol.ContainingSymbol?.ToDisplayString()));
                }
            }
        }
        return [.. results.DistinctBy(result => (result.Location.Uri, result.Location.Range, result.Name)).Take(200)];
    }

    private static int SymbolKind(ISymbol symbol) => symbol switch
    {
        INamedTypeSymbol { TypeKind: TypeKind.Interface } => LspKinds.SymbolInterface,
        INamedTypeSymbol { TypeKind: TypeKind.Struct } => LspKinds.SymbolStruct,
        INamedTypeSymbol { TypeKind: TypeKind.Enum } => LspKinds.SymbolEnum,
        INamedTypeSymbol => LspKinds.SymbolClass,
        IMethodSymbol { MethodKind: MethodKind.Constructor } => LspKinds.SymbolConstructor,
        IMethodSymbol => LspKinds.SymbolMethod,
        IPropertySymbol => LspKinds.SymbolProperty,
        IFieldSymbol { IsConst: true } => LspKinds.SymbolConstant,
        IFieldSymbol { ContainingType.TypeKind: TypeKind.Enum } => LspKinds.SymbolEnumMember,
        IFieldSymbol => LspKinds.SymbolField,
        IEventSymbol => LspKinds.SymbolEvent,
        _ => LspKinds.SymbolVariable,
    };
}
