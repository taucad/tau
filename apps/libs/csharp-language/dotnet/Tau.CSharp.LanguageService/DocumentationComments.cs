using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;

namespace Tau.CSharp.LanguageService;

/// <summary>Plain-text sections of a symbol's XML documentation, for signature help and declarations.</summary>
internal sealed record DocumentationSections(string? Summary, IReadOnlyDictionary<string, string> Parameters, string? Returns);

internal static partial class DocumentationComments
{
    private static readonly DocumentationSections Empty = new(null, new Dictionary<string, string>(), null);

    internal static DocumentationSections Read(ISymbol symbol)
    {
        var xml = symbol.GetDocumentationCommentXml(expandIncludes: false);
        if (string.IsNullOrWhiteSpace(xml))
        {
            return Empty;
        }
        try
        {
            var root = XElement.Parse(xml, LoadOptions.PreserveWhitespace);
            var parameters = root.Elements("param")
                .Where(element => element.Attribute("name") is not null)
                .GroupBy(element => element.Attribute("name")!.Value, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => Flatten(group.First()), StringComparer.Ordinal);
            return new DocumentationSections(
                Text(root.Element("summary")),
                parameters,
                Text(root.Element("returns")));
        }
        catch (XmlException)
        {
            return Empty;
        }
    }

    /// <summary>The inner XML of a symbol's documentation as <c>///</c> lines, without the outer member element.</summary>
    internal static IEnumerable<string> TripleSlashLines(ISymbol symbol)
    {
        var xml = symbol.GetDocumentationCommentXml(expandIncludes: false);
        if (string.IsNullOrWhiteSpace(xml))
        {
            return [];
        }
        try
        {
            var root = XElement.Parse(xml);
            var lines = new List<string>();
            foreach (var element in root.Elements())
            {
                foreach (var line in element.ToString(SaveOptions.DisableFormatting).Split('\n'))
                {
                    var trimmed = line.Trim();
                    if (trimmed.Length > 0)
                    {
                        lines.Add(trimmed);
                    }
                }
            }
            return lines;
        }
        catch (XmlException)
        {
            return [];
        }
    }

    private static string? Text(XElement? element)
    {
        var text = element is null ? null : Flatten(element);
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    /// <summary>One top-level element of a symbol's documentation, such as <c>summary</c>.</summary>
    internal static XElement? Element(ISymbol symbol, string name)
    {
        var xml = symbol.GetDocumentationCommentXml(expandIncludes: false);
        if (string.IsNullOrWhiteSpace(xml))
        {
            return null;
        }
        try
        {
            return XElement.Parse(xml, LoadOptions.PreserveWhitespace).Element(name);
        }
        catch (XmlException)
        {
            return null;
        }
    }

    /// <summary>The documentation IDs that <c>see</c> and <c>seealso</c> elements reference, in document order.</summary>
    internal static IEnumerable<string> Crefs(XElement element) =>
        element.Descendants()
            .Where(reference => reference.Name.LocalName is "see" or "seealso")
            .Select(reference => reference.Attribute("cref")?.Value)
            .OfType<string>();

    /// <summary>
    /// Flatten documentation markup to Markdown-compatible text: <c>see</c> references become code spans, or
    /// definition links (<c>#tau-definition-N</c>, the editor's link scheme) where <paramref name="link"/> names a
    /// target index.
    /// </summary>
    internal static string Flatten(XElement element, Func<string, int?>? link = null)
    {
        var builder = new StringBuilder();
        foreach (var node in element.Nodes())
        {
            switch (node)
            {
                case XText text:
                    builder.Append(text.Value);
                    break;
                case XElement { Name.LocalName: "see" or "seealso" } reference:
                    var cref = reference.Attribute("cref")?.Value;
                    var target = cref ?? reference.Attribute("langword")?.Value ?? reference.Attribute("href")?.Value ?? "";
                    if (cref is not null && link?.Invoke(cref) is { } index)
                    {
                        builder.Append("[`").Append(ShortName(cref)).Append("`](#tau-definition-").Append(index).Append(')');
                    }
                    else
                    {
                        builder.Append('`').Append(ShortName(target)).Append('`');
                    }
                    break;
                case XElement { Name.LocalName: "paramref" or "typeparamref" } reference:
                    builder.Append('`').Append(reference.Attribute("name")?.Value).Append('`');
                    break;
                case XElement { Name.LocalName: "c" } code:
                    builder.Append('`').Append(code.Value).Append('`');
                    break;
                case XElement { Name.LocalName: "para" or "br" } paragraph:
                    builder.Append("\n\n").Append(Flatten(paragraph, link));
                    break;
                case XElement other:
                    builder.Append(Flatten(other, link));
                    break;
            }
        }
        return Normalize(builder.ToString());
    }

    private static string ShortName(string cref)
    {
        var name = cref.Length > 2 && cref[1] == ':' ? cref[2..] : cref;
        var parameters = name.IndexOf('(');
        if (parameters >= 0)
        {
            name = name[..parameters];
        }
        // Generic arity (List`1, Select``2) is metadata spelling, not a display name.
        name = GenericArity().Replace(name, "");
        var dot = name.LastIndexOf('.');
        var member = dot >= 0 ? name[(dot + 1)..] : name;
        var owner = dot >= 0 ? name[..dot] : "";
        var ownerDot = owner.LastIndexOf('.');
        return cref.StartsWith("T:", StringComparison.Ordinal) || owner.Length == 0
            ? member
            : $"{(ownerDot >= 0 ? owner[(ownerDot + 1)..] : owner)}.{member}";
    }

    private static string Normalize(string text)
    {
        var paragraphs = text.Replace("\r", "").Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(paragraph => string.Join(' ', paragraph.Split((char[])[' ', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries)))
            .Where(paragraph => paragraph.Length > 0);
        return string.Join("\n\n", paragraphs);
    }

    [GeneratedRegex("`+\\d+")]
    private static partial Regex GenericArity();
}
