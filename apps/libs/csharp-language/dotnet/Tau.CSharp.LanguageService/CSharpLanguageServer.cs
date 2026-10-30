using System.Text.Json;
using System.Text.Json.Serialization.Metadata;

namespace Tau.CSharp.LanguageService;

/// <summary>
/// A transport-neutral C# language server. Each call handles one JSON-RPC message and returns the response JSON,
/// or <c>null</c> for a notification. Diagnostics use the LSP pull model, so the server never sends unsolicited
/// messages and a single-threaded host can serialize every request.
/// </summary>
public sealed partial class CSharpLanguageServer : IDisposable
{
    internal const string Version = "1.0.0";

    private readonly ProjectWorkspace workspace;
    private readonly Dictionary<string, DeclarationSource> declarations = new(StringComparer.Ordinal);
    private bool initialized;
    private bool shutdown;

    public CSharpLanguageServer(ReferenceSet references)
    {
        workspace = new ProjectWorkspace(references);
    }

    public void Dispose() => workspace.Dispose();

    /// <summary>Handle one JSON-RPC request or notification.</summary>
    public async Task<string?> HandleAsync(string message, CancellationToken cancellationToken = default)
    {
        JsonElement id = default;
        var hasId = false;
        string? method = null;
        try
        {
            using var document = JsonDocument.Parse(message);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("method", out var methodElement) ||
                methodElement.ValueKind != JsonValueKind.String)
            {
                throw new LspException(-32600, "Invalid JSON-RPC request.");
            }
            method = methodElement.GetString()!;
            hasId = root.TryGetProperty("id", out id) && id.ValueKind is JsonValueKind.Number or JsonValueKind.String;
            if (hasId)
            {
                id = id.Clone();
            }
            var parameters = root.TryGetProperty("params", out var p) ? p.Clone() : default;
            var result = await DispatchAsync(method, parameters, cancellationToken).ConfigureAwait(false);
            return hasId ? Response(id, result ?? "null") : null;
        }
        catch (LspException error)
        {
            return hasId ? Error(id, error.Code, error.Message) : null;
        }
        catch (OperationCanceledException)
        {
            return hasId ? Error(id, -32800, "Request cancelled.") : null;
        }
        catch (JsonException error)
        {
            return hasId ? Error(id, LspException.InvalidParams, $"Invalid {method} parameters: {error.Message}") : null;
        }
        catch (Exception error) when (hasId)
        {
            return Error(id, LspException.InternalError, $"{method} failed: {error.GetType().Name}: {error.Message}");
        }
    }

    private async Task<string?> DispatchAsync(string method, JsonElement parameters, CancellationToken cancellationToken)
    {
        if (method == "initialize")
        {
            initialized = true;
            return Serialize(Capabilities(), LspJson.Default.InitializeResult);
        }
        if (method is "initialized" or "$/cancelRequest" or "$/setTrace" or "workspace/didChangeConfiguration")
        {
            return null;
        }
        if (method == "shutdown")
        {
            shutdown = true;
            return null;
        }
        if (method == "exit")
        {
            return null;
        }
        if (!initialized)
        {
            throw new LspException(LspException.ServerNotInitialized, "The C# language server is not initialized.");
        }
        if (shutdown)
        {
            throw new LspException(-32600, "The C# language server is shutting down.");
        }
        switch (method)
        {
            case "textDocument/didOpen":
            {
                var open = Parse(parameters, LspJson.Default.DidOpenTextDocumentParams);
                workspace.Open(open.TextDocument.Uri, open.TextDocument.Version, open.TextDocument.Text);
                return null;
            }
            case "textDocument/didChange":
            {
                var change = Parse(parameters, LspJson.Default.DidChangeTextDocumentParams);
                workspace.Change(change.TextDocument.Uri, change.TextDocument.Version, change.ContentChanges);
                return null;
            }
            case "textDocument/didClose":
                workspace.Close(Parse(parameters, LspJson.Default.DidCloseTextDocumentParams).TextDocument.Uri);
                return null;
            case "tau/workspaceFiles":
            {
                var files = Parse(parameters, LspJson.Default.WorkspaceFilesParams);
                workspace.SetWorkspaceFiles(files.Files, files.Replace);
                return null;
            }
            case "tau/metadataSource":
                return Serialize(await MetadataSourceForAsync(Parse(parameters, LspJson.Default.MetadataSourceParams).Uri, cancellationToken).ConfigureAwait(false), LspJson.Default.MetadataSource);
            case "textDocument/diagnostic":
                return Serialize(await DiagnosticsAsync(Parse(parameters, LspJson.Default.DocumentParams), cancellationToken).ConfigureAwait(false), LspJson.Default.DocumentDiagnosticReport);
            case "textDocument/completion":
                return Serialize(await CompletionAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.CompletionList);
            case "completionItem/resolve":
                return Serialize(await ResolveCompletionAsync(Parse(parameters, LspJson.Default.CompletionItem), cancellationToken).ConfigureAwait(false), LspJson.Default.CompletionItem);
            case "textDocument/hover":
                return SerializeNullable(await HoverAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.Hover);
            case "textDocument/signatureHelp":
                return SerializeNullable(await SignatureHelpAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.SignatureHelp);
            case "textDocument/definition":
                return Serialize(await DefinitionAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListLocation);
            case "textDocument/typeDefinition":
                return Serialize(await TypeDefinitionAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListLocation);
            case "textDocument/implementation":
                return Serialize(await ImplementationAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListLocation);
            case "textDocument/references":
                return Serialize(await ReferencesAsync(Parse(parameters, LspJson.Default.ReferenceParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListLocation);
            case "textDocument/documentHighlight":
                return Serialize(await DocumentHighlightAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListDocumentHighlight);
            case "textDocument/prepareRename":
                return SerializeNullable(await PrepareRenameAsync(Parse(parameters, LspJson.Default.TextDocumentPositionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.PrepareRenameResult);
            case "textDocument/rename":
                return Serialize(await RenameAsync(Parse(parameters, LspJson.Default.RenameParams), cancellationToken).ConfigureAwait(false), LspJson.Default.WorkspaceEdit);
            case "textDocument/formatting":
            case "textDocument/rangeFormatting":
                return Serialize(await FormatAsync(Parse(parameters, LspJson.Default.DocumentFormattingParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListTextEdit);
            case "textDocument/semanticTokens/full":
                return Serialize(await SemanticTokensAsync(Parse(parameters, LspJson.Default.DocumentParams), cancellationToken).ConfigureAwait(false), LspJson.Default.SemanticTokens);
            case "textDocument/foldingRange":
                return Serialize(await FoldingRangesAsync(Parse(parameters, LspJson.Default.DocumentParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListFoldingRange);
            case "textDocument/documentSymbol":
                return Serialize(await DocumentSymbolsAsync(Parse(parameters, LspJson.Default.DocumentParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListDocumentSymbol);
            case "workspace/symbol":
                return Serialize(await WorkspaceSymbolsAsync(Parse(parameters, LspJson.Default.WorkspaceSymbolParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListSymbolInformation);
            case "textDocument/codeAction":
                return Serialize(await CodeActionsAsync(Parse(parameters, LspJson.Default.CodeActionParams), cancellationToken).ConfigureAwait(false), LspJson.Default.ListCodeAction);
            case "codeAction/resolve":
                return Serialize(await ResolveCodeActionAsync(Parse(parameters, LspJson.Default.CodeAction), cancellationToken).ConfigureAwait(false), LspJson.Default.CodeAction);
            default:
                if (method.StartsWith("$/", StringComparison.Ordinal))
                {
                    return null;
                }
                throw new LspException(LspException.MethodNotFound, $"Unsupported method: {method}");
        }
    }

    private static InitializeResult Capabilities() => new(
        new ServerCapabilities(
            new TextDocumentSyncOptions(OpenClose: true, Change: 2),
            new CompletionOptions([".", " ", "(", "<", "[", "\"", "#", "@"], ResolveProvider: true),
            HoverProvider: true,
            new SignatureHelpOptions(["(", ","], [")"]),
            DefinitionProvider: true,
            TypeDefinitionProvider: true,
            ImplementationProvider: true,
            ReferencesProvider: true,
            DocumentHighlightProvider: true,
            DocumentSymbolProvider: true,
            WorkspaceSymbolProvider: true,
            new CodeActionOptions(["quickfix", "refactor"], ResolveProvider: true),
            DocumentFormattingProvider: true,
            DocumentRangeFormattingProvider: true,
            new RenameOptions(PrepareProvider: true),
            FoldingRangeProvider: true,
            new SemanticTokensOptions(new SemanticTokensLegend(SemanticTokenLegend.Types, SemanticTokenLegend.Modifiers), Full: true),
            new DiagnosticOptions(InterFileDependencies: true, WorkspaceDiagnostics: false)),
        new ServerInfo("tau-csharp", Version));

    private static T Parse<T>(JsonElement parameters, JsonTypeInfo<T> type) =>
        parameters.ValueKind == JsonValueKind.Undefined
            ? throw new LspException(LspException.InvalidParams, "Missing parameters.")
            : parameters.Deserialize(type) ?? throw new LspException(LspException.InvalidParams, "Null parameters.");

    private static string Serialize<T>(T value, JsonTypeInfo<T> type) => JsonSerializer.Serialize(value, type);

    private static string SerializeNullable<T>(T? value, JsonTypeInfo<T> type)
        where T : class => value is null ? "null" : JsonSerializer.Serialize(value, type);

    private static string Response(JsonElement id, string result) =>
        $$"""{"jsonrpc":"2.0","id":{{id.GetRawText()}},"result":{{result}}}""";

    private static string Error(JsonElement id, int code, string message) =>
        $$"""{"jsonrpc":"2.0","id":{{id.GetRawText()}},"error":{{JsonSerializer.Serialize(new ResponseError(code, message), LspJson.Default.ResponseError)}}}""";

    /// <summary>Warm the interpreter: bind the first program and request completion once.</summary>
    public async Task WarmUpAsync(CancellationToken cancellationToken = default)
    {
        var uri = workspace.Uris.Order(StringComparer.Ordinal).FirstOrDefault();
        if (uri is null)
        {
            return;
        }
        var document = workspace.GetDocument(uri);
        var model = await document.GetSemanticModelAsync(cancellationToken).ConfigureAwait(false);
        model?.GetDiagnostics(cancellationToken: cancellationToken);
        var service = Microsoft.CodeAnalysis.Completion.CompletionService.GetService(document);
        if (service is not null)
        {
            await service.GetCompletionsAsync(document, 0, cancellationToken: cancellationToken).ConfigureAwait(false);
        }
    }
}
