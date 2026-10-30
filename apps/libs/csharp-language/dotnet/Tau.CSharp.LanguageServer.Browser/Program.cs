using System.Runtime.InteropServices.JavaScript;
using Tau.CSharp.LanguageService;

namespace Tau.CSharp.LanguageServer.Browser;

/// <summary>JavaScript entry points for the C# language worker. The worker serializes every call.</summary>
public static partial class Program
{
    private static CSharpLanguageServer? server;

    public static void Main()
    {
    }

    /// <summary>Create the server from the prepared reference bundle.</summary>
    [JSExport]
    public static void Initialize(byte[] referenceBundle)
    {
        server?.Dispose();
        server = new CSharpLanguageServer(ReferenceSet.FromBundle(referenceBundle));
    }

    /// <summary>Handle one JSON-RPC message; resolves to the response JSON, or null for a notification.</summary>
    [JSExport]
    public static Task<string?> Handle(string message) =>
        (server ?? throw new InvalidOperationException("The C# language server is not initialized.")).HandleAsync(message);

    /// <summary>Bind the first program once so the first user request does not pay interpreter warm-up.</summary>
    [JSExport]
    public static Task WarmUp() =>
        (server ?? throw new InvalidOperationException("The C# language server is not initialized.")).WarmUpAsync();
}
