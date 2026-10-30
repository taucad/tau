using System.Text.Json;
using System.Text.Json.Nodes;

namespace Tau.CSharp.LanguageService.Tests;

public sealed class ProtocolTests
{
    [Fact]
    public async Task InitializeAdvertisesEveryLanguageFeature()
    {
        using var harness = new LanguageServerHarness();
        var result = await harness.RequestAsync("initialize", new JsonObject { ["capabilities"] = new JsonObject() });
        var capabilities = result.GetProperty("capabilities");
        Assert.Equal(2, capabilities.GetProperty("textDocumentSync").GetProperty("change").GetInt32());
        Assert.True(capabilities.GetProperty("completionProvider").GetProperty("resolveProvider").GetBoolean());
        foreach (var provider in (string[])[
            "hoverProvider", "definitionProvider", "typeDefinitionProvider", "implementationProvider", "referencesProvider",
            "documentHighlightProvider", "documentSymbolProvider", "workspaceSymbolProvider", "documentFormattingProvider",
            "documentRangeFormattingProvider", "foldingRangeProvider",
        ])
        {
            Assert.True(capabilities.GetProperty(provider).GetBoolean(), provider);
        }
        Assert.True(capabilities.GetProperty("renameProvider").GetProperty("prepareProvider").GetBoolean());
        Assert.True(capabilities.GetProperty("codeActionProvider").GetProperty("resolveProvider").GetBoolean());
        Assert.Contains("class", capabilities.GetProperty("semanticTokensProvider").GetProperty("legend").GetProperty("tokenTypes").EnumerateArray().Select(type => type.GetString()));
        Assert.True(capabilities.GetProperty("diagnosticProvider").GetProperty("interFileDependencies").GetBoolean());
        Assert.Equal("tau-csharp", result.GetProperty("serverInfo").GetProperty("name").GetString());
    }

    [Fact]
    public async Task RequestsBeforeInitializeAreRefused()
    {
        using var harness = new LanguageServerHarness();
        var error = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("textDocument/hover", LanguageServerHarness.DocumentPosition("main.cs", LanguageServerHarness.Position(0, 0))));
        Assert.Equal(-32002, error.Code);
    }

    [Fact]
    public async Task UnknownMethodsAndMalformedMessagesReturnErrors()
    {
        using var harness = await LanguageServerHarness.StartAsync();
        var missing = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("textDocument/unknown", new JsonObject()));
        Assert.Equal(-32601, missing.Code);
        var unknownDocument = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("textDocument/hover", LanguageServerHarness.DocumentPosition("absent.cs", LanguageServerHarness.Position(0, 0))));
        Assert.Equal(-32602, unknownDocument.Code);
        Assert.Null(await harness.SendRawAsync("""{"jsonrpc":"2.0","method":"$/progress","params":{}}"""));
        var invalid = await harness.SendRawAsync("""{"jsonrpc":"2.0","id":7,"method":"textDocument/hover","params":{"textDocument":42}}""");
        using var document = JsonDocument.Parse(invalid!);
        Assert.Equal(-32602, document.RootElement.GetProperty("error").GetProperty("code").GetInt32());
        Assert.Equal(7, document.RootElement.GetProperty("id").GetInt32());
    }

    [Fact]
    public async Task ShutdownRefusesFurtherRequests()
    {
        using var harness = await LanguageServerHarness.StartAsync();
        await harness.RequestAsync("shutdown", new JsonObject());
        var error = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("workspace/symbol", new JsonObject { ["query"] = "x" }));
        Assert.Equal(-32600, error.Code);
    }

    [Fact]
    public void ReferenceBundleRejectsCorruptInput()
    {
        Assert.Throws<InvalidDataException>(() => ReferenceSet.FromBundle("no header"u8.ToArray()));
        Assert.Throws<InvalidDataException>(() => ReferenceSet.FromBundle("a.dll\t10\t0\n\nshort"u8.ToArray()));
        Assert.Throws<InvalidDataException>(() => ReferenceSet.FromBundle("a.dll\tx\t0\n\n"u8.ToArray()));
        Assert.Throws<InvalidDataException>(() => ReferenceSet.FromBundle("a.dll\t1\t0\n\nab"u8.ToArray()));
    }
}
