using System.Buffers.Binary;
using System.Collections.Immutable;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Tau.PicoGK.Worker;

internal enum ParameterKind
{
    Boolean,
    Integer,
    Single,
    Double,
    String,
    Enum,
}

internal sealed record ParameterDefinition(
    string Name,
    ParameterKind Kind,
    object DefaultValue,
    double? Minimum,
    double? Maximum,
    string? Title,
    string? Description,
    int? Order,
    IReadOnlyList<string>? EnumValues);

internal sealed record CompiledModel(
    byte[] Assembly,
    byte[] Pdb,
    IReadOnlyList<ParameterDefinition> Parameters,
    IReadOnlyDictionary<string, object?> Defaults,
    IReadOnlyDictionary<string, object?> JsonSchema,
    CompilationTimings Timings);

internal sealed record CompilationTimings(
    bool CacheHit,
    double SourceRead,
    double Parse,
    double Analyze,
    double Emit);

internal static class CompilationService
{
    private const string CompilerContractVersion = "3";
    private const int MaximumSourceFiles = 256;
    private const int MaximumSourceBytes = 8 * 1024 * 1024;
    private const int MaximumSingleSourceBytes = 1024 * 1024;
    private const int MaximumSyntaxDepth = 512;
    private const int MaximumDiagnostics = 256;
    private static readonly object CacheLock = new();
    private static readonly ImmutableArray<MetadataReference> References = CreateReferences(
        AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string);
    private static readonly byte[] PicoGkAssemblyHash = SHA256.HashData(File.ReadAllBytes(typeof(global::PicoGK.Library).Assembly.Location));
    private static (string Key, CompiledModel Model)? cachedCompilation;

    internal static CompiledModel Compile(string workspace)
    {
        var sourceRead = Stopwatch.StartNew();
        var paths = Directory.GetFiles(workspace, "*.cs", SearchOption.AllDirectories)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (paths.Length == 0)
        {
            throw CompilationError("The PicoGK project contains no C# source files.");
        }
        if (paths.Length > MaximumSourceFiles)
        {
            throw CompilationError($"The PicoGK project exceeds {MaximumSourceFiles} C# source files.");
        }

        var totalBytes = 0L;
        using var digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        digest.AppendData(Encoding.UTF8.GetBytes(CompilerContractVersion));
        digest.AppendData(PicoGkAssemblyHash);
        var sources = paths.Select(path =>
        {
            var fileBytes = new FileInfo(path).Length;
            totalBytes = checked(totalBytes + fileBytes);
            if (fileBytes > MaximumSingleSourceBytes || totalBytes > MaximumSourceBytes)
            {
                throw CompilationError("The PicoGK project exceeds its C# source byte limit.");
            }
            var relativePath = Path.GetRelativePath(workspace, path).Replace('\\', '/');
            var content = File.ReadAllBytes(path);
            AppendDigest(digest, Encoding.UTF8.GetBytes(relativePath));
            AppendDigest(digest, content);
            return (relativePath, content);
        }).ToArray();
        var cacheKey = Convert.ToHexString(digest.GetHashAndReset());
        sourceRead.Stop();
        lock (CacheLock)
        {
            if (cachedCompilation is { } cached && cached.Key == cacheKey)
            {
                return cached.Model with
                {
                    Timings = new CompilationTimings(true, sourceRead.Elapsed.TotalMilliseconds, 0, 0, 0),
                };
            }
        }

        var parse = Stopwatch.StartNew();
        var trees = sources.Select(source => ParseSource(source.relativePath, source.content)).Prepend(ParseImplicitUsings()).ToArray();
        parse.Stop();

        var analyze = Stopwatch.StartNew();
        var compilation = CSharpCompilation.Create(
            "TauUserModel",
            trees,
            References,
            new CSharpCompilationOptions(
                OutputKind.ConsoleApplication,
                optimizationLevel: OptimizationLevel.Release,
                deterministic: true,
                allowUnsafe: false));
        ThrowDiagnostics(compilation.GetDiagnostics());
        var parameters = AnalyzeParameters(compilation)
            .OrderBy(parameter => parameter.Order ?? int.MaxValue)
            .ThenBy(parameter => parameter.Name, StringComparer.Ordinal)
            .ToArray();
        var defaults = parameters.ToDictionary(
            parameter => parameter.Name,
            parameter => (object?)parameter.DefaultValue,
            StringComparer.Ordinal);
        var properties = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var parameter in parameters)
        {
            properties.Add(parameter.Name, JsonSchemaFor(parameter));
        }
        analyze.Stop();

