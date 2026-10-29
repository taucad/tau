using System.Text.Json;
using System.Text.Json.Nodes;
using static Tau.CSharp.LanguageService.Tests.LanguageServerHarness;

namespace Tau.CSharp.LanguageService.Tests;

public sealed class EditingTests
{
    private static async Task<JsonElement[]> CompletionsAsync(LanguageServerHarness harness, string path, JsonObject position)
    {
        var list = await harness.RequestAsync("textDocument/completion", DocumentPosition(path, position));
        Assert.False(list.GetProperty("isIncomplete").GetBoolean());
        return [.. list.GetProperty("items").EnumerateArray()];
    }

    [Fact]
    public async Task CompletesPicoGkMembersWithKindsAndResolvesDocumentation()
    {
        const string text = "using PicoGK;\nvar v = Voxels.\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var items = await CompletionsAsync(harness, "main.cs", At(text, "Voxels.", 7));
        var sphere = Assert.Single(items, item => item.GetProperty("label").GetString() == "voxSphere");
        Assert.Equal(2, sphere.GetProperty("kind").GetInt32());
        Assert.Equal("voxSphere", sphere.GetProperty("textEdit").GetProperty("newText").GetString());
        var resolved = await harness.RequestAsync("completionItem/resolve", JsonNode.Parse(sphere.GetRawText())!);
        var documentation = resolved.GetProperty("documentation").GetProperty("value").GetString()!;
        Assert.Contains("voxSphere", documentation, StringComparison.Ordinal);
        Assert.Contains("Voxels", documentation, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CompletesBclMembersLocalsKeywordsAndUserTypes()
    {
        const string members = "var root = Math.\n";
        const string scope = "var radius = 2.0;\nvar next = ra\n";
        using var harness = await StartAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory });
        await harness.OpenAsync("members.cs", members);
        await harness.OpenAsync("scope.cs", scope);
        var math = await CompletionsAsync(harness, "members.cs", At(members, "Math.", 5));
        Assert.Contains(math, item => item.GetProperty("label").GetString() == "Sqrt" && item.GetProperty("kind").GetInt32() == 2);
        Assert.Contains(math, item => item.GetProperty("label").GetString() == "PI" && item.GetProperty("kind").GetInt32() == 21);
        var names = await CompletionsAsync(harness, "scope.cs", At(scope, "= ra", 4));
        Assert.Contains(names, item => item.GetProperty("label").GetString() == "radius" && item.GetProperty("kind").GetInt32() == 6);
        Assert.Contains(names, item => item.GetProperty("label").GetString() == "ShapeFactory" && item.GetProperty("kind").GetInt32() == 7);
        Assert.Contains(names, item => item.GetProperty("label").GetString() == "Vector3" && item.GetProperty("kind").GetInt32() == 22 ||
            item.GetProperty("label").GetString() == "Voxels" && item.GetProperty("kind").GetInt32() == 7);
        Assert.Contains(names, item => item.GetProperty("label").GetString() == "true" && item.GetProperty("kind").GetInt32() == 14);
        var range = names.First(item => item.GetProperty("label").GetString() == "radius").GetProperty("textEdit").GetProperty("range");
        Assert.Equal((1, 11), (range.GetProperty("start").GetProperty("line").GetInt32(), range.GetProperty("start").GetProperty("character").GetInt32()));
        Assert.Equal(13, range.GetProperty("end").GetProperty("character").GetInt32());
    }

    [Fact]
    public async Task StaleCompletionResolveReturnsTheItemUnchanged()
    {
        const string text = "var root = Math.\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var item = (await CompletionsAsync(harness, "main.cs", At(text, "Math.", 5)))[0];
        await harness.ChangeAsync("main.cs", (1, 0), (1, 0), "// edit\n");
        var resolved = await harness.RequestAsync("completionItem/resolve", JsonNode.Parse(item.GetRawText())!);
        Assert.False(resolved.TryGetProperty("documentation", out _));
    }

