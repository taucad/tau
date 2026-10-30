using System.Text.Json;
using static Tau.CSharp.LanguageService.Tests.LanguageServerHarness;

namespace Tau.CSharp.LanguageService.Tests;

public sealed class DiagnosticsTests
{
    private static readonly Dictionary<string, string> Project = new()
    {
        ["main.cs"] = Sources.Main,
        ["ShapeFactory.cs"] = Sources.ShapeFactory,
    };

    [Fact]
    public async Task ValidPicoGkProjectHasNoDiagnostics()
    {
        using var harness = await StartAsync(Project);
        await harness.OpenAsync("main.cs", Sources.Main);
        Assert.Empty(await harness.DiagnosticsAsync("main.cs"));
        Assert.Empty(await harness.DiagnosticsAsync("ShapeFactory.cs"));
    }

    [Fact]
    public async Task TypeErrorsAreReportedWithRangeCodeAndSeverity()
    {
        const string text = """
            using PicoGK;

            int count = "three";
            Voxels v = Voxels.voxMissing();
            """;
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var diagnostics = await harness.DiagnosticsAsync("main.cs");
        var conversion = Assert.Single(diagnostics, diagnostic => diagnostic.GetProperty("code").GetString() == "CS0029");
        Assert.Equal(1, conversion.GetProperty("severity").GetInt32());
        Assert.Equal("csharp", conversion.GetProperty("source").GetString());
        Assert.Equal(2, conversion.GetProperty("range").GetProperty("start").GetProperty("line").GetInt32());
        Assert.Equal(12, conversion.GetProperty("range").GetProperty("start").GetProperty("character").GetInt32());
        Assert.Contains(diagnostics, diagnostic => diagnostic.GetProperty("code").GetString() == "CS0117" &&
            diagnostic.GetProperty("message").GetString()!.Contains("voxMissing", StringComparison.Ordinal));
    }

    [Fact]
    public async Task CompilerContractMatchesThePicoGkWorker()
    {
        // Implicit usings (List, LINQ, Task) bind without directives; nullable analysis is disabled as in the worker.
        const string text = """
            var values = new List<int> { 1, 2, 3 };
            var total = values.Where(value => value > 1).Sum();
            string name = null;
            await Task.Delay(1);
            Console.WriteLine($"{total}{name}");
            """;
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        Assert.Empty(await harness.DiagnosticsAsync("main.cs"));
    }

    [Fact]
    public async Task EachProgramCompilesWithHelpersButNotWithOtherPrograms()
    {
        using var harness = await StartAsync(new Dictionary<string, string>
        {
            ["main.cs"] = Sources.Main,
            ["second.cs"] = Sources.Second,
            ["ShapeFactory.cs"] = Sources.ShapeFactory,
        });
        foreach (var path in (string[])["main.cs", "second.cs", "ShapeFactory.cs"])
        {
            var diagnostics = await harness.DiagnosticsAsync(path);
            Assert.DoesNotContain(diagnostics, diagnostic => diagnostic.GetProperty("code").GetString() is "CS8802" or "CS0101");
            Assert.Empty(diagnostics);
        }
    }

    [Fact]
    public async Task HelperOnlyProjectsReportNoLocationlessEntryPointError()
    {
        using var harness = await StartAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory });
        Assert.Empty(await harness.DiagnosticsAsync("ShapeFactory.cs"));
    }

    [Fact]
    public async Task IncrementalEditsUpdateDiagnostics()
    {
        const string text = "var x = 1;\nConsole.WriteLine(x);\n";
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        Assert.Empty(await harness.DiagnosticsAsync("main.cs"));
        await harness.ChangeAsync("main.cs", (1, 18), (1, 19), "y");
        var diagnostic = Assert.Single(await harness.DiagnosticsAsync("main.cs"), item => item.GetProperty("severity").GetInt32() == 1);
        Assert.Equal("CS0103", diagnostic.GetProperty("code").GetString());
        Assert.Equal(18, diagnostic.GetProperty("range").GetProperty("start").GetProperty("character").GetInt32());
        await harness.ChangeAsync("main.cs", (0, 4), (0, 5), "y");
        Assert.Empty(await harness.DiagnosticsAsync("main.cs"));
    }

    [Fact]
    public async Task ClosedFileChangesReachDependentDocuments()
    {
        using var harness = await StartAsync(Project);
        await harness.OpenAsync("main.cs", Sources.Main);
        await harness.SetFilesAsync(new Dictionary<string, string> { ["ShapeFactory.cs"] = Sources.ShapeFactory.Replace("Create(float radius)", "Make(float radius)", StringComparison.Ordinal) }, replace: false);
        Assert.Contains(await harness.DiagnosticsAsync("main.cs"), diagnostic =>
            diagnostic.GetProperty("message").GetString()!.StartsWith("'ShapeFactory' does not contain a definition for 'Create'", StringComparison.Ordinal));
        await harness.DeleteFilesAsync("ShapeFactory.cs");
        Assert.Contains(await harness.DiagnosticsAsync("main.cs"), diagnostic => diagnostic.GetProperty("code").GetString() == "CS0103");
    }

    [Fact]
    public async Task ClosingADocumentRevertsToItsWorkspaceText()
    {
        using var harness = await StartAsync(Project);
        await harness.OpenAsync("ShapeFactory.cs", Sources.ShapeFactory.Replace("Create(float radius)", "Make(float radius)", StringComparison.Ordinal));
        Assert.NotEmpty(await harness.DiagnosticsAsync("main.cs"));
        Assert.NotEmpty(await harness.DiagnosticsAsync("ShapeFactory.cs"));
        await harness.CloseAsync("ShapeFactory.cs");
        Assert.Empty(await harness.DiagnosticsAsync("main.cs"));
        await harness.OpenAsync("scratch.cs", "class Scratch {}");
        await harness.CloseAsync("scratch.cs");
        await Assert.ThrowsAsync<LanguageServerError>(() => harness.DiagnosticsAsync("scratch.cs"));
    }

    [Fact]
    public async Task ReplacingTheWorkspaceRemovesUnlistedClosedFiles()
    {
        using var harness = await StartAsync(Project);
        await harness.SetFilesAsync(new Dictionary<string, string> { ["main.cs"] = Sources.Main }, replace: true);
        Assert.Contains(await harness.DiagnosticsAsync("main.cs"), diagnostic => diagnostic.GetProperty("code").GetString() == "CS0103");
    }

    [Fact]
    public async Task ObsoleteAndUnnecessaryDiagnosticsCarryTags()
    {
        const string text = """
            Legacy.Old();
            static class Legacy
            {
                [Obsolete("Use New")]
                public static void Old() {}
            }
            """;
        using var harness = await StartAsync();
        await harness.OpenAsync("main.cs", text);
        var obsolete = Assert.Single(await harness.DiagnosticsAsync("main.cs"), diagnostic => diagnostic.GetProperty("code").GetString() == "CS0618");
        Assert.Equal(2, obsolete.GetProperty("severity").GetInt32());
        Assert.Contains(2, obsolete.GetProperty("tags").EnumerateArray().Select(tag => tag.GetInt32()));
    }
}
