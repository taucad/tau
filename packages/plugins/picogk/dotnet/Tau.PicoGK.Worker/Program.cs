using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using PicoGK;

namespace Tau.PicoGK.Worker;

internal static class Program
{
    private const int ProtocolVersion = 4;
    private const int MaximumRequestCharacters = 1_048_576;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly object ProtocolGate = new();
    private static TextWriter protocol = Console.Out;

    private static int Main(string[] args) => args switch
    {
        // Build-time only: emit the author-callable C# surface as JSON. Read-only,
        // and it never initializes the PicoGK native library.
        ["--emit-api", var outputPath, var sourceRoot] => ApiExtraction.Emit(outputPath, sourceRoot),
        _ => Run(args, Console.In, Console.Out, Console.Error, watchParent: true),
    };

    internal static long ManagedHeapBytesAfterCollection()
    {
        // One completed-GC snapshot excludes fragmentation and later temporary
        // allocations without forcing another collection for telemetry.
        var collection = GC.GetGCMemoryInfo();
        return collection.HeapSizeBytes - collection.FragmentedBytes;
    }

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
            var frames = new BlockingCollection<(string Line, CancellationTokenSource Cancellation)>();
            var reader = new Thread(() => ReadFrames(input, frames))
            {
                IsBackground = true,
                Name = "Tau protocol reader",
            };
            reader.Start();
            foreach (var (line, cancellation) in frames.GetConsumingEnumerable())
            {
                if (line.Length > MaximumRequestCharacters) return 2;
                Request request;
                try
                {
                    request = JsonSerializer.Deserialize<Request>(line, JsonOptions)
                        ?? throw new JsonException("Request was null.");
                }
                catch (JsonException exception)
                {
                    error.WriteLine(exception.Message);
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

    private static void ReadFrames(TextReader input, BlockingCollection<(string, CancellationTokenSource)> frames)
    {
        CancellationTokenSource? active = null;
        string? line;
        while ((line = input.ReadLine()) is not null)
        {
            if (IsCancelFrame(line))
            {
                active?.Cancel();
                continue;
            }
            active = new CancellationTokenSource();
            frames.Add((line, active));
        }
        frames.CompleteAdding();
    }

    private static bool IsCancelFrame(string line)
    {
        // An oversized or malformed frame is not a cancel; the request loop owns its rejection.
        if (line.Length > MaximumRequestCharacters) return false;
        try
        {
            return JsonSerializer.Deserialize<Request>(line, JsonOptions)?.Method == "cancel";
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool Dispatch(Request request, Arguments arguments, CancellationToken cancellation)
    {
        switch (request.Method)
        {
            case "analyze":
            {
                ValidateEntryPath(request.Params, arguments.Workspace);
                var model = CompilationService.Compile(arguments.Workspace);
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
                ValidateEntryPath(request.Params, arguments.Workspace);
                var parameters = request.Params.GetProperty("parameters");
                // A build superseded before it started pays nothing beyond its own frame.
                cancellation.ThrowIfCancellationRequested();
                var compiled = CompilationService.Compile(arguments.Workspace);
                var execution = ModelRunner.Execute(compiled, arguments.Artifacts, parameters, cancellation);
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
                            Environment.WorkingSet)));
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result });
                return false;
            }
            case "shutdown":
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result = new { shutdown = true } });
                return true;
            default:
                throw new WorkerException(new Issue($"Unknown PicoGK worker method '{request.Method}'.", "CS_TAU_PROTOCOL", "validation", "error"));
        }
    }

    internal static void ValidateEntryPath(JsonElement parameters, string workspace)
    {
        var entryPath = parameters.GetProperty("entryPath").GetString();
        if (string.IsNullOrWhiteSpace(entryPath)) throw new WorkerException(new Issue("PicoGK entryPath is required.", "CS_TAU_PATH", "validation", "error"));
        var root = Path.GetFullPath(workspace) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, entryPath));
        if (!path.StartsWith(root, StringComparison.Ordinal) || !File.Exists(path) || !path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            throw new WorkerException(new Issue("PicoGK entryPath must name a C# file inside the workspace.", "CS_TAU_PATH", "validation", "error"));
        }
    }

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
    internal static Thread StartParentWatch(
        int parentPid,
        Action? terminate = null,
        Func<int, bool>? parentIsAlive = null,
        int pollMilliseconds = 1000)
    {
        terminate ??= () => Environment.Exit(0);
        parentIsAlive ??= ParentIsAlive;
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

    private static void Write(object value)
    {
        lock (ProtocolGate)
        {
            protocol.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
            protocol.Flush();
        }
    }

    internal sealed record Arguments(string Workspace, string Artifacts, int ParentPid);
}
