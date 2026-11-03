using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using PicoGK;

namespace Tau.PicoGK.Worker;

internal static partial class Program
{
#if PICOGK_BROWSER
    private const int ProtocolVersion = 9;
#else
    private const int ProtocolVersion = 8;
#endif
    private const int MaximumRequestCharacters = 1_048_576;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly object ProtocolGate = new();
    private static TextWriter protocol = Console.Out;

#if !PICOGK_BROWSER
    private static int Main(string[] args) => args switch
    {
        // Build-time only: emit the author-callable C# surface as JSON. Read-only,
        // and it never initializes the PicoGK native library.
        ["--emit-api", var outputPath, var sourceRoot] => ApiExtraction.Emit(outputPath, sourceRoot),
        _ => Run(args, Console.In, Console.Out, Console.Error, watchParent: true),
    };

#endif

    internal static long ManagedHeapBytesAfterCollection()
    {
        // One completed-GC snapshot excludes fragmentation and later temporary
        // allocations without forcing another collection for telemetry.
        var collection = GC.GetGCMemoryInfo();
        return collection.HeapSizeBytes - collection.FragmentedBytes;
    }

#if !PICOGK_BROWSER
    internal static int Run(string[] args, TextReader input, TextWriter output, TextWriter error, bool watchParent = false)
    {
        var arguments = ParseArguments(args);
        protocol = output;
        var originalOutput = Console.Out;
        Console.SetOut(error);
        try
        {
            if (watchParent) StartParentWatch(arguments.ParentPid);
            Write(new
            {
                protocolVersion = ProtocolVersion,
                type = "ready",
                dotnetVersion = Environment.Version.ToString(),
                picogkVersion = typeof(Library).Assembly.GetName().Version!.ToString(),
            });

            /* W17: frames are read on their own thread so a cancel arriving while a build runs is seen
             * while it can still stop it. The reader pairs each request with the token it can be
             * cancelled through; the lane is serialized, so a cancel can only mean the request whose
             * frame was read last. */
            var frames = new BlockingCollection<(Frame Frame, CancellationTokenSource Cancellation)>();
            var reader = new Thread(() => ReadFrames(input, frames))
            {
                IsBackground = true,
                Name = "Tau protocol reader",
            };
            reader.Start();
            foreach (var (frame, cancellation) in frames.GetConsumingEnumerable())
            {
                if (frame.Oversized) return 2;
                if (frame.Request is not { } request)
                {
                    error.WriteLine(frame.Error);
                    return 2;
                }
                if (request.ProtocolVersion != ProtocolVersion) return 2;
                try
                {
                    var shouldStop = Dispatch(request, arguments, cancellation.Token);
                    if (shouldStop) return 0;
                }
                catch (WorkerException exception)
                {
                    Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, error = new { issues = exception.Issues } });
                }
                catch (OperationCanceledException)
                {
                    Write(new
                    {
                        protocolVersion = ProtocolVersion,
                        requestId = request.RequestId,
                        error = new { issues = new[] { new Issue("The PicoGK build was cancelled.", "CS_TAU_CANCELLED", "runtime", "error") } },
                    });
                }
                catch (Exception exception)
                {
                    Write(new
                    {
                        protocolVersion = ProtocolVersion,
                        requestId = request.RequestId,
                        error = new { issues = new[] { new Issue(exception.Message, "CS_TAU_RUNTIME", "runtime", "error") } },
                    });
                }
            }
            return 0;
        }
        finally
        {
            Console.SetOut(originalOutput);
        }
    }

#endif

    /// <summary>One protocol line, parsed once by the reader (CH16): a request, or why it is not one.</summary>
    internal sealed record Frame(Request? Request, string? Error, bool Oversized);

#if !PICOGK_BROWSER
    private static void ReadFrames(TextReader input, BlockingCollection<(Frame, CancellationTokenSource)> frames)
    {
        CancellationTokenSource? active = null;
        string? line;
        while ((line = input.ReadLine()) is not null)
        {
            var frame = ParseFrame(line);
            if (frame.Request?.Method == "cancel")
            {
                active?.Cancel();
                continue;
            }
            active = new CancellationTokenSource();
            frames.Add((frame, active));
        }
        frames.CompleteAdding();
    }

#endif

    // An oversized or malformed frame is not a cancel; the request loop owns its rejection.
    internal static Frame ParseFrame(string line)
    {
        if (line.Length > MaximumRequestCharacters) return new Frame(null, null, true);
        try
        {
            return JsonSerializer.Deserialize<Request>(line, JsonOptions) is { } request
                ? new Frame(request, null, false)
                : new Frame(null, "Request was null.", false);
        }
        catch (JsonException exception)
        {
            return new Frame(null, exception.Message, false);
        }
    }

#if PICOGK_BROWSER
    private static async Task<bool> Dispatch(Request request, Arguments arguments, CancellationToken cancellation)