    [Fact]
    public async Task HoverShowsSignaturesAndXmlDocumentation()
    {
        using var harness = await StartAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory });
        await harness.OpenAsync("main.cs", Sources.Main);
        var picoGk = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(Sources.Main, "oViewer", 2)));
        var markdown = picoGk.GetProperty("contents").GetProperty("value").GetString()!;
        Assert.Equal("markdown", picoGk.GetProperty("contents").GetProperty("kind").GetString());
        Assert.StartsWith("```csharp\n", markdown, StringComparison.Ordinal);
        Assert.Contains("Library.oViewer()", markdown, StringComparison.Ordinal);
        var user = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(Sources.Main, "Create", 2)));
        Assert.Contains("Create a sphere at the origin.", user.GetProperty("contents").GetProperty("value").GetString(), StringComparison.Ordinal);
        var bcl = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(Sources.Main, "Sqrt", 1)));
        var bclText = bcl.GetProperty("contents").GetProperty("value").GetString()!;
        Assert.Contains("double Math.Sqrt(double d)", bclText, StringComparison.Ordinal);
        Assert.Contains("square root", bclText, StringComparison.Ordinal);
        var local = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(Sources.Main, "radius", 1)));
        Assert.Contains("(local variable) double radius", local.GetProperty("contents").GetProperty("value").GetString(), StringComparison.Ordinal);
        Assert.Equal(JsonValueKind.Null, (await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", Position(2, 0)))).ValueKind);
    }

    [Fact]
    public async Task HoverLinksDocumentationReferencesToTheirDefinitions()
    {
        const string wrapper = """
            using System.Collections.Generic;
            using PicoGK;

            /// <summary>
            /// Wraps <see cref="ShapeFactory.Create(float)"/> into a <see cref="Voxels"/> list
            /// (<see cref="List{T}"/>); <see cref="ShapeFactory.Create(float)"/> again, <see cref="Missing"/> and <see langword="null"/>.
            /// </summary>
            public static class Wrapper
            {
                public static List<Voxels> Make() => [ShapeFactory.Create(1f)];
            }
            """;
        const string main = "var shapes = Wrapper.Make();\n";
        using var harness = await StartAsync(new Dictionary<string, string>
        {
            ["ShapeFactory.cs"] = Sources.ShapeFactory,
            ["Wrapper.cs"] = wrapper,
        });
        await harness.OpenAsync("main.cs", main);
        var hover = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(main, "Wrapper", 2)));
        var markdown = hover.GetProperty("contents").GetProperty("value").GetString()!;
        Assert.Contains(
            "Wraps [`ShapeFactory.Create`](#tau-definition-0) into a [`Voxels`](#tau-definition-1) list ([`List`](#tau-definition-2)); [`ShapeFactory.Create`](#tau-definition-0) again, `Missing` and `null`.",
            markdown,
            StringComparison.Ordinal);
        var targets = hover.GetProperty("definitionTargets").EnumerateArray()
            .Select(target => (target.GetProperty("uri").GetString(), target.GetProperty("range").GetProperty("start").GetProperty("line").GetInt32()))
            .ToArray();
        Assert.Equal(3, targets.Length);
        Assert.Equal((Uri("ShapeFactory.cs"), 8), targets[0]);
        Assert.Equal("file:///__csharp_metadata__/PicoGK/PicoGK.Voxels.cs", targets[1].Item1);
        Assert.Equal("file:///__csharp_metadata__/System.Collections/System.Collections.Generic.List%601.cs", targets[2].Item1);
        // Symbols whose documentation references nothing keep a plain hover.
        var plain = await harness.RequestAsync("textDocument/hover", DocumentPosition("main.cs", At(main, "Make", 1)));
        Assert.False(plain.TryGetProperty("definitionTargets", out _));
    }

    [Fact]
    public async Task SignatureHelpTracksTheActiveParameterAndOverloads()
    {
        const string text = "using System.Numerics;\nusing PicoGK;\nvar a = Voxels.voxSphere(Vector3.Zero, 2f);\nvar b = Math.Max(1, 2);\nvar c = new Vector3(1, 2, 3);\nvar d = ShapeFactory.Create(1f);\n";
        using var harness = await StartAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory });
        await harness.OpenAsync("main.cs", text);
        var first = await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", At(text, "voxSphere(", 10)));
        var signature = first.GetProperty("signatures")[first.GetProperty("activeSignature").GetInt32()];
        Assert.Contains("voxSphere(", signature.GetProperty("label").GetString(), StringComparison.Ordinal);
        Assert.Equal(0, first.GetProperty("activeParameter").GetInt32());
        var second = await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", At(text, ", 2f", 2)));
        Assert.Equal(1, second.GetProperty("activeParameter").GetInt32());
        var label = signature.GetProperty("label").GetString()!;
        var span = signature.GetProperty("parameters")[1].GetProperty("label");
        Assert.Contains("fRadius", label[span[0].GetInt32()..span[1].GetInt32()], StringComparison.Ordinal);
        var max = await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", At(text, "Max(", 4)));
        Assert.True(max.GetProperty("signatures").GetArrayLength() > 5);
        Assert.Contains("int", max.GetProperty("signatures")[max.GetProperty("activeSignature").GetInt32()].GetProperty("label").GetString(), StringComparison.Ordinal);
        var constructor = await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", At(text, "Vector3(1", 8)));
        Assert.Contains(constructor.GetProperty("signatures").EnumerateArray(), item => item.GetProperty("label").GetString()!.StartsWith("Vector3(float x, float y, float z)", StringComparison.Ordinal));
        var user = await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", At(text, "Create(", 7)));
        var userSignature = user.GetProperty("signatures")[0];
        Assert.Equal("Create a sphere at the origin.", userSignature.GetProperty("documentation").GetProperty("value").GetString());
        Assert.Equal("Sphere radius in millimetres.", userSignature.GetProperty("parameters")[0].GetProperty("documentation").GetProperty("value").GetString());
        Assert.Equal(JsonValueKind.Null, (await harness.RequestAsync("textDocument/signatureHelp", DocumentPosition("main.cs", Position(0, 3)))).ValueKind);
    }

    [Fact]
    public async Task FormattingNormalizesWhitespaceAndHonorsTabs()
    {
        const string text = "class   Box{\npublic int  Width{get;set;}\n  void M( ){var x=1;}\n}\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("box.cs", text);
        var edits = await harness.RequestAsync("textDocument/formatting", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("box.cs") },
            ["options"] = new JsonObject { ["tabSize"] = 4, ["insertSpaces"] = true },
        });
        var formatted = ApplyEdits(text, edits);
        Assert.Contains("class Box\n{", formatted, StringComparison.Ordinal);
        Assert.Contains("    public int Width { get; set; }", formatted, StringComparison.Ordinal);
        Assert.Contains("var x = 1;", formatted, StringComparison.Ordinal);
        var tabs = await harness.RequestAsync("textDocument/formatting", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("box.cs") },
            ["options"] = new JsonObject { ["tabSize"] = 4, ["insertSpaces"] = false },
        });
        Assert.Contains("\tpublic int Width", ApplyEdits(text, tabs), StringComparison.Ordinal);
        var ranged = await harness.RequestAsync("textDocument/rangeFormatting", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("box.cs") },
            ["options"] = new JsonObject { ["tabSize"] = 4, ["insertSpaces"] = true },
            ["range"] = Range((2, 0), (2, 22)),
        });
        var partial = ApplyEdits(text, ranged);
        Assert.Contains("class   Box{", partial, StringComparison.Ordinal);
        Assert.Contains("var x = 1;", partial, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CodeActionsAddMissingUsingsAndResolveToWorkspaceEdits()
    {
        const string text = "var origin = Vector3.Zero;\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var diagnostics = await harness.DiagnosticsAsync("main.cs");
        Assert.Contains(diagnostics, diagnostic => diagnostic.GetProperty("code").GetString() == "CS0103");
        var actions = await harness.RequestAsync("textDocument/codeAction", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("main.cs") },
            ["range"] = Range((0, 15), (0, 15)),
            ["context"] = new JsonObject { ["diagnostics"] = new JsonArray() },
        });
        var addUsing = Assert.Single(actions.EnumerateArray(), action => action.GetProperty("title").GetString() == "using System.Numerics;");
        Assert.Equal("quickfix", addUsing.GetProperty("kind").GetString());
        Assert.Equal("CS0103", addUsing.GetProperty("diagnostics")[0].GetProperty("code").GetString());
        var resolved = await harness.RequestAsync("codeAction/resolve", JsonNode.Parse(addUsing.GetRawText())!);
        var change = Assert.Single(resolved.GetProperty("edit").GetProperty("documentChanges").EnumerateArray());
        Assert.Equal(Uri("main.cs"), change.GetProperty("textDocument").GetProperty("uri").GetString());
        Assert.Equal(1, change.GetProperty("textDocument").GetProperty("version").GetInt32());
        Assert.StartsWith("using System.Numerics;", ApplyEdits(text, change.GetProperty("edits")), StringComparison.Ordinal);
    }

    [Fact]
    public async Task RefactoringsAreOfferedForASelection()
    {
        const string text = "var total = 1 + 2;\nConsole.WriteLine(total);\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var actions = await harness.RequestAsync("textDocument/codeAction", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("main.cs") },
            ["range"] = Range((0, 12), (0, 17)),
        });
        Assert.Contains(actions.EnumerateArray(), action => action.GetProperty("kind").GetString() == "refactor");
    }

    [Fact]
    public async Task StaleCodeActionsAreRefused()
    {
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", "var x = 1;\n");
        var error = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("codeAction/resolve", new JsonObject
        {
            ["title"] = "x",
            ["kind"] = "quickfix",
            ["data"] = new JsonObject { ["resultId"] = 99, ["index"] = 0 },
        }));
        Assert.Equal(-32803, error.Code);
    }
}
