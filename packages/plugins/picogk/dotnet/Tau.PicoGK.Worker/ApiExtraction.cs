using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Tau.PicoGK.Worker;

internal sealed record ApiTypeRefPayload(string Text);

internal sealed record ApiParameterPayload(
    string Name,
    ApiTypeRefPayload? Type,
    bool Optional,
    string? DefaultValue,
    bool? Variadic,
    string? Description);

internal sealed record ApiExamplePayload(string? Caption, string Code);

internal sealed record ApiDocsPayload(
    string? Summary,
    string? Remarks,
    IReadOnlyList<ApiExamplePayload>? Examples,
    IReadOnlyList<string>? Throws,
    IReadOnlyList<string>? SeeAlso);

internal sealed record ApiSignaturePayload(
    IReadOnlyList<ApiParameterPayload> Parameters,
    ApiTypeRefPayload? ReturnType,
    string Text,
    IReadOnlyList<string>? TypeParameters,
    string? Description);

internal sealed record ApiSourcePayload(string File, int? Line);

internal sealed record ApiLanguageSpecificPayload(
    string Language,
    IReadOnlyDictionary<string, string>? RefKinds,
    string? DocumentationId);

internal sealed record ApiEntryPayload(
    string Name,
    string Kind,
    string? Path,
    IReadOnlyList<ApiSignaturePayload>? Signatures,
    ApiTypeRefPayload? Type,
    ApiDocsPayload? Docs,
    object? Deprecated,
    string? Visibility,
    bool? Static,
    ApiSourcePayload? Source,
    IReadOnlyList<ApiEntryPayload>? Members,
    ApiLanguageSpecificPayload? LanguageSpecific);

internal sealed record ApiSurfacePayload(
    string PackageName,
    string PackageVersion,
    string Extractor,
    int DiagnosticErrors,
    IReadOnlyList<ApiEntryPayload> Entries);

