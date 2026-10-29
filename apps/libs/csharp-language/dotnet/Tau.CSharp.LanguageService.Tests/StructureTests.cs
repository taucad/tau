using System.Text.Json;
using System.Text.Json.Nodes;
using static Tau.CSharp.LanguageService.Tests.LanguageServerHarness;

namespace Tau.CSharp.LanguageService.Tests;

public sealed class StructureTests
{
    private static readonly string[] Legend = [.. typeof(CSharpLanguageServer).Assembly.GetType("Tau.CSharp.LanguageService.SemanticTokenLegend")!
        .GetField("Types", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)!.GetValue(null) as string[] ?? []];

    private static List<(int Line, int Character, int Length, string Type, int Modifiers)> Decode(JsonElement data)
    {
        var values = data.EnumerateArray().Select(value => value.GetInt32()).ToArray();
        var tokens = new List<(int, int, int, string, int)>();
        var line = 0;
        var character = 0;
        for (var index = 0; index < values.Length; index += 5)
        {
            line += values[index];
            character = values[index] == 0 ? character + values[index + 1] : values[index + 1];
            tokens.Add((line, character, values[index + 2], Legend[values[index + 3]], values[index + 4]));
        }
        return tokens;
    }

    [Fact]
    public async Task SemanticTokensClassifySymbolsKeywordsAndLiterals()
    {
        const string text = "using PicoGK;\n/* multi\n line */\nvar shape = Voxels.voxSphere(System.Numerics.Vector3.Zero, 2f);\nconst string Name = \"ball\";\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var tokens = Decode((await harness.RequestAsync("textDocument/semanticTokens/full", Document("main.cs"))).GetProperty("data"));
        string TypeAt(int line, int character) => tokens.Single(token => token.Line == line && token.Character == character).Type;
        Assert.Equal("keyword", TypeAt(0, 0));
        Assert.Equal("namespace", TypeAt(0, 6));
        Assert.Equal("comment", TypeAt(1, 0));
        Assert.Equal("comment", TypeAt(2, 0));
        Assert.Equal("variable", TypeAt(3, 4));
        Assert.Equal("class", TypeAt(3, 12));
        var method = tokens.Single(token => token.Line == 3 && token.Character == 19);
        Assert.Equal("method", method.Type);
        Assert.Equal(1, method.Modifiers & 1);
        Assert.Equal("struct", TypeAt(3, 45));
        Assert.Equal("number", TypeAt(3, 59));
        Assert.Equal("string", TypeAt(4, 20));
        Assert.All(tokens, token => Assert.True(token.Length > 0));
    }

    [Fact]
    public async Task FoldingRangesCoverBlocksUsingsRegionsAndComments()
    {
        const string text = """
            using System;
            using System.Numerics;

            #region Shapes
            /// <summary>
            /// A ball.
            /// </summary>
            class Ball
            {
                void M()
                {
                    var x = 1;
                }
            }
            #endregion
            """;
        using var harness = await StartAsync();
        await harness.OpenAsync("ball.cs", text);
        var ranges = (await harness.RequestAsync("textDocument/foldingRange", Document("ball.cs"))).EnumerateArray()
            .Select(range => (range.GetProperty("startLine").GetInt32(), range.GetProperty("endLine").GetInt32(), range.TryGetProperty("kind", out var kind) ? kind.GetString() : null))
            .ToArray();
        Assert.Contains((0, 1, "imports"), ranges);
        Assert.Contains((3, 14, "region"), ranges);
        Assert.Contains((4, 6, "comment"), ranges);
        Assert.Contains((8, 12, (string?)null), ranges);
        Assert.Contains((10, 11, (string?)null), ranges);
    }

    [Fact]
    public async Task DocumentSymbolsFormAHierarchy()
    {
        const string text = """
            namespace Shapes
            {
                public enum Kind { Ball, Box }
                public class Ball
                {
                    public const int Sides = 0;
                    public float Radius { get; set; }
                    public Ball(float radius) { Radius = radius; }
                    public float Volume() { float Cube(float x) => x * x * x; return Cube(Radius); }
                    public event Action? Changed;
                }
            }
            """;
        using var harness = await StartAsync();
        await harness.OpenAsync("ball.cs", text);
        var root = Assert.Single((await harness.RequestAsync("textDocument/documentSymbol", Document("ball.cs"))).EnumerateArray());
        Assert.Equal(("Shapes", 3), (root.GetProperty("name").GetString(), root.GetProperty("kind").GetInt32()));
        var children = root.GetProperty("children").EnumerateArray().ToArray();
        Assert.Equal(["Kind", "Ball"], children.Select(child => child.GetProperty("name").GetString()));
        Assert.Equal(["Ball", "Box"], children[0].GetProperty("children").EnumerateArray().Select(child => child.GetProperty("name").GetString()));
        var members = children[1].GetProperty("children").EnumerateArray().ToDictionary(child => child.GetProperty("name").GetString()!, child => child);
        Assert.Equal(14, members["Sides"].GetProperty("kind").GetInt32());
        Assert.Equal(7, members["Radius"].GetProperty("kind").GetInt32());
        Assert.Equal(9, members["Ball"].GetProperty("kind").GetInt32());
        Assert.Equal(6, members["Volume"].GetProperty("kind").GetInt32());
        Assert.Equal(24, members["Changed"].GetProperty("kind").GetInt32());
        Assert.Equal("Cube", members["Volume"].GetProperty("children")[0].GetProperty("name").GetString());
        Assert.Equal(3, members["Radius"].GetProperty("selectionRange").GetProperty("start").GetProperty("character").GetInt32() - 18);
    }

    [Fact]
    public async Task WorkspaceSymbolsSearchEveryProjectFile()
    {
        using var harness = await StartAsync(new Dictionary<string, string>
        {
            ["main.cs"] = Sources.Main,
            ["ShapeFactory.cs"] = Sources.ShapeFactory,
        });
        var symbols = (await harness.RequestAsync("workspace/symbol", new JsonObject { ["query"] = "Create" })).EnumerateArray().ToArray();
        var create = Assert.Single(symbols);
        Assert.Equal(Uri("ShapeFactory.cs"), create.GetProperty("location").GetProperty("uri").GetString());
        Assert.Equal("ShapeFactory", create.GetProperty("containerName").GetString());
        Assert.Equal(6, create.GetProperty("kind").GetInt32());
        Assert.Contains((await harness.RequestAsync("workspace/symbol", new JsonObject { ["query"] = "Shape" })).EnumerateArray(), symbol => symbol.GetProperty("name").GetString() == "IShape");
        Assert.Empty((await harness.RequestAsync("workspace/symbol", new JsonObject { ["query"] = " " })).EnumerateArray());
    }
}
