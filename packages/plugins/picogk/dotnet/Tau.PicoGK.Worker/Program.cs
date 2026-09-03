using System.Diagnostics;
using System.Text.Json;
using PicoGK;

namespace Tau.PicoGK.Worker;

internal static class Program
{
    private const int ProtocolVersion = 1;
    private const int MaximumRequestCharacters = 1_048_576;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static TextWriter protocol = Console.Out;

    private static int Main(string[] args) => Run(args, Console.In, Console.Out, Console.Error, watchParent: true);

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

            string? line;
            while ((line = input.ReadLine()) is not null)
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
                    var shouldStop = Dispatch(request, arguments);
                    if (shouldStop) return 0;
                }
                catch (WorkerException exception)
                {
                    Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, error = new { issues = exception.Issues } });
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

    private static bool Dispatch(Request request, Arguments arguments)
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
                var compiled = CompilationService.Compile(arguments.Workspace);
                var values = ModelRunner.BindParameters(compiled.Contract.Parameters, parameters);
                var voxel = Convert.ToSingle(values["VoxelSizeMm"], System.Globalization.CultureInfo.InvariantCulture);
                BuildResult result;
                var cleanupRequiresRecycle = false;
                Library? library = null;
                try
                {
                    var libraryInitialize = Stopwatch.StartNew();
                    library = new Library(voxel);
                    Library.RegisterGlobalLibrary(library);
                    Library.RegisterGlobalLog(new LogConsole());
                    libraryInitialize.Stop();
                    var execution = ModelRunner.Execute(compiled, values);
                    result = MeshArtifactWriter.Write(
                        arguments.Artifacts,
                        execution,
                        new WorkerDiagnostics(
                            new WorkerTimings(
                                compiled.Timings.CacheHit,
                                compiled.Timings.SourceRead,
                                compiled.Timings.Parse,
                                compiled.Timings.Analyze,
                                compiled.Timings.Emit,
                                libraryInitialize.Elapsed.TotalMilliseconds,
                                execution.Timings.ModelInvoke,
                                execution.Timings.MeshConstruction,
                                execution.Timings.MeshExtraction,
                                execution.Timings.NormalGeneration,
                                0,
                                execution.Timings.Unload),
                            new WorkerMetrics(
                                GC.GetTotalMemory(false),
                                library.nTotalMemUsage(),
                                Environment.WorkingSet)));
                }
                finally
                {
                    Library.UnregisterGlobalLog();
                    Library.UnregisterGlobalLibrary();
                    cleanupRequiresRecycle = DisposeLibrary(library, Console.Error);
                }
                result = result with { RecycleAfterResponse = result.RecycleAfterResponse || cleanupRequiresRecycle };
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
        protocol.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
        protocol.Flush();
    }

    internal sealed record Arguments(string Workspace, string Artifacts, int ParentPid);
}
