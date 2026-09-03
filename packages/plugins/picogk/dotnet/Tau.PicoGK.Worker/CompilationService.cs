using System.Buffers.Binary;
using System.Collections.Immutable;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Tau.PicoGK;

namespace Tau.PicoGK.Worker;

internal sealed record ParameterDefinition(
    string Name,
    ITypeSymbol Type,
    object Value,
    double? Minimum,
    double? Maximum,
    string? Title,
    string? Description,
    int? Order,
    IReadOnlyList<string>? EnumValues);

internal sealed record ModelContract(
    INamedTypeSymbol ParamsType,
    IMethodSymbol BuildMethod,
    IReadOnlyList<ParameterDefinition> Parameters);

internal sealed record CompiledModel(
    byte[] Assembly,
    byte[] Pdb,
    ModelContract Contract,
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
    private const int MaximumSourceFiles = 256;
    private const int MaximumSourceBytes = 8 * 1024 * 1024;
    private const int MaximumSingleSourceBytes = 1024 * 1024;
    private const int MaximumSyntaxDepth = 512;
    private const int MaximumDiagnostics = 256;
    private static readonly object CacheLock = new();
    private static readonly ImmutableArray<MetadataReference> References = CreateReferences(
        AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") as string);
    private static (string Key, CompiledModel Model)? cachedCompilation;

    internal static CompiledModel Compile(string workspace)
    {
        var sourceRead = Stopwatch.StartNew();
        var paths = Directory.GetFiles(workspace, "*.cs", SearchOption.AllDirectories)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (paths.Length == 0)
        {
            throw ContractError("The PicoGK project contains no C# source files.");
        }
        if (paths.Length > MaximumSourceFiles)
        {
            throw ContractError($"The PicoGK project exceeds {MaximumSourceFiles} C# source files.");
        }
        var totalBytes = 0L;
        using var digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var sources = paths.Select(path =>
        {
            var fileBytes = new FileInfo(path).Length;
            totalBytes = checked(totalBytes + fileBytes);
            if (fileBytes > MaximumSingleSourceBytes || totalBytes > MaximumSourceBytes)
            {
                throw ContractError("The PicoGK project exceeds its C# source byte limit.");
            }
            var relativePath = Path.GetRelativePath(workspace, path).Replace('\\', '/');
            var content = File.ReadAllBytes(path);
            var relativePathBytes = Encoding.UTF8.GetBytes(relativePath);
            Span<byte> length = stackalloc byte[sizeof(int)];
            BinaryPrimitives.WriteInt32LittleEndian(length, relativePathBytes.Length);
            digest.AppendData(length);
            digest.AppendData(relativePathBytes);
            BinaryPrimitives.WriteInt32LittleEndian(length, content.Length);
            digest.AppendData(length);
            digest.AppendData(content);
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
        var trees = sources.Select(source =>
        {
            var tree = CSharpSyntaxTree.ParseText(
                Encoding.UTF8.GetString(source.content),
                new CSharpParseOptions(LanguageVersion.Latest),
                source.relativePath,
                Encoding.UTF8);
            if (tree.GetRoot().DescendantNodes(descendIntoTrivia: true).Max(node => node.Ancestors().Count()) > MaximumSyntaxDepth)
            {
                throw ContractError($"C# syntax exceeds the maximum depth of {MaximumSyntaxDepth}.", tree.GetRoot());
            }
            return tree;
        }).ToArray();
        parse.Stop();
        var analyze = Stopwatch.StartNew();
        var compilation = CSharpCompilation.Create(
            "TauUserModel",
            trees,
            References,
            new CSharpCompilationOptions(
                OutputKind.DynamicallyLinkedLibrary,
                optimizationLevel: OptimizationLevel.Release,
                deterministic: true,
                allowUnsafe: false));
        ThrowDiagnostics(compilation.GetDiagnostics());
        var contract = AnalyzeContract(compilation);
        var defaults = contract.Parameters.ToDictionary(parameter => parameter.Name, parameter => JsonValue(parameter), StringComparer.Ordinal);
        var properties = contract.Parameters
            .OrderBy(parameter => parameter.Order ?? int.MaxValue)
            .ThenBy(parameter => parameter.Name, StringComparer.Ordinal)
            .ToDictionary(parameter => parameter.Name, JsonSchemaFor, StringComparer.Ordinal);
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
            contract,
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

    private static ModelContract AnalyzeContract(CSharpCompilation compilation)
    {
        var parameterDeclarations = compilation.SyntaxTrees
            .SelectMany(tree => tree.GetRoot().DescendantNodes().OfType<RecordDeclarationSyntax>())
            .Where(declaration => declaration.Identifier.ValueText == "Params" && declaration.Parent is CompilationUnitSyntax)
            .ToArray();
        if (parameterDeclarations.Length != 1)
        {
            throw ContractError("Define exactly one top-level public sealed non-positional record named Params.");
        }
        var declaration = parameterDeclarations[0];
        var model = compilation.GetSemanticModel(declaration.SyntaxTree);
        var parameterType = model.GetDeclaredSymbol(declaration)!;
        if (!parameterType.IsRecord || !parameterType.IsSealed || parameterType.DeclaredAccessibility != Accessibility.Public || declaration.ParameterList is not null)
        {
            throw ContractError("Params must be a top-level public sealed non-positional record.", declaration);
        }
        if (!parameterType.InstanceConstructors.Any(constructor => constructor.Parameters.Length == 0 && constructor.DeclaredAccessibility == Accessibility.Public))
        {
            throw ContractError("Params must expose a public parameterless constructor.", declaration);
        }

        var properties = parameterType.GetMembers().OfType<IPropertySymbol>()
            .Where(property => !property.IsStatic && property.DeclaringSyntaxReferences.Length > 0)
            .ToArray();
        var definitions = properties.Select(property => AnalyzeParameter(property, compilation)).ToArray();
        var voxel = definitions.SingleOrDefault(parameter => parameter.Name == "VoxelSizeMm");
        if (voxel is null || voxel.Type.SpecialType != SpecialType.System_Single || Convert.ToSingle(voxel.Value) <= 0 || !float.IsFinite(Convert.ToSingle(voxel.Value)))
        {
            throw ContractError("Params must define a positive finite float VoxelSizeMm default.", declaration);
        }

        var modelTypes = compilation.SyntaxTrees
            .SelectMany(tree => tree.GetRoot().DescendantNodes().OfType<ClassDeclarationSyntax>())
            .Where(type => type.Identifier.ValueText == "Model" && type.Parent is CompilationUnitSyntax)
            .Select(type => compilation.GetSemanticModel(type.SyntaxTree).GetDeclaredSymbol(type))
            .OfType<INamedTypeSymbol>()
            .ToArray();
        if (modelTypes.Length != 1 || !modelTypes[0].IsStatic || modelTypes[0].DeclaredAccessibility != Accessibility.Public)
        {
            throw ContractError("Define exactly one top-level public static class Model.");
        }
        var authoringModel = compilation.GetTypeByMetadataName(typeof(TauModel).FullName!);
        var methods = modelTypes[0].GetMembers("Build").OfType<IMethodSymbol>()
            .Where(method => method.DeclaredAccessibility == Accessibility.Public)
            .Where(method => method.Parameters.Length == 1 && SymbolEqualityComparer.Default.Equals(method.Parameters[0].Type, parameterType))
            .Where(method => SymbolEqualityComparer.Default.Equals(method.ReturnType, authoringModel))
            .ToArray();
        if (methods.Length != 1)
        {
            throw ContractError("Model must define exactly one public static TauModel Build(Params) method.");
        }
        return new ModelContract(parameterType, methods[0], definitions);
    }

    private static ParameterDefinition AnalyzeParameter(IPropertySymbol property, CSharpCompilation compilation)
    {
        var declaration = (PropertyDeclarationSyntax)property.DeclaringSyntaxReferences[0].GetSyntax();
        if (property.DeclaredAccessibility != Accessibility.Public || property.SetMethod?.IsInitOnly != true || declaration.Initializer is null)
        {
            throw ContractError($"Parameter '{property.Name}' must be a public init property with a compile-time default.", declaration);
        }
        var allowed = property.Type.SpecialType is SpecialType.System_Boolean or SpecialType.System_Int32 or SpecialType.System_Single or SpecialType.System_Double or SpecialType.System_String;
        var projectEnum = property.Type.TypeKind == TypeKind.Enum && SymbolEqualityComparer.Default.Equals(property.Type.ContainingAssembly, compilation.Assembly);
        if (!allowed && !projectEnum)
        {
            throw ContractError($"Parameter '{property.Name}' uses unsupported type '{property.Type.ToDisplayString()}'.", declaration.Type);
        }
        var constant = compilation.GetSemanticModel(declaration.SyntaxTree).GetConstantValue(declaration.Initializer.Value);
        if (!constant.HasValue || constant.Value is null)
        {
            throw ContractError($"Parameter '{property.Name}' requires a non-null compile-time constant default.", declaration.Initializer);
        }

        double? minimum = null;
        double? maximum = null;
        string? title = null;
        string? description = null;
        int? order = null;
        foreach (var attribute in property.GetAttributes())
        {
            if (attribute.AttributeClass!.ToDisplayString() == typeof(RangeAttribute).FullName && attribute.ConstructorArguments.Length == 2)
            {
                if (property.Type.SpecialType is not (SpecialType.System_Int32 or SpecialType.System_Single or SpecialType.System_Double))
                {
                    throw ContractError($"Range on '{property.Name}' requires a numeric parameter.", declaration);
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
        var value = constant.Value;
        var numeric = property.Type.SpecialType is SpecialType.System_Int32 or SpecialType.System_Single or SpecialType.System_Double;
        if (minimum is not null && maximum is not null &&
            (!double.IsFinite(minimum.Value) || !double.IsFinite(maximum.Value) || minimum > maximum))
        {
            throw ContractError($"Range on '{property.Name}' is invalid.", declaration);
        }
        if (numeric && (!double.IsFinite(Convert.ToDouble(value)) ||
            minimum is not null && Convert.ToDouble(value) < minimum ||
            maximum is not null && Convert.ToDouble(value) > maximum))
        {
            throw ContractError($"Default for '{property.Name}' violates its numeric range.", declaration.Initializer);
        }
        var enumValues = projectEnum
            ? ((INamedTypeSymbol)property.Type).GetMembers().OfType<IFieldSymbol>().Where(field => field.HasConstantValue).Select(field => field.Name).ToArray()
            : null;
        return new ParameterDefinition(property.Name, property.Type, value, minimum, maximum, title, description, order, enumValues);
    }

    private static object? JsonValue(ParameterDefinition parameter)
    {
        if (parameter.EnumValues is null)
        {
            return parameter.Value;
        }
        return ((INamedTypeSymbol)parameter.Type).GetMembers().OfType<IFieldSymbol>()
            .Single(field => Equals(field.ConstantValue, parameter.Value)).Name;
    }

    private static object JsonSchemaFor(ParameterDefinition parameter)
    {
        var schema = new Dictionary<string, object?>
        {
            ["type"] = parameter.EnumValues is null ? parameter.Type.SpecialType switch
            {
                SpecialType.System_Boolean => "boolean",
                SpecialType.System_Int32 => "integer",
                SpecialType.System_Single or SpecialType.System_Double => "number",
                _ => "string",
            } : "string",
            ["default"] = JsonValue(parameter),
        };
        if (parameter.Minimum is not null) schema["minimum"] = parameter.Minimum;
        if (parameter.Maximum is not null) schema["maximum"] = parameter.Maximum;
        if (parameter.Title is not null) schema["title"] = parameter.Title;
        if (parameter.Description is not null) schema["description"] = parameter.Description;
        if (parameter.EnumValues is not null) schema["enum"] = parameter.EnumValues;
        return schema;
    }

    internal static ImmutableArray<MetadataReference> CreateReferences(string? trusted)
    {
        if (trusted is null) throw new InvalidOperationException("CoreCLR did not expose trusted platform assemblies.");
        return trusted.Split(Path.PathSeparator)
            .Append(typeof(global::PicoGK.Library).Assembly.Location)
            .Append(typeof(TauModel).Assembly.Location)
            .Distinct(StringComparer.Ordinal)
            .Select(path => (MetadataReference)MetadataReference.CreateFromFile(path))
            .ToImmutableArray();
    }

    private static void ThrowDiagnostics(IEnumerable<Diagnostic> diagnostics)
    {
        var issues = diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
            .Take(MaximumDiagnostics + 1)
            .Select(ToIssue)
            .ToArray();
        if (issues.Length > MaximumDiagnostics)
        {
            throw ContractError($"C# diagnostics exceed the maximum count of {MaximumDiagnostics}.");
        }
        if (issues.Length > 0) throw new WorkerException(issues);
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

    private static WorkerException ContractError(string message, SyntaxNode? node = null)
    {
        Location? location = null;
        if (node is not null)
        {
            var span = node.GetLocation().GetLineSpan();
            location = new Location(span.Path, span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1);
        }
        return new WorkerException(new Issue(message, "CS_TAU_CONTRACT", "validation", "error", location));
    }
}
