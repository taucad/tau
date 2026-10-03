using System.Numerics;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using PicoGK;
using Xunit;
namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void ReferenceParameterAttributeAndEnumDispositionsMatchCompilerBehavior()
    {
        Write("main.cs", """
        using System.ComponentModel.DataAnnotations;
        System.Console.WriteLine(0);
        public enum Choice { First = 0, Alias = 0, Second = 1 }
        public static class Resources { public static string Name => "Localized"; }
        public static class Params {
            public static int IgnoredField = 5;
            public static int IgnoredMethod() => 5;
            [Display(Name = "Key", ResourceType = typeof(Resources))]
            public static int Count { get; set; } = default(int);
            public static Choice Choice { get; set; } = Choice.Alias;
            public static string? Label { get; set; } = "value";
        }
        """);
        var compiled = CompilationService.Compile(root, "main.cs");
        Assert.Equal("First", compiled.Defaults["Choice"]);
        Assert.Equal(0, compiled.Defaults["Count"]);
        Assert.Equal("value", compiled.Defaults["Label"]);
        Assert.Equal(3, compiled.Defaults.Count);
        var properties = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(compiled.JsonSchema["properties"]);
        var count = Assert.IsAssignableFrom<IReadOnlyDictionary<string, object?>>(properties["Count"]);
        Assert.Equal("Key", count["title"]);
        var caseError = Assert.Throws<WorkerException>(() => CompilationService.BindParameters(compiled, Json("""{"Choice":"alias"}""")));
        Assert.Equal("CS_TAU_PARAMETERS", caseError.Issues[0].Code);
        Assert.Contains("Choice", caseError.Message);
        Assert.Equal("Alias", CompilationService.BindParameters(compiled, Json("""{"Choice":"Alias"}"""))["Choice"]);
        Assert.Equal("First", CompilationService.BindParameters(compiled, Json("{}"))["Choice"]);
        Write("main.cs", """
        using System.ComponentModel.DataAnnotations;
        System.Console.WriteLine(0);
        public static class Params { [Range(typeof(double), "0", "2")] public static double Size { get; set; } = 1; }
        """);
        var range = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
        Assert.Equal("CS_TAU_PARAMETERS", range.Issues[0].Code);
        Assert.Contains("Range on 'Size' is invalid.", range.Message);
        Assert.Equal("main.cs", range.Issues[0].Location?.FileName);
        foreach (var declaration in new[] {
            "public static int? Value { get; set; } = 1;",
            "public static string? Value { get; set; } = default(string);",
            "public static Options Value { get; set; } = Options.A | Options.B;"
        }) {
            Write("main.cs", $$"""
            System.Console.WriteLine(0);
            [System.Flags] public enum Options { A = 1, B = 2 }
            public static class Params { {{declaration}} }
            """);
            var invalid = Assert.Throws<WorkerException>(() => CompilationService.Compile(root, "main.cs"));
            Assert.Equal("CS_TAU_PARAMETERS", invalid.Issues[0].Code);
            Assert.Equal("main.cs", invalid.Issues[0].Location?.FileName);
        }
    }

    [Fact]
    public void ReferenceHostedNoOpErrorsAndProjectionMatchCurrentSupport()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "reference-support"));
        backend.RequestScreenShot("unused.png");
        var empty = backend.Extract();
        Assert.Empty(empty.Components);
        Assert.Empty(empty.Warnings);
        Assert.Null(empty.Mechanism);
        var capability = Assert.Throws<WorkerException>(() => backend.EnableExperimental(true));
        Assert.Equal("CS_TAU_VIEWER_CAPABILITY", capability.Issues[0].Code);
        Assert.Equal("The hosted PicoGK viewer does not support experimental viewer rendering.", capability.Message);
        var source = new ReferenceMechanism();
        backend.SetMechanism(source);
        Assert.Equal(1, source.GetterCalls);
        var scene = backend.Extract();
        Assert.Equal(1, scene.Mechanism!.Value.GetProperty("schemaVersion").GetInt32());
        Assert.False(scene.Mechanism.Value.TryGetProperty("SchemaVersion", out _));
        Assert.False(scene.Mechanism.Value.TryGetProperty("Ignored", out _));
        Assert.Equal(1, scene.Mechanism.Value.GetProperty("Kind").GetInt32());
        Assert.False(scene.Mechanism.Value.TryGetProperty("Field", out _));
        backend.SetMechanism(null!);
        var rejected = backend.Extract();
        Assert.Null(rejected.Mechanism);
        var warning = Assert.Single(rejected.Warnings);
        Assert.Equal("CS_TAU_MECHANISM_SERIALIZATION", warning.Code);
        Assert.StartsWith("PicoGK mechanism could not be serialized:", warning.Message);
        Assert.Empty(rejected.Components);
    }

    [Fact]
    public void ReferenceMaterialRecordCopiesShareInputsButSnapshotsOwnBytes()
    {
        byte[] data = MaterialPng.ToArray();
        var image = new MaterialImage { Data = data, Format = MaterialImageFormat.Png };
        var changed = image with { Name = "Copy" };
        Assert.Same(data, changed.Data);
        var material = new Material { ColorTexture = new MaterialTexture { Image = changed } };
        var snapshot = MaterialCapture.Snapshot(material, 7);
        Assert.NotSame(data, snapshot.ColorTexture!.Image.Data);
        data[0] = 0;
        Assert.Equal(137, snapshot.ColorTexture.Image.Data[0]);
        Assert.Equal(0, changed.Data[0]);
        Assert.Equal(0, (int)MaterialImageFormat.Png);
        Assert.Equal(1, (int)MaterialImageFormat.Jpeg);
        Assert.Equal(2, (int)MaterialImageFormat.WebP);
    }

    [Fact]
    public void ReferenceUnhostedMethodBodiesRetainNoOpAndTypedMaterialErrors()
    {
        // Exercise only the actual unhosted method bodies; no native window is created.
        var viewer = (Viewer)RuntimeHelpers.GetUninitializedObject(typeof(Viewer));
        GC.SuppressFinalize(viewer);
        var source = new ReferenceMechanism();
        var mechanismError = Assert.Throws<NotSupportedException>(() => viewer.SetMechanism(source));
        Assert.Equal("Mechanisms require the hosted PicoGK viewer backend", mechanismError.Message);
        Assert.Equal(0, source.GetterCalls);
        var nullError = Assert.Throws<ArgumentNullException>(() => viewer.SetGroupMaterial(0, null!));
        Assert.Equal("material", nullError.ParamName);
        var unsupported = Assert.Throws<NotSupportedException>(() => viewer.SetGroupMaterial(0, new Material()));
        Assert.Equal("Typed materials require the hosted PicoGK viewer backend", unsupported.Message);
        var invalid = Assert.Throws<WorkerException>(() => MaterialCapture.Snapshot(new Material {
            ColorTexture = new MaterialTexture { Image = new MaterialImage { Data = null!, Format = MaterialImageFormat.Png } }
        }, 7));
        Assert.Equal("CS_TAU_RUNTIME", invalid.Issues[0].Code);
        Assert.Equal("Group 7: PicoGK material ColorTexture.Image.Data is required. Correct this property and retry.", invalid.Message);
    }

    private sealed class ReferenceMechanism
    {
        public int GetterCalls { get; private set; }
        [JsonPropertyName("schemaVersion")]
        public int SchemaVersion { get { GetterCalls++; return 1; } }
        [JsonIgnore] public bool Ignored => true;
        public int Field = 3;
        public MaterialImageFormat Kind => MaterialImageFormat.Jpeg;
    }
}
