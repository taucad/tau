using System.Composition;
using Microsoft.CodeAnalysis.Host;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Storage;

namespace Tau.CSharp.LanguageService.RoslynHost;

/// <summary>
/// Disables Roslyn's on-disk index cache. The default configuration's static constructor reads
/// <c>Process.GetCurrentProcess().MainModule</c>, which the browser runtime does not support, so every
/// find-references, rename and highlight request would fail with a <see cref="TypeInitializationException"/>.
/// Indices are rebuilt in memory instead, which is what an editor-scoped project needs.
/// </summary>
[ExportWorkspaceService(typeof(IPersistentStorageConfiguration), ServiceLayer.Test), Shared]
public sealed class BrowserPersistentStorageConfiguration : IPersistentStorageConfiguration
{
    [ImportingConstructor]
    public BrowserPersistentStorageConfiguration()
    {
    }

    public bool ThrowOnFailure => false;

    string? IPersistentStorageConfiguration.TryGetStorageLocation(SolutionKey solutionKey) => null;
}
