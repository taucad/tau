using System.Collections.Immutable;
using System.Text;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CodeRefactorings;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.QuickInfo;
using Microsoft.CodeAnalysis.Tags;
using Microsoft.CodeAnalysis.Text;
using Tau.CSharp.LanguageService.RoslynHost;
using RoslynCodeAction = Microsoft.CodeAnalysis.CodeActions.CodeAction;
using RoslynCompletionItem = Microsoft.CodeAnalysis.Completion.CompletionItem;
using RoslynCompletionList = Microsoft.CodeAnalysis.Completion.CompletionList;
using RoslynDiagnostic = Microsoft.CodeAnalysis.Diagnostic;

namespace Tau.CSharp.LanguageService;

public sealed partial class CSharpLanguageServer
{
    private static readonly Lazy<ImmutableArray<CodeFixProvider>> FixProviders = new(() =>
        LoadProviders<CodeFixProvider>(typeof(ExportCodeFixProviderAttribute)));

    private static readonly Lazy<ImmutableArray<CodeRefactoringProvider>> RefactoringProviders = new(() =>
        LoadProviders<CodeRefactoringProvider>(typeof(ExportCodeRefactoringProviderAttribute)));

    private static readonly SymbolDisplayFormat SignatureFormat = SymbolDisplayFormat.MinimallyQualifiedFormat
        .WithParameterOptions(SymbolDisplayParameterOptions.IncludeType | SymbolDisplayParameterOptions.IncludeName |
            SymbolDisplayParameterOptions.IncludeDefaultValue | SymbolDisplayParameterOptions.IncludeModifiers)
        .WithMemberOptions(SymbolDisplayMemberOptions.IncludeType | SymbolDisplayMemberOptions.IncludeContainingType |
            SymbolDisplayMemberOptions.IncludeParameters);

    private int completionResultId;
    private (int ResultId, string Uri, int Version, RoslynCompletionList List)? lastCompletion;
    private int codeActionResultId;
    private (int ResultId, string Uri, ImmutableArray<RoslynCodeAction> Actions)? lastCodeActions;

