using System.Text.Json;
using System.Text.Json.Nodes;

namespace Tau.CSharp.LanguageService.Tests;

/// <summary>
/// Drives the server through its JSON-RPC surface with the prepared reference bundle, exactly as the browser worker
/// does. The bundle comes from <c>prepare-csharp-language-server.mts</c>; TAU_CSHARP_REFERENCE_BUNDLE overrides it.
/// </summary>
internal sealed class LanguageServerHarness : IDisposable
{
    private static readonly Lazy<ReferenceSet> References = new(() =>
    {
        var path = Environment.GetEnvironmentVariable("TAU_CSHARP_REFERENCE_BUNDLE") ?? Path.Combine(RepositoryRoot(), "out/csharp-language/references.bin");
        if (!File.Exists(path))
        {
            throw new InvalidOperationException(
                $"Missing C# reference bundle {path}. Run `pnpm nx run csharp-language:prepare-references` first.");
        }
        return ReferenceSet.FromBundle(File.ReadAllBytes(path));
    });

    private readonly CSharpLanguageServer server = new(References.Value);
    private readonly Dictionary<string, int> versions = new(StringComparer.Ordinal);
    private int nextId;

    public void Dispose() => server.Dispose();

    internal static string Uri(string path) => $"file:///{path}";

    internal static async Task<LanguageServerHarness> StartAsync(IReadOnlyDictionary<string, string>? closedFiles = null)
    {
        var harness = new LanguageServerHarness();
        await harness.RequestAsync("initialize", new JsonObject { ["capabilities"] = new JsonObject() });
        await harness.NotifyAsync("initialized", new JsonObject());
        if (closedFiles is not null)
        {
            await harness.SetFilesAsync(closedFiles, replace: true);
        }
        return harness;
    }

    internal Task SetFilesAsync(IReadOnlyDictionary<string, string> files, bool replace) =>
        NotifyAsync("tau/workspaceFiles", new JsonObject
        {
            ["replace"] = replace,
            ["files"] = new JsonArray([.. files.Select(file => (JsonNode)new JsonObject { ["uri"] = Uri(file.Key), ["text"] = file.Value })]),
        });

    /// <summary>Report closed files as deleted, as the worker does after a tree change.</summary>
    internal Task DeleteFilesAsync(params string[] paths) =>
        NotifyAsync("tau/workspaceFiles", new JsonObject
        {
            ["replace"] = false,
            ["files"] = new JsonArray([.. paths.Select(path => (JsonNode)new JsonObject { ["uri"] = Uri(path), ["text"] = null })]),
        });

