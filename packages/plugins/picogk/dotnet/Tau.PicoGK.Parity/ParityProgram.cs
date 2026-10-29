// SPDX-License-Identifier: Apache-2.0
// Test backend only. The product runs author code through Tau.PicoGK.Worker and its capture host;
// this entry point exists so the geometry parity fixture runs in a browser the same way it runs on
// the matched native comparator, hands the bytes it wrote back for comparison, and reports what each
// stage of that run cost, so one path's performance is measured rather than inferred from another's.
using System.Diagnostics;
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
    /// <summary>Hands the page one piece of one capture, which it puts where the gate reads it.</summary>
    /// <remarks>
    /// Through the page rather than <c>HttpClient</c>: the upload is the gate's own contract, and a
    /// test backend should not pull a trimmed HTTP stack into the measured app to satisfy it.
    /// <para>
    /// In pieces because a whole capture does not fit beside itself in a wasm heap: the long
    /// subject exports half a gigabyte, and reading it whole and then marshalling it to the page
    /// holds two copies at once, which crashed the renderer. <paramref name="offset"/> is the byte
    /// the piece starts at and <paramref name="more"/> says whether another piece follows.
    /// </para>
    /// </remarks>
    [JSImport("upload", "tau-picogk-parity")]
    private static partial Task Upload(string name, byte[] piece, double offset, bool more);

    /// <summary>Bytes per piece: large enough to keep the request count low, small beside the heap.</summary>
    private const int PieceBytes = 32 * 1024 * 1024;

    /// <summary>Reports one stage's cost, so the page records the whole run in one place.</summary>
    [JSImport("report", "tau-picogk-parity")]
    private static partial void Report(string stage, double milliseconds);

    private const string Captures = "/captures";
#if !PICOGK_PARITY_AOT
    /** The workspace the page stages the fixture, the author trees and the subject's entry into. */
    private const string Project = "/project";
#endif

    /*
     * `subject` names the pinned example. `options` is a comma-separated list the page passes
     * through: `tape=off` runs the compiled assembly without installing the lifted registry, so the
     * engine takes the per-voxel callback for the same source; `edit=on` compiles and runs a second
     * time after an edit, which is the cost an author pays for a change rather than for a cold page.
     * The default is every path on and one round, which is what a parity run needs.
     */
    private static async Task<int> Main(string[] args)
    {
        if (args.Length is < 1 or > 2) throw new ArgumentException("The subject to run is required.");
        var options = (args.Length == 2 ? args[1] : string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries);
        try
        {
            Directory.CreateDirectory(Captures);
            await RunAsync(args[0], !options.Contains("tape=off"));
            // Ordered, so a reader comparing two runs' logs compares the same sequence.
            foreach (var path in Directory.GetFiles(Captures).Order(StringComparer.Ordinal))
            {
                var name = Path.GetFileName(path);
                await using var capture = File.OpenRead(path);
                var piece = new byte[(int)Math.Clamp(capture.Length, 1, PieceBytes)];
                // At least one piece, so an empty capture still arrives as an empty file.
                for (long offset = 0; ; )
                {
                    var read = await capture.ReadAsync(piece);
                    await Upload(name, read == piece.Length ? piece : piece[..read], offset, offset + read < capture.Length);
                    offset += read;
                    if (offset >= capture.Length || read == 0) break;
                }
                Console.WriteLine($"PARITY_UPLOADED {name} {capture.Length}");
            }
            if (options.Contains("edit=on"))
            {
                // The captures of the second round are the first round's again, so they are not
                // uploaded: what the edit round measures is the cost of the edit.
                await EditAsync(args[0], !options.Contains("tape=off"));
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
    private static Task RunAsync(string subject, bool tape)
    {
        // There is no compile to time and no registry to withhold: the build already decided both.
        _ = tape;
        var run = Stopwatch.StartNew();
        GeometryParityFixture.Run([Captures, subject]);
        Report("run", run.Elapsed.TotalMilliseconds);
        return Task.CompletedTask;
    }

    /// <summary>An ahead-of-time app cannot be edited, so there is nothing here to measure.</summary>
    private static Task EditAsync(string subject, bool tape)
    {
        _ = (subject, tape);
        throw new ArgumentException("An ahead-of-time app has no edit round; measure it on a dynamic app.");
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
    private static async Task RunAsync(string subject, bool tape)
    {
        CompilationService.InitializeBrowser(
            JsonSerializer.Deserialize<string[]>(File.ReadAllText(CompilerReferences()))
                ?? throw new ArgumentException("The staged compiler reference list is empty."),
            Convert.FromHexString(BuildIdentity()));
        await CompileAndRunAsync(subject, tape, "compile", "run");
    }

    /// <summary>
    /// The cost of a change rather than of a cold page: one byte of the entry is different, so the
    /// compilation cache cannot serve it, and the same program compiles and runs again.
    /// </summary>
    private static async Task EditAsync(string subject, bool tape)
    {
        var entry = Path.Combine(Project, $"{subject}.cs");
        File.AppendAllText(entry, $"// edit {DateTime.UtcNow.Ticks}\n");
        await CompileAndRunAsync(subject, tape, "editCompile", "editRun");
    }

    /// <summary>
    /// Compile the staged project in the browser and run the subject's entry.
    /// </summary>
    /// <param name="subject">The pinned example to run.</param>
    /// <param name="tape">Install the lifted signed-distance registry, or leave the engine on the
    /// per-voxel callback for the same compiled assembly.</param>
    /// <param name="compileStage">The name to report the compile under.</param>
    /// <param name="runStage">The name to report the run under.</param>
    private static async Task CompileAndRunAsync(string subject, bool tape, string compileStage, string runStage)
    {
        var compiling = Stopwatch.StartNew();
        var compiled = CompilationService.Compile(Project, $"{subject}.cs");
        Report(compileStage, compiling.Elapsed.TotalMilliseconds);
        var author = Assembly.Load(compiled.Assembly, compiled.Pdb);
        /*
         * The lifted signed-distance methods are registered by name right after the assembly loads,
         * exactly as `ModelRunner` does it in the product: no author static constructor installs
         * anything, and a compilation the generator found nothing in still carries the entry point.
         * Withholding the registration leaves the identical assembly on the per-voxel callback,
         * which is how the tape's cost is measured against the path it replaces.
         */
        var registry = author.GetType(SdfTapeGenerator.RegistryTypeName, throwOnError: true)!;
        if (tape)
        {
            (registry.GetMethod(SdfTapeGenerator.RegistryMethodName, BindingFlags.Public | BindingFlags.Static)
                ?? throw new InvalidOperationException(
                    "The signed-distance registry carries no registration entry point."))
                .Invoke(null, null);
        }
        var entry = compiled.EntryPoint;
        var method = author.GetType(entry.TypeName, throwOnError: true)!.GetMethod(
            entry.MethodName,
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
            binder: null,
            types: entry.HasArguments ? [typeof(string[])] : Type.EmptyTypes,
            modifiers: null)
            ?? throw new InvalidOperationException("The compiled entry point could not be resolved.");
        var running = Stopwatch.StartNew();
        if (method.Invoke(null, entry.HasArguments ? [Array.Empty<string>()] : null) is Task invoked)
        {
            await invoked;
        }
        Report(runStage, running.Elapsed.TotalMilliseconds);
    }
#endif
}
