using System.Text.Json;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

// A partial of WorkerTests: Main redirects the process-wide Console, so these tests share that class's
// serialized xUnit collection instead of racing it.
public sealed partial class WorkerTests
{
    [Fact]
    public void EmitApiWritesTheAuthorCallableSurfaceThroughMain()
    {
        WriteApiSources();
        var output = Path.Combine(root, "api", "surface.json");

        var (exitCode, error) = InvokeMain(["--emit-api", output, Path.Combine(root, "picogk-src")]);

        Assert.Equal(0, exitCode);
        Assert.Equal($"Wrote 25 top-level C# entries to {output}.", error.Trim());
        var surface = JsonDocument.Parse(File.ReadAllText(output)).RootElement;
        Assert.Equal("PicoGK", surface.GetProperty("packageName").GetString());
        Assert.Equal(typeof(global::PicoGK.Library).Assembly.GetName().Version!.ToString(), surface.GetProperty("packageVersion").GetString());
        Assert.StartsWith("Roslyn ", surface.GetProperty("extractor").GetString());
        // obj/ and bin/ hold unparseable sources; skipping them is what keeps this at zero.
        Assert.Equal(0, surface.GetProperty("diagnosticErrors").GetInt32());

        var entries = surface.GetProperty("entries");
        var names = entries.EnumerateArray().Select(entry => $"{entry.GetProperty("path").GetString()}.{entry.GetProperty("name").GetString()}").ToArray();
        Assert.Equal(
            [
                "PicoGK.Broken", "PicoGK.Callback", "PicoGK.IEmpty", "PicoGK.Kind", "PicoGK.Numerics.Extra.Helper", "PicoGK.Point",
                "PicoGK.Shape", "PicoGK.Stamp", "System.Array", "System.Collections.Generic.Dictionary",
                "System.Collections.Generic.HashSet", "System.Collections.Generic.List", "System.Console", "System.Convert",
                "System.Math", "System.MathF", "System.Numerics.Matrix3x2", "System.Numerics.Matrix4x4", "System.Numerics.Plane",
                "System.Numerics.Quaternion", "System.Numerics.Vector2", "System.Numerics.Vector3", "System.Numerics.Vector4",
                "System.Random", "System.String",
            ],
            names);
        Assert.Equal("class", Named(entries, "Broken").GetProperty("kind").GetString());
        Assert.Equal("type", Named(entries, "Callback").GetProperty("kind").GetString());
        Assert.Equal("interface", Named(entries, "IEmpty").GetProperty("kind").GetString());
        Assert.Equal("enum", Named(entries, "Kind").GetProperty("kind").GetString());
        Assert.Equal("struct", Named(entries, "Point").GetProperty("kind").GetString());
        Assert.Equal("class", Named(entries, "Stamp").GetProperty("kind").GetString());
        Assert.True(Named(entries, "Helper").GetProperty("static").GetBoolean());
        // Malformed documentation XML costs the prose, not the entry; memberless types omit members.
        Assert.False(Named(entries, "Broken").TryGetProperty("docs", out _));
        Assert.False(Named(entries, "IEmpty").TryGetProperty("members", out _));
        Assert.Equal(["Name", "Stamp"], Named(entries, "Stamp").GetProperty("members").EnumerateArray().Select(member => member.GetProperty("name").GetString()));

        var kind = Named(entries, "Kind").GetProperty("members");
        Assert.Equal(["Solid", "Hollow"], kind.EnumerateArray().Select(member => member.GetProperty("name").GetString()));
        Assert.All(kind.EnumerateArray(), member => Assert.Equal("enumMember", member.GetProperty("kind").GetString()));
        Assert.Equal("Filled.", Named(kind, "Solid").GetProperty("docs").GetProperty("summary").GetString());

        var shape = Named(entries, "Shape");
        Assert.Equal("Shape.cs", shape.GetProperty("source").GetProperty("file").GetString());
        Assert.Equal(19, shape.GetProperty("source").GetProperty("line").GetInt32());
        Assert.Equal("T:PicoGK.Shape", shape.GetProperty("languageSpecific").GetProperty("documentationId").GetString());
        var docs = shape.GetProperty("docs");
        Assert.Equal("A solid PicoGK.Shape , built from voxels.", docs.GetProperty("summary").GetString());
        Assert.Equal("See LEAP 71 , unnamed and T .", docs.GetProperty("remarks").GetString());
        var examples = docs.GetProperty("examples").EnumerateArray().ToArray();
        Assert.Equal(2, examples.Length);
        Assert.Equal("Build one:", examples[0].GetProperty("caption").GetString());
        Assert.Equal("var shape = new Shape(1f);", examples[0].GetProperty("code").GetString());
        Assert.Equal("shape.Grow();", examples[1].GetProperty("code").GetString());
        Assert.Equal(
            ["System.ArgumentException: When the size is negative.", "System.InvalidOperationException", "When disposed."],
            docs.GetProperty("throws").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal(["PicoGK.Kind", "!:"], docs.GetProperty("seeAlso").EnumerateArray().Select(item => item.GetString()));

        var members = shape.GetProperty("members");
        Assert.Equal(
            [
                "this[int index]", "Count", "Limit", "Seed", "Density", "Changed", "Inner", "Shape", "Grow", "Pick", "Tag", "Mark", "op_Addition", "op_Implicit",
                "Expand", "Shrink", "Old", "Described", "Guarded", "Shared",
            ],
            members.EnumerateArray().Select(member => member.GetProperty("name").GetString()));
        Assert.Equal("property", Named(members, "this[int index]").GetProperty("kind").GetString());
        Assert.True(Named(members, "Count").GetProperty("static").GetBoolean());
        Assert.Equal("constant", Named(members, "Limit").GetProperty("kind").GetString());
        Assert.Equal("field", Named(members, "Seed").GetProperty("kind").GetString());
        Assert.False(Named(members, "Density").TryGetProperty("static", out _));
        var deeper = Named(Named(members, "Inner").GetProperty("members"), "Deeper");
        Assert.Equal("PicoGK.Shape.Inner", deeper.GetProperty("path").GetString());
        Assert.Equal("Use Grow.", Named(members, "Expand").GetProperty("deprecated").GetString());
        Assert.True(Named(members, "Shrink").GetProperty("deprecated").GetBoolean());
        Assert.True(Named(members, "Old").GetProperty("deprecated").GetBoolean());
        Assert.False(Named(members, "Described").TryGetProperty("deprecated", out _));
        Assert.Equal("protected", Named(members, "Guarded").GetProperty("visibility").GetString());
        Assert.Equal("protected", Named(members, "Shared").GetProperty("visibility").GetString());
        Assert.Equal("public static implicit operator float (Shape shape)", Signatures(members, "op_Implicit")[0].GetProperty("text").GetString());

        var constructors = Signatures(members, "Shape");
        Assert.Equal("constructor", Named(members, "Shape").GetProperty("kind").GetString());
        Assert.Equal(["public Shape(float size, float scale = 1f)", "public Shape()"], constructors.Select(signature => signature.GetProperty("text").GetString()));
        Assert.False(constructors[0].TryGetProperty("returnType", out _));
        Assert.Equal("Make a shape of size .", constructors[0].GetProperty("description").GetString());
        var constructorParameters = constructors[0].GetProperty("parameters");
        Assert.Equal("Edge length.", Named(constructorParameters, "size").GetProperty("description").GetString());
        // The default is the author's source text, not the formatted constant.
        Assert.Equal("1f", Named(constructorParameters, "scale").GetProperty("defaultValue").GetString());
        Assert.False(Named(constructorParameters, "scale").TryGetProperty("description", out _));

        var grow = Named(members, "Grow");
        Assert.Equal(
            new Dictionary<string, string?> { ["steps"] = "ref", ["made"] = "out", ["rate"] = "in", ["limit"] = "in" },
            grow.GetProperty("languageSpecific").GetProperty("refKinds").EnumerateObject().ToDictionary(item => item.Name, item => item.Value.GetString()));
        Assert.Equal(
            new string?[] { "Grow in steps. Returns: The grown shape.", "This shape.", null },
            Signatures(members, "Grow").Select(signature => signature.TryGetProperty("description", out var text) ? text.GetString() : null));
        Assert.False(Named(members, "Tag").GetProperty("languageSpecific").TryGetProperty("refKinds", out _));

        var pick = Signatures(members, "Pick")[0];
        Assert.Equal(["T"], pick.GetProperty("typeParameters").EnumerateArray().Select(item => item.GetString()));
        Assert.Equal("T", pick.GetProperty("returnType").GetProperty("text").GetString());
        Assert.Equal("Echo a value.", pick.GetProperty("description").GetString());

        var tag = Signatures(members, "Tag")[0].GetProperty("parameters");
        // An attribute-declared default has no default-value syntax, so its constant is formatted.
        Assert.Equal("5", Named(tag, "count").GetProperty("defaultValue").GetString());
        Assert.Equal("null", Named(tag, "label").GetProperty("defaultValue").GetString());
        Assert.True(Named(tag, "ids").GetProperty("variadic").GetBoolean());
        Assert.False(Named(tag, "ids").TryGetProperty("defaultValue", out _));
        // A DateTime constant has no literal form, so it is written as the keyword.
        Assert.Equal("default", Named(Signatures(members, "Mark")[0].GetProperty("parameters"), "at").GetProperty("defaultValue").GetString());

        Assert.Equal("public abstract class Array", Named(entries, "Array").GetProperty("signatures")[0].GetProperty("text").GetString());
        Assert.Equal("public sealed class String", Named(entries, "String").GetProperty("signatures")[0].GetProperty("text").GetString());
        // BCL entries come from metadata: no declaration site, and an enum default is its underlying constant.
        var text = Named(entries, "String");
        Assert.False(text.TryGetProperty("source", out _));
        var split = Signatures(text.GetProperty("members"), "Split")
            .First(signature => signature.GetProperty("text").GetString() == "public string[] Split(char separator, StringSplitOptions options = None)");
        Assert.Equal("0", Named(split.GetProperty("parameters"), "options").GetProperty("defaultValue").GetString());
    }

    [Fact]
    public void EmitApiRetainsConstructionAccessorsConstraintsDefaultsAndNestedDeclarations()
    {
        Write("declarations/Types.cs", """
        namespace PicoGK;
        public class RequiredBase { public required string BaseName { get; init; } }
        public sealed record Image {
            public required byte[] Data { get; init; }
            public string? Name { get; init; }
            public float Scale { get; init; } = 1f;
        }
        public class Holder<T> : RequiredBase where T : class, new() {
            public T? Value { get; private set; }
            public int ReadOnly => 3;
            public int this[int index] => index;
            public string this[string key] => key;
            public U Echo<U>(U value, float scale = 1f) where U : struct => value;
            public class Nested { public enum Mode : long { First = 1L, Alias = First } }
        }
        public readonly record struct Stamp(int Value);
        """);
        var output = Path.Combine(root, "declarations.json");
        Assert.Equal(0, InvokeMain(["--emit-api", output, Path.Combine(root, "declarations")]).ExitCode);
        var payload = JsonDocument.Parse(File.ReadAllText(output)).RootElement;
        Assert.Equal(0, payload.GetProperty("diagnosticErrors").GetInt32());
        var entries = payload.GetProperty("entries");
        string Declaration(JsonElement entry) => entry.GetProperty("signatures")[0].GetProperty("text").GetString()!;
        Assert.Equal("public sealed record Image", Declaration(Named(entries, "Image")));
        var image = Named(entries, "Image").GetProperty("members");
        Assert.Equal("public required byte[] Data { get; init; }", Declaration(Named(image, "Data")));
        Assert.Equal("public string? Name { get; init; }", Declaration(Named(image, "Name")));
        Assert.Equal("public float Scale { get; init; } = 1f;", Declaration(Named(image, "Scale")));
        Assert.Equal("public Image()", Declaration(Named(image, "Image")));
        Assert.Equal("public readonly record struct Stamp(int Value)", Declaration(Named(entries, "Stamp")));
        var holder = Named(entries, "Holder");
        Assert.Equal("public class Holder<T> : RequiredBase where T : class, new()", Declaration(holder));
        var members = holder.GetProperty("members");
        Assert.Equal("public T? Value { get; private set; }", Declaration(Named(members, "Value")));
        Assert.Equal("public int ReadOnly { get; }", Declaration(Named(members, "ReadOnly")));
        Assert.Equal("public int this[int index] { get; }", Declaration(Named(members, "this[int index]")));
        Assert.Equal("public string this[string key] { get; }", Declaration(Named(members, "this[string key]")));
        Assert.Equal("public U Echo<U>(U value, float scale = 1f)\r\n    where U : struct", Declaration(Named(members, "Echo")));
        var mode = Named(Named(members, "Nested").GetProperty("members"), "Mode");
        Assert.Equal("PicoGK.Holder.Nested", mode.GetProperty("path").GetString());
        Assert.Equal("public enum Mode : long", Declaration(mode));
        Assert.Equal("Alias = First", Declaration(Named(mode.GetProperty("members"), "Alias")));
        Assert.Equal("public required string BaseName { get; init; }", Declaration(Named(Named(entries, "RequiredBase").GetProperty("members"), "BaseName")));
    }

    [Fact]
    public void EmitApiReportsCompileErrorsButStillEmitsAndRejectsAMissingSourceRoot()
    {
        Write("broken-src/Partial.cs", "namespace PicoGK { public class Partial { public Missing? Field; } }");
        var output = Path.Combine(root, "broken-api", "surface.json");

        var (brokenExit, brokenError) = InvokeMain(["--emit-api", output, Path.Combine(root, "broken-src")]);

        Assert.Equal(0, brokenExit);
        Assert.StartsWith("PicoGK source compiled with 1 error diagnostic(s); symbols still emitted.", brokenError);
        var surface = JsonDocument.Parse(File.ReadAllText(output)).RootElement;
        Assert.Equal(1, surface.GetProperty("diagnosticErrors").GetInt32());
        var partial = Named(surface.GetProperty("entries"), "Partial");
        Assert.Equal("Field", partial.GetProperty("members")[0].GetProperty("name").GetString());

        var missing = Path.Combine(root, "does-not-exist");
        var (exitCode, error) = InvokeMain(["--emit-api", Path.Combine(root, "unused.json"), missing]);
        Assert.Equal(2, exitCode);
        Assert.Equal($"PicoGK source root not found: {missing}", error.Trim());
        Assert.False(File.Exists(Path.Combine(root, "unused.json")));
    }

    [Fact]
    public void MainTreatsOnlyTheExactEmitApiFormAsExtraction()
    {
        // Three arguments that are not --emit-api reach the protocol path, whose argument parser rejects them.
        var exception = Assert.Throws<System.Reflection.TargetInvocationException>(() =>
            InvokeMain(["--workspace", root, "--artifacts"]));
        Assert.Equal("Invalid PicoGK worker arguments.", Assert.IsType<ArgumentException>(exception.InnerException).Message);
    }

    private (int ExitCode, string Error) InvokeMain(string[] arguments)
    {
        var originalError = Console.Error;
        var error = new StringWriter();
        try
        {
            Console.SetError(error);
            var main = typeof(Program).GetMethod("Main", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
            return ((int)main.Invoke(null, [arguments])!, error.ToString());
        }
        finally
        {
            Console.SetError(originalError);
        }
    }

    private static JsonElement Named(JsonElement array, string name) =>
        array.EnumerateArray().Single(item => item.GetProperty("name").GetString() == name);

    private static JsonElement[] Signatures(JsonElement members, string name) =>
        Named(members, name).GetProperty("signatures").EnumerateArray().ToArray();

    private void WriteApiSources()
    {
        Write("picogk-src/Shape.cs", """
        using System.Runtime.InteropServices;

        namespace PicoGK;

        /// <summary>A solid <see cref="T:PicoGK.Shape"/>, built from <c>voxels</c>.<!-- internal note --></summary>
        /// <remarks>See <see href="https://leap71.com">LEAP 71</see>, <paramref>unnamed</paramref> and <typeparamref name="T"/>.</remarks>
        /// <example>Build one:<code>
        /// var shape = new Shape(1f);
        /// </code></example>
        /// <example>shape.Grow();</example>
        /// <example><code>   </code></example>
        /// <exception cref="T:System.ArgumentException">When the size is negative.</exception>
        /// <exception cref="T:System.InvalidOperationException"/>
        /// <exception>When disposed.</exception>
        /// <exception/>
        /// <seealso cref="T:PicoGK.Kind"/>
        /// <seealso cref="!:"/>
        /// <seealso/>
        public class Shape
        {
            /// <summary>Make a shape of <paramref name="size"/>.</summary>
            /// <param name="size">Edge length.</param>
            /// <param name="">Unnamed.</param>
            /// <param>No name at all.</param>
            /// <param name="scale"></param>
            public Shape(float size, float scale = 1f) { }

            public Shape() { }

            /// <summary>Grow in steps.</summary>
            /// <returns>The grown shape.</returns>
            public Shape Grow(ref int steps, out int made, in float rate, ref readonly float limit) { made = steps; return this; }

            /// <returns>This shape.</returns>
            public Shape Grow() => this;

            public Shape Grow(float amount) => this;

            /// <summary>Echo a value.</summary>
            public T Pick<T>(T value) => value;

            public void Tag([Optional, DefaultParameterValue(5)] int count, string? label = null, params int[] ids) { }

            public void Mark([Optional, System.Runtime.CompilerServices.DateTimeConstant(0)] DateTime at) { }

            public static Shape operator +(Shape left, Shape right) => left;

            public static implicit operator float (Shape shape) => 0f;

            public float this[int index] => index;

            public static int Count { get; set; }

            public const int Limit = 3;

            public static readonly int Seed = 1;

            public float Density;

            [Obsolete("Use Grow.")]
            public void Expand() { }

            [Obsolete]
            public void Shrink() { }

            [Obsolete(null)]
            public void Old() { }

            [System.ComponentModel.Description("Described.")]
            public void Described() { }

            protected void Guarded() { }

            protected internal void Shared() { }

            private protected void Narrow() { }

            internal void Assembly() { }

            private void Secret() { }

            public event EventHandler? Changed;

            ~Shape() { }

            public class Inner
            {
                public class Deeper { }
            }

            private class Private
            {
                public int Leak;
            }
        }
        """);
        Write("picogk-src/Types.cs", """
        /// <summary>Outside every allowed namespace.</summary>
        public class GlobalThing { }

        namespace PicoGK
        {
            /// <summary>Kinds.</summary>
            public enum Kind
            {
                /// <summary>Filled.</summary>
                Solid,
                Hollow = 4,
            }

            public interface IEmpty { }

            public struct Point
            {
                public float X;
            }

            public record class Stamp(string Name);

            public delegate void Callback(int value);

            /// <summary>Bad <b>xml</summary>
            public static class Broken { }

            internal class Hidden
            {
                public class Visible { }
            }
        }

        namespace PicoGKExtra
        {
            public class NotPico { }
        }

        namespace Other
        {
            public class Outside { }
        }
        """);
        Write("picogk-src/Numerics/Helper.cs", """
        namespace PicoGK.Numerics.Extra;

        public static class Helper
        {
            public static int Twice(int value) => value * 2;
        }
        """);
        Write("picogk-src/obj/Generated.cs", "namespace PicoGK { public class ObjOnly { not csharp } }");
        Write("picogk-src/bin/Stale.cs", "namespace PicoGK { public class BinOnly { not csharp } }");
    }
}
