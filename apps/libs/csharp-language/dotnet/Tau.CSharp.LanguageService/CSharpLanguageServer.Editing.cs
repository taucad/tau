using System.Collections.Immutable;
using System.Text;
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
        var resolved = item with
        {
            Documentation = description is null || description.TaggedParts.IsEmpty
                ? null
                : new MarkupContent("markdown", Markdown(description.TaggedParts)),
        };
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
        var markdown = new StringBuilder();
        foreach (var section in info.Sections)
        {
            var body = section.Kind == QuickInfoSectionKinds.Description
                ? $"```csharp\n{section.Text}\n```"
                : Markdown(section.TaggedParts);
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
        return new Hover(new MarkupContent("markdown", markdown.ToString()), Positions.ToRange(text, info.Span));
    }

    /// <summary>Render tagged text as Markdown, fencing nothing: hover descriptions are fenced by the caller.</summary>
    private static string Markdown(ImmutableArray<TaggedText> parts)
    {
        var builder = new StringBuilder();
        foreach (var part in parts)
        {
            builder.Append(part.Tag switch
            {
                TextTags.LineBreak => "\n\n",
                _ => part.Text,
            });
        }
        return builder.ToString().Trim();
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
                return Signatures(
                    [.. indexers.Select(indexer => (ISymbol)indexer)],
                    model.GetSymbolInfo(access, cancellationToken).Symbol,
                    list,
                    offset);
            default:
                return null;
        }
        return Signatures([.. candidates.Select(candidate => (ISymbol)candidate)], selected, list, offset);
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

    private static SignatureHelp? Signatures(ImmutableArray<ISymbol> candidates, ISymbol? selected, BaseArgumentListSyntax list, int offset)
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
            var documentation = DocumentationComments.Read(candidate);
            var information = new List<ParameterInformation>();
            foreach (var (parameter, position) in parameters.Select((parameter, position) => (parameter, position)))
            {
                if (position > 0)
                {
                    label.Append(", ");
                }
                var start = label.Length;
                label.Append(parameter.ToDisplayString(SignatureFormat));
                information.Add(new ParameterInformation(
                    [start, label.Length],
                    documentation.Parameters.TryGetValue(parameter.Name, out var text) ? new MarkupContent("markdown", text) : null));
            }
            label.Append(candidate is IPropertySymbol ? ']' : ')');
            var activeParameter = named is not null
                ? parameters.IndexOf(parameters.FirstOrDefault(parameter => parameter.Name == named)!)
                : parameters.Length > 0 && parameters[^1].IsParams ? Math.Min(argumentIndex, parameters.Length - 1) : argumentIndex;
            signatures.Add(new SignatureInformation(
                label.ToString(),
                documentation.Summary is { } summary ? new MarkupContent("markdown", summary) : null,
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
        return new SignatureHelp(signatures, active, signatures[active].ActiveParameter ?? 0);
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