    internal Task OpenAsync(string path, string text)
    {
        versions[path] = 1;
        return NotifyAsync("textDocument/didOpen", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri(path), ["languageId"] = "csharp", ["version"] = 1, ["text"] = text },
        });
    }

    internal Task ChangeAsync(string path, (int Line, int Character) start, (int Line, int Character) end, string text)
    {
        versions[path]++;
        return NotifyAsync("textDocument/didChange", new JsonObject
        {
            ["textDocument"] = new JsonObject { ["uri"] = Uri(path), ["version"] = versions[path] },
            ["contentChanges"] = new JsonArray(new JsonObject
            {
                ["range"] = Range(start, end),
                ["text"] = text,
            }),
        });
    }

    internal Task CloseAsync(string path) =>
        NotifyAsync("textDocument/didClose", new JsonObject { ["textDocument"] = new JsonObject { ["uri"] = Uri(path) } });

    internal static JsonObject Position(int line, int character) => new() { ["line"] = line, ["character"] = character };

    internal static JsonObject Range((int Line, int Character) start, (int Line, int Character) end) => new()
    {
        ["start"] = Position(start.Line, start.Character),
        ["end"] = Position(end.Line, end.Character),
    };

    /// <summary>Position of the <paramref name="occurrence"/>th match of <paramref name="marker"/>, plus an offset.</summary>
    internal static JsonObject At(string text, string marker, int offset = 0, int occurrence = 1)
    {
        var index = -1;
        for (var found = 0; found < occurrence; found++)
        {
            index = text.IndexOf(marker, index + 1, StringComparison.Ordinal);
            if (index < 0)
            {
                throw new ArgumentException($"Marker '{marker}' occurrence {occurrence} not found.");
            }
        }
        index += offset;
        var line = text[..index].Count(character => character == '\n');
        var character = index - (text.LastIndexOf('\n', Math.Max(0, index - 1)) + 1);
        if (index > 0 && text[index - 1] == '\n')
        {
            character = 0;
        }
        return Position(line, character);
    }

    internal static JsonObject DocumentPosition(string path, JsonObject position) => new()
    {
        ["textDocument"] = new JsonObject { ["uri"] = Uri(path) },
        ["position"] = position,
    };

    internal static JsonObject Document(string path) => new() { ["textDocument"] = new JsonObject { ["uri"] = Uri(path) } };

    internal async Task<JsonElement> RequestAsync(string method, JsonNode parameters)
    {
        var response = await RawAsync(method, parameters);
        if (response.TryGetProperty("error", out var error))
        {
            throw new LanguageServerError(error.GetProperty("code").GetInt32(), error.GetProperty("message").GetString()!);
        }
        return response.GetProperty("result").Clone();
    }

    internal async Task<JsonElement> RawAsync(string method, JsonNode parameters)
    {
        var id = ++nextId;
        var message = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters }.ToJsonString();
        var response = await server.HandleAsync(message) ?? throw new InvalidOperationException($"{method} returned no response.");
        using var document = JsonDocument.Parse(response);
        Assert.Equal(id, document.RootElement.GetProperty("id").GetInt32());
        return document.RootElement.Clone();
    }

    internal async Task NotifyAsync(string method, JsonNode parameters)
    {
        var message = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method, ["params"] = parameters }.ToJsonString();
        Assert.Null(await server.HandleAsync(message));
    }

    internal Task<string?> SendRawAsync(string message) => server.HandleAsync(message);

    internal async Task<JsonElement[]> DiagnosticsAsync(string path)
    {
        var report = await RequestAsync("textDocument/diagnostic", Document(path));
        Assert.Equal("full", report.GetProperty("kind").GetString());
        return [.. report.GetProperty("items").EnumerateArray()];
    }

    /// <summary>Apply LSP text edits to text, last edit first.</summary>
    internal static string ApplyEdits(string text, JsonElement edits)
    {
        var lines = LineStarts(text);
        int Offset(JsonElement position) =>
            lines[position.GetProperty("line").GetInt32()] + position.GetProperty("character").GetInt32();
        foreach (var edit in edits.EnumerateArray()
            .Select(edit => (Start: Offset(edit.GetProperty("range").GetProperty("start")), End: Offset(edit.GetProperty("range").GetProperty("end")), Text: edit.GetProperty("newText").GetString()!))
            .OrderByDescending(edit => edit.Start))
        {
            text = string.Concat(text.AsSpan(0, edit.Start), edit.Text, text.AsSpan(edit.End));
        }
        return text;
    }

    private static List<int> LineStarts(string text)
    {
        var starts = new List<int> { 0 };
        for (var index = 0; index < text.Length; index++)
        {
            if (text[index] == '\n')
            {
                starts.Add(index + 1);
            }
        }
        return starts;
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "nx.json")))
        {
            directory = directory.Parent;
        }
        return directory?.FullName ?? throw new InvalidOperationException("Run the tests inside the Tau workspace.");
    }
}

internal sealed class LanguageServerError(int code, string message) : Exception(message)
{
    internal int Code { get; } = code;
}

/// <summary>Shared C# sources: a PicoGK program, a helper used by two programs, and BCL usage.</summary>
internal static class Sources
{
    internal const string Main = """
        using System.Numerics;
        using PicoGK;

        Library.Go(1.0f, () =>
        {
            var sphere = ShapeFactory.Create(16.0f);
            var radius = Math.Sqrt(4.0);
            Library.oViewer().Add(sphere);
        });
        """;

    internal const string ShapeFactory = """
        using System.Numerics;
        using PicoGK;

        /// <summary>Builds the example's shapes.</summary>
        public static class ShapeFactory
        {
            /// <summary>Create a sphere at the origin.</summary>
            /// <param name="radius">Sphere radius in millimetres.</param>
            public static Voxels Create(float radius)
            {
                return Voxels.voxSphere(Vector3.Zero, radius);
            }
        }

        public interface IShape
        {
            Voxels Build();
        }

        public sealed class Ball : IShape
        {
            public Voxels Build() => ShapeFactory.Create(2.0f);
        }
        """;

    internal const string Second = """
        using PicoGK;

        Library.Go(0.5f, () =>
        {
            var other = ShapeFactory.Create(8.0f);
            Library.oViewer().Add(other);
        });
        """;
}
