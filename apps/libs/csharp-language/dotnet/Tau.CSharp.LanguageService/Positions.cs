using Microsoft.CodeAnalysis.Text;

namespace Tau.CSharp.LanguageService;

/// <summary>A JSON-RPC failure returned to the client as a response error.</summary>
internal sealed class LspException(int code, string message) : Exception(message)
{
    internal const int MethodNotFound = -32601;
    internal const int InvalidParams = -32602;
    internal const int InternalError = -32603;
    internal const int ServerNotInitialized = -32002;
    internal const int RequestFailed = -32803;

    internal int Code { get; } = code;
}

/// <summary>Conversions between LSP UTF-16 positions and Roslyn text offsets.</summary>
internal static class Positions
{
    internal static int ToOffset(SourceText text, Position position)
    {
        if (position.Line < 0 || position.Character < 0)
        {
            throw new LspException(LspException.InvalidParams, "Negative LSP position.");
        }
        if (position.Line >= text.Lines.Count)
        {
            return text.Length;
        }
        var line = text.Lines[position.Line];
        return Math.Min(line.Start + position.Character, line.End);
    }

    internal static TextSpan ToSpan(SourceText text, Range range)
    {
        var start = ToOffset(text, range.Start);
        var end = ToOffset(text, range.End);
        return end < start
            ? throw new LspException(LspException.InvalidParams, "LSP range ends before it starts.")
            : TextSpan.FromBounds(start, end);
    }

    internal static Position ToPosition(SourceText text, int offset)
    {
        var position = text.Lines.GetLinePosition(Math.Clamp(offset, 0, text.Length));
        return new Position(position.Line, position.Character);
    }

    internal static Range ToRange(SourceText text, TextSpan span) =>
        new(ToPosition(text, span.Start), ToPosition(text, span.End));

    internal static Range ToRange(LinePositionSpan span) =>
        new(new Position(span.Start.Line, span.Start.Character), new Position(span.End.Line, span.End.Character));
}