    private async Task<CompletionList> CompletionAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, text, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var service = CompletionService.GetService(document);
        if (service is null)
        {
            return new CompletionList(false, []);
        }
        var list = await service.GetCompletionsAsync(document, offset, cancellationToken: cancellationToken).ConfigureAwait(false);
        var resultId = ++completionResultId;
        lastCompletion = (resultId, request.TextDocument.Uri, workspace.OpenVersion(request.TextDocument.Uri) ?? 0, list);
        var items = new List<CompletionItem>(list.ItemsList.Count);
        for (var index = 0; index < list.ItemsList.Count; index++)
        {
            var item = list.ItemsList[index];
            var label = $"{item.DisplayTextPrefix}{item.DisplayText}{item.DisplayTextSuffix}";
            items.Add(new CompletionItem(
                label,
                CompletionKind(item.Tags),
                Detail: item.InlineDescription is { Length: > 0 } description ? description : null,
                FilterText: item.FilterText != label ? item.FilterText : null,
                SortText: item.SortText != label ? item.SortText : null,
                Preselect: item.Rules.MatchPriority > 0 ? true : null,
                TextEdit: new TextEdit(Positions.ToRange(text, item.Span), item.DisplayText),
                Data: new CompletionItemData(resultId, index)));
        }
        return new CompletionList(false, items);
    }

    private async Task<CompletionItem> ResolveCompletionAsync(CompletionItem item, CancellationToken cancellationToken)
    {
        if (item.Data is not { } data || lastCompletion is not var (resultId, uri, version, list) || resultId != data.ResultId ||
            data.Index < 0 || data.Index >= list.ItemsList.Count || (workspace.OpenVersion(uri) ?? 0) != version)
        {
            return item;
        }
        var document = workspace.GetDocument(uri);
        var service = CompletionService.GetService(document)!;
        var roslynItem = list.ItemsList[data.Index];
        var description = await service.GetDescriptionAsync(document, roslynItem, cancellationToken).ConfigureAwait(false);
        var resolved = description is null || description.TaggedParts.IsEmpty
            ? item
            : await DescribeAsync(item, roslynItem, description, document, cancellationToken).ConfigureAwait(false);
        if (!roslynItem.IsComplexTextEdit)
        {
            return resolved;
        }
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var change = await service.GetChangeAsync(document, roslynItem, cancellationToken: cancellationToken).ConfigureAwait(false);
        var primary = change.TextChanges.FirstOrDefault(textChange => textChange.Span.IntersectsWith(roslynItem.Span) || textChange.Span.Start == roslynItem.Span.Start);
        var additional = change.TextChanges
            .Where(textChange => textChange != primary)
            .Select(textChange => new TextEdit(Positions.ToRange(text, textChange.Span), textChange.NewText ?? ""))
            .ToArray();
        return resolved with
        {
            TextEdit = primary.NewText is null ? item.TextEdit : new TextEdit(Positions.ToRange(text, primary.Span), primary.NewText),
            AdditionalTextEdits = additional.Length == 0 ? null : additional,
        };
    }

    /// <summary>The item with Roslyn's description as documentation, its summary references linked as hover links them.</summary>
    private async Task<CompletionItem> DescribeAsync(
        CompletionItem item,
        RoslynCompletionItem roslynItem,
        CompletionDescription description,
        Document document,
        CancellationToken cancellationToken)
    {
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        var symbol = await CompletionSymbols.GetSymbolAsync(roslynItem, document, cancellationToken).ConfigureAwait(false);
        if (model is null || symbol is null)
        {
            return item with { Documentation = new MarkupContent("markdown", Markdown(description.TaggedParts)) };
        }
        var links = new DocumentationLinks(this, model.Compilation);
        var summary = await links.RenderAsync(DocumentationComments.Root(symbol)?.Element("summary"), cancellationToken).ConfigureAwait(false);
        return item with
        {
            Documentation = new MarkupContent("markdown", CompletionMarkdown(description.TaggedParts, summary)),
            DefinitionTargets = links.Targets,
        };
    }

    private static int CompletionKind(ImmutableArray<string> tags)
    {
        foreach (var tag in tags)
        {
            switch (tag)
            {
                case WellKnownTags.Method:
                    return LspKinds.CompletionMethod;
                case WellKnownTags.ExtensionMethod:
                    return LspKinds.CompletionMethod;
                case WellKnownTags.Property:
                    return LspKinds.CompletionProperty;
                case WellKnownTags.Field:
                    return LspKinds.CompletionField;
                case WellKnownTags.Class:
                    return LspKinds.CompletionClass;
                case WellKnownTags.Structure:
                    return LspKinds.CompletionStruct;
                case WellKnownTags.Interface:
                    return LspKinds.CompletionInterface;
                case WellKnownTags.Enum:
                    return LspKinds.CompletionEnum;
                case WellKnownTags.EnumMember:
                    return LspKinds.CompletionEnumMember;
                case WellKnownTags.Delegate:
                    return LspKinds.CompletionClass;
                case WellKnownTags.Event:
                    return LspKinds.CompletionEvent;
                case WellKnownTags.Constant:
                    return LspKinds.CompletionConstant;
                case WellKnownTags.Local:
                case WellKnownTags.Parameter:
                case WellKnownTags.RangeVariable:
                    return LspKinds.CompletionVariable;
                case WellKnownTags.Namespace:
                    return LspKinds.CompletionModule;
                case WellKnownTags.Keyword:
                    return LspKinds.CompletionKeyword;
                case WellKnownTags.Snippet:
                    return LspKinds.CompletionSnippet;
                case WellKnownTags.TypeParameter:
                    return LspKinds.CompletionTypeParameter;
                case WellKnownTags.Operator:
                    return LspKinds.CompletionOperator;
            }
        }
        return LspKinds.CompletionText;
    }

    private async Task<Hover?> HoverAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, text, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var service = QuickInfoService.GetService(document);
        if (service is null)
        {
            return null;
        }
        var info = await service.GetQuickInfoAsync(document, offset, cancellationToken).ConfigureAwait(false);
        if (info is null && offset > 0)
        {
            info = await service.GetQuickInfoAsync(document, offset - 1, cancellationToken).ConfigureAwait(false);
        }
        if (info is null || info.Sections.IsEmpty)
        {
            return null;
        }
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        var links = model is null ? null : new DocumentationLinks(this, model.Compilation);
        var summary = links is not null && await SymbolAtAsync(document, offset, cancellationToken).ConfigureAwait(false) is { } symbol
            ? await links.RenderAsync(DocumentationComments.Root(symbol)?.Element("summary"), cancellationToken).ConfigureAwait(false)
            : null;
        var markdown = new StringBuilder();
        foreach (var section in info.Sections)
        {
            var body = section.Kind switch
            {
                QuickInfoSectionKinds.Description => $"```csharp\n{section.Text}\n```",
                QuickInfoSectionKinds.DocumentationComments when summary is not null => summary,
                _ => Markdown(section.TaggedParts),
            };
            if (string.IsNullOrWhiteSpace(body))
            {
                continue;
            }
            if (markdown.Length > 0)
            {
                markdown.Append("\n\n");
            }
            markdown.Append(body);
        }
        return new Hover(
            new MarkupContent("markdown", markdown.ToString()),
            Positions.ToRange(text, info.Span),
            links?.Targets);
    }

    /// <summary>
    /// Documentation rendered with each <c>see cref</c> that resolves to a definition as a link, as VS Code renders C#
    /// documentation. Every section of one response shares the link indices, which address <see cref="Targets"/>.
    /// </summary>
    private sealed class DocumentationLinks(CSharpLanguageServer server, Compilation compilation)
    {
        private readonly Dictionary<string, int?> indices = new(StringComparer.Ordinal);
        private readonly List<Location> targets = [];

        /// <summary>The locations the links open, indexed by <c>#tau-definition-N</c>; null while there are none.</summary>
        internal IReadOnlyList<Location>? Targets => targets.Count == 0 ? null : targets;

        /// <summary>One documentation element, such as a <c>summary</c> or <c>param</c>, as linked Markdown.</summary>
        internal async Task<string?> RenderAsync(XElement? element, CancellationToken cancellationToken)
        {
            if (element is null)
            {
                return null;
            }
            foreach (var cref in DocumentationComments.Crefs(element))
            {
                if (indices.ContainsKey(cref))
                {
                    continue;
                }
                indices[cref] = DocumentationCommentId.GetFirstSymbolForDeclarationId(cref, compilation) is { } target &&
                    await server.LocationsOfAsync(target, cancellationToken).ConfigureAwait(false) is [var location, ..]
                    ? Add(location)
                    : null;
            }
            var text = DocumentationComments.Flatten(element, cref => indices.GetValueOrDefault(cref));
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }

        private int Add(Location location)
        {
            targets.Add(location);
            return targets.Count - 1;
        }
    }

    /// <summary>
    /// A completion description: Roslyn's signature line, then the symbol's linked summary in place of Roslyn's
    /// plain-text documentation when the symbol has one, as hover renders it.
    /// </summary>
    private static string CompletionMarkdown(ImmutableArray<TaggedText> parts, string? summary)
    {
        if (summary is null)
        {
            return Markdown(parts);
        }
        var signature = parts.TakeWhile(part => part.Tag != TextTags.LineBreak).ToImmutableArray();
        var head = Markdown(signature);
        return head.Length == 0 ? summary : $"{head}\n\n{summary}";
    }

    // Roslyn's internal TextTags that bracket the signature in a completion description.
    private const string CodeBlockStartTag = "CodeBlockStart";
    private const string CodeBlockEndTag = "CodeBlockEnd";

    /// <summary>Render tagged text as Markdown, fencing the code blocks Roslyn marks, such as a completion's signature.</summary>
    private static string Markdown(ImmutableArray<TaggedText> parts)
    {
        var builder = new StringBuilder();
        foreach (var part in parts)
        {
            builder.Append(part.Tag switch
            {
                TextTags.LineBreak => "\n\n",
                CodeBlockStartTag => "```csharp\n",
                CodeBlockEndTag => "\n```\n",
                _ => part.Text,
            });
        }
        // A fence's closing newline and the line break after it would otherwise leave an empty paragraph.
        return builder.ToString().Replace("```\n\n\n", "```\n\n", StringComparison.Ordinal).Trim();
    }

    /// <summary>
    /// Roslyn's signature help providers are internal, so overloads come from the semantic model: the member group
    /// of the invoked expression, constructors of the created type, or indexers, with the active argument.
    /// </summary>
    private async Task<SignatureHelp?> SignatureHelpAsync(TextDocumentPositionParams request, CancellationToken cancellationToken)
    {
        var (document, _, offset) = await LocateAsync(request.TextDocument, request.Position, cancellationToken).ConfigureAwait(false);
        var root = await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false);
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        if (root is null || model is null)
        {
            return null;
        }
        var links = new DocumentationLinks(this, model.Compilation);
        var token = root.FindToken(Math.Max(0, offset - 1));
        var list = token.Parent?.AncestorsAndSelf().OfType<BaseArgumentListSyntax>()
            .FirstOrDefault(candidate => Inside(candidate, offset));
        if (list is null)
        {
            return null;
        }
        ImmutableArray<IMethodSymbol> candidates;
        ISymbol? selected;
        switch (list.Parent)
        {
            case InvocationExpressionSyntax invocation:
                candidates = [.. model.GetMemberGroup(invocation.Expression, cancellationToken).OfType<IMethodSymbol>()];
                selected = model.GetSymbolInfo(invocation, cancellationToken).Symbol;
                break;
            case BaseObjectCreationExpressionSyntax creation:
                var created = model.GetTypeInfo(creation, cancellationToken).Type as INamedTypeSymbol;
                candidates = created is null
                    ? []
                    : [.. created.InstanceConstructors.Where(constructor => model.IsAccessible(offset, constructor))];
                selected = model.GetSymbolInfo(creation, cancellationToken).Symbol;
                break;
            case ConstructorInitializerSyntax initializer:
                candidates = [.. model.GetMemberGroup(initializer, cancellationToken).OfType<IMethodSymbol>()];
                selected = model.GetSymbolInfo(initializer, cancellationToken).Symbol;
                break;
            case ElementAccessExpressionSyntax access:
                var indexers = model.GetIndexerGroup(access.Expression, cancellationToken);
                return await SignaturesAsync(
                    [.. indexers.Select(indexer => (ISymbol)indexer)],
                    model.GetSymbolInfo(access, cancellationToken).Symbol,
                    list,
                    offset,
                    links,
                    cancellationToken).ConfigureAwait(false);
            default:
                return null;
        }
        return await SignaturesAsync(
            [.. candidates.Select(candidate => (ISymbol)candidate)],
            selected,
            list,
            offset,
            links,
            cancellationToken).ConfigureAwait(false);
    }

    private static bool Inside(BaseArgumentListSyntax list, int offset)
    {
        var (open, close) = list switch
        {
            ArgumentListSyntax arguments => (arguments.OpenParenToken, arguments.CloseParenToken),
            BracketedArgumentListSyntax brackets => (brackets.OpenBracketToken, brackets.CloseBracketToken),
            _ => (default, default),
        };
        return !open.IsMissing && offset > open.SpanStart && (close.IsMissing || offset <= close.SpanStart);
    }

    private static async Task<SignatureHelp?> SignaturesAsync(
        ImmutableArray<ISymbol> candidates,
        ISymbol? selected,
        BaseArgumentListSyntax list,
        int offset,
        DocumentationLinks links,
        CancellationToken cancellationToken)
    {
        if (candidates.IsEmpty)
        {
            return null;
        }
        var argumentIndex = list.Arguments.GetSeparators().Count(separator => separator.SpanStart < offset);
        var named = list.Arguments.ElementAtOrDefault(argumentIndex)?.NameColon?.Name.Identifier.ValueText;
        var signatures = new List<SignatureInformation>();
        var active = 0;
        foreach (var (candidate, index) in candidates.Select((candidate, index) => (candidate, index)))
        {
            var parameters = candidate switch
            {
                IMethodSymbol method => method.Parameters,
                IPropertySymbol property => property.Parameters,
                _ => [],
            };
            var label = new StringBuilder();
            label.Append(candidate is IMethodSymbol { MethodKind: MethodKind.Constructor } constructor
                ? constructor.ContainingType.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)
                : candidate is IMethodSymbol ordinary
                    ? $"{ordinary.ReturnType.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)} {ordinary.ContainingType?.Name}.{ordinary.Name}"
                    : $"{((IPropertySymbol)candidate).Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)} this");
            label.Append(candidate is IPropertySymbol ? '[' : '(');
            var documentation = DocumentationComments.Root(candidate);
            var summary = await links.RenderAsync(documentation?.Element("summary"), cancellationToken).ConfigureAwait(false);
            var information = new List<ParameterInformation>();
            foreach (var (parameter, position) in parameters.Select((parameter, position) => (parameter, position)))
            {
                if (position > 0)
                {
                    label.Append(", ");
                }
                var start = label.Length;
                label.Append(parameter.ToDisplayString(SignatureFormat));
                var text = documentation is null
                    ? null
                    : await links.RenderAsync(DocumentationComments.Parameter(documentation, parameter.Name), cancellationToken).ConfigureAwait(false);
                information.Add(new ParameterInformation([start, label.Length], text is null ? null : new MarkupContent("markdown", text)));
            }
            label.Append(candidate is IPropertySymbol ? ']' : ')');
            var activeParameter = named is not null
                ? parameters.IndexOf(parameters.FirstOrDefault(parameter => parameter.Name == named)!)
                : parameters.Length > 0 && parameters[^1].IsParams ? Math.Min(argumentIndex, parameters.Length - 1) : argumentIndex;
            signatures.Add(new SignatureInformation(
                label.ToString(),
                summary is null ? null : new MarkupContent("markdown", summary),
                information,
                activeParameter));
            if (selected is not null && SymbolEqualityComparer.Default.Equals(candidate.OriginalDefinition, selected.OriginalDefinition))
            {
                active = index;
            }
            else if (selected is null && active == 0 && parameters.Length > argumentIndex && signatures.Count > 1 &&
                (signatures[0].Parameters.Count <= argumentIndex))
            {
                active = index;
            }
        }
        return new SignatureHelp(signatures, active, signatures[active].ActiveParameter ?? 0, links.Targets);
    }

    private async Task<List<TextEdit>> FormatAsync(DocumentFormattingParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var options = document.Project.Solution.Options
            .WithChangedOption(Microsoft.CodeAnalysis.Formatting.FormattingOptions.TabSize, LanguageNames.CSharp, request.Options.TabSize)
            .WithChangedOption(Microsoft.CodeAnalysis.Formatting.FormattingOptions.IndentationSize, LanguageNames.CSharp, request.Options.TabSize)
            .WithChangedOption(Microsoft.CodeAnalysis.Formatting.FormattingOptions.UseTabs, LanguageNames.CSharp, !request.Options.InsertSpaces);
        var root = await document.GetSyntaxRootAsync(cancellationToken).ConfigureAwait(false);
        var span = request.Range is null ? root!.FullSpan : Positions.ToSpan(text, request.Range);
        var changes = Formatter.GetFormattedTextChanges(root!, span, workspace.Solution.Workspace, options, cancellationToken);
        return [.. changes.Select(change => new TextEdit(Positions.ToRange(text, change.Span), change.NewText ?? ""))];
    }

    private async Task<List<CodeAction>> CodeActionsAsync(CodeActionParams request, CancellationToken cancellationToken)
    {
        var document = workspace.GetDocument(request.TextDocument.Uri);
        var text = await document.GetTextAsync(cancellationToken).ConfigureAwait(false);
        var span = Positions.ToSpan(text, request.Range);
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        var diagnostics = model!.GetDiagnostics(cancellationToken: cancellationToken)
            .Where(diagnostic => diagnostic.Location.IsInSource && diagnostic.Severity != DiagnosticSeverity.Hidden &&
                (diagnostic.Location.SourceSpan.IntersectsWith(span) || diagnostic.Location.SourceSpan.Contains(span.Start) ||
                    span.IsEmpty && diagnostic.Location.SourceSpan.End == span.Start))
            .ToArray();
        var actions = ImmutableArray.CreateBuilder<(RoslynCodeAction Action, RoslynDiagnostic? Diagnostic, string Kind)>();
        foreach (var diagnostic in diagnostics)
        {
            foreach (var provider in FixProviders.Value.Where(provider => provider.FixableDiagnosticIds.Contains(diagnostic.Id)))
            {
                var registered = new List<RoslynCodeAction>();
                var context = new CodeFixContext(document, diagnostic, (action, _) => registered.Add(action), cancellationToken);
                try
                {
                    await provider.RegisterCodeFixesAsync(context).ConfigureAwait(false);
                }
                catch (Exception error) when (error is not OperationCanceledException)
                {
                    continue;
                }
                foreach (var action in registered.SelectMany(Flatten))
                {
                    actions.Add((action, diagnostic, "quickfix"));
                }
            }
        }
        foreach (var provider in RefactoringProviders.Value)
        {
            var registered = new List<RoslynCodeAction>();
            var context = new CodeRefactoringContext(document, span, action => registered.Add(action), cancellationToken);
            try
            {
                await provider.ComputeRefactoringsAsync(context).ConfigureAwait(false);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                continue;
            }
            foreach (var action in registered.SelectMany(Flatten))
            {
                actions.Add((action, null, "refactor"));
            }
        }
        var unique = actions.DistinctBy(entry => entry.Action.Title).ToImmutableArray();
        var resultId = ++codeActionResultId;
        lastCodeActions = (resultId, request.TextDocument.Uri, [.. unique.Select(entry => entry.Action)]);
        return [.. unique.Select((entry, index) => new CodeAction(
            entry.Action.Title,
            entry.Kind,
            entry.Diagnostic is null ? null : [ToDiagnostic(text, entry.Diagnostic)],
            Data: new CodeActionData(resultId, index),
            IsPreferred: entry.Kind == "quickfix" && index == 0 ? true : null))];
    }

    private static IEnumerable<RoslynCodeAction> Flatten(RoslynCodeAction action) =>
        action.NestedActions.IsDefaultOrEmpty ? [action] : action.NestedActions.SelectMany(Flatten);

    private async Task<CodeAction> ResolveCodeActionAsync(CodeAction action, CancellationToken cancellationToken)
    {
        if (action.Data is not { } data || lastCodeActions is not var (resultId, _, actions) || resultId != data.ResultId ||
            data.Index < 0 || data.Index >= actions.Length)
        {
            throw new LspException(LspException.RequestFailed, "The code action is stale; request actions again.");
        }
        var solution = workspace.Solution;
        var operations = await actions[data.Index].GetOperationsAsync(cancellationToken).ConfigureAwait(false);
        var changed = operations.OfType<ApplyChangesOperation>().LastOrDefault()?.ChangedSolution;
        return action with { Edit = changed is null ? new WorkspaceEdit([]) : new WorkspaceEdit(await DiffAsync(solution, changed, cancellationToken).ConfigureAwait(false)) };
    }

    private static ImmutableArray<T> LoadProviders<T>(Type exportAttribute)
        where T : class
    {
        var providers = ImmutableArray.CreateBuilder<T>();
        foreach (var assembly in ProjectWorkspace.FeatureAssemblies)
        {
            Type[] types;
            try
            {
                types = assembly.GetTypes();
            }
            catch (System.Reflection.ReflectionTypeLoadException error)
            {
                types = [.. error.Types.OfType<Type>()];
            }
            foreach (var type in types)
            {
                if (type.IsAbstract || !typeof(T).IsAssignableFrom(type) ||
                    !type.GetCustomAttributesData().Any(attribute =>
                        attribute.AttributeType == exportAttribute &&
                        attribute.ConstructorArguments.SelectMany(argument => argument.Value is IEnumerable<System.Reflection.CustomAttributeTypedArgument> values ? values.Select(value => value.Value) : [argument.Value])
                            .Contains(LanguageNames.CSharp)))
                {
                    continue;
                }
                var constructor = type.GetConstructor(Type.EmptyTypes);
                if (constructor is null)
                {
                    continue;
                }
                try
                {
                    providers.Add((T)constructor.Invoke(null));
                }
                catch (Exception)
                {
                    // A provider that needs host services this workspace does not compose is not offered.
                }
            }
        }
        return providers.ToImmutable();
    }
}