#else
    private static bool Dispatch(Request request, Arguments arguments, CancellationToken cancellation)
#endif
    {
        switch (request.Method)
        {
            case "resolve":
            {
                // The C# files this entry compiles with, which the host watches and hashes as its sources.
                var entryPath = ValidateEntryPath(request.Params, arguments.Workspace);
                Write(new
                {
                    protocolVersion = ProtocolVersion,
                    requestId = request.RequestId,
                    result = new { sources = CompilationService.SelectSources(arguments.Workspace, entryPath) },
                });
                return false;
            }
            case "analyze":
            {
                var entryPath = ValidateEntryPath(request.Params, arguments.Workspace);
                var model = CompilationService.Compile(arguments.Workspace, entryPath);
                Write(new
                {
                    protocolVersion = ProtocolVersion,
                    requestId = request.RequestId,
                    result = new
                    {
                        defaultParameters = model.Defaults,
                        jsonSchema = model.JsonSchema,
                        timings = model.Timings,
                    },
                });
                return false;
            }
            case "build":
            {
                var entryPath = ValidateEntryPath(request.Params, arguments.Workspace);
                var parameters = request.Params.GetProperty("parameters");
                // A build superseded before it started pays nothing beyond its own frame.
                cancellation.ThrowIfCancellationRequested();
                var compiled = CompilationService.Compile(arguments.Workspace, entryPath);
                ComputeWorkerSession? compute = null;
                if(request.Params.TryGetProperty("computeReuse",out var computeRequest)) {
                    // Disposable cache metadata cannot make an otherwise valid model fail.
                    try{compute=new ComputeWorkerSession(computeRequest,arguments.Artifacts,cancellation);}
                    catch(Exception error) when(ComputeWorkerSession.IsDisposableFailure(error)){ComputeWorkerSession.ReportBypass("preload",error);}
                }
                var meshing = ParseMeshing(request.Params);
                // Both runtimes collect the author's own geometry files, so a desktop build offers the
                // same STL and VDB exports a browser build does. It also gives the model its own output
                // directory on both, rather than the directory holding this build's private artifacts.
                using var authored = new AuthoredFileCapture(arguments.Workspace, arguments.Artifacts);
#if PICOGK_BROWSER
#if PICOGK_BROWSER_THREADS
                // Native geometry can synchronously wait for TBB helpers. Keep Mono's runtime
                // owner free to start those workers and service their proxy requests.
                var execution = await Task.Run(
                    () => ModelRunner.ExecuteAsync(compiled, authored.OutputRoot, parameters, cancellation, compute, meshing),
                    cancellation);
#else
                var execution = await ModelRunner.ExecuteAsync(compiled, authored.OutputRoot, parameters, cancellation, compute, meshing);
#endif
#else
                var execution = ModelRunner.Execute(compiled, authored.OutputRoot, parameters, cancellation, compute, meshing);
#endif
                var result = MeshArtifactWriter.Write(
                    arguments.Artifacts,
                    execution,
                    new WorkerDiagnostics(
                        new WorkerTimings(
                            compiled.Timings.CacheHit,
                            compiled.Timings.SourceRead,
                            compiled.Timings.Parse,
                            compiled.Timings.Analyze,
                            compiled.Timings.Emit,
                            execution.Timings.LibraryInitialize,
                            execution.Timings.EntryPointInvoke,
                            execution.Timings.MeshConstruction,
                            execution.Timings.MeshExtraction,
                            execution.Timings.NormalGeneration,
                            0,
                            execution.Timings.Unload),
                        new WorkerMetrics(
                            ManagedHeapBytesAfterCollection(),
                            execution.PicoGkNativeBytes,
#if PICOGK_BROWSER
                            null)));
#else
                            Environment.WorkingSet)));
#endif
#if PICOGK_BROWSER
                try
                {
                    await ValidateImages(result.ArtifactPath, JsonSerializer.Serialize(result.Images, JsonOptions));
                    result = result with { AuthoredOutputs = authored.Complete() };
                }
                catch (System.Runtime.InteropServices.JavaScript.JSException error)
                {
                    File.Delete(result.ArtifactPath);
                    throw MaterialCapture.Invalid("Image.Data", error.Message);
                }
                catch
                {
                    File.Delete(result.ArtifactPath);
                    throw;
                }
#else
                try
                {
                    result = result with { AuthoredOutputs = authored.Complete() };
                }
                catch
                {
                    // A build whose authored files cannot be received publishes nothing, as the
                    // browser path does, rather than a result that names a receipt it never wrote.
                    File.Delete(result.ArtifactPath);
                    throw;
                }
