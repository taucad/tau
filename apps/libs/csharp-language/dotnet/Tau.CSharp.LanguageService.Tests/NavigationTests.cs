using System.Text.Json;
using System.Text.Json.Nodes;
using static Tau.CSharp.LanguageService.Tests.LanguageServerHarness;

namespace Tau.CSharp.LanguageService.Tests;

public sealed class NavigationTests
{
    private static readonly Dictionary<string, string> Programs = new()
    {
        ["main.cs"] = Sources.Main,
        ["second.cs"] = Sources.Second,
        ["ShapeFactory.cs"] = Sources.ShapeFactory,
    };

    private static (string Uri, int Line, int Character) Single(JsonElement locations)
    {
        var location = Assert.Single(locations.EnumerateArray());
        var start = location.GetProperty("range").GetProperty("start");
        return (location.GetProperty("uri").GetString()!, start.GetProperty("line").GetInt32(), start.GetProperty("character").GetInt32());
    }

    [Fact]
    public async Task DefinitionNavigatesAcrossProjectFiles()
    {
        using var harness = await StartAsync(Programs);
        await harness.OpenAsync("main.cs", Sources.Main);
        var target = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "Create", 2))));
        Assert.Equal((Uri("ShapeFactory.cs"), 8, 25), target);
        var type = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "ShapeFactory", 3))));
        Assert.Equal((Uri("ShapeFactory.cs"), 4, 20), type);
        // The caret just after an identifier still names it.
        var end = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "ShapeFactory.", 12))));
        Assert.Equal(type, end);
    }

    [Fact]
    public async Task DefinitionOfALocalStaysInTheDocument()
    {
        using var harness = await StartAsync(Programs);
        var target = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "sphere);", 1))));
        Assert.Equal((Uri("main.cs"), 5, 8), target);
    }

    [Fact]
    public async Task LibraryDefinitionsOpenGeneratedDeclarationsWithDocumentation()
    {
        using var harness = await StartAsync(Programs);
        var location = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "oViewer", 1))));
        Assert.Equal("file:///__csharp_metadata__/PicoGK/PicoGK.Library.cs", location.Uri);
        var source = await harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = location.Uri });
        var lines = source.GetProperty("text").GetString()!.Split('\n');
        Assert.StartsWith("// PicoGK, Version=", lines[0], StringComparison.Ordinal);
        Assert.Contains(lines, line => line.Trim() == "namespace PicoGK");
        Assert.StartsWith("oViewer()", lines[location.Line][location.Character..], StringComparison.Ordinal);
        Assert.Contains("public static", lines[location.Line], StringComparison.Ordinal);
        Assert.DoesNotContain(lines, line => line.Contains("private ", StringComparison.Ordinal));

        var voxels = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("ShapeFactory.cs", At(Sources.ShapeFactory, "voxSphere", 1))));
        var voxelSource = (await harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = voxels.Uri })).GetProperty("text").GetString()!.Split('\n');
        Assert.StartsWith("voxSphere(", voxelSource[voxels.Line][voxels.Character..], StringComparison.Ordinal);
        Assert.StartsWith("///", voxelSource[voxels.Line - 1].Trim(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task BclDefinitionsOpenFrameworkDeclarations()
    {
        using var harness = await StartAsync(Programs);
        var sqrt = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", At(Sources.Main, "Sqrt", 1))));
        Assert.Equal("file:///__csharp_metadata__/System.Runtime/System.Math.cs", sqrt.Uri);
        var text = (await harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = sqrt.Uri })).GetProperty("text").GetString()!;
        var lines = text.Split('\n');
        Assert.Contains("public static double Sqrt(double d);", lines[sqrt.Line], StringComparison.Ordinal);
        Assert.Contains("public const double PI = 3.141592653589793;", text, StringComparison.Ordinal);
        Assert.Contains("/// <summary>Returns the square root of a specified number.</summary>", text, StringComparison.Ordinal);
        var vector = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("ShapeFactory.cs", At(Sources.ShapeFactory, "Vector3.Zero", 1))));
        Assert.Equal("file:///__csharp_metadata__/System.Numerics.Vectors/System.Numerics.Vector3.cs", vector.Uri);
        var vectorLines = (await harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = vector.Uri })).GetProperty("text").GetString()!.Split('\n');
        Assert.StartsWith("public struct Vector3 : ", vectorLines[vector.Line].Trim(), StringComparison.Ordinal);
        var zero = Single(await harness.RequestAsync("textDocument/definition", DocumentPosition("ShapeFactory.cs", At(Sources.ShapeFactory, "Zero", 1))));
        Assert.Contains("Vector3 Zero { get; }", vectorLines[zero.Line], StringComparison.Ordinal);
        Assert.Empty((await harness.RequestAsync("textDocument/definition", DocumentPosition("main.cs", Position(2, 0)))).EnumerateArray());
    }

    [Fact]
    public async Task MetadataSourceRegeneratesUncachedDeclarations()
    {
        using var harness = await StartAsync(Programs);
        var text = (await harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = "file:///__csharp_metadata__/System.Collections/System.Collections.Generic.List%601.cs" })).GetProperty("text").GetString()!;
        Assert.Contains("public class List<T>", text, StringComparison.Ordinal);
        Assert.Contains("public void Add(T item);", text, StringComparison.Ordinal);
        var missing = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = "file:///__csharp_metadata__/PicoGK/PicoGK.Missing.cs" }));
        Assert.Equal(-32803, missing.Code);
        await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("tau/metadataSource", new JsonObject { ["uri"] = "file:///main.cs" }));
    }

    [Fact]
    public async Task TypeDefinitionAndImplementationResolveUserTypes()
    {
        const string text = "IShape shape = new Ball();\nvar built = shape.Build();\n";
        using var harness = await StartAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory });
        await harness.OpenAsync("main.cs", text);
        var type = Single(await harness.RequestAsync("textDocument/typeDefinition", DocumentPosition("main.cs", At(text, "shape =", 1))));
        Assert.Equal((Uri("ShapeFactory.cs"), 14, 17), type);
        var implementation = Single(await harness.RequestAsync("textDocument/implementation", DocumentPosition("main.cs", At(text, "Build", 1))));
        Assert.Equal((Uri("ShapeFactory.cs"), 21, 18), implementation);
        var classes = Single(await harness.RequestAsync("textDocument/implementation", DocumentPosition("main.cs", At(text, "IShape", 1))));
        Assert.Equal((Uri("ShapeFactory.cs"), 19, 20), classes);
        var library = Single(await harness.RequestAsync("textDocument/typeDefinition", DocumentPosition("main.cs", At(text, "built", 1))));
        Assert.Equal("file:///__csharp_metadata__/PicoGK/PicoGK.Voxels.cs", library.Uri);
    }

    [Fact]
    public async Task ReferencesSpanEveryProgramThatUsesAHelper()
    {
        using var harness = await StartAsync(Programs);
        var references = await harness.RequestAsync("textDocument/references", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("ShapeFactory.cs") },
            ["position"] = At(Sources.ShapeFactory, "Create(", 1),
            ["context"] = new JsonObject { ["includeDeclaration"] = true },
        });
        var uris = references.EnumerateArray().Select(location => location.GetProperty("uri").GetString()).ToArray();
        Assert.Equal(4, uris.Length);
        Assert.Contains(Uri("main.cs"), uris);
        Assert.Contains(Uri("second.cs"), uris);
        Assert.Equal(2, uris.Count(uri => uri == Uri("ShapeFactory.cs")));
        var withoutDeclaration = await harness.RequestAsync("textDocument/references", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("ShapeFactory.cs") },
            ["position"] = At(Sources.ShapeFactory, "Create(", 1),
            ["context"] = new JsonObject { ["includeDeclaration"] = false },
        });
        Assert.Equal(3, withoutDeclaration.GetArrayLength());
    }

    [Fact]
    public async Task DocumentHighlightsMarkDefinitionsAndReads()
    {
        const string text = "var count = 1;\ncount++;\nConsole.WriteLine(count);\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var highlights = (await harness.RequestAsync("textDocument/documentHighlight", DocumentPosition("main.cs", At(text, "count", 1)))).EnumerateArray().ToArray();
        Assert.Equal(3, highlights.Length);
        Assert.Equal(3, highlights[0].GetProperty("kind").GetInt32());
        Assert.All(highlights.Skip(1), highlight => Assert.Equal(2, highlight.GetProperty("kind").GetInt32()));
    }

    [Fact]
    public async Task RenameEditsEveryFileAndProgramWithVersions()
    {
        using var harness = await StartAsync(Programs);
        await harness.OpenAsync("main.cs", Sources.Main);
        var prepared = await harness.RequestAsync("textDocument/prepareRename", DocumentPosition("main.cs", At(Sources.Main, "Create", 1)));
        Assert.Equal("Create", prepared.GetProperty("placeholder").GetString());
        var edit = await harness.RequestAsync("textDocument/rename", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("main.cs") },
            ["position"] = At(Sources.Main, "Create", 1),
            ["newName"] = "MakeSphere",
        });
        var changes = edit.GetProperty("documentChanges").EnumerateArray().ToDictionary(change => change.GetProperty("textDocument").GetProperty("uri").GetString()!);
        Assert.Equal(3, changes.Count);
        Assert.Equal(1, changes[Uri("main.cs")].GetProperty("textDocument").GetProperty("version").GetInt32());
        Assert.Equal(JsonValueKind.Null, changes[Uri("second.cs")].GetProperty("textDocument").GetProperty("version").ValueKind);
        Assert.Contains("ShapeFactory.MakeSphere(16.0f)", ApplyEdits(Sources.Main, changes[Uri("main.cs")].GetProperty("edits")), StringComparison.Ordinal);
        Assert.Contains("ShapeFactory.MakeSphere(8.0f)", ApplyEdits(Sources.Second, changes[Uri("second.cs")].GetProperty("edits")), StringComparison.Ordinal);
        var factory = ApplyEdits(Sources.ShapeFactory, changes[Uri("ShapeFactory.cs")].GetProperty("edits"));
        Assert.Contains("public static Voxels MakeSphere(float radius)", factory, StringComparison.Ordinal);
        Assert.Contains("ShapeFactory.MakeSphere(2.0f)", factory, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RenameRefusesLibrarySymbolsAndInvalidNames()
    {
        using var harness = await StartAsync(Programs);
        Assert.Equal(JsonValueKind.Null, (await harness.RequestAsync("textDocument/prepareRename", DocumentPosition("main.cs", At(Sources.Main, "oViewer", 1)))).ValueKind);
        var library = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("textDocument/rename", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("main.cs") },
            ["position"] = At(Sources.Main, "oViewer", 1),
            ["newName"] = "Viewer",
        }));
        Assert.Equal(-32803, library.Code);
        var invalid = await Assert.ThrowsAsync<LanguageServerError>(() => harness.RequestAsync("textDocument/rename", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri("main.cs") },
            ["position"] = At(Sources.Main, "Create", 1),
            ["newName"] = "not valid",
        }));
        Assert.Equal(-32602, invalid.Code);
    }
}
