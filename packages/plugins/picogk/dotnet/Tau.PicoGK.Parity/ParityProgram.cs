// SPDX-License-Identifier: Apache-2.0
// Test backend only. The product runs author code through Tau.PicoGK.Worker and its capture host;
// this entry point exists so the geometry parity fixture runs in a browser the same way it runs on
// the matched native comparator, and hands the bytes it wrote back for comparison.
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
#if !PICOGK_PARITY_AOT
using System.Reflection;
using System.Text.Json;
using PicoVoxel.Sdf.Generator;
using Tau.PicoGK.Worker;
#endif

[assembly: SupportedOSPlatform("browser")]

namespace Tau.PicoGK.Parity;

internal static partial class ParityProgram
{
    /// <summary>Hands one capture file to the page, which puts it where the gate can read it.</summary>
    /// <remarks>
    /// Through the page rather than <c>HttpClient</c>: the upload is the gate's own contract, and a
    /// test backend should not pull a trimmed HTTP stack into the measured app to satisfy it.
    /// </remarks>
    [JSImport("upload", "tau-picogk-parity")]
    private static partial Task Upload(string name, byte[] bytes);

    private const string Captures = "/captures";
#if !PICOGK_PARITY_AOT
    /** The workspace the page stages the fixture, the author trees and the subject's entry into. */
    private const string Project = "/project";
#endif

    private static async Task<int> Main(string[] args)
    {
        if (args.Length != 1) throw new ArgumentException("The subject to run is required.");
        try
        {
            Directory.CreateDirectory(Captures);
            await RunAsync(args[0]);
            // Ordered, so a reader comparing two runs' logs compares the same sequence.
            foreach (var path in Directory.GetFiles(Captures).Order(StringComparer.Ordinal))
            {
                var bytes = File.ReadAllBytes(path);
                await Upload(Path.GetFileName(path), bytes);
                Console.WriteLine($"PARITY_UPLOADED {Path.GetFileName(path)} {bytes.Length}");
            }
            Console.WriteLine("PARITY_DONE");
            return 0;
        }
        catch (Exception error)
        {
            // The whole exception, because a parity failure is diagnosed from the log alone.
            Console.WriteLine($"PARITY_FAILED {error}");
            return 1;
        }
    }

#if PICOGK_PARITY_AOT
    /// <summary>
    /// The fixture and every author source below it are compiled into this app ahead of time, which
    /// is the mode a build-time consumer ships.
    /// </summary>
    private static Task RunAsync(string subject)
    {
        GeometryParityFixture.Run([Captures, subject]);
        return Task.CompletedTask;
    }
#else
    /// <summary>The verified reference list the page staged, as a file of paths in this runtime.</summary>
    [JSImport("compilerReferences", "tau-picogk-parity")]
    private static partial string CompilerReferences();

    /// <summary>The compiler's build identity, hex encoded, as the shipped host supplies it.</summary>
    [JSImport("buildIdentity", "tau-picogk-parity")]
    private static partial string BuildIdentity();

    /// <summary>
    /// The same sources, compiled in the browser at run time by the service the product uses, from
    /// the project the page staged. Nothing about the fixture or the author trees differs between
    /// the two modes, so a difference in the captures is a difference in the compile path alone.
    /// </summary>
    private static async Task RunAsync(string subject)
    {
        CompilationService.InitializeBrowser(
            JsonSerializer.Deserialize<string[]>(File.ReadAllText(CompilerReferences()))
                ?? throw new ArgumentException("The staged compiler reference list is empty."),
            Convert.FromHexString(BuildIdentity()));
        var compiled = CompilationService.Compile(Project, $"{subject}.cs");
        var author = Assembly.Load(compiled.Assembly, compiled.Pdb);
        /*
         * The lifted signed-distance methods are registered by name right after the assembly loads,
         * exactly as `ModelRunner` does it in the product: no author static constructor installs
         * anything, and a compilation the generator found nothing in still carries the entry point.
         */
        var registry = author.GetType(SdfTapeGenerator.RegistryTypeName, throwOnError: true)!;
        (registry.GetMethod(SdfTapeGenerator.RegistryMethodName, BindingFlags.Public | BindingFlags.Static)
            ?? throw new InvalidOperationException("The signed-distance registry carries no registration entry point."))
            .Invoke(null, null);
        var entry = compiled.EntryPoint;
        var method = author.GetType(entry.TypeName, throwOnError: true)!.GetMethod(
            entry.MethodName,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
            binder: null,
            types: entry.HasArguments ? [typeof(string[])] : Type.EmptyTypes,
            modifiers: null)
            ?? throw new InvalidOperationException("The compiled entry point could not be resolved.");
        if (method.Invoke(null, entry.HasArguments ? [Array.Empty<string>()] : null) is Task running)
        {
            await running;
        }
    }
#endif
}
