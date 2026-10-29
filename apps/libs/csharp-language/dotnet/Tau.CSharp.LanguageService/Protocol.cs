using System.Text.Json;
using System.Text.Json.Serialization;

namespace Tau.CSharp.LanguageService;

// The LSP 3.17 subset Tau's editor speaks. Positions are UTF-16 line/character pairs, as Roslyn's SourceText.

internal sealed record Position(int Line, int Character);

internal sealed record Range(Position Start, Position End);

internal sealed record Location(string Uri, Range Range);

internal sealed record TextDocumentIdentifier(string Uri);

/// <summary>LSP's optional-versioned identifier: <c>version</c> is required on the wire and null for closed files.</summary>
internal sealed record VersionedTextDocumentIdentifier(
    string Uri,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] int? Version);

internal sealed record TextDocumentItem(string Uri, string LanguageId, int Version, string Text);

internal sealed record TextDocumentPositionParams(TextDocumentIdentifier TextDocument, Position Position);

internal sealed record ReferenceContext(bool IncludeDeclaration);

internal sealed record ReferenceParams(TextDocumentIdentifier TextDocument, Position Position, ReferenceContext? Context);

internal sealed record RenameParams(TextDocumentIdentifier TextDocument, Position Position, string NewName);

internal sealed record DidOpenTextDocumentParams(TextDocumentItem TextDocument);

internal sealed record TextDocumentContentChangeEvent(Range? Range, string Text);

internal sealed record DidChangeTextDocumentParams(
    VersionedTextDocumentIdentifier TextDocument,
    IReadOnlyList<TextDocumentContentChangeEvent> ContentChanges);

internal sealed record DidCloseTextDocumentParams(TextDocumentIdentifier TextDocument);

internal sealed record DocumentParams(TextDocumentIdentifier TextDocument);

internal sealed record FormattingOptions(int TabSize, bool InsertSpaces);

internal sealed record DocumentFormattingParams(TextDocumentIdentifier TextDocument, FormattingOptions Options, Range? Range);

internal sealed record CodeActionContext(IReadOnlyList<Diagnostic>? Diagnostics);

internal sealed record CodeActionParams(TextDocumentIdentifier TextDocument, Range Range, CodeActionContext? Context);

internal sealed record WorkspaceSymbolParams(string Query);

/// <summary>Tau extension: the worker's snapshot of closed project files, replacing or patching the set.</summary>
internal sealed record WorkspaceFile(string Uri, string? Text);

internal sealed record WorkspaceFilesParams(IReadOnlyList<WorkspaceFile> Files, bool Replace);

internal sealed record MetadataSourceParams(string Uri);

internal sealed record MetadataSource(string Uri, string Text);

internal sealed record Diagnostic(
    Range Range,
    int Severity,
    string Message,
    string? Code = null,
    string? Source = null,
    IReadOnlyList<int>? Tags = null);

internal sealed record DocumentDiagnosticReport(string Kind, IReadOnlyList<Diagnostic> Items);

internal sealed record MarkupContent(string Kind, string Value);

internal sealed record Hover(MarkupContent Contents, Range? Range);

internal sealed record TextEdit(Range Range, string NewText);

internal sealed record CompletionItemData(int ResultId, int Index);

internal sealed record CompletionItem(
    string Label,
    int Kind,
    string? Detail = null,
    string? FilterText = null,
    string? SortText = null,
    bool? Preselect = null,
    TextEdit? TextEdit = null,
    IReadOnlyList<TextEdit>? AdditionalTextEdits = null,
    MarkupContent? Documentation = null,
    IReadOnlyList<string>? CommitCharacters = null,
    CompletionItemData? Data = null);

internal sealed record CompletionList(bool IsIncomplete, IReadOnlyList<CompletionItem> Items);

internal sealed record ParameterInformation(int[] Label, MarkupContent? Documentation);

internal sealed record SignatureInformation(
    string Label,
    MarkupContent? Documentation,
    IReadOnlyList<ParameterInformation> Parameters,
    int? ActiveParameter);

internal sealed record SignatureHelp(IReadOnlyList<SignatureInformation> Signatures, int ActiveSignature, int ActiveParameter);

internal sealed record DocumentHighlight(Range Range, int Kind);

internal sealed record PrepareRenameResult(Range Range, string Placeholder);

internal sealed record TextDocumentEdit(VersionedTextDocumentIdentifier TextDocument, IReadOnlyList<TextEdit> Edits);

internal sealed record WorkspaceEdit(IReadOnlyList<TextDocumentEdit> DocumentChanges);

internal sealed record SemanticTokens(IReadOnlyList<int> Data);

internal sealed record FoldingRange(int StartLine, int EndLine, string? Kind = null);

internal sealed record DocumentSymbol(
    string Name,
    int Kind,
    Range Range,
    Range SelectionRange,
    string? Detail = null,
    IReadOnlyList<DocumentSymbol>? Children = null);

internal sealed record SymbolInformation(string Name, int Kind, Location Location, string? ContainerName);

internal sealed record CodeActionData(int ResultId, int Index);

internal sealed record CodeAction(
    string Title,
    string Kind,
    IReadOnlyList<Diagnostic>? Diagnostics = null,
    WorkspaceEdit? Edit = null,
    CodeActionData? Data = null,
    bool? IsPreferred = null);

internal sealed record SemanticTokensLegend(IReadOnlyList<string> TokenTypes, IReadOnlyList<string> TokenModifiers);

internal sealed record CompletionOptions(IReadOnlyList<string> TriggerCharacters, bool ResolveProvider);

