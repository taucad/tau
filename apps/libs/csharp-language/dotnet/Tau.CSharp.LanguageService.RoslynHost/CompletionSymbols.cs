using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.Completion.Providers;
using Microsoft.CodeAnalysis.Recommendations;
using Microsoft.CodeAnalysis.Shared.Extensions;

namespace Tau.CSharp.LanguageService.RoslynHost;

/// <summary>
/// The symbol a completion item offers, recovered as Roslyn's own completion description recovers it. Roslyn
/// decodes it with internal helpers: recommended members carry a name, kind and context position, other symbol
/// items encoded symbol keys, unimported extension methods a method key and unimported types a metadata name.
/// </summary>
public static class CompletionSymbols
{
    /// <summary>The property that holds an unimported extension method's symbol key (<c>ImportCompletionItem.MethodKey</c>, private).</summary>
    private const string MethodKey = "MethodKey";

    /// <summary>The first symbol behind <paramref name="item"/>, or null for keywords, snippets and other text items.</summary>
    public static async Task<ISymbol?> GetSymbolAsync(CompletionItem item, Document document, CancellationToken cancellationToken)
    {
        if (SymbolCompletionItem.HasSymbols(item))
        {
            var symbols = await SymbolCompletionItem.GetSymbolsAsync(item, document, cancellationToken).ConfigureAwait(false);
            return symbols.FirstOrDefault(symbol => !symbol.IsObsolete()) ?? symbols.FirstOrDefault();
        }
        if (SymbolCompletionItem.GetKind(item) is { } kind && SymbolCompletionItem.GetSymbolName(item) is { } name)
        {
            // The recommendation provider's description recomputes the symbols at the item's context position.
            var isGeneric = SymbolCompletionItem.GetSymbolIsGeneric(item);
            var recommended = await Recommender.GetRecommendedSymbolsAtPositionAsync(
                document,
                SymbolCompletionItem.GetContextPosition(item),
                cancellationToken: cancellationToken).ConfigureAwait(false);
            var matches = recommended
                .Where(symbol => symbol.Kind == kind && symbol.Name == name && symbol.GetArity() > 0 == isGeneric)
                .ToArray();
            return matches.FirstOrDefault(symbol => !symbol.IsObsolete()) ?? matches.FirstOrDefault();
        }
        if (item.ProviderName?.EndsWith("ImportCompletionProvider", StringComparison.Ordinal) != true ||
            await document.Project.GetCompilationAsync(cancellationToken).ConfigureAwait(false) is not { } compilation)
        {
            return null;
        }
        if (item.TryGetProperty(MethodKey, out var methodKey))
        {
            return SymbolKey.ResolveString(methodKey, compilation, cancellationToken: cancellationToken).GetAnySymbol();
        }
        var containingNamespace = ImportCompletionItem.GetContainingNamespace(item);
        var typeName = ImportCompletionItem.GetTypeName(item);
        return compilation.GetTypeByMetadataName(containingNamespace.Length == 0 ? typeName : $"{containingNamespace}.{typeName}");
    }
}