        var emit = Stopwatch.StartNew();
        using var assembly = new MemoryStream();
        using var pdb = new MemoryStream();
        var emitted = compilation.Emit(assembly, pdbStream: pdb);
        ThrowDiagnostics(emitted.Diagnostics);
        emit.Stop();

        var model = new CompiledModel(
            assembly.ToArray(),
            pdb.ToArray(),
            parameters,
            defaults,
            new Dictionary<string, object?>
            {
                ["type"] = "object",
                ["properties"] = properties,
                ["additionalProperties"] = false,
            },
            new CompilationTimings(
                false,
                sourceRead.Elapsed.TotalMilliseconds,
                parse.Elapsed.TotalMilliseconds,
                analyze.Elapsed.TotalMilliseconds,
                emit.Elapsed.TotalMilliseconds));
        lock (CacheLock)
        {
            cachedCompilation = (cacheKey, model);
        }
        return model;
    }

    internal static IReadOnlyDictionary<string, object?> BindParameters(CompiledModel compiled, JsonElement supplied)
    {
        if (supplied.ValueKind != JsonValueKind.Object)
        {
            throw ParameterError("PicoGK parameters must be an object.");
        }
        var definitions = compiled.Parameters.ToDictionary(parameter => parameter.Name, StringComparer.Ordinal);
        var values = compiled.Parameters.ToDictionary(
            parameter => parameter.Name,
            parameter => (object?)parameter.DefaultValue,
            StringComparer.Ordinal);
        foreach (var property in supplied.EnumerateObject())
        {
            if (!definitions.TryGetValue(property.Name, out var definition))
            {
                throw ParameterError($"Unknown PicoGK parameter '{property.Name}'.");
            }
            var value = ReadJsonValue(property.Value, definition);
            if (definition.Minimum is not null && Convert.ToDouble(value) < definition.Minimum ||
                definition.Maximum is not null && Convert.ToDouble(value) > definition.Maximum)
            {
                throw ParameterError($"PicoGK parameter '{property.Name}' is outside its Range.");
            }
            values[property.Name] = value;
        }
        return values;
    }

    private static IReadOnlyList<ParameterDefinition> AnalyzeParameters(CSharpCompilation compilation)
    {
        var parameterType = compilation.GetTypeByMetadataName("Params");
        if (parameterType is null || !parameterType.IsStatic || parameterType.DeclaredAccessibility != Accessibility.Public)
        {
            return [];
        }
        var constructor = parameterType.StaticConstructors.FirstOrDefault(value => !value.IsImplicitlyDeclared);
        if (constructor is not null)
        {
            throw ParameterError(
                "The PicoGK Params class cannot define an explicit static constructor.",
                constructor.DeclaringSyntaxReferences[0].GetSyntax());
        }
        return parameterType.GetMembers()
            .OfType<IPropertySymbol>()
            .Where(property => property.DeclaredAccessibility == Accessibility.Public)
            .Select(property => AnalyzeParameter(property, compilation))
            .ToArray();
    }

    private static ParameterDefinition AnalyzeParameter(IPropertySymbol property, CSharpCompilation compilation)
    {
        var declaration = (PropertyDeclarationSyntax)property.DeclaringSyntaxReferences[0].GetSyntax();
        var isAutoProperty = declaration.AccessorList?.Accessors.All(
            accessor => accessor.Body is null && accessor.ExpressionBody is null) == true;
        if (property.GetMethod?.DeclaredAccessibility != Accessibility.Public ||
            property.SetMethod?.DeclaredAccessibility != Accessibility.Public || !isAutoProperty)
        {
            throw ParameterError($"Parameter '{property.Name}' must be a public static readable and writable auto-property.", declaration);
        }
        if (declaration.Initializer is null)
        {
            throw ParameterError($"Parameter '{property.Name}' requires a non-null compile-time constant default.", declaration);
        }

        var projectEnum = property.Type.TypeKind == TypeKind.Enum &&
            SymbolEqualityComparer.Default.Equals(property.Type.ContainingAssembly, compilation.Assembly);
        var kind = property.Type.SpecialType switch
        {
            SpecialType.System_Boolean => ParameterKind.Boolean,
            SpecialType.System_Int32 => ParameterKind.Integer,
            SpecialType.System_Single => ParameterKind.Single,
            SpecialType.System_Double => ParameterKind.Double,
            SpecialType.System_String => ParameterKind.String,
            _ when projectEnum => ParameterKind.Enum,
            _ => (ParameterKind?)null,
        };
        if (kind is null)
        {
            throw ParameterError($"Parameter '{property.Name}' uses unsupported type '{property.Type.ToDisplayString()}'.", declaration.Type);
        }
        var constant = compilation.GetSemanticModel(declaration.SyntaxTree).GetConstantValue(declaration.Initializer.Value);
        if (!constant.HasValue || constant.Value is null)
        {
            throw ParameterError($"Parameter '{property.Name}' requires a non-null compile-time constant default.", declaration.Initializer);
        }

        double? minimum = null;
        double? maximum = null;
        string? title = null;
        string? description = null;
        int? order = null;
        foreach (var attribute in property.GetAttributes())
        {
            if (attribute.AttributeClass!.ToDisplayString() == typeof(RangeAttribute).FullName)
            {
                if (kind is not (ParameterKind.Integer or ParameterKind.Single or ParameterKind.Double))
                {
                    throw ParameterError($"Range on '{property.Name}' requires a numeric parameter.", declaration);
                }
                if (attribute.ConstructorArguments.Length != 2)
                {
                    throw ParameterError($"Range on '{property.Name}' is invalid.", declaration);
                }
                minimum = Convert.ToDouble(attribute.ConstructorArguments[0].Value);
                maximum = Convert.ToDouble(attribute.ConstructorArguments[1].Value);
            }
            if (attribute.AttributeClass!.ToDisplayString() == typeof(DisplayAttribute).FullName)
            {
                foreach (var argument in attribute.NamedArguments)
                {
                    title = argument.Key == nameof(DisplayAttribute.Name) ? argument.Value.Value as string : title;
                    description = argument.Key == nameof(DisplayAttribute.Description) ? argument.Value.Value as string : description;
                    order = argument.Key == nameof(DisplayAttribute.Order) && argument.Value.Value is int displayOrder
                        ? displayOrder
                        : order;
                }
            }
        }
        if (minimum is not null && maximum is not null &&
            (!double.IsFinite(minimum.Value) || !double.IsFinite(maximum.Value) || minimum > maximum))
        {
            throw ParameterError($"Range on '{property.Name}' is invalid.", declaration);
        }
        if (kind is ParameterKind.Integer or ParameterKind.Single or ParameterKind.Double)
        {
            var numericDefault = Convert.ToDouble(constant.Value);
            if (!double.IsFinite(numericDefault) || minimum is not null && numericDefault < minimum ||
                maximum is not null && numericDefault > maximum)
            {
                throw ParameterError($"Default for '{property.Name}' violates its numeric range.", declaration.Initializer);
            }
        }

        IReadOnlyList<string>? enumValues = null;
        object defaultValue = constant.Value;
        if (kind == ParameterKind.Enum)
        {
            var members = ((INamedTypeSymbol)property.Type).GetMembers()
                .OfType<IFieldSymbol>()
                .Where(field => field.HasConstantValue)
                .ToArray();
            enumValues = members.Select(field => field.Name).ToArray();
            var defaultMember = members.FirstOrDefault(field => Equals(field.ConstantValue, constant.Value));
            if (defaultMember is null)
            {
                throw ParameterError($"Default for '{property.Name}' must name a declared enum member.", declaration.Initializer);
            }
            defaultValue = defaultMember.Name;
        }
        return new ParameterDefinition(
            property.Name,
            kind.Value,
            defaultValue,
            minimum,
            maximum,
            title,
            description,
            order,
            enumValues);
    }

    private static IReadOnlyDictionary<string, object?> JsonSchemaFor(ParameterDefinition parameter)
    {
        var schema = new Dictionary<string, object?>
        {
            ["type"] = parameter.Kind switch
            {
                ParameterKind.Boolean => "boolean",
                ParameterKind.Integer => "integer",
                ParameterKind.Single or ParameterKind.Double => "number",
                _ => "string",
            },
            ["default"] = parameter.DefaultValue,
        };
        if (parameter.Minimum is not null) schema["minimum"] = parameter.Minimum;
        if (parameter.Maximum is not null) schema["maximum"] = parameter.Maximum;
        if (parameter.Title is not null) schema["title"] = parameter.Title;
        if (parameter.Description is not null) schema["description"] = parameter.Description;
        if (parameter.EnumValues is not null) schema["enum"] = parameter.EnumValues;
        return schema;
    }

    private static object ReadJsonValue(JsonElement value, ParameterDefinition definition)
    {
        if (definition.Kind == ParameterKind.Enum)
        {
            var name = value.ValueKind == JsonValueKind.String ? value.GetString() : null;
            if (name is null || !definition.EnumValues!.Contains(name, StringComparer.Ordinal))
            {
                throw ParameterError($"Invalid enum value for PicoGK parameter '{definition.Name}'.");
            }
            return name;
        }
        return definition.Kind switch
        {
            ParameterKind.Boolean when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean(),
            ParameterKind.Integer when value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var integer) => integer,
            ParameterKind.Single when value.ValueKind == JsonValueKind.Number && value.TryGetSingle(out var single) && float.IsFinite(single) => single,
            ParameterKind.Double when value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) => number,
            ParameterKind.String when value.ValueKind == JsonValueKind.String => value.GetString()!,
            _ => throw ParameterError($"Invalid value for PicoGK parameter '{definition.Name}'."),
        };
    }

    internal static ImmutableArray<MetadataReference> CreateReferences(string? trusted)
    {
        if (trusted is null)
        {
            throw new InvalidOperationException("CoreCLR did not expose trusted platform assemblies.");
        }
        return trusted.Split(Path.PathSeparator)
            .Append(typeof(global::PicoGK.Library).Assembly.Location)
            .Distinct(StringComparer.Ordinal)
            .Select(path => (MetadataReference)MetadataReference.CreateFromFile(path))
            .ToImmutableArray();
    }

    private static void AppendDigest(IncrementalHash digest, byte[] value)
    {
        Span<byte> length = stackalloc byte[sizeof(int)];
        BinaryPrimitives.WriteInt32LittleEndian(length, value.Length);
        digest.AppendData(length);
        digest.AppendData(value);
    }

    private static SyntaxTree ParseSource(string path, byte[] content)
    {
        var tree = CSharpSyntaxTree.ParseText(
            Encoding.UTF8.GetString(content),
            new CSharpParseOptions(LanguageVersion.Latest),
            path,
            Encoding.UTF8);
        var maximumDepth = tree.GetRoot().DescendantNodes(descendIntoTrivia: true)
            .Select(node => node.Ancestors().Count())
            .DefaultIfEmpty(0)
            .Max();
        if (maximumDepth > MaximumSyntaxDepth)
        {
            throw CompilationError($"C# syntax exceeds the maximum depth of {MaximumSyntaxDepth}.", tree.GetRoot());
        }
        return tree;
    }

    private static SyntaxTree ParseImplicitUsings() => CSharpSyntaxTree.ParseText(
        """
        global using global::System;
        global using global::System.Collections.Generic;
        global using global::System.IO;
        global using global::System.Linq;
        global using global::System.Net.Http;
        global using global::System.Threading;
        global using global::System.Threading.Tasks;
        """,
        new CSharpParseOptions(LanguageVersion.Latest),
        "<TauImplicitUsings>.g.cs",
        Encoding.UTF8);

    private static void ThrowDiagnostics(IEnumerable<Diagnostic> diagnostics)
    {
        var issues = diagnostics
            .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
            .Take(MaximumDiagnostics)
            .Select(ToIssue)
            .ToArray();
        if (issues.Length > 0)
        {
            throw new WorkerException(issues);
        }
    }

    private static Issue ToIssue(Diagnostic diagnostic)
    {
        Location? location = null;
        if (diagnostic.Location.IsInSource)
        {
            var span = diagnostic.Location.GetLineSpan();
            location = new Location(span.Path, span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1);
        }
        return new Issue(diagnostic.GetMessage(), diagnostic.Id, "syntax", "error", location);
    }

    private static WorkerException CompilationError(string message, SyntaxNode? node = null)
    {
        Location? location = null;
        if (node is not null)
        {
            var span = node.GetLocation().GetLineSpan();
            location = new Location(span.Path, span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1);
        }
        return new WorkerException(new Issue(message, "CS_TAU_COMPILATION", "validation", "error", location));
    }

    private static WorkerException ParameterError(string message, SyntaxNode? node = null)
    {
        Location? location = null;
        if (node is not null)
        {
            var span = node.GetLocation().GetLineSpan();
            location = new Location(span.Path, span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1);
        }
        return new WorkerException(new Issue(message, "CS_TAU_PARAMETERS", "validation", "error", location));
    }
}