#endif
                if(compute is not null&&execution.ComputeRecords is {} computeRecords) {
                    try{result=result with{ComputeReuseManifest=compute.WriteSuccessful(computeRecords)};}
                    catch(Exception error) when(ComputeWorkerSession.IsDisposableFailure(error)){ComputeWorkerSession.ReportBypass("publication",error);}
                }
                cancellation.ThrowIfCancellationRequested();
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result });
#if !PICOGK_BROWSER
                ModelRunner.CollectReleased();
#endif
                return false;
            }
            case "shutdown":
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result = new { shutdown = true } });
                return true;
            default:
                throw new WorkerException(new Issue($"Unknown PicoGK worker method '{request.Method}'.", "CS_TAU_PROTOCOL", "validation", "error"));
        }
    }

    /// <summary>
    /// Reads the optional <c>meshing</c> build parameter: <c>{ adaptivity, relax }</c> with adaptivity in [0, 1).
    /// The host sends it only for an adaptive mesh; adaptivity 0 is the uniform mesh, as if it were absent.
    /// </summary>
    internal static MeshingOptions? ParseMeshing(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("meshing", out var meshing)) return null;
        if (meshing.ValueKind != JsonValueKind.Object ||
            !meshing.TryGetProperty("adaptivity", out var adaptivity) || adaptivity.ValueKind != JsonValueKind.Number ||
            !adaptivity.TryGetSingle(out var value) || !float.IsFinite(value) || value < 0 || value >= 1 ||
            !meshing.TryGetProperty("relax", out var relax) || relax.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            meshing.EnumerateObject().Count() != 2)
        {
            throw new WorkerException(new Issue(
                "PicoGK meshing must be { adaptivity: number in [0, 1), relax: boolean }.",
                "CS_TAU_PROTOCOL", "validation", "error"));
        }
        return value > 0 ? new MeshingOptions(value, relax.GetBoolean()) : null;
    }

    /// <returns>The entry as the workspace-relative, forward-slash path its source is compiled under.</returns>
    internal static string ValidateEntryPath(JsonElement parameters, string workspace)
    {
        var entryPath = parameters.GetProperty("entryPath").GetString();
        if (string.IsNullOrWhiteSpace(entryPath)) throw new WorkerException(new Issue("PicoGK entryPath is required.", "CS_TAU_PATH", "validation", "error"));
        var root = Path.GetFullPath(workspace) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, entryPath));
        if (!path.StartsWith(root, StringComparison.Ordinal) || !File.Exists(path) || !path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            throw new WorkerException(new Issue("PicoGK entryPath must name a C# file inside the workspace.", "CS_TAU_PATH", "validation", "error"));
        }
        return Path.GetRelativePath(root, path).Replace('\\', '/');
    }

#if !PICOGK_BROWSER
    internal static Arguments ParseArguments(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < args.Length; index += 2)
        {
            if (index + 1 >= args.Length || !args[index].StartsWith("--", StringComparison.Ordinal)) throw new ArgumentException("Invalid PicoGK worker arguments.");
            values.Add(args[index][2..], args[index + 1]);
        }
        return new Arguments(
            Path.GetFullPath(values["workspace"]),
            Path.GetFullPath(values["artifacts"]),
            int.Parse(values["parent-pid"], System.Globalization.CultureInfo.InvariantCulture));
    }

    [ExcludeFromCodeCoverage]
    internal static Thread? StartParentWatch(
        int parentPid,
        Action? terminate = null,
        Func<int, bool>? parentIsAlive = null,
        int pollMilliseconds = 1000)
    {
        terminate ??= () => Environment.Exit(0);
        parentIsAlive ??= ParentIsAlive;
        // A PID namespace (Linux Bubblewrap) hides the supervisor from the start. Watching it there
        // would exit the worker right after its handshake; the sandbox itself dies with its parent,
        // and a supervisor that is already gone closes stdin instead.
        if (!parentIsAlive(parentPid)) return null;
        var thread = new Thread(() =>
        {
            while (parentIsAlive(parentPid))
            {
                Thread.Sleep(pollMilliseconds);
            }
            terminate();
        }) { IsBackground = true, Name = "Tau parent watchdog" };
        thread.Start();
        return thread;
    }

    internal static bool ParentIsAlive(int parentPid)
    {
        try
        {
            using var parent = Process.GetProcessById(parentPid);
            return !parent.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    internal static bool DisposeLibrary(IDisposable? library, TextWriter error)
    {
        if (library is null) return false;
        try
        {
            library.Dispose();
            return false;
        }
        catch (Exception exception)
        {
            error.WriteLine($"PicoGK cleanup requires worker recycling: {exception.Message}");
            return true;
        }
    }

#endif

    private static void Write(object value)
    {
        lock (ProtocolGate)
        {
#if PICOGK_BROWSER
            Respond(JsonSerializer.Serialize(value, JsonOptions));
#else
            protocol.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
            protocol.Flush();
#endif
        }
    }

    internal sealed record Arguments(string Workspace, string Artifacts, int ParentPid);
}