internal sealed record SignatureHelpOptions(IReadOnlyList<string> TriggerCharacters, IReadOnlyList<string> RetriggerCharacters);

internal sealed record SemanticTokensOptions(SemanticTokensLegend Legend, bool Full);

internal sealed record RenameOptions(bool PrepareProvider);

internal sealed record CodeActionOptions(IReadOnlyList<string> CodeActionKinds, bool ResolveProvider);

internal sealed record DiagnosticOptions(bool InterFileDependencies, bool WorkspaceDiagnostics);

internal sealed record TextDocumentSyncOptions(bool OpenClose, int Change);

internal sealed record ServerCapabilities(
    TextDocumentSyncOptions TextDocumentSync,
    CompletionOptions CompletionProvider,
    bool HoverProvider,
    SignatureHelpOptions SignatureHelpProvider,
    bool DefinitionProvider,
    bool TypeDefinitionProvider,
    bool ImplementationProvider,
    bool ReferencesProvider,
    bool DocumentHighlightProvider,
    bool DocumentSymbolProvider,
    bool WorkspaceSymbolProvider,
    CodeActionOptions CodeActionProvider,
    bool DocumentFormattingProvider,
    bool DocumentRangeFormattingProvider,
    RenameOptions RenameProvider,
    bool FoldingRangeProvider,
    SemanticTokensOptions SemanticTokensProvider,
    DiagnosticOptions DiagnosticProvider);

internal sealed record ServerInfo(string Name, string Version);

internal sealed record InitializeResult(ServerCapabilities Capabilities, ServerInfo ServerInfo);

internal sealed record ResponseError(int Code, string Message);

/// <summary>LSP numeric enumerations used by the handlers.</summary>
internal static class LspKinds
{
    internal const int DiagnosticError = 1;
    internal const int DiagnosticWarning = 2;
    internal const int DiagnosticInformation = 3;
    internal const int DiagnosticHint = 4;
    internal const int TagUnnecessary = 1;
    internal const int TagDeprecated = 2;

    internal const int SymbolFile = 1;
    internal const int SymbolNamespace = 3;
    internal const int SymbolClass = 5;
    internal const int SymbolMethod = 6;
    internal const int SymbolProperty = 7;
    internal const int SymbolField = 8;
    internal const int SymbolConstructor = 9;
    internal const int SymbolEnum = 10;
    internal const int SymbolInterface = 11;
    internal const int SymbolFunction = 12;
    internal const int SymbolVariable = 13;
    internal const int SymbolConstant = 14;
    internal const int SymbolEnumMember = 22;
    internal const int SymbolStruct = 23;
    internal const int SymbolEvent = 24;
    internal const int SymbolOperator = 25;
    internal const int SymbolTypeParameter = 26;

    internal const int CompletionText = 1;
    internal const int CompletionMethod = 2;
    internal const int CompletionFunction = 3;
    internal const int CompletionConstructor = 4;
    internal const int CompletionField = 5;
    internal const int CompletionVariable = 6;
    internal const int CompletionClass = 7;
    internal const int CompletionInterface = 8;
    internal const int CompletionModule = 9;
    internal const int CompletionProperty = 10;
    internal const int CompletionEnum = 13;
    internal const int CompletionKeyword = 14;
    internal const int CompletionSnippet = 15;
    internal const int CompletionConstant = 21;
    internal const int CompletionStruct = 22;
    internal const int CompletionEvent = 23;
    internal const int CompletionOperator = 24;
    internal const int CompletionTypeParameter = 25;
    internal const int CompletionEnumMember = 20;

    internal const int HighlightText = 1;
    internal const int HighlightRead = 2;
    internal const int HighlightWrite = 3;
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(JsonElement))]
[JsonSerializable(typeof(DidOpenTextDocumentParams))]
[JsonSerializable(typeof(DidChangeTextDocumentParams))]
[JsonSerializable(typeof(DidCloseTextDocumentParams))]
[JsonSerializable(typeof(TextDocumentPositionParams))]
[JsonSerializable(typeof(ReferenceParams))]
[JsonSerializable(typeof(RenameParams))]
[JsonSerializable(typeof(DocumentParams))]
[JsonSerializable(typeof(DocumentFormattingParams))]
[JsonSerializable(typeof(CodeActionParams))]
[JsonSerializable(typeof(WorkspaceSymbolParams))]
[JsonSerializable(typeof(WorkspaceFilesParams))]
[JsonSerializable(typeof(MetadataSourceParams))]
[JsonSerializable(typeof(MetadataSource))]
[JsonSerializable(typeof(InitializeResult))]
[JsonSerializable(typeof(DocumentDiagnosticReport))]
[JsonSerializable(typeof(Hover))]
[JsonSerializable(typeof(CompletionList))]
[JsonSerializable(typeof(CompletionItem))]
[JsonSerializable(typeof(SignatureHelp))]
[JsonSerializable(typeof(List<Location>))]
[JsonSerializable(typeof(List<DocumentHighlight>))]
[JsonSerializable(typeof(PrepareRenameResult))]
[JsonSerializable(typeof(WorkspaceEdit))]
[JsonSerializable(typeof(List<TextEdit>))]
[JsonSerializable(typeof(SemanticTokens))]
[JsonSerializable(typeof(List<FoldingRange>))]
[JsonSerializable(typeof(List<DocumentSymbol>))]
[JsonSerializable(typeof(List<SymbolInformation>))]
[JsonSerializable(typeof(List<CodeAction>))]
[JsonSerializable(typeof(CodeAction))]
[JsonSerializable(typeof(ResponseError))]
internal sealed partial class LspJson : JsonSerializerContext;
