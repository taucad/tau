using System.Text;
using Microsoft.CodeAnalysis;

namespace Tau.CSharp.LanguageService;

/// <summary>Generated declaration text for one metadata type, with the position of every declared member.</summary>
internal sealed record DeclarationSource(string Uri, string Text, IReadOnlyDictionary<string, Position> Positions);

/// <summary>
/// Declaration-only C# for referenced assemblies: the TypeScript <c>.d.ts</c> model. Library definitions open as
/// read-only declarations with their XML documentation, never as decompiled implementation.
/// </summary>
internal static class MetadataAsSource
{
    internal const string Prefix = "file:///__csharp_metadata__/";

    private static readonly SymbolDisplayFormat MemberFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters |
            SymbolDisplayGenericsOptions.IncludeTypeConstraints |
            SymbolDisplayGenericsOptions.IncludeVariance,
        memberOptions: SymbolDisplayMemberOptions.IncludeAccessibility |
            SymbolDisplayMemberOptions.IncludeModifiers |
            SymbolDisplayMemberOptions.IncludeType |
            SymbolDisplayMemberOptions.IncludeParameters |
            SymbolDisplayMemberOptions.IncludeConstantValue |
            SymbolDisplayMemberOptions.IncludeRef |
            SymbolDisplayMemberOptions.IncludeExplicitInterface,
        delegateStyle: SymbolDisplayDelegateStyle.NameAndSignature,
        extensionMethodStyle: SymbolDisplayExtensionMethodStyle.StaticMethod,
        parameterOptions: SymbolDisplayParameterOptions.IncludeExtensionThis |
            SymbolDisplayParameterOptions.IncludeModifiers |
            SymbolDisplayParameterOptions.IncludeType |
            SymbolDisplayParameterOptions.IncludeName |
            SymbolDisplayParameterOptions.IncludeDefaultValue,
        propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor,
        kindOptions: SymbolDisplayKindOptions.IncludeMemberKeyword,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes |
            SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers |
            SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier |
            SymbolDisplayMiscellaneousOptions.AllowDefaultLiteral);

    private static readonly SymbolDisplayFormat TypeNameFormat = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes |
            SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers |
            SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);

    private static readonly SymbolDisplayFormat DeclaredTypeFormat = new(
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters | SymbolDisplayGenericsOptions.IncludeVariance,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers);

    /// <summary>The key members are located by: their documentation ID, which is stable across compilations.</summary>
    internal static string? KeyOf(ISymbol symbol)
    {
        symbol = symbol.OriginalDefinition;
        if (symbol is IMethodSymbol { ReducedFrom: { } reduced })
        {
            symbol = reduced;
        }
        if (symbol is IMethodSymbol { AssociatedSymbol: { } associated })
        {
            symbol = associated;
        }
        while (symbol is IParameterSymbol or ITypeParameterSymbol or ILocalSymbol)
        {
            symbol = symbol.ContainingSymbol;
        }
        return symbol.GetDocumentationCommentId();
    }

    internal static INamedTypeSymbol? TopLevelType(ISymbol symbol)
    {
        var type = symbol as INamedTypeSymbol ?? symbol.ContainingType;
        while (type?.ContainingType is { } outer)
        {
            type = outer;
        }
        return type?.OriginalDefinition;
    }

    internal static string UriFor(INamedTypeSymbol type) =>
        $"{Prefix}{Uri.EscapeDataString(type.ContainingAssembly.Name)}/{Uri.EscapeDataString(MetadataName(type))}.cs";

    /// <summary>Parse a declaration URI back to its assembly and full metadata name.</summary>
    internal static (string Assembly, string MetadataName)? ParseUri(string uri)
    {
        if (!uri.StartsWith(Prefix, StringComparison.Ordinal) || !uri.EndsWith(".cs", StringComparison.Ordinal))
        {
            return null;
        }
        var parts = uri[Prefix.Length..^3].Split('/');
        return parts.Length == 2 ? (Uri.UnescapeDataString(parts[0]), Uri.UnescapeDataString(parts[1])) : null;
    }

    private static string MetadataName(INamedTypeSymbol type) =>
        type.ContainingNamespace is { IsGlobalNamespace: false } ns
            ? $"{ns.ToDisplayString()}.{type.MetadataName}"
            : type.MetadataName;

    internal static DeclarationSource Generate(INamedTypeSymbol type)
    {
        var writer = new Writer();
        var assembly = type.ContainingAssembly.Identity;
        writer.Line($"// {assembly.Name}, Version={assembly.Version}");
        writer.Line("// Declarations generated from metadata. Implementation is not shown.");
        writer.Line("");
        var hasNamespace = type.ContainingNamespace is { IsGlobalNamespace: false };
        if (hasNamespace)
        {
            writer.Line($"namespace {type.ContainingNamespace.ToDisplayString()}");
            writer.Line("{");
            writer.Indent++;
        }
        WriteType(writer, type);
        if (hasNamespace)
        {
            writer.Indent--;
            writer.Line("}");
        }
        return new DeclarationSource(UriFor(type), writer.Text, writer.Positions);
    }

    private static void WriteType(Writer writer, INamedTypeSymbol type)
    {
        WriteDocumentation(writer, type);
        foreach (var attribute in type.GetAttributes().Where(IsShownAttribute))
        {
            writer.Line($"[{attribute.AttributeClass!.ToDisplayString(TypeNameFormat).Replace("Attribute", "", StringComparison.Ordinal)}]");
        }
        if (type.TypeKind == TypeKind.Delegate && type.DelegateInvokeMethod is { } invoke)
        {
            var parameters = string.Join(", ", invoke.Parameters.Select(parameter => parameter.ToDisplayString(MemberFormat)));
            writer.Declare(
                type,
                $"{Accessibility(type)} delegate {invoke.ReturnType.ToDisplayString(TypeNameFormat)} {type.ToDisplayString(DeclaredTypeFormat)}({parameters});",
                type.Name);
            return;
        }
        var header = new StringBuilder(Accessibility(type));
        if (type.TypeKind == TypeKind.Class)
        {
            if (type.IsStatic)
            {
                header.Append(" static");
            }
            else if (type.IsAbstract)
            {
                header.Append(" abstract");
            }
            else if (type.IsSealed)
            {
                header.Append(" sealed");
            }
        }
        if (type.IsReadOnly && type.TypeKind == TypeKind.Struct)
        {
            header.Append(" readonly");
        }
        if (type.IsRefLikeType)
        {
            header.Append(" ref");
        }
        header.Append(type.TypeKind switch
        {
            TypeKind.Interface => " interface",
            TypeKind.Struct => type.IsRecord ? " record struct" : " struct",
            TypeKind.Enum => " enum",
            _ => type.IsRecord ? " record" : " class",
        });
        header.Append(' ').Append(type.ToDisplayString(DeclaredTypeFormat));
        var bases = new List<string>();
        if (type.TypeKind == TypeKind.Enum && type.EnumUnderlyingType is { SpecialType: not SpecialType.System_Int32 } underlying)
        {
            bases.Add(underlying.ToDisplayString(TypeNameFormat));
        }
        if (type.TypeKind == TypeKind.Class && type.BaseType is { SpecialType: not SpecialType.System_Object } baseType)
        {
            bases.Add(baseType.ToDisplayString(TypeNameFormat));
        }
        bases.AddRange(type.Interfaces.Select(item => item.ToDisplayString(TypeNameFormat)));
        if (bases.Count > 0)
        {
            header.Append(" : ").Append(string.Join(", ", bases));
        }
        writer.Declare(type, header.ToString(), type.Name);
        foreach (var constraint in Constraints(type.TypeParameters))
        {
            writer.Line($"    {constraint}");
        }
        writer.Line("{");
        writer.Indent++;
        var members = type.GetMembers().Where(member => IsShown(type, member)).ToArray();
        if (type.TypeKind == TypeKind.Enum)
        {
            foreach (var field in members.OfType<IFieldSymbol>())
            {
                WriteDocumentation(writer, field);
                writer.Declare(field, $"{field.Name} = {field.ConstantValue},", field.Name);
            }
        }
        else
        {
            foreach (var member in members.OrderBy(Rank).ThenBy(member => member.Name, StringComparer.Ordinal))
            {
                WriteDocumentation(writer, member);
                var display = member.ToDisplayString(MemberFormat);
                var name = member is IMethodSymbol { MethodKind: MethodKind.Constructor } ? type.Name : member.Name;
                writer.Declare(
                    member,
                    member is IPropertySymbol ? display : $"{display};",
                    member is IMethodSymbol { MethodKind: MethodKind.UserDefinedOperator or MethodKind.Conversion } ? "operator" : name);
            }
        }
        foreach (var nested in type.GetTypeMembers().Where(nested => IsVisible(nested)).OrderBy(nested => nested.Name, StringComparer.Ordinal))
        {
            writer.Line("");
            WriteType(writer, nested);
        }
        writer.Indent--;
        writer.Line("}");
    }

    private static IEnumerable<string> Constraints(IEnumerable<ITypeParameterSymbol> parameters)
    {
        foreach (var parameter in parameters)
        {
            var clauses = new List<string>();
            if (parameter.HasReferenceTypeConstraint)
            {
                clauses.Add("class");
            }
            if (parameter.HasUnmanagedTypeConstraint)
            {
                clauses.Add("unmanaged");
            }
            else if (parameter.HasValueTypeConstraint)
            {
                clauses.Add("struct");
            }
            if (parameter.HasNotNullConstraint)
            {
                clauses.Add("notnull");
            }
            clauses.AddRange(parameter.ConstraintTypes.Select(constraint => constraint.ToDisplayString(TypeNameFormat)));
            if (parameter.HasConstructorConstraint)
            {
                clauses.Add("new()");
            }
            if (clauses.Count > 0)
            {
                yield return $"where {parameter.Name} : {string.Join(", ", clauses)}";
            }
        }
    }

    private static int Rank(ISymbol member) => member switch
    {
        IFieldSymbol => 0,
        IMethodSymbol { MethodKind: MethodKind.Constructor } => 1,
        IPropertySymbol => 2,
        IEventSymbol => 3,
        IMethodSymbol { MethodKind: MethodKind.Ordinary } => 4,
        _ => 5,
    };

    private static bool IsShown(INamedTypeSymbol type, ISymbol member) =>
        !member.IsImplicitlyDeclared &&
        member is not INamedTypeSymbol &&
        member is not IMethodSymbol { MethodKind: MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove or MethodKind.StaticConstructor or MethodKind.Destructor } &&
        (type.TypeKind == TypeKind.Interface || IsVisible(member)) &&
        !(member is IMethodSymbol { MethodKind: MethodKind.Constructor, Parameters.Length: 0 } && type.TypeKind == TypeKind.Struct);

    private static bool IsVisible(ISymbol symbol) =>
        symbol.DeclaredAccessibility is Microsoft.CodeAnalysis.Accessibility.Public or
            Microsoft.CodeAnalysis.Accessibility.Protected or
            Microsoft.CodeAnalysis.Accessibility.ProtectedOrInternal;

    private static bool IsShownAttribute(AttributeData attribute) =>
        attribute.AttributeClass?.ToDisplayString() is "System.ObsoleteAttribute" or "System.FlagsAttribute";

    private static string Accessibility(ISymbol symbol) => symbol.DeclaredAccessibility switch
    {
        Microsoft.CodeAnalysis.Accessibility.Public => "public",
        Microsoft.CodeAnalysis.Accessibility.Protected => "protected",
        Microsoft.CodeAnalysis.Accessibility.ProtectedOrInternal => "protected internal",
        Microsoft.CodeAnalysis.Accessibility.Internal => "internal",
        _ => "private",
    };

    private static void WriteDocumentation(Writer writer, ISymbol symbol)
    {
        foreach (var line in DocumentationComments.TripleSlashLines(symbol))
        {
            writer.Line($"/// {line}");
        }
    }

    private sealed class Writer
    {
        private readonly StringBuilder text = new();
        private int line;

        internal int Indent { get; set; }

        internal Dictionary<string, Position> Positions { get; } = new(StringComparer.Ordinal);

        internal string Text => text.ToString();

        internal void Line(string value)
        {
            if (value.Length > 0)
            {
                text.Append(' ', Indent * 4);
            }
            text.Append(value).Append('\n');
            line++;
        }

        /// <summary>Write a declaration line and record where its name starts.</summary>
        internal void Declare(ISymbol symbol, string value, string name)
        {
            var column = FindName(value, name);
            if (KeyOf(symbol) is { } key)
            {
                Positions.TryAdd(key, new Position(line, Indent * 4 + column));
            }
            Line(value);
        }

        private static int FindName(string value, string name)
        {
            foreach (var suffix in (string[])["(", "<", " {", ";", " =", ",", " :", ""])
            {
                var index = value.IndexOf($"{name}{suffix}", StringComparison.Ordinal);
                if (index >= 0 && (index == 0 || !char.IsLetterOrDigit(value[index - 1]) && value[index - 1] != '_'))
                {
                    return index;
                }
            }
            return 0;
        }
    }
}