/// <summary>
/// Emits the author-callable C# surface as JSON, from Roslyn symbols.
/// </summary>
/// <remarks>
/// This is a mode of the worker rather than a second project because the worker
/// already carries every input: the Roslyn package reference, the PicoGK project
/// reference, and <see cref="CompilationService.CreateReferences"/>, which builds
/// the exact reference set the in-process compiler gives an author. A separate
/// tool would need its own csproj, lock file, restore and publish, and a second
/// copy of that reference-set rule that could drift from the one that matters.
///
/// PicoGK is compiled from source rather than read from metadata. The published
/// worker's PicoGK.dll has no sibling PicoGK.xml — the packaging step deletes
/// every .xml — so a metadata walk would carry no prose at all. From source, one
/// walk yields signatures, return types, default-value source text, declaration
/// sites and documentation comments together.
/// </remarks>
internal static class ApiExtraction
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    // The surface an author may legally call is TRUSTED_PLATFORM_ASSEMBLIES plus the
    // PicoGK assembly (CompilationService.CreateReferences). PicoGK is taken whole;
    // the BCL is taken through this allowlist.
    // ponytail: a hand-picked BCL subset, not a reachability analysis. Widen the list
    // when a documented example needs a type it omits.
    private static readonly string[] AllowedNamespacePrefixes = ["PicoGK"];
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal)
    {
        "System.Numerics.Vector2",
        "System.Numerics.Vector3",
        "System.Numerics.Vector4",
        "System.Numerics.Matrix3x2",
        "System.Numerics.Matrix4x4",
        "System.Numerics.Quaternion",
        "System.Numerics.Plane",
        "System.Math",
        "System.MathF",
        "System.Console",
        "System.Random",
        "System.String",
        "System.Array",
        "System.Convert",
        "System.Collections.Generic.List`1",
        "System.Collections.Generic.Dictionary`2",
        "System.Collections.Generic.HashSet`1",
    };

    private static readonly SymbolDisplayFormat TypeFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
            | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers
            | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    private static readonly SymbolDisplayFormat SignatureFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters
            | SymbolDisplayGenericsOptions.IncludeVariance,
        memberOptions: SymbolDisplayMemberOptions.IncludeParameters
            | SymbolDisplayMemberOptions.IncludeType
            | SymbolDisplayMemberOptions.IncludeModifiers
            | SymbolDisplayMemberOptions.IncludeAccessibility
            | SymbolDisplayMemberOptions.IncludeRef,
        parameterOptions: SymbolDisplayParameterOptions.IncludeType
            | SymbolDisplayParameterOptions.IncludeName
            | SymbolDisplayParameterOptions.IncludeParamsRefOut
            | SymbolDisplayParameterOptions.IncludeDefaultValue,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
            | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers
            | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    private static readonly SymbolDisplayFormat DeclarationFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypes,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
        memberOptions: SymbolDisplayMemberOptions.IncludeType
            | SymbolDisplayMemberOptions.IncludeModifiers
            | SymbolDisplayMemberOptions.IncludeAccessibility,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes
            | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers
            | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    /// <summary>Write the JSON surface for the PicoGK sources at <paramref name="sourceRoot"/>.</summary>
    /// <param name="outputPath">Destination JSON file.</param>
    /// <param name="sourceRoot">Extracted, patched PicoGK source tree.</param>
    /// <returns>Zero when the surface was written.</returns>
    internal static int Emit(string outputPath, string sourceRoot)
    {
        if (!Directory.Exists(sourceRoot))
        {
            Console.Error.WriteLine($"PicoGK source root not found: {sourceRoot}");
            return 2;
        }
        var compilation = Compile(sourceRoot, out var diagnosticErrors);
        var entries = Surface(compilation)
            .Select(type => TypeEntry(type, sourceRoot))
            .ToArray();
        var payload = new ApiSurfacePayload(
            "PicoGK",
            typeof(global::PicoGK.Library).Assembly.GetName().Version?.ToString() ?? "0.0.0",
            $"Roslyn {typeof(CSharpCompilation).Assembly.GetName().Version?.ToString(3) ?? "unknown"}",
            diagnosticErrors,
            entries);
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
        // No encoding argument: File.WriteAllText defaults to UTF-8 without a BOM,
        // which JSON.parse requires.
        File.WriteAllText(outputPath, JsonSerializer.Serialize(payload, JsonOptions) + "\n");
        Console.Error.WriteLine($"Wrote {entries.Length} top-level C# entries to {outputPath}.");
        return 0;
    }

    private static CSharpCompilation Compile(string sourceRoot, out int diagnosticErrors)
    {
        var paths = Directory.GetFiles(sourceRoot, "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                && !path.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .ToArray();
        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest, DocumentationMode.Parse);
        var trees = paths
            .Select(path => CSharpSyntaxTree.ParseText(File.ReadAllText(path), parseOptions, path, Encoding.UTF8))
            .Prepend(CSharpSyntaxTree.ParseText(
                """
                global using global::System;
                global using global::System.Collections.Generic;
                global using global::System.IO;
                global using global::System.Linq;
                global using global::System.Net.Http;
                global using global::System.Threading;
                global using global::System.Threading.Tasks;
                """,
                parseOptions,
                "<TauImplicitUsings>.g.cs",
                Encoding.UTF8))
            .ToArray();
        // PicoGK.dll is dropped: its types come from these trees, and keeping both
        // would make every PicoGK name ambiguous.
        var references = CompilationService
            .CreateReferences(AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string)
            .Where(reference => !string.Equals(Path.GetFileName(reference.Display), "PicoGK.dll", StringComparison.Ordinal));
        var compilation = CSharpCompilation.Create(
            "TauPicoGkApiSurface",
            trees,
            references,
            new CSharpCompilationOptions(
                OutputKind.DynamicallyLinkedLibrary,
                optimizationLevel: OptimizationLevel.Release,
                deterministic: true,
                allowUnsafe: true,
                nullableContextOptions: NullableContextOptions.Enable));
        // Diagnostics are reported, not fatal: an unresolved corner of the upstream
        // tree must not cost the whole surface.
        diagnosticErrors = compilation.GetDiagnostics().Count(item => item.Severity == DiagnosticSeverity.Error);
        if (diagnosticErrors > 0)
        {
            Console.Error.WriteLine($"PicoGK source compiled with {diagnosticErrors} error diagnostic(s); symbols still emitted.");
        }
        return compilation;
    }

    private static IEnumerable<INamedTypeSymbol> Surface(CSharpCompilation compilation) =>
        NamespaceTypes(compilation.GlobalNamespace)
            .Where(IsExternallyVisible)
            .Where(InScope)
            .OrderBy(type => type.ToDisplayString(), StringComparer.Ordinal);

    private static IEnumerable<INamedTypeSymbol> NamespaceTypes(INamespaceSymbol space)
    {
        foreach (var type in space.GetTypeMembers())
        {
            yield return type;
        }
        foreach (var nested in space.GetNamespaceMembers())
        {
            foreach (var type in NamespaceTypes(nested))
            {
                yield return type;
            }
        }
    }

    private static bool InScope(INamedTypeSymbol type)
    {
        var space = type.ContainingNamespace.IsGlobalNamespace ? string.Empty : type.ContainingNamespace.ToDisplayString();
        if (AllowedNamespacePrefixes.Any(prefix =>
            string.Equals(space, prefix, StringComparison.Ordinal) || space.StartsWith($"{prefix}.", StringComparison.Ordinal)))
        {
            return true;
        }
        return AllowedTypes.Contains(space.Length == 0 ? type.MetadataName : $"{space}.{type.MetadataName}");
    }

    private static bool IsExternallyVisible(ISymbol symbol) =>
        Visibility(symbol) is not null
        && (symbol.ContainingType is null || IsExternallyVisible(symbol.ContainingType));

    private static string? Visibility(ISymbol symbol) => symbol.DeclaredAccessibility switch
    {
        Accessibility.Public => "public",
        Accessibility.Protected or Accessibility.ProtectedOrInternal => "protected",
        _ => null,
    };

    private static ApiEntryPayload TypeEntry(INamedTypeSymbol type, string sourceRoot)
    {
        var documentation = Documentation(type);
        var path = ContainerPath(type);
        var memberPath = path is null ? type.Name : $"{path}.{type.Name}";
        return new ApiEntryPayload(
            type.Name,
            TypeKindName(type),
            path,
            null,
            null,
            documentation.Docs,
            Deprecated(type),
            Visibility(type),
            type.IsStatic ? true : null,
            Source(type, sourceRoot),
            Members(type, memberPath, sourceRoot),
            LanguageSpecific(type, null));
    }

    private static string TypeKindName(INamedTypeSymbol type) => type.TypeKind switch
    {
        TypeKind.Interface => "interface",
        TypeKind.Struct => "struct",
        TypeKind.Enum => "enum",
        TypeKind.Class when type.IsRecord => "class",
        TypeKind.Class => "class",
        _ => "type",
    };

    private static string? ContainerPath(INamedTypeSymbol type)
    {
        if (type.ContainingType is not null)
        {
            var outer = ContainerPath(type.ContainingType);
            return outer is null ? type.ContainingType.Name : $"{outer}.{type.ContainingType.Name}";
        }
        return type.ContainingNamespace.IsGlobalNamespace ? null : type.ContainingNamespace.ToDisplayString();
    }

    private static IReadOnlyList<ApiEntryPayload>? Members(INamedTypeSymbol type, string path, string sourceRoot)
    {
        var members = new List<ApiEntryPayload>();
        // Declaration order is kept: for an enum it is the meaningful order, and for
        // everything else it is the order the upstream author chose.
        var methods = new List<(string Name, string Kind, List<IMethodSymbol> Overloads)>();
        foreach (var member in type.GetMembers())
        {
            if (member.IsImplicitlyDeclared || !IsExternallyVisible(member))
            {
                continue;
            }
            switch (member)
            {
                case INamedTypeSymbol nested:
                    members.Add(TypeEntry(nested, sourceRoot));
                    break;
                case IMethodSymbol method when MethodKindName(method) is { } kind:
                {
                    var name = method.MethodKind == MethodKind.Constructor ? type.Name : method.Name;
                    var group = methods.Find(item => item.Name == name && item.Kind == kind);
                    if (group.Overloads is null)
                    {
                        methods.Add((name, kind, [method]));
                    }
                    else
                    {
                        group.Overloads.Add(method);
                    }
                    break;
                }
                case IPropertySymbol property:
                    members.Add(PropertyEntry(property, path, sourceRoot));
                    break;
                case IFieldSymbol field:
                    members.Add(FieldEntry(field, path, sourceRoot));
                    break;
                default:
                    break;
            }
        }
        members.AddRange(methods.Select(group => MethodEntry(group.Name, group.Kind, group.Overloads, path, sourceRoot)));
        return members.Count == 0 ? null : members;
    }

    private static string? MethodKindName(IMethodSymbol method) => method.MethodKind switch
    {
        MethodKind.Constructor => "constructor",
        MethodKind.Ordinary or MethodKind.UserDefinedOperator or MethodKind.Conversion => "method",
        _ => null,
    };

    private static ApiEntryPayload MethodEntry(
        string name,
        string kind,
        IReadOnlyList<IMethodSymbol> overloads,
        string path,
        string sourceRoot)
    {
        var first = overloads[0];
        var documentation = Documentation(first);
        var refKinds = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var parameter in overloads.SelectMany(overload => overload.Parameters))
        {
            var refKind = parameter.RefKind switch
            {
                RefKind.Ref => "ref",
                RefKind.Out => "out",
                RefKind.In or RefKind.RefReadOnlyParameter => "in",
                _ => null,
            };
            if (refKind is not null)
            {
                refKinds[parameter.Name] = refKind;
            }
        }
        return new ApiEntryPayload(
            name,
            kind,
            path,
            overloads.Select(Signature).ToArray(),
            null,
            documentation.Docs,
            Deprecated(first),
            Visibility(first),
            first.IsStatic ? true : null,
            Source(first, sourceRoot),
            null,
            LanguageSpecific(first, refKinds.Count == 0 ? null : refKinds));
    }

    private static ApiSignaturePayload Signature(IMethodSymbol method)
    {
        var documentation = Documentation(method);
        var parameters = method.Parameters
            .Select(parameter => new ApiParameterPayload(
                parameter.Name,
                new ApiTypeRefPayload(parameter.Type.ToDisplayString(TypeFormat)),
                parameter.IsOptional,
                DefaultValue(parameter),
                parameter.IsParams ? true : null,
                documentation.Parameters.GetValueOrDefault(parameter.Name)))
            .ToArray();
        var typeParameters = method.TypeParameters.Select(parameter => parameter.Name).ToArray();
        // Each overload keeps its own prose. The entry carries the first overload's
        // documentation, so without this the other N-1 summaries would be dropped.
        var description = (documentation.Docs?.Summary, documentation.Returns) switch
        {
            (null, var returns) => returns,
            ({ } summary, null) => summary,
            ({ } summary, { } returns) => $"{summary} Returns: {returns}",
        };
        return new ApiSignaturePayload(
            parameters,
            method.MethodKind == MethodKind.Constructor ? null : new ApiTypeRefPayload(method.ReturnType.ToDisplayString(TypeFormat)),
            method.ToDisplayString(SignatureFormat),
            typeParameters.Length == 0 ? null : typeParameters,
            description);
    }

    /// <summary>The default as the author wrote it, never a formatted constant.</summary>
    private static string? DefaultValue(IParameterSymbol parameter)
    {
        if (!parameter.HasExplicitDefaultValue)
        {
            return null;
        }
        foreach (var reference in parameter.DeclaringSyntaxReferences)
        {
            if (reference.GetSyntax() is ParameterSyntax { Default.Value: { } value })
            {
                return value.ToString();
            }
        }
        // Metadata symbols have no syntax; an enum default then reads as its
        // underlying constant rather than the member name.
        return SymbolDisplay.FormatPrimitive(parameter.ExplicitDefaultValue!, quoteStrings: true, useHexadecimalNumbers: false)
            ?? "default";
    }

    private static ApiEntryPayload PropertyEntry(IPropertySymbol property, string path, string sourceRoot)
    {
        var documentation = Documentation(property);
        return new ApiEntryPayload(
            property.IsIndexer ? "this[]" : property.Name,
            "property",
            path,
            null,
            new ApiTypeRefPayload(property.Type.ToDisplayString(TypeFormat)),
            documentation.Docs,
            Deprecated(property),
            Visibility(property),
            property.IsStatic ? true : null,
            Source(property, sourceRoot),
            null,
            LanguageSpecific(property, null));
    }

    private static ApiEntryPayload FieldEntry(IFieldSymbol field, string path, string sourceRoot)
    {
        var documentation = Documentation(field);
        var kind = field.ContainingType.TypeKind == TypeKind.Enum ? "enumMember" : field.IsConst ? "constant" : "field";
        return new ApiEntryPayload(
            field.Name,
            kind,
            path,
            null,
            new ApiTypeRefPayload(kind == "enumMember"
                ? field.ToDisplayString(DeclarationFormat)
                : field.Type.ToDisplayString(TypeFormat)),
            documentation.Docs,
            Deprecated(field),
            Visibility(field),
            field.IsStatic ? true : null,
            Source(field, sourceRoot),
            null,
            LanguageSpecific(field, null));
    }

    private static ApiLanguageSpecificPayload LanguageSpecific(ISymbol symbol, IReadOnlyDictionary<string, string>? refKinds)
    {
        var documentationId = symbol.GetDocumentationCommentId();
        return new ApiLanguageSpecificPayload("csharp", refKinds, string.IsNullOrEmpty(documentationId) ? null : documentationId);
    }

    private static object? Deprecated(ISymbol symbol)
    {
        foreach (var attribute in symbol.GetAttributes())
        {
            if (attribute.AttributeClass?.Name is not "ObsoleteAttribute")
            {
                continue;
            }
            return attribute.ConstructorArguments.Length > 0 && attribute.ConstructorArguments[0].Value is string message
                ? message
                : true;
        }
        return null;
    }

    private static ApiSourcePayload? Source(ISymbol symbol, string sourceRoot)
    {
        foreach (var reference in symbol.DeclaringSyntaxReferences)
        {
            var path = reference.SyntaxTree.FilePath;
            if (string.IsNullOrEmpty(path))
            {
                continue;
            }
            var line = reference.SyntaxTree.GetLineSpan(reference.Span).StartLinePosition.Line + 1;
            return new ApiSourcePayload(Path.GetRelativePath(sourceRoot, path).Replace('\\', '/'), line);
        }
        return null;
    }

    private static (ApiDocsPayload? Docs, IReadOnlyDictionary<string, string> Parameters, string? Returns) Documentation(ISymbol symbol)
    {
        var empty = (ApiDocsPayload?)null;
        var noParameters = (IReadOnlyDictionary<string, string>)new Dictionary<string, string>(StringComparer.Ordinal);
        var xml = symbol.GetDocumentationCommentXml();
        if (string.IsNullOrWhiteSpace(xml))
        {
            return (empty, noParameters, null);
        }
        XElement member;
        try
        {
            member = XElement.Parse(xml, LoadOptions.PreserveWhitespace);
        }
        catch (System.Xml.XmlException)
        {
            return (empty, noParameters, null);
        }
        var parameters = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var element in member.Elements("param"))
        {
            var name = element.Attribute("name")?.Value;
            var text = Prose(element);
            if (!string.IsNullOrEmpty(name) && text is not null)
            {
                parameters[name] = text;
            }
        }
        var examples = member.Elements("example")
            .Select(element => new ApiExamplePayload(
                Prose(new XElement("caption", element.Nodes().Where(node => node is not XElement { Name.LocalName: "code" }))),
                (element.Element("code")?.Value ?? element.Value).Trim('\n', '\r', ' ')))
            .Where(example => example.Code.Length > 0)
            .ToArray();
        var throws = member.Elements("exception")
            .Select(element => Join(ShortCref(element.Attribute("cref")?.Value), Prose(element)))
            .OfType<string>()
            .ToArray();
        var seeAlso = member.Elements("seealso")
            .Select(element => ShortCref(element.Attribute("cref")?.Value))
            .OfType<string>()
            .ToArray();
        var summary = Prose(member.Element("summary"));
        var remarks = Prose(member.Element("remarks"));
        var docs = summary is null && remarks is null && examples.Length == 0 && throws.Length == 0 && seeAlso.Length == 0
            ? null
            : new ApiDocsPayload(
                summary,
                remarks,
                examples.Length == 0 ? null : examples,
                throws.Length == 0 ? null : throws,
                seeAlso.Length == 0 ? null : seeAlso);
        return (docs, parameters, Prose(member.Element("returns")));
    }

    private static string? Join(string? cref, string? text) => (cref, text) switch
    {
        (null, null) => null,
        (null, { } only) => only,
        ({ } only, null) => only,
        ({ } left, { } right) => $"{left}: {right}",
    };

    /// <summary>Documentation prose as one normalized line, with crefs kept as names.</summary>
    private static string? Prose(XElement? element)
    {
        if (element is null)
        {
            return null;
        }
        var builder = new StringBuilder();
        Render(element, builder);
        var text = string.Join(' ', builder.ToString().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return text.Length == 0 ? null : text;
    }

    private static void Render(XElement element, StringBuilder builder)
    {
        foreach (var node in element.Nodes())
        {
            switch (node)
            {
                case XText text:
                    builder.Append(text.Value);
                    break;
                case XElement child when child.Name.LocalName is "see" or "seealso":
                    builder.Append(' ').Append(ShortCref(child.Attribute("cref")?.Value) ?? child.Value).Append(' ');
                    break;
                case XElement child when child.Name.LocalName is "paramref" or "typeparamref":
                    builder.Append(' ').Append(child.Attribute("name")?.Value ?? child.Value).Append(' ');
                    break;
                case XElement child:
                    Render(child, builder);
                    break;
                default:
                    break;
            }
        }
    }

    /// <summary>`T:PicoGK.Voxels` becomes `PicoGK.Voxels`.</summary>
    private static string? ShortCref(string? cref) =>
        cref is null || cref.Length < 3 || cref[1] != ':' ? cref : cref[2..];
}
