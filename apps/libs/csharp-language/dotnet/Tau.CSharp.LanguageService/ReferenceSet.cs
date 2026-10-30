using System.Collections.Immutable;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace Tau.CSharp.LanguageService;

/// <summary>One reference assembly image and its optional XML documentation.</summary>
public sealed record ReferenceAssembly(string Name, byte[] Image, byte[]? Documentation);

/// <summary>
/// The metadata the PicoGK compiler binds user code against, plus documentation for hover, completion and
/// declarations. Built once per server; every project shares the same <see cref="MetadataReference"/> instances.
/// </summary>
public sealed class ReferenceSet
{
    private ReferenceSet(ImmutableArray<MetadataReference> references)
    {
        References = references;
    }

    internal ImmutableArray<MetadataReference> References { get; }

    /// <summary>Create the set from in-memory images, as the browser host receives them.</summary>
    public static ReferenceSet Create(IEnumerable<ReferenceAssembly> assemblies) => new(
        [
            .. assemblies.Select(assembly => (MetadataReference)MetadataReference.CreateFromImage(
                assembly.Image,
                documentation: assembly.Documentation is null
                    ? null
                    : XmlDocumentationProvider.CreateFromBytes(assembly.Documentation),
                filePath: assembly.Name)),
        ]);

    /// <summary>
    /// Read a bundle: a UTF-8 header line per entry (<c>name\tassemblyLength\tdocumentationLength</c>), an empty
    /// line, then the concatenated bytes in header order. The preparation script writes this format.
    /// </summary>
    public static ReferenceSet FromBundle(byte[] bundle)
    {
        var assemblies = new List<ReferenceAssembly>();
        var headerEnd = IndexOf(bundle, "\n\n"u8);
        if (headerEnd < 0)
        {
            throw new InvalidDataException("The C# reference bundle has no header terminator.");
        }
        var offset = headerEnd + 2;
        foreach (var line in Encoding.UTF8.GetString(bundle, 0, headerEnd).Split('\n'))
        {
            var fields = line.Split('\t');
            if (fields.Length != 3 || !int.TryParse(fields[1], out var imageLength) || !int.TryParse(fields[2], out var documentationLength))
            {
                throw new InvalidDataException($"Invalid C# reference bundle entry: {line}");
            }
            if (offset + imageLength + documentationLength > bundle.Length)
            {
                throw new InvalidDataException($"The C# reference bundle is truncated at {fields[0]}.");
            }
            var image = bundle.AsSpan(offset, imageLength).ToArray();
            offset += imageLength;
            var documentation = documentationLength == 0 ? null : bundle.AsSpan(offset, documentationLength).ToArray();
            offset += documentationLength;
            assemblies.Add(new ReferenceAssembly(fields[0], image, documentation));
        }
        if (offset != bundle.Length)
        {
            throw new InvalidDataException("The C# reference bundle has trailing bytes.");
        }
        return Create(assemblies);
    }

    private static int IndexOf(byte[] haystack, ReadOnlySpan<byte> needle) => haystack.AsSpan().IndexOf(needle);
}

/// <summary>
/// The PicoGK compiler's contract (packages/plugins/picogk/dotnet/Tau.PicoGK.Worker/CompilationService.cs). The
/// language service must bind exactly as a render compiles, or the editor and the Issues panel disagree.
/// </summary>
internal static class CompilerContract
{
    internal const string ImplicitUsingsPath = "/__tau__/TauImplicitUsings.g.cs";

    internal const string ImplicitUsings = """
        global using global::System;
        global using global::System.Collections.Generic;
        global using global::System.IO;
        global using global::System.Linq;
        global using global::System.Net.Http;
        global using global::System.Threading;
        global using global::System.Threading.Tasks;
        """;

    internal static readonly CSharpParseOptions ParseOptions = new(LanguageVersion.Latest);

    internal static readonly CSharpCompilationOptions CompilationOptions = new(
        OutputKind.ConsoleApplication,
        optimizationLevel: OptimizationLevel.Release,
        deterministic: true,
        allowUnsafe: false);
}
